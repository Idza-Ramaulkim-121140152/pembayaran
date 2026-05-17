<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerPackageHistory;
use App\Models\CustomerPackageManagementIgnore;
use App\Models\CustomerPackageMappingUnresolved;
use App\Models\Package;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class CustomerPackageAuditService
{
    public const STATUS_VALID = 'VALID';
    public const STATUS_MISMATCH = 'TIDAK_SESUAI';
    public const STATUS_PPPOE_NOT_FOUND = 'PPPOE_TIDAK_DITEMUKAN';
    public const STATUS_NO_PACKAGE = 'BELUM_ADA_PAKET';
    public const STATUS_NO_USERNAME = 'BELUM_ADA_USERNAME';

    public const SUPPORTED_STATUSES = [
        self::STATUS_VALID,
        self::STATUS_MISMATCH,
        self::STATUS_PPPOE_NOT_FOUND,
        self::STATUS_NO_PACKAGE,
        self::STATUS_NO_USERNAME,
    ];

    public function buildRows(array $filters = []): Collection
    {
        $activeOnly = (bool) ($filters['active_only'] ?? true);
        $includeIgnored = (bool) ($filters['include_ignored'] ?? false);
        $statusFilter = strtoupper(trim((string) ($filters['status'] ?? '')));
        $search = strtolower(trim((string) ($filters['search'] ?? '')));

        $customersQuery = Customer::query()
            ->with(['package:id,name,mikrotik_profile,is_active'])
            ->select([
                'id',
                'name',
                'phone',
                'pppoe_username',
                'package_id',
                'package_type',
                'custom_package',
                'mikrotik_profile',
                'area_code',
                'is_active',
                'updated_at',
            ])
            ->orderBy('name');

        if ($activeOnly) {
            $customersQuery->where('is_active', true);
        }

        $customers = $customersQuery->get();
        $mikrotikSecrets = $this->getNormalizedMikrotikSecrets();

        $packageByNameMap = Package::query()
            ->select(['id', 'name', 'mikrotik_profile'])
            ->get()
            ->mapWithKeys(function (Package $package) {
                return [strtolower(trim((string) $package->name)) => $package];
            });

        $ignores = CustomerPackageManagementIgnore::query()
            ->whereIn('customer_id', $customers->pluck('id'))
            ->where(function ($query) {
                $query->whereNull('expires_at')
                    ->orWhere('expires_at', '>', now());
            })
            ->get();

        $ignoreMap = [];
        foreach ($ignores as $ignore) {
            $key = $ignore->customer_id . '|' . strtoupper((string) $ignore->status_code);
            $ignoreMap[$key] = [
                'id' => $ignore->id,
                'reason' => $ignore->reason,
                'expires_at' => $ignore->expires_at?->toIso8601String(),
            ];
        }

        $rows = collect();

        foreach ($customers as $customer) {
            $systemPackageLabel = $this->resolveSystemPackageLabel($customer);
            $expectedProfile = $this->resolveExpectedProfile($customer, $packageByNameMap);
            $usernameRaw = trim((string) ($customer->pppoe_username ?? ''));
            $normalizedUsername = $this->normalize($usernameRaw);
            $secret = $normalizedUsername !== '' ? ($mikrotikSecrets[$normalizedUsername] ?? null) : null;

            $status = $this->resolveStatus($systemPackageLabel, $usernameRaw, $expectedProfile, $secret['profile'] ?? null);
            if ($statusFilter !== '' && $statusFilter !== strtoupper($status)) {
                continue;
            }

            $ignoreKey = $customer->id . '|' . strtoupper($status);
            $ignoredMeta = $ignoreMap[$ignoreKey] ?? null;
            if (!$includeIgnored && $ignoredMeta) {
                continue;
            }

            $row = [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'phone' => $customer->phone,
                'is_active' => (bool) $customer->is_active,
                'pppoe_username' => $usernameRaw,
                'system_package' => $systemPackageLabel,
                'system_package_id' => $customer->package?->id ?? $customer->package_id,
                'expected_profile' => $expectedProfile,
                'mikrotik_profile' => $secret['profile'] ?? null,
                'mikrotik_secret_name' => $secret['name'] ?? null,
                'mikrotik_disabled' => isset($secret['disabled']) ? ((string) $secret['disabled'] === 'true') : null,
                'status' => $status,
                'status_label' => $status,
                'ignored' => $ignoredMeta !== null,
                'ignore' => $ignoredMeta,
                'last_update_at' => optional($customer->updated_at)->toIso8601String(),
            ];

            if ($search !== '' && !$this->rowMatchesSearch($row, $search)) {
                continue;
            }

            $rows->push($row);
        }

        return $rows->values();
    }

    public function buildSummary(Collection $rows): array
    {
        $statusCounts = [];
        foreach (self::SUPPORTED_STATUSES as $status) {
            $statusCounts[$status] = 0;
        }

        foreach ($rows as $row) {
            $status = strtoupper((string) ($row['status'] ?? ''));
            if (!isset($statusCounts[$status])) {
                $statusCounts[$status] = 0;
            }
            $statusCounts[$status]++;
        }

        return [
            'total_pelanggan' => $rows->count(),
            'paket_valid' => (int) ($statusCounts[self::STATUS_VALID] ?? 0),
            'paket_tidak_sesuai' => (int) ($statusCounts[self::STATUS_MISMATCH] ?? 0),
            'pppoe_tidak_ditemukan' => (int) ($statusCounts[self::STATUS_PPPOE_NOT_FOUND] ?? 0),
            'belum_ada_paket' => (int) ($statusCounts[self::STATUS_NO_PACKAGE] ?? 0),
            'belum_ada_username' => (int) ($statusCounts[self::STATUS_NO_USERNAME] ?? 0),
            'status_counts' => $statusCounts,
        ];
    }

    public function resolveSystemToMikrotik(Customer $customer, int $actorId): array
    {
        $username = trim((string) ($customer->pppoe_username ?? ''));
        if ($username === '') {
            throw ValidationException::withMessages([
                'pppoe_username' => 'Pelanggan belum memiliki username PPPoE.',
            ]);
        }

        $expectedProfile = $this->resolveExpectedProfile($customer);
        if ($expectedProfile === '') {
            throw ValidationException::withMessages([
                'package' => 'Paket sistem belum valid untuk sinkronisasi.',
            ]);
        }

        $mikrotik = new MikroTikService();
        $mikrotik->connect();

        try {
            $secret = $mikrotik->getPPPoESecret($username);
            if (!$secret || empty($secret['id'])) {
                throw ValidationException::withMessages([
                    'pppoe_username' => 'Secret PPPoE tidak ditemukan di MikroTik.',
                ]);
            }

            $availableProfiles = $this->fetchAvailableProfiles($mikrotik);
            $resolvedProfile = $this->resolveProfileFromAvailable($expectedProfile, $availableProfiles);
            if ($resolvedProfile === null) {
                throw ValidationException::withMessages([
                    'expected_profile' => 'Profile target tidak ditemukan di MikroTik aktif.',
                ]);
            }

            $mikrotik->command('/ppp/secret/set', [
                '.id' => $secret['id'],
                'profile' => $resolvedProfile,
            ]);
        } finally {
            $mikrotik->disconnect();
        }

        $customer->mikrotik_profile = $expectedProfile;
        $customer->save();

        return [
            'customer_id' => $customer->id,
            'pppoe_username' => $username,
            'profile' => $expectedProfile,
            'updated_by' => $actorId,
        ];
    }

    public function resolveMikrotikToSystem(Customer $customer, int $actorId): array
    {
        $username = trim((string) ($customer->pppoe_username ?? ''));
        if ($username === '') {
            throw ValidationException::withMessages([
                'pppoe_username' => 'Pelanggan belum memiliki username PPPoE.',
            ]);
        }

        $mikrotik = new MikroTikService();
        $mikrotik->connect();

        try {
            $secret = $mikrotik->getPPPoESecret($username);
        } finally {
            $mikrotik->disconnect();
        }

        if (!$secret || empty($secret['name'])) {
            throw ValidationException::withMessages([
                'pppoe_username' => 'Secret PPPoE tidak ditemukan di MikroTik.',
            ]);
        }

        $profile = trim((string) ($secret['profile'] ?? ''));
        if ($profile === '') {
            throw ValidationException::withMessages([
                'mikrotik_profile' => 'Profile PPPoE di MikroTik kosong.',
            ]);
        }

        $package = $this->findPackageByProfile($profile);
        if (!$package) {
            CustomerPackageMappingUnresolved::create([
                'customer_id' => $customer->id,
                'pppoe_username' => $username,
                'mikrotik_profile' => $profile,
                'status' => 'open',
                'reason' => 'Profile MikroTik belum memiliki mapping package internal.',
                'meta' => [
                    'source' => 'resolve_mikrotik_to_system',
                ],
                'created_by' => $actorId,
            ]);

            throw ValidationException::withMessages([
                'package_mapping' => 'Profile MikroTik belum memiliki mapping package internal. Masuk antrian unresolved manual.',
            ]);
        }

        $oldPackageId = $customer->package_id ? (int) $customer->package_id : null;
        $oldPackageLabel = (string) ($customer->package_type ?? '');

        $customer->package_id = $package->id;
        $customer->package_type = $package->name;
        $customer->custom_package = null;
        $customer->mikrotik_profile = $profile;
        $customer->save();

        CustomerPackageHistory::create([
            'customer_id' => $customer->id,
            'old_package_id' => $oldPackageId,
            'new_package_id' => $package->id,
            'old_package_label' => $oldPackageLabel,
            'new_package_label' => $package->name,
            'effective_from' => now()->toDateString(),
            'reason' => 'Sinkronisasi paket mengikuti profile PPPoE',
            'changed_by' => $actorId,
        ]);

        CustomerPackageMappingUnresolved::query()
            ->where('customer_id', $customer->id)
            ->where('mikrotik_profile', $profile)
            ->where('status', 'open')
            ->update([
                'status' => 'resolved',
                'resolved_by' => $actorId,
                'resolved_at' => now(),
                'updated_at' => now(),
            ]);

        return [
            'customer_id' => $customer->id,
            'package_id' => $package->id,
            'package_name' => $package->name,
            'pppoe_profile' => $profile,
        ];
    }

    public function createPppoe(Customer $customer, int $actorId): array
    {
        $expectedProfile = $this->resolveExpectedProfile($customer);
        if ($expectedProfile === '') {
            throw ValidationException::withMessages([
                'package' => 'Pelanggan belum memiliki paket valid untuk membuat PPPoE.',
            ]);
        }

        $mikrotik = new MikroTikService();
        $mikrotik->connect();

        try {
            $allSecrets = $mikrotik->getAllPPPoESecrets() ?? [];
            $username = $this->generateUniqueUsername($customer, $allSecrets);
            $remoteAddress = $mikrotik->getNextIpAddress();
            $availableProfiles = $this->fetchAvailableProfiles($mikrotik);
            $resolvedProfile = $this->resolveProfileFromAvailable($expectedProfile, $availableProfiles);
            if ($resolvedProfile === null) {
                throw ValidationException::withMessages([
                    'expected_profile' => 'Profile target paket tidak tersedia di MikroTik.',
                ]);
            }

            $secret = $mikrotik->createPPPoESecret(
                $username,
                'admin',
                'pppoe',
                $resolvedProfile,
                $remoteAddress
            );
        } finally {
            $mikrotik->disconnect();
        }

        $customer->pppoe_username = $username;
        $customer->mikrotik_profile = $expectedProfile;
        $customer->save();

        return [
            'customer_id' => $customer->id,
            'pppoe_username' => $username,
            'mikrotik_profile' => $expectedProfile,
            'secret' => $secret ?? null,
            'created_by' => $actorId,
        ];
    }

    public function linkPppoe(Customer $customer, string $username, int $actorId): array
    {
        $normalizedTarget = $this->normalize($username);
        if ($normalizedTarget === '') {
            throw ValidationException::withMessages([
                'pppoe_username' => 'Username PPPoE wajib diisi.',
            ]);
        }

        $secrets = $this->getNormalizedMikrotikSecrets();
        $secret = $secrets[$normalizedTarget] ?? null;

        if (!$secret) {
            throw ValidationException::withMessages([
                'pppoe_username' => 'Secret PPPoE tidak ditemukan di MikroTik.',
            ]);
        }

        $oldPackageId = $customer->package_id ? (int) $customer->package_id : null;
        $oldPackageLabel = (string) ($customer->package_type ?? '');

        $customer->pppoe_username = (string) ($secret['name'] ?? $username);
        $customer->mikrotik_profile = (string) ($secret['profile'] ?? $customer->mikrotik_profile);

        $mappedPackage = $this->findPackageByProfile((string) ($secret['profile'] ?? ''));
        if ($mappedPackage && !$customer->package_id) {
            $customer->package_id = $mappedPackage->id;
            $customer->package_type = $mappedPackage->name;
            $customer->custom_package = null;
        }

        $customer->save();

        if ($mappedPackage && (int) ($oldPackageId ?? 0) !== (int) $mappedPackage->id) {
            CustomerPackageHistory::create([
                'customer_id' => $customer->id,
                'old_package_id' => $oldPackageId,
                'new_package_id' => $mappedPackage->id,
                'old_package_label' => $oldPackageLabel,
                'new_package_label' => $mappedPackage->name,
                'effective_from' => now()->toDateString(),
                'reason' => 'Hubungkan PPPoE dari audit manajemen paket',
                'changed_by' => $actorId,
            ]);
        }

        return [
            'customer_id' => $customer->id,
            'pppoe_username' => $customer->pppoe_username,
            'mikrotik_profile' => $customer->mikrotik_profile,
            'mapped_package' => $mappedPackage ? [
                'id' => $mappedPackage->id,
                'name' => $mappedPackage->name,
            ] : null,
        ];
    }

    public function assignPackage(Customer $customer, Package $package, int $actorId): array
    {
        $oldPackageId = $customer->package_id ? (int) $customer->package_id : null;
        $oldPackageLabel = (string) ($customer->package_type ?? '');

        $customer->package_id = $package->id;
        $customer->package_type = $package->name;
        $customer->custom_package = null;
        $customer->save();

        CustomerPackageHistory::create([
            'customer_id' => $customer->id,
            'old_package_id' => $oldPackageId,
            'new_package_id' => $package->id,
            'old_package_label' => $oldPackageLabel,
            'new_package_label' => $package->name,
            'effective_from' => now()->toDateString(),
            'reason' => 'Assign paket dari audit manajemen paket',
            'changed_by' => $actorId,
        ]);

        return [
            'customer_id' => $customer->id,
            'package_id' => $package->id,
            'package_name' => $package->name,
        ];
    }

    public function ignore(Customer $customer, string $statusCode, ?string $reason, int $actorId): CustomerPackageManagementIgnore
    {
        $normalizedStatus = strtoupper(trim($statusCode));
        if (!in_array($normalizedStatus, self::SUPPORTED_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status_code' => 'Status tidak didukung untuk aksi abaikan.',
            ]);
        }

        return CustomerPackageManagementIgnore::query()->updateOrCreate(
            [
                'customer_id' => $customer->id,
                'status_code' => $normalizedStatus,
            ],
            [
                'reason' => $reason,
                'created_by' => $actorId,
                'expires_at' => null,
            ]
        );
    }

    public function unignore(Customer $customer, string $statusCode): void
    {
        CustomerPackageManagementIgnore::query()
            ->where('customer_id', $customer->id)
            ->where('status_code', strtoupper(trim($statusCode)))
            ->delete();
    }

    public function pppoeSecretOptions(string $search = ''): array
    {
        $secrets = $this->getNormalizedMikrotikSecrets();
        $rows = [];

        foreach ($secrets as $secret) {
            $row = [
                'name' => $secret['name'] ?? null,
                'profile' => $secret['profile'] ?? null,
                'disabled' => isset($secret['disabled']) ? ((string) $secret['disabled'] === 'true') : false,
            ];

            if ($search !== '') {
                $haystack = strtolower(implode(' ', [
                    (string) ($row['name'] ?? ''),
                    (string) ($row['profile'] ?? ''),
                ]));

                if (!str_contains($haystack, strtolower($search))) {
                    continue;
                }
            }

            $rows[] = $row;
        }

        usort($rows, function (array $left, array $right) {
            return strcmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
        });

        return $rows;
    }

    private function resolveStatus(string $systemPackageLabel, string $username, ?string $expectedProfile, ?string $pppoeProfile): string
    {
        if ($systemPackageLabel === '') {
            return self::STATUS_NO_PACKAGE;
        }

        if (trim($username) === '') {
            return self::STATUS_NO_USERNAME;
        }

        if ($pppoeProfile === null) {
            return self::STATUS_PPPOE_NOT_FOUND;
        }

        $normalizedExpected = $this->normalize((string) $expectedProfile);
        $normalizedActual = $this->normalize((string) $pppoeProfile);
        if ($normalizedExpected !== '' && $normalizedExpected === $normalizedActual) {
            return self::STATUS_VALID;
        }

        return self::STATUS_MISMATCH;
    }

    private function resolveSystemPackageLabel(Customer $customer): string
    {
        if ($customer->package) {
            return trim((string) ($customer->package->name ?? ''));
        }

        $packageType = trim((string) ($customer->package_type ?? ''));
        $customPackage = trim((string) ($customer->custom_package ?? ''));

        return $packageType !== '' ? $packageType : $customPackage;
    }

    private function resolveExpectedProfile(Customer $customer, ?Collection $packageByNameMap = null): string
    {
        if ($customer->package) {
            $profile = trim((string) ($customer->package->mikrotik_profile ?? ''));
            if ($profile !== '') {
                return $profile;
            }

            return trim((string) ($customer->package->name ?? ''));
        }

        $packageType = trim((string) ($customer->package_type ?? ''));
        if ($packageType !== '') {
            $package = $packageByNameMap?->get(strtolower($packageType));
            if (!$package && $packageByNameMap === null) {
                $package = Package::query()
                    ->whereRaw('LOWER(name) = ?', [strtolower($packageType)])
                    ->first();
            }
            if ($package) {
                return trim((string) ($package->mikrotik_profile ?: $package->name));
            }
        }

        return '';
    }

    private function findPackageByProfile(string $profile): ?Package
    {
        $profileNorm = strtolower(trim($profile));
        if ($profileNorm === '') {
            return null;
        }

        return Package::query()
            ->where('is_active', true)
            ->where(function ($query) use ($profileNorm) {
                $query->whereRaw('LOWER(mikrotik_profile) = ?', [$profileNorm])
                    ->orWhereRaw('LOWER(name) = ?', [$profileNorm]);
            })
            ->orderByDesc('id')
            ->first();
    }

    private function rowMatchesSearch(array $row, string $search): bool
    {
        $haystack = strtolower(implode(' ', [
            (string) ($row['customer_name'] ?? ''),
            (string) ($row['phone'] ?? ''),
            (string) ($row['pppoe_username'] ?? ''),
            (string) ($row['system_package'] ?? ''),
            (string) ($row['mikrotik_profile'] ?? ''),
            (string) ($row['status'] ?? ''),
        ]));

        return str_contains($haystack, $search);
    }

    private function normalize(string $value): string
    {
        return strtolower(trim($value));
    }

    private function getNormalizedMikrotikSecrets(): array
    {
        $mikrotik = new MikroTikService();
        $secrets = $mikrotik->getAllPPPoESecrets() ?? [];

        $normalized = [];
        foreach ($secrets as $secretUsername => $secretData) {
            $name = (string) ($secretData['name'] ?? $secretUsername);
            $key = $this->normalize($name);
            if ($key === '') {
                continue;
            }
            $normalized[$key] = $secretData;
            $normalized[$key]['name'] = $name;
        }

        return $normalized;
    }

    private function fetchAvailableProfiles(MikroTikService $mikrotik): array
    {
        $profiles = $mikrotik->command('/ppp/profile/print');
        $availableProfiles = [];
        foreach ($profiles as $profile) {
            $name = trim((string) ($profile['name'] ?? ''));
            if ($name !== '') {
                $availableProfiles[] = $name;
            }
        }

        return array_values(array_unique($availableProfiles));
    }

    private function resolveProfileFromAvailable(string $targetProfile, array $availableProfiles): ?string
    {
        if ($targetProfile === '') {
            return null;
        }

        foreach ($availableProfiles as $profile) {
            if (strcasecmp($profile, $targetProfile) === 0) {
                return $profile;
            }
        }

        return null;
    }

    private function generateUniqueUsername(Customer $customer, array $mikrotikSecrets): string
    {
        $firstName = strtolower(trim((string) explode(' ', (string) ($customer->name ?? ''))[0]));
        $firstName = preg_replace('/[^a-z0-9]/', '', $firstName) ?: 'cust';
        $areaCode = strtoupper(trim((string) ($customer->area_code ?? '')));
        $areaCode = preg_replace('/[^A-Z0-9]/', '', $areaCode) ?: 'CUST';
        $prefix = $areaCode . '-' . $firstName;

        $existingCustomerUsernames = Customer::query()
            ->whereNotNull('pppoe_username')
            ->pluck('pppoe_username')
            ->map(fn ($username) => $this->normalize((string) $username))
            ->filter()
            ->flip()
            ->all();

        $existingMikrotikUsernames = [];
        foreach ($mikrotikSecrets as $secretUsername => $secret) {
            $existingMikrotikUsernames[$this->normalize((string) ($secret['name'] ?? $secretUsername))] = true;
        }

        for ($i = 0; $i < 1000; $i++) {
            $suffix = str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            $candidate = $prefix . $suffix;
            $normalized = $this->normalize($candidate);
            if (isset($existingCustomerUsernames[$normalized])) {
                continue;
            }
            if (isset($existingMikrotikUsernames[$normalized])) {
                continue;
            }
            return $candidate;
        }

        return $prefix . Carbon::now()->format('His');
    }
}

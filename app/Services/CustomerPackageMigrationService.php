<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\MasterMikrotik;
use App\Models\Package;
use Illuminate\Support\Collection;

class CustomerPackageMigrationService
{
    public const DEFAULT_SECRET_PASSWORD = 'admin';

    public function preview(MasterMikrotik $router): array
    {
        $mikrotik = $this->makeMikroTik($router);
        $mikrotik->connect();

        try {
            $profiles = $this->fetchProfiles($mikrotik);
            $secrets = $this->fetchSecrets($mikrotik);
        } finally {
            $mikrotik->disconnect();
        }

        $rows = $this->buildRows($profiles, $secrets);
        $summary = $this->summarize($rows, false);

        return [
            'router' => $this->routerPayload($router),
            'summary' => $summary,
            'rows' => $rows,
        ];
    }

    public function run(MasterMikrotik $router): array
    {
        $mikrotik = $this->makeMikroTik($router);
        $mikrotik->connect();

        try {
            $profiles = $this->fetchProfiles($mikrotik);
            $secrets = $this->fetchSecrets($mikrotik);
            $rows = $this->buildRows($profiles, $secrets);

            $profileResults = $this->ensureProfiles($mikrotik, $rows, $profiles);
            $rows = $this->applyProfileResults($rows, $profileResults);
            $rows = $this->createSecrets($mikrotik, $rows);
        } finally {
            $mikrotik->disconnect();
        }

        $summary = $this->summarize($rows, true);

        return [
            'router' => $this->routerPayload($router),
            'summary' => $summary,
            'rows' => $rows,
        ];
    }

    protected function makeMikroTik(MasterMikrotik $router): MikroTikService
    {
        return new MikroTikService(
            $router->host,
            $router->username,
            $router->password_encrypted,
            $router->port,
            10
        );
    }

    private function buildRows(array $profiles, array $secrets): array
    {
        $packageByName = Package::query()
            ->select(['id', 'name', 'mikrotik_profile'])
            ->get()
            ->mapWithKeys(fn (Package $package) => [$this->normalize((string) $package->name) => $package]);

        return Customer::query()
            ->with(['package:id,name,mikrotik_profile'])
            ->select([
                'id',
                'name',
                'phone',
                'package_id',
                'package_type',
                'mikrotik_profile',
                'pppoe_username',
                'is_active',
            ])
            ->orderBy('name')
            ->get()
            ->map(function (Customer $customer) use ($profiles, $secrets, $packageByName) {
                $username = trim((string) ($customer->pppoe_username ?? ''));
                $profile = $this->resolveCustomerProfile($customer, $packageByName);
                $profileKey = $this->normalize($profile);
                $usernameKey = $this->normalize($username);
                $warnings = [];
                $errors = [];

                $profileStatus = 'will_create';
                $profileAction = 'create';
                $resolvedProfile = $profile;
                if ($profile === '') {
                    $profileStatus = 'empty';
                    $profileAction = 'skip';
                    $resolvedProfile = null;
                    $warnings[] = 'Profile sistem kosong.';
                } elseif (isset($profiles[$profileKey])) {
                    $profileStatus = 'exists';
                    $profileAction = 'none';
                    $resolvedProfile = $profiles[$profileKey]['name'];
                }

                $secretStatus = 'will_create';
                $secretAction = 'create';
                if ($username === '') {
                    $secretStatus = 'empty_username';
                    $secretAction = 'skip';
                    $warnings[] = 'Username PPPoE kosong.';
                } elseif ($profile === '') {
                    $secretStatus = 'skipped';
                    $secretAction = 'skip';
                } elseif (isset($secrets[$usernameKey])) {
                    $secretStatus = 'conflict_exists';
                    $secretAction = 'skip';
                    $warnings[] = 'Secret PPPoE sudah ada di router target.';
                }

                return [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'phone' => $customer->phone,
                    'is_active' => (bool) $customer->is_active,
                    'package_label' => $this->resolvePackageLabel($customer),
                    'pppoe_username' => $username,
                    'target_profile' => $profile,
                    'resolved_profile' => $resolvedProfile,
                    'profile_status' => $profileStatus,
                    'profile_action' => $profileAction,
                    'secret_status' => $secretStatus,
                    'secret_action' => $secretAction,
                    'remote_address' => null,
                    'warnings' => $warnings,
                    'errors' => $errors,
                ];
            })
            ->values()
            ->all();
    }

    private function ensureProfiles(MikroTikService $mikrotik, array $rows, array $profiles): array
    {
        $results = [];
        foreach ($rows as $row) {
            $profile = trim((string) ($row['target_profile'] ?? ''));
            $profileKey = $this->normalize($profile);

            if ($profileKey === '' || isset($results[$profileKey])) {
                continue;
            }

            if (isset($profiles[$profileKey])) {
                $results[$profileKey] = [
                    'status' => 'exists',
                    'name' => $profiles[$profileKey]['name'],
                    'error' => null,
                ];
                continue;
            }

            try {
                $mikrotik->command('/ppp/profile/add', [
                    'name' => $profile,
                ]);

                $results[$profileKey] = [
                    'status' => 'created',
                    'name' => $profile,
                    'error' => null,
                ];
                $profiles[$profileKey] = ['name' => $profile];
            } catch (\Throwable $e) {
                $results[$profileKey] = [
                    'status' => 'failed',
                    'name' => $profile,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return $results;
    }

    private function applyProfileResults(array $rows, array $profileResults): array
    {
        foreach ($rows as &$row) {
            $profileKey = $this->normalize((string) ($row['target_profile'] ?? ''));
            if ($profileKey === '' || !isset($profileResults[$profileKey])) {
                continue;
            }

            $result = $profileResults[$profileKey];
            if ($result['status'] === 'created') {
                $row['profile_status'] = 'created';
                $row['profile_action'] = 'created';
                $row['resolved_profile'] = $result['name'];
                continue;
            }

            if ($result['status'] === 'exists') {
                $row['profile_status'] = 'exists';
                $row['profile_action'] = 'none';
                $row['resolved_profile'] = $result['name'];
                continue;
            }

            if ($result['status'] === 'failed') {
                $row['profile_status'] = 'failed';
                $row['profile_action'] = 'failed';
                $row['secret_status'] = 'skipped';
                $row['secret_action'] = 'skip';
                $row['errors'][] = 'Gagal membuat profile: ' . $result['error'];
            }
        }
        unset($row);

        return $rows;
    }

    private function createSecrets(MikroTikService $mikrotik, array $rows): array
    {
        foreach ($rows as &$row) {
            if (($row['secret_action'] ?? '') !== 'create') {
                continue;
            }

            if (($row['profile_status'] ?? '') === 'failed') {
                $row['secret_status'] = 'skipped';
                $row['secret_action'] = 'skip';
                continue;
            }

            try {
                $remoteAddress = $mikrotik->getNextIpAddress();
                $secret = $mikrotik->createPPPoESecret(
                    (string) $row['pppoe_username'],
                    self::DEFAULT_SECRET_PASSWORD,
                    'pppoe',
                    (string) ($row['resolved_profile'] ?: $row['target_profile']),
                    $remoteAddress
                );

                $row['secret_status'] = 'created';
                $row['secret_action'] = 'created';
                $row['remote_address'] = $secret['remote_address'] ?? $remoteAddress;
            } catch (\Throwable $e) {
                $row['secret_status'] = 'failed';
                $row['secret_action'] = 'failed';
                $row['errors'][] = 'Gagal membuat secret: ' . $e->getMessage();
            }
        }
        unset($row);

        return $rows;
    }

    private function fetchProfiles(MikroTikService $mikrotik): array
    {
        $profiles = [];
        foreach ($mikrotik->command('/ppp/profile/print') as $profile) {
            $name = trim((string) ($profile['name'] ?? ''));
            if ($name === '') {
                continue;
            }

            $profiles[$this->normalize($name)] = [
                'id' => $profile['.id'] ?? null,
                'name' => $name,
            ];
        }

        return $profiles;
    }

    private function fetchSecrets(MikroTikService $mikrotik): array
    {
        $secrets = [];
        foreach (($mikrotik->getAllPPPoESecrets() ?? []) as $username => $secret) {
            $name = trim((string) ($secret['name'] ?? $username));
            if ($name === '') {
                continue;
            }

            $secrets[$this->normalize($name)] = $secret + ['name' => $name];
        }

        return $secrets;
    }

    private function summarize(array $rows, bool $isRun): array
    {
        $profileCounters = [
            'will_create' => [],
            'exists' => [],
            'created' => [],
        ];

        $summary = [
            'total_pelanggan' => count($rows),
            'profile_akan_dibuat' => 0,
            'profile_sudah_ada' => 0,
            'secret_akan_dibuat' => 0,
            'secret_sudah_ada_konflik' => 0,
            'data_kosong' => 0,
            'gagal_validasi' => 0,
            'profiles_created' => 0,
            'secrets_created' => 0,
            'skipped' => 0,
            'conflicts' => 0,
            'failed' => 0,
            'has_warnings' => false,
        ];

        foreach ($rows as $row) {
            $profileKey = $this->normalize((string) ($row['target_profile'] ?? ''));
            if ($profileKey !== '' && isset($profileCounters[$row['profile_status'] ?? ''])) {
                $profileCounters[$row['profile_status']][$profileKey] = true;
            }
            if (($row['secret_status'] ?? '') === 'will_create') {
                $summary['secret_akan_dibuat']++;
            }
            if (($row['secret_status'] ?? '') === 'conflict_exists') {
                $summary['secret_sudah_ada_konflik']++;
                $summary['conflicts']++;
            }
            if (in_array(($row['profile_status'] ?? ''), ['empty'], true) || ($row['secret_status'] ?? '') === 'empty_username') {
                $summary['data_kosong']++;
            }
            if (!empty($row['errors'])) {
                $summary['gagal_validasi']++;
                $summary['failed']++;
            }
            if (!empty($row['warnings'])) {
                $summary['has_warnings'] = true;
            }
            if (($row['secret_status'] ?? '') === 'created') {
                $summary['secrets_created']++;
            }
            if (in_array(($row['secret_action'] ?? ''), ['skip', 'failed'], true)) {
                $summary['skipped']++;
            }
        }

        if ($summary['conflicts'] > 0 || $summary['data_kosong'] > 0 || $summary['failed'] > 0) {
            $summary['has_warnings'] = true;
        }

        $summary['profile_akan_dibuat'] = count($profileCounters['will_create']);
        $summary['profile_sudah_ada'] = count($profileCounters['exists']);
        $summary['profiles_created'] = count($profileCounters['created']);

        if (!$isRun) {
            unset($summary['profiles_created'], $summary['secrets_created']);
        }

        return $summary;
    }

    private function resolveCustomerProfile(Customer $customer, Collection $packageByName): string
    {
        if ($customer->package) {
            $profile = trim((string) ($customer->package->mikrotik_profile ?? ''));
            if ($profile !== '') {
                return $profile;
            }

            $name = trim((string) ($customer->package->name ?? ''));
            if ($name !== '') {
                return $name;
            }
        }

        $packageType = trim((string) ($customer->package_type ?? ''));
        if ($packageType !== '') {
            $package = $packageByName->get($this->normalize($packageType));
            if ($package) {
                $profile = trim((string) ($package->mikrotik_profile ?? ''));
                if ($profile !== '') {
                    return $profile;
                }

                $name = trim((string) ($package->name ?? ''));
                if ($name !== '') {
                    return $name;
                }
            }
        }

        return trim((string) ($customer->mikrotik_profile ?? ''));
    }

    private function resolvePackageLabel(Customer $customer): string
    {
        if ($customer->package) {
            return (string) $customer->package->name;
        }

        return trim((string) ($customer->package_type ?: $customer->mikrotik_profile));
    }

    private function routerPayload(MasterMikrotik $router): array
    {
        return [
            'id' => $router->id,
            'name' => $router->name,
            'host' => $router->host,
            'port' => $router->port,
            'is_active' => (bool) $router->is_active,
        ];
    }

    private function normalize(string $value): string
    {
        return strtolower(trim($value));
    }
}

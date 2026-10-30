<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Package;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class CustomerIsolationService
{
    public function __construct(
        protected MikroTikService $mikrotikService,
        protected ?CustomerUsageSnapshotService $usageSnapshotService = null,
        protected ?AuditLogService $auditLogService = null
    ) {}

    /**
     * Menentukan apakah pelanggan saat ini sedang dalam status isolir,
     * baik dari status database (is_service_isolated, mikrotik_profile) maupun profil MikroTik aktual.
     */
    public function isCustomerIsolated(Customer $customer, ?array $secret = null): bool
    {
        if ((bool) ($customer->is_service_isolated ?? false)) {
            return true;
        }

        if (strtolower(trim((string) ($customer->mikrotik_profile ?? ''))) === 'isolir') {
            return true;
        }

        $secretProfile = strtolower(trim((string) ($secret['profile'] ?? '')));
        if ($secretProfile === 'isolir') {
            return true;
        }

        return false;
    }

    /**
     * Menghitung tanggal jatuh tempo baru setelah konfirmasi pembayaran.
     * Jika pelanggan terisolir atau sudah lewat jatuh tempo, perpanjang 30 hari dari tanggal bayar.
     * Jika bayar lebih awal, perpanjang 30 hari dari tanggal jatuh tempo saat ini.
     */
    public function computeConfirmedDueDate(Customer $customer, bool $isCurrentlyIsolated, Carbon $confirmedAt): string
    {
        if ($isCurrentlyIsolated || empty($customer->due_date)) {
            return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
        }

        try {
            $currentDue = Carbon::parse((string) $customer->due_date)->startOfDay();
            if ($currentDue->lt($confirmedAt->copy()->startOfDay())) {
                return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
            }

            return $currentDue->addDays(30)->toDateString();
        } catch (\Throwable $e) {
            return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
        }
    }

    /**
     * Menentukan target profil PPPoE asli (non-isolir) untuk pelanggan.
     */
    public function resolveTargetProfile(Customer $customer, array $availableProfiles = []): string
    {
        $candidate = null;

        // 1. Cek profil asli yang tersimpan saat di-isolir
        $storedRestoreProfile = trim((string) ($customer->isolation_restore_profile ?? ''));
        if ($storedRestoreProfile !== '' && strtolower($storedRestoreProfile) !== 'isolir') {
            $candidate = $storedRestoreProfile;
        }

        // 2. Cek profil MikroTik yang tersimpan di data customer
        if (!$candidate) {
            $savedProfile = trim((string) ($customer->mikrotik_profile ?? ''));
            if ($savedProfile !== '' && strtolower($savedProfile) !== 'isolir') {
                $candidate = $savedProfile;
            }
        }

        // 3. Cek dari relasi paket (package_id)
        if (!$candidate && $customer->package) {
            $pkgProfile = trim((string) ($customer->package->mikrotik_profile ?? ''));
            if ($pkgProfile !== '' && strtolower($pkgProfile) !== 'isolir') {
                $candidate = $pkgProfile;
            } elseif (!empty($customer->package->name) && strtolower((string) $customer->package->name) !== 'isolir') {
                $candidate = trim((string) $customer->package->name);
            }
        }

        // 4. Cek dari nama/tipe paket (package_type)
        if (!$candidate) {
            $packageType = trim((string) ($customer->package_type ?? ''));
            if ($packageType !== '') {
                $pkg = Package::query()
                    ->whereRaw('LOWER(name) = ?', [strtolower($packageType)])
                    ->first();

                if (!$pkg) {
                    $pkg = Package::query()
                        ->where('name', 'like', "%{$packageType}%")
                        ->first();
                }

                if ($pkg) {
                    $pkgProfile = trim((string) ($pkg->mikrotik_profile ?? ''));
                    if ($pkgProfile !== '' && strtolower($pkgProfile) !== 'isolir') {
                        $candidate = $pkgProfile;
                    } elseif (!empty($pkg->name) && strtolower((string) $pkg->name) !== 'isolir') {
                        $candidate = trim((string) $pkg->name);
                    }
                }

                if (!$candidate && strtolower($packageType) !== 'isolir') {
                    $candidate = $packageType;
                }
            }
        }

        // 5. Fallback aman
        if (!$candidate || strtolower($candidate) === 'isolir') {
            $candidate = 'default';
        }

        // 6. Cocokkan dengan daftar profil di MikroTik jika tersedia
        if (!empty($availableProfiles)) {
            $bestMatch = $this->resolveBestMatchingProfile($candidate, $availableProfiles);
            if ($bestMatch !== null) {
                return $bestMatch;
            }
        }

        return $candidate;
    }

    /**
     * Mencocokkan kandidat nama profil dengan profil yang ada di MikroTik.
     */
    public function resolveBestMatchingProfile(string $targetProfile, array $availableProfiles): ?string
    {
        if ($targetProfile === '' || empty($availableProfiles)) {
            return null;
        }

        // 1. Exact match
        if (in_array($targetProfile, $availableProfiles, true)) {
            return $targetProfile;
        }

        // 2. Case-insensitive match
        foreach ($availableProfiles as $profile) {
            if (strtolower((string) $profile) === strtolower($targetProfile)) {
                return (string) $profile;
            }
        }

        // 3. Match berdasarkan angka kecepatan (contoh: "10 Mbps" atau "Home 10M" cocok ke "10M" / "PAKET-10M")
        $speed = preg_replace('/[^0-9]/', '', $targetProfile);
        if ($speed !== '') {
            foreach ($availableProfiles as $profile) {
                $lower = strtolower((string) $profile);
                if ($lower !== 'isolir' && str_contains($lower, $speed)) {
                    return (string) $profile;
                }
            }
        }

        return null;
    }

    /**
     * Mencabut status isolir pelanggan secara menyeluruh:
     * 1. Buka isolir di MikroTik RouterOS (ubah profil kembali normal dan putus sesi aktif agar reconnect).
     * 2. Perbarui data database (is_service_isolated = false, mikrotik_profile = normal, due_date +30 hari).
     * 3. Reset snapshot kuota/penggunaan pelanggan.
     */
    public function unisolateCustomer(
        Customer $customer,
        ?Carbon $confirmedAt = null,
        ?Invoice $invoice = null,
        ?int $actorId = null
    ): array {
        $confirmedAt ??= now();
        $username = trim((string) ($customer->pppoe_username ?: $customer->name));

        $secret = null;
        $availableProfiles = [];
        $mikrotikConnected = false;

        // Ambil profil MikroTik dan secret jika username tersedia
        if ($username !== '') {
            try {
                $this->mikrotikService->connect();
                $mikrotikConnected = true;

                $secret = $this->mikrotikService->getPPPoESecret($username, true);
                $profiles = $this->mikrotikService->command('/ppp/profile/print', [], false);
                if (is_array($profiles)) {
                    $availableProfiles = array_values(array_filter(array_map(
                        fn ($p) => (string) ($p['name'] ?? ''),
                        $profiles
                    )));
                }
            } catch (\Throwable $mikEx) {
                Log::warning('CustomerIsolationService: MikroTik connect/profile inspection warning: ' . $mikEx->getMessage(), [
                    'customer_id' => $customer->id,
                    'username' => $username,
                ]);
            }
        }

        $isCurrentlyIsolated = $this->isCustomerIsolated($customer, $secret);

        // Hitung tanggal jatuh tempo baru
        $customer->due_date = $this->computeConfirmedDueDate($customer, $isCurrentlyIsolated, $confirmedAt);

        $targetProfile = $this->resolveTargetProfile($customer, $availableProfiles);
        // Proteksi mutlak: targetProfile tidak boleh 'isolir'
        if (strtolower($targetProfile) === 'isolir') {
            $targetProfile = 'default';
        }

        $isolationRestored = false;
        $isolationRestoreFailed = false;
        $isolationRestoreError = null;

        // Eksekusi buka isolir di MikroTik
        if ($username !== '') {
            try {
                $this->mikrotikService->unrestrictUser($username, $targetProfile);
                $isolationRestored = true;
                Log::info('CustomerIsolationService: Berhasil unrestrict isolir MikroTik', [
                    'customer_id' => $customer->id,
                    'username' => $username,
                    'target_profile' => $targetProfile,
                    'invoice_id' => $invoice?->id,
                ]);
            } catch (\Throwable $restoreErr) {
                $isolationRestoreFailed = true;
                $isolationRestoreError = $restoreErr->getMessage() ?: 'Gagal mencabut isolir dari MikroTik.';
                Log::error('CustomerIsolationService: Gagal unrestrict isolir MikroTik', [
                    'customer_id' => $customer->id,
                    'username' => $username,
                    'target_profile' => $targetProfile,
                    'error' => $isolationRestoreError,
                    'invoice_id' => $invoice?->id,
                ]);
            }
        } elseif ($isCurrentlyIsolated) {
            $isolationRestoreFailed = true;
            $isolationRestoreError = 'Pelanggan tidak memiliki username PPPoE untuk dipulihkan di MikroTik.';
            Log::warning('CustomerIsolationService: Pelanggan tidak memiliki PPPoE username', [
                'customer_id' => $customer->id,
                'name' => $customer->name,
            ]);
        }

        // Perbarui status database pelanggan
        $customer->is_service_isolated = false;
        $customer->service_isolated_at = null;
        $customer->service_isolated_by = null;
        $customer->isolation_restore_profile = null;

        // Pastikan mikrotik_profile di DB tidak lagi bernilai 'isolir'
        if (empty($customer->mikrotik_profile) || strtolower((string) $customer->mikrotik_profile) === 'isolir') {
            $customer->mikrotik_profile = $targetProfile;
        }

        $customer->save();

        // Reset usage snapshot periode
        if ($this->usageSnapshotService) {
            try {
                $this->usageSnapshotService->resetPeriodByCustomerId((int) $customer->id);
            } catch (\Throwable $snapEx) {
                Log::warning('CustomerIsolationService: snapshot reset warning: ' . $snapEx->getMessage());
            }
        }

        // Putus koneksi MikroTik dengan aman
        if ($mikrotikConnected) {
            try {
                $this->mikrotikService->clearMikrotikCache();
                $this->mikrotikService->disconnect();
            } catch (\Throwable $e) {}
        }

        // Catat Audit Log jika tersedia
        if ($this->auditLogService && $actorId) {
            $action = $isolationRestored
                ? 'billing.customer_unisolated_after_payment'
                : ($isolationRestoreFailed ? 'billing.customer_unisolation_failed_after_payment' : 'billing.customer_status_refreshed');

            $this->auditLogService->log($action, $customer, [
                'customer_id' => $customer->id,
                'invoice_id' => $invoice?->id,
                'pppoe_username' => $username,
                'target_profile' => $targetProfile,
                'was_isolated' => $isCurrentlyIsolated,
                'isolation_restored' => $isolationRestored,
                'error' => $isolationRestoreError,
                'confirmed_at' => $confirmedAt->toIso8601String(),
            ], $actorId);
        }

        return [
            'success' => true,
            'is_isolated' => $isCurrentlyIsolated,
            'isolation_restored' => $isolationRestored,
            'restored_profile' => $targetProfile,
            'isolation_restore_failed' => $isolationRestoreFailed,
            'isolation_restore_error' => $isolationRestoreError,
            'new_due_date' => $customer->due_date,
        ];
    }
}

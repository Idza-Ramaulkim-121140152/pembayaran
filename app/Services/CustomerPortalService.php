<?php

namespace App\Services;

use App\Models\Customer;
use Carbon\Carbon;

class CustomerPortalService
{
    public function buildDashboard(Customer $customer): array
    {
        $customer->loadMissing('odp');

        $invoices = $customer->invoices()
            ->orderByDesc('created_at')
            ->take(12)
            ->get();

        $complaints = $customer->complaints()
            ->orderByDesc('created_at')
            ->take(10)
            ->get();

        $connection = $this->buildConnectionSummary($customer);
        $homeRouterSnapshot = app(CustomerHomeRouterService::class)->getSnapshot($customer, $connection);
        $connection = $this->attachHomeRouterSummary($connection, $homeRouterSnapshot);
        $usage = $this->buildUsageSummary($connection, $homeRouterSnapshot);
        $household = $this->buildHouseholdSummary($connection, $homeRouterSnapshot);

        return [
            'customer' => $this->buildCustomerPayload($customer),
            'account_summary' => $this->buildAccountSummary($customer, $invoices),
            'connection' => $connection,
            'usage' => $usage,
            'household' => $household,
            'support_summary' => $this->buildSupportSummary($customer, $complaints),
            'portal_meta' => [
                'version' => 'v2',
                'refreshed_at' => now()->toIso8601String(),
                'capabilities' => [
                    'realtime_connection' => true,
                    'session_traffic' => $usage['available'],
                    'home_device_count' => $household['home_device_count_available'],
                    'customer_router_monitoring' => (bool) ($homeRouterSnapshot['enabled'] ?? false),
                ],
            ],
            'invoices' => $invoices,
            'complaints' => $complaints,
        ];
    }

    private function buildCustomerPayload(Customer $customer): array
    {
        $odpRelation = $this->resolveOdpRelation($customer);

        return [
            'id' => $customer->id,
            'nama' => $customer->nama,
            'alamat' => $customer->alamat,
            'no_telp' => $customer->no_telp,
            'user_pppoe' => $customer->user_pppoe,
            'paket' => $customer->paket,
            'harga' => $customer->harga,
            'tanggal_jatuh_tempo' => $customer->tanggal_jatuh_tempo,
            'is_active' => $customer->is_active,
            'odp' => $odpRelation?->nama ?? $customer->getAttribute('odp'),
            'email' => $customer->email,
            'activation_date' => optional($customer->activation_date)->toDateString(),
            'mikrotik_profile' => $customer->mikrotik_profile,
        ];
    }

    private function buildAccountSummary(Customer $customer, $invoices): array
    {
        $lastPaidInvoice = $customer->invoices()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->orderByDesc('paid_at')
            ->first();

        $latestInvoice = $invoices->first();
        $dueDate = $customer->due_date ? Carbon::parse($customer->due_date) : null;

        return [
            'due_date' => optional($dueDate)->toDateString(),
            'days_until_due' => $dueDate ? Carbon::today()->diffInDays($dueDate, false) : null,
            'activation_date' => optional($customer->activation_date)->toDateString(),
            'last_payment_at' => $lastPaidInvoice?->paid_at?->toIso8601String(),
            'last_paid_amount' => $lastPaidInvoice?->amount !== null ? (float) $lastPaidInvoice->amount : null,
            'latest_invoice_status' => $latestInvoice?->status,
            'latest_invoice_amount' => $latestInvoice?->amount !== null ? (float) $latestInvoice->amount : null,
            'latest_invoice_due_date' => $latestInvoice?->due_date?->toDateString(),
            'open_invoice_count' => $customer->invoices()
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->count(),
            'paid_invoice_count' => $customer->invoices()
                ->where('status', 'paid')
                ->count(),
        ];
    }

    private function buildConnectionSummary(Customer $customer): array
    {
        $username = trim((string) ($customer->pppoe_username ?? ''));

        $base = [
            'status' => 'unknown',
            'status_label' => 'Status Tidak Diketahui',
            'status_note' => 'Status layanan belum bisa ditentukan.',
            'is_online' => false,
            'is_isolated' => false,
            'has_pppoe_secret' => false,
            'is_customer_active' => (bool) $customer->is_active,
            'router_identity' => null,
            'router_version' => null,
            'pppoe_username' => $username ?: null,
            'package_name' => $customer->package_type,
            'configured_profile' => $customer->mikrotik_profile,
            'ip_address' => null,
            'caller_id' => null,
            'uptime' => null,
            'last_checked_at' => now()->toIso8601String(),
            'availability_note' => null,
            'session' => [
                'active' => false,
                'count' => 0,
                'source' => null,
                'uptime' => null,
                'ip_address' => null,
                'caller_id' => null,
                'session_id' => null,
            ],
            'secret' => [
                'exists' => false,
                'profile' => null,
                'service' => null,
                'remote_address' => null,
                'local_address' => null,
                'disabled' => null,
            ],
            'traffic' => [
                'available' => false,
                'period' => 'current_session',
                'download_bytes' => null,
                'upload_bytes' => null,
                'total_bytes' => null,
                'download_label' => null,
                'upload_label' => null,
                'total_label' => null,
            ],
            'home_router' => [],
        ];

        if ($username === '') {
            return array_merge($base, [
                'status' => 'not_configured',
                'status_label' => 'Belum Terkonfigurasi',
                'status_note' => 'Username PPPoE belum tersedia. Tim kami masih perlu melengkapi provisioning layanan.',
            ]);
        }

        try {
            $mikrotik = app(MikroTikService::class);
            $resources = $mikrotik->getSystemResources();
            $routerIdentity = $mikrotik->getIdentity();
            $secret = $mikrotik->getPPPoESecret($username);
            $activeConnections = $mikrotik->getActivePPPoEConnections();
        } catch (\Throwable $e) {
            \Log::warning('Failed to build customer portal connection summary', [
                'customer_id' => $customer->id,
                'pppoe_username' => $username,
                'error' => $e->getMessage(),
            ]);

            return array_merge($base, [
                'status' => $customer->is_active ? 'unknown' : 'inactive',
                'status_label' => $customer->is_active ? 'Status Tidak Tersedia' : 'Layanan Nonaktif',
                'status_note' => $customer->is_active
                    ? 'Portal belum bisa menjangkau router MikroTik saat ini. Coba refresh beberapa saat lagi.'
                    : 'Akun layanan sedang nonaktif.',
                'availability_note' => 'Koneksi ke router pusat sedang tidak tersedia.',
            ]);
        }

        $connection = collect($activeConnections)->first(function ($session) use ($username) {
            return $this->normalizeUsername($session['name'] ?? '') === $this->normalizeUsername($username);
        });

        $hasSecret = $secret !== null;
        $secretDisabled = $this->toBoolean($secret['disabled'] ?? null);
        $isOnline = is_array($connection);
        $profile = $secret['profile'] ?? $customer->mikrotik_profile ?? $customer->package_type;
        $isIsolated = strtolower((string) $profile) === 'isolir';

        $downloadBytes = $connection['bytes_in'] ?? null;
        $uploadBytes = $connection['bytes_out'] ?? null;
        $totalBytes = $connection['total_bytes'] ?? null;

        if ($totalBytes === null && ($downloadBytes !== null || $uploadBytes !== null)) {
            $totalBytes = (int) (($downloadBytes ?? 0) + ($uploadBytes ?? 0));
        }

        $status = 'offline';
        $statusLabel = 'Offline';
        $statusNote = 'Akun PPPoE sudah ada, tetapi router rumah belum sedang terhubung.';

        if ($isIsolated) {
            $status = 'isolated';
            $statusLabel = 'Diisolir';
            $statusNote = 'Layanan sedang dibatasi sampai pembayaran atau verifikasi dituntaskan.';
        } elseif ($secretDisabled) {
            $status = 'inactive';
            $statusLabel = 'Layanan Dinonaktifkan';
            $statusNote = 'Akun PPPoE sedang dinonaktifkan di router pusat.';
        } elseif ($isOnline) {
            $status = 'online';
            $statusLabel = 'Online';
            $statusNote = 'Router rumah sedang terhubung ke jaringan kami secara real-time.';
        } elseif (!$customer->is_active) {
            $status = 'inactive';
            $statusLabel = 'Layanan Nonaktif';
            $statusNote = 'Akun layanan sedang nonaktif.';
        } elseif (!$hasSecret) {
            $status = 'provisioning';
            $statusLabel = 'Menunggu Aktivasi';
            $statusNote = 'Data pelanggan ada, tetapi akun PPPoE belum ditemukan di router pusat.';
        }

        return array_merge($base, [
            'status' => $status,
            'status_label' => $statusLabel,
            'status_note' => $statusNote,
            'is_online' => $isOnline,
            'is_isolated' => $isIsolated,
            'has_pppoe_secret' => $hasSecret,
            'router_identity' => $routerIdentity !== 'Unknown' ? $routerIdentity : null,
            'router_version' => $resources['version'] ?? null,
            'configured_profile' => $profile,
            'ip_address' => $connection['address'] ?? ($secret['remote_address'] ?? null),
            'caller_id' => $connection['caller_id'] ?? ($secret['caller_id'] ?? null),
            'uptime' => $connection['uptime'] ?? null,
            'availability_note' => $isOnline
                ? 'Status ini diambil langsung dari sesi PPPoE yang sedang aktif.'
                : null,
            'session' => [
                'active' => $isOnline,
                'count' => $isOnline ? 1 : 0,
                'source' => $connection['source'] ?? null,
                'uptime' => $connection['uptime'] ?? null,
                'ip_address' => $connection['address'] ?? null,
                'caller_id' => $connection['caller_id'] ?? null,
                'session_id' => $connection['session_id'] ?? null,
            ],
            'secret' => [
                'exists' => $hasSecret,
                'profile' => $profile,
                'service' => $secret['service'] ?? 'pppoe',
                'remote_address' => $secret['remote_address'] ?? null,
                'local_address' => $secret['local_address'] ?? null,
                'disabled' => $secretDisabled,
            ],
            'traffic' => [
                'available' => $totalBytes !== null || $downloadBytes !== null || $uploadBytes !== null,
                'period' => 'current_session',
                'download_bytes' => $downloadBytes,
                'upload_bytes' => $uploadBytes,
                'total_bytes' => $totalBytes,
                'download_label' => $this->formatBytes($downloadBytes),
                'upload_label' => $this->formatBytes($uploadBytes),
                'total_label' => $this->formatBytes($totalBytes),
            ],
        ]);
    }

    private function attachHomeRouterSummary(array $connection, array $homeRouterSnapshot): array
    {
        $connection['home_router'] = [
            'enabled' => (bool) ($homeRouterSnapshot['enabled'] ?? false),
            'configured' => (bool) ($homeRouterSnapshot['configured'] ?? false),
            'reachable' => (bool) ($homeRouterSnapshot['reachable'] ?? false),
            'type' => $homeRouterSnapshot['type'] ?? null,
            'type_label' => $homeRouterSnapshot['type_label'] ?? null,
            'management_mode' => $homeRouterSnapshot['management_mode'] ?? null,
            'status_label' => $homeRouterSnapshot['status_label'] ?? null,
            'identity' => $homeRouterSnapshot['identity'] ?? null,
            'version' => $homeRouterSnapshot['version'] ?? null,
            'wan_interface' => $homeRouterSnapshot['wan_interface'] ?? null,
            'wan_uptime' => $homeRouterSnapshot['wan_uptime'] ?? null,
            'host' => $homeRouterSnapshot['host'] ?? null,
            'host_source' => $homeRouterSnapshot['host_source'] ?? null,
            'host_source_label' => $homeRouterSnapshot['host_source_label'] ?? null,
            'availability_note' => $homeRouterSnapshot['note'] ?? null,
            'traffic_source' => $homeRouterSnapshot['traffic']['source_label'] ?? null,
            'device_source' => $homeRouterSnapshot['devices']['source_label'] ?? null,
        ];

        return $connection;
    }

    private function buildUsageSummary(array $connection, array $homeRouterSnapshot): array
    {
        $homeRouterTraffic = $homeRouterSnapshot['traffic'] ?? [];

        if (($homeRouterTraffic['available'] ?? false) === true) {
            return [
                'available' => true,
                'period' => 'router_wan_total',
                'source' => $homeRouterTraffic['source'] ?? 'home_router_wan',
                'source_label' => $homeRouterTraffic['source_label'] ?? 'Router rumah',
                'download_bytes' => $homeRouterTraffic['download_bytes'] ?? null,
                'upload_bytes' => $homeRouterTraffic['upload_bytes'] ?? null,
                'total_bytes' => $homeRouterTraffic['total_bytes'] ?? null,
                'download_label' => $this->formatBytes($homeRouterTraffic['download_bytes'] ?? null),
                'upload_label' => $this->formatBytes($homeRouterTraffic['upload_bytes'] ?? null),
                'total_label' => $this->formatBytes($homeRouterTraffic['total_bytes'] ?? null),
                'note' => $homeRouterTraffic['note'] ?? 'Traffic diambil langsung dari router rumah pelanggan.',
            ];
        }

        $traffic = $connection['traffic'];

        return [
            'available' => $traffic['available'],
            'period' => $traffic['period'],
            'source' => $traffic['available'] ? 'central_pppoe_session' : null,
            'source_label' => $traffic['available'] ? 'Sesi PPPoE aktif' : null,
            'download_bytes' => $traffic['download_bytes'],
            'upload_bytes' => $traffic['upload_bytes'],
            'total_bytes' => $traffic['total_bytes'],
            'download_label' => $traffic['download_label'],
            'upload_label' => $traffic['upload_label'],
            'total_label' => $traffic['total_label'],
            'note' => $traffic['available']
                ? 'Traffic dihitung dari sesi PPPoE yang sedang aktif saat portal dibuka.'
                : $this->buildUsageFallbackNote($homeRouterSnapshot),
        ];
    }

    private function buildHouseholdSummary(array $connection, array $homeRouterSnapshot): array
    {
        $homeRouterDevices = $homeRouterSnapshot['devices'] ?? [];
        $deviceCountAvailable = (bool) ($homeRouterDevices['available'] ?? false);

        return [
            'active_household_sessions' => $connection['session']['count'],
            'active_household_sessions_note' => $deviceCountAvailable
                ? 'Sesi internet rumah aktif dihitung dari PPPoE pusat, perangkat diambil langsung dari router rumah.'
                : 'V2 saat ini menghitung sesi internet rumah yang aktif dari PPPoE.',
            'home_device_count' => $homeRouterDevices['count'] ?? null,
            'home_device_count_available' => $deviceCountAvailable,
            'home_device_source' => $homeRouterDevices['source'] ?? null,
            'home_device_source_label' => $homeRouterDevices['source_label'] ?? null,
            'home_device_note' => $this->buildHomeDeviceNote($homeRouterSnapshot),
        ];
    }

    private function buildSupportSummary(Customer $customer, $complaints): array
    {
        $latestComplaint = $complaints->first();

        return [
            'total_count' => $customer->complaints()->count(),
            'active_count' => $customer->complaints()
                ->whereIn('status', ['pending', 'in_progress'])
                ->count(),
            'latest_subject' => $latestComplaint?->subject,
            'latest_status' => $latestComplaint?->status,
        ];
    }

    private function resolveOdpRelation(Customer $customer)
    {
        if ($customer->relationLoaded('odp')) {
            return $customer->getRelation('odp');
        }

        try {
            return $customer->odp()->first();
        } catch (\Throwable $e) {
            \Log::warning('Failed to resolve ODP relation for customer portal', [
                'customer_id' => $customer->id,
                'odp_value' => $customer->getAttribute('odp'),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function normalizeUsername(?string $username): string
    {
        return strtolower(trim((string) $username));
    }

    private function toBoolean($value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));

        if (in_array($normalized, ['true', 'yes', '1'], true)) {
            return true;
        }

        if (in_array($normalized, ['false', 'no', '0'], true)) {
            return false;
        }

        return null;
    }

    private function formatBytes(?int $bytes): ?string
    {
        if ($bytes === null) {
            return null;
        }

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $size = (float) $bytes;
        $index = 0;

        while ($size >= 1024 && $index < count($units) - 1) {
            $size /= 1024;
            $index++;
        }

        return round($size, $index === 0 ? 0 : 2) . ' ' . $units[$index];
    }

    private function buildUsageFallbackNote(array $homeRouterSnapshot): string
    {
        if (($homeRouterSnapshot['enabled'] ?? false) && !($homeRouterSnapshot['configured'] ?? false)) {
            return 'Monitoring router rumah sudah diaktifkan, tetapi konfigurasinya belum lengkap.';
        }

        if (($homeRouterSnapshot['enabled'] ?? false) && !($homeRouterSnapshot['reachable'] ?? false)) {
            return 'Monitoring router rumah aktif, tetapi router belum bisa dijangkau. Portal tetap menampilkan status koneksi real-time.';
        }

        if (($homeRouterSnapshot['enabled'] ?? false) && ($homeRouterSnapshot['reachable'] ?? false)) {
            return $homeRouterSnapshot['traffic']['note'] ?? 'Router rumah terhubung, tetapi counter traffic tambahan belum tersedia.';
        }

        return 'Monitoring router rumah belum diaktifkan untuk akun ini. Portal masih memakai status PPPoE pusat.';
    }

    private function buildHomeDeviceNote(array $homeRouterSnapshot): string
    {
        if (($homeRouterSnapshot['devices']['available'] ?? false) === true) {
            return $homeRouterSnapshot['devices']['note'] ?? 'Jumlah perangkat diambil langsung dari router rumah pelanggan.';
        }

        if (($homeRouterSnapshot['enabled'] ?? false) && !($homeRouterSnapshot['configured'] ?? false)) {
            return 'Monitoring router rumah aktif, tetapi konfigurasinya belum lengkap.';
        }

        if (($homeRouterSnapshot['enabled'] ?? false) && !($homeRouterSnapshot['reachable'] ?? false)) {
            return 'Monitoring router rumah aktif, tetapi router belum bisa dijangkau dari server saat ini.';
        }

        if (($homeRouterSnapshot['enabled'] ?? false) && ($homeRouterSnapshot['reachable'] ?? false)) {
            return $homeRouterSnapshot['devices']['note'] ?? 'Router rumah sudah terhubung, tetapi jumlah perangkat belum bisa dihitung dari konfigurasi saat ini.';
        }

        return 'Monitoring router rumah belum diaktifkan untuk akun ini, jadi jumlah perangkat rumah belum bisa dihitung.';
    }
}

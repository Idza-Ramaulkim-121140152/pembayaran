<?php

namespace App\Services;

use App\Models\AreaOutageIncident;
use App\Models\Customer;
use App\Models\MasterMikrotik;
use App\Models\NetworkNotice;
use App\Models\NotificationLog;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AreaOutageMonitorService
{
    public const SETTING_ENABLED = 'area_outage_alert_enabled';
    public const SETTING_GROUP_ID = 'area_outage_alert_group_id';
    public const SETTING_GROUP_NAME = 'area_outage_alert_group_name';
    public const SETTING_THRESHOLD_PERCENT = 'area_outage_alert_threshold_percent';
    public const SETTING_MIN_CUSTOMERS = 'area_outage_alert_min_customers';
    public const SETTING_COOLDOWN_MINUTES = 'area_outage_alert_cooldown_minutes';

    public const DEFAULT_ENABLED = true;
    public const DEFAULT_THRESHOLD = 50; // 50% nonaktif
    public const DEFAULT_MIN_CUSTOMERS = 3; // minimal 3 pelanggan dalam 1 area
    public const DEFAULT_COOLDOWN = 30; // 30 menit cooldown per area

    /**
     * Pastikan tabel area_outage_incidents tersedia.
     */
    public function ensureTableExists(): void
    {
        if (!Schema::hasTable('area_outage_incidents')) {
            try {
                Schema::create('area_outage_incidents', function (Blueprint $table) {
                    $table->id();
                    $table->string('token', 64)->unique();
                    $table->string('area_code', 30)->index();
                    $table->unsignedInteger('total_customers')->default(0);
                    $table->unsignedInteger('active_customers_count')->default(0);
                    $table->unsignedInteger('inactive_customers_count')->default(0);
                    $table->longText('inactive_customers_data')->nullable();
                    $table->string('status', 30)->default('detected')->index();
                    $table->string('incident_type', 50)->nullable();
                    $table->text('incident_notes')->nullable();
                    $table->foreignId('network_notice_id')->nullable()->constrained('network_notices')->onDelete('set null');
                    $table->text('alert_message_sent')->nullable();
                    $table->string('target_group_id', 100)->nullable();
                    $table->dateTime('alerted_at')->index();
                    $table->dateTime('action_taken_at')->nullable();
                    $table->foreignId('action_taken_by')->nullable()->constrained('users')->onDelete('set null');
                    $table->dateTime('resolved_at')->nullable();
                    $table->timestamps();
                });
            } catch (\Throwable $e) {
                Log::warning('Could not auto-create area_outage_incidents table: ' . $e->getMessage());
            }
        }
    }

    /**
     * Ekstraksi kode dusun / area dari username PPPoE.
     * Mengambil 3 karakter di akhir prefix sebelum nama pelanggan.
     * Contoh:
     * - 'CJA-arif2' -> 'CJA'
     * - 'KALTAMCJA-jumingan621' -> 'CJA'
     * - 'CCA-budi' -> 'CCA'
     * - 'KALTAMCCA-budi' -> 'CCA'
     */
    public static function extractAreaCode(?string $pppoeUsername): ?string
    {
        if (!$pppoeUsername) {
            return null;
        }

        $trimmed = trim($pppoeUsername);
        if ($trimmed === '') {
            return null;
        }

        // 1. Format dengan tanda strip '-' (misal CJA-arif2 atau KALTAMCJA-jumingan621)
        if (str_contains($trimmed, '-')) {
            $parts = explode('-', $trimmed, 2);
            $prefix = trim($parts[0]);
            if (strlen($prefix) >= 3) {
                return strtoupper(substr($prefix, -3));
            }
        }

        // 2. Format awalan KALTAM tanpa strip (prefix 9 karakter, 3 char terakhir adalah dusun)
        if (preg_match('/^KALTAM([A-Za-z]{3})/i', $trimmed, $matches)) {
            return strtoupper($matches[1]);
        }

        // 3. Format 3 huruf alfabet pertama jika tanpa strip
        if (preg_match('/^([A-Za-z]{3})/i', $trimmed, $matches)) {
            return strtoupper($matches[1]);
        }

        return null;
    }

    /**
     * Ambil pengaturan global alert area.
     */
    public function getSettings(): array
    {
        $enabled = SiteSetting::get(self::SETTING_ENABLED, self::DEFAULT_ENABLED);
        $threshold = (int) SiteSetting::get(self::SETTING_THRESHOLD_PERCENT, self::DEFAULT_THRESHOLD);
        $minCust = (int) SiteSetting::get(self::SETTING_MIN_CUSTOMERS, self::DEFAULT_MIN_CUSTOMERS);
        $cooldown = (int) SiteSetting::get(self::SETTING_COOLDOWN_MINUTES, self::DEFAULT_COOLDOWN);
        $groupId = SiteSetting::get(self::SETTING_GROUP_ID, null);
        $groupName = SiteSetting::get(self::SETTING_GROUP_NAME, null);

        return [
            'enabled' => filter_var($enabled, FILTER_VALIDATE_BOOLEAN),
            'threshold_percent' => $threshold > 0 ? $threshold : self::DEFAULT_THRESHOLD,
            'min_customers' => $minCust > 0 ? $minCust : self::DEFAULT_MIN_CUSTOMERS,
            'cooldown_minutes' => $cooldown > 0 ? $cooldown : self::DEFAULT_COOLDOWN,
            'target_group_id' => $groupId,
            'target_group_name' => $groupName,
        ];
    }

    /**
     * Simpan pengaturan alert area.
     */
    public function updateSettings(array $data): array
    {
        if (array_key_exists('enabled', $data)) {
            SiteSetting::set(self::SETTING_ENABLED, $data['enabled'] ? '1' : '0');
        }
        if (isset($data['threshold_percent'])) {
            $threshold = max(10, min(100, (int) $data['threshold_percent']));
            SiteSetting::set(self::SETTING_THRESHOLD_PERCENT, (string) $threshold);
        }
        if (isset($data['min_customers'])) {
            $minCust = max(1, (int) $data['min_customers']);
            SiteSetting::set(self::SETTING_MIN_CUSTOMERS, (string) $minCust);
        }
        if (isset($data['cooldown_minutes'])) {
            $cooldown = max(5, (int) $data['cooldown_minutes']);
            SiteSetting::set(self::SETTING_COOLDOWN_MINUTES, (string) $cooldown);
        }
        if (array_key_exists('target_group_id', $data)) {
            SiteSetting::set(self::SETTING_GROUP_ID, $data['target_group_id'] ? trim($data['target_group_id']) : '');
        }
        if (array_key_exists('target_group_name', $data)) {
            SiteSetting::set(self::SETTING_GROUP_NAME, $data['target_group_name'] ? trim($data['target_group_name']) : '');
        }

        return $this->getSettings();
    }

    /**
     * Pindai koneksi pelanggan PPPoE dan deteksi area yang mengalami gangguan masal (nonaktif >= 50%).
     */
    public function scanAreaOutages(bool $forceAlert = false): array
    {
        $this->ensureTableExists();

        $settings = $this->getSettings();
        if (!$settings['enabled'] && !$forceAlert) {
            return [
                'status' => 'disabled',
                'message' => 'Peringatan gangguan area otomatis sedang dinonaktifkan.',
                'areas' => [],
                'incidents' => [],
            ];
        }

        // 1. Ambil router MikroTik aktif
        /** @var MasterMikrotik|null $router */
        $router = MasterMikrotik::query()->where('is_active', true)->first();
        if (!$router) {
            return [
                'status' => 'no_router',
                'message' => 'Tidak ada router MikroTik aktif yang terkonfigurasi.',
                'areas' => [],
                'incidents' => [],
            ];
        }

        // 2. Ambil sesi PPPoE aktif dari MikroTik
        $activeMap = [];
        try {
            $mikrotik = new MikroTikService(
                $router->host,
                $router->username,
                $router->password_encrypted,
                $router->port,
                6
            );
            $activeConnections = $mikrotik->getActivePPPoEConnections(true) ?? [];
            foreach ($activeConnections as $conn) {
                $u = strtolower(trim((string) ($conn['name'] ?? $conn['user'] ?? '')));
                if ($u !== '') {
                    $activeMap[$u] = true;
                }
            }
        } catch (\Throwable $e) {
            Log::error('AreaOutageMonitorService: Gagal mengambil sesi PPPoE aktif: ' . $e->getMessage());
            return [
                'status' => 'error',
                'message' => 'Gagal terkoneksi ke MikroTik: ' . $e->getMessage(),
                'areas' => [],
                'incidents' => [],
            ];
        }

        // 3. Ambil seluruh pelanggan aktif (bukan isolir) yang memiliki pppoe_username
        $customers = Customer::query()
            ->where('is_active', true)
            ->where('is_service_isolated', false)
            ->whereNotNull('pppoe_username')
            ->where('pppoe_username', '!=', '')
            ->get(['id', 'name', 'phone', 'pppoe_username', 'odp', 'address']);

        // 4. Kelompokkan pelanggan berdasarkan kode area
        $areas = [];
        foreach ($customers as $c) {
            $code = self::extractAreaCode($c->pppoe_username);
            if (!$code) {
                continue;
            }

            if (!isset($areas[$code])) {
                $areas[$code] = [
                    'area_code' => $code,
                    'total' => 0,
                    'active_count' => 0,
                    'inactive_count' => 0,
                    'active_customers' => [],
                    'inactive_customers' => [],
                ];
            }

            $uname = strtolower(trim($c->pppoe_username));
            $isOnline = isset($activeMap[$uname]);

            $customerData = [
                'id' => $c->id,
                'name' => $c->name,
                'phone' => $c->phone,
                'pppoe_username' => $c->pppoe_username,
                'odp' => $c->odp,
                'address' => $c->address,
                'is_online' => $isOnline,
            ];

            $areas[$code]['total']++;
            if ($isOnline) {
                $areas[$code]['active_count']++;
                $areas[$code]['active_customers'][] = $customerData;
            } else {
                $areas[$code]['inactive_count']++;
                $areas[$code]['inactive_customers'][] = $customerData;
            }
        }

        $thresholdPercent = $settings['threshold_percent'];
        $minCustomers = $settings['min_customers'];
        $cooldownMinutes = $settings['cooldown_minutes'];
        $targetGroupId = $settings['target_group_id'];

        $alertedIncidents = [];
        $outageAreas = [];

        foreach ($areas as $code => $data) {
            $total = $data['total'];
            $inactiveCount = $data['inactive_count'];
            $activeCount = $data['active_count'];

            if ($total < $minCustomers) {
                continue;
            }

            $inactiveRatio = $inactiveCount / $total;
            $inactivePercent = round($inactiveRatio * 100, 1);

            $data['inactive_percent'] = $inactivePercent;
            $data['is_outage'] = $inactivePercent >= $thresholdPercent;

            if ($data['is_outage']) {
                $outageAreas[$code] = $data;

                // Cek cooldown
                $recentIncident = AreaOutageIncident::query()
                    ->where('area_code', $code)
                    ->where('alerted_at', '>=', now()->subMinutes($cooldownMinutes))
                    ->first();

                if (!$recentIncident || $forceAlert) {
                    $token = Str::random(32);
                    $now = now();

                    /** @var AreaOutageIncident $incident */
                    $incident = AreaOutageIncident::create([
                        'token' => $token,
                        'area_code' => $code,
                        'total_customers' => $total,
                        'active_customers_count' => $activeCount,
                        'inactive_customers_count' => $inactiveCount,
                        'inactive_customers_data' => $data['inactive_customers'],
                        'status' => 'detected',
                        'target_group_id' => $targetGroupId,
                        'alerted_at' => $now,
                    ]);

                    // Format pesan WhatsApp
                    $actionUrl = $incident->action_url;
                    $message = $this->buildWhatsAppAlertMessage($code, $total, $activeCount, $inactiveCount, $inactivePercent, $now, $actionUrl);

                    // Kirim ke grup WhatsApp jika target grup telah disetel
                    if ($targetGroupId) {
                        $this->sendToWhatsAppGroup($targetGroupId, $message, $incident);
                    }

                    $incident->alert_message_sent = $message;
                    $incident->save();

                    $alertedIncidents[] = $incident;
                }
            }
        }

        return [
            'status' => 'success',
            'scanned_at' => now()->toIso8601String(),
            'total_customers_checked' => $customers->count(),
            'total_areas' => count($areas),
            'outage_areas_count' => count($outageAreas),
            'new_incidents_created' => count($alertedIncidents),
            'incidents' => $alertedIncidents,
            'areas' => array_values($areas),
        ];
    }

    /**
     * Susun teks pesan alert untuk grup WhatsApp.
     */
    private function buildWhatsAppAlertMessage(
        string $areaCode,
        int $total,
        int $activeCount,
        int $inactiveCount,
        float $inactivePercent,
        Carbon $time,
        string $actionUrl
    ): string {
        $formattedTime = $time->translatedFormat('d M Y, H:i') . ' WIB';

        return "⚠️ *PERINGATAN GANGGUAN AREA MASSAL* ⚠️\n\n"
            . "Ditemukan indikasi gangguan koneksi pada area pelanggan:\n"
            . "📍 *Area / Dusun:* {$areaCode}\n"
            . "👥 *Total Pelanggan:* {$total} Pelanggan\n"
            . "🔴 *Nonaktif (Offline):* {$inactiveCount} Pelanggan ({$inactivePercent}%)\n"
            . "🟢 *Aktif (Online):* {$activeCount} Pelanggan\n"
            . "⏰ *Waktu Deteksi:* {$formattedTime}\n\n"
            . "Silakan tentukan tindakan melalui link berikut:\n"
            . "👉 {$actionUrl}";
    }

    /**
     * Kirim pesan ke grup WhatsApp via gateway.
     */
    private function sendToWhatsAppGroup(string $groupId, string $message, AreaOutageIncident $incident): bool
    {
        $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');

        try {
            $response = Http::timeout(30)->post($gatewayUrl . '/send', [
                'phone' => $groupId,
                'message' => $message,
            ]);

            $json = $response->json();
            $success = $json['success'] ?? false;

            NotificationLog::create([
                'customer_id' => null,
                'phone' => $groupId,
                'message' => $message,
                'notice_id' => null,
                'status' => $success ? 'sent' : 'failed',
                'error' => $success ? null : ($json['error'] ?? 'Gagal kirim ke grup WA'),
                'sent_at' => now(),
            ]);

            return $success;
        } catch (\Throwable $e) {
            Log::error("AreaOutageMonitorService: Gagal kirim WA ke grup {$groupId}: " . $e->getMessage());

            NotificationLog::create([
                'customer_id' => null,
                'phone' => $groupId,
                'message' => $message,
                'notice_id' => null,
                'status' => 'failed',
                'error' => 'Gateway timeout/error: ' . $e->getMessage(),
                'sent_at' => now(),
            ]);

            return false;
        }
    }

    /**
     * Ambil data insiden berdasarkan token.
     */
    public function getIncidentByToken(string $token): ?AreaOutageIncident
    {
        $this->ensureTableExists();

        return AreaOutageIncident::with('networkNotice')
            ->where('token', $token)
            ->first();
    }

    /**
     * Pilihan 1: Tandai Gangguan (Pemadaman Listrik / Maintenance Jaringan).
     */
    public function markIncidentNotice(AreaOutageIncident $incident, string $type, ?string $notes = null, ?User $user = null): NetworkNotice
    {
        $typeLabel = match ($type) {
            'pemadaman_listrik' => 'Pemadaman Listrik',
            'maintenance_jaringan' => 'Maintenance Jaringan',
            default => 'Gangguan Massal',
        };

        $noticeType = $type === 'maintenance_jaringan' ? 'maintenance' : 'gangguan';
        $noticeTitle = "Gangguan Area {$incident->area_code}: {$typeLabel}";
        $noticeMessage = $notes && trim($notes) !== ''
            ? trim($notes)
            : "Saat ini sedang terjadi {$typeLabel} pada area {$incident->area_code} yang berdampak pada {$incident->inactive_customers_count} pelanggan. Tim teknisi sedang memantau kondisi jaringan.";

        // Buat atau update NetworkNotice
        if ($incident->network_notice_id && $incident->networkNotice) {
            $notice = $incident->networkNotice;
            $notice->update([
                'title' => $noticeTitle,
                'message' => $noticeMessage,
                'type' => $noticeType,
                'severity' => 'high',
                'is_mass' => true,
                'affected_area' => "Area {$incident->area_code}",
                'is_active' => true,
            ]);
        } else {
            $notice = NetworkNotice::create([
                'title' => $noticeTitle,
                'message' => $noticeMessage,
                'type' => $noticeType,
                'severity' => 'high',
                'is_mass' => true,
                'affected_area' => "Area {$incident->area_code}",
                'affected_odp' => null,
                'start_time' => now(),
                'end_time' => null,
                'is_active' => true,
                'created_by' => $user?->id,
            ]);
        }

        $incident->update([
            'incident_type' => $type,
            'incident_notes' => $notes,
            'network_notice_id' => $notice->id,
            'status' => 'marked_notice',
            'action_taken_at' => now(),
            'action_taken_by' => $user?->id,
        ]);

        return $notice;
    }

    /**
     * Pilihan 2: Kirim Pesan Gangguan ke Pelanggan yang Tidak Aktif.
     */
    public function notifyInactiveCustomers(
        AreaOutageIncident $incident,
        string $messageTemplate,
        ?array $selectedCustomerIds = null
    ): array {
        $inactiveCustomers = $incident->inactive_customers_data ?? [];
        if (!is_array($inactiveCustomers) || count($inactiveCustomers) === 0) {
            return [
                'success' => false,
                'message' => 'Tidak ada data pelanggan nonaktif pada insiden ini.',
                'sent_count' => 0,
                'failed_count' => 0,
            ];
        }

        // Filter pelanggan yang dipilih jika ada
        if ($selectedCustomerIds !== null && count($selectedCustomerIds) > 0) {
            $idMap = array_flip($selectedCustomerIds);
            $targets = array_filter($inactiveCustomers, fn($c) => isset($idMap[$c['id'] ?? null]));
        } else {
            $targets = $inactiveCustomers;
        }

        $recipients = [];
        foreach ($targets as $cust) {
            $phone = $cust['phone'] ?? '';
            if ($phone && $phone !== '0') {
                $recipients[] = [
                    'id' => $cust['id'],
                    'name' => $cust['name'] ?? 'Pelanggan',
                    'phone' => $phone,
                ];
            }
        }

        if (count($recipients) === 0) {
            return [
                'success' => false,
                'message' => 'Tidak ada nomor telepon valid pada pelanggan yang dipilih.',
                'sent_count' => 0,
                'failed_count' => 0,
            ];
        }

        $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
        $sentCount = 0;
        $failedCount = 0;

        try {
            $response = Http::timeout(120)->post($gatewayUrl . '/send-bulk', [
                'recipients' => $recipients,
                'message' => $messageTemplate,
                'delay' => 1500,
            ]);

            $json = $response->json();
            $results = $json['results'] ?? [];

            foreach ($results as $res) {
                $isOk = $res['success'] ?? false;
                if ($isOk) {
                    $sentCount++;
                } else {
                    $failedCount++;
                }

                NotificationLog::create([
                    'customer_id' => null,
                    'phone' => $res['phone'] ?? '',
                    'message' => $messageTemplate,
                    'notice_id' => $incident->network_notice_id,
                    'status' => $isOk ? 'sent' : 'failed',
                    'error' => $res['error'] ?? null,
                    'sent_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::error('AreaOutageMonitorService: Gagal kirim notifikasi broadcast: ' . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Gagal menghubungi WhatsApp Gateway: ' . $e->getMessage(),
                'sent_count' => 0,
                'failed_count' => count($recipients),
            ];
        }

        $incident->update([
            'status' => 'notified_customers',
            'action_taken_at' => now(),
        ]);

        return [
            'success' => true,
            'message' => "Pesan berhasil diproses ke {$sentCount} pelanggan (" . ($failedCount > 0 ? "{$failedCount} gagal" : "semua sukses") . ").",
            'sent_count' => $sentCount,
            'failed_count' => $failedCount,
        ];
    }
}
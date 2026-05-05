<?php

namespace App\Console\Commands;

use App\Models\MasterMikrotik;
use App\Models\NotificationLog;
use App\Services\MikroTikService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

class MikroTikHealthCheckCommand extends Command
{
    protected $signature = 'mikrotik:health-check';

    protected $description = 'Check active MikroTik server health and notify WA recipients on status change.';

    public function handle(): int
    {
        if (!Schema::hasTable('master_mikrotiks')) {
            $this->info('master_mikrotiks table not found. Skipping health-check.');
            return self::SUCCESS;
        }

        /** @var MasterMikrotik|null $router */
        $router = MasterMikrotik::query()->where('is_active', true)->first();

        if (!$router) {
            $this->info('No active MikroTik router configured.');
            return self::SUCCESS;
        }

        $previousStatus = $router->last_status ?: 'unknown';
        $currentStatus = 'up';
        $errorMessage = null;

        try {
            $mikrotik = new MikroTikService(
                $router->host,
                $router->username,
                $router->password_encrypted,
                $router->port,
                5
            );

            $identity = $mikrotik->getIdentity();
            if (!$identity || $identity === 'Unknown') {
                $mikrotik->getSystemResources();
            }
        } catch (\Throwable $e) {
            $currentStatus = 'down';
            $errorMessage = $e->getMessage();
        }

        $statusChanged = $previousStatus !== $currentStatus;
        $shouldAlert = $statusChanged && ($previousStatus !== 'unknown' || $currentStatus === 'down');

        $router->last_status = $currentStatus;
        $router->last_checked_at = now();

        if ($shouldAlert) {
            $this->sendStatusAlert($router, $previousStatus, $currentStatus, $errorMessage);
            $router->last_alerted_at = now();
        }

        $router->save();

        $this->info(sprintf(
            'Health-check [%s:%s] %s -> %s%s',
            $router->host,
            $router->port,
            $previousStatus,
            $currentStatus,
            $errorMessage ? (' (' . $errorMessage . ')') : ''
        ));

        return self::SUCCESS;
    }

    private function sendStatusAlert(MasterMikrotik $router, string $previousStatus, string $currentStatus, ?string $errorMessage): void
    {
        $recipients = $this->parseRecipients($router->alert_recipients);

        $message = $this->buildAlertMessage($router, $currentStatus, $errorMessage);

        if (count($recipients) === 0) {
            NotificationLog::create([
                'customer_id' => null,
                'phone' => null,
                'message' => $message,
                'notice_id' => null,
                'status' => 'skipped',
                'error' => 'Tidak ada penerima alert pada master mikrotik aktif.',
                'meta' => [
                    'type' => 'mikrotik_status_alert',
                    'router_id' => $router->id,
                    'previous_status' => $previousStatus,
                    'current_status' => $currentStatus,
                ],
                'sent_at' => now(),
            ]);
            return;
        }

        $payloadRecipients = collect($recipients)
            ->map(fn ($phone) => ['phone' => $phone, 'name' => 'Tim Monitoring'])
            ->values()
            ->all();

        try {
            $response = Http::timeout(60)->post(rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/') . '/send-bulk', [
                'recipients' => $payloadRecipients,
                'message' => $message,
                'delay' => 1000,
            ]);

            $gateway = $response->json();
            $results = is_array($gateway['results'] ?? null) ? $gateway['results'] : [];

            if (count($results) === 0) {
                foreach ($recipients as $phone) {
                    NotificationLog::create([
                        'customer_id' => null,
                        'phone' => $phone,
                        'message' => $message,
                        'notice_id' => null,
                        'status' => $response->successful() ? 'sent' : 'failed',
                        'error' => $response->successful() ? null : ($gateway['error'] ?? 'Gateway response invalid'),
                        'meta' => [
                            'type' => 'mikrotik_status_alert',
                            'router_id' => $router->id,
                            'previous_status' => $previousStatus,
                            'current_status' => $currentStatus,
                        ],
                        'sent_at' => now(),
                    ]);
                }

                return;
            }

            foreach ($results as $item) {
                NotificationLog::create([
                    'customer_id' => null,
                    'phone' => $item['phone'] ?? null,
                    'message' => $message,
                    'notice_id' => null,
                    'status' => ($item['success'] ?? false) ? 'sent' : 'failed',
                    'error' => $item['error'] ?? null,
                    'meta' => [
                        'type' => 'mikrotik_status_alert',
                        'router_id' => $router->id,
                        'previous_status' => $previousStatus,
                        'current_status' => $currentStatus,
                    ],
                    'sent_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            foreach ($recipients as $phone) {
                NotificationLog::create([
                    'customer_id' => null,
                    'phone' => $phone,
                    'message' => $message,
                    'notice_id' => null,
                    'status' => 'failed',
                    'error' => 'Gateway error: ' . $e->getMessage(),
                    'meta' => [
                        'type' => 'mikrotik_status_alert',
                        'router_id' => $router->id,
                        'previous_status' => $previousStatus,
                        'current_status' => $currentStatus,
                    ],
                    'sent_at' => now(),
                ]);
            }
        }
    }

    /**
     * @return array<int, string>
     */
    private function parseRecipients(?string $value): array
    {
        if (!$value) {
            return [];
        }

        $parts = preg_split('/[\s,;]+/', trim($value)) ?: [];

        return collect($parts)
            ->map(fn ($item) => trim((string) $item))
            ->filter(fn ($item) => $item !== '')
            ->unique()
            ->values()
            ->all();
    }

    private function buildAlertMessage(MasterMikrotik $router, string $currentStatus, ?string $errorMessage): string
    {
        $statusLabel = $currentStatus === 'down' ? 'DOWN' : 'UP';
        $headline = $currentStatus === 'down'
            ? 'ALERT MikroTik OFFLINE'
            : 'RECOVERY MikroTik ONLINE';

        $message = "[{$headline}]\n";
        $message .= 'Router: ' . $router->name . "\n";
        $message .= 'Host: ' . $router->host . ':' . $router->port . "\n";
        $message .= 'Status: ' . $statusLabel . "\n";
        $message .= 'Waktu: ' . now()->timezone('Asia/Jakarta')->format('d-m-Y H:i:s') . ' WIB';

        if ($errorMessage && $currentStatus === 'down') {
            $message .= "\nError: " . $errorMessage;
        }

        $message .= "\n\nPesan otomatis sistem monitoring.";

        return $message;
    }
}

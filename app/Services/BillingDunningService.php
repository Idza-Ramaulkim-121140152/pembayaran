<?php

namespace App\Services;

use App\Models\BillingDunningConfig;
use App\Models\BillingDunningLog;
use App\Models\Invoice;
use App\Models\NotificationLog;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;

class BillingDunningService
{
    private const WAVE_MAP = [
        7 => 'h_minus_7',
        3 => 'h_minus_3',
        1 => 'h_minus_1',
        -1 => 'h_plus_1',
        -3 => 'h_plus_3',
    ];

    public function __construct(
        private AuditLogService $auditLogService,
    ) {
    }

    public function getConfig(): BillingDunningConfig
    {
        return BillingDunningConfig::query()->firstOrCreate(
            ['id' => 1],
            $this->defaultConfigAttributes()
        );
    }

    public function updateConfig(array $payload, ?int $actorId = null): BillingDunningConfig
    {
        $config = $this->getConfig();
        $config->fill($payload);
        $config->save();

        $this->auditLogService->log('billing.dunning.config_updated', $config, [
            'payload' => $payload,
        ], $actorId);

        return $config;
    }

    public function run(?string $forcedDate = null, bool $force = false, ?int $actorId = null): array
    {
        $config = $this->getConfig();
        $timezone = (string) ($config->timezone ?: 'Asia/Jakarta');
        $now = Carbon::now($timezone);
        $today = $forcedDate
            ? Carbon::parse($forcedDate, $timezone)->startOfDay()
            : $now->copy()->startOfDay();

        if (!$force && !$config->is_active) {
            return [
                'status' => 'skipped',
                'reason' => 'config_inactive',
                'date' => $today->toDateString(),
            ];
        }

        if (!$force && !$this->isWithinSendWindow($now, (string) $config->send_time)) {
            return [
                'status' => 'skipped',
                'reason' => 'outside_send_window',
                'date' => $today->toDateString(),
                'current_time' => $now->format('H:i'),
                'expected_time' => Carbon::parse((string) $config->send_time)->format('H:i'),
            ];
        }

        $summary = [
            'status' => 'ok',
            'date' => $today->toDateString(),
            'processed' => 0,
            'sent' => 0,
            'failed' => 0,
            'skipped' => 0,
            'no_wave' => 0,
            'retry_exhausted' => 0,
            'duplicate_sent' => 0,
        ];

        $rows = $this->queryTargetInvoices();
        foreach ($rows as $invoice) {
            $summary['processed']++;

            $wave = $this->resolveWave($today, Carbon::parse($invoice->due_date)->startOfDay());
            if ($wave === null) {
                $summary['no_wave']++;
                continue;
            }

            $result = $this->processInvoiceForWave($invoice, $wave, $today, $config, $actorId);
            if (isset($summary[$result])) {
                $summary[$result]++;
            }
        }

        $this->auditLogService->log('billing.dunning.run', null, [
            'force' => $force,
            'summary' => $summary,
        ], $actorId);

        return $summary;
    }

    public function logs(array $filters = [], int $perPage = 50)
    {
        $query = BillingDunningLog::query()
            ->with([
                'invoice:id,customer_id,invoice_link,status,due_date,amount',
                'customer:id,name,phone,pppoe_username',
            ])
            ->orderByDesc('id');

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (!empty($filters['wave'])) {
            $query->where('wave', $filters['wave']);
        }

        if (!empty($filters['from_date'])) {
            $query->whereDate('scheduled_date', '>=', $filters['from_date']);
        }

        if (!empty($filters['to_date'])) {
            $query->whereDate('scheduled_date', '<=', $filters['to_date']);
        }

        return $query->paginate($perPage);
    }

    private function processInvoiceForWave(Invoice $invoice, string $wave, Carbon $today, BillingDunningConfig $config, ?int $actorId = null): string
    {
        $log = BillingDunningLog::query()->firstOrNew([
            'invoice_id' => $invoice->id,
            'wave' => $wave,
            'scheduled_date' => $today->toDateString(),
        ]);

        $log->customer_id = $invoice->customer_id;

        if ($log->exists && $log->status === 'sent') {
            return 'duplicate_sent';
        }

        $attemptCount = (int) ($log->attempt_count ?? 0);
        $maxRetry = max(0, (int) $config->max_retry);
        if ($attemptCount >= $maxRetry && $log->exists) {
            return 'retry_exhausted';
        }

        $phone = trim((string) ($invoice->customer?->phone ?? ''));
        $message = $this->buildMessage($wave, $invoice, $config);
        $log->message = $message;
        $log->meta = [
            'customer_phone' => $phone,
            'invoice_status' => $invoice->status,
            'due_date' => (string) $invoice->due_date,
        ];

        if (!$this->isValidPhone($phone)) {
            $log->status = 'skipped';
            $log->last_error = 'no_valid_whatsapp';
            $log->save();
            $this->logNotification($invoice, $phone, $message, 'skipped', 'no_valid_whatsapp', $wave);
            return 'skipped';
        }

        $attemptCount++;
        [$success, $error] = $this->sendWhatsApp($phone, $message);
        $log->attempt_count = $attemptCount;
        $log->status = $success ? 'sent' : 'failed';
        $log->last_error = $success ? null : $error;
        $log->sent_at = $success ? now() : null;
        $log->save();

        $this->logNotification(
            $invoice,
            $phone,
            $message,
            $success ? 'sent' : 'failed',
            $error,
            $wave
        );

        if ($success) {
            $this->auditLogService->log('billing.dunning.sent', $invoice, [
                'wave' => $wave,
                'phone' => $phone,
            ], $actorId);
            return 'sent';
        }

        return 'failed';
    }

    private function queryTargetInvoices(): Collection
    {
        return Invoice::query()
            ->with('customer:id,name,phone,pppoe_username')
            ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
            ->whereNotNull('due_date')
            ->orderBy('due_date')
            ->get();
    }

    private function resolveWave(Carbon $today, Carbon $dueDate): ?string
    {
        $offset = $today->diffInDays($dueDate, false);
        return self::WAVE_MAP[$offset] ?? null;
    }

    private function buildMessage(string $wave, Invoice $invoice, BillingDunningConfig $config): string
    {
        $templateByWave = [
            'h_minus_7' => $config->template_h_minus_7,
            'h_minus_3' => $config->template_h_minus_3,
            'h_minus_1' => $config->template_h_minus_1,
            'h_plus_1' => $config->template_h_plus_1,
            'h_plus_3' => $config->template_h_plus_3,
        ];

        $defaultTemplate = $this->defaultTemplate($wave);
        $template = trim((string) ($templateByWave[$wave] ?? '')) ?: $defaultTemplate;

        $customerName = trim((string) ($invoice->customer?->name ?? 'Pelanggan'));
        $invoiceUrl = url('/invoice/' . $invoice->invoice_link);

        return str_replace(
            ['{customer_name}', '{amount}', '{due_date}', '{invoice_url}', '{wave}'],
            [
                $customerName,
                'Rp ' . number_format((float) $invoice->amount, 0, ',', '.'),
                Carbon::parse($invoice->due_date)->format('d/m/Y'),
                $invoiceUrl,
                strtoupper(str_replace('_', '-', $wave)),
            ],
            $template
        );
    }

    private function defaultTemplate(string $wave): string
    {
        return "Yth. {customer_name}, pengingat tagihan internet Anda ({wave}).\n"
            . "Nominal: {amount}\n"
            . "Jatuh tempo: {due_date}\n"
            . "Link invoice: {invoice_url}\n"
            . "Terima kasih.";
    }

    private function logNotification(Invoice $invoice, string $phone, string $message, string $status, ?string $error, string $wave): void
    {
        NotificationLog::query()->create([
            'customer_id' => $invoice->customer_id,
            'phone' => $phone,
            'message' => mb_substr($message, 0, 2000),
            'status' => $status,
            'error' => $error,
            'sent_at' => $status === 'sent' ? now() : null,
            'meta' => [
                'type' => 'billing_dunning',
                'wave' => $wave,
                'invoice_id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
            ],
        ]);
    }

    private function sendWhatsApp(string $phone, string $message): array
    {
        try {
            $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
            $response = Http::timeout(30)->post($gatewayUrl . '/send', [
                'phone' => $phone,
                'message' => $message,
            ]);

            if ($response->successful()) {
                $payload = $response->json();
                $success = (bool) ($payload['success'] ?? true);
                if ($success) {
                    return [true, null];
                }

                return [false, (string) ($payload['message'] ?? 'gateway_rejected')];
            }

            return [false, 'gateway_http_' . $response->status()];
        } catch (\Throwable $e) {
            return [false, $e->getMessage()];
        }
    }

    private function isValidPhone(?string $phone): bool
    {
        $normalized = preg_replace('/\D+/', '', (string) $phone);
        return is_string($normalized) && strlen($normalized) >= 10;
    }

    private function isWithinSendWindow(Carbon $now, string $configuredTime): bool
    {
        $configured = Carbon::parse($configuredTime, $now->getTimezone())->format('H:i');
        return $now->format('H:i') === $configured;
    }

    private function defaultConfigAttributes(): array
    {
        return [
            'is_active' => true,
            'timezone' => 'Asia/Jakarta',
            'send_time' => '08:00:00',
            'max_retry' => 2,
            'template_h_minus_7' => $this->defaultTemplate('h_minus_7'),
            'template_h_minus_3' => $this->defaultTemplate('h_minus_3'),
            'template_h_minus_1' => $this->defaultTemplate('h_minus_1'),
            'template_h_plus_1' => $this->defaultTemplate('h_plus_1'),
            'template_h_plus_3' => $this->defaultTemplate('h_plus_3'),
            'meta' => null,
        ];
    }
}


<?php

namespace App\Services;

use App\Models\BillingDunningConfig;
use App\Models\BillingDunningLog;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\NotificationLog;
use App\Services\MikroTikService;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

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
        private BillingMessageTemplateService $billingMessageTemplateService,
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
            'skipped_auto_disabled' => 0,
            'auto_invoice_created' => 0,
            'auto_invoice_skipped_no_wa' => 0,
            'auto_invoice_skipped_auto_disabled' => 0,
            'auto_isolated' => 0,
            'auto_isolate_skipped_no_wa' => 0,
            'auto_isolate_skipped_auto_disabled' => 0,
            'auto_isolate_already_isolated' => 0,
            'wa_sent' => 0,
            'wa_failed' => 0,
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

        $this->runAutoInvoiceHMinus3($today, $summary);
        $this->runAutoIsolationHPlus3($today, $summary);

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

        if ((bool) ($invoice->customer?->billing_auto_disabled ?? false)) {
            $log->status = 'skipped';
            $log->last_error = 'auto_disabled_by_superadmin';
            $log->message = $this->billingMessageTemplateService->appendAutoLabel('skip');
            $log->meta = [
                'reason' => 'auto_disabled_by_superadmin',
            ];
            $log->save();
            return 'skipped_auto_disabled';
        }

        if ($log->exists && $log->status === 'sent') {
            return 'duplicate_sent';
        }

        $attemptCount = (int) ($log->attempt_count ?? 0);
        $maxRetry = max(0, (int) $config->max_retry);
        if ($attemptCount >= $maxRetry && $log->exists) {
            return 'retry_exhausted';
        }

        $phone = trim((string) ($invoice->customer?->phone ?? ''));
        $message = $this->applyAutoLabel($this->buildMessage($wave, $invoice, $config));
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
            $this->logNotification($invoice, $phone, $message, 'skipped', 'no_valid_whatsapp', $wave, 'billing_dunning');
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
            $wave,
            'billing_dunning'
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
            ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled')
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

        $message = str_replace(
            ['{customer_name}', '{pppoe_username}', '{amount}', '{due_date}', '{invoice_url}', '{wave}'],
            [
                $customerName,
                trim((string) ($invoice->customer?->pppoe_username ?? '')) ?: '-',
                'Rp ' . number_format((float) $invoice->amount, 0, ',', '.'),
                Carbon::parse($invoice->due_date)->format('d/m/Y'),
                $invoiceUrl,
                $this->billingMessageTemplateService->waveToHumanLabel($wave),
            ],
            $template
        );

        return $this->billingMessageTemplateService->normalizeLegacyRelativeDayTerms($message);
    }

    private function defaultTemplate(string $wave): string
    {
        return "Yth. Bapak/Ibu {customer_name}\n"
            . "Username PPPoE: {pppoe_username}\n\n"
            . "Terima kasih telah menjadi bagian dari pelanggan prioritas kami.\n"
            . "Layanan internet anda aktif sampai {due_date}.\n\n"
            . "Nominal tagihan: {amount}\n"
            . "> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:\n"
            . "{invoice_url}\n\n"
            . "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis.\n\n"
            . "Layanan Call Center 085158025553\n\n"
            . "Salam Hangat,\n"
            . "Tim Layanan Pelanggan Rumah Kita Net";
    }

    private function logNotification(Invoice $invoice, string $phone, string $message, string $status, ?string $error, string $wave, string $type = 'billing_dunning'): void
    {
        NotificationLog::query()->create([
            'customer_id' => $invoice->customer_id,
            'phone' => $phone,
            'message' => mb_substr($message, 0, 2000),
            'status' => $status,
            'error' => $error,
            'sent_at' => $status === 'sent' ? now() : null,
            'meta' => [
                'type' => $type,
                'wave' => $wave,
                'invoice_id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
                'is_auto' => true,
                'channel' => 'whatsapp',
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

    private function applyAutoLabel(string $message): string
    {
        return $this->billingMessageTemplateService->appendAutoLabel(
            $this->billingMessageTemplateService->normalizeLegacyRelativeDayTerms($message)
        );
    }

    private function runAutoInvoiceHMinus3(Carbon $today, array &$summary): void
    {
        $dueDate = $today->copy()->addDays(3)->toDateString();

        $customers = Customer::query()
            ->whereDate('due_date', $dueDate)
            ->get(['id', 'name', 'phone', 'pppoe_username', 'due_date', 'package_type', 'custom_package', 'package_id', 'billing_auto_disabled']);

        if ($customers->isEmpty()) {
            return;
        }

        $packageById = Package::query()->where('is_active', true)->get(['id', 'name', 'price'])->keyBy('id');
        $packageByName = [];
        foreach ($packageById as $package) {
            $name = strtolower(trim((string) $package->name));
            if ($name !== '') {
                $packageByName[$name] = $package;
            }
        }

        foreach ($customers as $customer) {
            if ((bool) ($customer->billing_auto_disabled ?? false)) {
                $summary['auto_invoice_skipped_auto_disabled']++;
                continue;
            }

            $phone = trim((string) $customer->phone);
            if (!$this->isValidPhone($phone)) {
                $summary['auto_invoice_skipped_no_wa']++;
                continue;
            }

            $package = null;
            if (!empty($customer->package_id) && isset($packageById[(int) $customer->package_id])) {
                $package = $packageById[(int) $customer->package_id];
            } else {
                $serviceLabel = strtolower(trim((string) ($customer->package_type ?: $customer->custom_package)));
                if ($serviceLabel !== '' && isset($packageByName[$serviceLabel])) {
                    $package = $packageByName[$serviceLabel];
                }
            }

            if (!$package || (float) $package->price <= 0) {
                continue;
            }

            $invoice = null;
            $created = false;
            try {
                DB::transaction(function () use ($customer, $package, &$invoice, &$created) {
                    $openInvoice = Invoice::query()
                        ->where('customer_id', $customer->id)
                        ->whereNotIn('status', ['paid', 'cancelled'])
                        ->lockForUpdate()
                        ->first();

                    if ($openInvoice) {
                        $invoice = $openInvoice;
                        return;
                    }

                    $invoice = Invoice::create([
                        'customer_id' => $customer->id,
                        'invoice_date' => now(),
                        'due_date' => $customer->due_date ?? now()->addDays(3)->toDateString(),
                        'amount' => (float) $package->price,
                        'status' => 'unpaid',
                        'invoice_link' => uniqid('inv_'),
                    ]);
                    $created = true;
                });
            } catch (\Throwable $e) {
                Log::warning('Auto invoice 3 hari sebelum jatuh tempo failed', [
                    'customer_id' => $customer->id,
                    'error' => $e->getMessage(),
                ]);
                continue;
            }

            if (!$created || !$invoice) {
                continue;
            }

            $summary['auto_invoice_created']++;
            $message = $this->billingMessageTemplateService->buildBillingReminderMessage(
                $customer,
                url('/invoice/' . $invoice->invoice_link),
                (float) $invoice->amount,
                Carbon::parse((string) $customer->due_date)->format('d/m/Y'),
                true
            );

            [$sent, $error] = $this->sendWhatsApp($phone, $message);
            if ($sent) {
                $summary['wa_sent']++;
            } else {
                $summary['wa_failed']++;
            }

            NotificationLog::query()->create([
                'customer_id' => $customer->id,
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'status' => $sent ? 'sent' : 'failed',
                'error' => $error,
                'sent_at' => $sent ? now() : null,
                'meta' => [
                    'type' => 'billing_auto_invoice',
                    'invoice_id' => $invoice->id,
                    'invoice_link' => $invoice->invoice_link,
                    'wave' => 'h_minus_3',
                    'is_auto' => true,
                    'channel' => 'whatsapp',
                ],
            ]);
        }
    }

    private function runAutoIsolationHPlus3(Carbon $today, array &$summary): void
    {
        $cutoffDate = $today->copy()->subDays(3)->toDateString();
        $customers = Customer::query()
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', $cutoffDate)
            ->whereNotNull('pppoe_username')
            ->get(['id', 'name', 'phone', 'pppoe_username', 'due_date', 'billing_auto_disabled']);

        if ($customers->isEmpty()) {
            return;
        }

        $mikrotik = new MikroTikService();
        foreach ($customers as $customer) {
            if ((bool) ($customer->billing_auto_disabled ?? false)) {
                $summary['auto_isolate_skipped_auto_disabled']++;
                continue;
            }

            $phone = trim((string) $customer->phone);
            if (!$this->isValidPhone($phone)) {
                $summary['auto_isolate_skipped_no_wa']++;
                continue;
            }

            $openInvoice = Invoice::query()
                ->where('customer_id', $customer->id)
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->orderByDesc('id')
                ->first();

            if (!$openInvoice) {
                continue;
            }

            try {
                $secret = $mikrotik->getPPPoESecret((string) $customer->pppoe_username);
                if (!$secret) {
                    continue;
                }

                $currentProfile = strtolower((string) ($secret['profile'] ?? ''));
                if ($currentProfile === 'isolir') {
                    $summary['auto_isolate_already_isolated']++;
                    continue;
                }

                Customer::query()->whereKey($customer->id)->update([
                    'mikrotik_profile' => (string) ($secret['profile'] ?? ''),
                ]);

                $mikrotik->isolateUser((string) $customer->pppoe_username);
                $summary['auto_isolated']++;

                $message = $this->billingMessageTemplateService->buildIsolationMessage(true);

                [$sent, $error] = $this->sendWhatsApp($phone, $message);
                if ($sent) {
                    $summary['wa_sent']++;
                } else {
                    $summary['wa_failed']++;
                }

                NotificationLog::query()->create([
                    'customer_id' => $customer->id,
                    'phone' => $phone,
                    'message' => mb_substr($message, 0, 2000),
                    'status' => $sent ? 'sent' : 'failed',
                    'error' => $error,
                    'sent_at' => $sent ? now() : null,
                    'meta' => [
                        'type' => 'billing_auto_isolation',
                        'wave' => 'h_plus_3',
                        'pppoe_username' => $customer->pppoe_username,
                        'is_auto' => true,
                        'channel' => 'whatsapp',
                    ],
                ]);
            } catch (\Throwable $e) {
                Log::warning('Auto isolation terlambat 3 hari failed', [
                    'customer_id' => $customer->id,
                    'username' => $customer->pppoe_username,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}

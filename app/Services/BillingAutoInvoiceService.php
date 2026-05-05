<?php

namespace App\Services;

use App\Models\BillingAutoInvoiceJob;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\Package;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BillingAutoInvoiceService
{
    private const ALMOST_LATE_DAYS = 5;
    private const CUSTOMER_CHUNK_SIZE = 50;
    private const WA_RETRY_COUNT = 2;

    /**
     * @throws \Throwable
     */
    public function process(BillingAutoInvoiceJob $job): void
    {
        $job->refresh();
        if (in_array($job->state, ['completed', 'failed'], true)) {
            return;
        }

        $segment = (string) $job->segment;
        $customerIds = collect($job->customer_ids ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        $summary = $this->defaultSummary(0);
        $results = [];
        $invalidServices = [];
        $resultsByCustomer = [];
        $waValidCustomers = [];

        $this->updateJob($job, [
            'state' => 'processing',
            'phase' => 'verify_wa',
            'summary' => $summary,
            'results' => $results,
            'invalid_services' => $invalidServices,
            'error_message' => null,
            'started_at' => $job->started_at ?: now(),
        ]);

        [$today, $almostLateEndDate] = [Carbon::today(), Carbon::today()->addDays(self::ALMOST_LATE_DAYS)];

        $segmentCustomers = collect();
        Customer::query()
            ->whereIn('id', $customerIds)
            ->orderBy('id')
            ->chunk(self::CUSTOMER_CHUNK_SIZE, function ($chunk) use (&$segmentCustomers, $segment, $today, $almostLateEndDate) {
                foreach ($chunk as $customer) {
                    if (!$customer->due_date) {
                        continue;
                    }

                    $dueDate = Carbon::parse($customer->due_date)->startOfDay();
                    $isLate = $dueDate->lt($today);
                    $isAlmostLate = $dueDate->gte($today) && $dueDate->lte($almostLateEndDate);
                    $isValidSegment = $segment === 'late' ? $isLate : $isAlmostLate;

                    if ($isValidSegment) {
                        $segmentCustomers->push($customer);
                    }
                }
            });

        $summary['total'] = $segmentCustomers->count();
        $this->updateJob($job, ['summary' => $summary]);

        foreach ($segmentCustomers as $customer) {
            $summary['processed']++;

            if (!$this->isValidPhone($customer->phone)) {
                $summary['skipped_no_phone']++;
                $this->appendResult($results, $resultsByCustomer, [
                    'customer_id' => $customer->id,
                    'status' => 'skipped',
                    'reason' => 'no_valid_whatsapp',
                ]);
                $this->logBillingNotification(
                    $customer->id,
                    $customer->phone,
                    'Auto invoice skipped karena nomor WhatsApp tidak valid.',
                    'skipped',
                    'no_valid_whatsapp',
                    [
                        'type' => 'billing_auto_invoice',
                        'segment' => $segment,
                        'reason' => 'no_valid_whatsapp',
                        'job_id' => $job->id,
                    ]
                );
                continue;
            }

            $waValidCustomers[] = $customer;
        }

        $summary['verified_wa'] = count($waValidCustomers);

        $this->updateJob($job, [
            'summary' => $summary,
            'results' => $results,
        ]);

        $this->updateJob($job, ['phase' => 'verify_service']);

        $activePackages = Package::query()
            ->where('is_active', true)
            ->get(['id', 'name', 'price', 'mikrotik_profile']);

        $packageByName = [];
        foreach ($activePackages as $package) {
            $normalized = $this->normalizeServiceLabel($package->name);
            if ($normalized === '') {
                continue;
            }
            $packageByName[$normalized] = $package;
        }

        $eligibleCustomers = [];
        foreach ($waValidCustomers as $customer) {
            $serviceLabel = $this->resolveCustomerServiceLabel($customer);
            $normalizedService = $this->normalizeServiceLabel($serviceLabel);
            $matchedPackage = $normalizedService !== '' ? ($packageByName[$normalizedService] ?? null) : null;

            if (!$matchedPackage || (float) $matchedPackage->price <= 0) {
                $summary['skipped_invalid_service']++;
                $row = [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'service_label' => $serviceLabel,
                    'reason' => 'Layanan pelanggan belum terdaftar pada master paket aktif dengan nominal valid.',
                ];
                $invalidServices[] = $row;
                $this->appendResult($results, $resultsByCustomer, [
                    'customer_id' => $customer->id,
                    'status' => 'skipped',
                    'reason' => 'invalid_service',
                ]);
                $this->logBillingNotification(
                    $customer->id,
                    $customer->phone,
                    'Auto invoice skipped karena layanan belum valid.',
                    'skipped',
                    'invalid_service',
                    [
                        'type' => 'billing_auto_invoice',
                        'segment' => $segment,
                        'reason' => 'invalid_service',
                        'job_id' => $job->id,
                    ]
                );
                continue;
            }

            $eligibleCustomers[] = [
                'customer' => $customer,
                'package' => $matchedPackage,
            ];
        }

        $this->updateJob($job, [
            'summary' => $summary,
            'results' => $results,
            'invalid_services' => $invalidServices,
        ]);

        if (!empty($invalidServices)) {
            $this->updateJob($job, [
                'state' => 'completed',
                'phase' => 'done',
                'finished_at' => now(),
                'summary' => $summary,
                'results' => $results,
                'invalid_services' => $invalidServices,
                'error_message' => 'Ditemukan layanan pelanggan yang belum valid. Atur layanan lalu jalankan ulang.',
            ]);
            return;
        }

        $this->updateJob($job, ['phase' => 'create_invoice']);

        $eligibleCustomerIds = collect($eligibleCustomers)
            ->pluck('customer.id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $activeInvoiceMap = [];
        if (!empty($eligibleCustomerIds)) {
            $activeInvoices = Invoice::query()
                ->whereIn('customer_id', $eligibleCustomerIds)
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->orderByDesc('id')
                ->get()
                ->keyBy('customer_id');

            foreach ($activeInvoices as $customerId => $invoice) {
                $activeInvoiceMap[(int) $customerId] = $invoice;
            }
        }

        $waQueue = [];
        $progressCounter = 0;
        foreach ($eligibleCustomers as $entry) {
            /** @var Customer $customer */
            $customer = $entry['customer'];
            /** @var Package $matchedPackage */
            $matchedPackage = $entry['package'];

            if (isset($activeInvoiceMap[(int) $customer->id])) {
                $invoice = $activeInvoiceMap[(int) $customer->id];
                $summary['skipped_existing_open_invoice']++;
                $this->appendResult($results, $resultsByCustomer, [
                    'customer_id' => $customer->id,
                    'status' => 'skipped',
                    'reason' => 'existing_open_invoice',
                    'invoice_id' => $invoice->id,
                    'invoice_link' => url('/invoice/' . $invoice->invoice_link),
                ]);
                $this->logBillingNotification(
                    $customer->id,
                    $customer->phone,
                    'Auto invoice skipped karena pelanggan masih memiliki invoice aktif.',
                    'skipped',
                    'existing_open_invoice',
                    [
                        'type' => 'billing_auto_invoice',
                        'segment' => $segment,
                        'reason' => 'existing_open_invoice',
                        'invoice_id' => $invoice->id,
                        'job_id' => $job->id,
                    ]
                );
                continue;
            }

            try {
                $invoice = null;
                $wasCreated = false;
                DB::transaction(function () use ($customer, $matchedPackage, &$invoice, &$wasCreated) {
                    $existingOpen = Invoice::query()
                        ->where('customer_id', $customer->id)
                        ->whereNotIn('status', ['paid', 'cancelled'])
                        ->lockForUpdate()
                        ->first();

                    if ($existingOpen) {
                        $invoice = $existingOpen;
                        return;
                    }

                    $invoice = Invoice::create([
                        'customer_id' => $customer->id,
                        'invoice_date' => now(),
                        'due_date' => $customer->due_date ?? now()->addDays(7)->toDateString(),
                        'amount' => (float) $matchedPackage->price,
                        'status' => 'unpaid',
                        'invoice_link' => uniqid('inv_'),
                    ]);
                    $wasCreated = true;
                });

                if (!$invoice) {
                    throw new \RuntimeException('Invoice gagal dibuat.');
                }

                if (!$wasCreated) {
                    $summary['skipped_existing_open_invoice']++;
                    $this->appendResult($results, $resultsByCustomer, [
                        'customer_id' => $customer->id,
                        'status' => 'skipped',
                        'reason' => 'existing_open_invoice',
                        'invoice_id' => $invoice->id,
                        'invoice_link' => url('/invoice/' . $invoice->invoice_link),
                    ]);
                    $this->logBillingNotification(
                        $customer->id,
                        $customer->phone,
                        'Auto invoice skipped karena pelanggan masih memiliki invoice aktif.',
                        'skipped',
                        'existing_open_invoice',
                        [
                            'type' => 'billing_auto_invoice',
                            'segment' => $segment,
                            'reason' => 'existing_open_invoice',
                            'invoice_id' => $invoice->id,
                            'job_id' => $job->id,
                        ]
                    );
                    continue;
                }

                $summary['created']++;
                $invoiceUrl = url('/invoice/' . $invoice->invoice_link);
                $template = $this->buildInvoiceMessage($customer, $invoiceUrl, (float) $invoice->amount);
                $waQueue[] = [
                    'customer' => $customer,
                    'invoice_id' => $invoice->id,
                    'invoice_link' => $invoiceUrl,
                    'message' => $template,
                ];

                $this->appendResult($results, $resultsByCustomer, [
                    'customer_id' => $customer->id,
                    'status' => 'success',
                    'reason' => 'invoice_created',
                    'invoice_id' => $invoice->id,
                    'invoice_link' => $invoiceUrl,
                    'wa_status' => 'pending',
                ]);
            } catch (\Throwable $e) {
                $summary['errors_count']++;
                $this->appendResult($results, $resultsByCustomer, [
                    'customer_id' => $customer->id,
                    'status' => 'error',
                    'reason' => 'exception',
                ]);
                Log::error('Auto invoice failed while creating invoice', [
                    'customer_id' => $customer->id,
                    'job_id' => $job->id,
                    'segment' => $segment,
                    'error' => $e->getMessage(),
                ]);
            } finally {
                $progressCounter++;
                if ($progressCounter % 25 === 0) {
                    $this->updateJob($job, [
                        'summary' => $summary,
                        'results' => $results,
                    ]);
                }
            }
        }

        $this->updateJob($job, [
            'summary' => $summary,
            'results' => $results,
        ]);

        $this->updateJob($job, ['phase' => 'send_wa']);

        foreach ($waQueue as $entry) {
            /** @var Customer $customer */
            $customer = $entry['customer'];
            $invoiceId = (int) $entry['invoice_id'];
            $invoiceLink = (string) $entry['invoice_link'];
            $message = (string) $entry['message'];

            [$waSuccess, $waError] = $this->sendSingleMessageWithRetry($customer, $message);
            if ($waSuccess) {
                $summary['wa_sent']++;
            } else {
                $summary['wa_failed']++;
            }

            $this->upsertResult($results, $resultsByCustomer, $customer->id, [
                'customer_id' => $customer->id,
                'status' => 'success',
                'reason' => 'invoice_created',
                'invoice_id' => $invoiceId,
                'invoice_link' => $invoiceLink,
                'wa_status' => $waSuccess ? 'sent' : 'failed',
            ]);

            $this->logBillingNotification(
                $customer->id,
                $customer->phone,
                $message,
                $waSuccess ? 'sent' : 'failed',
                $waError,
                [
                    'type' => 'billing_auto_invoice',
                    'segment' => $segment,
                    'invoice_id' => $invoiceId,
                    'job_id' => $job->id,
                ]
            );
        }

        $this->updateJob($job, [
            'state' => 'completed',
            'phase' => 'done',
            'summary' => $summary,
            'results' => $results,
            'invalid_services' => $invalidServices,
            'error_message' => null,
            'finished_at' => now(),
        ]);
    }

    public function fail(BillingAutoInvoiceJob $job, string $errorMessage): void
    {
        $summary = $job->summary ?? $this->defaultSummary(0);
        $summary['errors_count'] = (int) ($summary['errors_count'] ?? 0) + 1;

        $this->updateJob($job, [
            'state' => 'failed',
            'phase' => 'done',
            'summary' => $summary,
            'error_message' => $errorMessage,
            'finished_at' => now(),
        ]);
    }

    public function defaultSummary(int $total): array
    {
        return [
            'total' => $total,
            'processed' => 0,
            'verified_wa' => 0,
            'created' => 0,
            'wa_sent' => 0,
            'wa_failed' => 0,
            'skipped_no_phone' => 0,
            'skipped_existing_open_invoice' => 0,
            'skipped_invalid_service' => 0,
            'errors_count' => 0,
        ];
    }

    private function normalizeServiceLabel(?string $value): string
    {
        return strtolower(trim((string) $value));
    }

    private function resolveCustomerServiceLabel(Customer $customer): string
    {
        $label = trim((string) ($customer->package_type ?? ''));
        if ($label !== '') {
            return $label;
        }

        return trim((string) ($customer->custom_package ?? ''));
    }

    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);
        return strlen((string) $cleaned) >= 10 && strlen((string) $cleaned) <= 15;
    }

    private function buildInvoiceMessage(Customer $customer, string $invoiceUrl, float $amount): string
    {
        return "Yth. Bapak/Ibu " . strtoupper((string) $customer->name) . "\n" .
            "Username PPPoE: " . ((string) $customer->pppoe_username ?: '-') . "\n\n" .
            "Nominal tagihan: Rp " . number_format($amount, 0, ',', '.') . "\n" .
            "> Informasi lengkap dan metode pembayaran tersedia pada link berikut:\n" .
            $invoiceUrl . "\n\n" .
            "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis.\n\n" .
            "Layanan Call Center 085158025553\n\n" .
            "Salam Hangat,\n" .
            "Tim Layanan Pelanggan Rumah Kita Net";
    }

    /**
     * @return array{0: bool, 1: ?string}
     */
    private function sendSingleMessageWithRetry(Customer $customer, string $message): array
    {
        $lastError = null;
        for ($attempt = 1; $attempt <= self::WA_RETRY_COUNT; $attempt++) {
            [$success, $error] = $this->sendSingleMessage($customer, $message);
            if ($success) {
                return [true, null];
            }
            $lastError = $error ?: 'Gateway rejected message';
        }

        return [false, $lastError];
    }

    /**
     * @return array{0: bool, 1: ?string}
     */
    private function sendSingleMessage(Customer $customer, string $message): array
    {
        try {
            $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
            $response = Http::timeout(30)->post($gatewayUrl . '/send', [
                'phone' => (string) $customer->phone,
                'message' => $message,
            ]);

            $payload = $response->json();
            if ((bool) ($payload['success'] ?? false) === true || $response->successful()) {
                return [true, null];
            }

            return [false, (string) ($payload['error'] ?? 'Gateway response invalid')];
        } catch (\Throwable $e) {
            return [false, 'Gateway error: ' . $e->getMessage()];
        }
    }

    /**
     * @param array<int, array<string, mixed>> $results
     * @param array<int, int> $indexByCustomer
     * @param array<string, mixed> $row
     */
    private function appendResult(array &$results, array &$indexByCustomer, array $row): void
    {
        $customerId = (int) ($row['customer_id'] ?? 0);
        if ($customerId > 0 && isset($indexByCustomer[$customerId])) {
            $results[$indexByCustomer[$customerId]] = $row;
            return;
        }

        $results[] = $row;
        if ($customerId > 0) {
            $indexByCustomer[$customerId] = count($results) - 1;
        }
    }

    /**
     * @param array<int, array<string, mixed>> $results
     * @param array<int, int> $indexByCustomer
     * @param array<string, mixed> $row
     */
    private function upsertResult(array &$results, array &$indexByCustomer, int $customerId, array $row): void
    {
        if (isset($indexByCustomer[$customerId])) {
            $results[$indexByCustomer[$customerId]] = $row;
            return;
        }

        $results[] = $row;
        $indexByCustomer[$customerId] = count($results) - 1;
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function logBillingNotification(?int $customerId, ?string $phone, string $message, string $status, ?string $error = null, array $meta = []): void
    {
        try {
            NotificationLog::create([
                'customer_id' => $customerId,
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => in_array($status, ['sent', 'failed', 'skipped'], true) ? $status : 'failed',
                'error' => $error,
                'meta' => $meta,
                'sent_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to write billing notification log', [
                'customer_id' => $customerId,
                'status' => $status,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @param array<string, mixed> $attributes
     */
    private function updateJob(BillingAutoInvoiceJob $job, array $attributes): void
    {
        $job->forceFill($attributes);
        $job->save();
    }
}

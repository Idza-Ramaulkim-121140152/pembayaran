<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class IpaymuPaymentProcessor
{
    public function __construct(
        protected IpaymuService $ipaymuService,
        protected FinancialLedgerService $ledgerService,
        protected CustomerUsageSnapshotService $usageSnapshotService,
        protected AuditLogService $auditLogService
    ) {
    }

    /**
     * Check if payment gateway is globally active
     */
    public function isPaymentGatewayActive(): bool
    {
        return (bool) SiteSetting::get('ipaymu_active', false);
    }

    /**
     * Set payment gateway active state
     */
    public function setPaymentGatewayActive(bool $active): void
    {
        SiteSetting::set('ipaymu_active', $active ? '1' : '0');
    }

    /**
     * Create payment session for an invoice
     */
    public function createInvoicePayment(Invoice $invoice, string $method = 'qris', array $params = []): array
    {
        if (!$this->isPaymentGatewayActive()) {
            return [
                'success' => false,
                'message' => 'Layanan Payment Gateway sedang dinonaktifkan oleh admin.',
            ];
        }

        $invoice->loadMissing('customer');
        $customer = $invoice->customer;
        $appUrl = config('app.url', 'https://rumahkitanet.site');

        $buyerName = $customer?->name ?: 'Pelanggan';
        $buyerPhone = $customer?->phone ?: '085158025553';
        $buyerEmail = $customer?->email ?: 'cs@rumahkitanet.site';
        $amount = (float) $invoice->amount;
        $referenceId = 'INV-' . $invoice->id . '-' . time();
        $productName = 'Pembayaran Tagihan Internet #' . $invoice->invoice_link;

        $notifyUrl = "{$appUrl}/api/ipaymu/notify";
        $returnUrl = "{$appUrl}/api/ipaymu/return?invoice={$invoice->invoice_link}";
        $cancelUrl = "{$appUrl}/api/ipaymu/cancel?invoice={$invoice->invoice_link}";

        if ($method === 'redirect') {
            $result = $this->ipaymuService->request('/payment', 'POST', [
                'product' => [$productName],
                'qty' => [1],
                'price' => [$amount],
                'description' => ["Pembayaran Tagihan Internet Rumah Kita Net untuk {$buyerName}"],
                'notifyUrl' => $notifyUrl,
                'returnUrl' => $returnUrl,
                'cancelUrl' => $cancelUrl,
                'referenceId' => $referenceId,
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
                'buyerPhone' => $buyerPhone,
            ]);
        } elseif ($method === 'va') {
            $bank = strtolower($params['va_bank'] ?? 'bag');
            $result = $this->ipaymuService->request('/payment/direct', 'POST', [
                'name' => $buyerName,
                'phone' => $buyerPhone,
                'email' => $buyerEmail,
                'amount' => $amount,
                'notifyUrl' => $notifyUrl,
                'paymentMethod' => 'va',
                'paymentChannel' => $bank,
                'referenceId' => $referenceId,
                'description' => "Virtual Account {$bank} #{$invoice->invoice_link}",
            ]);
        } else {
            // Default: QRIS
            $result = $this->ipaymuService->request('/payment/direct', 'POST', [
                'name' => $buyerName,
                'phone' => $buyerPhone,
                'email' => $buyerEmail,
                'amount' => $amount,
                'notifyUrl' => $notifyUrl,
                'paymentMethod' => 'qris',
                'paymentChannel' => 'mpm',
                'referenceId' => $referenceId,
                'description' => "QRIS Tagihan Internet #{$invoice->invoice_link}",
            ]);
        }

        // Attach direct QR image URL if QrString or PaymentNo is present
        if (!empty($result['response']['Data']['QrString']) || !empty($result['response']['Data']['PaymentNo'])) {
            $qrData = $result['response']['Data']['QrString'] ?? $result['response']['Data']['PaymentNo'];
            if (str_starts_with($qrData, '000201')) {
                $result['response']['Data']['qr_image_url'] = 'https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=' . urlencode($qrData);
            }
        }

        return $result;
    }

    /**
     * Process successful payment for an invoice (Unisolir, Due Date, Finance, WhatsApp)
     */
    public function processSuccessfulPayment(Invoice $invoice, array $payload = []): array
    {
        $invoice->loadMissing('customer');
        $customer = $invoice->customer;

        if ($invoice->status === 'paid') {
            return [
                'success' => true,
                'already_paid' => true,
                'message' => 'Invoice sudah berstatus lunas sebelumnya.',
                'invoice' => $invoice,
            ];
        }

        $confirmedAt = now();
        $invoice->status = 'paid';
        $invoice->paid_at = $confirmedAt;
        $invoice->tolak_info = null;

        $via = strtoupper((string) ($payload['via'] ?? $payload['payment_method'] ?? $payload['channel'] ?? 'IPAYMU'));
        $trxId = (string) ($payload['trx_id'] ?? $payload['transaction_id'] ?? '');

        $invoice->save();

        // 1. Un-isolir customer if currently isolated & compute new due date
        $unisolationResult = $this->applyPaymentEffects($invoice, $confirmedAt);

        // 2. Sync to Financial Ledger (Income Transaction)
        $this->ledgerService->syncInvoicePayment($invoice);

        // 3. Log to Audit
        if ($customer) {
            try {
                $this->auditLogService->log('billing.ipaymu_payment_confirmed', $customer, [
                    'invoice_id' => $invoice->id,
                    'customer_id' => $customer->id,
                    'amount' => $invoice->amount,
                    'ipaymu_trx_id' => $trxId,
                    'channel' => $via,
                    'unisolated' => $unisolationResult['isolation_restored'] ?? false,
                    'new_due_date' => $customer->due_date,
                ]);
            } catch (\Throwable $e) {
                Log::warning('Failed to log audit for iPaymu payment: ' . $e->getMessage());
            }
        }

        // 4. Send WhatsApp confirmation notification to customer
        $this->sendWhatsAppPaymentConfirmation($invoice, $trxId, $via);

        return [
            'success' => true,
            'already_paid' => false,
            'message' => 'Pembayaran iPaymu berhasil diverifikasi, isolir dicabut, dan masa aktif diperpanjang.',
            'invoice' => $invoice,
            'unisolation' => $unisolationResult,
        ];
    }

    /**
     * Unisolate customer on MikroTik and compute new due date
     */
    public function applyPaymentEffects(Invoice $invoice, Carbon $confirmedAt): array
    {
        $customer = $invoice->customer;
        if (!$customer) {
            return ['isolation_restored' => false];
        }

        $mikrotik = null;
        $secret = null;
        if ($customer->pppoe_username) {
            try {
                $mikrotik = app(MikroTikService::class);
                $mikrotik->connect();
                $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            } catch (\Throwable $e) {
                Log::warning('MikroTik inspect secret failed during iPaymu confirmation: ' . $e->getMessage());
            }
        }

        $isCurrentlyIsolated = (bool) ($customer->is_service_isolated ?? false)
            || strtolower(trim((string) ($secret['profile'] ?? ''))) === 'isolir';

        // Compute new due date (+30 days)
        $customer->due_date = $this->computeConfirmedDueDate($customer, $isCurrentlyIsolated, $confirmedAt);

        $isolationRestored = false;
        $restoredProfile = null;

        if ($isCurrentlyIsolated && $customer->pppoe_username) {
            try {
                $targetProfile = $customer->isolation_restore_profile
                    ?: ($customer->package_type ?: 'default');

                $mikrotik ??= app(MikroTikService::class);
                $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);

                $customer->is_service_isolated = false;
                $customer->service_isolated_at = null;
                $customer->service_isolated_by = null;
                $customer->isolation_restore_profile = null;

                $isolationRestored = true;
                $restoredProfile = $targetProfile;

                Log::info("Pelanggan {$customer->name} ({$customer->pppoe_username}) isolir dicabut otomatis setelah pembayaran iPaymu.");
            } catch (\Throwable $e) {
                Log::error("Gagal mencabut isolir pelanggan {$customer->name} setelah pembayaran iPaymu: " . $e->getMessage());
            }
        }

        $customer->save();
        $this->usageSnapshotService->resetPeriodByCustomerId((int) $customer->id);

        if ($mikrotik) {
            try {
                $mikrotik->disconnect();
            } catch (\Throwable $e) {
            }
        }

        return [
            'isolation_restored' => $isolationRestored,
            'restored_profile' => $restoredProfile,
            'new_due_date' => $customer->due_date,
        ];
    }

    private function computeConfirmedDueDate(Customer $customer, bool $isIsolated, Carbon $confirmedAt): string
    {
        if ($isIsolated) {
            return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
        }

        if ($customer->due_date) {
            $currentDue = Carbon::parse($customer->due_date)->startOfDay();
            if ($currentDue->isFuture()) {
                return $currentDue->copy()->addDays(30)->toDateString();
            }
        }

        return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
    }

    private function sendWhatsAppPaymentConfirmation(Invoice $invoice, ?string $trxId, string $channel): void
    {
        try {
            $customer = $invoice->customer;
            if (!$customer || empty($customer->phone)) {
                return;
            }

            $customerName = $customer->name ?: 'Pelanggan';
            $amount = 'Rp ' . number_format((float) $invoice->amount, 0, ',', '.');
            $dueDate = $customer->due_date ? Carbon::parse($customer->due_date)->format('d/m/Y') : '-';
            $invoiceUrl = url('/invoice/' . $invoice->invoice_link);

            $message = "Halo *{$customerName}*,\n\n"
                . "✅ *PEMBAYARAN DITERIMA & LUNAS*\n\n"
                . "Terima kasih, pembayaran tagihan internet Anda melalui Payment Gateway telah berhasil diverifikasi otomatis oleh sistem.\n\n"
                . "📄 *Detail Pembayaran:*\n"
                . "• No. Invoice: *#{$invoice->invoice_link}*\n"
                . "• Jumlah: *{$amount}*\n"
                . "• Metode: *{$channel}*\n"
                . ($trxId ? "• ID Transaksi: *{$trxId}*\n" : "")
                . "• Tanggal Jatuh Tempo Berikutnya: *{$dueDate}*\n"
                . "• Status Layanan: *Aktif Normal*\n\n"
                . "Lihat & Unduh Tanda Terima Lunas:\n{$invoiceUrl}\n\n"
                . "Terima kasih atas kepercayaan Anda menggunakan layanan *Rumah Kita Network*.\n\n"
                . "_Pesan otomatis dari Sistem Rumah Kita Network_";

            $waGatewayUrl = rtrim(env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
            Http::timeout(10)->post($waGatewayUrl . '/send', [
                'phone' => $customer->phone,
                'message' => $message,
            ]);

            NotificationLog::create([
                'customer_id' => $customer->id,
                'phone' => $customer->phone,
                'message' => mb_substr($message, 0, 2000),
                'status' => 'sent',
                'meta' => [
                    'channel' => 'whatsapp',
                    'type' => 'ipaymu_payment_confirm',
                    'invoice_id' => $invoice->id,
                ],
                'sent_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to send WhatsApp payment confirmation for iPaymu: ' . $e->getMessage());
        }
    }
}

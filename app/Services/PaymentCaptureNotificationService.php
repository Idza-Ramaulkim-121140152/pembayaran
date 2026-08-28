<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use App\Models\Customer;
use App\Models\NotificationLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PaymentCaptureNotificationService
{
    public function __construct(
        private BillingMessageTemplateService $billingMessageTemplateService,
        private InternalAlertService $internalAlertService,
        private PaymentVerificationConfigService $paymentVerificationConfigService,
    ) {
    }

    public function notifyNeedsReview(BillingPaymentCapture $capture): void
    {
        $message = $this->buildAdminReviewMessage($capture);
        $recipients = $this->paymentVerificationConfigService->notificationRecipientsFor('needs_review');

        $this->internalAlertService->sendToRecipients($recipients, $message, 'billing_payment_capture_review', [
            'capture_id' => $capture->id,
            'invoice_id' => $capture->invoice_id,
            'customer_id' => $capture->customer_id,
            'match_status' => $capture->match_status,
        ], 'Setting penerima notifikasi pembayaran untuk review belum diisi.');
    }

    public function notifyAutoApproved(BillingPaymentCapture $capture): void
    {
        $capture->loadMissing('customer', 'invoice');
        $recipients = $this->paymentVerificationConfigService->notificationRecipientsFor('auto_approved');

        $this->internalAlertService->sendToRecipients($recipients, $this->buildAdminApprovedMessage($capture), 'billing_payment_capture_auto_approved', [
            'capture_id' => $capture->id,
            'invoice_id' => $capture->invoice_id,
            'customer_id' => $capture->customer_id,
            'match_status' => $capture->match_status,
        ], 'Setting penerima notifikasi pembayaran otomatis belum diisi.');

        if ($capture->customer) {
            $this->sendCustomerConfirmation($capture->customer, $capture);
        }
    }

    private function sendCustomerConfirmation(Customer $customer, BillingPaymentCapture $capture): void
    {
        $phone = trim((string) ($customer->phone ?? ''));
        if ($phone === '') {
            return;
        }

        $message = $this->billingMessageTemplateService->buildPaymentConfirmationMessage($customer, true)
            . "\n\nNominal: Rp " . number_format((float) $capture->amount, 0, ',', '.')
            . "\nWaktu: " . ((string) data_get($capture->meta, 'analysis.paid_date', now()->toDateString()))
            . ' ' . ((string) data_get($capture->meta, 'analysis.paid_time', now()->format('H:i')));

        try {
            $response = Http::timeout(60)->post(rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/') . '/send-bulk', [
                'recipients' => [[
                    'phone' => $phone,
                    'name' => (string) ($customer->name ?? 'Pelanggan'),
                ]],
                'message' => $message,
                'delay' => 0,
            ]);

            $payload = $response->json();
            $results = is_array($payload['results'] ?? null) ? $payload['results'] : [];
            $result = $results[0] ?? ['success' => $response->successful(), 'error' => $payload['error'] ?? null];

            NotificationLog::create([
                'customer_id' => $customer->id,
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'status' => ($result['success'] ?? false) ? 'sent' : 'failed',
                'error' => $result['error'] ?? null,
                'meta' => [
                    'channel' => 'whatsapp',
                    'type' => 'billing_payment_capture_customer_confirmation',
                    'capture_id' => $capture->id,
                ],
                'sent_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Customer payment capture confirmation failed', [
                'capture_id' => $capture->id,
                'customer_id' => $customer->id,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    private function buildAdminReviewMessage(BillingPaymentCapture $capture): string
    {
        $capture->loadMissing('customer', 'invoice');

        return "Perlu review pembayaran WhatsApp\n\n"
            . "Capture ID: {$capture->id}\n"
            . "Pelanggan: " . ($capture->customer?->name ?: '-') . "\n"
            . "WA: " . ((string) data_get($capture->meta, 'sender_phone', '-')) . "\n"
            . "Invoice: " . ($capture->invoice?->invoice_link ?: '-') . "\n"
            . "Nominal OCR: Rp " . number_format((float) $capture->amount, 0, ',', '.') . "\n"
            . "Confidence: " . number_format((float) $capture->match_confidence, 2) . "%\n"
            . "Alasan: " . ((string) data_get($capture->meta, 'validation.failure_reason', '-'));
    }

    private function buildAdminApprovedMessage(BillingPaymentCapture $capture): string
    {
        $capture->loadMissing('customer', 'invoice');

        return "Pembayaran berhasil dikonfirmasi otomatis\n\n"
            . "Capture ID: {$capture->id}\n"
            . "Pelanggan: " . ($capture->customer?->name ?: '-') . "\n"
            . "WA: " . ((string) data_get($capture->meta, 'sender_phone', '-')) . "\n"
            . "Invoice: " . ($capture->invoice?->invoice_link ?: '-') . "\n"
            . "Nominal: Rp " . number_format((float) $capture->amount, 0, ',', '.') . "\n"
            . "Metode: " . ((string) data_get($capture->meta, 'analysis.payment_channel', '-')) . "\n"
            . "Waktu: " . ((string) data_get($capture->meta, 'analysis.paid_date', '-')) . ' ' . ((string) data_get($capture->meta, 'analysis.paid_time', '-'));
    }
}

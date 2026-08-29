<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\NotificationLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class InvoiceWhatsAppService
{
    public function __construct(private InvoiceDocumentService $documentService)
    {
    }

    public function send(Invoice $invoice): array
    {
        $invoice->loadMissing('customer');
        $phone = (string) ($invoice->customer?->phone ?? '');
        $message = $this->defaultMessage($invoice);

        if (!$this->isValidPhone($phone)) {
            return $this->finish($invoice, $message, 'skipped', 'no_valid_whatsapp', [
                'media_sent' => false,
            ]);
        }

        try {
            $invoice = $this->documentService->ensureGenerated($invoice);
        } catch (\Throwable $exception) {
            Log::error('Invoice PDF generation failed before WhatsApp send', [
                'invoice_id' => $invoice->id,
                'error' => $exception->getMessage(),
            ]);

            return $this->finish($invoice, $message, 'failed', 'pdf_generation_failed: ' . $exception->getMessage(), [
                'media_sent' => false,
            ]);
        }

        $message = $this->defaultMessage($invoice);
        $fileUrl = route('invoice-documents.public.download', [
            'token' => $invoice->document_token,
        ], true);

        try {
            $response = Http::connectTimeout(5)->timeout(15)->post($this->gatewayUrl() . '/send-media', [
                'phone' => $phone,
                'message' => $message,
                'file_url' => $fileUrl,
                'filename' => 'Invoice-' . $invoice->id . '.pdf',
            ]);

            $payload = $response->json();
            $success = $response->successful()
                && is_array($payload)
                && (bool) ($payload['success'] ?? false);

            if (!$success) {
                $error = is_array($payload)
                    ? (string) ($payload['error'] ?? $payload['message'] ?? ('gateway_http_' . $response->status()))
                    : 'gateway_http_' . $response->status();

                return $this->finish($invoice, $message, 'failed', $error, [
                    'media_sent' => false,
                    'media_url' => $fileUrl,
                    'gateway_status' => $response->status(),
                ]);
            }

            return $this->finish($invoice, $message, 'sent', null, [
                'media_sent' => true,
                'media_url' => $fileUrl,
                'gateway_status' => $response->status(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Invoice PDF WhatsApp send failed', [
                'invoice_id' => $invoice->id,
                'error' => $exception->getMessage(),
            ]);

            return $this->finish($invoice, $message, 'failed', 'Gateway media error: ' . $exception->getMessage(), [
                'media_sent' => false,
                'media_url' => $fileUrl,
            ]);
        }
    }

    public function defaultMessage(Invoice $invoice): string
    {
        $invoice->loadMissing('customer');
        $customerName = $invoice->customer?->name ?: 'Pelanggan';
        $invoiceUrl = url('/invoice/' . $invoice->invoice_link);
        $verifyUrl = $invoice->document_token
            ? route('invoice-documents.public.verify', ['token' => $invoice->document_token], true)
            : '-';
        $amount = 'Rp ' . number_format((float) $invoice->amount, 0, ',', '.');
        $dueDate = optional($invoice->due_date)->format('d/m/Y') ?: '-';

        return "Halo {$customerName},\n\n"
            . "Berikut invoice layanan internet Rumah Kita Network.\n\n"
            . "Nomor invoice: {$invoice->invoice_link}\n"
            . "Nominal: {$amount}\n"
            . "Jatuh tempo: {$dueDate}\n"
            . "Status: {$invoice->status}\n"
            . "Link invoice: {$invoiceUrl}\n"
            . "Verifikasi tanda tangan QR: {$verifyUrl}\n\n"
            . "Mohon simpan PDF ini sebagai arsip.\n\n"
            . BillingMessageTemplateService::AUTO_LABEL;
    }

    private function finish(Invoice $invoice, string $message, string $status, ?string $error, array $meta): array
    {
        $invoice->forceFill([
            'whatsapp_status' => $status,
            'whatsapp_error' => $error,
            'whatsapp_sent_at' => now(),
        ])->save();

        try {
            NotificationLog::create([
                'customer_id' => $invoice->customer_id,
                'phone' => $invoice->customer?->phone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => in_array($status, ['sent', 'failed', 'skipped'], true) ? $status : 'failed',
                'error' => $error,
                'meta' => array_merge([
                    'channel' => 'whatsapp',
                    'type' => 'invoice_pdf',
                    'invoice_id' => $invoice->id,
                    'invoice_link' => $invoice->invoice_link,
                ], $meta),
                'sent_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Failed to log invoice PDF WhatsApp attempt', [
                'invoice_id' => $invoice->id,
                'error' => $exception->getMessage(),
            ]);
        }

        return [
            'success' => $status === 'sent',
            'status' => $status,
            'error' => $error,
            'meta' => $meta,
        ];
    }

    private function gatewayUrl(): string
    {
        return rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
    }

    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);

        return strlen((string) $cleaned) >= 10 && strlen((string) $cleaned) <= 15;
    }
}

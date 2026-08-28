<?php

namespace App\Services;

use App\Models\CustomerAgreement;
use App\Models\NotificationLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CustomerAgreementWhatsAppService
{
    public function send(CustomerAgreement $agreement, ?string $message = null): array
    {
        $agreement->loadMissing('customer');
        $customer = $agreement->customer;
        $phone = (string) ($customer?->phone ?? '');

        if (!$this->isValidPhone($phone)) {
            return $this->finish($agreement, $message ?? '', 'skipped', 'no_valid_whatsapp', [
                'media_sent' => false,
                'text_sent' => false,
            ]);
        }

        $message = $message ?: $this->defaultMessage($agreement);
        $mediaError = null;
        $mediaSent = false;

        if ($agreement->pdf_path && Storage::disk('public')->exists($agreement->pdf_path)) {
            [$mediaSent, $mediaError] = $this->sendMedia($phone, $message, $agreement);
        } else {
            $mediaError = 'pdf_not_available';
        }

        if ($mediaSent) {
            return $this->finish($agreement, $message, 'sent', null, [
                'media_sent' => true,
                'text_sent' => false,
            ]);
        }

        [$textSent, $textError] = $this->sendText($phone, $message, (string) ($customer?->name ?? 'Pelanggan'));

        return $this->finish($agreement, $message, $textSent ? 'sent' : 'failed', $textSent ? $mediaError : ($textError ?: $mediaError), [
            'media_sent' => false,
            'media_error' => $mediaError,
            'text_sent' => $textSent,
            'text_error' => $textError,
        ]);
    }

    public function defaultMessage(CustomerAgreement $agreement): string
    {
        $agreement->loadMissing('customer');
        $downloadUrl = route('contracts.public.download', ['token' => $agreement->public_token], true);
        $verifyUrl = route('contracts.public.verify', ['token' => $agreement->public_token], true);

        return "Halo {$agreement->customer?->name},\n\n" .
            "Berikut kontrak perjanjian berlangganan layanan internet Rumah Kita Network.\n\n" .
            "Nomor kontrak: {$agreement->agreement_number}\n" .
            "Download PDF: {$downloadUrl}\n" .
            "Verifikasi tanda tangan QR: {$verifyUrl}\n\n" .
            "Mohon disimpan sebagai arsip pelanggan.\n\n" .
            BillingMessageTemplateService::AUTO_LABEL;
    }

    private function sendMedia(string $phone, string $caption, CustomerAgreement $agreement): array
    {
        try {
            $response = Http::timeout(60)->post($this->gatewayUrl() . '/send-media', [
                'phone' => $phone,
                'message' => $caption,
                'file_url' => $this->absolutePublicUrl(Storage::disk('public')->url($agreement->pdf_path)),
                'filename' => 'Kontrak-' . str_replace(['/', '\\'], '-', $agreement->agreement_number) . '.pdf',
            ]);

            if ($response->successful()) {
                $payload = $response->json();
                if (is_array($payload) && ($payload['success'] ?? false)) {
                    return [true, null];
                }

                return [false, (string) ($payload['error'] ?? $payload['message'] ?? 'gateway_rejected_media')];
            }

            return [false, 'gateway_http_' . $response->status()];
        } catch (\Throwable $exception) {
            Log::warning('Agreement media WhatsApp failed', ['error' => $exception->getMessage()]);

            return [false, 'Gateway media error: ' . $exception->getMessage()];
        }
    }

    private function sendText(string $phone, string $message, string $name): array
    {
        try {
            $response = Http::timeout(30)->post($this->gatewayUrl() . '/send', [
                'phone' => $phone,
                'name' => $name,
                'message' => $message,
            ]);

            if ($response->successful()) {
                $payload = $response->json();
                if (is_array($payload) && array_key_exists('success', $payload) && !$payload['success']) {
                    return [false, (string) ($payload['error'] ?? $payload['message'] ?? 'gateway_rejected')];
                }

                return [true, null];
            }

            return [false, 'gateway_http_' . $response->status()];
        } catch (\Throwable $exception) {
            return [false, 'Gateway error: ' . $exception->getMessage()];
        }
    }

    private function finish(CustomerAgreement $agreement, string $message, string $status, ?string $error, array $meta): array
    {
        $agreement->update([
            'status' => $status === 'sent' ? 'sent' : ($status === 'failed' ? 'failed' : $agreement->status),
            'whatsapp_status' => $status,
            'whatsapp_error' => $error,
            'whatsapp_sent_at' => now(),
        ]);

        try {
            NotificationLog::create([
                'customer_id' => $agreement->customer_id,
                'phone' => $agreement->customer?->phone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => in_array($status, ['sent', 'failed', 'skipped'], true) ? $status : 'failed',
                'error' => $error,
                'meta' => array_merge([
                    'channel' => 'whatsapp',
                    'type' => 'customer_agreement',
                    'agreement_id' => $agreement->id,
                    'agreement_number' => $agreement->agreement_number,
                ], $meta),
                'sent_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Failed to log agreement WhatsApp', ['error' => $exception->getMessage()]);
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

    private function absolutePublicUrl(string $url): string
    {
        if (preg_match('/^https?:\/\//i', $url)) {
            return $url;
        }

        return rtrim((string) config('app.url'), '/') . '/' . ltrim($url, '/');
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

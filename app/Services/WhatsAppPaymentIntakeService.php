<?php

namespace App\Services;

use App\Jobs\AnalyzeWhatsAppPaymentCaptureJob;
use App\Models\BillingPaymentCapture;
use App\Models\Customer;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class WhatsAppPaymentIntakeService
{
    public function __construct(
        private PaymentVerificationConfigService $configService,
    ) {
    }

    public function intake(array $payload): array
    {
        $normalized = $this->normalizePayload($payload);
        $existing = BillingPaymentCapture::query()->where('fingerprint', $normalized['fingerprint'])->first();

        if ($existing) {
            return [
                'capture' => $existing,
                'duplicate' => true,
                'message' => 'Webhook pembayaran sudah pernah diterima.',
            ];
        }

        $customer = $this->findCustomerByPhone($normalized['sender_phone']);
        $invoice = $customer ? $this->findActiveInvoice($customer) : null;
        $media = $this->storeMedia($normalized);

        $capture = BillingPaymentCapture::query()->create([
            'source' => 'whatsapp_webhook',
            'invoice_id' => $invoice?->id,
            'customer_id' => $customer?->id,
            'amount' => 0,
            'paid_date' => $normalized['sent_at']->toDateString(),
            'reference_code' => $normalized['message_id'],
            'fingerprint' => $normalized['fingerprint'],
            'match_status' => 'pending',
            'meta' => [
                'sender_phone' => $normalized['sender_phone'],
                'source' => [
                    'message_id' => $normalized['message_id'],
                    'caption' => $normalized['caption'],
                    'sent_at' => $normalized['sent_at']->toISOString(),
                    'mime_type' => $normalized['mime_type'],
                    'media_url' => $normalized['media_url'],
                ],
                'media' => $media,
                'analysis' => null,
                'validation' => [
                    'failure_reason' => null,
                    'flags' => [],
                ],
            ],
        ]);

        Log::info('WhatsApp payment capture created', [
            'capture_id' => $capture->id,
            'customer_id' => $capture->customer_id,
            'invoice_id' => $capture->invoice_id,
            'message_id' => $normalized['message_id'],
            'mime_type' => $normalized['mime_type'],
        ]);

        AnalyzeWhatsAppPaymentCaptureJob::dispatch($capture->id);

        Log::info('WhatsApp payment capture queued for analysis', [
            'capture_id' => $capture->id,
        ]);

        return [
            'capture' => $capture,
            'duplicate' => false,
            'message' => 'Webhook pembayaran diterima dan dijadwalkan untuk dianalisis.',
        ];
    }

    private function normalizePayload(array $payload): array
    {
        $messageId = trim((string) ($payload['message_id'] ?? ''));
        $senderPhone = $this->normalizePhone((string) ($payload['sender_phone'] ?? ''));
        $caption = trim((string) ($payload['caption'] ?? ''));
        $mimeType = trim((string) ($payload['mime_type'] ?? 'image/jpeg'));
        $mediaUrl = trim((string) ($payload['media_url'] ?? ''));
        $mediaBase64 = trim((string) ($payload['media_base64'] ?? ''));
        $sentAt = Carbon::parse((string) ($payload['sent_at'] ?? now()->toISOString()));

        if ($messageId === '') {
            $messageId = (string) Str::uuid();
        }

        return [
            'message_id' => $messageId,
            'sender_phone' => $senderPhone,
            'caption' => $caption,
            'mime_type' => $mimeType,
            'media_url' => $mediaUrl,
            'media_base64' => $mediaBase64,
            'sent_at' => $sentAt,
            'fingerprint' => sha1($messageId . '|' . $senderPhone . '|' . $mediaUrl . '|' . substr($mediaBase64, 0, 120)),
        ];
    }

    private function storeMedia(array $normalized): array
    {
        $mimeType = (string) $normalized['mime_type'];
        $allowed = (array) data_get($this->configService->getConfig(), 'allowed_source_mime_types', []);
        if (!in_array($mimeType, $allowed, true)) {
            throw new \InvalidArgumentException('Mime type media tidak diizinkan.');
        }

        $extension = $this->extensionFromMime($mimeType);
        $path = 'payment-captures/' . now()->format('Y/m') . '/' . Str::uuid() . '.' . $extension;

        if ($normalized['media_base64'] !== '') {
            $binary = base64_decode($normalized['media_base64'], true);
            if ($binary === false) {
                throw new \InvalidArgumentException('Media base64 tidak valid.');
            }

            Storage::disk('public')->put($path, $binary);
        } elseif ($normalized['media_url'] !== '') {
            $response = Http::timeout(60)->get($normalized['media_url']);
            if (!$response->successful()) {
                throw new \RuntimeException('Gagal mengunduh media WhatsApp.');
            }

            Storage::disk('public')->put($path, $response->body());
        } else {
            throw new \InvalidArgumentException('Media pembayaran wajib berisi media_url atau media_base64.');
        }

        return [
            'path' => $path,
            'mime_type' => $mimeType,
            'original_url' => $normalized['media_url'] ?: null,
        ];
    }

    private function findCustomerByPhone(string $phone): ?Customer
    {
        $digits = preg_replace('/\D/', '', $phone) ?: '';
        if ($digits === '') {
            return null;
        }

        $variants = array_values(array_unique(array_filter([
            $digits,
            ltrim($digits, '0'),
            str_starts_with($digits, '62') ? '0' . substr($digits, 2) : null,
            str_starts_with($digits, '0') ? '62' . substr($digits, 1) : null,
        ])));

        return Customer::query()
            ->where(function ($query) use ($variants) {
                foreach ($variants as $variant) {
                    $query->orWhere('phone', $variant);
                }
            })
            ->first();
    }

    private function findActiveInvoice(Customer $customer): ?Invoice
    {
        return $customer->invoices()
            ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
            ->orderBy('due_date')
            ->orderBy('id')
            ->first();
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?: '';
        if ($digits === '') {
            return '';
        }

        if (str_starts_with($digits, '62')) {
            return '0' . substr($digits, 2);
        }

        return str_starts_with($digits, '0') ? $digits : '0' . $digits;
    }

    private function extensionFromMime(string $mimeType): string
    {
        return match ($mimeType) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
            default => 'jpg',
        };
    }
}

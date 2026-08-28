<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PaymentProofAnalysisService
{
    public function __construct(
        private PaymentVerificationConfigService $configService,
    ) {
    }

    public function analyze(BillingPaymentCapture $capture): array
    {
        $config = $this->configService->getConfig();
        $apiKey = (string) (config('services.openai.api_key') ?: env('OPENAI_API_KEY', ''));

        if ($apiKey === '') {
            return $this->fallbackAnalysis($capture, 'openai_api_key_missing');
        }

        $mediaPath = (string) data_get($capture->meta, 'media.path', '');
        if ($mediaPath === '' || !Storage::disk('public')->exists($mediaPath)) {
            return $this->fallbackAnalysis($capture, 'media_not_found');
        }

        $mimeType = (string) data_get($capture->meta, 'media.mime_type', 'image/jpeg');
        $imageData = base64_encode((string) Storage::disk('public')->get($mediaPath));
        $dataUri = 'data:' . $mimeType . ';base64,' . $imageData;

        $prompt = <<<'PROMPT'
Analisis media berikut dan kembalikan JSON valid tanpa markdown dengan struktur tepat:
{
  "is_payment_proof": boolean,
  "amount": number|null,
  "paid_date": "YYYY-MM-DD"|null,
  "paid_time": "HH:MM"|null,
  "reference_code": string|null,
  "payment_channel": string|null,
  "destination_identity": {
    "name": string|null,
    "account_number": string|null,
    "merchant_id": string|null,
    "raw": string|null
  },
  "success_status": boolean,
  "confidence_overall": number,
  "confidence_by_field": {
    "payment_proof": number,
    "amount": number,
    "date": number,
    "time": number,
    "destination": number,
    "success_status": number
  },
  "ocr_raw_text": string|null,
  "raw_summary": string|null
}

Aturan:
- Fokus pada bukti transfer Indonesia seperti QRIS, mobile banking, BRImo, Livin, BNI Mobile, DANA, OVO, ATM receipt.
- Jika media bukan bukti transfer, set is_payment_proof=false.
- Jika nominal/tanggal/jam tidak terbaca, isi null dan confidence rendah.
- success_status=true hanya jika jelas transaksi berhasil/lunas/sukses.
- confidence memakai angka 0-100.
PROMPT;

        try {
            $response = Http::timeout(90)
                ->withToken($apiKey)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => (string) ($config['openai_model'] ?? 'gpt-4.1-mini'),
                    'response_format' => ['type' => 'json_object'],
                    'messages' => [[
                        'role' => 'user',
                        'content' => [
                            ['type' => 'text', 'text' => $prompt],
                            ['type' => 'image_url', 'image_url' => ['url' => $dataUri]],
                        ],
                    ]],
                ]);

            if (!$response->successful()) {
                return $this->fallbackAnalysis($capture, $this->buildOpenAiFailureReason($response));
            }

            $content = (string) data_get($response->json(), 'choices.0.message.content', '');
            $decoded = $this->decodeJsonContent($content);
            if (!is_array($decoded)) {
                return $this->fallbackAnalysis($capture, 'openai_invalid_json');
            }

            return $this->normalizeResult($decoded);
        } catch (\Throwable $exception) {
            Log::warning('Payment proof analysis failed', [
                'capture_id' => $capture->id,
                'error' => $exception->getMessage(),
            ]);

            return $this->fallbackAnalysis($capture, 'openai_exception');
        }
    }

    private function normalizeResult(array $decoded): array
    {
        return [
            'is_payment_proof' => (bool) ($decoded['is_payment_proof'] ?? false),
            'amount' => isset($decoded['amount']) && is_numeric($decoded['amount']) ? round((float) $decoded['amount'], 2) : null,
            'paid_date' => $this->stringOrNull($decoded['paid_date'] ?? null),
            'paid_time' => $this->stringOrNull($decoded['paid_time'] ?? null),
            'reference_code' => $this->stringOrNull($decoded['reference_code'] ?? null),
            'payment_channel' => $this->stringOrNull($decoded['payment_channel'] ?? null),
            'destination_identity' => [
                'name' => $this->stringOrNull(data_get($decoded, 'destination_identity.name')),
                'account_number' => $this->stringOrNull(data_get($decoded, 'destination_identity.account_number')),
                'merchant_id' => $this->stringOrNull(data_get($decoded, 'destination_identity.merchant_id')),
                'raw' => $this->stringOrNull(data_get($decoded, 'destination_identity.raw')),
            ],
            'success_status' => (bool) ($decoded['success_status'] ?? false),
            'confidence_overall' => $this->normalizeConfidence($decoded['confidence_overall'] ?? 0),
            'confidence_by_field' => [
                'payment_proof' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.payment_proof', 0)),
                'amount' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.amount', 0)),
                'date' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.date', 0)),
                'time' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.time', 0)),
                'destination' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.destination', 0)),
                'success_status' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.success_status', 0)),
            ],
            'ocr_raw_text' => $this->stringOrNull($decoded['ocr_raw_text'] ?? null),
            'raw_summary' => $this->stringOrNull($decoded['raw_summary'] ?? null),
        ];
    }

    private function fallbackAnalysis(BillingPaymentCapture $capture, string $reason): array
    {
        $caption = strtolower(trim((string) data_get($capture->meta, 'source.caption', '')));
        $isMaybePayment = str_contains($caption, 'transfer') || str_contains($caption, 'bayar') || str_contains($caption, 'qris');
        $amount = $this->extractAmountFromString($caption);

        Log::warning('Payment proof analysis using fallback', [
            'capture_id' => $capture->id,
            'reason' => $reason,
            'caption' => $caption,
        ]);

        return [
            'is_payment_proof' => $isMaybePayment,
            'amount' => $amount,
            'paid_date' => null,
            'paid_time' => null,
            'reference_code' => null,
            'payment_channel' => null,
            'destination_identity' => [
                'name' => null,
                'account_number' => null,
                'merchant_id' => null,
                'raw' => null,
            ],
            'success_status' => false,
            'confidence_overall' => $isMaybePayment ? 45.0 : 20.0,
            'confidence_by_field' => [
                'payment_proof' => $isMaybePayment ? 55.0 : 20.0,
                'amount' => $amount ? 50.0 : 0.0,
                'date' => 0.0,
                'time' => 0.0,
                'destination' => 0.0,
                'success_status' => 0.0,
            ],
            'ocr_raw_text' => null,
            'raw_summary' => 'fallback:' . $reason,
        ];
    }

    private function decodeJsonContent(string $content): ?array
    {
        $trimmed = trim($content);
        if (str_starts_with($trimmed, '```')) {
            $trimmed = preg_replace('/^```(?:json)?|```$/m', '', $trimmed) ?: $trimmed;
            $trimmed = trim($trimmed);
        }

        $decoded = json_decode($trimmed, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function normalizeConfidence(mixed $value): float
    {
        return max(0.0, min(100.0, round((float) $value, 2)));
    }

    private function stringOrNull(mixed $value): ?string
    {
        $string = trim((string) $value);
        return $string !== '' ? $string : null;
    }

    private function extractAmountFromString(string $text): ?float
    {
        if (!preg_match('/(?:rp)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{5,})/i', $text, $matches)) {
            return null;
        }

        $number = str_replace(['.', ','], '', $matches[1]);
        return is_numeric($number) ? (float) $number : null;
    }

    private function buildOpenAiFailureReason(\Illuminate\Http\Client\Response $response): string
    {
        $status = $response->status();
        $code = trim((string) data_get($response->json(), 'error.code', ''));
        $type = trim((string) data_get($response->json(), 'error.type', ''));

        if ($status === 429 && $code !== '') {
            return 'openai_' . $code;
        }

        if ($status >= 400 && $type !== '') {
            return 'openai_' . $type . '_' . $status;
        }

        return 'openai_http_' . $status;
    }
}

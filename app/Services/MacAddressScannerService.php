<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MacAddressScannerService
{
    /**
     * Common MAC address patterns:
     * - Standard colon: 00:1A:2B:3C:4D:5E
     * - Dash separated: 00-1A-2B-3C-4D-5E
     * - Dot separated (Cisco): 001a.2b3c.4d5e
     * - Continuous hex: 001A2B3C4D5E
     */
    private const MAC_REGEX = '/(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}|(?:[0-9A-Fa-f]{4}[.-]){2}[0-9A-Fa-f]{4}|(?:\b[0-9A-Fa-f]{12}\b)/';

    public function analyzePhoto(UploadedFile|string $file): array
    {
        $result = [
            'success' => false,
            'mac_address' => null,
            'serial_number' => null,
            'device_model' => null,
            'raw_text' => null,
            'confidence' => 0,
            'source' => 'none',
        ];

        // 1. Try OpenAI Vision if API key is configured
        $apiKey = (string) (config('services.openai.api_key') ?: env('OPENAI_API_KEY', ''));
        if ($apiKey !== '') {
            $visionResult = $this->analyzeWithOpenAiVision($file, $apiKey);
            if (!empty($visionResult['mac_address'])) {
                return $visionResult;
            }
        }

        // 2. Fallback: Local extraction
        return $result;
    }

    /**
     * Extract and normalize any MAC address found in raw string
     */
    public function extractMacFromText(string $text): ?string
    {
        if (preg_match_all(self::MAC_REGEX, $text, $matches)) {
            foreach ($matches[0] as $match) {
                $normalized = $this->normalizeMac($match);
                if ($normalized) {
                    return $normalized;
                }
            }
        }

        return null;
    }

    /**
     * Normalize a MAC string to standard XX:XX:XX:XX:XX:XX uppercase
     */
    public function normalizeMac(?string $mac): ?string
    {
        if (!$mac) {
            return null;
        }

        $cleaned = preg_replace('/[^0-9A-Fa-f]/', '', $mac);
        if (strlen((string) $cleaned) !== 12) {
            return null;
        }

        $upper = strtoupper((string) $cleaned);
        return implode(':', str_split($upper, 2));
    }

    /**
     * Analyze image with OpenAI Vision model
     */
    private function analyzeWithOpenAiVision(UploadedFile|string $file, string $apiKey): array
    {
        $base64 = '';
        $mimeType = 'image/jpeg';

        if ($file instanceof UploadedFile) {
            $mimeType = $file->getMimeType() ?: 'image/jpeg';
            $base64 = base64_encode($file->get());
        } elseif (is_string($file) && file_exists($file)) {
            $mimeType = mime_content_type($file) ?: 'image/jpeg';
            $base64 = base64_encode((string) file_get_contents($file));
        } elseif (is_string($file) && str_starts_with($file, 'data:image')) {
            $parts = explode(',', $file);
            $base64 = end($parts);
        }

        if (empty($base64)) {
            return ['success' => false, 'mac_address' => null, 'confidence' => 0];
        }

        $dataUri = 'data:' . $mimeType . ';base64,' . $base64;

        $prompt = <<<'PROMPT'
Analisis foto stiker atau label modem/ONT/router internet ini.
Ekstrak informasi perangkat berikut dan kembalikan HANYA JSON murni tanpa markdown:
{
  "mac_address": "XX:XX:XX:XX:XX:XX" atau null,
  "serial_number": "SN_NUMBER" atau null,
  "device_model": "MODEL_NAME" atau null,
  "raw_text": "ringkasan teks stiker yang terbaca",
  "confidence": 0-100
}

Aturan penting:
- Cari label seperti "MAC", "MAC Address", "PON MAC", "WAN MAC", "WLAN MAC", atau barcode MAC.
- Format MAC Address menjadi standar dua digit dipisah titik dua (contoh: 48:8F:5A:12:34:56).
- Jika tidak terbaca atau tidak ada MAC address pada gambar, isi mac_address = null.
PROMPT;

        try {
            $response = Http::timeout(30)
                ->withToken($apiKey)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => env('OPENAI_VISION_MODEL', 'gpt-4.1-mini'),
                    'response_format' => ['type' => 'json_object'],
                    'messages' => [[
                        'role' => 'user',
                        'content' => [
                            ['type' => 'text', 'text' => $prompt],
                            ['type' => 'image_url', 'image_url' => ['url' => $dataUri]],
                        ],
                    ]],
                ]);

            if ($response->successful()) {
                $content = (string) data_get($response->json(), 'choices.0.message.content', '');
                $decoded = json_decode($content, true);

                if (is_array($decoded)) {
                    $rawMac = (string) ($decoded['mac_address'] ?? '');
                    $normalizedMac = $this->normalizeMac($rawMac);

                    return [
                        'success' => !empty($normalizedMac),
                        'mac_address' => $normalizedMac,
                        'serial_number' => $decoded['serial_number'] ?? null,
                        'device_model' => $decoded['device_model'] ?? null,
                        'raw_text' => $decoded['raw_text'] ?? null,
                        'confidence' => (int) ($decoded['confidence'] ?? 0),
                        'source' => 'openai_vision',
                    ];
                }
            }
        } catch (\Throwable $e) {
            Log::warning('MacAddressScanner OpenAI Vision failed', [
                'error' => $e->getMessage(),
            ]);
        }

        return ['success' => false, 'mac_address' => null, 'confidence' => 0];
    }
}

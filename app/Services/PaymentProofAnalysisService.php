<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

class PaymentProofAnalysisService
{
    private ?string $lastAiError = null;

    public function __construct(
        private PaymentVerificationConfigService $configService,
        private CustomerResolutionService $customerResolutionService,
    ) {
    }

    /**
     * Analyze payment capture using AI Vision (Gemini / OpenAI) with fallback to Local OCR & Pattern Engine
     */
    public function analyze(BillingPaymentCapture $capture): array
    {
        $this->lastAiError = null;
        $config = $this->configService->getConfig();
        $mediaPath = (string) data_get($capture->meta, 'media.path', '');
        $mediaBase64 = (string) data_get($capture->meta, 'source.media_base64', '');
        $mimeType = (string) data_get($capture->meta, 'media.mime_type', data_get($capture->meta, 'source.mime_type', 'image/jpeg'));

        $rawBytes = null;
        if ($mediaPath !== '' && Storage::disk('public')->exists($mediaPath)) {
            $rawBytes = Storage::disk('public')->get($mediaPath);
        } elseif ($mediaBase64 !== '') {
            $rawBytes = base64_decode($mediaBase64);
        }

        $preferredProvider = (string) ($config['ai_provider'] ?? 'openrouter');
        $openrouterKey = trim((string) (
            (!empty($config['openrouter_api_key']) ? $config['openrouter_api_key'] : null)
            ?: \App\Models\SiteSetting::get('openrouter_api_key')
            ?: config('services.openrouter.api_key')
            ?: env('OPENROUTER_API_KEY', '')
        ));
        $geminiKey = trim((string) (
            (!empty($config['gemini_api_key']) ? $config['gemini_api_key'] : null)
            ?: \App\Models\SiteSetting::get('gemini_api_key')
            ?: \App\Models\SiteSetting::get('google_api_key')
            ?: config('services.gemini.api_key')
            ?: env('GEMINI_API_KEY', env('GOOGLE_API_KEY', env('GOOGLE_GEMINI_API_KEY', '')))
        ));
        $openAiKey = trim((string) (
            $config['openai_api_key']
            ?? \App\Models\SiteSetting::get('openai_api_key')
            ?? config('services.openai.api_key')
            ?: env('OPENAI_API_KEY', '')
        ));

        if (app()->runningUnitTests()) {
            if ($openrouterKey === '') $openrouterKey = 'test-openrouter-key';
            if ($geminiKey === '') $geminiKey = 'test-gemini-key';
            if ($openAiKey === '') $openAiKey = 'test-openai-key';
        }

        $prompt = <<<'PROMPT'
Analisis media bukti pembayaran/transfer berikut dan kembalikan JSON valid tanpa markdown dengan struktur tepat:
{
  "is_payment_proof": boolean,
  "amount": number|null,
  "paid_date": "YYYY-MM-DD"|null,
  "paid_time": "HH:MM:SS"|null,
  "reference_code": string|null,
  "payment_channel": string|null,
  "sender_name": string|null,
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
Pedoman Khusus Klasifikasi & Akurasi (PENTING PENYARINGAN BUKTI BAYAR):
- KRITERIA UTAMA: APAKAH INI BUKTI PEMBAYARAN ATAU BUKAN?
  * is_payment_proof = true HANYA JIKA gambar adalah bukti transaksi finansial yang sah (tangkapan layar transfer m-banking seperti BCA/BRImo/Livin/SeaBank/Dana/GoPay/OVO/ShopeePay/BSI/BNI, struk transfer ATM/EDC/agen BRILink/teller, bukti pembayaran QRIS, atau mutasi rekening).
  * is_payment_proof = false JIKA gambar BUKAN bukti pembayaran, misalnya:
    - Foto jalanan / aspal / lingkungan / pemandangan
    - Foto tiang kabel internet, kabel fiber optik, kabel putus / menjuntai
    - Foto router / modem / ONT / lampu indikator (seperti lampu LOS merah, lampu mati, adaptor, perangkat keras)
    - Foto screenshot hasil uji kecepatan internet (Speedtest Ookla / Fast.com / ping)
    - Foto screenshot percakapan chat WhatsApp atau keluhan / komplain gangguan internet pelanggan
    - Foto selfie, meme, stiker, gambar produk barang/makanan, kartu identitas (KTP/SIM/KK), foto rumah/kantor tanpa struk, atau foto non-transaksi finansial lainnya.
  * JIKA is_payment_proof = false:
    - Set amount: null, paid_date: null, paid_time: null, reference_code: null, payment_channel: null, sender_name: null, success_status: false, confidence_overall: 0.
    - Set raw_summary: "Bukan bukti pembayaran (foto non-transaksi / keluhan pelanggan / jalanan / perangkat)".

- JIKA GAMBAR ADALAH BUKTI PEMBAYARAN (Termasuk Gambar Blur, Kompresi WhatsApp, M-Banking Dark Mode, Struk Termal/Kertas):
  1. amount: Cari angka nominal utama transfer / pembayaran (contoh 50000, 100000, 150000, 200000, 250000, dst.). Pada m-banking dark mode atau struk transfer, angka nominal biasanya dicetak tebal/besar di bagian tengah atau atas. Hilangkan simbol 'Rp', titik ribuan, spasi, dan koma sen (contoh: 'Rp 250.000,00' -> 250000, 'Rp200.000' -> 200000). Kembalikan sebagai angka murni (number). JANGAN kembalikan null atau 0 jika terlihat nominal transfer!
  2. destination_identity: Cari rekening tujuan / penerima transfer:
     - name: nama pemilik rekening tujuan / merchant / nama penerima.
     - account_number: nomor rekening tujuan (ambil angka murninya, misal 581001000036562 atau 0847566563).
     - merchant_id: Merchant ID / NMID jika QRIS (misal G141935892).
     - raw: gabungan bank + rekening + nama tujuan yang tertera pada struk.
  3. sender_name: Cari nama pengirim / rekening asal / sumber dana (contoh: 'Dari: Hanny', 'Pengirim: Saripudin', 'Sumber Dana: ...').
  4. reference_code: Cari nomor transaksi unik bank / e-wallet (No. Transaksi, Nomor Referensi, ID Transaksi, RRN, No. Jurnal). PENTING: JANGAN PERNAH mengisi reference_code dengan nomor invoice sistem ISP (seperti 'inv_...'). Jika tidak ada nomor unik dari bank/e-wallet, isi null.
  5. paid_date & paid_time: Ekstrak tanggal dan jam transaksi yang tercetak asli pada struk/m-banking (contoh '16 Okt 2026, 09:17' -> paid_date: '2026-10-16', paid_time: '09:17:00'). Ubah nama bulan Indonesia (Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu/Agt, Sep, Okt, Nov, Des) ke format YYYY-MM-DD. JANGAN gunakan tanggal hari ini jika tertera tanggal di struk.
  6. payment_channel: Deteksi bank / e-wallet (contoh: BCA, BRI / BRImo, Mandiri / Livin, BNI, SeaBank, Dana, GoPay, OVO, ShopeePay, QRIS, Agen).
  7. is_payment_proof=true jika gambar adalah struk/mutasi/bukti transfer m-banking/QRIS/agen/EDC/ATM.
  8. success_status=true jika transaksi dinyatakan BERHASIL / SUKSES / LUNAS / SELESAI / TERKIRIM atau merupakan struk bukti transfer yang sah.
  9. confidence memakai skala angka 0 s.d 100.
  10. ocr_raw_text: Salin seluruh teks yang terbaca pada struk (nama, angka, tanggal, nomor referensi) agar sistem dapat memverifikasi silang.
PROMPT;

        // 1. Try AI Vision if raw bytes are available
        if ($rawBytes) {
            $processedBytes = $this->preprocessImageBytes($rawBytes, $mimeType);
            $imageData = base64_encode($processedBytes);

            // Provider 1: OpenRouter (Primary if selected or auto with key)
            if (($preferredProvider === 'openrouter' || $preferredProvider === 'auto') && $openrouterKey !== '') {
                $openrouterResult = $this->analyzeWithOpenRouter($capture, $openrouterKey, $imageData, $mimeType, $prompt, $config);
                if ($openrouterResult !== null) {
                    return $openrouterResult;
                }
            }

            // Provider 2: Gemini Direct
            if (($preferredProvider === 'gemini' || ($preferredProvider === 'auto' && $openrouterKey === '')) && $geminiKey !== '') {
                $geminiResult = $this->analyzeWithGemini($capture, $geminiKey, $imageData, $mimeType, $prompt, $config);
                if ($geminiResult !== null) {
                    return $geminiResult;
                }
            }

            // Provider 3: OpenAI Direct
            if (($preferredProvider === 'openai' || $preferredProvider === 'auto') && $openAiKey !== '') {
                $openAiResult = $this->analyzeWithOpenAi($capture, $openAiKey, $imageData, $mimeType, $prompt, $config);
                if ($openAiResult !== null) {
                    return $openAiResult;
                }
            }

            // Fallback chain if preferred OpenRouter failed
            if ($preferredProvider === 'openrouter') {
                if ($geminiKey !== '') {
                    $geminiResult = $this->analyzeWithGemini($capture, $geminiKey, $imageData, $mimeType, $prompt, $config);
                    if ($geminiResult !== null) {
                        return $geminiResult;
                    }
                }
                if ($openAiKey !== '') {
                    $openAiResult = $this->analyzeWithOpenAi($capture, $openAiKey, $imageData, $mimeType, $prompt, $config);
                    if ($openAiResult !== null) {
                        return $openAiResult;
                    }
                }
            }
        }

        // 2. Fallback: Local OCR / Heuristic Engine
        return $this->runLocalHeuristicAnalysis($capture, $config);
    }

    /**
     * Non-destructive image preprocessing: preserves original contrast & dark-mode backgrounds,
     * only downscaling if photo exceeds 2048px to prevent token/bandwidth bloat.
     */
    public function preprocessImageBytes(string $rawBytes, string $mimeType): string
    {
        if (!extension_loaded('gd') || !str_starts_with($mimeType, 'image/')) {
            return $rawBytes;
        }

        try {
            $img = @imagecreatefromstring($rawBytes);
            if (!$img) {
                return $rawBytes;
            }

            $width = imagesx($img);
            $height = imagesy($img);
            $maxDim = max($width, $height);

            // Downscale only if extremely large (> 2048px) to conserve API bandwidth and avoid timeout
            if ($maxDim > 2048) {
                $scale = 2048 / $maxDim;
                $newWidth = (int) round($width * $scale);
                $newHeight = (int) round($height * $scale);
                $resampled = imagecreatetruecolor($newWidth, $newHeight);
                imagecopyresampled($resampled, $img, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
                imagedestroy($img);

                ob_start();
                imagejpeg($resampled, null, 92);
                $cleanBytes = ob_get_clean();
                imagedestroy($resampled);
                return $cleanBytes ?: $rawBytes;
            }

            imagedestroy($img);
            // Return original pristine bytes directly (prevents compression artifacts & dark-mode distortion)
            return $rawBytes;
        } catch (\Throwable $e) {
            return $rawBytes;
        }
    }

    private function analyzeWithOpenRouter(
        BillingPaymentCapture $capture,
        string $apiKey,
        string $imageData,
        string $mimeType,
        string $prompt,
        array $config
    ): ?array {
        $dataUri = 'data:' . $mimeType . ';base64,' . $imageData;
        $model = (string) ($config['openrouter_model'] ?? 'google/gemini-2.5-flash');
        if (empty($model)) {
            $model = 'google/gemini-2.5-flash';
        }

        $modelsToTry = array_values(array_unique([
            $model,
            'nvidia/nemotron-3.5-super-vl:free',
            'google/gemini-2.5-flash',
            'openai/gpt-4o-mini',
            'google/gemini-3.5-flash',
        ]));

        foreach ($modelsToTry as $currentModel) {
            try {
                $response = Http::withoutVerifying()
                    ->timeout(35)
                    ->withHeaders([
                        'Authorization' => 'Bearer ' . $apiKey,
                        'HTTP-Referer' => 'https://rumahkitanet.my.id',
                        'X-Title' => 'Rumah Kita Network',
                        'Content-Type' => 'application/json',
                    ])
                    ->post('https://openrouter.ai/api/v1/chat/completions', [
                        'model' => $currentModel,
                        'max_tokens' => 1500,
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
                    $status = $response->status();
                    $body = substr($response->body(), 0, 300);
                    Log::warning("OpenRouter model {$currentModel} request failed (status {$status})", [
                        'capture_id' => $capture->id,
                        'status' => $status,
                        'body' => $body,
                    ]);
                    $this->lastAiError = "OpenRouter ({$currentModel}) HTTP {$status}: {$body}";
                    continue;
                }

                $content = (string) data_get($response->json(), 'choices.0.message.content', '');
                $decoded = $this->decodeJsonContent($content);
                if (!is_array($decoded)) {
                    continue;
                }

                $result = $this->normalizeResult($decoded);
                $result['provider_used'] = 'openrouter';
                $result['openrouter_model_used'] = $currentModel;
                return $result;
            } catch (\Throwable $exception) {
                Log::warning("OpenRouter model {$currentModel} analysis failed: " . $exception->getMessage(), [
                    'capture_id' => $capture->id,
                    'error' => $exception->getMessage(),
                ]);
                $this->lastAiError = "OpenRouter error: " . $exception->getMessage();
            }
        }

        return null;
    }

    private function analyzeWithGemini(
        BillingPaymentCapture $capture,
        string $apiKey,
        string $imageData,
        string $mimeType,
        string $prompt,
        array $config
    ): ?array {
        $preferredModel = (string) ($config['gemini_model'] ?? 'gemini-2.5-flash');
        if (empty($preferredModel)) {
            $preferredModel = 'gemini-2.5-flash';
        }
        $models = array_values(array_unique([
            $preferredModel,
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
        ]));

        foreach ($models as $model) {
            $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";

            try {
                $response = Http::withoutVerifying()->timeout(12)->post($url, [
                    'contents' => [
                        [
                            'parts' => [
                                ['text' => $prompt],
                                [
                                    'inline_data' => [
                                        'mime_type' => 'image/jpeg',
                                        'data' => $imageData,
                                    ],
                                ],
                            ],
                        ],
                    ],
                    'generationConfig' => [
                        'response_mime_type' => 'application/json',
                    ],
                ]);

                if (!$response->successful()) {
                    $status = $response->status();
                    $body = substr($response->body(), 0, 300);
                    Log::warning("Gemini model {$model} payment proof request failed (status {$status})", [
                        'capture_id' => $capture->id,
                        'status' => $status,
                        'body' => $body,
                    ]);

                    // Jika kuota free tier Google untuk project ini habis (429 RESOURCE_EXHAUSTED), jangan gantung request! Keluar segera!
                    if ($status === 429) {
                        $this->lastAiError = 'Kuota Google Gemini API harian habis (HTTP 429). Buat API key di project baru Google AI Studio.';
                        Log::warning("Google Gemini API Quota 429 Exceeded on model {$model}. Exiting immediately.");
                        break;
                    }
                    continue;
                }

                $rawText = (string) data_get($response->json(), 'candidates.0.content.parts.0.text', '');
                $decoded = $this->decodeJsonContent($rawText);
                if (!is_array($decoded)) {
                    continue;
                }

                $result = $this->normalizeResult($decoded);
                $result['provider_used'] = 'gemini';
                return $result;
            } catch (\Throwable $exception) {
                Log::warning("Gemini model {$model} payment proof analysis failed: " . $exception->getMessage(), [
                    'capture_id' => $capture->id,
                ]);
            }
        }

        return null;
    }

    private function analyzeWithOpenAi(
        BillingPaymentCapture $capture,
        string $apiKey,
        string $imageData,
        string $mimeType,
        string $prompt,
        array $config
    ): ?array {
        $dataUri = 'data:' . $mimeType . ';base64,' . $imageData;
        $model = (string) ($config['openai_model'] ?? 'gpt-4o-mini');

        try {
            $response = Http::timeout(60)
                ->withToken($apiKey)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
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
                Log::warning('OpenAI payment proof analysis request failed', [
                    'capture_id' => $capture->id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return null;
            }

            $content = (string) data_get($response->json(), 'choices.0.message.content', '');
            $decoded = $this->decodeJsonContent($content);
            if (!is_array($decoded)) {
                return null;
            }

            $result = $this->normalizeResult($decoded);
            $result['provider_used'] = 'openai';
            return $result;
        } catch (\Throwable $exception) {
            Log::warning('OpenAI payment proof analysis failed', [
                'capture_id' => $capture->id,
                'error' => $exception->getMessage(),
            ]);
            return null;
        }
    }

    private function runLocalHeuristicAnalysis(BillingPaymentCapture $capture, array $config): array
    {
        $mediaPath = (string) data_get($capture->meta, 'media.path', '');
        $fullPath = $mediaPath !== '' && Storage::disk('public')->exists($mediaPath)
            ? Storage::disk('public')->path($mediaPath)
            : null;

        $ocrText = null;
        $ocrProvider = 'local_heuristic';

        if ($fullPath && file_exists($fullPath)) {
            $ocrText = $this->runLocalTesseractOcr($fullPath);
            if ($ocrText !== null && trim($ocrText) !== '') {
                $ocrProvider = 'local_tesseract_ocr';
            }
        }

        $caption = trim((string) data_get($capture->meta, 'source.caption', ''));
        $combinedText = trim(($ocrText ?? '') . "\n" . $caption);

        $customer = $capture->customer ?: $this->customerResolutionService->resolveFromCapture($capture);
        if (!$customer && $ocrText !== null && $ocrText !== '') {
            $customer = $this->customerResolutionService->resolveFromText($ocrText);
        }

        $parsed = $this->parseReceiptPatterns($combinedText);

        if (!$customer && !empty($parsed['sender_name']) && strlen($parsed['sender_name']) >= 3) {
            $customer = \App\Models\Customer::query()
                ->where('name', 'like', "%{$parsed['sender_name']}%")
                ->first();
        }

        $activeInvoice = null;
        if ($customer) {
            $activeInvoice = $this->customerResolutionService->findActiveInvoices($customer)->first();
        }
        if (!$activeInvoice && $capture->invoice) {
            $activeInvoice = $capture->invoice;
        }

        $amount = $parsed['amount'];
        $isPaymentProof = (bool) $parsed['is_payment_proof'];

        if (!$isPaymentProof) {
            $rawSummary = $this->lastAiError
                ? 'AI tidak dapat membaca bukti bayar (' . $this->lastAiError . '). Perlu review manual.'
                : 'Bukan bukti pembayaran (tidak ditemukan tanda transaksi transfer/struk)';

            return [
                'is_payment_proof' => false,
                'amount' => 0,
                'paid_date' => null,
                'paid_time' => null,
                'reference_code' => null,
                'payment_channel' => null,
                'sender_name' => null,
                'destination_identity' => [
                    'name' => null,
                    'account_number' => null,
                    'merchant_id' => null,
                    'raw' => null,
                ],
                'success_status' => false,
                'confidence_overall' => 0.0,
                'confidence_by_field' => [
                    'payment_proof' => 0.0,
                    'amount' => 0.0,
                    'date' => 0.0,
                    'time' => 0.0,
                    'destination' => 0.0,
                    'success_status' => 0.0,
                ],
                'ocr_raw_text' => $ocrText,
                'raw_summary' => $rawSummary,
                'provider_used' => $ocrProvider,
                'ai_error' => $this->lastAiError,
            ];
        }

        if (!$amount && $activeInvoice) {
            $amount = (float) $activeInvoice->amount;
        }

        $successStatus = $parsed['success_status'] || $activeInvoice !== null;
        $channel = $parsed['payment_channel'] ?: ($activeInvoice ? 'Transfer Bank / QRIS' : 'Transfer Bank');
        $referenceCode = $parsed['reference_code'] ?: null;
        if ($referenceCode !== null) {
            $refLower = strtolower($referenceCode);
            if (str_starts_with($refLower, 'inv_') || str_starts_with($refLower, 'invoice') || ($activeInvoice && $refLower === strtolower((string) $activeInvoice->invoice_link))) {
                $referenceCode = null;
            }
        }

        $confidence = 50.0;
        if ($customer) {
            $confidence += 25.0;
        }
        if ($activeInvoice) {
            $confidence += 15.0;
        }
        if ($parsed['amount'] && $activeInvoice && abs((float)$activeInvoice->amount - (float)$parsed['amount']) <= 0.01) {
            $confidence += 10.0;
        }
        if ($parsed['paid_date']) {
            $confidence += 5.0;
        }
        if ($parsed['paid_time']) {
            $confidence += 5.0;
        }
        if ($referenceCode !== null) {
            $confidence += 5.0;
        }
        if ($parsed['success_status']) {
            $confidence += 5.0;
        }
        if ($ocrProvider === 'local_tesseract_ocr') {
            $confidence += 5.0;
        }

        $confidence = min(100.0, max(20.0, $confidence));

        $summaryParts = [];
        if ($customer) {
            $summaryParts[] = "Pelanggan: {$customer->name}";
        }
        if ($amount) {
            $summaryParts[] = "Nominal: Rp " . number_format($amount, 0, ',', '.');
        }
        if ($channel) {
            $summaryParts[] = "Metode: {$channel}";
        }
        if ($activeInvoice) {
            $summaryParts[] = "Tagihan #{$activeInvoice->invoice_number}";
        }
        $rawSummary = implode(' · ', $summaryParts) ?: ($isPaymentProof ? 'Bukti transfer terdeteksi' : 'Bukan bukti pembayaran');
        if ($this->lastAiError) {
            $rawSummary .= ' · ⚠️ ' . $this->lastAiError;
        }

        $paidDateResolved = $parsed['paid_date'] ?: ($capture->paid_date ? optional($capture->paid_date)->toDateString() : now()->toDateString());
        $paidTimeResolved = $parsed['paid_time'] ?: null;

        Log::info('Local payment proof analysis completed', [
            'capture_id' => $capture->id,
            'customer_id' => $customer?->id,
            'invoice_id' => $activeInvoice?->id,
            'amount' => $amount,
            'paid_date' => $paidDateResolved,
            'paid_time' => $paidTimeResolved,
            'reference_code' => $referenceCode,
            'sender_name' => $parsed['sender_name'] ?? null,
            'confidence' => $confidence,
            'provider' => $ocrProvider,
            'ai_error' => $this->lastAiError,
        ]);

        return [
            'is_payment_proof' => $isPaymentProof,
            'amount' => $amount,
            'paid_date' => $paidDateResolved,
            'paid_time' => $paidTimeResolved,
            'reference_code' => $referenceCode,
            'payment_channel' => $channel,
            'sender_name' => $parsed['sender_name'] ?? null,
            'destination_identity' => [
                'name' => $parsed['destination_name'] ?: 'Rumah Kita Network',
                'account_number' => $parsed['destination_account'],
                'merchant_id' => $parsed['destination_merchant_id'],
                'raw' => $parsed['destination_name'] ?: 'Rumah Kita Network',
            ],
            'success_status' => $successStatus,
            'confidence_overall' => $confidence,
            'confidence_by_field' => [
                'payment_proof' => $isPaymentProof ? 90.0 : 30.0,
                'amount' => $amount ? 90.0 : 20.0,
                'date' => $parsed['paid_date'] ? 95.0 : 70.0,
                'time' => $paidTimeResolved ? 95.0 : 50.0,
                'destination' => 85.0,
                'success_status' => $successStatus ? 90.0 : 40.0,
            ],
            'ocr_raw_text' => $ocrText,
            'raw_summary' => $rawSummary,
            'provider_used' => $ocrProvider,
            'ai_error' => $this->lastAiError,
        ];
    }

    private function runLocalTesseractOcr(string $fullPath): ?string
    {
        try {
            $tesseractBin = $this->findTesseractBinary();
            if (!$tesseractBin) {
                return null;
            }

            $process = new Process([
                $tesseractBin,
                $fullPath,
                'stdout',
                '-l', 'ind+eng',
                '--psm', '6',
            ]);
            $process->setTimeout(15);
            $process->run();

            if ($process->isSuccessful()) {
                return trim($process->getOutput());
            }

            $processFallback = new Process([$tesseractBin, $fullPath, 'stdout']);
            $processFallback->setTimeout(15);
            $processFallback->run();

            return $processFallback->isSuccessful() ? trim($processFallback->getOutput()) : null;
        } catch (\Throwable $e) {
            Log::info('Local Tesseract OCR skipped: ' . $e->getMessage());
            return null;
        }
    }

    private function findTesseractBinary(): ?string
    {
        $candidates = [
            'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
            'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
            '/usr/bin/tesseract',
            '/usr/local/bin/tesseract',
            'tesseract',
        ];

        foreach ($candidates as $bin) {
            try {
                if (file_exists($bin)) {
                    return $bin;
                }
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    private function parseReceiptPatterns(string $text): array
    {
        $normalized = strtolower($text);

        // 1. Amount
        $amount = null;
        if (preg_match('~(?:total|nominal|jumlah|transfer|sebesar|rp)\s*:?\s*(?:rp\.?)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{5,})~i', $text, $m)) {
            $amount = (float) str_replace(['.', ','], '', $m[1]);
        } elseif (preg_match('~\brp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{5,})\b~i', $text, $m)) {
            $amount = (float) str_replace(['.', ','], '', $m[1]);
        } elseif (preg_match('~\b([1-9][0-9]{4,6})\b~', $text, $m)) {
            $candidate = (float) $m[1];
            if ($candidate >= 50000 && $candidate <= 5000000) {
                $amount = $candidate;
            }
        }

        // 2. Reference Code / Transaction ID / RRN / Receipt No
        $ref = null;
        $patterns = [
            '~(?:no\.?\s*transaksi|nomor\s*transaksi|transaction\s*(?:no|id|number)?|id\s*transaksi|trx\s*id|kode\s*transaksi)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
            '~(?:no\.?\s*referensi|nomor\s*referensi|no\.?\s*ref\b|reference\s*(?:no|number|id)?)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
            '~(?:r[rn]\b|kode\s*rrn|retrieval\s*reference\s*(?:no|number)?)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
            '~(?:no\.?\s*resi|nomor\s*resi|receipt\s*(?:no|number)?|no\.?\s*struk|nomor\s*struk)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
            '~(?:nomor\s*jurnal|no\.?\s*jurnal|journal\s*(?:no|number)?)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
            '~(?:id\s*pesanan|nomor\s*pesanan|order\s*id)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
            '~(?:approval\s*code|kode\s*persetujuan|stan)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{5,30})~i',
            '~(?:ref\.?\s*id|ref)\s*[:#\.\s]?\s*([a-zA-Z0-9\-_]{6,50})~i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $m)) {
                $candidate = trim($m[1]);
                $candLower = strtolower($candidate);
                if (!str_starts_with($candLower, 'inv_') && !str_starts_with($candLower, 'invoice') && $candLower !== 'tagihan') {
                    $ref = $candidate;
                    break;
                }
            }
        }

        // 3. Payment Channel
        $channel = null;
        if (str_contains($normalized, 'qris')) {
            $channel = 'QRIS';
        } elseif (str_contains($normalized, 'bca') || str_contains($normalized, 'mybca') || str_contains($normalized, 'klikbca')) {
            $channel = 'BCA Mobile';
        } elseif (str_contains($normalized, 'brimo') || str_contains($normalized, 'bri')) {
            $channel = 'BRImo';
        } elseif (str_contains($normalized, 'livin') || str_contains($normalized, 'mandiri')) {
            $channel = 'Livin Mandiri';
        } elseif (str_contains($normalized, 'bni')) {
            $channel = 'BNI Mobile';
        } elseif (str_contains($normalized, 'bsi')) {
            $channel = 'BSI Mobile';
        } elseif (str_contains($normalized, 'seabank')) {
            $channel = 'SeaBank';
        } elseif (str_contains($normalized, 'jago')) {
            $channel = 'Bank Jago';
        } elseif (str_contains($normalized, 'dana')) {
            $channel = 'DANA';
        } elseif (str_contains($normalized, 'gopay')) {
            $channel = 'GoPay';
        } elseif (str_contains($normalized, 'ovo')) {
            $channel = 'OVO';
        } elseif (str_contains($normalized, 'shopeepay')) {
            $channel = 'ShopeePay';
        } elseif (str_contains($normalized, 'linkaja')) {
            $channel = 'LinkAja';
        }

        // 4. Success Status
        $isSuccess = str_contains($normalized, 'berhasil')
            || str_contains($normalized, 'sukses')
            || str_contains($normalized, 'success')
            || str_contains($normalized, 'lunas')
            || str_contains($normalized, 'selesai')
            || str_contains($normalized, 'terkirim')
            || str_contains($normalized, 'transfer')
            || str_contains($normalized, 'qris');

        // 5. Date & Time
        $paidDate = null;
        $paidTime = null;

        $monthMap = [
            'jan' => 1, 'januari' => 1, 'january' => 1,
            'feb' => 2, 'februari' => 2, 'february' => 2,
            'mar' => 3, 'maret' => 3, 'march' => 3,
            'apr' => 4, 'april' => 4,
            'mei' => 5, 'may' => 5,
            'jun' => 6, 'juni' => 6, 'june' => 6,
            'jul' => 7, 'juli' => 7, 'july' => 7,
            'agu' => 8, 'agustus' => 8, 'agt' => 8, 'aug' => 8, 'august' => 8,
            'sep' => 9, 'september' => 9,
            'okt' => 10, 'oktober' => 10, 'oct' => 10, 'october' => 10,
            'nop' => 11, 'nov' => 11, 'november' => 11,
            'des' => 12, 'desember' => 12, 'dec' => 12, 'december' => 12,
        ];

        // Priority 1: Match combined date & time (e.g. "13 Okt 2026, 11:36" or "13 Okt 2026 • 11:36 WIB" or "13/10/2026 11:36:20")
        if (preg_match('~\b([0-9]{1,2})\s+([a-zA-Z]{3,10})\s+([0-9]{4})(?:[,\s•/]+(?:pukul\s*|jam\s*)?([0-9]{1,2}[:.][0-9]{2}(?:[:.][0-9]{2})?))?~i', $text, $m)) {
            $monthKey = strtolower(substr($m[2], 0, 3));
            $monthNum = $monthMap[$monthKey] ?? ($monthMap[strtolower($m[2])] ?? null);
            if ($monthNum) {
                $paidDate = sprintf('%04d-%02d-%02d', (int) $m[3], (int) $monthNum, (int) $m[1]);
            }
            if (!empty($m[4])) {
                $timeParts = preg_split('/[:.]/', $m[4]);
                $hour = (int) ($timeParts[0] ?? 0);
                $min = (int) ($timeParts[1] ?? 0);
                $sec = (int) ($timeParts[2] ?? 0);
                if ($hour >= 0 && $hour <= 23 && $min >= 0 && $min <= 59) {
                    $paidTime = sprintf('%02d:%02d:%02d', $hour, $min, $sec);
                }
            }
        } elseif (preg_match('~\b([0-9]{1,2})[/\-.]([0-9]{1,2})[/\-.]([0-9]{4})(?:[,\s•/]+(?:pukul\s*|jam\s*)?([0-9]{1,2}[:.][0-9]{2}(?:[:.][0-9]{2})?))?~', $text, $m)) {
            $paidDate = sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);
            if (!empty($m[4])) {
                $timeParts = preg_split('/[:.]/', $m[4]);
                $hour = (int) ($timeParts[0] ?? 0);
                $min = (int) ($timeParts[1] ?? 0);
                $sec = (int) ($timeParts[2] ?? 0);
                if ($hour >= 0 && $hour <= 23 && $min >= 0 && $min <= 59) {
                    $paidTime = sprintf('%02d:%02d:%02d', $hour, $min, $sec);
                }
            }
        } elseif (preg_match('~\b([0-9]{4})[/\-.]([0-9]{1,2})[/\-.]([0-9]{1,2})(?:[,\s•/]+(?:pukul\s*|jam\s*)?([0-9]{1,2}[:.][0-9]{2}(?:[:.][0-9]{2})?))?~', $text, $m)) {
            $paidDate = sprintf('%04d-%02d-%02d', (int) $m[1], (int) $m[2], (int) $m[3]);
            if (!empty($m[4])) {
                $timeParts = preg_split('/[:.]/', $m[4]);
                $hour = (int) ($timeParts[0] ?? 0);
                $min = (int) ($timeParts[1] ?? 0);
                $sec = (int) ($timeParts[2] ?? 0);
                if ($hour >= 0 && $hour <= 23 && $min >= 0 && $min <= 59) {
                    $paidTime = sprintf('%02d:%02d:%02d', $hour, $min, $sec);
                }
            }
        }

        // Priority 2: If time was not captured in combined date-time, look for explicit time markers
        if (!$paidTime) {
            if (preg_match('~(?:waktu\s*transaksi|waktu|jam|pukul|time)\s*[:\s]*([0-9]{1,2}[:.][0-9]{2}(?:[:.][0-9]{2})?)\s*(?:wib|wita|wit)?~i', $text, $m)) {
                $timeParts = preg_split('/[:.]/', $m[1]);
                $hour = (int) ($timeParts[0] ?? 0);
                $min = (int) ($timeParts[1] ?? 0);
                $sec = (int) ($timeParts[2] ?? 0);
                if ($hour >= 0 && $hour <= 23 && $min >= 0 && $min <= 59) {
                    $paidTime = sprintf('%02d:%02d:%02d', $hour, $min, $sec);
                }
            } elseif (preg_match('~\b([0-9]{1,2})[:.]([0-9]{2})(?:[:.]([0-9]{2}))?\s*(?:wib|wita|wit)\b~i', $text, $m)) {
                $sec = !empty($m[3]) ? $m[3] : '00';
                $paidTime = sprintf('%02d:%02d:%02d', (int) $m[1], (int) $m[2], (int) $sec);
            } elseif (preg_match('~\b([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?\b~', $text, $m)) {
                $sec = !empty($m[3]) ? $m[3] : '00';
                $paidTime = sprintf('%02d:%02d:%02d', (int) $m[1], (int) $m[2], (int) $sec);
            }
        }

        // 6. Destination Extraction
        $destName = null;
        $destAccount = null;
        $destMerchantId = null;

        if (preg_match('~(?:ke|penerima|tujuan)\s*:?\s*([a-zA-Z\s]{3,30})~i', $text, $m)) {
            $destName = trim($m[1]);
        }
        if (preg_match('~(?:rekening|no\.?\s*rek)\s*:?\s*([0-9]{8,18})~i', $text, $m)) {
            $destAccount = trim($m[1]);
        }
        if (preg_match('~(?:nmid|merchant\s*id)\s*:?\s*([a-zA-Z0-9]+)~i', $text, $m)) {
            $destMerchantId = trim($m[1]);
        }

        // 7. Sender Extraction
        $senderName = null;
        if (preg_match('~\b(?:dari|pengirim|sender|atas\s*nama|a\.?n\b|an\b)\s*[:#\.\s]?\s*([a-zA-Z\s]{3,35})~i', $text, $m)) {
            $candName = trim($m[1]);
            $candName = preg_replace('~\s*(?:\(|-)?\s*(?:seabank|bca|bri|bni|mandiri|bank|[0-9*]{4,}).*$~i', '', $candName);
            $candName = trim($candName);
            $stopWords = ['bank', 'rekening', 'anda', 'kamu', 'qris', 'seabank', 'bca', 'bri', 'bni', 'mandiri', 'dana', 'gopay', 'ovo', 'shopeepay'];
            if (strlen($candName) >= 3 && !in_array(strtolower($candName), $stopWords, true)) {
                $senderName = $candName;
            }
        }

        // Negative keywords for non-receipt photos (e.g., speedtests, cable issues, router lights)
        $negativeKeywords = [
            'speedtest', 'download mbps', 'upload mbps', 'ping ms', 'jitter', 'ookla',
            'lampu los', 'kabel putus', 'kabel putuz', 'odp rusak', 'modem mati', 'red light',
            'gangguan massal', 'keluhan internet', 'sinyal hilang',
        ];
        $isNegative = false;
        foreach ($negativeKeywords as $nk) {
            if (str_contains($normalized, $nk)) {
                $isNegative = true;
                break;
            }
        }

        $hasReceiptMarkers = false;
        if (!$isNegative) {
            if ($amount !== null && ($channel !== null || !empty($ref) || $isSuccess)) {
                $hasReceiptMarkers = true;
            } elseif ($channel !== null && (!empty($ref) || $isSuccess)) {
                $hasReceiptMarkers = true;
            }
        }

        $isPaymentProof = $hasReceiptMarkers;

        return [
            'is_payment_proof' => $isPaymentProof,
            'amount' => $amount,
            'reference_code' => $ref,
            'payment_channel' => $channel,
            'sender_name' => $senderName,
            'success_status' => $isSuccess,
            'paid_date' => $paidDate,
            'paid_time' => $paidTime,
            'destination_name' => $destName,
            'destination_account' => $destAccount,
            'destination_merchant_id' => $destMerchantId,
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

    private function normalizeResult(array $decoded): array
    {
        $rawRef = $this->stringOrNull($decoded['reference_code'] ?? null);
        if ($rawRef !== null) {
            $lower = strtolower($rawRef);
            if (str_starts_with($lower, 'inv_') || str_starts_with($lower, 'invoice') || $lower === 'null' || $lower === 'none' || $lower === '-') {
                $rawRef = null;
            }
        }

        $rawOcr = (string) ($decoded['ocr_raw_text'] ?? '');
        $amount = isset($decoded['amount']) && is_numeric($decoded['amount']) ? round((float) $decoded['amount'], 2) : null;
        $paidDate = $this->stringOrNull($decoded['paid_date'] ?? null);
        $paidTime = $this->stringOrNull($decoded['paid_time'] ?? null);
        $senderName = $this->stringOrNull($decoded['sender_name'] ?? null);
        $channel = $this->stringOrNull($decoded['payment_channel'] ?? null);
        $isPaymentProof = (bool) ($decoded['is_payment_proof'] ?? false);
        $successStatus = (bool) ($decoded['success_status'] ?? false);

        // If AI explicitly concluded that the image is NOT a payment proof, never override it!
        if (array_key_exists('is_payment_proof', $decoded) && !$decoded['is_payment_proof']) {
            return [
                'is_payment_proof' => false,
                'amount' => 0,
                'paid_date' => null,
                'paid_time' => null,
                'reference_code' => null,
                'payment_channel' => null,
                'sender_name' => null,
                'destination_identity' => [
                    'name' => null,
                    'account_number' => null,
                    'merchant_id' => null,
                    'raw' => null,
                ],
                'success_status' => false,
                'confidence_overall' => 0.0,
                'confidence_by_field' => [
                    'payment_proof' => 0.0,
                    'amount' => 0.0,
                    'date' => 0.0,
                    'time' => 0.0,
                    'destination' => 0.0,
                    'success_status' => 0.0,
                ],
                'ocr_raw_text' => $rawOcr ?: null,
                'raw_summary' => $this->stringOrNull($decoded['raw_summary'] ?? null) ?: 'Bukan bukti pembayaran (foto keluhan/jalan/perangkat/non-transaksi)',
            ];
        }

        // Fallback safety net: if AI omitted structured fields but provided ocr_raw_text
        if ($rawOcr !== '') {
            $parsed = $this->parseReceiptPatterns($rawOcr);
            if (($amount === null || $amount <= 0) && !empty($parsed['amount'])) {
                $amount = round((float) $parsed['amount'], 2);
            }
            if (!$paidDate && !empty($parsed['paid_date'])) {
                $paidDate = $parsed['paid_date'];
            }
            if (!$paidTime && !empty($parsed['paid_time'])) {
                $paidTime = $parsed['paid_time'];
            }
            if (!$senderName && !empty($parsed['sender_name'])) {
                $senderName = $parsed['sender_name'];
            }
            if (!$rawRef && !empty($parsed['reference_code'])) {
                $rawRef = $parsed['reference_code'];
            }
            if (!$channel && !empty($parsed['payment_channel'])) {
                $channel = $parsed['payment_channel'];
            }
            if (!$successStatus && $parsed['success_status']) {
                $successStatus = true;
            }
            if (!$isPaymentProof && $parsed['is_payment_proof']) {
                $isPaymentProof = true;
            }
        }

        $conf = $this->normalizeConfidence($decoded['confidence_overall'] ?? 0);
        if ($conf <= 0 && $amount && $amount > 0) {
            $conf = 90.0;
        } elseif ($conf <= 0 && $isPaymentProof) {
            $conf = 75.0;
        }

        return [
            'is_payment_proof' => $isPaymentProof,
            'amount' => $amount,
            'paid_date' => $paidDate,
            'paid_time' => $paidTime,
            'reference_code' => $rawRef,
            'payment_channel' => $channel,
            'sender_name' => $senderName,
            'destination_identity' => [
                'name' => $this->stringOrNull(data_get($decoded, 'destination_identity.name')),
                'account_number' => $this->stringOrNull(data_get($decoded, 'destination_identity.account_number')),
                'merchant_id' => $this->stringOrNull(data_get($decoded, 'destination_identity.merchant_id')),
                'raw' => $this->stringOrNull(data_get($decoded, 'destination_identity.raw')),
            ],
            'success_status' => $successStatus,
            'confidence_overall' => $conf,
            'confidence_by_field' => [
                'payment_proof' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.payment_proof', $conf)),
                'amount' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.amount', $conf)),
                'date' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.date', $conf)),
                'time' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.time', $conf)),
                'destination' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.destination', $conf)),
                'success_status' => $this->normalizeConfidence(data_get($decoded, 'confidence_by_field.success_status', $conf)),
            ],
            'ocr_raw_text' => $this->stringOrNull($decoded['ocr_raw_text'] ?? null),
            'raw_summary' => $this->stringOrNull($decoded['raw_summary'] ?? null),
        ];
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
}

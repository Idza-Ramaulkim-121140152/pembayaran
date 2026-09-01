<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

class PaymentProofAnalysisService
{
    public function __construct(
        private PaymentVerificationConfigService $configService,
        private CustomerResolutionService $customerResolutionService,
    ) {
    }

    /**
     * Analyze payment capture using 100% Free & Local OCR / Pattern Engine
     */
    public function analyze(BillingPaymentCapture $capture): array
    {
        $config = $this->configService->getConfig();
        $mediaPath = (string) data_get($capture->meta, 'media.path', '');
        $fullPath = $mediaPath !== '' && Storage::disk('public')->exists($mediaPath)
            ? Storage::disk('public')->path($mediaPath)
            : null;

        // 1. Try Local Free Tesseract OCR if available on server
        $ocrText = null;
        $ocrProvider = 'local_heuristic';

        if ($fullPath && file_exists($fullPath)) {
            $ocrText = $this->runLocalTesseractOcr($fullPath);
            if ($ocrText !== null && trim($ocrText) !== '') {
                $ocrProvider = 'local_tesseract_ocr';
            }
        }

        // 2. Extract context from WhatsApp Caption & Source
        $caption = trim((string) data_get($capture->meta, 'source.caption', ''));
        $combinedText = trim(($ocrText ?? '') . "\n" . $caption);

        // 3. Resolve Customer from Phone, Caption, and OCR Text
        $customer = $capture->customer ?: $this->customerResolutionService->resolveFromCapture($capture);
        if (!$customer && $ocrText !== null && $ocrText !== '') {
            $customer = $this->customerResolutionService->resolveFromText($ocrText);
        }

        $activeInvoice = null;
        if ($customer) {
            $activeInvoice = $this->customerResolutionService->findActiveInvoices($customer)->first();
        }
        if (!$activeInvoice && $capture->invoice) {
            $activeInvoice = $capture->invoice;
        }

        // 4. Parse Transfer / Receipt Data from Combined Text
        $parsed = $this->parseReceiptPatterns($combinedText);

        $amount = $parsed['amount'];
        if (!$amount && $activeInvoice) {
            $amount = (float) $activeInvoice->amount;
        }

        $isPaymentProof = $parsed['is_payment_proof'] || $activeInvoice !== null || $customer !== null;
        $successStatus = $parsed['success_status'] || $activeInvoice !== null;
        $channel = $parsed['payment_channel'] ?: ($activeInvoice ? 'Transfer Bank / QRIS' : 'Transfer Bank');
        $referenceCode = $parsed['reference_code'] ?: ($activeInvoice?->invoice_link ?: data_get($capture->meta, 'source.message_id'));

        // 5. Calculate Confidence
        $confidence = 50.0;
        if ($customer) {
            $confidence += 25.0; // Customer recognized
        }
        if ($activeInvoice) {
            $confidence += 15.0; // Active bill found
        }
        if ($parsed['amount'] && $activeInvoice && abs((float)$activeInvoice->amount - (float)$parsed['amount']) <= 0.01) {
            $confidence += 10.0; // Exact amount match
        }
        if ($parsed['success_status']) {
            $confidence += 5.0; // Explicit "BERHASIL / SUKSES" keyword
        }
        if ($ocrProvider === 'local_tesseract_ocr') {
            $confidence += 5.0; // Text read directly from image
        }

        $confidence = min(100.0, max(20.0, $confidence));

        // Generate Human-Readable Summary
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

        Log::info('Local payment proof analysis completed', [
            'capture_id' => $capture->id,
            'customer_id' => $customer?->id,
            'invoice_id' => $activeInvoice?->id,
            'amount' => $amount,
            'confidence' => $confidence,
            'provider' => $ocrProvider,
        ]);

        return [
            'is_payment_proof' => $isPaymentProof,
            'amount' => $amount,
            'paid_date' => $parsed['paid_date'] ?: ($capture->paid_date ?: now()->toDateString()),
            'paid_time' => $parsed['paid_time'] ?: now()->format('H:i'),
            'reference_code' => $referenceCode,
            'payment_channel' => $channel,
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
                'date' => 85.0,
                'time' => 80.0,
                'destination' => 85.0,
                'success_status' => $successStatus ? 90.0 : 40.0,
            ],
            'ocr_raw_text' => $ocrText,
            'raw_summary' => $rawSummary,
            'provider_used' => $ocrProvider,
        ];
    }

    /**
     * Run local Tesseract OCR if binary exists on server (100% Free & Local)
     */
    private function runLocalTesseractOcr(string $fullPath): ?string
    {
        try {
            // Check if tesseract binary exists
            $tesseractBin = $this->findTesseractBinary();
            if (!$tesseractBin) {
                return null;
            }

            $process = new Process([
                $tesseractBin,
                $fullPath,
                'stdout',
                '-l', 'ind+eng',
                '--oem', '1',
                '--psm', '3',
            ]);
            $process->setTimeout(15);
            $process->run();

            if ($process->isSuccessful()) {
                $output = trim($process->getOutput());
                return $output !== '' ? $output : null;
            }
        } catch (\Throwable $e) {
            Log::debug('Local Tesseract OCR skipped: ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Find path of tesseract binary across Windows / Linux
     */
    private function findTesseractBinary(): ?string
    {
        $commonPaths = [
            'tesseract',
            '/usr/bin/tesseract',
            '/usr/local/bin/tesseract',
            'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
            'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
        ];

        foreach ($commonPaths as $path) {
            try {
                $process = new Process([$path, '--version']);
                $process->setTimeout(3);
                $process->run();
                if ($process->isSuccessful()) {
                    return $path;
                }
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    /**
     * Parse receipt text with intelligent regex pattern matchers for Indonesian banks & e-wallets
     */
    private function parseReceiptPatterns(string $text): array
    {
        $normalized = strtolower($text);

        // 1. Amount
        $amount = null;
        if (preg_match('/(?:total|nominal|jumlah|transfer|sebesar|rp)\s*:?\s*(?:rp\.?)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{5,})/i', $text, $m)) {
            $amount = (float) str_replace(['.', ','], '', $m[1]);
        } elseif (preg_match('/\brp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{5,})\b/i', $text, $m)) {
            $amount = (float) str_replace(['.', ','], '', $m[1]);
        } elseif (preg_match('/\b([1-9][0-9]{4,6})\b/', $text, $m)) {
            $candidate = (float) $m[1];
            // Filter reasonable ISP payment range (e.g. 50k to 5M)
            if ($candidate >= 50000 && $candidate <= 5000000) {
                $amount = $candidate;
            }
        }

        // 2. Reference Code / Transaction ID
        $ref = null;
        if (preg_match('/(?:no\.?\s*referensi|nomor\s*transaksi|id\s*transaksi|ref\.?\s*id|reference|no\.?\s*resi)\s*:?\s*([a-zA-Z0-9\-_]+)/i', $text, $m)) {
            $ref = trim($m[1]);
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
        if (preg_match('/\b([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{4})\b/', $text, $m)) {
            $paidDate = sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
        }
        if (preg_match('/\b([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\b/', $text, $m)) {
            $paidTime = substr($m[1], 0, 5);
        }

        // 6. Destination Extraction
        $destName = null;
        $destAccount = null;
        $destMerchantId = null;

        if (preg_match('/(?:ke|penerima|tujuan)\s*:?\s*([a-zA-Z\s]{3,30})/i', $text, $m)) {
            $destName = trim($m[1]);
        }
        if (preg_match('/(?:rekening|no\.?\s*rek)\s*:?\s*([0-9]{8,18})/i', $text, $m)) {
            $destAccount = trim($m[1]);
        }
        if (preg_match('/(?:nmid|merchant\s*id)\s*:?\s*([a-zA-Z0-9]+)/i', $text, $m)) {
            $destMerchantId = trim($m[1]);
        }

        $isPaymentProof = $amount !== null || $channel !== null || $isSuccess;

        return [
            'is_payment_proof' => $isPaymentProof,
            'amount' => $amount,
            'reference_code' => $ref,
            'payment_channel' => $channel,
            'success_status' => $isSuccess,
            'paid_date' => $paidDate,
            'paid_time' => $paidTime,
            'destination_name' => $destName,
            'destination_account' => $destAccount,
            'destination_merchant_id' => $destMerchantId,
        ];
    }
}

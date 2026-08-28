<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

trait PaymentProofGuard
{
    protected function paymentProofMimeList(): string
    {
        return 'jpg,jpeg,png,pdf,webp,heic,heif';
    }

    protected function paymentProofErrorMessage(): string
    {
        return 'Bukti pembayaran harus berupa file JPG, JPEG, PNG, PDF, WEBP, HEIC, atau HEIF (maksimal 2MB).';
    }

    protected function paymentProofUploadErrorMessage(int $errorCode): string
    {
        $maxFileSize = ini_get('upload_max_filesize') ?: '2M';

        return match ($errorCode) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Ukuran file melebihi batas server (' . $maxFileSize . '). Kompres foto lalu coba lagi.',
            UPLOAD_ERR_PARTIAL => 'Upload bukti pembayaran tidak lengkap. Silakan coba lagi.',
            UPLOAD_ERR_NO_TMP_DIR => 'Server tidak menyediakan folder sementara untuk upload. Silakan hubungi admin.',
            UPLOAD_ERR_CANT_WRITE => 'Server gagal menyimpan file upload. Silakan coba lagi.',
            UPLOAD_ERR_EXTENSION => 'Upload ditolak oleh konfigurasi server. Silakan hubungi admin.',
            default => 'Upload bukti pembayaran gagal. Silakan coba lagi.',
        };
    }

    protected function ensurePaymentProofUploadWithinPostLimit(Request $request): void
    {
        $contentType = (string) $request->header('Content-Type');
        if ($contentType === '' || stripos($contentType, 'multipart/form-data') === false) {
            return;
        }

        $contentLength = (int) $request->header('Content-Length');
        if ($contentLength <= 0) {
            return;
        }

        $postMaxBytes = $this->parseIniSizeToBytes((string) ini_get('post_max_size'));
        if ($postMaxBytes > 0 && $contentLength > $postMaxBytes) {
            throw ValidationException::withMessages([
                'bukti_pembayaran' => ['Ukuran upload melebihi batas server. Kompres foto lalu coba lagi.'],
            ]);
        }
    }

    protected function ensurePaymentProofUploadIsValid(Request $request): void
    {
        $file = $request->file('bukti_pembayaran');
        if (!$file instanceof UploadedFile) {
            return;
        }

        if ($file->isValid()) {
            return;
        }

        if ($file->getError() === UPLOAD_ERR_NO_FILE) {
            return;
        }

        throw ValidationException::withMessages([
            'bukti_pembayaran' => [$this->paymentProofUploadErrorMessage($file->getError())],
        ]);
    }

    protected function normalizePaymentProofPath(?string $rawPath): ?string
    {
        $path = trim((string) $rawPath);
        if ($path === '') {
            return null;
        }

        $invalidMarkers = ['0', '1', 'false', 'null'];
        if (in_array(strtolower($path), $invalidMarkers, true)) {
            return null;
        }

        $path = str_replace('\\', '/', $path);
        $path = ltrim($path, '/');

        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, strlen('storage/'));
        }

        if (str_starts_with($path, 'public/')) {
            $path = substr($path, strlen('public/'));
        }

        $path = ltrim((string) $path, '/');
        if ($path === '' || in_array(strtolower($path), $invalidMarkers, true)) {
            return null;
        }

        if ($path === '.' || $path === '..') {
            return null;
        }

        return $path;
    }

    protected function buildPaymentProofUrl(?Invoice $invoice): ?string
    {
        if (!$invoice) {
            return null;
        }

        $normalizedPath = $this->normalizePaymentProofPath($invoice->bukti_pembayaran);
        if ($normalizedPath === null) {
            return null;
        }

        return route('billing.invoice.payment-proof', ['invoice' => $invoice->id], false);
    }

    protected function buildPublicPaymentProofUrl(?string $normalizedPath): ?string
    {
        if ($normalizedPath === null || $normalizedPath === '') {
            return null;
        }

        return '/storage/' . ltrim($normalizedPath, '/');
    }

    protected function inferPaymentProofPreviewType(?string $mimeType, ?string $path): string
    {
        $normalizedMimeType = strtolower(trim((string) $mimeType));
        if (str_contains($normalizedMimeType, 'image/heic') || str_contains($normalizedMimeType, 'image/heif')) {
            return 'other';
        }

        if (str_starts_with($normalizedMimeType, 'image/')) {
            return 'image';
        }

        if (str_contains($normalizedMimeType, 'application/pdf')) {
            return 'pdf';
        }

        $extension = strtolower(pathinfo((string) $path, PATHINFO_EXTENSION));

        return match ($extension) {
            'jpg', 'jpeg', 'png', 'webp' => 'image',
            'pdf' => 'pdf',
            default => 'other',
        };
    }

    protected function appendPaymentProofAttributes(?Invoice $invoice): void
    {
        if (!$invoice) {
            return;
        }

        $normalizedPath = $this->normalizePaymentProofPath($invoice->bukti_pembayaran);
        $hasProof = $normalizedPath !== null && Storage::disk('public')->exists($normalizedPath);
        $proofUrl = $hasProof ? $this->buildPaymentProofUrl($invoice) : null;
        $publicUrl = $hasProof ? $this->buildPublicPaymentProofUrl($normalizedPath) : null;
        $mimeType = $hasProof ? (Storage::disk('public')->mimeType($normalizedPath) ?: null) : null;
        $fileName = $hasProof ? basename($normalizedPath) : null;
        $extension = $hasProof ? strtolower(pathinfo($normalizedPath, PATHINFO_EXTENSION)) : null;
        $previewType = $hasProof ? $this->inferPaymentProofPreviewType($mimeType, $normalizedPath) : null;

        // Pastikan payload selalu konsisten dan tidak membawa marker invalid seperti "0".
        $invoice->setAttribute('bukti_pembayaran', $hasProof ? $normalizedPath : null);
        $invoice->setAttribute('has_payment_proof', $hasProof);
        $invoice->setAttribute('payment_proof_url', $proofUrl);
        $invoice->setAttribute('payment_proof_public_url', $publicUrl);
        $invoice->setAttribute('payment_proof_mime_type', $mimeType);
        $invoice->setAttribute('payment_proof_file_name', $fileName);
        $invoice->setAttribute('payment_proof_extension', $extension);
        $invoice->setAttribute('payment_proof_preview_type', $previewType);
        // Backward compatibility untuk frontend lama.
        $invoice->setAttribute('bukti_pembayaran_url', $proofUrl);
    }

    protected function warnIfPaymentProofPayloadInvalid(Request $request, ?Invoice $invoice, string $channel = 'public'): void
    {
        if (!$request->has('bukti_pembayaran') || $request->hasFile('bukti_pembayaran')) {
            return;
        }

        $rawValue = $request->input('bukti_pembayaran');
        $baseContext = [
            'channel' => $channel,
            'invoice_id' => $invoice?->id ?? $request->input('invoice_id'),
            'invoice_link' => $invoice?->invoice_link,
            'customer_id' => $invoice?->customer_id,
            'user_id' => Auth::id(),
            'is_authenticated' => Auth::check(),
            'content_type' => $request->header('Content-Type'),
            'accept' => $request->header('Accept'),
            'request_uri' => $request->getRequestUri(),
            'route_name' => optional($request->route())->getName(),
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'request_id' => $request->header('X-Request-Id') ?? $request->header('X-Correlation-Id'),
            'expected_mimes' => $this->paymentProofMimeList(),
        ];

        if (is_array($rawValue) || is_object($rawValue)) {
            Log::warning('Unexpected non-file bukti_pembayaran payload received', [
                ...$baseContext,
                'payload_type' => gettype($rawValue),
            ]);
            return;
        }

        $payloadValue = trim((string) $rawValue);
        if ($payloadValue === '') {
            return;
        }

        $invalidMarkers = ['0', '1', 'false', 'null'];
        $lowered = strtolower($payloadValue);

        Log::warning('Unexpected non-file bukti_pembayaran payload received', [
            ...$baseContext,
            'payload_preview' => substr($payloadValue, 0, 120),
            'payload_length' => strlen($payloadValue),
            'payload_marker' => in_array($lowered, $invalidMarkers, true) ? $lowered : null,
        ]);
    }

    protected function ensureNonFilePaymentProofPayloadRejected(Request $request): void
    {
        if (!$request->has('bukti_pembayaran') || $request->hasFile('bukti_pembayaran')) {
            return;
        }

        $rawValue = $request->input('bukti_pembayaran');
        if (is_array($rawValue) || is_object($rawValue)) {
            throw ValidationException::withMessages([
                'bukti_pembayaran' => [$this->paymentProofErrorMessage()],
            ]);
        }

        if (trim((string) $rawValue) === '') {
            return;
        }

        Log::warning('Rejected non-file bukti_pembayaran payload.', [
            'payload_preview' => substr((string) $rawValue, 0, 120),
            'content_type' => $request->header('Content-Type'),
            'request_uri' => $request->getRequestUri(),
            'route_name' => optional($request->route())->getName(),
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'is_authenticated' => Auth::check(),
            'user_id' => Auth::id(),
        ]);

        throw ValidationException::withMessages([
            'bukti_pembayaran' => [$this->paymentProofErrorMessage()],
        ]);
    }

    protected function parseIniSizeToBytes(string $value): int
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return 0;
        }

        $unit = strtolower(substr($trimmed, -1));
        $number = (float) $trimmed;

        return match ($unit) {
            'g' => (int) ($number * 1024 * 1024 * 1024),
            'm' => (int) ($number * 1024 * 1024),
            'k' => (int) ($number * 1024),
            default => (int) $number,
        };
    }
}

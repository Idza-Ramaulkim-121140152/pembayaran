<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use App\Models\Customer;
use App\Models\Invoice;

class PaymentProofValidationService
{
    public function __construct(
        private PaymentVerificationConfigService $configService,
    ) {
    }

    public function validate(BillingPaymentCapture $capture, array $analysis, ?Customer $customer, ?Invoice $invoice): array
    {
        $config = $this->configService->getConfig();
        $autoThreshold = (float) data_get($config, 'confidence_thresholds.auto_approve', 80);
        $reviewThreshold = (float) data_get($config, 'confidence_thresholds.manual_review', 70);
        $destinationMatch = $this->matchDestinationWhitelist(
            (string) ($analysis['payment_channel'] ?? ''),
            (array) ($analysis['destination_identity'] ?? []),
            (array) ($config['destination_whitelist'] ?? [])
        );

        $refCode = trim((string) ($analysis['reference_code'] ?? ''));
        if ($refCode !== '') {
            $refLower = strtolower($refCode);
            if (str_starts_with($refLower, 'inv_') || str_starts_with($refLower, 'invoice') || ($invoice && $refLower === strtolower((string) $invoice->invoice_link))) {
                $refCode = '';
            }
        }

        $isDuplicateRef = false;
        if ($refCode !== '' && strlen($refCode) >= 4) {
            $isDuplicateCapture = BillingPaymentCapture::query()
                ->where('id', '!=', $capture->id)
                ->where('match_status', 'approved')
                ->whereRaw('LOWER(reference_code) = ?', [strtolower($refCode)])
                ->exists();

            $isDuplicateInvoice = Invoice::query()
                ->when($invoice, fn ($q) => $q->where('id', '!=', $invoice->id))
                ->where('status', 'paid')
                ->where(function ($q) use ($refCode) {
                    $q->whereRaw('LOWER(qris_transaction_number) = ?', [strtolower($refCode)]);
                })
                ->exists();

            $isDuplicateTx = false;
            if (\Illuminate\Support\Facades\Schema::hasTable('financial_transactions')) {
                $isDuplicateTx = \App\Models\FinancialTransaction::query()
                    ->where(function ($query) use ($invoice) {
                        if ($invoice) {
                            $query->where('reference_type', '!=', Invoice::class)
                                ->orWhere('reference_id', '!=', $invoice->id)
                                ->orWhereNull('reference_type');
                        }
                    })
                    ->where('meta->qris_transaction_number', $refCode)
                    ->exists();
            }

            $isDuplicateRef = $isDuplicateCapture || $isDuplicateInvoice || $isDuplicateTx;
        }

        // Pengecekan duplikasi file gambar (image hash) untuk mendeteksi kecurangan upload ulang bukti struk yang sama persis
        $fileHash = data_get($capture->meta, 'media.file_hash');
        if (!$fileHash) {
            $mediaPath = (string) data_get($capture->meta, 'media.path', '');
            if ($mediaPath !== '' && \Illuminate\Support\Facades\Storage::disk('public')->exists($mediaPath)) {
                $absPath = \Illuminate\Support\Facades\Storage::disk('public')->path($mediaPath);
                if (file_exists($absPath)) {
                    $fileHash = hash_file('sha256', $absPath);
                }
            }
        }

        $isDuplicateImage = false;
        if ($fileHash) {
            $isDuplicateImage = BillingPaymentCapture::query()
                ->where('id', '!=', $capture->id)
                ->where('match_status', 'approved')
                ->where(function ($q) use ($fileHash) {
                    $q->where('meta->media->file_hash', $fileHash)
                      ->orWhere('meta->file_hash', $fileHash);
                })
                ->exists();
        }

        $isDuplicate = $isDuplicateRef || $isDuplicateImage;

        $amountMatchesInvoice = $invoice && isset($analysis['amount'])
            ? abs((float) $invoice->amount - (float) $analysis['amount']) <= 0.01
            : false;

        $isDestinationTrusted = (bool) (
            $destinationMatch['matched']
            || $capture->source === 'web_public'
            || str_starts_with((string) $capture->source, 'web')
            || ($customer && $amountMatchesInvoice)
        );

        if (!$destinationMatch['matched'] && $isDestinationTrusted) {
            $destinationMatch = [
                'matched' => true,
                'group' => 'trusted_source',
                'entry' => [
                    'name' => ($capture->source === 'web_public' || str_starts_with((string) $capture->source, 'web'))
                        ? 'Web Public Invoice Upload'
                        : 'Customer Invoice Amount Match',
                    'active' => true,
                ],
            ];
        }

        $flags = [
            'customer_identified' => (bool) $customer,
            'active_invoice_found' => (bool) $invoice,
            'is_payment_proof' => (bool) ($analysis['is_payment_proof'] ?? false),
            'success_status' => (bool) ($analysis['success_status'] ?? false),
            'amount_matches_invoice' => $amountMatchesInvoice,
            'destination_whitelisted' => $isDestinationTrusted,
            'is_duplicate_reference' => $isDuplicate,
            'confidence_meets_auto_approve' => (float) ($analysis['confidence_overall'] ?? 0) >= $autoThreshold,
            'confidence_meets_manual_review' => (float) ($analysis['confidence_overall'] ?? 0) >= $reviewThreshold,
        ];

        $failureReason = null;
        $status = 'needs_review';

        if ($flags['is_duplicate_reference']) {
            $failureReason = 'duplicate_reference_code';
            $status = 'rejected';
        } elseif (!$flags['customer_identified']) {
            $failureReason = 'unknown_customer';
            $status = 'needs_review';
        } elseif (!$flags['active_invoice_found']) {
            $failureReason = 'no_active_invoice';
            $status = 'needs_review';
        } elseif (!$flags['is_payment_proof']) {
            $failureReason = 'not_payment_proof';
            $status = 'needs_review';
        } elseif (!$flags['amount_matches_invoice']) {
            $failureReason = 'amount_mismatch';
            $status = 'needs_review';
        } elseif (!$flags['destination_whitelisted']) {
            $failureReason = 'destination_not_whitelisted';
            $status = 'needs_review';
        } elseif (!$flags['confidence_meets_auto_approve']) {
            $failureReason = 'confidence_needs_review';
            $status = 'needs_review';
        } elseif (!(bool) data_get($config, 'auto_approve_enabled', true)) {
            $failureReason = 'auto_approve_disabled';
            $status = 'needs_review';
        } else {
            $status = 'approved';
        }

        return [
            'status' => $status,
            'failure_reason' => $failureReason,
            'is_duplicate' => (bool) $flags['is_duplicate_reference'],
            'duplicate_label' => $flags['is_duplicate_reference'] ? 'Bukti bayar sudah pernah digunakan' : null,
            'validation_flags' => $flags,
            'destination_match' => $destinationMatch,
            'normalized' => [
                'amount' => isset($analysis['amount']) ? round((float) $analysis['amount'], 2) : 0,
                'paid_date' => $analysis['paid_date'] ?: now()->toDateString(),
                'reference_code' => $refCode !== '' ? $refCode : null,
                'payment_channel' => $analysis['payment_channel'] ?? null,
                'transaction_time' => $analysis['paid_time'] ?? null,
            ],
        ];
    }

    private function matchDestinationWhitelist(string $paymentChannel, array $destinationIdentity, array $whitelist): array
    {
        $normalizedChannel = $this->normalizeText($paymentChannel);
        $groupKey = str_contains($normalizedChannel, 'qris') ? 'qris' : 'transfer_bank';
        $rows = is_array($whitelist[$groupKey] ?? null) ? $whitelist[$groupKey] : [];
        $haystacks = array_filter([
            $this->normalizeText((string) ($destinationIdentity['name'] ?? '')),
            $this->normalizeText((string) ($destinationIdentity['account_number'] ?? '')),
            $this->normalizeText((string) ($destinationIdentity['merchant_id'] ?? '')),
            $this->normalizeText((string) ($destinationIdentity['raw'] ?? '')),
        ]);

        foreach ($rows as $row) {
            if (!is_array($row) || !($row['active'] ?? true)) {
                continue;
            }

            $needles = array_filter([
                $this->normalizeText((string) ($row['name'] ?? '')),
                $this->normalizeText((string) ($row['account_number'] ?? '')),
                $this->normalizeText((string) ($row['merchant_id'] ?? '')),
                ...array_map(fn ($alias) => $this->normalizeText((string) $alias), is_array($row['aliases'] ?? null) ? $row['aliases'] : []),
            ]);

            foreach ($needles as $needle) {
                foreach ($haystacks as $haystack) {
                    if ($needle !== '' && str_contains($haystack, $needle)) {
                        return [
                            'matched' => true,
                            'group' => $groupKey,
                            'entry' => $row,
                        ];
                    }
                }
            }
        }

        return [
            'matched' => false,
            'group' => $groupKey,
            'entry' => null,
        ];
    }

    private function normalizeText(string $value): string
    {
        return preg_replace('/\s+/', '', strtolower(trim($value))) ?: '';
    }
}

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
        $autoThreshold = (float) data_get($config, 'confidence_thresholds.auto_approve', 95);
        $reviewThreshold = (float) data_get($config, 'confidence_thresholds.manual_review', 70);
        $destinationMatch = $this->matchDestinationWhitelist(
            (string) ($analysis['payment_channel'] ?? ''),
            (array) ($analysis['destination_identity'] ?? []),
            (array) ($config['destination_whitelist'] ?? [])
        );

        $flags = [
            'customer_identified' => (bool) $customer,
            'active_invoice_found' => (bool) $invoice,
            'is_payment_proof' => (bool) ($analysis['is_payment_proof'] ?? false),
            'success_status' => (bool) ($analysis['success_status'] ?? false),
            'amount_matches_invoice' => $invoice && isset($analysis['amount'])
                ? abs((float) $invoice->amount - (float) $analysis['amount']) <= 0.01
                : false,
            'destination_whitelisted' => $destinationMatch['matched'],
            'confidence_meets_auto_approve' => (float) ($analysis['confidence_overall'] ?? 0) >= $autoThreshold,
            'confidence_meets_manual_review' => (float) ($analysis['confidence_overall'] ?? 0) >= $reviewThreshold,
        ];

        $failureReason = null;
        $status = 'needs_review';

        if (!$flags['customer_identified']) {
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
            'validation_flags' => $flags,
            'destination_match' => $destinationMatch,
            'normalized' => [
                'amount' => isset($analysis['amount']) ? round((float) $analysis['amount'], 2) : 0,
                'paid_date' => $analysis['paid_date'] ?: now()->toDateString(),
                'reference_code' => $analysis['reference_code'] ?? data_get($capture->meta, 'source.message_id'),
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

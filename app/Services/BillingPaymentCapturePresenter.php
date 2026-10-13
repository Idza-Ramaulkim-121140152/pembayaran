<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Storage;

class BillingPaymentCapturePresenter
{
    public function present(BillingPaymentCapture $capture): array
    {
        $meta = (array) ($capture->meta ?? []);
        $mediaPath = (string) data_get($meta, 'media.path', '');
        $proofUrl = null;
        if ($mediaPath !== '') {
            if (str_starts_with($mediaPath, 'http://') || str_starts_with($mediaPath, 'https://')) {
                $proofUrl = $mediaPath;
            } else {
                $cleanPath = ltrim(str_replace('public/', '', $mediaPath), '/');
                $proofUrl = '/storage/' . $cleanPath;
            }
        }

        $cleanRefCode = $capture->reference_code;
        if ($cleanRefCode) {
            $refLower = strtolower($cleanRefCode);
            if (str_starts_with($refLower, 'inv_') || str_starts_with($refLower, 'invoice') || ($capture->invoice && $refLower === strtolower((string) $capture->invoice->invoice_link))) {
                $cleanRefCode = null;
            }
        }

        $isDuplicate = (bool) data_get($meta, 'duplicate_receipt_detected', false)
            || data_get($meta, 'validation.failure_reason') === 'duplicate_reference_code'
            || data_get($meta, 'validation.flags.is_duplicate_reference') === true;

        $duplicateLabel = $isDuplicate ? 'Bukti bayar sudah pernah digunakan' : null;

        return [
            'id' => $capture->id,
            'source' => $capture->source,
            'invoice_id' => $capture->invoice_id,
            'customer_id' => $capture->customer_id,
            'amount' => (float) $capture->amount,
            'paid_date' => optional($capture->paid_date)->toDateString(),
            'paid_date_display' => $capture->paid_date ? \Carbon\Carbon::parse($capture->paid_date)->translatedFormat('d M Y') : null,
            'reference_code' => $cleanRefCode,
            'match_status' => !empty(data_get($meta, 'cancelled')) ? 'cancelled' : $capture->match_status,
            'match_confidence' => $capture->match_confidence !== null ? (float) $capture->match_confidence : null,
            'reviewed_at' => optional($capture->reviewed_at)->toISOString(),
            'reviewed_at_display' => $capture->reviewed_at ? \Carbon\Carbon::parse($capture->reviewed_at)->translatedFormat('d M Y, H:i') . ' WIB' : null,
            'created_at' => optional($capture->created_at)->toISOString(),
            'created_at_display' => $capture->created_at ? \Carbon\Carbon::parse($capture->created_at)->translatedFormat('d M Y, H:i') . ' WIB' : null,
            'sender_phone' => data_get($meta, 'sender_phone'),
            'source_message_id' => data_get($meta, 'source.message_id'),
            'proof_url' => $proofUrl,
            'auto_applied' => (bool) data_get($meta, 'auto_applied', false),
            'rollback_data' => data_get($meta, 'rollback_data', null),
            'cancelled_at' => data_get($meta, 'cancelled_at', null),
            'analysis' => data_get($meta, 'analysis', []),
            'validation' => data_get($meta, 'validation', []),
            'media' => data_get($meta, 'media', []),
            'failure_reason' => data_get($meta, 'validation.failure_reason'),
            'duplicate_receipt_detected' => $isDuplicate,
            'duplicate_label' => $duplicateLabel,
            'invoice' => $capture->invoice ? [
                'id' => $capture->invoice->id,
                'invoice_link' => $capture->invoice->invoice_link,
                'status' => $capture->invoice->status,
                'amount' => (float) $capture->invoice->amount,
                'due_date' => optional($capture->invoice->due_date)->toDateString(),
                'paid_at' => optional($capture->invoice->paid_at)->toISOString(),
                'qris_payment_time' => optional($capture->invoice->qris_payment_time)->toISOString(),
                'qris_transaction_number' => $capture->invoice->qris_transaction_number,
                'payment_receiver' => $capture->invoice->relationLoaded('paymentReceiver') && $capture->invoice->paymentReceiver ? [
                    'id' => $capture->invoice->paymentReceiver->id,
                    'name' => $capture->invoice->paymentReceiver->name,
                    'role' => $capture->invoice->paymentReceiver->role,
                ] : null,
            ] : null,
            'customer' => $capture->customer ? [
                'id' => $capture->customer->id,
                'name' => $capture->customer->name,
                'phone' => $capture->customer->phone,
                'pppoe_username' => $capture->customer->pppoe_username,
                'due_date' => optional($capture->customer->due_date)->toDateString(),
                'is_service_isolated' => (bool) ($capture->customer->is_service_isolated ?? false),
            ] : null,
            'match_reviews' => $capture->relationLoaded('matchReviews')
                ? $capture->matchReviews->map(fn ($review) => [
                    'id' => $review->id,
                    'candidate_invoice_id' => $review->candidate_invoice_id,
                    'score' => (float) $review->score,
                    'reason' => $review->reason,
                    'status' => $review->status,
                    'candidate_invoice' => $review->candidateInvoice ? [
                        'id' => $review->candidateInvoice->id,
                        'invoice_link' => $review->candidateInvoice->invoice_link,
                        'status' => $review->candidateInvoice->status,
                        'amount' => (float) $review->candidateInvoice->amount,
                        'due_date' => optional($review->candidateInvoice->due_date)->toDateString(),
                        'customer' => $review->candidateInvoice->customer ? [
                            'id' => $review->candidateInvoice->customer->id,
                            'name' => $review->candidateInvoice->customer->name,
                            'phone' => $review->candidateInvoice->customer->phone,
                            'pppoe_username' => $review->candidateInvoice->customer->pppoe_username,
                        ] : null,
                    ] : null,
                ])->values()->all()
                : [],
        ];
    }

    public function presentPaginator(LengthAwarePaginator $paginator): array
    {
        return [
            'data' => collect($paginator->items())->map(fn ($capture) => $this->present($capture))->values(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ];
    }
}

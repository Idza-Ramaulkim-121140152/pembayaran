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

        return [
            'id' => $capture->id,
            'source' => $capture->source,
            'invoice_id' => $capture->invoice_id,
            'customer_id' => $capture->customer_id,
            'amount' => (float) $capture->amount,
            'paid_date' => optional($capture->paid_date)->toDateString(),
            'reference_code' => $capture->reference_code,
            'match_status' => $capture->match_status,
            'match_confidence' => $capture->match_confidence !== null ? (float) $capture->match_confidence : null,
            'reviewed_at' => optional($capture->reviewed_at)->toISOString(),
            'created_at' => optional($capture->created_at)->toISOString(),
            'sender_phone' => data_get($meta, 'sender_phone'),
            'source_message_id' => data_get($meta, 'source.message_id'),
            'proof_url' => $mediaPath !== '' ? Storage::disk('public')->url($mediaPath) : null,
            'analysis' => data_get($meta, 'analysis', []),
            'validation' => data_get($meta, 'validation', []),
            'media' => data_get($meta, 'media', []),
            'failure_reason' => data_get($meta, 'validation.failure_reason'),
            'invoice' => $capture->invoice ? [
                'id' => $capture->invoice->id,
                'invoice_link' => $capture->invoice->invoice_link,
                'status' => $capture->invoice->status,
                'amount' => (float) $capture->invoice->amount,
                'due_date' => optional($capture->invoice->due_date)->toDateString(),
            ] : null,
            'customer' => $capture->customer ? [
                'id' => $capture->customer->id,
                'name' => $capture->customer->name,
                'phone' => $capture->customer->phone,
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

<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use App\Models\BillingPaymentMatchReview;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PaymentMatchingService
{
    public function __construct(
        private FinancialLedgerService $ledgerService,
        private AuditLogService $auditLogService,
    ) {
    }

    public function capture(array $payload, ?int $actorId = null): array
    {
        $normalized = $this->normalizePayload($payload);
        $fingerprint = $this->fingerprint($normalized);

        $existing = BillingPaymentCapture::query()
            ->with(['invoice:id,invoice_link,customer_id,status,amount', 'matchReviews'])
            ->where('fingerprint', $fingerprint)
            ->first();

        if ($existing) {
            return [
                'capture' => $existing,
                'duplicate' => true,
                'message' => 'Capture pembayaran sudah pernah diproses (idempotent).',
            ];
        }

        $capture = BillingPaymentCapture::query()->create([
            'source' => $normalized['source'],
            'invoice_id' => $normalized['invoice_id'],
            'customer_id' => $normalized['customer_id'],
            'amount' => $normalized['amount'],
            'paid_date' => $normalized['paid_date'],
            'reference_code' => $normalized['reference_code'],
            'fingerprint' => $fingerprint,
            'match_status' => 'pending',
            'meta' => $normalized['meta'],
        ]);

        $capture = $this->matchSingleCapture($capture, true, $actorId);

        $this->auditLogService->log('billing.payment_capture.created', $capture, [
            'source' => $capture->source,
            'amount' => (float) $capture->amount,
            'match_status' => $capture->match_status,
        ], $actorId);

        return [
            'capture' => $capture->load(['invoice:id,invoice_link,customer_id,status,amount', 'matchReviews']),
            'duplicate' => false,
            'message' => 'Capture pembayaran berhasil dibuat.',
        ];
    }

    public function runMatching(?int $captureId = null, bool $autoApply = true, ?int $actorId = null): array
    {
        $query = BillingPaymentCapture::query()->orderBy('id');
        if ($captureId) {
            $query->where('id', $captureId);
        } else {
            $query->whereIn('match_status', ['pending', 'needs_review', 'unmatched', 'matched']);
        }

        $rows = $query->get();
        $summary = [
            'processed' => 0,
            'approved' => 0,
            'needs_review' => 0,
            'unmatched' => 0,
            'skipped_auto_disabled' => 0,
        ];

        foreach ($rows as $capture) {
            $summary['processed']++;
            $matched = $this->matchSingleCapture($capture, $autoApply, $actorId);
            if ($matched->match_status === 'approved') {
                $summary['approved']++;
            } elseif ($matched->match_status === 'needs_review') {
                $summary['needs_review']++;
                if ($autoApply && (bool) (($matched->meta['auto_disabled_by_superadmin'] ?? false))) {
                    $summary['skipped_auto_disabled']++;
                }
            } elseif ($matched->match_status === 'unmatched') {
                $summary['unmatched']++;
            }
        }

        $this->auditLogService->log('billing.payment_capture.match_run', null, [
            'capture_id' => $captureId,
            'auto_apply' => $autoApply,
            'summary' => $summary,
        ], $actorId);

        return $summary;
    }

    public function resolve(BillingPaymentCapture $capture, string $decision, ?int $candidateInvoiceId = null, ?int $actorId = null): BillingPaymentCapture
    {
        if (!in_array($decision, ['approve', 'reject'], true)) {
            throw new \InvalidArgumentException('Decision tidak valid.');
        }

        if ($decision === 'reject') {
            $capture->match_status = 'rejected';
            $capture->reviewed_by = $actorId;
            $capture->reviewed_at = now();
            $capture->save();

            $capture->matchReviews()->update(['status' => 'rejected']);
            $this->auditLogService->log('billing.payment_capture.rejected', $capture, [
                'reason' => 'manual_reject',
            ], $actorId);

            return $capture->fresh(['invoice:id,invoice_link,customer_id,status,amount', 'matchReviews']);
        }

        $review = null;
        if ($candidateInvoiceId) {
            $review = $capture->matchReviews()
                ->where('candidate_invoice_id', $candidateInvoiceId)
                ->first();
        }

        if (!$review) {
            $review = $capture->matchReviews()
                ->orderByDesc('score')
                ->first();
        }

        if (!$review || !$review->candidate_invoice_id) {
            throw new \RuntimeException('Kandidat invoice untuk approval tidak ditemukan.');
        }

        $invoice = Invoice::query()->find($review->candidate_invoice_id);
        if (!$invoice) {
            throw new \RuntimeException('Invoice kandidat tidak ditemukan.');
        }

        $this->applyCaptureToInvoice($capture, $invoice, (float) $review->score, false, $actorId);

        $capture->matchReviews()->update(['status' => 'rejected']);
        $review->status = 'approved';
        $review->save();

        $this->auditLogService->log('billing.payment_capture.approved', $capture, [
            'invoice_id' => $invoice->id,
            'score' => (float) $review->score,
            'manual' => true,
        ], $actorId);

        return $capture->fresh(['invoice:id,invoice_link,customer_id,status,amount', 'matchReviews']);
    }

    public function unmatched(int $perPage = 50)
    {
        return $this->captures(['status' => 'needs_review'], $perPage);
    }

    public function captures(array $filters = [], int $perPage = 50)
    {
        $query = BillingPaymentCapture::query()
            ->with([
                'invoice:id,invoice_link,customer_id,status,amount,due_date,paid_at,bukti_pembayaran',
                'customer:id,name,pppoe_username,phone',
                'matchReviews.candidateInvoice:id,invoice_link,customer_id,status,amount,due_date',
            ])
            ->orderByDesc('id');

        $status = strtolower(trim((string) ($filters['status'] ?? 'all')));
        if ($status === 'needs_review') {
            $query->where('match_status', 'needs_review');
        } elseif ($status === 'approved') {
            $query->where('match_status', 'approved');
        } elseif ($status === 'unmatched') {
            $query->where('match_status', 'unmatched');
        } elseif ($status === 'rejected') {
            $query->where('match_status', 'rejected');
        } elseif ($status === 'pending') {
            $query->where('match_status', 'pending');
        }

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function ($q) use ($search) {
                $q->where('reference_code', 'like', "%{$search}%")
                    ->orWhere('id', $search)
                    ->orWhereHas('customer', function ($cq) use ($search) {
                        $cq->where('name', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%")
                            ->orWhere('pppoe_username', 'like', "%{$search}%");
                    })
                    ->orWhereHas('invoice', function ($iq) use ($search) {
                        $iq->where('invoice_link', 'like', "%{$search}%");
                    });
            });
        }

        return $query->paginate($perPage);
    }

    private function matchSingleCapture(BillingPaymentCapture $capture, bool $autoApply, ?int $actorId = null): BillingPaymentCapture
    {
        if ($capture->match_status === 'approved' && $capture->invoice_id) {
            return $capture;
        }

        DB::transaction(function () use (&$capture, $autoApply, $actorId): void {
            $candidates = $this->findCandidates($capture);

            $capture->matchReviews()->delete();

            if ($candidates->isEmpty()) {
                $capture->match_status = 'unmatched';
                $capture->match_confidence = 0;
                $capture->save();
                return;
            }

            $top = $candidates->first();
            $topScore = (float) ($top['score'] ?? 0);

            foreach ($candidates as $row) {
                BillingPaymentMatchReview::query()->create([
                    'capture_id' => $capture->id,
                    'candidate_invoice_id' => $row['invoice']->id,
                    'score' => $row['score'],
                    'reason' => $row['reason'],
                    'status' => 'candidate',
                ]);
            }

            if ($autoApply && $candidates->count() === 1 && $topScore >= 95) {
                $isAutoDisabled = (bool) ($top['invoice']->customer?->billing_auto_disabled ?? false);
                if ($isAutoDisabled) {
                    $capture->match_status = 'needs_review';
                    $capture->match_confidence = $topScore;
                    $capture->meta = array_merge((array) $capture->meta, [
                        'auto_disabled_by_superadmin' => true,
                    ]);
                    $capture->save();
                    return;
                }

                $this->applyCaptureToInvoice($capture, $top['invoice'], $topScore, true, $actorId);
                $capture->matchReviews()->update(['status' => 'rejected']);
                $capture->matchReviews()
                    ->where('candidate_invoice_id', $top['invoice']->id)
                    ->update(['status' => 'approved']);
                return;
            }

            if ($topScore < 70) {
                $capture->match_status = 'unmatched';
                $capture->match_confidence = $topScore;
                $capture->save();
                return;
            }

            $capture->match_status = 'needs_review';
            $capture->match_confidence = $topScore;
            $capture->save();
        });

        return $capture->fresh(['invoice:id,invoice_link,customer_id,status,amount', 'matchReviews']);
    }

    private function findCandidates(BillingPaymentCapture $capture): Collection
    {
        $amount = (float) $capture->amount;
        $paidDate = $capture->paid_date ? Carbon::parse($capture->paid_date)->startOfDay() : Carbon::today();
        $reference = strtolower(trim((string) $capture->reference_code));

        $query = Invoice::query()
            ->with('customer:id,name,phone,billing_auto_disabled')
            ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
            ->whereBetween('amount', [$amount - 0.01, $amount + 0.01]);

        if ($capture->invoice_id) {
            $query->where('id', $capture->invoice_id);
        }

        if ($capture->customer_id) {
            $query->where('customer_id', $capture->customer_id);
        }

        $rows = $query->orderBy('due_date')->limit(25)->get();
        return $rows->map(function (Invoice $invoice) use ($amount, $paidDate, $reference, $capture) {
            $score = 0.0;
            $reasons = [];

            if (abs((float) $invoice->amount - $amount) <= 0.01) {
                $score += 70;
                $reasons[] = 'amount_exact';
            }

            if ($capture->customer_id && (int) $capture->customer_id === (int) $invoice->customer_id) {
                $score += 20;
                $reasons[] = 'customer_match';
            }

            if ($capture->invoice_id && (int) $capture->invoice_id === (int) $invoice->id) {
                $score += 20;
                $reasons[] = 'invoice_hint';
            }

            if ($reference !== '' && str_contains(strtolower((string) $invoice->invoice_link), $reference)) {
                $score += 15;
                $reasons[] = 'reference_hint';
            }

            if ($invoice->due_date) {
                $diff = abs($paidDate->diffInDays(Carbon::parse($invoice->due_date)->startOfDay(), false));
                if ($diff <= 7) {
                    $score += 10;
                    $reasons[] = 'date_near_due';
                }
            }

            return [
                'invoice' => $invoice,
                'score' => min($score, 100),
                'reason' => implode(',', $reasons),
            ];
        })->sortByDesc('score')->values();
    }

    private function applyCaptureToInvoice(
        BillingPaymentCapture $capture,
        Invoice $invoice,
        float $score,
        bool $autoApplied,
        ?int $actorId = null
    ): void {
        DB::transaction(function () use ($capture, $invoice, $score, $autoApplied, $actorId): void {
            if ($invoice->status !== 'paid') {
                $invoice->amount = (float) $capture->amount;
                $invoice->status = 'paid';
                $invoice->paid_at = Carbon::parse($capture->paid_date)->setTimeFrom(now());
                $invoice->tolak_info = null;
                $invoice->save();
            }

            $capture->invoice_id = $invoice->id;
            $capture->customer_id = $invoice->customer_id;
            $capture->match_status = 'approved';
            $capture->match_confidence = $score;
            $capture->reviewed_by = $actorId;
            $capture->reviewed_at = now();
            $capture->meta = array_merge((array) $capture->meta, [
                'auto_applied' => $autoApplied,
                'approved_invoice_id' => $invoice->id,
            ]);
            $capture->save();

            $this->ledgerService->syncInvoicePayment($invoice->fresh(), $actorId);

            // Auto-restore PPPoE isolation in MikroTik if customer was isolated
            try {
                $customer = $invoice->customer;
                if ($customer && $customer->pppoe_username) {
                    $mikrotik = app(\App\Services\MikroTikService::class);
                    $package = $customer->package;
                    $targetProfile = $customer->mikrotik_profile ?: ($package?->mikrotik_profile ?: $package?->name);
                    if ($targetProfile) {
                        $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                        $customer->is_service_isolated = false;
                        $customer->service_isolated_at = null;
                        $customer->save();
                    }
                }
            } catch (\Throwable $mikrotikEx) {
                \Illuminate\Support\Facades\Log::warning('MikroTik un-isolation skipped or failed during payment capture approval', [
                    'customer_id' => $invoice->customer_id,
                    'error' => $mikrotikEx->getMessage(),
                ]);
            }

            // Dispatch customer payment confirmation
            try {
                app(\App\Services\PaymentCaptureNotificationService::class)->notifyAutoApproved($capture->fresh(['customer', 'invoice']));
            } catch (\Throwable $notifEx) {
                \Illuminate\Support\Facades\Log::warning('Payment capture notification failed', [
                    'capture_id' => $capture->id,
                    'error' => $notifEx->getMessage(),
                ]);
            }
        });
    }

    private function normalizePayload(array $payload): array
    {
        $source = strtolower(trim((string) ($payload['source'] ?? 'manual')));
        $referenceCode = trim((string) ($payload['reference_code'] ?? ''));
        $amount = round((float) ($payload['amount'] ?? 0), 2);

        return [
            'source' => $source !== '' ? $source : 'manual',
            'invoice_id' => !empty($payload['invoice_id']) ? (int) $payload['invoice_id'] : null,
            'customer_id' => !empty($payload['customer_id']) ? (int) $payload['customer_id'] : null,
            'amount' => $amount,
            'paid_date' => Carbon::parse((string) ($payload['paid_date'] ?? now()->toDateString()))->toDateString(),
            'reference_code' => $referenceCode !== '' ? $referenceCode : null,
            'meta' => is_array($payload['meta'] ?? null) ? $payload['meta'] : [],
        ];
    }

    private function fingerprint(array $normalized): string
    {
        return sha1(
            $normalized['source']
            . '|'
            . ($normalized['reference_code'] ?? '-')
            . '|'
            . number_format((float) $normalized['amount'], 2, '.', '')
            . '|'
            . $normalized['paid_date']
        );
    }
}

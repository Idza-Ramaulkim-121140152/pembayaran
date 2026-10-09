<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use App\Models\BillingPaymentMatchReview;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PaymentMatchingService
{
    public function __construct(
        private FinancialLedgerService $ledgerService,
        private AuditLogService $auditLogService,
        private ?CustomerResolutionService $customerResolutionService = null,
    ) {
        $this->customerResolutionService = $customerResolutionService ?: app(CustomerResolutionService::class);
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
                'invoice.customer:id,name,phone,pppoe_username',
                'customer:id,name,pppoe_username,phone',
                'matchReviews.candidateInvoice:id,invoice_link,customer_id,status,amount,due_date',
                'matchReviews.candidateInvoice.customer:id,name,phone,pppoe_username',
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

        if (!empty($filters['from_date'])) {
            $query->whereDate('created_at', '>=', $filters['from_date']);
        }

        if (!empty($filters['to_date'])) {
            $query->whereDate('created_at', '<=', $filters['to_date']);
        }

        if (!empty($filters['source']) && $filters['source'] !== 'all') {
            $source = trim((string) $filters['source']);
            if ($source === 'whatsapp') {
                $query->where(function ($q) {
                    $q->where('source', 'whatsapp')
                        ->orWhere('source', 'like', 'wa_%');
                });
            } elseif ($source === 'web_public') {
                $query->where(function ($q) {
                    $q->where('source', 'web_public')
                        ->orWhere('source', 'web')
                        ->orWhere('source', 'public_invoice');
                });
            } elseif ($source === 'admin_upload') {
                $query->where(function ($q) {
                    $q->where('source', 'admin_upload')
                        ->orWhere('source', 'dashboard')
                        ->orWhere('source', 'manual_upload');
                });
            } else {
                $query->where('source', $source);
            }
        }

        if (!empty($filters['confidence_level']) && $filters['confidence_level'] !== 'all') {
            $conf = trim((string) $filters['confidence_level']);
            if ($conf === 'high') {
                $query->where('match_confidence', '>=', 90);
            } elseif ($conf === 'medium') {
                $query->whereBetween('match_confidence', [70, 89.99]);
            } elseif ($conf === 'low') {
                $query->where('match_confidence', '<', 70);
            }
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

        // Auto-resolve customer if not set
        if (!$capture->customer_id) {
            $resolved = $this->customerResolutionService->resolveFromCapture($capture);
            if ($resolved) {
                $capture->customer_id = $resolved->id;
                $capture->save();
            }
        }

        $candidates = collect();

        // 1. If customer is identified, query active unpaid invoices for this customer
        if ($capture->customer_id) {
            $customerInvoices = Invoice::query()
                ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled')
                ->where('customer_id', $capture->customer_id)
                ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->orderBy('due_date')
                ->get();

            foreach ($customerInvoices as $invoice) {
                $score = 80.0;
                $reasons = ['customer_match'];

                if ($amount > 0 && abs((float) $invoice->amount - $amount) <= 0.01) {
                    $score += 15;
                    $reasons[] = 'amount_exact';
                } elseif ($amount <= 0) {
                    $score += 15;
                    $reasons[] = 'customer_active_bill';
                    // Auto-fill amount from invoice
                    $capture->amount = (float) $invoice->amount;
                    $capture->save();
                } else {
                    $score += 10;
                    $reasons[] = 'customer_unpaid_invoice';
                }

                if ($capture->invoice_id && (int) $capture->invoice_id === (int) $invoice->id) {
                    $score += 5;
                    $reasons[] = 'invoice_hint';
                }

                if ($reference !== '' && str_contains(strtolower((string) $invoice->invoice_link), $reference)) {
                    $score += 5;
                    $reasons[] = 'reference_hint';
                }

                if ($invoice->due_date) {
                    $diff = abs($paidDate->diffInDays(Carbon::parse($invoice->due_date)->startOfDay(), false));
                    if ($diff <= 7) {
                        $score += 5;
                        $reasons[] = 'date_near_due';
                    }
                }

                $candidates->push([
                    'invoice' => $invoice,
                    'score' => min($score, 100),
                    'reason' => implode(',', $reasons),
                ]);
            }
        }

        // 2. Query invoices matching exact amount if more candidates needed or customer not identified
        if ($amount > 0 && $candidates->count() < 10) {
            $query = Invoice::query()
                ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled')
                ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->whereBetween('amount', [$amount - 0.01, $amount + 0.01]);

            if ($capture->customer_id) {
                $query->where('customer_id', '!=', $capture->customer_id);
            }

            $amountMatches = $query->orderBy('due_date')->limit(15)->get();

            foreach ($amountMatches as $invoice) {
                $score = 70.0;
                $reasons = ['amount_exact'];

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

                $candidates->push([
                    'invoice' => $invoice,
                    'score' => min($score, 100),
                    'reason' => implode(',', $reasons),
                ]);
            }
        }

        return $candidates->sortByDesc('score')->values();
    }

    private function applyCaptureToInvoice(
        BillingPaymentCapture $capture,
        Invoice $invoice,
        float $score,
        bool $autoApplied,
        ?int $actorId = null
    ): void {
        DB::transaction(function () use ($capture, $invoice, $score, $autoApplied, $actorId): void {
            $mediaPath = (string) data_get($capture->meta, 'media.path', '');
            $paidDate = $capture->paid_date ? Carbon::parse($capture->paid_date) : now();
            $paidTime = (string) data_get($capture->meta, 'analysis.paid_time', now()->format('H:i:s'));
            $paidTimestamp = Carbon::parse($paidDate->toDateString() . ' ' . $paidTime);

            if ($invoice->status !== 'paid') {
                $invoice->amount = (float) $capture->amount > 0 ? (float) $capture->amount : (float) $invoice->amount;
                $invoice->status = 'paid';
                $invoice->paid_at = $paidTimestamp;
                $invoice->tolak_info = null;

                // Attach media proof if empty on invoice
                if (empty($invoice->bukti_pembayaran) && !empty($mediaPath)) {
                    $invoice->bukti_pembayaran = $mediaPath;
                }

                // Attach detected QRIS / Bank transaction metadata
                $referenceCode = $capture->reference_code ?: (string) data_get($capture->meta, 'analysis.reference_code', '');
                $sender = (string) data_get($capture->meta, 'analysis.destination_identity.name', data_get($capture->meta, 'source.sender_name', data_get($capture->meta, 'analysis.payment_channel', '')));
                $channel = strtolower((string) data_get($capture->meta, 'analysis.payment_channel', ''));
                $isQris = str_contains($channel, 'qris');

                if (Schema::hasColumn('invoices', 'qris_transaction_number') && !empty($referenceCode)) {
                    $invoice->qris_transaction_number = $referenceCode;
                }
                if (Schema::hasColumn('invoices', 'qris_sender') && !empty($sender)) {
                    $invoice->qris_sender = $sender;
                }
                if (Schema::hasColumn('invoices', 'qris_payment_time')) {
                    $invoice->qris_payment_time = $paidTimestamp;
                }
                if (Schema::hasColumn('invoices', 'include_in_mutation')) {
                    $invoice->include_in_mutation = true;
                }

                // Match or set payment receipt option
                if (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id') && empty($invoice->received_via_payment_receipt_option_id)) {
                    if (Schema::hasTable('payment_receipt_options')) {
                        $keyword = $isQris ? 'qris' : 'transfer';
                        $option = \App\Models\PaymentReceiptOption::query()
                            ->where('is_active', true)
                            ->where('name', 'like', "%{$keyword}%")
                            ->first() ?: \App\Models\PaymentReceiptOption::query()->where('is_active', true)->first();
                        if ($option) {
                            $invoice->received_via_payment_receipt_option_id = $option->id;
                        }
                    }
                }

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

            // Update customer due date & un-isolate service
            $customer = $invoice->customer;
            if ($customer) {
                $isIsolated = (bool) ($customer->is_service_isolated ?? false);
                if ($isIsolated) {
                    $customer->due_date = $paidTimestamp->copy()->startOfDay()->addDays(30)->toDateString();
                } elseif (!empty($customer->due_date)) {
                    $customer->due_date = Carbon::parse((string) $customer->due_date)->startOfDay()->addDays(30)->toDateString();
                } else {
                    $customer->due_date = $paidTimestamp->copy()->startOfDay()->addDays(30)->toDateString();
                }

                $customer->is_service_isolated = false;
                $customer->service_isolated_at = null;
                $customer->service_isolated_by = null;
                $customer->isolation_restore_profile = null;
                $customer->save();

                // Reset usage snapshot
                if (class_exists(\App\Services\CustomerUsageSnapshotService::class)) {
                    try {
                        app(\App\Services\CustomerUsageSnapshotService::class)->resetPeriodByCustomerId((int) $customer->id);
                    } catch (\Throwable $snapEx) {
                        // ignore
                    }
                }

                // MikroTik un-isolation
                if ($customer->pppoe_username) {
                    try {
                        $mikrotik = app(\App\Services\MikroTikService::class);
                        $package = $customer->package;
                        $targetProfile = $customer->mikrotik_profile ?: ($package?->mikrotik_profile ?: $package?->name ?: 'default');
                        $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                    } catch (\Throwable $mikrotikEx) {
                        \Illuminate\Support\Facades\Log::warning('MikroTik un-isolation skipped or failed during payment capture approval', [
                            'customer_id' => $invoice->customer_id,
                            'error' => $mikrotikEx->getMessage(),
                        ]);
                    }
                }
            }

            // Sync with financial ledger / mutations
            $this->ledgerService->syncInvoicePayment($invoice->fresh(), $actorId);

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

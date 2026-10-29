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
            $query->whereIn('match_status', ['needs_review', 'pending']);
        } elseif ($status === 'approved') {
            $query->where('match_status', 'approved');
        } elseif ($status === 'unmatched' || $status === 'failed_auto' || $status === 'failed') {
            $query->whereIn('match_status', ['unmatched', 'rejected']);
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
            // Guard: Check duplicate reference code and image hash to reject re-used payment proofs
            $refCode = trim((string) ($capture->reference_code ?: data_get($capture->meta, 'analysis.reference_code', '')));
            if ($refCode !== '') {
                $refLower = strtolower($refCode);
                if (str_starts_with($refLower, 'inv_') || str_starts_with($refLower, 'invoice') || ($capture->invoice && $refLower === strtolower((string) $capture->invoice->invoice_link))) {
                    $refCode = '';
                }
            }

            $dupCapture = false;
            $dupInvoice = false;
            if ($refCode !== '' && strlen($refCode) >= 4) {
                $dupCapture = BillingPaymentCapture::query()
                    ->where('id', '!=', $capture->id)
                    ->where('match_status', 'approved')
                    ->whereRaw('LOWER(reference_code) = ?', [strtolower($refCode)])
                    ->exists();

                $dupInvoice = Invoice::query()
                    ->when($capture->invoice_id, fn ($q) => $q->where('id', '!=', $capture->invoice_id))
                    ->where('status', 'paid')
                    ->where(function ($q) use ($refCode) {
                        $q->whereRaw('LOWER(qris_transaction_number) = ?', [strtolower($refCode)]);
                    })
                    ->exists();

                if (!$dupInvoice && Schema::hasTable('financial_transactions')) {
                    $dupInvoice = \App\Models\FinancialTransaction::query()
                        ->where('meta->qris_transaction_number', $refCode)
                        ->when($capture->invoice_id, fn ($q) => $q->where(function ($sq) use ($capture) {
                            $sq->where('reference_type', '!=', Invoice::class)
                               ->orWhere('reference_id', '!=', $capture->invoice_id);
                        }))
                        ->exists();
                }
            }

            $fileHash = data_get($capture->meta, 'media.file_hash');
            $dupImage = false;
            if ($fileHash) {
                $dupImage = BillingPaymentCapture::query()
                    ->where('id', '!=', $capture->id)
                    ->where('match_status', 'approved')
                    ->where(function ($q) use ($fileHash) {
                        $q->where('meta->media->file_hash', $fileHash)
                          ->orWhere('meta->file_hash', $fileHash);
                    })
                    ->exists();
            }

            if ($dupCapture || $dupInvoice || $dupImage) {
                $capture->match_status = 'rejected';
                $capture->meta = array_merge((array) $capture->meta, [
                    'duplicate_receipt_detected' => true,
                    'duplicate_label' => 'Bukti bayar sudah pernah digunakan',
                    'validation' => array_merge((array) data_get($capture->meta, 'validation', []), [
                        'failure_reason' => 'duplicate_reference_code',
                    ]),
                ]);
                $capture->save();
                $capture->matchReviews()->delete();
                return;
            }

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

            $autoThreshold = (float) data_get(app(PaymentVerificationConfigService::class)->getConfig(), 'confidence_thresholds.auto_approve', 80);

            $topInvoice = $top['invoice'] ?? null;
            $amountMatchesTop = false;
            if ($topInvoice && (float) $capture->amount > 0) {
                $captAmt = (float) $capture->amount;
                $matchesBase = abs((float) $topInvoice->amount - $captAmt) <= 0.01;
                $matchesQris = $topInvoice->qris_expected_amount && abs((float) $topInvoice->qris_expected_amount - $captAmt) <= 0.01;
                $amountMatchesTop = $matchesBase || $matchesQris;
            }
            $destinationOk = (bool) data_get($capture->meta, 'validation.flags.destination_whitelisted', true);

            $canAutoApply = $autoApply
                && $topScore >= $autoThreshold
                && $amountMatchesTop
                && $destinationOk
                && (
                    $candidates->count() === 1 ||
                    ($capture->customer_id && $top['invoice']->customer_id === $capture->customer_id && (
                        $candidates->count() === 1 || ($candidates->get(1)['score'] ?? 0) < $topScore
                    ))
                );

            if ($canAutoApply) {
                // Check duplicate reference code and duplicate image hash to prevent double-applying receipt
                $refCode = trim((string) ($capture->reference_code ?: data_get($capture->meta, 'analysis.reference_code', '')));
                if ($refCode !== '') {
                    $refLower = strtolower($refCode);
                    if (str_starts_with($refLower, 'inv_') || str_starts_with($refLower, 'invoice') || ($top['invoice'] && $refLower === strtolower((string) $top['invoice']->invoice_link))) {
                        $refCode = '';
                    }
                }

                $dupCapture = false;
                $dupInvoice = false;
                if ($refCode !== '' && strlen($refCode) >= 4) {
                    $dupCapture = BillingPaymentCapture::query()
                        ->where('id', '!=', $capture->id)
                        ->where('match_status', 'approved')
                        ->whereRaw('LOWER(reference_code) = ?', [strtolower($refCode)])
                        ->exists();

                    $dupInvoice = Invoice::query()
                        ->where('id', '!=', $top['invoice']->id)
                        ->where('status', 'paid')
                        ->where(function ($q) use ($refCode) {
                            $q->whereRaw('LOWER(qris_transaction_number) = ?', [strtolower($refCode)]);
                        })
                        ->exists();
                }

                $fileHash = data_get($capture->meta, 'media.file_hash');
                $dupImage = false;
                if ($fileHash) {
                    $dupImage = BillingPaymentCapture::query()
                        ->where('id', '!=', $capture->id)
                        ->where('match_status', 'approved')
                        ->where(function ($q) use ($fileHash) {
                            $q->where('meta->media->file_hash', $fileHash)
                              ->orWhere('meta->file_hash', $fileHash);
                        })
                        ->exists();
                }

                if ($dupCapture || $dupInvoice || $dupImage) {
                    $capture->match_status = 'rejected';
                    $capture->match_confidence = $topScore;
                    $capture->meta = array_merge((array) $capture->meta, [
                        'duplicate_receipt_detected' => true,
                        'duplicate_label' => 'Bukti bayar sudah pernah digunakan',
                        'validation' => array_merge((array) data_get($capture->meta, 'validation', []), [
                            'failure_reason' => 'duplicate_reference_code',
                        ]),
                    ]);
                    $capture->save();
                    $capture->matchReviews()->update(['status' => 'rejected']);
                    return;
                }

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

            if ($topScore < 70 && !$capture->customer_id) {
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

        // 1. Web Public / Direct Invoice Upload:
        // When receipt is uploaded from customer's specific invoice link, match ONLY that invoice!
        if ($capture->invoice_id && ($capture->source === 'web_public' || str_starts_with((string) $capture->source, 'web'))) {
            $invoice = Invoice::query()
                ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled,due_date,is_service_isolated,service_isolated_at,service_isolated_by,isolation_restore_profile,package_id,mikrotik_profile')
                ->where('id', $capture->invoice_id)
                ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->first();

            if ($invoice) {
                return collect([[
                    'invoice' => $invoice,
                    'score' => 100.0,
                    'reason' => 'web_public_invoice_direct',
                ]]);
            }

            // Also check if web_public invoice was already settled recently:
            $paidInvoice = Invoice::query()
                ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled,due_date,is_service_isolated,service_isolated_at,service_isolated_by,isolation_restore_profile,package_id,mikrotik_profile')
                ->where('id', $capture->invoice_id)
                ->where('status', 'paid')
                ->first();

            if ($paidInvoice) {
                return collect([[
                    'invoice' => $paidInvoice,
                    'score' => 95.0,
                    'reason' => 'already_settled_web_public',
                ]]);
            }

            return collect();
        }

        // 2. Identified Customer (e.g. from WhatsApp sender phone):
        // Query ONLY this customer's active unpaid invoices. NEVER query other customers' invoices!
        if ($capture->customer_id) {
            $customerInvoices = Invoice::query()
                ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled,due_date,is_service_isolated,service_isolated_at,service_isolated_by,isolation_restore_profile,package_id,mikrotik_profile')
                ->where('customer_id', $capture->customer_id)
                ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->orderBy('due_date')
                ->get();

            if ($customerInvoices->isEmpty()) {
                // If customer has no unpaid invoices, check if an invoice was already settled recently (e.g. by Jalur 1 MacroDroid push)
                $recentlyPaidInvoice = null;
                if ($capture->invoice_id) {
                    $recentlyPaidInvoice = Invoice::query()
                        ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled,due_date,is_service_isolated,service_isolated_at,service_isolated_by,isolation_restore_profile,package_id,mikrotik_profile')
                        ->where('id', $capture->invoice_id)
                        ->where('customer_id', $capture->customer_id)
                        ->where('status', 'paid')
                        ->first();
                }

                if (!$recentlyPaidInvoice) {
                    $recentlyPaidInvoice = Invoice::query()
                        ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled,due_date,is_service_isolated,service_isolated_at,service_isolated_by,isolation_restore_profile,package_id,mikrotik_profile')
                        ->where('customer_id', $capture->customer_id)
                        ->where('status', 'paid')
                        ->where('updated_at', '>=', now()->subHours(24))
                        ->where(function ($q) use ($amount) {
                            if ($amount > 0) {
                                $q->whereBetween('amount', [$amount - 0.01, $amount + 0.01])
                                  ->orWhereBetween('qris_expected_amount', [$amount - 0.01, $amount + 0.01]);
                            }
                        })
                        ->latest('updated_at')
                        ->first();
                }

                if ($recentlyPaidInvoice) {
                    return collect([[
                        'invoice' => $recentlyPaidInvoice,
                        'score' => 95.0,
                        'reason' => 'already_settled_by_primary_channel',
                    ]]);
                }

                return collect();
            }

            // Find invoices matching exact amount (either base amount or QRIS dynamic expected amount)
            $exactMatches = $customerInvoices->filter(function ($inv) use ($amount) {
                if ($amount <= 0) return false;
                $matchesBase = abs((float) $inv->amount - $amount) <= 0.01;
                $matchesQris = $inv->qris_expected_amount && abs((float) $inv->qris_expected_amount - $amount) <= 0.01;
                return $matchesBase || $matchesQris;
            });

            if ($exactMatches->isNotEmpty()) {
                // If there is an exact match for this customer, return ONLY this customer's matching invoice(s)!
                foreach ($exactMatches as $invoice) {
                    $candidates->push([
                        'invoice' => $invoice,
                        'score' => 100.0,
                        'reason' => 'customer_match,amount_exact',
                    ]);
                }
                return $candidates;
            }

            // No exact amount match, but customer has unpaid invoices
            // Return only this customer's invoices for admin review (score must be < 70 so it never auto-approves)
            foreach ($customerInvoices as $invoice) {
                $score = 50.0;
                $reasons = ['customer_match', 'customer_unpaid_invoice'];

                if ($capture->invoice_id && (int) $capture->invoice_id === (int) $invoice->id) {
                    $score += 5;
                    $reasons[] = 'invoice_hint';
                }

                $candidates->push([
                    'invoice' => $invoice,
                    'score' => min($score, 65),
                    'reason' => implode(',', $reasons),
                ]);
            }

            return $candidates;
        }

        // 3. Unknown / Unregistered Sender (e.g. WhatsApp from unknown number):
        // Query unpaid invoices matching exact amount for manual admin review or QRIS unique auto-match
        if ($amount > 0) {
            $amountMatches = Invoice::query()
                ->with('customer:id,name,phone,pppoe_username,billing_auto_disabled,due_date,is_service_isolated,service_isolated_at,service_isolated_by,isolation_restore_profile,package_id,mikrotik_profile')
                ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->where(function ($q) use ($amount) {
                    $q->whereBetween('amount', [$amount - 0.01, $amount + 0.01])
                      ->orWhereBetween('qris_expected_amount', [$amount - 0.01, $amount + 0.01]);
                })
                ->orderBy('due_date')
                ->limit(15)
                ->get();

            foreach ($amountMatches as $invoice) {
                $isQrisUnique = $invoice->qris_expected_amount && abs((float) $invoice->qris_expected_amount - $amount) <= 0.01;
                $score = $isQrisUnique ? 90.0 : 70.0;
                $reasons = [$isQrisUnique ? 'qris_unique_amount_exact' : 'amount_exact'];

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
                    'score' => min($score, 85),
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
            if (strlen($paidTime) === 5) {
                $paidTime .= ':00';
            }
            try {
                $paidTimestamp = Carbon::parse($paidDate->toDateString() . ' ' . $paidTime, 'Asia/Jakarta')->setTimezone(config('app.timezone', 'UTC'));
            } catch (\Throwable) {
                $paidTimestamp = now();
            }

            // Resolve Admin Finance receiver (Keuangan Perusahaan)
            $financeUserId = null;
            try {
                $financeService = app(\App\Services\CompanyFinanceReceiverService::class);
                $activeFinanceIds = $financeService->activeUserIds();
                if (!empty($activeFinanceIds)) {
                    $financeUserId = (int) $activeFinanceIds[0];
                } else {
                    $financeUser = \App\Models\User::query()
                        ->where('role', 'finance')
                        ->orWhere('name', 'like', '%finance%')
                        ->orWhere('role', 'admin')
                        ->first();
                    $financeUserId = $financeUser?->id;
                }
            } catch (\Throwable) {
                $financeUserId = null;
            }

            $wasAlreadyPaid = strtolower((string) $invoice->status) === 'paid';

            if (!$wasAlreadyPaid) {
                $invoice->amount = (float) $capture->amount > 0 ? (float) $capture->amount : (float) $invoice->amount;
                $invoice->status = 'paid';
                $invoice->paid_at = $paidTimestamp;
                $invoice->tolak_info = null;

                if (Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
                    $invoice->payment_receiver_user_id = $financeUserId ?: ($actorId ?: $invoice->payment_receiver_user_id);
                }

                // Attach media proof if empty on invoice
                if (empty($invoice->bukti_pembayaran) && !empty($mediaPath)) {
                    $invoice->bukti_pembayaran = $mediaPath;
                }

                // Attach detected QRIS / Bank transaction metadata
                $referenceCode = $capture->reference_code ?: (string) data_get($capture->meta, 'analysis.reference_code', '');
                if ($referenceCode !== '') {
                    $refLower = strtolower($referenceCode);
                    if (str_starts_with($refLower, 'inv_') || str_starts_with($refLower, 'invoice') || $refLower === strtolower((string) $invoice->invoice_link)) {
                        $referenceCode = '';
                    }
                }
                $sender = trim((string) (
                    data_get($capture->meta, 'analysis.sender_name')
                    ?: data_get($capture->meta, 'source.sender_name')
                    ?: ($invoice->customer?->name ?? '')
                ));
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
            } else {
                if (empty($invoice->bukti_pembayaran) && !empty($mediaPath)) {
                    $invoice->bukti_pembayaran = $mediaPath;
                    $invoice->save();
                }
            }

            $customer = $invoice->customer()->first() ?: $invoice->customer;
            $previousDueDate = $customer?->due_date ? Carbon::parse($customer->due_date)->toDateString() : null;
            $wasIsolated = (bool) ($customer?->is_service_isolated ?? false);

            $rollbackData = [
                'customer_id' => $customer?->id,
                'previous_due_date' => $previousDueDate,
                'was_isolated' => $wasIsolated,
                'service_isolated_at' => $customer?->service_isolated_at ? Carbon::parse($customer->service_isolated_at)->toDateTimeString() : null,
                'service_isolated_by' => $customer?->service_isolated_by,
                'isolation_restore_profile' => $customer?->isolation_restore_profile,
                'invoice_id' => $invoice->id,
                'previous_invoice_status' => $invoice->getOriginal('status') ?: 'unpaid',
                'previous_invoice_paid_at' => $invoice->getOriginal('paid_at'),
                'previous_payment_receiver_id' => $invoice->getOriginal('payment_receiver_user_id'),
                'previous_include_in_mutation' => $invoice->getOriginal('include_in_mutation'),
                'previous_qris_transaction_number' => $invoice->getOriginal('qris_transaction_number'),
                'confirmed_at' => now()->toDateTimeString(),
            ];

            $capture->invoice_id = $invoice->id;
            $capture->customer_id = $invoice->customer_id;
            $capture->match_status = 'approved';
            $capture->match_confidence = $score;
            $capture->reviewed_by = $actorId;
            $capture->reviewed_at = now();
            $captureMeta = array_merge((array) $capture->meta, [
                'auto_applied' => $autoApplied,
                'approved_invoice_id' => $invoice->id,
                'rollback_data' => $rollbackData,
            ]);
            if ($wasAlreadyPaid) {
                $captureMeta['already_settled_by_primary'] = true;
                $captureMeta['settlement_note'] = 'Tagihan telah dilunasi sebelumnya via jalur utama (GoBiz Push / Webhook). Bukti bayar WhatsApp berhasil disimpan sebagai arsip verifikasi cadangan.';
            }
            $capture->meta = $captureMeta;
            $capture->save();

            // Update customer due date & un-isolate service (hanya jika belum dilunasi sebelumnya)
            if ($customer && !$wasAlreadyPaid) {
                if ($wasIsolated) {
                    $customer->due_date = $paidTimestamp->copy()->startOfDay()->addDays(30)->toDateString();
                } elseif (!empty($previousDueDate)) {
                    $customer->due_date = Carbon::parse($previousDueDate)->startOfDay()->addDays(30)->toDateString();
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

            // Sync with financial ledger / mutations as Admin Finance (hanya jika belum dilunasi sebelumnya)
            if (!$wasAlreadyPaid) {
                $effectiveActor = $financeUserId ?: $actorId;
                $this->ledgerService->syncInvoicePayment($invoice->fresh(), $effectiveActor);
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

    public function autoConfirmations(array $filters = [], int $perPage = 25)
    {
        $query = BillingPaymentCapture::query()
            ->with([
                'invoice:id,invoice_link,customer_id,status,amount,due_date,paid_at,qris_payment_time,qris_transaction_number,payment_receiver_user_id',
                'invoice.customer:id,name,phone,pppoe_username,due_date,is_service_isolated',
                'invoice.paymentReceiver:id,name,email,role',
                'customer:id,name,pppoe_username,phone,due_date,is_service_isolated',
            ])
            ->where(function ($q) {
                $q->where('match_status', 'approved')
                  ->orWhere(function ($sq) {
                      $sq->where('match_status', 'rejected')
                         ->whereNotNull('meta->cancelled_at');
                  });
            })
            ->where(function ($q) {
                $q->where('meta->auto_applied', true)
                  ->orWhere('meta->auto_applied', '1')
                  ->orWhere('match_confidence', '>=', 80);
            })
            ->orderByDesc('id');

        if (!empty($filters['status']) && $filters['status'] === 'approved') {
            $query->where('match_status', 'approved');
        } elseif (!empty($filters['status']) && $filters['status'] === 'cancelled') {
            $query->where('match_status', 'rejected')->whereNotNull('meta->cancelled_at');
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
                        $iq->where('invoice_link', 'like', "%{$search}%")
                            ->orWhere('qris_transaction_number', 'like', "%{$search}%");
                    });
            });
        }

        if (!empty($filters['from_date'])) {
            $query->whereDate('created_at', '>=', $filters['from_date']);
        }

        if (!empty($filters['to_date'])) {
            $query->whereDate('created_at', '<=', $filters['to_date']);
        }

        return $query->paginate($perPage);
    }

    public function cancelAutoConfirmation(BillingPaymentCapture $capture, ?int $actorId = null): array
    {
        return DB::transaction(function () use ($capture, $actorId) {
            $meta = (array) ($capture->meta ?? []);
            $rollbackData = (array) ($meta['rollback_data'] ?? []);

            $invoiceId = $capture->invoice_id ?: ($rollbackData['invoice_id'] ?? null);
            $invoice = $invoiceId ? \App\Models\Invoice::find($invoiceId) : null;
            $customerId = $capture->customer_id ?: ($rollbackData['customer_id'] ?? null);
            $customer = $customerId ? \App\Models\Customer::find($customerId) : null;

            // 1. Delete financial mutation and revert invoice to unpaid
            if ($invoice) {
                \App\Models\FinancialTransaction::query()
                    ->where('source', 'invoice_payment')
                    ->where('reference_type', Invoice::class)
                    ->where('reference_id', $invoice->id)
                    ->delete();

                $invoice->status = 'unpaid';
                $invoice->paid_at = null;
                $invoice->tolak_info = 'Dibatalkan dari monitoring konfirmasi terima auto';
                $invoice->qris_transaction_number = null;
                if (Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
                    $invoice->payment_receiver_user_id = $rollbackData['previous_payment_receiver_id'] ?? null;
                }
                $invoice->save();

                $this->ledgerService->syncInvoicePayment($invoice->fresh(), $actorId);
            }

            // 2. Revert customer due date & isolation state
            if ($customer) {
                $prevDueDate = $rollbackData['previous_due_date'] ?? null;
                if ($prevDueDate) {
                    $customer->due_date = $prevDueDate;
                } elseif ($customer->due_date) {
                    $customer->due_date = Carbon::parse($customer->due_date)->subDays(30)->toDateString();
                }

                $wasIsolated = (bool) ($rollbackData['was_isolated'] ?? false);
                if ($wasIsolated) {
                    $customer->is_service_isolated = true;
                    $customer->service_isolated_at = $rollbackData['service_isolated_at'] ?? now();
                    $customer->service_isolated_by = $rollbackData['service_isolated_by'] ?? null;
                    $customer->isolation_restore_profile = $rollbackData['isolation_restore_profile'] ?? null;
                    $customer->save();

                    if ($customer->pppoe_username) {
                        try {
                            $mikrotik = app(\App\Services\MikroTikService::class);
                            $mikrotik->restrictUser($customer->pppoe_username, 'isolir');
                        } catch (\Throwable $ex) {
                            Log::warning('MikroTik re-isolation on cancel skipped: ' . $ex->getMessage());
                        }
                    }
                } else {
                    $customer->save();
                }
            }

            // 3. Update capture match_status to rejected and store cancelled meta
            $capture->match_status = 'rejected';
            $capture->meta = array_merge($meta, [
                'cancelled' => true,
                'cancelled_at' => now()->toISOString(),
                'cancelled_by' => $actorId,
            ]);
            $capture->save();

            $this->auditLogService->log('billing.payment_capture.auto_cancelled', $capture, [
                'invoice_id' => $invoice?->id,
                'customer_id' => $customer?->id,
                'reverted_due_date' => $customer?->due_date,
            ], $actorId);

            return [
                'success' => true,
                'message' => 'Konfirmasi pembayaran berhasil dibatalkan. Mutasi dihapus, tagihan menjadi belum lunas, dan tanggal jatuh tempo dikembalikan.',
                'capture' => $capture->fresh(['customer', 'invoice']),
            ];
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

<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Pengeluaran;
use App\Models\ReconciliationIssue;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReconciliationCenterService
{
    public const ISSUE_PAYMENT_CAPTURE_NEEDS_REVIEW = 'payment_capture_needs_review';
    public const ISSUE_PAYMENT_CAPTURE_UNMATCHED = 'payment_capture_unmatched';
    public const ISSUE_INVOICE_PAID_WITHOUT_CONFIRMED_LEDGER = 'invoice_paid_without_confirmed_ledger';
    public const ISSUE_CONFIRMED_INVOICE_LEDGER_WITHOUT_PAID_INVOICE = 'confirmed_invoice_ledger_without_paid_invoice';
    public const ISSUE_PENGELUARAN_WITHOUT_LEDGER = 'pengeluaran_without_ledger';
    public const ISSUE_LEDGER_PENGELUARAN_WITHOUT_SOURCE = 'ledger_pengeluaran_without_source';
    public const ISSUE_FINANCIAL_TRANSACTION_PENDING_REVIEW = 'financial_transaction_pending_review';
    public const ISSUE_DUPLICATE_CONFIRMED_REFERENCE = 'duplicate_confirmed_reference';

    public const SOURCE_GROUP_INVOICE_RECEIPTS = 'invoice_receipts';
    public const SOURCE_GROUP_LEDGER_SOURCE = 'ledger_vs_source';
    public const SOURCE_GROUP_ACTION_REQUIRED = 'action_required';

    public function isReady(): bool
    {
        return Schema::hasTable('reconciliation_issues');
    }

    public function refresh(?int $actorId = null): array
    {
        if (!$this->isReady()) {
            return [
                'issues_synced' => 0,
                'auto_resolved' => 0,
                'summary' => $this->emptySummary(),
            ];
        }

        $payloads = $this->collectIssuePayloads();
        $activeFingerprints = [];
        $synced = 0;

        foreach ($payloads as $payload) {
            $activeFingerprints[] = $payload['fingerprint'];
            $this->upsertIssue($payload);
            $synced++;
        }

        $autoResolved = ReconciliationIssue::query()
            ->whereNotIn('status', [ReconciliationIssue::STATUS_RESOLVED])
            ->when(count($activeFingerprints) > 0, fn ($query) => $query->whereNotIn('fingerprint', $activeFingerprints))
            ->when(count($activeFingerprints) === 0, fn ($query) => $query)
            ->get()
            ->reduce(function (int $count, ReconciliationIssue $issue) {
                $issue->update([
                    'status' => ReconciliationIssue::STATUS_RESOLVED,
                    'resolved_at' => now(),
                    'ignored_at' => null,
                    'resolution_action' => 'auto_resolved',
                ]);

                return $count + 1;
            }, 0);

        return [
            'issues_synced' => $synced,
            'auto_resolved' => $autoResolved,
            'summary' => $this->summary(),
        ];
    }

    public function summary(array $filters = []): array
    {
        if (!$this->isReady()) {
            return $this->emptySummary();
        }

        $issues = $this->issuesQuery($filters)->get();
        $openIssues = $issues->where('status', ReconciliationIssue::STATUS_OPEN);

        return [
            'total_open' => $openIssues->count(),
            'critical_open' => $openIssues->where('severity', ReconciliationIssue::SEVERITY_CRITICAL)->count(),
            'affected_amount_open' => (int) round($openIssues->sum(fn (ReconciliationIssue $issue) => (float) data_get($issue->meta, 'amount', 0))),
            'overdue_over_3_days_open' => $openIssues->filter(fn (ReconciliationIssue $issue) => $this->issueAgeDays($issue) > 3)->count(),
            'capture_review_open' => $openIssues->whereIn('issue_type', [
                self::ISSUE_PAYMENT_CAPTURE_NEEDS_REVIEW,
                self::ISSUE_PAYMENT_CAPTURE_UNMATCHED,
            ])->count(),
            'ledger_source_mismatch_open' => $openIssues->whereIn('issue_type', [
                self::ISSUE_INVOICE_PAID_WITHOUT_CONFIRMED_LEDGER,
                self::ISSUE_CONFIRMED_INVOICE_LEDGER_WITHOUT_PAID_INVOICE,
                self::ISSUE_PENGELUARAN_WITHOUT_LEDGER,
                self::ISSUE_LEDGER_PENGELUARAN_WITHOUT_SOURCE,
                self::ISSUE_DUPLICATE_CONFIRMED_REFERENCE,
            ])->count(),
            'counts_by_status' => collect(ReconciliationIssue::statusOptions())
                ->mapWithKeys(fn (string $status) => [$status => $issues->where('status', $status)->count()])
                ->all(),
        ];
    }

    public function issues(array $filters = []): array
    {
        if (!$this->isReady()) {
            return [
                'data' => [],
                'meta' => [
                    'filters' => $this->filterMeta(),
                ],
            ];
        }

        $rows = $this->issuesQuery($filters)
            ->with('assignee:id,name')
            ->orderByRaw($this->enumOrderSql('status', ReconciliationIssue::statusOptions()))
            ->orderByRaw($this->enumOrderSql('severity', ReconciliationIssue::severityOptions()))
            ->orderByDesc('detected_at')
            ->get()
            ->map(fn (ReconciliationIssue $issue) => $this->presentIssue($issue))
            ->values()
            ->all();

        return [
            'data' => $rows,
            'meta' => [
                'filters' => $this->filterMeta(),
            ],
        ];
    }

    public function presentIssue(ReconciliationIssue $issue): array
    {
        $meta = is_array($issue->meta) ? $issue->meta : [];
        $occurredAt = data_get($meta, 'occurred_at');
        $sourceGroup = (string) data_get($meta, 'source_group', self::SOURCE_GROUP_ACTION_REQUIRED);
        $availableActions = collect((array) data_get($meta, 'available_actions', []))
            ->filter()
            ->values()
            ->all();

        return [
            'id' => $issue->id,
            'issue_type' => $issue->issue_type,
            'status' => $issue->status,
            'severity' => $issue->severity,
            'title' => $issue->title,
            'description' => $issue->description,
            'amount' => (int) round((float) data_get($meta, 'amount', 0)),
            'occurred_at' => $occurredAt,
            'detected_at' => optional($issue->detected_at)?->toIso8601String(),
            'age_days' => $this->issueAgeDays($issue),
            'primary_entity_type' => $issue->primary_entity_type,
            'primary_entity_id' => $issue->primary_entity_id,
            'source_group' => $sourceGroup,
            'source_group_label' => $this->sourceGroupLabel($sourceGroup),
            'source_url' => data_get($meta, 'source_url'),
            'available_actions' => $availableActions,
            'resolution_action' => $issue->resolution_action,
            'resolution_notes' => $issue->resolution_notes,
            'assigned_to' => $issue->assigned_to,
            'assignee' => $issue->relationLoaded('assignee') ? $issue->assignee : null,
            'meta' => $meta,
        ];
    }

    public function filterMeta(): array
    {
        return [
            'statuses' => collect(ReconciliationIssue::statusOptions())
                ->map(fn (string $value) => ['value' => $value, 'label' => $this->statusLabel($value)])
                ->values()
                ->all(),
            'severities' => collect(ReconciliationIssue::severityOptions())
                ->map(fn (string $value) => ['value' => $value, 'label' => $this->severityLabel($value)])
                ->values()
                ->all(),
            'source_groups' => collect([
                self::SOURCE_GROUP_INVOICE_RECEIPTS,
                self::SOURCE_GROUP_LEDGER_SOURCE,
                self::SOURCE_GROUP_ACTION_REQUIRED,
            ])->map(fn (string $value) => ['value' => $value, 'label' => $this->sourceGroupLabel($value)])
                ->values()
                ->all(),
            'issue_types' => collect($this->issueTypeOptions())
                ->map(fn (string $value) => ['value' => $value, 'label' => $this->issueTypeLabel($value)])
                ->values()
                ->all(),
        ];
    }

    private function emptySummary(): array
    {
        return [
            'total_open' => 0,
            'critical_open' => 0,
            'affected_amount_open' => 0,
            'overdue_over_3_days_open' => 0,
            'capture_review_open' => 0,
            'ledger_source_mismatch_open' => 0,
            'counts_by_status' => collect(ReconciliationIssue::statusOptions())->mapWithKeys(fn (string $status) => [$status => 0])->all(),
        ];
    }

    private function issuesQuery(array $filters)
    {
        $query = ReconciliationIssue::query();

        if (!empty($filters['status'])) {
            $query->whereIn('status', (array) $filters['status']);
        }

        if (!empty($filters['issue_type'])) {
            $query->whereIn('issue_type', (array) $filters['issue_type']);
        }

        if (!empty($filters['severity'])) {
            $query->whereIn('severity', (array) $filters['severity']);
        }

        if (!empty($filters['assigned_to'])) {
            $query->where('assigned_to', $filters['assigned_to']);
        }

        if (!empty($filters['date_from'])) {
            $query->whereDate('detected_at', '>=', $filters['date_from']);
        }

        if (!empty($filters['date_to'])) {
            $query->whereDate('detected_at', '<=', $filters['date_to']);
        }

        if (!empty($filters['source_group'])) {
            $sourceGroups = (array) $filters['source_group'];
            $query->where(function ($builder) use ($sourceGroups) {
                foreach ($sourceGroups as $sourceGroup) {
                    $builder->orWhere('meta->source_group', $sourceGroup);
                }
            });
        }

        return $query;
    }

    private function enumOrderSql(string $column, array $values): string
    {
        $wrappedColumn = DB::getQueryGrammar()->wrap($column);
        $cases = collect(array_values($values))
            ->map(fn (string $value, int $index) => "WHEN '{$value}' THEN {$index}")
            ->implode(' ');

        return "CASE {$wrappedColumn} {$cases} ELSE 999 END";
    }

    private function collectIssuePayloads(): Collection
    {
        return collect()
            ->concat($this->detectPaymentCaptureIssues())
            ->concat($this->detectInvoiceLedgerMissingIssues())
            ->concat($this->detectInvoiceLedgerOrphanIssues())
            ->concat($this->detectPengeluaranMissingLedgerIssues())
            ->concat($this->detectPengeluaranLedgerOrphanIssues())
            ->concat($this->detectPendingReviewLedgerIssues())
            ->concat($this->detectDuplicateConfirmedReferenceIssues())
            ->values();
    }

    private function detectPaymentCaptureIssues(): Collection
    {
        if (!Schema::hasTable('billing_payment_captures')) {
            return collect();
        }

        return BillingPaymentCapture::query()
            ->with(['invoice:id,invoice_link,status', 'matchReviews:id,capture_id,candidate_invoice_id,score,reason,status'])
            ->whereIn('match_status', ['needs_review', 'unmatched'])
            ->orderByDesc('paid_date')
            ->get()
            ->map(function (BillingPaymentCapture $capture) {
                $issueType = $capture->match_status === 'unmatched'
                    ? self::ISSUE_PAYMENT_CAPTURE_UNMATCHED
                    : self::ISSUE_PAYMENT_CAPTURE_NEEDS_REVIEW;
                $topReview = $capture->matchReviews->sortByDesc('score')->first();
                $availableActions = ['rerun_match'];
                if ($capture->matchReviews->count() > 0) {
                    $availableActions[] = 'approve_top_candidate';
                }
                $availableActions[] = 'reject_capture';

                return $this->makePayload(
                    $issueType,
                    $capture->id,
                    [
                        'severity' => $capture->match_status === 'unmatched'
                            ? ReconciliationIssue::SEVERITY_CRITICAL
                            : ReconciliationIssue::SEVERITY_HIGH,
                        'title' => $capture->match_status === 'unmatched'
                            ? 'Capture pembayaran belum menemukan invoice'
                            : 'Capture pembayaran perlu review',
                        'description' => $topReview
                            ? 'Kandidat teratas skor ' . number_format((float) $topReview->score, 0) . '% dengan alasan: ' . (($topReview->reason ?: 'tanpa alasan') . '.')
                            : 'Capture pembayaran belum bisa dipastikan ke invoice yang tepat.',
                        'primary_entity_type' => BillingPaymentCapture::class,
                        'primary_entity_id' => $capture->id,
                        'amount' => (float) $capture->amount,
                        'occurred_at' => optional($capture->paid_date)?->toDateString(),
                        'source_group' => self::SOURCE_GROUP_INVOICE_RECEIPTS,
                        'source_url' => '/settings/payment-verification',
                        'available_actions' => $availableActions,
                        'extra_meta' => [
                            'capture_id' => $capture->id,
                            'invoice_id' => $capture->invoice_id,
                            'match_status' => $capture->match_status,
                        ],
                    ]
                );
            });
    }

    private function detectInvoiceLedgerMissingIssues(): Collection
    {
        if (!Schema::hasTable('invoices') || !Schema::hasTable('financial_transactions')) {
            return collect();
        }

        $ledgerRows = FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->pluck('reference_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->all();

        $query = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at');

        if (Schema::hasColumn('invoices', 'include_in_mutation')) {
            $query->where('include_in_mutation', true);
        }

        return $query->get()
            ->reject(fn (Invoice $invoice) => in_array((int) $invoice->id, $ledgerRows, true))
            ->map(function (Invoice $invoice) {
                return $this->makePayload(
                    self::ISSUE_INVOICE_PAID_WITHOUT_CONFIRMED_LEDGER,
                    $invoice->id,
                    [
                        'severity' => ReconciliationIssue::SEVERITY_HIGH,
                        'title' => 'Invoice lunas belum masuk ledger confirmed',
                        'description' => 'Invoice sudah berstatus paid tetapi mutasi confirmed source invoice_payment belum tersedia.',
                        'primary_entity_type' => Invoice::class,
                        'primary_entity_id' => $invoice->id,
                        'amount' => (float) $invoice->amount,
                        'occurred_at' => optional($invoice->paid_at)?->toDateString(),
                        'source_group' => self::SOURCE_GROUP_LEDGER_SOURCE,
                        'source_url' => '/penagihan',
                        'available_actions' => ['resync_invoice_ledger'],
                        'extra_meta' => [
                            'invoice_id' => $invoice->id,
                            'invoice_link' => $invoice->invoice_link,
                        ],
                    ]
                );
            });
    }

    private function detectInvoiceLedgerOrphanIssues(): Collection
    {
        if (!Schema::hasTable('financial_transactions')) {
            return collect();
        }

        return FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->orderByDesc('transaction_date')
            ->get()
            ->filter(function (FinancialTransaction $transaction) {
                if ($transaction->reference_type !== Invoice::class || !$transaction->reference_id) {
                    return true;
                }

                $invoice = $transaction->reference;
                if (!$invoice instanceof Invoice) {
                    return true;
                }

                if ($invoice->status !== 'paid') {
                    return true;
                }

                if (Schema::hasColumn('invoices', 'include_in_mutation') && !(bool) ($invoice->include_in_mutation ?? true)) {
                    return true;
                }

                return false;
            })
            ->map(function (FinancialTransaction $transaction) {
                $invoice = $transaction->reference instanceof Invoice ? $transaction->reference : null;

                return $this->makePayload(
                    self::ISSUE_CONFIRMED_INVOICE_LEDGER_WITHOUT_PAID_INVOICE,
                    $transaction->id,
                    [
                        'severity' => ReconciliationIssue::SEVERITY_CRITICAL,
                        'title' => 'Ledger invoice confirmed tidak sinkron dengan status invoice',
                        'description' => $invoice
                            ? 'Ledger invoice confirmed masih ada padahal invoice belum paid atau dikecualikan dari mutasi.'
                            : 'Ledger invoice confirmed mengarah ke invoice yang hilang atau invalid.',
                        'primary_entity_type' => FinancialTransaction::class,
                        'primary_entity_id' => $transaction->id,
                        'amount' => (float) $transaction->amount,
                        'occurred_at' => optional($transaction->transaction_date)?->toDateString(),
                        'source_group' => self::SOURCE_GROUP_LEDGER_SOURCE,
                        'source_url' => $invoice ? '/penagihan' : '/mutasi',
                        'available_actions' => $invoice ? ['resync_invoice_ledger'] : [],
                        'extra_meta' => [
                            'invoice_id' => $invoice?->id,
                            'transaction_id' => $transaction->id,
                        ],
                    ]
                );
            });
    }

    private function detectPengeluaranMissingLedgerIssues(): Collection
    {
        if (!Schema::hasTable('pengeluarans') || !Schema::hasTable('financial_transactions')) {
            return collect();
        }

        $ledgerRows = FinancialTransaction::query()
            ->where('source', 'pengeluaran')
            ->where('reference_type', Pengeluaran::class)
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->pluck('reference_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->all();

        return Pengeluaran::query()
            ->orderByDesc('tanggal')
            ->get()
            ->reject(fn (Pengeluaran $pengeluaran) => in_array((int) $pengeluaran->id, $ledgerRows, true))
            ->map(function (Pengeluaran $pengeluaran) {
                return $this->makePayload(
                    self::ISSUE_PENGELUARAN_WITHOUT_LEDGER,
                    $pengeluaran->id,
                    [
                        'severity' => ReconciliationIssue::SEVERITY_HIGH,
                        'title' => 'Pengeluaran belum sinkron ke ledger',
                        'description' => 'Record pengeluaran sudah ada tetapi mutasi confirmed source pengeluaran belum tersedia.',
                        'primary_entity_type' => Pengeluaran::class,
                        'primary_entity_id' => $pengeluaran->id,
                        'amount' => (float) $pengeluaran->jumlah,
                        'occurred_at' => optional($pengeluaran->tanggal)?->toDateString(),
                        'source_group' => self::SOURCE_GROUP_LEDGER_SOURCE,
                        'source_url' => '/pengeluaran',
                        'available_actions' => ['resync_pengeluaran_ledger'],
                        'extra_meta' => [
                            'pengeluaran_id' => $pengeluaran->id,
                        ],
                    ]
                );
            });
    }

    private function detectPengeluaranLedgerOrphanIssues(): Collection
    {
        if (!Schema::hasTable('financial_transactions')) {
            return collect();
        }

        return FinancialTransaction::query()
            ->where('source', 'pengeluaran')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->orderByDesc('transaction_date')
            ->get()
            ->filter(function (FinancialTransaction $transaction) {
                if ($transaction->reference_type !== Pengeluaran::class || !$transaction->reference_id) {
                    return true;
                }

                return !$transaction->reference instanceof Pengeluaran;
            })
            ->map(function (FinancialTransaction $transaction) {
                return $this->makePayload(
                    self::ISSUE_LEDGER_PENGELUARAN_WITHOUT_SOURCE,
                    $transaction->id,
                    [
                        'severity' => ReconciliationIssue::SEVERITY_CRITICAL,
                        'title' => 'Ledger pengeluaran kehilangan source record',
                        'description' => 'Mutasi source pengeluaran masih ada tetapi record pengeluaran sumber tidak ditemukan.',
                        'primary_entity_type' => FinancialTransaction::class,
                        'primary_entity_id' => $transaction->id,
                        'amount' => (float) $transaction->amount,
                        'occurred_at' => optional($transaction->transaction_date)?->toDateString(),
                        'source_group' => self::SOURCE_GROUP_LEDGER_SOURCE,
                        'source_url' => '/mutasi',
                        'available_actions' => [],
                        'extra_meta' => [
                            'transaction_id' => $transaction->id,
                        ],
                    ]
                );
            });
    }

    private function detectPendingReviewLedgerIssues(): Collection
    {
        if (!Schema::hasTable('financial_transactions') || !Schema::hasColumn('financial_transactions', 'status')) {
            return collect();
        }

        return FinancialTransaction::query()
            ->whereIn('status', [FinancialTransaction::STATUS_PENDING, FinancialTransaction::STATUS_REJECTED])
            ->orderByDesc('transaction_date')
            ->get()
            ->map(function (FinancialTransaction $transaction) {
                $status = (string) $transaction->status;

                return $this->makePayload(
                    self::ISSUE_FINANCIAL_TRANSACTION_PENDING_REVIEW,
                    $transaction->id,
                    [
                        'severity' => $status === FinancialTransaction::STATUS_REJECTED
                            ? ReconciliationIssue::SEVERITY_HIGH
                            : ReconciliationIssue::SEVERITY_MEDIUM,
                        'title' => $status === FinancialTransaction::STATUS_REJECTED
                            ? 'Mutasi ditolak dan perlu perhatian'
                            : 'Mutasi pending review',
                        'description' => 'Status mutasi belum final sehingga angka ledger belum sepenuhnya bisa dipercaya.',
                        'primary_entity_type' => FinancialTransaction::class,
                        'primary_entity_id' => $transaction->id,
                        'amount' => (float) $transaction->amount,
                        'occurred_at' => optional($transaction->transaction_date)?->toDateString(),
                        'source_group' => self::SOURCE_GROUP_ACTION_REQUIRED,
                        'source_url' => '/mutasi',
                        'available_actions' => [],
                        'extra_meta' => [
                            'transaction_id' => $transaction->id,
                            'transaction_status' => $status,
                            'transaction_source' => $transaction->source,
                        ],
                    ]
                );
            });
    }

    private function detectDuplicateConfirmedReferenceIssues(): Collection
    {
        if (!Schema::hasTable('financial_transactions') || !Schema::hasColumn('financial_transactions', 'status')) {
            return collect();
        }

        $duplicates = FinancialTransaction::query()
            ->selectRaw('source, reference_type, reference_id, COUNT(*) as duplicate_count, COALESCE(SUM(amount), 0) as total_amount, MAX(transaction_date) as latest_date')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereNotNull('reference_type')
            ->whereNotNull('reference_id')
            ->groupBy('source', 'reference_type', 'reference_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        return $duplicates->map(function ($row) {
            $referenceType = (string) $row->reference_type;
            $referenceId = (int) $row->reference_id;
            $availableActions = [];
            $sourceUrl = '/mutasi';

            if ($referenceType === Invoice::class) {
                $availableActions[] = 'resync_invoice_ledger';
                $sourceUrl = '/penagihan';
            } elseif ($referenceType === Pengeluaran::class) {
                $availableActions[] = 'resync_pengeluaran_ledger';
                $sourceUrl = '/pengeluaran';
            }

            return $this->makePayload(
                self::ISSUE_DUPLICATE_CONFIRMED_REFERENCE,
                md5((string) $row->source . '|' . $referenceType . '|' . $referenceId),
                [
                    'severity' => ReconciliationIssue::SEVERITY_CRITICAL,
                    'title' => 'Ada duplikasi mutasi confirmed untuk source yang sama',
                    'description' => 'Kombinasi source + reference_type + reference_id seharusnya tunggal tetapi ditemukan lebih dari satu row confirmed.',
                    'primary_entity_type' => $referenceType,
                    'primary_entity_id' => $referenceId,
                    'amount' => (float) $row->total_amount,
                    'occurred_at' => $row->latest_date ? Carbon::parse($row->latest_date)->toDateString() : null,
                    'source_group' => self::SOURCE_GROUP_LEDGER_SOURCE,
                    'source_url' => $sourceUrl,
                    'available_actions' => $availableActions,
                    'extra_meta' => [
                        'reference_source' => $row->source,
                        'duplicate_count' => (int) $row->duplicate_count,
                    ],
                ]
            );
        });
    }

    private function makePayload(string $issueType, int|string $entityKey, array $attributes): array
    {
        $fingerprint = sha1($issueType . '|' . $entityKey);

        return [
            'issue_type' => $issueType,
            'fingerprint' => $fingerprint,
            'status' => ReconciliationIssue::STATUS_OPEN,
            'severity' => $attributes['severity'],
            'title' => $attributes['title'],
            'description' => $attributes['description'],
            'primary_entity_type' => $attributes['primary_entity_type'] ?? null,
            'primary_entity_id' => $attributes['primary_entity_id'] ?? null,
            'detected_at' => now(),
            'meta' => [
                'amount' => (float) ($attributes['amount'] ?? 0),
                'occurred_at' => $attributes['occurred_at'] ?? null,
                'source_group' => $attributes['source_group'] ?? self::SOURCE_GROUP_ACTION_REQUIRED,
                'source_url' => $attributes['source_url'] ?? null,
                'available_actions' => array_values($attributes['available_actions'] ?? []),
                ...((array) ($attributes['extra_meta'] ?? [])),
            ],
        ];
    }

    private function upsertIssue(array $payload): void
    {
        $existing = ReconciliationIssue::query()->where('fingerprint', $payload['fingerprint'])->first();

        if (!$existing) {
            ReconciliationIssue::query()->create($payload);
            return;
        }

        $nextStatus = $existing->status;
        $detectedAt = $existing->detected_at;
        $resolvedAt = $existing->resolved_at;
        $ignoredAt = $existing->ignored_at;

        if ($existing->status === ReconciliationIssue::STATUS_RESOLVED) {
            $nextStatus = ReconciliationIssue::STATUS_OPEN;
            $detectedAt = now();
            $resolvedAt = null;
            $ignoredAt = null;
        } elseif (!$detectedAt) {
            $detectedAt = now();
        }

        $existing->update([
            'issue_type' => $payload['issue_type'],
            'status' => $nextStatus,
            'severity' => $payload['severity'],
            'title' => $payload['title'],
            'description' => $payload['description'],
            'primary_entity_type' => $payload['primary_entity_type'],
            'primary_entity_id' => $payload['primary_entity_id'],
            'detected_at' => $detectedAt,
            'resolved_at' => $resolvedAt,
            'ignored_at' => $ignoredAt,
            'meta' => $payload['meta'],
        ]);
    }

    private function issueAgeDays(ReconciliationIssue $issue): int
    {
        if (!$issue->detected_at) {
            return 0;
        }

        return max(0, $issue->detected_at->startOfDay()->diffInDays(Carbon::today()->startOfDay()));
    }

    private function issueTypeOptions(): array
    {
        return [
            self::ISSUE_PAYMENT_CAPTURE_NEEDS_REVIEW,
            self::ISSUE_PAYMENT_CAPTURE_UNMATCHED,
            self::ISSUE_INVOICE_PAID_WITHOUT_CONFIRMED_LEDGER,
            self::ISSUE_CONFIRMED_INVOICE_LEDGER_WITHOUT_PAID_INVOICE,
            self::ISSUE_PENGELUARAN_WITHOUT_LEDGER,
            self::ISSUE_LEDGER_PENGELUARAN_WITHOUT_SOURCE,
            self::ISSUE_FINANCIAL_TRANSACTION_PENDING_REVIEW,
            self::ISSUE_DUPLICATE_CONFIRMED_REFERENCE,
        ];
    }

    private function issueTypeLabel(string $type): string
    {
        return match ($type) {
            self::ISSUE_PAYMENT_CAPTURE_NEEDS_REVIEW => 'Capture Perlu Review',
            self::ISSUE_PAYMENT_CAPTURE_UNMATCHED => 'Capture Belum Match',
            self::ISSUE_INVOICE_PAID_WITHOUT_CONFIRMED_LEDGER => 'Invoice Paid Tanpa Ledger',
            self::ISSUE_CONFIRMED_INVOICE_LEDGER_WITHOUT_PAID_INVOICE => 'Ledger Invoice Tidak Sinkron',
            self::ISSUE_PENGELUARAN_WITHOUT_LEDGER => 'Pengeluaran Tanpa Ledger',
            self::ISSUE_LEDGER_PENGELUARAN_WITHOUT_SOURCE => 'Ledger Pengeluaran Tanpa Source',
            self::ISSUE_FINANCIAL_TRANSACTION_PENDING_REVIEW => 'Mutasi Pending/Rejected',
            self::ISSUE_DUPLICATE_CONFIRMED_REFERENCE => 'Duplikasi Mutasi Confirmed',
            default => $type,
        };
    }

    private function statusLabel(string $status): string
    {
        return match ($status) {
            ReconciliationIssue::STATUS_IN_REVIEW => 'In Review',
            ReconciliationIssue::STATUS_RESOLVED => 'Resolved',
            ReconciliationIssue::STATUS_IGNORED => 'Ignored',
            default => 'Open',
        };
    }

    private function severityLabel(string $severity): string
    {
        return match ($severity) {
            ReconciliationIssue::SEVERITY_CRITICAL => 'Kritis',
            ReconciliationIssue::SEVERITY_HIGH => 'Tinggi',
            ReconciliationIssue::SEVERITY_LOW => 'Rendah',
            default => 'Sedang',
        };
    }

    private function sourceGroupLabel(string $sourceGroup): string
    {
        return match ($sourceGroup) {
            self::SOURCE_GROUP_INVOICE_RECEIPTS => 'Penerimaan Invoice',
            self::SOURCE_GROUP_LEDGER_SOURCE => 'Ledger vs Sumber',
            default => 'Perlu Tindakan',
        };
    }
}

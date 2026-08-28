<?php

namespace App\Http\Controllers;

use App\Models\BillingPaymentCapture;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Pengeluaran;
use App\Models\ReconciliationIssue;
use App\Services\FinancialLedgerService;
use App\Services\PaymentMatchingService;
use App\Services\ReconciliationCenterService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ReconciliationCenterController extends Controller
{
    public function __construct(
        private ReconciliationCenterService $reconciliationCenterService,
        private PaymentMatchingService $paymentMatchingService,
        private FinancialLedgerService $financialLedgerService,
    ) {
    }

    public function summary(Request $request)
    {
        $validated = $this->validateFilters($request, false);

        return response()->json([
            'data' => $this->reconciliationCenterService->summary($validated),
        ]);
    }

    public function issues(Request $request)
    {
        $validated = $this->validateFilters($request, true);

        return response()->json([
            'data' => $this->reconciliationCenterService->issues($validated),
        ]);
    }

    public function refresh(Request $request)
    {
        return response()->json([
            'message' => 'Issue reconciliation berhasil di-refresh.',
            'data' => $this->reconciliationCenterService->refresh($request->user()?->id),
        ]);
    }

    public function updateStatus(Request $request, ReconciliationIssue $issue)
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(ReconciliationIssue::statusOptions())],
            'resolution_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $status = (string) $validated['status'];

        $issue->update([
            'status' => $status,
            'resolution_notes' => isset($validated['resolution_notes']) ? trim((string) $validated['resolution_notes']) : $issue->resolution_notes,
            'resolved_at' => $status === ReconciliationIssue::STATUS_RESOLVED ? now() : null,
            'ignored_at' => $status === ReconciliationIssue::STATUS_IGNORED ? now() : null,
            'resolution_action' => in_array($status, [ReconciliationIssue::STATUS_RESOLVED, ReconciliationIssue::STATUS_IGNORED], true)
                ? 'manual_status_update'
                : null,
        ]);

        return response()->json([
            'message' => 'Status issue berhasil diperbarui.',
            'data' => $this->reconciliationCenterService->presentIssue($issue->fresh()),
        ]);
    }

    public function performAction(Request $request, ReconciliationIssue $issue, string $action)
    {
        $allowedActions = [
            'rerun_match',
            'approve_top_candidate',
            'reject_capture',
            'resync_invoice_ledger',
            'resync_pengeluaran_ledger',
        ];

        abort_unless(in_array($action, $allowedActions, true), 404);

        match ($action) {
            'rerun_match' => $this->handleRerunMatch($issue, $request->user()?->id),
            'approve_top_candidate' => $this->handleApproveTopCandidate($issue, $request->user()?->id),
            'reject_capture' => $this->handleRejectCapture($issue, $request->user()?->id),
            'resync_invoice_ledger' => $this->handleResyncInvoiceLedger($issue, $request->user()?->id),
            'resync_pengeluaran_ledger' => $this->handleResyncPengeluaranLedger($issue, $request->user()?->id),
        };

        $refreshResult = $this->reconciliationCenterService->refresh($request->user()?->id);
        $issue = $issue->fresh();

        return response()->json([
            'message' => 'Aksi rekonsiliasi berhasil dijalankan.',
            'data' => [
                'issue' => $issue ? $this->reconciliationCenterService->presentIssue($issue) : null,
                'refresh' => $refreshResult,
            ],
        ]);
    }

    private function handleRerunMatch(ReconciliationIssue $issue, ?int $actorId): void
    {
        $captureId = (int) data_get($issue->meta, 'capture_id', $issue->primary_entity_id);
        $capture = BillingPaymentCapture::query()->findOrFail($captureId);
        $this->paymentMatchingService->runMatching($capture->id, true, $actorId);
    }

    private function handleApproveTopCandidate(ReconciliationIssue $issue, ?int $actorId): void
    {
        $captureId = (int) data_get($issue->meta, 'capture_id', $issue->primary_entity_id);
        $capture = BillingPaymentCapture::query()->findOrFail($captureId);
        $this->paymentMatchingService->resolve($capture, 'approve', null, $actorId);
    }

    private function handleRejectCapture(ReconciliationIssue $issue, ?int $actorId): void
    {
        $captureId = (int) data_get($issue->meta, 'capture_id', $issue->primary_entity_id);
        $capture = BillingPaymentCapture::query()->findOrFail($captureId);
        $this->paymentMatchingService->resolve($capture, 'reject', null, $actorId);
    }

    private function handleResyncInvoiceLedger(ReconciliationIssue $issue, ?int $actorId): void
    {
        $invoiceId = (int) data_get($issue->meta, 'invoice_id', $issue->primary_entity_id);

        if ($issue->primary_entity_type === FinancialTransaction::class && !$invoiceId) {
            $transaction = FinancialTransaction::query()->findOrFail((int) $issue->primary_entity_id);
            $invoiceId = (int) $transaction->reference_id;
        }

        abort_if($invoiceId < 1, 422, 'Invoice sumber tidak tersedia untuk resync ledger.');

        $invoice = Invoice::query()->findOrFail($invoiceId);

        if (Schema::hasTable('financial_transactions')) {
            FinancialTransaction::query()
                ->where('source', 'invoice_payment')
                ->where('reference_type', Invoice::class)
                ->where('reference_id', $invoice->id)
                ->delete();
        }

        $this->financialLedgerService->syncInvoicePayment($invoice->fresh(), $actorId);
    }

    private function handleResyncPengeluaranLedger(ReconciliationIssue $issue, ?int $actorId): void
    {
        $pengeluaranId = (int) data_get($issue->meta, 'pengeluaran_id', $issue->primary_entity_id);

        if ($issue->primary_entity_type === FinancialTransaction::class && !$pengeluaranId) {
            $transaction = FinancialTransaction::query()->findOrFail((int) $issue->primary_entity_id);
            $pengeluaranId = (int) $transaction->reference_id;
        }

        abort_if($pengeluaranId < 1, 422, 'Pengeluaran sumber tidak tersedia untuk resync ledger.');

        $pengeluaran = Pengeluaran::query()->findOrFail($pengeluaranId);

        if (Schema::hasTable('financial_transactions')) {
            FinancialTransaction::query()
                ->where('source', 'pengeluaran')
                ->where('reference_type', Pengeluaran::class)
                ->where('reference_id', $pengeluaran->id)
                ->delete();
        }

        $this->financialLedgerService->syncPengeluaran($pengeluaran->fresh(), $actorId);
    }

    private function validateFilters(Request $request, bool $includeMetaFilters): array
    {
        return $request->validate([
            'status' => ['nullable', 'array'],
            'status.*' => ['string', Rule::in(ReconciliationIssue::statusOptions())],
            'issue_type' => ['nullable', 'array'],
            'issue_type.*' => ['string'],
            'severity' => ['nullable', 'array'],
            'severity.*' => ['string', Rule::in(ReconciliationIssue::severityOptions())],
            'source_group' => ['nullable', 'array'],
            'source_group.*' => ['string'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
        ]);
    }
}

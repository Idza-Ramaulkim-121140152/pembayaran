<?php

namespace Tests\Feature;

use App\Models\BillingPaymentCapture;
use App\Models\BillingPaymentMatchReview;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Pengeluaran;
use App\Models\ReconciliationIssue;
use App\Models\User;
use App\Services\FinancialLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReconciliationCenterTest extends TestCase
{
    use RefreshDatabase;

    public function test_refresh_detects_internal_reconciliation_issues_and_does_not_duplicate_them(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $customer = $this->createCustomer('Customer Recon');
        $paidInvoice = $this->createInvoice($customer->id, [
            'status' => 'paid',
            'paid_at' => '2026-07-10 10:00:00',
            'invoice_link' => 'INV-PAID-NO-LEDGER',
            'amount' => 200000,
        ]);

        $unpaidInvoice = $this->createInvoice($customer->id, [
            'status' => 'unpaid',
            'invoice_link' => 'INV-LEDGER-WRONG',
            'amount' => 180000,
        ]);

        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'category' => 'pembayaran',
            'description' => 'Ledger orphan invoice',
            'amount' => 180000,
            'transaction_date' => '2026-07-10',
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'reference_type' => Invoice::class,
            'reference_id' => $unpaidInvoice->id,
        ]);

        $candidateInvoice = $this->createInvoice($customer->id, [
            'status' => 'unpaid',
            'invoice_link' => 'INV-CANDIDATE',
            'amount' => 250000,
        ]);

        $needsReviewCapture = BillingPaymentCapture::query()->create([
            'source' => 'whatsapp',
            'invoice_id' => null,
            'customer_id' => $customer->id,
            'amount' => 250000,
            'paid_date' => '2026-07-12',
            'reference_code' => 'WHATSAPP-1',
            'fingerprint' => sha1('capture-needs-review'),
            'match_status' => 'needs_review',
            'match_confidence' => 82,
        ]);

        BillingPaymentMatchReview::query()->create([
            'capture_id' => $needsReviewCapture->id,
            'candidate_invoice_id' => $candidateInvoice->id,
            'score' => 82,
            'reason' => 'amount_exact,customer_match',
            'status' => 'candidate',
        ]);

        BillingPaymentCapture::query()->create([
            'source' => 'whatsapp',
            'invoice_id' => null,
            'customer_id' => null,
            'amount' => 999000,
            'paid_date' => '2026-07-13',
            'reference_code' => 'WHATSAPP-2',
            'fingerprint' => sha1('capture-unmatched'),
            'match_status' => 'unmatched',
            'match_confidence' => 40,
        ]);

        $pengeluaran = Pengeluaran::query()->create([
            'tanggal' => '2026-07-11',
            'jumlah' => 150000,
            'kategori' => 'Operasional',
            'detail' => 'Belum sync ledger',
            'user_id' => $user->id,
        ]);

        FinancialTransaction::query()->create([
            'type' => 'expense',
            'source' => 'pengeluaran',
            'category' => 'Operasional',
            'description' => 'Ledger source pengeluaran hilang',
            'amount' => 175000,
            'transaction_date' => '2026-07-09',
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'reference_type' => Pengeluaran::class,
            'reference_id' => 999999,
        ]);

        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Pending review',
            'amount' => 50000,
            'transaction_date' => '2026-07-08',
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);

        $refresh = $this->actingAs($user)->postJson('/api/reconciliation-center/refresh');
        $refresh->assertOk()
            ->assertJsonPath('data.summary.total_open', 7);

        $issuesResponse = $this->actingAs($user)->getJson('/api/reconciliation-center/issues');
        $issuesResponse->assertOk();

        $issueTypes = collect($issuesResponse->json('data.data'))->pluck('issue_type')->all();
        $this->assertContains('payment_capture_needs_review', $issueTypes);
        $this->assertContains('payment_capture_unmatched', $issueTypes);
        $this->assertContains('invoice_paid_without_confirmed_ledger', $issueTypes);
        $this->assertContains('confirmed_invoice_ledger_without_paid_invoice', $issueTypes);
        $this->assertContains('pengeluaran_without_ledger', $issueTypes);
        $this->assertContains('ledger_pengeluaran_without_source', $issueTypes);
        $this->assertContains('financial_transaction_pending_review', $issueTypes);

        $firstCount = ReconciliationIssue::query()->count();

        $this->actingAs($user)->postJson('/api/reconciliation-center/refresh')->assertOk();

        $this->assertSame($firstCount, ReconciliationIssue::query()->count());
    }

    public function test_issue_is_auto_resolved_when_mismatch_has_been_fixed(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $customer = $this->createCustomer('Customer Auto Resolve');
        $invoice = $this->createInvoice($customer->id, [
            'status' => 'paid',
            'paid_at' => '2026-07-10 10:00:00',
            'invoice_link' => 'INV-AUTO-RESOLVE',
            'amount' => 210000,
        ]);

        $this->actingAs($user)->postJson('/api/reconciliation-center/refresh')->assertOk();

        $issue = ReconciliationIssue::query()
            ->where('issue_type', 'invoice_paid_without_confirmed_ledger')
            ->firstOrFail();

        $this->assertSame(ReconciliationIssue::STATUS_OPEN, $issue->status);

        app(FinancialLedgerService::class)->syncInvoicePayment($invoice->fresh(), $user->id);

        $this->actingAs($user)->postJson('/api/reconciliation-center/refresh')->assertOk();

        $issue->refresh();
        $this->assertSame(ReconciliationIssue::STATUS_RESOLVED, $issue->status);
    }

    public function test_safe_actions_can_resync_sources_and_approve_or_rerun_capture(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $customer = $this->createCustomer('Customer Actions');

        $invoiceForResync = $this->createInvoice($customer->id, [
            'status' => 'paid',
            'paid_at' => '2026-07-10 10:00:00',
            'invoice_link' => 'INV-RESYNC',
            'amount' => 300000,
        ]);

        $pengeluaran = Pengeluaran::query()->create([
            'tanggal' => '2026-07-10',
            'jumlah' => 190000,
            'kategori' => 'Operasional',
            'detail' => 'Pengeluaran resync',
            'user_id' => $user->id,
        ]);

        $candidateInvoice = $this->createInvoice($customer->id, [
            'status' => 'unpaid',
            'invoice_link' => 'INV-APPROVE-TOP',
            'amount' => 350000,
        ]);

        $needsReviewCapture = BillingPaymentCapture::query()->create([
            'source' => 'whatsapp',
            'invoice_id' => null,
            'customer_id' => $customer->id,
            'amount' => 350000,
            'paid_date' => '2026-07-14',
            'reference_code' => 'APPROVE-TOP',
            'fingerprint' => sha1('capture-approve-top'),
            'match_status' => 'needs_review',
            'match_confidence' => 84,
        ]);

        BillingPaymentMatchReview::query()->create([
            'capture_id' => $needsReviewCapture->id,
            'candidate_invoice_id' => $candidateInvoice->id,
            'score' => 84,
            'reason' => 'amount_exact,customer_match',
            'status' => 'candidate',
        ]);

        $rerunInvoice = $this->createInvoice($customer->id, [
            'status' => 'unpaid',
            'invoice_link' => 'INV-RERUN',
            'amount' => 120000,
        ]);

        $unmatchedCapture = BillingPaymentCapture::query()->create([
            'source' => 'manual',
            'invoice_id' => null,
            'customer_id' => $customer->id,
            'amount' => 120000,
            'paid_date' => '2026-07-15',
            'reference_code' => 'RERUN-OK',
            'fingerprint' => sha1('capture-rerun'),
            'match_status' => 'unmatched',
            'match_confidence' => 20,
        ]);

        $this->actingAs($user)->postJson('/api/reconciliation-center/refresh')->assertOk();

        $invoiceIssue = ReconciliationIssue::query()
            ->where('issue_type', 'invoice_paid_without_confirmed_ledger')
            ->where('primary_entity_id', $invoiceForResync->id)
            ->firstOrFail();
        $pengeluaranIssue = ReconciliationIssue::query()
            ->where('issue_type', 'pengeluaran_without_ledger')
            ->where('primary_entity_id', $pengeluaran->id)
            ->firstOrFail();
        $approveIssue = ReconciliationIssue::query()
            ->where('issue_type', 'payment_capture_needs_review')
            ->where('primary_entity_id', $needsReviewCapture->id)
            ->firstOrFail();
        $rerunIssue = ReconciliationIssue::query()
            ->where('issue_type', 'payment_capture_unmatched')
            ->where('primary_entity_id', $unmatchedCapture->id)
            ->firstOrFail();

        $this->actingAs($user)->postJson("/api/reconciliation-center/issues/{$invoiceIssue->id}/actions/resync_invoice_ledger")
            ->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'invoice_payment',
            'reference_type' => Invoice::class,
            'reference_id' => $invoiceForResync->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $this->actingAs($user)->postJson("/api/reconciliation-center/issues/{$pengeluaranIssue->id}/actions/resync_pengeluaran_ledger")
            ->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'pengeluaran',
            'reference_type' => Pengeluaran::class,
            'reference_id' => $pengeluaran->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $this->actingAs($user)->postJson("/api/reconciliation-center/issues/{$approveIssue->id}/actions/approve_top_candidate")
            ->assertOk();
        $needsReviewCapture->refresh();
        $candidateInvoice->refresh();
        $this->assertSame('approved', $needsReviewCapture->match_status);
        $this->assertSame('paid', $candidateInvoice->status);

        $this->actingAs($user)->postJson("/api/reconciliation-center/issues/{$rerunIssue->id}/actions/rerun_match")
            ->assertOk();
        $unmatchedCapture->refresh();
        $rerunInvoice->refresh();
        $this->assertSame('approved', $unmatchedCapture->match_status);
        $this->assertSame('paid', $rerunInvoice->status);
    }

    private function createCustomer(string $name): Customer
    {
        return Customer::query()->create([
            'name' => $name,
            'phone' => '081234567890',
            'due_date' => '10',
            'package_type' => 'Paket A',
            'custom_package' => 'Rp300.000',
            'is_active' => true,
        ]);
    }

    private function createInvoice(int $customerId, array $overrides = []): Invoice
    {
        return Invoice::query()->create(array_merge([
            'customer_id' => $customerId,
            'invoice_date' => '2026-07-01',
            'due_date' => '2026-07-10',
            'amount' => 100000,
            'status' => 'unpaid',
            'invoice_link' => 'INV-' . uniqid(),
        ], $overrides));
    }
}

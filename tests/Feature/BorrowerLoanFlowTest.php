<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\BorrowerLoanPayment;
use App\Models\Customer;
use App\Models\ExpenseCategory;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\PaymentReceiverApprovalRequest;
use App\Models\PaymentReceiverUserMapping;
use App\Models\Pengeluaran;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BorrowerLoanFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_receiver_can_be_recorded_as_debt_and_dashboard_balance_is_reduced(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        Borrower::query()->create([
            'name' => 'Peminjam Aktor',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        $invoice = $this->createInvoice(100000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 100000,
            'payment_receiver_user_id' => $receiver->id,
            'other_receiver_confirmed' => true,
            'receiver_conflict_resolution' => 'debt',
        ])->assertOk();

        $loan = BorrowerLoan::query()->firstOrFail();
        $this->assertSame(BorrowerLoan::STATUS_OUTSTANDING, $loan->status);
        $this->assertSame(100000, (int) $loan->amount);
        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'invoice_payment',
            'reference_type' => Invoice::class,
            'reference_id' => $invoice->id,
            'status' => FinancialTransaction::STATUS_REJECTED,
        ]);

        $dashboard = $this->actingAs($actor)->getJson('/api/dashboard')->assertOk();
        $dashboard->assertJsonPath('data.loan_summary.total_outstanding', 100000);
        $dashboard->assertJsonPath('data.cashflow.balance', -100000);
    }

    public function test_invalid_receiver_can_request_approval_and_rejection_creates_debt(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Approval',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        $invoice = $this->createInvoice(125000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 125000,
            'payment_receiver_user_id' => $receiver->id,
            'other_receiver_confirmed' => true,
            'receiver_conflict_resolution' => 'approval',
        ])->assertOk();

        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();
        $this->assertSame(PaymentReceiverApprovalRequest::STATUS_PENDING, $approval->status);
        $this->assertSame($borrower->id, $approval->borrower_id);
        $this->assertDatabaseCount('borrower_loans', 0);
        $this->assertNotNull($approval->financial_transaction_id);
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);

        $this->actingAs($receiver)->getJson('/api/payment-receiver-approvals/pending')
            ->assertOk()
            ->assertJsonFragment(['id' => $approval->id]);

        $this->actingAs($receiver)->postJson('/api/payment-receiver-approvals/' . $approval->id . '/reject')
            ->assertOk();

        $loan = BorrowerLoan::query()->firstOrFail();
        $this->assertSame(BorrowerLoan::STATUS_REJECTED_BY_RECEIVER, $loan->status);
        $this->assertSame($borrower->id, $loan->borrower_id);
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_REJECTED,
        ]);
    }

    public function test_approval_acceptance_confirms_pending_mutation_and_affects_mutation_summary(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        Borrower::query()->create([
            'name' => 'Peminjam Approve',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        $invoice = $this->createInvoice(150000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 150000,
            'payment_receiver_user_id' => $receiver->id,
            'other_receiver_confirmed' => true,
            'receiver_conflict_resolution' => 'approval',
        ])->assertOk();

        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();

        $beforeApproval = $this->actingAs($actor)->getJson('/api/finance/transactions')->assertOk();
        $beforeApproval->assertJsonPath('summary.income', 0);

        $this->actingAs($receiver)->postJson('/api/payment-receiver-approvals/' . $approval->id . '/approve')
            ->assertOk();

        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $afterApproval = $this->actingAs($actor)->getJson('/api/finance/transactions')->assertOk();
        $afterApproval->assertJsonPath('summary.income', 150000);
    }

    public function test_loan_can_be_settled_without_creating_new_financial_transaction(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Pelunasan',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 90000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'payment_receiver_mismatch',
            'occurred_at' => now(),
        ]);

        $this->actingAs($actor)->postJson('/api/borrower-loans/' . $loan->id . '/settle', [
            'amount' => 90000,
            'payment_date' => now()->toDateString(),
        ])->assertOk();

        $loan->refresh();
        $this->assertSame(BorrowerLoan::STATUS_SETTLED, $loan->status);
        $this->assertSame(90000, (int) $loan->settled_amount);
        $payment = $loan->payments()->firstOrFail();
        $this->assertSame(90000, (int) $payment->amount);
        $this->assertNull($payment->financial_transaction_id);
        $this->assertFalse(FinancialTransaction::query()
            ->where('source', 'borrower_loan_settlement')
            ->where('reference_type', BorrowerLoan::class)
            ->where('reference_id', $loan->id)
            ->exists());
    }

    public function test_manual_loan_can_be_created_without_invoice(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Manual',
            'is_active' => true,
        ]);

        $this->actingAs($actor)->postJson('/api/borrower-loans', [
            'borrower_id' => $borrower->id,
            'amount' => 50000,
            'occurred_at' => now()->toDateString(),
            'notes' => 'Input manual',
        ])->assertCreated();

        $this->assertDatabaseHas('borrower_loans', [
            'borrower_id' => $borrower->id,
            'amount' => 50000,
            'source' => 'manual_loan',
        ]);
    }

    public function test_borrower_loans_index_returns_borrower_summary_and_history_without_creator_display_dependency(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Histori',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $customer = Customer::query()->create([
            'name' => 'Pelanggan Histori',
            'phone' => '081400000001',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);
        $invoice = Invoice::query()->create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->subDay()->toDateString(),
            'due_date' => now()->subDay()->toDateString(),
            'amount' => 120000,
            'status' => 'paid',
            'invoice_link' => 'INV-HISTORI-001',
            'paid_at' => now()->subDay(),
        ]);

        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'invoice_id' => $invoice->id,
            'confirmed_by_user_id' => $actor->id,
            'amount' => 120000,
            'settled_amount' => 30000,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDay(),
            'notes' => 'Pinjaman awal',
        ]);
        $loan->payments()->create([
            'amount' => 30000,
            'payment_date' => now()->toDateString(),
            'received_by_user_id' => $actor->id,
            'notes' => 'Pelunasan parsial',
        ]);

        $response = $this->actingAs($actor)->getJson('/api/borrower-loans')->assertOk();

        $response->assertJsonPath('borrowers_summary.0.borrower_id', $borrower->id);
        $response->assertJsonPath('borrowers_summary.0.total_outstanding', 90000);
        $response->assertJsonPath('borrowers_summary.0.outstanding_loans_count', 1);
        $response->assertJsonFragment([
            'history_type' => 'loan',
            'loan_id' => $loan->id,
            'notes' => 'Pinjaman awal',
        ]);
        $response->assertJsonFragment([
            'customer_name' => 'Pelanggan Histori',
            'display_notes' => 'Pinjaman awal | Pelanggan: Pelanggan Histori',
        ]);
        $response->assertJsonFragment([
            'history_type' => 'settlement',
            'notes' => 'Pelunasan parsial',
            'actor_name' => $actor->name,
        ]);
        $response->assertJsonFragment([
            'display_notes' => 'Pelunasan parsial',
        ]);
        $this->assertStringNotContainsString(
            'Pelanggan:',
            collect($response->json('history'))
                ->firstWhere('history_type', 'settlement')['display_notes'] ?? ''
        );
    }

    public function test_non_company_self_confirm_creates_confirmed_mutation_and_direct_debt(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $invoice = $this->createInvoice(80000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 80000,
            'payment_receiver_user_id' => $actor->id,
        ])->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame($actor->id, $invoice->payment_receiver_user_id);

        $borrower = Borrower::query()->where('mapped_user_id', $actor->id)->firstOrFail();
        $this->assertSame($actor->name, $borrower->name);

        $loan = BorrowerLoan::query()->firstOrFail();
        $this->assertSame($borrower->id, $loan->borrower_id);
        $this->assertSame(BorrowerLoan::STATUS_OUTSTANDING, $loan->status);
        $this->assertSame(80000, (int) $loan->amount);

        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'invoice_payment',
            'reference_type' => Invoice::class,
            'reference_id' => $invoice->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);
        $this->assertDatabaseCount('payment_receiver_approval_requests', 0);

        $dashboard = $this->actingAs($actor)->getJson('/api/dashboard')->assertOk();
        $dashboard->assertJsonPath('data.loan_summary.total_outstanding', 80000);
        $dashboard->assertJsonPath('data.cashflow.balance', 0);
    }

    public function test_partial_loan_settlement_reduces_outstanding_without_increasing_mutation_summary(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Parsial',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 120000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'payment_receiver_mismatch',
            'occurred_at' => now(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'category' => 'pembayaran',
            'description' => 'Mutasi invoice existing',
            'amount' => 120000,
            'transaction_date' => now()->toDateString(),
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'reference_type' => BorrowerLoan::class,
            'reference_id' => $loan->id,
        ]);

        $beforeMutations = $this->actingAs($actor)->getJson('/api/finance/transactions')->assertOk();
        $beforeMutations->assertJsonPath('summary.income', 120000);

        $beforeDashboard = $this->actingAs($actor)->getJson('/api/dashboard')->assertOk();
        $beforeDashboard->assertJsonPath('data.loan_summary.total_outstanding', 120000);
        $beforeDashboard->assertJsonPath('data.cashflow.balance', 0);

        $this->actingAs($actor)->postJson('/api/borrower-loans/' . $loan->id . '/settle', [
            'amount' => 50000,
            'payment_date' => now()->toDateString(),
            'notes' => 'Bayar sebagian',
        ])->assertOk();

        $loan->refresh();
        $this->assertSame(BorrowerLoan::STATUS_OUTSTANDING, $loan->status);
        $this->assertSame(50000, (int) $loan->settled_amount);

        $afterMutations = $this->actingAs($actor)->getJson('/api/finance/transactions')->assertOk();
        $afterMutations->assertJsonPath('summary.income', 120000);

        $afterDashboard = $this->actingAs($actor)->getJson('/api/dashboard')->assertOk();
        $afterDashboard->assertJsonPath('data.loan_summary.total_outstanding', 70000);
        $afterDashboard->assertJsonPath('data.cashflow.balance', 50000);
    }

    public function test_borrower_total_settlement_allocates_to_oldest_loans_first(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Total',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);

        $oldest = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDays(3),
        ]);
        $middle = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 80000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDays(2),
        ]);
        $latest = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 60000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($actor)->postJson("/api/borrowers/{$borrower->id}/settle", [
            'amount' => 150000,
            'payment_date' => now()->toDateString(),
            'notes' => 'Pelunasan total akun',
        ])->assertOk();

        $response->assertJsonPath('data.borrower_id', $borrower->id)
            ->assertJsonPath('data.allocated_total', 150000)
            ->assertJsonPath('data.remaining_outstanding', 90000)
            ->assertJsonCount(2, 'data.allocations');

        $oldest->refresh();
        $middle->refresh();
        $latest->refresh();

        $this->assertSame(BorrowerLoan::STATUS_SETTLED, $oldest->status);
        $this->assertSame(100000, (int) $oldest->settled_amount);
        $this->assertSame(BorrowerLoan::STATUS_OUTSTANDING, $middle->status);
        $this->assertSame(50000, (int) $middle->settled_amount);
        $this->assertSame(0, (int) $latest->settled_amount);

        $this->assertDatabaseHas('borrower_loan_payments', [
            'borrower_loan_id' => $oldest->id,
            'amount' => 100000,
            'notes' => 'Pelunasan total akun',
        ]);
        $this->assertDatabaseHas('borrower_loan_payments', [
            'borrower_loan_id' => $middle->id,
            'amount' => 50000,
            'notes' => 'Pelunasan total akun',
        ]);
        $this->assertDatabaseMissing('borrower_loan_payments', [
            'borrower_loan_id' => $latest->id,
        ]);

        $historyResponse = $this->actingAs($actor)->getJson('/api/borrower-loans')->assertOk();
        $settlementHistory = collect($historyResponse->json('history'))
            ->where('history_type', 'settlement')
            ->values();

        $this->assertCount(1, $settlementHistory);
        $this->assertSame('Peminjam Total', data_get($settlementHistory->first(), 'borrower.name'));
        $this->assertSame($actor->name, data_get($settlementHistory->first(), 'actor_name'));
        $this->assertSame(150000, (int) data_get($settlementHistory->first(), 'amount'));
        $this->assertSame(2, (int) data_get($settlementHistory->first(), 'affected_items_count'));
    }

    public function test_settlement_expense_options_show_mapped_borrower_user_expenses_by_default(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $mappedUser = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $otherUser = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Opsi Pengeluaran',
            'mapped_user_id' => $mappedUser->id,
            'is_active' => true,
        ]);
        $category = ExpenseCategory::query()->create(['name' => 'Operasional', 'is_active' => true]);

        $recentMappedExpense = Pengeluaran::query()->create([
            'tanggal' => now()->subDays(2)->toDateString(),
            'jumlah' => 50000,
            'kategori' => $category->name,
            'detail' => 'Beli material sendiri',
            'user_id' => $mappedUser->id,
            'expense_category_id' => $category->id,
        ]);
        $oldMappedExpense = Pengeluaran::query()->create([
            'tanggal' => now()->subDays(20)->toDateString(),
            'jumlah' => 75000,
            'kategori' => $category->name,
            'detail' => 'Pengeluaran lama',
            'user_id' => $mappedUser->id,
            'expense_category_id' => $category->id,
        ]);
        Pengeluaran::query()->create([
            'tanggal' => now()->subDays(1)->toDateString(),
            'jumlah' => 65000,
            'kategori' => $category->name,
            'detail' => 'Milik actor login',
            'user_id' => $actor->id,
            'expense_category_id' => $category->id,
        ]);
        Pengeluaran::query()->create([
            'tanggal' => now()->subDays(1)->toDateString(),
            'jumlah' => 90000,
            'kategori' => $category->name,
            'detail' => 'Milik user lain',
            'user_id' => $otherUser->id,
            'expense_category_id' => $category->id,
        ]);

        $defaultResponse = $this->actingAs($actor)->getJson("/api/borrowers/{$borrower->id}/settlement-expenses")
            ->assertOk();

        $this->assertSame('7', $defaultResponse->json('window'));
        $this->assertSame([$recentMappedExpense->id], collect($defaultResponse->json('data'))->pluck('id')->all());
        $this->assertSame($mappedUser->id, $defaultResponse->json('mapped_user.id'));

        $expandedResponse = $this->actingAs($actor)->getJson("/api/borrowers/{$borrower->id}/settlement-expenses?window=30")
            ->assertOk();

        $this->assertEqualsCanonicalizing(
            [$recentMappedExpense->id, $oldMappedExpense->id],
            collect($expandedResponse->json('data'))->pluck('id')->all()
        );
    }

    public function test_settlement_expense_options_are_empty_when_borrower_has_no_mapped_user(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Tanpa Mapping',
            'is_active' => true,
        ]);

        $response = $this->actingAs($actor)->getJson("/api/borrowers/{$borrower->id}/settlement-expenses")
            ->assertOk();

        $this->assertSame([], $response->json('data'));
        $this->assertNull($response->json('mapped_user'));
        $this->assertSame('Peminjam belum terhubung ke akun sistem.', $response->json('message'));
    }

    public function test_borrower_total_settlement_can_link_to_own_pengeluaran_and_use_expense_defaults(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $mappedUser = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Link Pengeluaran',
            'mapped_user_id' => $mappedUser->id,
            'is_active' => true,
        ]);
        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 60000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDay(),
        ]);
        $category = ExpenseCategory::query()->create(['name' => 'Operasional', 'is_active' => true]);
        $pengeluaran = Pengeluaran::query()->create([
            'tanggal' => now()->toDateString(),
            'jumlah' => 60000,
            'kategori' => $category->name,
            'detail' => 'Pengeluaran jadi pelunasan',
            'user_id' => $mappedUser->id,
            'expense_category_id' => $category->id,
        ]);

        $this->actingAs($actor)->postJson("/api/borrowers/{$borrower->id}/settle", [
            'pengeluaran_id' => $pengeluaran->id,
        ])->assertOk();

        $loan->refresh();
        $this->assertSame(BorrowerLoan::STATUS_SETTLED, $loan->status);
        $this->assertSame(60000, (int) $loan->settled_amount);
        $this->assertDatabaseHas('borrower_loan_payments', [
            'borrower_loan_id' => $loan->id,
            'amount' => 60000,
            'pengeluaran_id' => $pengeluaran->id,
            'notes' => 'Pengeluaran jadi pelunasan',
        ]);

        $historyResponse = $this->actingAs($actor)->getJson('/api/borrower-loans')->assertOk();
        $historyResponse->assertJsonFragment([
            'linked_pengeluaran' => [
                'id' => $pengeluaran->id,
                'tanggal' => now()->toDateString(),
                'jumlah' => 60000,
                'kategori' => 'Operasional',
                'detail' => 'Pengeluaran jadi pelunasan',
                'label' => now()->format('d/m/Y') . ' - Rp 60.000 - Operasional - Pengeluaran jadi pelunasan',
            ],
        ]);
    }

    public function test_borrower_settlement_rejects_pengeluaran_from_actor_when_actor_is_not_mapped_user(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $mappedUser = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Pengeluaran Orang',
            'mapped_user_id' => $mappedUser->id,
            'is_active' => true,
        ]);
        BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 60000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDay(),
        ]);
        $category = ExpenseCategory::query()->create(['name' => 'Operasional', 'is_active' => true]);
        $pengeluaran = Pengeluaran::query()->create([
            'tanggal' => now()->toDateString(),
            'jumlah' => 60000,
            'kategori' => $category->name,
            'detail' => 'Milik actor login',
            'user_id' => $actor->id,
            'expense_category_id' => $category->id,
        ]);

        $this->actingAs($actor)->postJson("/api/borrowers/{$borrower->id}/settle", [
            'pengeluaran_id' => $pengeluaran->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors('pengeluaran_id');

        $this->assertDatabaseCount('borrower_loan_payments', 0);
    }

    public function test_borrower_total_settlement_rejects_amount_above_total_outstanding(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Over',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 50000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now(),
        ]);

        $this->actingAs($actor)->postJson("/api/borrowers/{$borrower->id}/settle", [
            'amount' => 60000,
            'payment_date' => now()->toDateString(),
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Nominal pelunasan melebihi total outstanding peminjam.');
    }

    public function test_invoice_paid_without_mutation_does_not_create_receiver_debt_or_approval(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_mutation' => true,
            'can_choose_payment_receiver' => true,
        ]);
        Borrower::query()->create([
            'name' => 'Peminjam Tanpa Mutasi',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $invoice = $this->createInvoice(175000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 175000,
            'include_in_mutation' => false,
            'payment_receiver_user_id' => $actor->id,
        ])->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertFalse((bool) $invoice->include_in_mutation);
        $this->assertDatabaseCount('financial_transactions', 0);
        $this->assertDatabaseCount('borrower_loans', 0);
        $this->assertDatabaseCount('payment_receiver_approval_requests', 0);
    }

    public function test_superadmin_can_edit_and_delete_loan_history(): void
    {
        $superadmin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Edit',
            'is_active' => true,
        ]);
        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDay(),
            'notes' => 'Awal',
        ]);

        $this->actingAs($superadmin)->putJson("/api/borrower-loans/{$loan->id}", [
            'amount' => 125000,
            'occurred_at' => now()->toDateString(),
            'notes' => 'Diubah',
        ])->assertOk();

        $loan->refresh();
        $this->assertSame(125000, (int) $loan->amount);
        $this->assertSame('Diubah', $loan->notes);
        $this->assertSame(BorrowerLoan::STATUS_OUTSTANDING, $loan->status);

        $this->actingAs($superadmin)->deleteJson("/api/borrower-loans/{$loan->id}")
            ->assertOk();

        $this->assertDatabaseMissing('borrower_loans', ['id' => $loan->id]);
    }

    public function test_superadmin_can_edit_and_delete_settlement_group_history(): void
    {
        $superadmin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Settlement',
            'is_active' => true,
        ]);
        $oldest = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDays(2),
        ]);
        $latest = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDay(),
        ]);

        $settle = $this->actingAs($superadmin)->postJson("/api/borrowers/{$borrower->id}/settle", [
            'amount' => 150000,
            'payment_date' => now()->toDateString(),
            'notes' => 'Pelunasan awal',
        ])->assertOk();

        $actionGroupKey = $settle->json('data.action_group_key');
        $this->assertNotEmpty($actionGroupKey);

        $this->actingAs($superadmin)->putJson("/api/borrower-loan-settlements/{$actionGroupKey}", [
            'amount' => 120000,
            'payment_date' => now()->toDateString(),
            'notes' => 'Pelunasan edit',
        ])->assertOk();

        $oldest->refresh();
        $latest->refresh();
        $this->assertSame(100000, (int) $oldest->settled_amount);
        $this->assertSame(20000, (int) $latest->settled_amount);
        $this->assertSame(120000, (int) BorrowerLoanPayment::query()->where('action_group_key', $actionGroupKey)->sum('amount'));

        $this->actingAs($superadmin)->deleteJson("/api/borrower-loan-settlements/{$actionGroupKey}")
            ->assertOk();

        $oldest->refresh();
        $latest->refresh();
        $this->assertSame(0, (int) $oldest->settled_amount);
        $this->assertSame(0, (int) $latest->settled_amount);
        $this->assertDatabaseMissing('borrower_loan_payments', ['action_group_key' => $actionGroupKey]);
    }

    public function test_non_superadmin_cannot_edit_or_delete_loan_history(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Guard',
            'is_active' => true,
        ]);
        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 50000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now(),
        ]);

        $this->actingAs($actor)->putJson("/api/borrower-loans/{$loan->id}", [
            'amount' => 60000,
            'occurred_at' => now()->toDateString(),
        ])->assertForbidden();

        $this->actingAs($actor)->deleteJson("/api/borrower-loans/{$loan->id}")
            ->assertForbidden();
    }

    private function createInvoice(int $amount): Invoice
    {
        $customer = Customer::create([
            'name' => 'Borrower Loan Customer ' . $amount,
            'phone' => '0813' . $amount,
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => $amount,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-borrower-loan-' . $amount,
        ]);
    }
}

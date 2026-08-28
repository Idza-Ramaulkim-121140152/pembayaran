<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\CompanyFinanceReceiver;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\PaymentReceiverApprovalRequest;
use App\Models\PaymentReceiverUserMapping;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CompanyFinanceReceiverFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_finance_receiver_can_self_confirm_without_borrower_mapping(): void
    {
        $financeReceiver = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        CompanyFinanceReceiver::query()->create([
            'user_id' => $financeReceiver->id,
            'is_active' => true,
        ]);
        $invoice = $this->createInvoice(110000);

        $this->actingAs($financeReceiver)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 110000,
            'payment_receiver_user_id' => $financeReceiver->id,
        ])->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame($financeReceiver->id, $invoice->payment_receiver_user_id);
        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'invoice_payment',
            'reference_type' => Invoice::class,
            'reference_id' => $invoice->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);
        $this->assertDatabaseCount('payment_receiver_approval_requests', 0);
        $this->assertDatabaseCount('borrower_loans', 0);
        $this->assertDatabaseCount('borrowers', 0);
    }

    public function test_payment_receivers_and_company_finance_master_endpoints_return_flags_and_prevent_duplicates(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_choose_payment_receiver' => true,
        ]);
        $companyReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $companyReceiver->id,
        ]);

        $this->actingAs($actor)->postJson('/api/company-finance-receivers', [
            'user_id' => $companyReceiver->id,
        ])->assertCreated();

        $this->actingAs($actor)->postJson('/api/company-finance-receivers', [
            'user_id' => $companyReceiver->id,
        ])->assertStatus(422);

        $this->actingAs($actor)->getJson('/api/company-finance-receivers')
            ->assertOk()
            ->assertJsonFragment([
                'user_id' => $companyReceiver->id,
                'is_active' => true,
            ]);

        $this->actingAs($actor)->getJson('/api/payment-receivers')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $companyReceiver->id,
                'is_company_finance_receiver' => true,
            ]);

        $this->actingAs($actor)->deleteJson('/api/company-finance-receivers/' . $companyReceiver->id)
            ->assertOk();

        $this->assertDatabaseHas('company_finance_receivers', [
            'user_id' => $companyReceiver->id,
            'is_active' => false,
        ]);
    }

    public function test_company_finance_receiver_approval_acceptance_confirms_mutation_without_creating_debt(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $companyReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        CompanyFinanceReceiver::query()->create([
            'user_id' => $companyReceiver->id,
            'is_active' => true,
        ]);
        Borrower::query()->create([
            'name' => 'Borrower Company Finance Approve',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $companyReceiver->id,
        ]);
        $invoice = $this->createInvoice(125000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 125000,
            'payment_receiver_user_id' => $companyReceiver->id,
            'other_receiver_confirmed' => true,
            'receiver_conflict_resolution' => 'approval',
        ])->assertOk();

        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();

        $this->actingAs($companyReceiver)->postJson('/api/payment-receiver-approvals/' . $approval->id . '/approve')
            ->assertOk();

        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);
        $this->assertDatabaseCount('borrower_loans', 0);
    }

    public function test_company_finance_receiver_does_not_require_second_confirmation_popup_when_mapped(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $companyReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        CompanyFinanceReceiver::query()->create([
            'user_id' => $companyReceiver->id,
            'is_active' => true,
        ]);
        Borrower::query()->create([
            'name' => 'Borrower Company Finance No Popup',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $companyReceiver->id,
        ]);
        $invoice = $this->createInvoice(126000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 126000,
            'payment_receiver_user_id' => $companyReceiver->id,
        ])->assertOk();

        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);
    }

    public function test_company_finance_receiver_without_mapping_returns_invalid_receiver_instead_of_second_confirmation(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $companyReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        CompanyFinanceReceiver::query()->create([
            'user_id' => $companyReceiver->id,
            'is_active' => true,
        ]);
        Borrower::query()->create([
            'name' => 'Borrower Company Finance Invalid Receiver',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $invoice = $this->createInvoice(127000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 127000,
            'payment_receiver_user_id' => $companyReceiver->id,
        ])->assertStatus(422)
            ->assertJson([
                'action_required' => 'resolve_invalid_receiver',
            ]);
    }

    public function test_company_finance_receiver_rejection_creates_debt_for_requesting_user(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $companyReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        CompanyFinanceReceiver::query()->create([
            'user_id' => $companyReceiver->id,
            'is_active' => true,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Borrower Company Finance Reject',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $companyReceiver->id,
        ]);
        $invoice = $this->createInvoice(135000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 135000,
            'payment_receiver_user_id' => $companyReceiver->id,
            'other_receiver_confirmed' => true,
            'receiver_conflict_resolution' => 'approval',
        ])->assertOk();

        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();

        $this->actingAs($companyReceiver)->postJson('/api/payment-receiver-approvals/' . $approval->id . '/reject')
            ->assertOk();

        $loan = BorrowerLoan::query()->firstOrFail();
        $this->assertSame($borrower->id, $loan->borrower_id);
        $this->assertSame(BorrowerLoan::STATUS_REJECTED_BY_RECEIVER, $loan->status);
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_REJECTED,
        ]);
    }

    private function createInvoice(int $amount): Invoice
    {
        $customer = Customer::create([
            'name' => 'Company Finance Customer ' . $amount,
            'phone' => '0822' . $amount,
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => $amount,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-company-finance-' . $amount,
        ]);
    }
}

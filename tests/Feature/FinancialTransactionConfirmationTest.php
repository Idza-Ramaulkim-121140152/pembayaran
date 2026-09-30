<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\PaymentReceiptOption;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancialTransactionConfirmationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_confirm_pending_financial_transaction(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_edit_mutations' => true,
        ]);

        $teknisi = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
        ]);

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'installation',
            'description' => 'Biaya pemasangan pelanggan TAUFIK',
            'amount' => 250000,
            'transaction_date' => now()->toDateString(),
            'created_by' => $teknisi->id,
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);

        $response = $this->actingAs($admin)
            ->postJson("/api/finance/transactions/{$transaction->id}/confirm");

        $response->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $transaction->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'updated_by' => $admin->id,
        ]);
    }

    public function test_admin_can_reject_pending_financial_transaction(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_edit_mutations' => true,
        ]);

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'installation',
            'description' => 'Biaya pemasangan pelanggan Test',
            'amount' => 150000,
            'transaction_date' => now()->toDateString(),
            'created_by' => $admin->id,
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);

        $response = $this->actingAs($admin)
            ->postJson("/api/finance/transactions/{$transaction->id}/reject");

        $response->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $transaction->id,
            'status' => FinancialTransaction::STATUS_REJECTED,
            'updated_by' => $admin->id,
        ]);
    }

    public function test_admin_can_update_status_via_transaction_update(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_edit_mutations' => true,
        ]);

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'installation',
            'description' => 'Biaya pemasangan pelanggan Test',
            'amount' => 150000,
            'transaction_date' => now()->toDateString(),
            'created_by' => $admin->id,
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);

        $response = $this->actingAs($admin)
            ->putJson("/api/finance/transactions/{$transaction->id}", [
                'description' => 'Biaya pemasangan pelanggan Test (Updated)',
                'amount' => 150000,
                'transaction_date' => now()->toDateString(),
                'status' => 'confirmed',
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $transaction->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);
    }

    public function test_confirming_pending_transaction_with_non_company_receiver_creates_borrower_debt(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_edit_mutations' => true,
        ]);

        $teknisi = User::factory()->create([
            'name' => 'Kholid Rosidi',
            'role' => User::ROLE_TEKNISI,
        ]);

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'installation',
            'description' => 'Biaya pemasangan pelanggan TAUFIK SUWANDI',
            'amount' => 250000,
            'transaction_date' => now()->toDateString(),
            'created_by' => $teknisi->id,
            'status' => FinancialTransaction::STATUS_PENDING,
            'meta' => [
                'payment_receiver_user_id' => $teknisi->id,
            ],
        ]);

        $response = $this->actingAs($admin)
            ->postJson("/api/finance/transactions/{$transaction->id}/confirm", [
                'payment_receiver_user_id' => $teknisi->id,
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $transaction->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        // Borrower debt should be created for teknisi
        $this->assertDatabaseHas('borrower_loans', [
            'target_receiver_user_id' => $teknisi->id,
            'amount' => 250000,
            'status' => 'outstanding',
        ]);
    }

    public function test_confirming_pending_transaction_with_company_finance_receiver_does_not_create_debt(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_edit_mutations' => true,
        ]);

        $companyFinanceUser = User::factory()->create([
            'name' => 'Rekening Kantor',
            'role' => User::ROLE_ADMIN,
        ]);

        \App\Models\CompanyFinanceReceiver::create([
            'user_id' => $companyFinanceUser->id,
            'is_active' => true,
        ]);

        $teknisi = User::factory()->create([
            'name' => 'Kholid Rosidi',
            'role' => User::ROLE_TEKNISI,
        ]);

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'installation',
            'description' => 'Biaya pemasangan pelanggan TAUFIK SUWANDI',
            'amount' => 250000,
            'transaction_date' => now()->toDateString(),
            'created_by' => $teknisi->id,
            'status' => FinancialTransaction::STATUS_PENDING,
            'meta' => [
                'payment_receiver_user_id' => $teknisi->id,
            ],
        ]);

        $response = $this->actingAs($admin)
            ->postJson("/api/finance/transactions/{$transaction->id}/confirm", [
                'payment_receiver_user_id' => $companyFinanceUser->id,
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $transaction->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        // No borrower debt created
        $this->assertDatabaseCount('borrower_loans', 0);
    }
}

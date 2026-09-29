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
}

<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\User;
use App\Services\FinancialLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingPaymentMutationChoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_without_choice_permission_is_forced_to_include_payment_in_mutation(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_mutation' => false,
        ]);
        $invoice = $this->createInvoice(amount: 125000);

        $this->actingAs($user)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 125000,
            'include_in_mutation' => false,
        ])->assertOk();

        $invoice->refresh();
        $this->assertTrue((bool) $invoice->include_in_mutation);
        $this->assertInvoiceMutationExists($invoice);
    }

    public function test_user_with_choice_permission_can_include_payment_in_mutation(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_mutation' => true,
        ]);
        $invoice = $this->createInvoice(amount: 175000);

        $this->actingAs($user)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 175000,
            'include_in_mutation' => true,
        ])->assertOk();

        $invoice->refresh();
        $this->assertTrue((bool) $invoice->include_in_mutation);
        $this->assertInvoiceMutationExists($invoice);
    }

    public function test_user_with_choice_permission_can_exclude_payment_and_resync_will_not_recreate_mutation(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_mutation' => true,
        ]);
        $invoice = $this->createInvoice(amount: 225000);

        $this->actingAs($user)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 225000,
            'include_in_mutation' => true,
        ])->assertOk();
        $this->assertInvoiceMutationExists($invoice->fresh());

        $this->actingAs($user)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 225000,
            'include_in_mutation' => false,
        ])->assertOk();

        $invoice->refresh();
        $this->assertFalse((bool) $invoice->include_in_mutation);
        $this->assertInvoiceMutationMissing($invoice);

        app(FinancialLedgerService::class)->syncInvoicePayment($invoice->fresh(), $user->id);
        $this->assertInvoiceMutationMissing($invoice->fresh());
    }

    private function createInvoice(int $amount): Invoice
    {
        $customer = Customer::create([
            'name' => 'Mutation Choice Customer ' . $amount,
            'phone' => '0812' . $amount,
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => $amount,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-mutation-choice-' . $amount,
        ]);
    }

    private function assertInvoiceMutationExists(Invoice $invoice): void
    {
        $this->assertTrue(FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->exists());
    }

    private function assertInvoiceMutationMissing(Invoice $invoice): void
    {
        $this->assertFalse(FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->exists());
    }
}

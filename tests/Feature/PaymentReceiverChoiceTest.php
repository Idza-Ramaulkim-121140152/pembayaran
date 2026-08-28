<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Borrower;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\PaymentReceiverUserMapping;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentReceiverChoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_without_receiver_permission_is_forced_as_payment_receiver(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => false,
        ]);
        $requestedReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $invoice = $this->createInvoice(125000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 125000,
            'payment_receiver_user_id' => $requestedReceiver->id,
        ])->assertOk();

        $invoice->refresh();
        $this->assertSame($actor->id, $invoice->payment_receiver_user_id);

        $mutation = $this->invoiceMutation($invoice);
        $this->assertSame($actor->id, $mutation->meta['payment_receiver_user_id'] ?? null);
        $this->assertSame($actor->name, $mutation->meta['payment_receiver_name'] ?? null);
        $this->assertSame($actor->id, $mutation->created_by);
        $this->assertSame(FinancialTransaction::STATUS_CONFIRMED, $mutation->status);
        $this->assertDatabaseHas('borrower_loans', [
            'invoice_id' => $invoice->id,
            'confirmed_by_user_id' => $actor->id,
            'target_receiver_user_id' => $actor->id,
            'actual_receiver_user_id' => $actor->id,
            'status' => 'outstanding',
            'source' => 'payment_receiver_mismatch',
        ]);
        $this->assertDatabaseHas('borrowers', [
            'mapped_user_id' => $actor->id,
            'name' => $actor->name,
            'is_active' => true,
        ]);
    }

    public function test_user_with_receiver_permission_creates_pending_mutation_when_receiver_is_another_mapped_account(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        Borrower::query()->create([
            'name' => 'Peminjam Receiver Choice',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $invoice = $this->createInvoice(175000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 175000,
            'payment_receiver_user_id' => $receiver->id,
            'other_receiver_confirmed' => true,
            'receiver_conflict_resolution' => 'approval',
        ])->assertOk();

        $invoice->refresh();
        $this->assertSame($receiver->id, $invoice->payment_receiver_user_id);

        $mutation = $this->invoiceMutation($invoice);
        $this->assertSame($receiver->id, $mutation->meta['payment_receiver_user_id'] ?? null);
        $this->assertSame($receiver->name, $mutation->meta['payment_receiver_name'] ?? null);
        $this->assertSame($actor->id, $mutation->created_by);
        $this->assertSame(FinancialTransaction::STATUS_PENDING, $mutation->status);
    }

    public function test_user_with_receiver_permission_must_confirm_again_for_non_company_other_receiver(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        Borrower::query()->create([
            'name' => 'Peminjam Receiver Confirm Again',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        $invoice = $this->createInvoice(176000);

        $this->actingAs($actor)->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
            'paid_amount' => 176000,
            'payment_receiver_user_id' => $receiver->id,
        ])->assertStatus(422)
            ->assertJson([
                'action_required' => 'confirm_other_receiver',
            ]);
    }

    public function test_manual_income_stores_and_updates_payment_receiver_meta(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_FINANCE,
            'can_edit_mutations' => true,
            'can_choose_payment_receiver' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $otherReceiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $otherReceiver->id,
        ]);

        $createResponse = $this->actingAs($actor)->postJson('/api/finance/manual-income', [
            'source' => 'manual',
            'description' => 'Pemasukan manual penerima',
            'amount' => 50000,
            'transaction_date' => now()->toDateString(),
            'payment_receiver_user_id' => $receiver->id,
        ])->assertCreated();

        $transaction = FinancialTransaction::findOrFail($createResponse->json('data.id'));
        $this->assertSame($receiver->id, $transaction->meta['payment_receiver_user_id'] ?? null);
        $this->assertSame($receiver->name, $transaction->meta['payment_receiver_name'] ?? null);
        $this->assertSame($actor->id, $transaction->created_by);

        $this->actingAs($actor)->putJson('/api/finance/transactions/' . $transaction->id, [
            'description' => 'Pemasukan manual penerima update',
            'amount' => 60000,
            'transaction_date' => now()->toDateString(),
            'category' => 'manual',
            'payment_receiver_user_id' => $otherReceiver->id,
        ])->assertOk();

        $transaction->refresh();
        $this->assertSame($otherReceiver->id, $transaction->meta['payment_receiver_user_id'] ?? null);
        $this->assertSame($otherReceiver->name, $transaction->meta['payment_receiver_name'] ?? null);
        $this->assertSame($actor->id, $transaction->updated_by);
    }

    public function test_payment_receivers_endpoint_requires_permission(): void
    {
        $denied = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_choose_payment_receiver' => false,
        ]);
        $allowed = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_choose_payment_receiver' => true,
        ]);

        $this->actingAs($denied)->getJson('/api/payment-receivers')->assertForbidden();

        $this->actingAs($allowed)->getJson('/api/payment-receivers')
            ->assertOk()
            ->assertJsonFragment(['id' => $allowed->id, 'name' => $allowed->name]);
    }

    private function createInvoice(int $amount): Invoice
    {
        $customer = Customer::create([
            'name' => 'Receiver Choice Customer ' . $amount,
            'phone' => '0821' . $amount,
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => $amount,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-payment-receiver-' . $amount,
        ]);
    }

    private function invoiceMutation(Invoice $invoice): FinancialTransaction
    {
        return FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->firstOrFail();
    }
}

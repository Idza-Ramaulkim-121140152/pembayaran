<?php

namespace Tests\Feature;

use App\Models\BillingPaymentCapture;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\User;
use App\Services\PaymentMatchingService;
use App\Services\PaymentProofValidationService;
use App\Services\PaymentVerificationConfigService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutoConfirmationHistoryTest extends TestCase
{
    use RefreshDatabase;

    private User $adminUser;
    private User $financeUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminUser = User::factory()->create([
            'role' => 'superadmin',
            'email' => 'superadmin@example.com',
        ]);

        $this->financeUser = User::factory()->create([
            'name' => 'Admin Finance',
            'role' => 'finance',
            'email' => 'finance@example.com',
        ]);
    }

    public function test_auto_confirmation_applies_at_80_percent_with_finance_receiver_and_receipt_time(): void
    {
        $customer = Customer::create([
            'name' => 'Budi Santoso',
            'phone' => '081234567890',
            'pppoe_username' => 'budi_pppoe',
            'due_date' => '2026-10-15',
            'is_service_isolated' => false,
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-10-01',
            'due_date' => '2026-10-15',
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-budi-001',
        ]);

        // Capture with 85% confidence and specific receipt timestamp
        $capture = BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
            'amount' => 200000,
            'paid_date' => '2026-10-10',
            'reference_code' => 'REF-8080-TEST',
            'match_confidence' => 85,
            'fingerprint' => 'test-fp-001',
            'match_status' => 'pending',
            'meta' => [
                'analysis' => [
                    'amount' => 200000,
                    'paid_date' => '2026-10-10',
                    'paid_time' => '14:22:15',
                    'reference_code' => 'REF-8080-TEST',
                    'payment_channel' => 'QRIS',
                    'destination_identity' => ['name' => 'Rumah Kita Network'],
                    'confidence_overall' => 85,
                ],
            ],
        ]);

        $matchingService = app(PaymentMatchingService::class);
        $matchingService->runMatching($capture->id, true, $this->adminUser->id);

        $capture->refresh();
        $invoice->refresh();
        $customer->refresh();

        // Must be approved automatically
        $this->assertSame('approved', $capture->match_status);
        $this->assertTrue((bool) data_get($capture->meta, 'auto_applied'));
        $this->assertNotNull(data_get($capture->meta, 'rollback_data'));

        // Invoice checks
        $this->assertSame('paid', $invoice->status);
        $this->assertSame('2026-10-10 14:22:15', Carbon::parse($invoice->paid_at)->format('Y-m-d H:i:s'));
        $this->assertSame($this->financeUser->id, $invoice->payment_receiver_user_id);
        $this->assertTrue((bool) $invoice->include_in_mutation);
        $this->assertSame('REF-8080-TEST', $invoice->qris_transaction_number);

        // Customer due date: 2026-10-15 + 30 days = 2026-11-14
        $this->assertSame('2026-11-14', Carbon::parse($customer->due_date)->toDateString());

        // Mutation created
        $this->assertDatabaseHas('financial_transactions', [
            'reference_type' => Invoice::class,
            'reference_id' => $invoice->id,
            'type' => 'income',
            'amount' => 200000,
        ]);
    }

    public function test_auto_confirmation_isolated_customer_gets_30_days_from_payment_date(): void
    {
        $customer = Customer::create([
            'name' => 'Siti Aminah',
            'phone' => '089876543210',
            'due_date' => '2026-09-01',
            'is_service_isolated' => true,
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-09-01',
            'due_date' => '2026-09-01',
            'amount' => 150000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-siti-002',
        ]);

        $capture = BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
            'amount' => 150000,
            'paid_date' => '2026-10-12',
            'reference_code' => 'REF-ISOLIR-TEST',
            'match_confidence' => 90,
            'fingerprint' => 'test-fp-isolir',
            'match_status' => 'pending',
            'meta' => [
                'analysis' => [
                    'amount' => 150000,
                    'paid_date' => '2026-10-12',
                    'paid_time' => '10:00:00',
                    'reference_code' => 'REF-ISOLIR-TEST',
                    'payment_channel' => 'Transfer Bank',
                    'destination_identity' => ['name' => 'Rumah Kita Network'],
                    'confidence_overall' => 90,
                ],
            ],
        ]);

        $matchingService = app(PaymentMatchingService::class);
        $matchingService->runMatching($capture->id, true, $this->adminUser->id);

        $customer->refresh();
        $this->assertFalse((bool) $customer->is_service_isolated);
        // Payment date: 2026-10-12 + 30 days = 2026-11-11
        $this->assertSame('2026-11-11', Carbon::parse($customer->due_date)->toDateString());
    }

    public function test_can_cancel_auto_confirmation_and_rollback_invoice_mutation_and_due_date(): void
    {
        $customer = Customer::create([
            'name' => 'Rian Hidayat',
            'phone' => '081333444555',
            'due_date' => '2026-10-05',
            'is_service_isolated' => true,
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-10-01',
            'due_date' => '2026-10-05',
            'amount' => 250000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-rian-003',
        ]);

        $capture = BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
            'amount' => 250000,
            'paid_date' => '2026-10-08',
            'reference_code' => 'REF-ROLLBACK-001',
            'match_confidence' => 92,
            'fingerprint' => 'test-fp-rollback',
            'match_status' => 'pending',
            'meta' => [
                'analysis' => [
                    'amount' => 250000,
                    'paid_date' => '2026-10-08',
                    'paid_time' => '09:15:00',
                    'reference_code' => 'REF-ROLLBACK-001',
                    'payment_channel' => 'QRIS',
                    'confidence_overall' => 92,
                ],
            ],
        ]);

        $matchingService = app(PaymentMatchingService::class);
        $matchingService->runMatching($capture->id, true, $this->adminUser->id);

        $customer->refresh();
        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertFalse((bool) $customer->is_service_isolated);

        // Now cancel via endpoint
        $response = $this->actingAs($this->adminUser)->postJson("/api/billing/payment-verification/auto-confirmations/{$capture->id}/cancel");
        $response->assertStatus(200);

        $capture->refresh();
        $invoice->refresh();
        $customer->refresh();

        // Capture cancelled (DB enum stores rejected with meta.cancelled)
        $this->assertSame('rejected', $capture->match_status);
        $this->assertTrue((bool) ($capture->meta['cancelled'] ?? false));
        $presenter = app(\App\Services\BillingPaymentCapturePresenter::class);
        $this->assertSame('cancelled', $presenter->present($capture)['match_status']);

        // Invoice reverted to unpaid and paid_at cleared
        $this->assertSame('unpaid', $invoice->status);
        $this->assertNull($invoice->paid_at);

        // Customer due date reverted to 2026-10-05 and isolated state restored
        $this->assertSame('2026-10-05', Carbon::parse($customer->due_date)->toDateString());
        $this->assertTrue((bool) $customer->is_service_isolated);

        // Mutation removed
        $this->assertDatabaseMissing('financial_transactions', [
            'reference_type' => Invoice::class,
            'reference_id' => $invoice->id,
        ]);
    }

    public function test_duplicate_reference_code_prevents_auto_approval(): void
    {
        // Previously approved capture
        BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'amount' => 200000,
            'paid_date' => '2026-10-01',
            'reference_code' => 'REF-DUPLICATE-999',
            'match_status' => 'approved',
            'fingerprint' => 'test-fp-dup-1',
        ]);

        $customer = Customer::create([
            'name' => 'Ahmad',
            'phone' => '081299999999',
            'due_date' => '2026-10-20',
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-10-01',
            'due_date' => '2026-10-20',
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-ahmad-004',
        ]);

        $newCapture = BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
            'amount' => 200000,
            'paid_date' => '2026-10-10',
            'reference_code' => 'REF-DUPLICATE-999',
            'match_confidence' => 95,
            'fingerprint' => 'test-fp-dup-2',
            'match_status' => 'pending',
            'meta' => [
                'analysis' => [
                    'amount' => 200000,
                    'paid_date' => '2026-10-10',
                    'paid_time' => '11:00:00',
                    'reference_code' => 'REF-DUPLICATE-999',
                    'payment_channel' => 'QRIS',
                    'confidence_overall' => 95,
                ],
            ],
        ]);

        $matchingService = app(PaymentMatchingService::class);
        $matchingService->runMatching($newCapture->id, true, $this->adminUser->id);

        $newCapture->refresh();
        $invoice->refresh();

        // Must NOT be auto-approved
        $this->assertSame('needs_review', $newCapture->match_status);
        $this->assertSame('unpaid', $invoice->status);
    }
}

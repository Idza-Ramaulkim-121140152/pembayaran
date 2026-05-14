<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MobileCustomerToken;
use App\Models\PaymentMethod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class MobileCustomerBillingTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_customer_can_list_only_their_invoices(): void
    {
        $customer = Customer::create([
            'name' => 'Customer A',
            'phone' => '087111111111',
            'pppoe_username' => 'BILL-A-01',
            'is_active' => true,
        ]);

        $otherCustomer = Customer::create([
            'name' => 'Customer B',
            'phone' => '087222222222',
            'pppoe_username' => 'BILL-B-01',
            'is_active' => true,
        ]);

        Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-10',
            'amount' => 250000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-a-1',
        ]);

        Invoice::create([
            'customer_id' => $otherCustomer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-10',
            'amount' => 300000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-b-1',
        ]);

        $response = $this->getJson('/api/mobile/customer/invoices', [
            'Authorization' => 'Bearer '.$this->issueTokenForCustomer($customer),
        ]);

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($customer->id, $response->json('data.0.customer_id'));
    }

    public function test_mobile_customer_cannot_open_other_customer_invoice_detail(): void
    {
        $customer = Customer::create([
            'name' => 'Customer C',
            'phone' => '087333333333',
            'pppoe_username' => 'BILL-C-01',
            'is_active' => true,
        ]);

        $otherCustomer = Customer::create([
            'name' => 'Customer D',
            'phone' => '087444444444',
            'pppoe_username' => 'BILL-D-01',
            'is_active' => true,
        ]);

        $otherInvoice = Invoice::create([
            'customer_id' => $otherCustomer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-10',
            'amount' => 275000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-d-1',
        ]);

        $this->getJson('/api/mobile/customer/invoices/'.$otherInvoice->id, [
            'Authorization' => 'Bearer '.$this->issueTokenForCustomer($customer),
        ])->assertStatus(404);
    }

    public function test_mobile_customer_can_get_active_payment_methods(): void
    {
        $customer = Customer::create([
            'name' => 'Customer Pay',
            'phone' => '087555555555',
            'pppoe_username' => 'PAY-USER-01',
            'is_active' => true,
        ]);

        PaymentMethod::create([
            'type' => 'bank_transfer',
            'bank_name' => 'BCA',
            'account_name' => 'PT Contoh',
            'account_number' => '123456789',
            'is_active' => true,
            'is_default' => true,
            'sort_order' => 1,
        ]);

        PaymentMethod::create([
            'type' => 'bank_transfer',
            'bank_name' => 'BNI',
            'account_name' => 'PT Contoh 2',
            'account_number' => '999999999',
            'is_active' => false,
            'is_default' => false,
            'sort_order' => 2,
        ]);

        $response = $this->getJson('/api/mobile/customer/payment-methods', [
            'Authorization' => 'Bearer '.$this->issueTokenForCustomer($customer),
        ]);

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('BCA', $response->json('data.0.bank_name'));
    }

    public function test_mobile_customer_can_submit_payment_confirmation_without_proof(): void
    {
        $customer = Customer::create([
            'name' => 'Customer Confirm',
            'phone' => '087666666666',
            'pppoe_username' => 'CONFIRM-USER-01',
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-10',
            'amount' => 240000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-confirm-1',
        ]);

        $this->postJson('/api/mobile/customer/payments/confirm', [
            'invoice_id' => $invoice->id,
            'paid_amount' => 240000,
        ], [
            'Authorization' => 'Bearer '.$this->issueTokenForCustomer($customer),
        ])->assertOk()->assertJson([
            'message' => 'Konfirmasi pembayaran berhasil dikirim.',
            'data' => [
                'id' => $invoice->id,
                'status' => 'menunggu konfirmasi',
            ],
        ]);
    }

    public function test_mobile_customer_can_submit_payment_confirmation_with_proof_file(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Customer Proof',
            'phone' => '087777777777',
            'pppoe_username' => 'PROOF-USER-01',
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-10',
            'amount' => 260000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-proof-1',
        ]);

        $response = $this->post('/api/mobile/customer/payments/confirm', [
            'invoice_id' => $invoice->id,
            'paid_amount' => 260000,
            'bukti_pembayaran' => UploadedFile::fake()->image('bukti.jpg'),
        ], [
            'Authorization' => 'Bearer '.$this->issueTokenForCustomer($customer),
            'Accept' => 'application/json',
        ]);

        $response->assertOk()->assertJson([
            'data' => [
                'id' => $invoice->id,
                'status' => 'menunggu konfirmasi',
            ],
        ]);

        $invoice->refresh();
        $this->assertNotNull($invoice->bukti_pembayaran);
        Storage::disk('public')->assertExists($invoice->bukti_pembayaran);
    }

    private function issueTokenForCustomer(Customer $customer): string
    {
        $plainTextToken = Str::random(64);

        MobileCustomerToken::create([
            'customer_id' => $customer->id,
            'token_hash' => hash('sha256', $plainTextToken),
            'device_name' => 'PHPUnit',
            'expires_at' => now()->addDays(30),
        ]);

        return $plainTextToken;
    }
}

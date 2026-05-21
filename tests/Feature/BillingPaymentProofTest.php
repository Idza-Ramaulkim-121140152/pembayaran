<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BillingPaymentProofTest extends TestCase
{
    use RefreshDatabase;

    public function test_payment_proof_endpoint_returns_file_for_valid_path(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $customer = Customer::create([
            'name' => 'Proof Valid Customer',
            'phone' => '081234567890',
            'pppoe_username' => 'PROOF-VALID',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $proofPath = 'bukti_pembayaran/proof-valid.jpg';
        Storage::disk('public')->put($proofPath, 'fake-image-content');

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 250000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-proof-valid',
            'bukti_pembayaran' => $proofPath,
        ]);

        $response = $this->actingAs($user)->get('/billing/invoice/' . $invoice->id . '/payment-proof');

        $response->assertOk();
        $response->assertHeader('Content-Disposition');
        $this->assertStringContainsString('inline;', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_payment_proof_endpoint_returns_not_found_for_invalid_markers(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $customer = Customer::create([
            'name' => 'Proof Invalid Customer',
            'phone' => '081234567891',
            'pppoe_username' => 'PROOF-INVALID',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        foreach (['0', '1', 'false', 'null', ''] as $index => $marker) {
            $invoice = Invoice::create([
                'customer_id' => $customer->id,
                'invoice_date' => now()->toDateString(),
                'due_date' => now()->toDateString(),
                'amount' => 255000 + $index,
                'status' => 'menunggu konfirmasi',
                'invoice_link' => 'inv-proof-invalid-' . $index,
                'bukti_pembayaran' => $marker,
            ]);

            $this->actingAs($user)
                ->get('/billing/invoice/' . $invoice->id . '/payment-proof')
                ->assertNotFound();
        }
    }

    public function test_billing_list_exposes_payment_proof_flags_consistently(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $invalidCustomer = Customer::create([
            'name' => 'Customer Invalid Proof',
            'phone' => '081234567892',
            'pppoe_username' => 'BILL-INV-INVALID',
            'is_active' => true,
            'due_date' => now()->subDays(2)->toDateString(),
        ]);

        $validCustomer = Customer::create([
            'name' => 'Customer Valid Proof',
            'phone' => '081234567893',
            'pppoe_username' => 'BILL-INV-VALID',
            'is_active' => true,
            'due_date' => now()->subDays(1)->toDateString(),
        ]);

        $invalidInvoice = Invoice::create([
            'customer_id' => $invalidCustomer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 260000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-list-invalid',
            'bukti_pembayaran' => '0',
        ]);

        $proofPath = 'bukti_pembayaran/proof-list-valid.jpg';
        Storage::disk('public')->put($proofPath, 'fake-valid-content');

        $validInvoice = Invoice::create([
            'customer_id' => $validCustomer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 270000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-list-valid',
            'bukti_pembayaran' => $proofPath,
        ]);

        $response = $this->actingAs($user)->getJson('/api/billing?include_isolation_status=0');
        $response->assertOk();

        $items = $this->collectBillingItems($response->json('data'));

        $invalidItem = $items->first(fn (array $item) => (int) data_get($item, 'active_invoice.id') === (int) $invalidInvoice->id);
        $validItem = $items->first(fn (array $item) => (int) data_get($item, 'active_invoice.id') === (int) $validInvoice->id);

        $this->assertNotNull($invalidItem);
        $this->assertNotNull($validItem);

        $this->assertFalse((bool) data_get($invalidItem, 'active_invoice.has_payment_proof'));
        $this->assertNull(data_get($invalidItem, 'active_invoice.payment_proof_url'));
        $this->assertNull(data_get($invalidItem, 'active_invoice.bukti_pembayaran_url'));
        $this->assertNull(data_get($invalidItem, 'active_invoice.bukti_pembayaran'));

        $this->assertTrue((bool) data_get($validItem, 'active_invoice.has_payment_proof'));
        $this->assertSame('/billing/invoice/' . $validInvoice->id . '/payment-proof', data_get($validItem, 'active_invoice.payment_proof_url'));
        $this->assertSame('/billing/invoice/' . $validInvoice->id . '/payment-proof', data_get($validItem, 'active_invoice.bukti_pembayaran_url'));
        $this->assertSame($proofPath, data_get($validItem, 'active_invoice.bukti_pembayaran'));
    }

    public function test_public_invoice_confirmation_returns_json_and_sets_payment_proof_for_valid_file(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Public Upload Customer',
            'phone' => '081234567894',
            'pppoe_username' => 'PUBLIC-UPLOAD-01',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 280000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-public-upload-valid',
        ]);

        $response = $this->post('/invoice/' . $invoice->id . '/konfirmasi', [
            'paid_amount' => 280000,
            'bukti_pembayaran' => UploadedFile::fake()->image('bukti-valid.jpg'),
        ], [
            'Accept' => 'application/json',
            'X-Requested-With' => 'XMLHttpRequest',
        ]);

        $response->assertOk();
        $response->assertJsonPath('message', 'Konfirmasi pembayaran berhasil dikirim.');
        $response->assertJsonPath('data.status', 'menunggu konfirmasi');
        $response->assertJsonPath('data.has_payment_proof', true);
        $response->assertJsonPath('data.payment_proof_url', '/billing/invoice/' . $invoice->id . '/payment-proof');

        $invoice->refresh();
        $this->assertSame('menunggu konfirmasi', $invoice->status);
        $this->assertNotNull($invoice->bukti_pembayaran);
        Storage::disk('public')->assertExists((string) $invoice->bukti_pembayaran);
    }

    /**
     * @dataProvider paymentProofMimeProvider
     */
    public function test_public_invoice_confirmation_accepts_modern_image_formats(string $filename, string $mime): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Public Upload Modern Customer',
            'phone' => '081234567810',
            'pppoe_username' => 'PUBLIC-UPLOAD-06',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 285000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-public-upload-modern',
        ]);

        $response = $this->post('/invoice/' . $invoice->id . '/konfirmasi', [
            'paid_amount' => 285000,
            'bukti_pembayaran' => UploadedFile::fake()->create($filename, 50, $mime),
        ], [
            'Accept' => 'application/json',
            'X-Requested-With' => 'XMLHttpRequest',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.has_payment_proof', true);

        $invoice->refresh();
        $this->assertNotNull($invoice->bukti_pembayaran);
        Storage::disk('public')->assertExists((string) $invoice->bukti_pembayaran);
    }

    public function test_public_invoice_confirmation_returns_json_validation_error_for_invalid_proof_file(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Public Upload Invalid Customer',
            'phone' => '081234567895',
            'pppoe_username' => 'PUBLIC-UPLOAD-02',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 290000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-public-upload-invalid',
        ]);

        $response = $this->post('/invoice/' . $invoice->id . '/konfirmasi', [
            'paid_amount' => 290000,
            'bukti_pembayaran' => UploadedFile::fake()->create('bukti-invalid.txt', 10, 'text/plain'),
        ], [
            'Accept' => 'application/json',
            'X-Requested-With' => 'XMLHttpRequest',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['bukti_pembayaran']);

        $invoice->refresh();
        $this->assertSame('unpaid', $invoice->status);
        $this->assertNull($invoice->bukti_pembayaran);
    }

    public function test_public_invoice_confirmation_rejects_non_file_proof_payload_and_keeps_invoice_clean(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Public Upload Non File Customer',
            'phone' => '081234567897',
            'pppoe_username' => 'PUBLIC-UPLOAD-04',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 310000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-public-upload-non-file',
        ]);

        $response = $this->post('/invoice/' . $invoice->id . '/konfirmasi', [
            'paid_amount' => 310000,
            'bukti_pembayaran' => '0',
        ], [
            'Accept' => 'application/json',
            'X-Requested-With' => 'XMLHttpRequest',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['bukti_pembayaran']);

        $invoice->refresh();
        $this->assertSame('unpaid', $invoice->status);
        $this->assertNull($invoice->bukti_pembayaran);
    }

    public function test_public_invoice_confirmation_without_proof_remains_optional_and_returns_false_metadata(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Public Upload Optional Customer',
            'phone' => '081234567898',
            'pppoe_username' => 'PUBLIC-UPLOAD-05',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 320000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-public-upload-optional',
        ]);

        $response = $this->post('/invoice/' . $invoice->id . '/konfirmasi', [
            'paid_amount' => 320000,
        ], [
            'Accept' => 'application/json',
            'X-Requested-With' => 'XMLHttpRequest',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'menunggu konfirmasi');
        $response->assertJsonPath('data.has_payment_proof', false);
        $response->assertJsonPath('data.payment_proof_url', null);
        $response->assertJsonPath('data.bukti_pembayaran_url', null);
        $response->assertJsonPath('data.bukti_pembayaran', null);

        $invoice->refresh();
        $this->assertSame('menunggu konfirmasi', $invoice->status);
        $this->assertNull($invoice->bukti_pembayaran);
    }

    public function test_public_invoice_confirmation_returns_json_for_ajax_request_without_accept_header(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Public Upload Ajax Customer',
            'phone' => '081234567896',
            'pppoe_username' => 'PUBLIC-UPLOAD-03',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 300000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-public-upload-ajax',
        ]);

        $response = $this->post('/invoice/' . $invoice->id . '/konfirmasi', [
            'paid_amount' => 300000,
            'bukti_pembayaran' => UploadedFile::fake()->image('bukti-ajax.jpg'),
        ], [
            'X-Requested-With' => 'XMLHttpRequest',
        ]);

        $response->assertOk();
        $response->assertHeader('content-type');
        $this->assertStringContainsString('application/json', strtolower((string) $response->headers->get('content-type')));
        $response->assertJsonPath('data.status', 'menunggu konfirmasi');
        $response->assertJsonPath('data.has_payment_proof', true);
    }

    public function test_invoice_model_normalizes_invalid_bukti_pembayaran_markers_on_write(): void
    {
        $customer = Customer::create([
            'name' => 'Invoice Normalize Customer',
            'phone' => '081234567811',
            'pppoe_username' => 'INV-NORMALIZE-01',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 330000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-normalize-01',
            'bukti_pembayaran' => '0',
        ]);

        $invoice->refresh();
        $this->assertNull($invoice->bukti_pembayaran);

        $invoice->bukti_pembayaran = 'bukti_pembayaran/proof-normalize.jpg';
        $invoice->save();

        $invoice->refresh();
        $this->assertSame('bukti_pembayaran/proof-normalize.jpg', $invoice->bukti_pembayaran);
    }

    public static function paymentProofMimeProvider(): array
    {
        return [
            ['bukti.webp', 'image/webp'],
            ['bukti.heic', 'image/heic'],
            ['bukti.heif', 'image/heif'],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return Collection<int, array<string, mixed>>
     */
    private function collectBillingItems(array $payload): Collection
    {
        return collect($payload['late'] ?? [])
            ->concat(collect($payload['almostLate'] ?? []))
            ->concat(collect($payload['others'] ?? []))
            ->concat(collect($payload['paid'] ?? []))
            ->values();
    }
}

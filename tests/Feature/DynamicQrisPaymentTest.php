<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\QrisWebhookLog;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\DynamicQrisService;
use App\Services\FinancialLedgerService;
use App\Services\MikroTikService;
use App\Services\QrisWebhookService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DynamicQrisPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Mock external services to prevent network calls during testing
        $mockMikrotik = \Mockery::mock(MikroTikService::class);
        $mockMikrotik->shouldReceive('connect')->byDefault();
        $mockMikrotik->shouldReceive('unrestrictUser')->byDefault()->andReturn(true);
        $this->app->instance(MikroTikService::class, $mockMikrotik);

        $mockLedger = \Mockery::mock(FinancialLedgerService::class);
        $mockLedger->shouldReceive('syncInvoicePayment')->byDefault()->andReturn(null);
        $this->app->instance(FinancialLedgerService::class, $mockLedger);

        Http::fake([
            '*/send-bulk' => Http::response(['success' => true, 'sent' => 1], 200),
            '*/send' => Http::response(['success' => true], 200),
        ]);
    }

    public function test_crc16_calculation_and_dynamic_qris_conversion(): void
    {
        $service = app(DynamicQrisService::class);

        // Pastikan static default mengembalikan checksum resmi GoPay AD83
        $static = DynamicQrisService::DEFAULT_GOPAY_QRIS;
        $this->assertStringEndsWith('AD83', $static);

        // Uji konversi ke nominal Rp 150.124
        $dynamic = $service->convertStaticToDynamic($static, 150124);

        // Harus mengandung Tag 010212 (dinamis, bukan 010211)
        $this->assertStringContainsString('010212', $dynamic);
        // Harus mengandung Tag 54 dengan nominal 150124 (5406150124)
        $this->assertStringContainsString('5406150124', $dynamic);
        // Panjang CRC selalu 4 karakter hex di akhir string setelah 6304
        $this->assertMatchesRegularExpression('/6304[0-9A-F]{4}$/', $dynamic);

        // Uji rendering SVG Data URI
        $dataUri = $service->renderQrDataUri($dynamic);
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $dataUri);
    }

    public function test_dynamic_qris_generation_for_invoice_with_unique_code(): void
    {
        $package = Package::create([
            'name' => '10 Mbps Family',
            'price' => 150000,
            'speed' => '10M',
        ]);

        $customer = Customer::create([
            'name' => 'Budi Susanto',
            'phone' => '081234567890',
            'package_id' => $package->id,
            'status' => 'active',
            'due_date' => now()->addDays(2),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-TEST-001',
            'amount' => 150000,
            'status' => 'unpaid',
            'invoice_date' => now(),
            'due_date' => now()->addDays(2),
        ]);

        $service = app(DynamicQrisService::class);
        $result = $service->generateForInvoice($invoice);

        $this->assertArrayHasKey('expected_amount', $result);
        $this->assertArrayHasKey('unique_code', $result);
        $this->assertArrayHasKey('qr_data_uri', $result);

        // Expected amount harus 150.000 + unique_code (101 - 499)
        $this->assertGreaterThanOrEqual(150101, $result['expected_amount']);
        $this->assertLessThanOrEqual(150499, $result['expected_amount']);

        // Pastikan tersimpan ke database invoice
        $freshInvoice = $invoice->fresh();
        $this->assertEquals($result['expected_amount'], (int) $freshInvoice->qris_expected_amount);
        $this->assertNotNull($freshInvoice->qris_dynamic_payload);
        $this->assertNotNull($freshInvoice->qris_expired_at);
    }

    public function test_webhook_rejects_unauthorized_requests(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'my-super-secret-token');

        $response = $this->postJson('/api/qris/webhook', [
            'text' => 'Pembayaran QRIS sebesar Rp 150.124 telah berhasil diterima',
        ], [
            'X-QRIS-SECRET' => 'wrong-secret',
        ]);

        $response->assertStatus(401);
        $response->assertJson([
            'status' => 'unauthorized',
        ]);
    }

    public function test_webhook_successfully_settles_invoice_and_unisolate_customer(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        $package = Package::create([
            'name' => 'Home Wifi 20M',
            'price' => 200000,
            'speed' => '20M',
        ]);

        $customer = Customer::create([
            'name' => 'Ahmad Dahlan',
            'phone' => '085158025553',
            'package_id' => $package->id,
            'status' => 'active',
            'is_service_isolated' => true,
            'service_isolated_at' => now()->subDays(1),
            'pppoe_username' => 'ahmad_dahlan',
            'due_date' => now()->subDays(1),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-TEST-002',
            'amount' => 200000,
            'qris_unique_code' => 245,
            'qris_expected_amount' => 200245,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDays(5),
            'due_date' => now()->subDays(1),
        ]);

        $gobizPushText = "Pembayaran QRIS sebesar Rp 200.245 telah berhasil diterima dari AHMAD DAHLAN. Ref: GOPAY998877";

        $response = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi Berhasil',
            'text' => $gobizPushText,
            'device_name' => 'Android-Admin-1',
        ], [
            'X-QRIS-SECRET' => 'valid-secret',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'status' => 'settled',
            'invoice_id' => $invoice->id,
            'amount' => 200245,
        ]);

        // Verifikasi Invoice berstatus paid
        $freshInvoice = $invoice->fresh();
        $this->assertEquals('paid', $freshInvoice->status);
        $this->assertNotNull($freshInvoice->paid_at);
        $this->assertNotNull($freshInvoice->qris_payment_time);
        $this->assertStringContainsStringIgnoringCase('AHMAD DAHLAN', (string) $freshInvoice->qris_sender);

        // Verifikasi Pelanggan sudah dicabut isolirnya & perpanjang 30 hari
        $freshCustomer = $customer->fresh();
        $this->assertFalse((bool) $freshCustomer->is_service_isolated);
        $this->assertNull($freshCustomer->service_isolated_at);
        $this->assertGreaterThan(now()->addDays(20)->toDateString(), (string) $freshCustomer->due_date);

        // Verifikasi Log tercatat
        $this->assertDatabaseHas('qris_webhook_logs', [
            'invoice_id' => $invoice->id,
            'status' => 'settled',
            'device_name' => 'Android-Admin-1',
            'extracted_amount' => 200245,
        ]);
    }

    public function test_multi_device_deduplication_ignores_duplicate_webhook_safely(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        $customer = Customer::create([
            'name' => 'Citra Lestari',
            'phone' => '081299998888',
            'status' => 'active',
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-TEST-003',
            'amount' => 150000,
            'qris_unique_code' => 112,
            'qris_expected_amount' => 150112,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now(),
            'due_date' => now()->addDays(5),
        ]);

        $pushText = "Pembayaran QRIS sebesar Rp 150.112 berhasil diterima";

        // HP Android #1 mengirim webhook
        $resp1 = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz',
            'text' => $pushText,
            'device_name' => 'HP-Samsung-Toko',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $resp1->assertStatus(200);
        $this->assertEquals('settled', $resp1->json('status'));

        // HP Android #2 mengirim webhook yang sama 1 detik kemudian
        $resp2 = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz',
            'text' => $pushText,
            'device_name' => 'HP-Xiaomi-Admin2',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        // HP #2 harus tetap HTTP 200 (supaya MacroDroid tidak retry loop) dengan status duplicate_ignored
        $resp2->assertStatus(200);
        $this->assertEquals('duplicate_ignored', $resp2->json('status'));

        // Pastikan invoice tidak double-settled
        $this->assertDatabaseCount('qris_webhook_logs', 2);
        $this->assertDatabaseHas('qris_webhook_logs', [
            'device_name' => 'HP-Xiaomi-Admin2',
            'status' => 'duplicate_ignored',
        ]);
    }

    public function test_webhook_handles_unmatched_nominal(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        $response = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz',
            'text' => 'Pembayaran QRIS sebesar Rp 999.888 berhasil diterima',
            'device_name' => 'HP-Android-1',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $response->assertStatus(404);
        $response->assertJson([
            'status' => 'unmatched',
        ]);

        $this->assertDatabaseHas('qris_webhook_logs', [
            'status' => 'unmatched',
            'extracted_amount' => 999888,
        ]);
    }

    public function test_public_dynamic_qris_and_status_check_endpoints(): void
    {
        $customer = Customer::create([
            'name' => 'Doni Darmawan',
            'phone' => '081255556666',
            'status' => 'active',
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-PUBLIC-001',
            'amount' => 175000,
            'status' => 'unpaid',
            'invoice_date' => now(),
            'due_date' => now()->addDays(3),
        ]);

        // 1. Fetch dynamic QR data
        $resQr = $this->getJson("/api/invoice/{$invoice->invoice_link}/dynamic-qris");
        $resQr->assertStatus(200);
        $resQr->assertJsonStructure([
            'status',
            'is_paid',
            'data' => [
                'expected_amount',
                'unique_code',
                'qr_data_uri',
                'payload',
            ],
        ]);

        // 2. Poll check status (sebelum bayar)
        $resStatus1 = $this->getJson("/api/invoice/{$invoice->invoice_link}/check-status");
        $resStatus1->assertStatus(200);
        $this->assertFalse($resStatus1->json('is_paid'));

        // 3. Simulasikan lunas
        $invoice->update(['status' => 'paid', 'paid_at' => now()]);

        // 4. Poll check status (setelah lunas)
        $resStatus2 = $this->getJson("/api/invoice/{$invoice->invoice_link}/check-status");
        $resStatus2->assertStatus(200);
        $this->assertTrue($resStatus2->json('is_paid'));
    }
}

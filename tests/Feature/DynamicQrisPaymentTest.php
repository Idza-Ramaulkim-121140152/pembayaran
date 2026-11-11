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

        // Uji konsistensi kode unik: pemanggilan ulang berkali-kali harus BAKU & tidak pernah berubah
        $resultSecond = $service->generateForInvoice($freshInvoice);
        $this->assertEquals($result['unique_code'], $resultSecond['unique_code'], 'Kode unik harus baku dan tidak boleh berubah');
        $this->assertEquals($result['expected_amount'], $resultSecond['expected_amount']);
        $this->assertEquals($result['payload'], $resultSecond['payload']);

        // Uji pemanggilan via HTTP API publik
        $apiRes1 = $this->getJson("/api/invoice/{$invoice->invoice_link}/dynamic-qris");
        $apiRes2 = $this->getJson("/api/invoice/{$invoice->invoice_link}/dynamic-qris");
        $this->assertEquals($result['unique_code'], $apiRes1->json('data.unique_code'));
        $this->assertEquals($result['unique_code'], $apiRes2->json('data.unique_code'));
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

    public function test_webhook_unisolates_customer_even_when_profile_is_isolir_or_stored_in_restore_profile(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        $package = Package::create([
            'name' => 'Home 20 Mbps',
            'price' => 250000,
            'speed' => '20M',
            'mikrotik_profile' => 'PAKET-20M',
        ]);

        // Pelanggan dengan mikrotik_profile 'isolir' dan isolation_restore_profile 'PAKET-20M'
        $customer = Customer::create([
            'name' => 'Bambang Sudarsono',
            'phone' => '085112345678',
            'package_id' => $package->id,
            'package_type' => 'Home 20 Mbps',
            'status' => 'active',
            'is_service_isolated' => true,
            'service_isolated_at' => now()->subDays(3),
            'isolation_restore_profile' => 'PAKET-20M',
            'mikrotik_profile' => 'isolir',
            'pppoe_username' => 'bambang_s',
            'due_date' => now()->subDays(3),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-TEST-ISOLIR-001',
            'amount' => 250000,
            'qris_unique_code' => 310,
            'qris_expected_amount' => 250310,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDays(5),
            'due_date' => now()->subDays(3),
        ]);

        $capturedUnrestrictProfile = null;
        $mockMikrotik = \Mockery::mock(MikroTikService::class);
        $mockMikrotik->shouldReceive('connect')->byDefault();
        $mockMikrotik->shouldReceive('command')->with('/ppp/profile/print', [], false)->andReturn([
            ['name' => 'default'],
            ['name' => 'isolir'],
            ['name' => 'PAKET-20M'],
        ]);
        $mockMikrotik->shouldReceive('getPPPoESecret')->with('bambang_s', true)->andReturn([
            'id' => '*1A',
            'name' => 'bambang_s',
            'profile' => 'isolir',
        ]);
        $mockMikrotik->shouldReceive('unrestrictUser')->with('bambang_s', \Mockery::on(function ($prof) use (&$capturedUnrestrictProfile) {
            $capturedUnrestrictProfile = $prof;
            return strtolower($prof) !== 'isolir';
        }))->once()->andReturn([
            'success' => true,
            'username' => 'bambang_s',
            'profile' => 'PAKET-20M',
        ]);
        $mockMikrotik->shouldReceive('clearMikrotikCache')->byDefault();
        $mockMikrotik->shouldReceive('disconnect')->byDefault();
        $this->app->instance(MikroTikService::class, $mockMikrotik);

        $pushText = "Pembayaran QRIS sebesar Rp 250.310 berhasil diterima dari BAMBANG. Ref: GOPAY112233";

        $response = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi Masuk',
            'text' => $pushText,
            'device_name' => 'Android-Admin',
        ], [
            'X-QRIS-SECRET' => 'valid-secret',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'status' => 'settled',
            'invoice_id' => $invoice->id,
        ]);

        // Verifikasi unrestrict dipanggil dengan profil asli, BUKAN 'isolir'
        $this->assertEquals('PAKET-20M', $capturedUnrestrictProfile);

        // Verifikasi status customer di DB sudah dicabut isolirnya
        $freshCustomer = $customer->fresh();
        $this->assertFalse((bool) $freshCustomer->is_service_isolated);
        $this->assertNull($freshCustomer->service_isolated_at);
        $this->assertNull($freshCustomer->isolation_restore_profile);
        $this->assertEquals('PAKET-20M', $freshCustomer->mikrotik_profile);
        $this->assertGreaterThan(now()->addDays(20)->toDateString(), (string) $freshCustomer->due_date);
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

    public function test_public_isolir_check_endpoint_handles_unknown_ip_safely(): void
    {
        // Panggil endpoint /api/public/isolir/check dengan IP yang tidak dikenal (misal IP publik / admin)
        $response = $this->withServerVariables(['REMOTE_ADDR' => '41.216.186.255'])
            ->getJson('/api/public/isolir/check');

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'matched' => false,
            'client_ip' => '41.216.186.255',
        ]);
        $this->assertStringContainsString('41.216.186.255', $response->json('message'));
    }

    public function test_public_isolir_check_endpoint_with_search_returns_invoice_and_qris(): void
    {
        $customer = Customer::create([
            'name' => 'Faisal Basri',
            'phone' => '081399887766',
            'pppoe_username' => 'faisal_basri',
            'status' => 'active',
            'is_service_isolated' => true,
            'due_date' => now()->subDays(2),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-ISOLIR-CHECK-001',
            'invoice_number' => 'INV/2026/11/001',
            'amount' => 200000,
            'status' => 'overdue',
            'invoice_date' => now()->subDays(10),
            'due_date' => now()->subDays(2),
        ]);

        // Cari via parameter ?search=faisal_basri
        $response = $this->getJson('/api/public/isolir/check?search=faisal_basri');

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'matched' => true,
            'match_method' => 'manual_search',
            'customer' => [
                'name' => 'Faisal Basri',
                'pppoe_username' => 'faisal_basri',
            ],
            'invoice' => [
                'id' => $invoice->id,
                'amount' => 200000,
            ],
        ]);
    }

    public function test_webhook_holds_excluded_admin_qris_payment_for_manual_review_instead_of_auto_settling(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');
        $admin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $customer = Customer::create([
            'name' => 'Pelanggan Target Salah',
            'phone' => '081211112222',
            'status' => 'active',
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-ADMIN-QR-001',
            'amount' => 175000,
            'qris_unique_code' => 245,
            'qris_expected_amount' => 175245,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(3),
        ]);

        // Admin dikecualikan (M ABDUL ROHMAN / Adul) membayar QR ke GoPay Merchant
        $response = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi Masuk',
            'text' => 'Pembayaran QRIS sebesar Rp 175.245 berhasil diterima dari M. ABDUL ROHMAN. Ref: GOPAY-ADUL-001',
            'device_name' => 'HP-Kasir-Utama',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'status' => 'manual_review_required',
            'reason' => 'excluded_admin_payer',
        ]);

        // Invoice HARUS tetap unpaid — TIDAK boleh terkonfirmasi otomatis!
        $freshInvoice = $invoice->fresh();
        $this->assertSame('unpaid', $freshInvoice->status);
        $this->assertNull($freshInvoice->paid_at);

        // Capture & Log manual review tersimpan di Payment Verification
        $captureId = $response->json('capture_id');
        $capture = \App\Models\BillingPaymentCapture::query()->findOrFail($captureId);
        $this->assertSame('qris_webhook', $capture->source);
        $this->assertSame('needs_review', $capture->match_status);
        $this->assertSame('excluded_admin_payer', data_get($capture->meta, 'validation.failure_reason'));
        $this->assertFalse((bool) data_get($capture->meta, 'validation.flags.non_admin_payer'));

        $this->assertDatabaseHas('qris_webhook_logs', [
            'status' => 'manual_review_required',
            'extracted_amount' => 175245,
        ]);

        // Admin tetap bisa melakukan konfirmasi manual lewat endpoint resolve
        $this->actingAs($admin)->postJson("/api/billing/payments/{$capture->id}/resolve", [
            'decision' => 'approve',
            'invoice_id' => $invoice->id,
        ])->assertOk();

        $this->assertSame('paid', $invoice->fresh()->status);
    }

    public function test_webhook_holds_internal_staff_payer_for_manual_review(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        User::factory()->create([
            'name' => 'Rudi Teknisi',
            'role' => User::ROLE_TEKNISI,
            'phone' => '081277778888',
        ]);

        $customer = Customer::create([
            'name' => 'Siti Aminah',
            'phone' => '081255551234',
            'status' => 'active',
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-STAFF-QR-001',
            'amount' => 150000,
            'qris_unique_code' => 111,
            'qris_expected_amount' => 150111,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(2),
        ]);

        $response = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi Masuk',
            'text' => 'Pembayaran QRIS sebesar Rp 150.111 berhasil diterima dari RUDI TEKNISI. Ref: GOPAY-STAFF-001',
            'device_name' => 'HP-Kasir-Utama',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'status' => 'manual_review_required',
            'reason' => 'admin_payer_needs_manual_review',
        ]);

        $this->assertSame('unpaid', $invoice->fresh()->status);
    }

    public function test_webhook_holds_ambiguous_or_unverified_base_amount_without_auto_settling_random_customer(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        $customerA = Customer::create([
            'name' => 'Pelanggan Satu',
            'phone' => '081200000001',
            'status' => 'active',
        ]);
        $customerB = Customer::create([
            'name' => 'Pelanggan Dua',
            'phone' => '081200000002',
            'status' => 'active',
        ]);

        $invA = Invoice::create([
            'customer_id' => $customerA->id,
            'invoice_link' => 'INV-BASE-A',
            'amount' => 175000,
            'status' => 'unpaid',
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(3),
        ]);
        $invB = Invoice::create([
            'customer_id' => $customerB->id,
            'invoice_link' => 'INV-BASE-B',
            'amount' => 175000,
            'status' => 'unpaid',
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(3),
        ]);

        // Skenario A: Beberapa pelanggan punya tagihan Rp 175.000
        $resMulti = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz',
            'text' => 'Pembayaran QRIS sebesar Rp 175.000 berhasil diterima. Ref: BASE-MULTI-01',
            'device_name' => 'HP-Kasir',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $resMulti->assertStatus(200)->assertJson([
            'status' => 'manual_review_required',
            'reason' => 'ambiguous_base_amount',
        ]);
        $this->assertSame('unpaid', $invA->fresh()->status);
        $this->assertSame('unpaid', $invB->fresh()->status);
        $this->assertSame(
            2,
            \App\Models\BillingPaymentMatchReview::query()->where('capture_id', $resMulti->json('capture_id'))->count()
        );

        // Skenario B: Hanya 1 tagihan Rp 175.000 yang tersisa, tapi notifikasi tidak mencantumkan nama pengirim / kode unik
        $invB->update(['status' => 'paid', 'paid_at' => now()]);

        $resAnon = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz',
            'text' => 'Pembayaran QRIS sebesar Rp 175.000 berhasil diterima. Ref: BASE-ANON-02',
            'device_name' => 'HP-Kasir',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $resAnon->assertStatus(200)->assertJson([
            'status' => 'manual_review_required',
            'reason' => 'unverified_static_qris_base_amount',
        ]);
        $this->assertSame('unpaid', $invA->fresh()->status);
    }

    public function test_webhook_parses_manipulated_notification_without_crashing_or_settling(): void
    {
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        $customer = Customer::create([
            'name' => 'Pelanggan Manipulasi',
            'phone' => '081344445555',
            'status' => 'active',
        ]);
        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-MANIP-001',
            'amount' => 200000,
            'qris_unique_code' => 123,
            'qris_expected_amount' => 200123,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(3),
        ]);

        // 1. Teks tanpa prefix Rp/IDR (sebelumnya crash Undefined variable $amount di Priority 2/3)
        $webhookService = app(QrisWebhookService::class);
        $parsedPriority3 = $webhookService->parseNotificationText('masuk 175.000 dari Adul');
        $this->assertSame(175000, $parsedPriority3['amount']);
        $this->assertSame('Adul', $parsedPriority3['sender']);

        // 2. Teks dimanipulasi dengan lebih dari satu nominal berbeda
        $resMultiAmt = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi',
            'text' => 'Pembayaran Rp 175.000 diubah menjadi Rp 200.123 berhasil diterima dari BUDI. Ref: MANIP-01',
            'device_name' => 'HP-Manip',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $resMultiAmt->assertStatus(200)->assertJson([
            'status' => 'manual_review_required',
            'reason' => 'manipulated_or_ambiguous_notification',
        ]);
        $this->assertSame('unpaid', $invoice->fresh()->status);

        // 3. Notifikasi pencairan / refund / gagal diabaikan aman dan tidak melunaskan tagihan
        $resNonPayment = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Pencairan Dana',
            'text' => 'Pencairan otomatis sebesar Rp 200.123 sedang diproses ke rekening bank Anda.',
            'device_name' => 'HP-Kasir',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $resNonPayment->assertStatus(200)->assertJson([
            'status' => 'ignored_non_payment',
        ]);
        $this->assertSame('unpaid', $invoice->fresh()->status);
    }
}

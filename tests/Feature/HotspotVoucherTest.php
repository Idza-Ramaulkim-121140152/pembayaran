<?php

namespace Tests\Feature;

use App\Models\FinancialTransaction;
use App\Models\HotspotVoucherOrder;
use App\Models\HotspotVoucherPackage;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\MikroTikService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Mockery;
use Tests\TestCase;

class HotspotVoucherTest extends TestCase
{
    use RefreshDatabase;

    private const SAMPLE_STATIC_QRIS = '00020101021126610014COM.GO-JEK.WWW01189360091438488266790210G8488266790303UMI51440014ID.CO.QRIS.WWW0215ID10243391315580303UMI5204481453033605802ID5925Rumah Kita Net , KALIANDA6015LAMPUNG SELATAN61053555162070703A016304AD83';

    protected function setUp(): void
    {
        parent::setUp();

        SiteSetting::updateOrCreate(['key' => 'qris_static_payload'], ['value' => self::SAMPLE_STATIC_QRIS]);
        SiteSetting::updateOrCreate(['key' => 'qris_webhook_secret'], ['value' => 'test-secret-hotspot']);
        SiteSetting::updateOrCreate(['key' => 'qris_unique_code_min'], ['value' => '101']);
        SiteSetting::updateOrCreate(['key' => 'qris_unique_code_max'], ['value' => '499']);
        SiteSetting::updateOrCreate(['key' => 'qris_expiry_hours'], ['value' => '3']);

        Http::fake([
            '*' => Http::response(['success' => true, 'message' => 'sent'], 200),
        ]);
    }

    public function test_admin_can_create_package_and_sync_mikrotik_profile(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('syncHotspotUserProfile')
            ->once()
            ->withArgs(function ($profileName, $maxDevices, $rateLimit, $durationMinutes) {
                return str_starts_with($profileName, 'vc-')
                    && $maxDevices === 2
                    && $rateLimit === '3M/3M'
                    && $durationMinutes === 1440;
            })
            ->andReturn(['success' => true, 'profile' => 'vc-voucher-1-hari']);
        $this->app->instance(MikroTikService::class, $mikrotik);

        $response = $this->actingAs($admin)->postJson('/api/admin/hotspot/packages', [
            'name' => 'Voucher 1 Hari',
            'price' => 5000,
            'duration_value' => 1,
            'duration_unit' => 'days',
            'max_devices' => 2,
            'rate_limit' => '3M/3M',
            'is_active' => true,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('package.name', 'Voucher 1 Hari')
            ->assertJsonPath('package.duration_minutes', 1440)
            ->assertJsonPath('package.max_devices', 2)
            ->assertJsonPath('mikrotik_sync.success', true);

        $this->assertDatabaseHas('hotspot_voucher_packages', [
            'name' => 'Voucher 1 Hari',
            'duration_minutes' => 1440,
            'max_devices' => 2,
            'rate_limit' => '3M/3M',
        ]);
    }

    public function test_public_self_service_order_and_qris_webhook_settlement_flow(): void
    {
        $package = HotspotVoucherPackage::create([
            'name' => 'Voucher 6 Jam',
            'code' => 'voucher-6-jam',
            'mikrotik_profile_name' => 'vc-voucher-6-jam',
            'hotspot_server' => 'hotspot1',
            'price' => 3000,
            'duration_minutes' => 360,
            'max_devices' => 1,
            'rate_limit' => null,
            'is_active' => true,
        ]);

        // 1. Public packages list
        $this->getJson('/api/hotspot/packages')
            ->assertOk()
            ->assertJsonPath('packages.0.name', 'Voucher 6 Jam')
            ->assertJsonPath('qris_ready', true);

        // 2. Public creates self-service order
        $orderRes = $this->postJson('/api/hotspot/orders', [
            'package_id' => $package->id,
            'customer_phone' => '081234567890',
            'customer_name' => 'Budi Hotspot',
            'login_url' => 'http://rumahkita.id/login',
        ]);

        $orderRes->assertStatus(201)
            ->assertJsonPath('order.status', 'pending')
            ->assertJsonPath('order.is_paid', false)
            ->assertJsonPath('order.voucher_code', null);

        $orderCode = $orderRes->json('order.order_code');
        $expectedAmount = (int) round((float) $orderRes->json('order.expected_amount'));
        $uniqueCode = (int) $orderRes->json('order.unique_code');

        $this->assertGreaterThanOrEqual(101, $uniqueCode);
        $this->assertSame(3000 + $uniqueCode, $expectedAmount);
        $this->assertStringStartsWith('data:image/svg+xml;base64,', (string) $orderRes->json('order.qr_data_uri'));

        // 3. Mock MikroTik user creation during QRIS webhook settlement
        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('syncHotspotUserProfile')->once()->andReturn(['success' => true]);
        $mikrotik->shouldReceive('createHotspotUser')
            ->once()
            ->withArgs(function ($voucherCode, $profile, $durationMinutes, $server, $comment) {
                return strlen($voucherCode) === 6
                    && $profile === 'vc-voucher-6-jam'
                    && $durationMinutes === 360
                    && $server === 'hotspot1'
                    && str_contains((string) $comment, 'Order ');
            })
            ->andReturn(['success' => true]);
        $this->app->instance(MikroTikService::class, $mikrotik);

        // 4. MacroDroid QRIS webhook fires with exact expected amount
        $formattedAmount = number_format($expectedAmount, 0, ',', '.');
        $webhookRes = $this->withHeaders([
            'X-QRIS-SECRET' => 'test-secret-hotspot',
        ])->postJson('/api/qris/webhook', [
            'device_name' => 'HP-Kasir-1',
            'title' => 'Pembayaran QRIS diterima',
            'text' => "Pembayaran QRIS sebesar Rp {$formattedAmount} telah berhasil diterima di Rumah Kita Net.",
        ]);

        $webhookRes->assertOk()
            ->assertJsonPath('status', 'settled')
            ->assertJsonPath('type', 'hotspot_voucher')
            ->assertJsonPath('order_code', $orderCode);

        $voucherCode = $webhookRes->json('voucher_code');
        $this->assertNotEmpty($voucherCode);
        $this->assertSame(6, strlen($voucherCode));

        // 5. Public status polling now reveals voucher code & paid status
        $this->getJson("/api/hotspot/orders/{$orderCode}/status")
            ->assertOk()
            ->assertJsonPath('order.status', 'paid')
            ->assertJsonPath('order.is_paid', true)
            ->assertJsonPath('order.voucher_code', $voucherCode)
            ->assertJsonPath('order.mikrotik_synced', true)
            ->assertJsonPath('order.whatsapp_sent', true);

        // 6. Ledger income recorded for Mutasi & Daily QRIS Reconciliation
        $ledger = FinancialTransaction::where('source', 'hotspot_voucher')->first();
        $this->assertNotNull($ledger);
        $this->assertEquals(3000.0, (float) $ledger->amount);
        $this->assertEquals((float) $expectedAmount, (float) data_get($ledger->meta, 'qris_settled_amount'));
        $this->assertEquals('QRIS Voucher Hotspot', data_get($ledger->meta, 'received_via_name'));

        // 7. Duplicate webhook from second phone is safely ignored
        $dupRes = $this->withHeaders([
            'X-QRIS-SECRET' => 'test-secret-hotspot',
        ])->postJson('/api/qris/webhook', [
            'device_name' => 'HP-Kasir-2',
            'title' => 'Pembayaran QRIS diterima',
            'text' => "Pembayaran QRIS sebesar Rp {$formattedAmount} telah berhasil diterima di Rumah Kita Net.",
        ]);

        $dupRes->assertOk()
            ->assertJsonPath('status', 'duplicate_ignored')
            ->assertJsonPath('type', 'hotspot_voucher');
    }

    public function test_admin_can_manual_confirm_generate_voucher_and_fetch_mikrotik_template(): void
    {
        $admin = User::factory()->create(['role' => 'superadmin']);
        $package = HotspotVoucherPackage::create([
            'name' => 'Voucher 3 Jam',
            'code' => 'voucher-3-jam',
            'mikrotik_profile_name' => 'vc-voucher-3-jam',
            'hotspot_server' => 'hotspot1',
            'price' => 2000,
            'duration_minutes' => 180,
            'max_devices' => 1,
            'is_active' => true,
        ]);

        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('syncHotspotUserProfile')->andReturn(['success' => true]);
        $mikrotik->shouldReceive('createHotspotUser')->andReturn(['success' => true]);
        $this->app->instance(MikroTikService::class, $mikrotik);

        // Manual voucher generation
        $genRes = $this->actingAs($admin)->postJson('/api/admin/hotspot/orders/manual-generate', [
            'package_id' => $package->id,
            'customer_phone' => '081299998888',
            'customer_name' => 'Walk-in Buyer',
            'send_whatsapp' => true,
        ]);

        $genRes->assertStatus(201);
        $this->assertSame(1, HotspotVoucherOrder::where('status', 'paid')->count());

        // Dashboard summary
        $this->actingAs($admin)->getJson('/api/admin/hotspot/dashboard')
            ->assertOk()
            ->assertJsonPath('summary.total_sold', 1)
            ->assertJsonPath('summary.total_revenue', 2000);

        // MikroTik HTML template & Walled Garden CLI
        $tplRes = $this->actingAs($admin)->getJson('/api/admin/hotspot/mikrotik-template');
        $tplRes->assertOk()
            ->assertJsonCount(5, 'files');
        $this->assertStringContainsString('/ip hotspot walled-garden', (string) $tplRes->json('walled_garden_cli'));

        // Refreshing SPA routes via catch-all must return 200 (never 500)
        $this->actingAs($admin)->get('/hotspot-vouchers')->assertOk();
        $this->actingAs($admin)->get('/monitoring')->assertOk();
    }

    public function test_admin_can_toggle_hotspot_locations_and_public_api_hides_customer_name(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = \App\Models\Customer::create([
            'name' => 'Rahasia Nama Pelanggan',
            'phone' => '081234500001',
            'pppoe_username' => 'rahasia01',
            'latitude' => -5.73612000,
            'longitude' => 105.59521000,
            'is_active' => true,
        ]);

        // Admin enables this customer coordinate as a Hotspot WiFi point
        $this->actingAs($admin)->postJson('/api/admin/hotspot/locations/toggle', [
            'customer_id' => $customer->id,
            'enabled' => true,
            'label' => 'Area Simpang Pasar',
        ])->assertOk()->assertJsonPath('enabled', true);

        // Public API returns the point WITHOUT exposing customer name/id/phone
        $publicRes = $this->getJson('/api/hotspot/locations')->assertOk();
        $publicRes->assertJsonCount(1, 'locations')
            ->assertJsonPath('locations.0.label', 'Area Simpang Pasar');

        $payload = json_encode($publicRes->json());
        $this->assertStringNotContainsString('Rahasia Nama Pelanggan', (string) $payload);
        $this->assertStringNotContainsString('081234500001', (string) $payload);
        $this->assertArrayNotHasKey('customer_id', $publicRes->json('locations.0'));
        $this->assertArrayNotHasKey('customer_name', $publicRes->json('locations.0'));
    }
}

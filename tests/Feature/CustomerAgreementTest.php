<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAgreement;
use App\Models\User;
use App\Services\CustomerAgreementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CustomerAgreementTest extends TestCase
{
    use RefreshDatabase;

    public function test_superadmin_can_generate_customer_agreement_pdf(): void
    {
        Storage::fake('public');
        Http::fake([
            'https://drive.google.com/thumbnail?id=front*&sz=w1200' => Http::response($this->tinyPng(), 200, ['Content-Type' => 'image/png']),
            'https://drive.google.com/thumbnail?id=modem*&sz=w1200' => Http::response($this->tinyPng(), 200, ['Content-Type' => 'image/png']),
            'https://example.test/ktp.jpg' => Http::response($this->tinyPng(), 200, ['Content-Type' => 'image/jpeg']),
            '*' => Http::response('blocked', 403, ['Content-Type' => 'text/html']),
        ]);

        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $customer = Customer::create([
            'name' => 'Kontrak Customer',
            'phone' => '081234567890',
            'address' => 'Jl. Contoh',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($user)->postJson("/api/customers/{$customer->id}/contracts", [
            'contract_ktp_number' => '1471020810010001',
            'contract_router_mac' => 'AA:BB:CC:DD:EE:FF',
            'contract_device_serial' => 'SN-123',
            'contract_photo_front_url' => 'https://drive.google.com/file/d/front/view',
            'contract_photo_modem_url' => 'https://drive.google.com/open?id=modem',
            'contract_photo_ktp_url' => 'https://example.test/ktp.jpg',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.customer_data.ktp_number', '147XXXXXXXXXX001')
            ->assertJsonPath('data.customer_data.photo_links.0.label', 'Poto Depan Rumah')
            ->assertJsonPath('data.customer_data.photo_links.1.label', 'Poto Modem')
            ->assertJsonPath('data.device_data.router_mac_address', 'AA:BB:CC:DD:EE:FF');

        $agreement = CustomerAgreement::firstOrFail();
        $this->assertNotEmpty($agreement->public_token);
        $this->assertNotEmpty($agreement->pdf_path);
        $this->assertNotEmpty($agreement->pdf_hash);
        Storage::disk('public')->assertExists($agreement->pdf_path);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'thumbnail?id=front'));
        Http::assertSent(fn ($request) => str_contains($request->url(), 'thumbnail?id=modem'));
        // Poto KTP dikecualikan dari kontrak PDF untuk privasi pelanggan
        Http::assertNotSent(fn ($request) => $request->url() === 'https://example.test/ktp.jpg');
    }

    public function test_public_qr_verification_page_displays_contract_identity(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'QR Customer',
            'phone' => '081234567891',
            'due_date' => now()->toDateString(),
        ]);

        $agreement = app(CustomerAgreementService::class)->generate($customer, [
            'contract_ktp_number' => '1471020810010002',
        ]);

        $this->get("/contracts/{$agreement->public_token}/verify")
            ->assertOk()
            ->assertSee($agreement->agreement_number)
            ->assertSee('DOKUMEN VALID')
            ->assertSee('Idza Ramaulkim');
    }

    public function test_whatsapp_send_falls_back_to_text_when_media_fails(): void
    {
        Storage::fake('public');
        config(['app.url' => 'https://rumahkitanet.site']);

        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $customer = Customer::create([
            'name' => 'WA Customer',
            'phone' => '081234567892',
            'due_date' => now()->toDateString(),
        ]);
        $agreement = app(CustomerAgreementService::class)->generate($customer);

        Http::fake([
            '*send-media' => Http::response(['success' => false, 'error' => 'media_failed'], 200),
            '*send' => Http::response(['success' => true], 200),
        ]);

        $this->actingAs($user)
            ->postJson("/api/customers/{$customer->id}/contracts/{$agreement->id}/send-whatsapp")
            ->assertOk()
            ->assertJsonPath('success', true);

        $agreement->refresh();
        $this->assertSame('sent', $agreement->whatsapp_status);
        $this->assertStringContainsString('media_failed', (string) $agreement->whatsapp_error);
    }

    public function test_local_server_photos_are_embedded_directly_without_http_fetch(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('verifications/front-house.png', $this->tinyPng());
        Storage::disk('public')->put('verifications/modem.png', $this->tinyPng());
        Http::fake();

        $service = app(CustomerAgreementService::class);
        $method = new \ReflectionMethod(CustomerAgreementService::class, 'resolveSheetPhotos');
        $method->setAccessible(true);

        $resolved = $method->invoke($service, [
            ['label' => 'Poto Depan Rumah', 'url' => 'https://rumahkitanet.my.id/storage/verifications/front-house.png'],
            ['label' => 'Poto Modem', 'url' => '/storage/verifications/modem.png'],
        ]);

        $this->assertCount(2, $resolved);
        $this->assertTrue($resolved[0]['is_image']);
        $this->assertStringStartsWith('data:image/png;base64,', (string) $resolved[0]['data_uri']);
        $this->assertTrue($resolved[1]['is_image']);
        $this->assertStringStartsWith('data:image/png;base64,', (string) $resolved[1]['data_uri']);
        Http::assertNothingSent();
    }

    public function test_regenerated_agreement_preserves_verification_ktp_mac_photos_and_fills_customer_details(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('verifications/front.png', $this->tinyPng());
        Storage::disk('public')->put('verifications/modem.png', $this->tinyPng());
        Http::fake();

        $customer = Customer::create([
            'name' => 'Suprapto',
            'gender' => 'Laki-laki',
            'phone' => '083174316312',
            'address' => 'Cinta damai',
            'odp' => 'ODP-KLD-05',
            'odp_port_number' => 3,
            'home_router_type' => 'ZTE F609',
            'dropcore_cable_length_meters' => 75,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(CustomerAgreementService::class);

        // First agreement created during verification (has KTP, MAC, photos)
        $first = $service->generate($customer, [
            'contract_ktp_number' => '1801060101900007',
            'contract_router_mac' => '64:E0:AB:63:26:66',
            'contract_device_serial' => 'ZTEG12345678',
            'contract_photo_front_url' => '/storage/verifications/front.png',
            'contract_photo_modem_url' => '/storage/verifications/modem.png',
        ]);

        // Second agreement regenerated from Customer page with empty input
        $second = $service->generate($customer, []);

        $this->assertSame('180XXXXXXXXXX007', $second->customer_data['ktp_number']);
        $this->assertSame('Laki-laki', $second->customer_data['gender']);
        $this->assertCount(2, $second->customer_data['photo_links']);
        $this->assertSame('ODP-KLD-05 (Port 3)', $second->device_data['odp']);
        $this->assertSame('64:E0:AB:63:26:66', $second->device_data['router_mac_address']);
        $this->assertSame('ZTEG12345678', $second->device_data['device_serial_number']);
        $this->assertSame('ZTE F609', $second->device_data['router_type']);
        $this->assertEquals(75, $second->device_data['dropcore_length']);
    }

    public function test_agreement_translates_gender_to_indonesian_and_resolves_master_package_price(): void
    {
        Storage::fake('public');

        \App\Models\Package::create([
            'name' => 'Paket 200K 30Mbps',
            'speed' => '30Mbps',
            'mikrotik_profile' => '30Mbps',
            'price' => 200000,
            'device_count' => '5 Device',
            'is_active' => true,
        ]);

        $maleCustomer = Customer::create([
            'name' => 'Sahrul',
            'gender' => 'male',
            'phone' => '082177444772',
            'address' => 'Samping musola',
            'package_id' => null,
            'package_type' => 'Paket 200K 30Mbps',
            'mikrotik_profile' => '30Mbps',
            'installation_fee' => 225000,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $femaleCustomer = Customer::create([
            'name' => 'Siti',
            'gender' => 'female',
            'phone' => '082177444773',
            'address' => 'Depan masjid',
            'package_id' => null,
            'package_type' => 'Paket 200K 30Mbps',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(CustomerAgreementService::class);
        $maleAgreement = $service->generate($maleCustomer, []);
        $femaleAgreement = $service->generate($femaleCustomer, []);

        $this->assertSame('Laki-laki', $maleAgreement->customer_data['gender']);
        $this->assertSame('Perempuan', $femaleAgreement->customer_data['gender']);
        $this->assertSame('Paket 200K 30Mbps', $maleAgreement->device_data['package_name']);
        $this->assertEquals(200000, (float) $maleAgreement->device_data['package_price']);
        $this->assertEquals(200000, (float) $femaleAgreement->device_data['package_price']);
    }

    private function tinyPng(): string
    {
        return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw7nJAAAAABJRU5ErkJggg==');
    }
}

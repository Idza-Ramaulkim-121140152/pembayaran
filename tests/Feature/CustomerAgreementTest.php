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
        Http::assertSent(fn ($request) => $request->url() === 'https://example.test/ktp.jpg');
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

    private function tinyPng(): string
    {
        return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw7nJAAAAABJRU5ErkJggg==');
    }
}

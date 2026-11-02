<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerDismantleRecord;
use App\Models\Invoice;
use App\Models\Odp;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerDismantleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $teknisi;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => User::ROLE_SUPERADMIN,
        ]);

        $this->teknisi = User::factory()->create([
            'role' => 'teknisi',
            'name' => 'Dani Teknisi',
            'phone' => '08987654321',
        ]);
    }

    public function test_only_customers_off_for_more_than_two_months_are_eligible(): void
    {
        $today = Carbon::parse('2026-11-02 00:00:00');
        Carbon::setTestNow($today);

        // ODP
        $odp = Odp::create([
            'nama' => 'ODP-KLI-01',
            'latitude' => -5.632,
            'longitude' => 105.548,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        // Customer 1: OFF 75 days (> 2 months) -> MUST appear
        $customerOverdue = Customer::create([
            'name' => 'Pak Joko Off',
            'phone' => '081234567890',
            'pppoe_username' => 'joko_off',
            'address' => 'Dusun 1 RT 02 Desa Way Urang',
            'latitude' => -5.6321,
            'longitude' => 105.5481,
            'due_date' => $today->copy()->subDays(75)->toDateString(),
            'odp_id' => $odp->id,
            'odp_port_number' => 2,
            'home_router_type' => 'ZTE F609',
            'is_active' => true,
        ]);

        Invoice::create([
            'customer_id' => $customerOverdue->id,
            'invoice_number' => 'INV-2026-001',
            'amount' => 175000,
            'status' => 'unpaid',
            'invoice_link' => 'https://example.com/inv/001',
            'invoice_date' => $today->copy()->subDays(75)->toDateString(),
            'due_date' => $today->copy()->subDays(75)->toDateString(),
        ]);

        // Customer 2: Active & only 15 days overdue (< 60 days) -> MUST NOT appear
        $customerRecent = Customer::create([
            'name' => 'Ibu Siti Aktif',
            'phone' => '081234567891',
            'pppoe_username' => 'siti_aktif',
            'address' => 'Dusun 2 Desa Way Urang',
            'due_date' => $today->copy()->subDays(15)->toDateString(),
            'is_active' => true,
        ]);

        Invoice::create([
            'customer_id' => $customerRecent->id,
            'invoice_number' => 'INV-2026-002',
            'amount' => 150000,
            'status' => 'unpaid',
            'invoice_link' => 'https://example.com/inv/002',
            'invoice_date' => $today->copy()->subDays(15)->toDateString(),
            'due_date' => $today->copy()->subDays(15)->toDateString(),
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson('/api/customer-dismantle');

        $response->assertStatus(200);
        $data = $response->json();

        $this->assertEquals(1, $data['summary']['total_eligible']);
        $this->assertCount(1, $data['items']);
        $this->assertEquals('Pak Joko Off', $data['items'][0]['name']);
        $this->assertEquals(75, $data['items'][0]['days_off']);
        $this->assertEquals('ODP-KLI-01', $data['items'][0]['odp_name']);
        $this->assertEquals(2, $data['items'][0]['odp_port']);
        $this->assertEquals('ZTE F609', $data['items'][0]['home_router_type']);
        $this->assertStringContainsString('maps', $data['items'][0]['google_maps_url']);
    }

    public function test_technician_can_update_dismantle_status_to_sudah_dicopot(): void
    {
        $today = Carbon::parse('2026-11-02 00:00:00');
        Carbon::setTestNow($today);

        $customer = Customer::create([
            'name' => 'Bambang Cabut',
            'phone' => '081999888777',
            'pppoe_username' => 'bambang_c',
            'address' => 'Desa Kedaton',
            'due_date' => $today->copy()->subDays(80)->toDateString(),
            'is_active' => true,
            'is_service_isolated' => false,
        ]);

        Invoice::create([
            'customer_id' => $customer->id,
            'invoice_number' => 'INV-2026-003',
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'https://example.com/inv/003',
            'invoice_date' => $today->copy()->subDays(80)->toDateString(),
            'due_date' => $today->copy()->subDays(80)->toDateString(),
        ]);

        $payload = [
            'status' => 'sudah_dicopot',
            'technician_name' => 'Dani & Tim',
            'retrieved_items' => ['ont', 'adaptor', 'dropcore'],
            'notes' => 'Modem ONT ditarik kondisi baik lengkap adaptor.',
        ];

        $response = $this->actingAs($this->teknisi)
            ->postJson("/api/customer-dismantle/{$customer->id}/status", $payload);

        $response->assertStatus(200);

        // Check dismantle record in database
        $this->assertDatabaseHas('customer_dismantle_records', [
            'customer_id' => $customer->id,
            'status' => 'sudah_dicopot',
            'technician_name' => 'Dani & Tim',
            'notes' => 'Modem ONT ditarik kondisi baik lengkap adaptor.',
        ]);

        // Customer must be automatically isolated and deactivated
        $customer->refresh();
        $this->assertTrue((bool) $customer->is_service_isolated);
        $this->assertFalse((bool) $customer->is_active);
    }

    public function test_share_text_returns_structured_whatsapp_work_order(): void
    {
        $today = Carbon::parse('2026-11-02 00:00:00');
        Carbon::setTestNow($today);

        $customer = Customer::create([
            'name' => 'Andi Santoso',
            'phone' => '085211223344',
            'pppoe_username' => 'andi_s',
            'address' => 'Jl. Lintas Sumatera Km 5',
            'latitude' => -5.6450,
            'longitude' => 105.5600,
            'due_date' => $today->copy()->subDays(95)->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/customer-dismantle/{$customer->id}/share-text");

        $response->assertStatus(200);
        $data = $response->json();

        $this->assertTrue($data['success']);
        $this->assertEquals('Andi Santoso', $data['customer_name']);
        $this->assertStringContainsString('SURAT TUGAS PENCABUTAN PERANGKAT', $data['share_wa_text']);
        $this->assertStringContainsString('Andi Santoso', $data['share_wa_text']);
        $this->assertStringContainsString('andi_s', $data['share_wa_text']);
        $this->assertStringContainsString('maps', $data['share_wa_text']);
        $this->assertStringContainsString('ONT/Modem', $data['share_wa_text']);
        $this->assertStringContainsString('wa.me', $data['share_wa_url']);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MasterOlt;
use App\Models\Odp;
use App\Models\OdpMappingAnomaly;
use App\Models\OltPonPort;
use App\Models\User;
use App\Services\OdpAiSuggestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OdpAiSuggestionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => User::ROLE_SUPERADMIN,
        ]);
    }

    public function test_ai_suggestions_suggests_nearest_odp_by_gps_coordinates(): void
    {
        // ODP A: -5.63200, 105.54800
        $odpA = Odp::create([
            'nama' => 'ODP-KALIANDA-001',
            'latitude' => -5.6320000,
            'longitude' => 105.5480000,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        // ODP B: -5.64200, 105.55800 (~1.5 km away)
        $odpB = Odp::create([
            'nama' => 'ODP-KALIANDA-002',
            'latitude' => -5.6420000,
            'longitude' => 105.5580000,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        // Customer C: ~20 meters from ODP A
        $customer = Customer::create([
            'name' => 'Budi Santoso',
            'phone' => '081234567891',
            'pppoe_username' => 'budi_santoso',
            'address' => 'Jl. Mawar No. 12',
            'latitude' => -5.6321000,
            'longitude' => 105.5480500,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(OdpAiSuggestionService::class);
        $result = $service->generateSuggestions(['customer_ids' => [$customer->id]]);

        $this->assertNotEmpty($result['suggestions']);
        $suggestion = $result['suggestions'][0];

        $this->assertEquals($customer->id, $suggestion['customer_id']);
        $this->assertEquals($odpA->id, $suggestion['suggested_odp_id']);
        $this->assertEquals('high', $suggestion['confidence']);
        $this->assertLessThan(40, $suggestion['distance_meters']);
    }

    public function test_ai_suggestions_matches_legacy_odp_name_with_fuzzy_matching(): void
    {
        $odp = Odp::create([
            'nama' => 'ODP-PENENGAHAN-003',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $customer = Customer::create([
            'name' => 'Siti Aminah',
            'phone' => '081234567892',
            'pppoe_username' => 'siti_aminah',
            'odp' => 'odp penengahan 3',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(OdpAiSuggestionService::class);
        $result = $service->generateSuggestions(['customer_ids' => [$customer->id]]);

        $this->assertNotEmpty($result['suggestions']);
        $suggestion = $result['suggestions'][0];

        $this->assertEquals($odp->id, $suggestion['suggested_odp_id']);
        $this->assertGreaterThanOrEqual(70, $suggestion['score']);
    }

    public function test_ai_suggestions_considers_pon_port_alignment(): void
    {
        $olt = MasterOlt::create([
            'name' => 'OLT Core',
            'host' => '192.168.10.1',
            'brand' => 'Hioso',
            'total_pon_ports' => 4,
        ]);

        $pon1 = OltPonPort::create([
            'olt_id' => $olt->id,
            'pon_index' => 1,
            'name' => 'PON 1',
        ]);

        $pon2 = OltPonPort::create([
            'olt_id' => $olt->id,
            'pon_index' => 2,
            'name' => 'PON 2',
        ]);

        $odpPon1 = Odp::create([
            'nama' => 'ODP-PON1-01',
            'olt_id' => $olt->id,
            'pon_port_id' => $pon1->id,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $odpPon2 = Odp::create([
            'nama' => 'ODP-PON2-01',
            'olt_id' => $olt->id,
            'pon_port_id' => $pon2->id,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $customer = Customer::create([
            'name' => 'Rahmat Hidayat',
            'phone' => '081234567893',
            'olt_id' => $olt->id,
            'pon_port_id' => $pon1->id,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(OdpAiSuggestionService::class);
        $result = $service->generateSuggestions(['customer_ids' => [$customer->id]]);

        $this->assertNotEmpty($result['suggestions']);
        $suggestion = $result['suggestions'][0];

        $this->assertEquals($odpPon1->id, $suggestion['suggested_odp_id']);
    }

    public function test_ai_apply_batch_updates_customers_atomically(): void
    {
        $odp = Odp::create([
            'nama' => 'ODP-AUTO-APPLY',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $customer1 = Customer::create([
            'name' => 'Pelanggan 1',
            'phone' => '081234567894',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $customer2 = Customer::create([
            'name' => 'Pelanggan 2',
            'phone' => '081234567895',
            'odp' => 'odp lama',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $anomaly = OdpMappingAnomaly::create([
            'customer_id' => $customer2->id,
            'legacy_odp_name' => 'odp lama',
            'anomaly_type' => 'odp_not_found',
            'resolved' => false,
        ]);

        $response = $this->actingAs($this->admin)->postJson('/api/odp-mapping/ai-apply', [
            'assignments' => [
                ['customer_id' => $customer1->id, 'odp_id' => $odp->id],
                ['customer_id' => $customer2->id, 'odp_id' => $odp->id],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.applied_count', 2);

        $this->assertEquals($odp->id, $customer1->fresh()->odp_id);
        $this->assertEquals($odp->nama, $customer1->fresh()->odp);

        $this->assertEquals($odp->id, $customer2->fresh()->odp_id);
        $this->assertEquals($odp->nama, $customer2->fresh()->odp);

        $this->assertTrue((bool) $anomaly->fresh()->resolved);
    }

    public function test_ai_suggestions_api_endpoint_returns_json_summary(): void
    {
        $odp = Odp::create([
            'nama' => 'ODP-API-TEST',
            'latitude' => -5.6320000,
            'longitude' => 105.5480000,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        Customer::create([
            'name' => 'Pelanggan API',
            'phone' => '081234567896',
            'latitude' => -5.6320500,
            'longitude' => 105.5480500,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->admin)->getJson('/api/odp-mapping/ai-suggestions');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                '*' => [
                    'customer_id',
                    'customer_name',
                    'suggested_odp_id',
                    'suggested_odp_name',
                    'score',
                    'confidence',
                    'reasons',
                ],
            ],
            'meta' => [
                'summary' => [
                    'total_unmapped',
                    'total_analyzed',
                    'total_suggestions',
                    'high_confidence_count',
                    'medium_confidence_count',
                    'low_confidence_count',
                ],
            ],
        ]);
    }

    public function test_ai_suggestions_flags_full_odp_capacity(): void
    {
        $odpFull = Odp::create([
            'nama' => 'ODP-FULL-01',
            'latitude' => -5.6320000,
            'longitude' => 105.5480000,
            'rasio_distribusi' => '1:2',
            'total_ports' => 2,
        ]);

        // Fill ODP
        for ($i = 1; $i <= 2; $i++) {
            Customer::create([
                'name' => "Occupant {$i}",
                'phone' => "0811111111{$i}",
                'odp_id' => $odpFull->id,
                'due_date' => now()->toDateString(),
                'is_active' => true,
            ]);
        }

        $newCustomer = Customer::create([
            'name' => 'Calon Terdekat',
            'phone' => '081234567899',
            'latitude' => -5.6320500,
            'longitude' => 105.5480500,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(OdpAiSuggestionService::class);
        $result = $service->generateSuggestions(['customer_ids' => [$newCustomer->id]]);

        $this->assertNotEmpty($result['suggestions']);
        $suggestion = $result['suggestions'][0];
        $this->assertContains('odp_full', $suggestion['flags']);
        $this->assertEquals(0, $suggestion['available_ports']);
    }

    public function test_ai_apply_validation_requires_assignments(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/odp-mapping/ai-apply', [
            'assignments' => [],
        ]);

        $response->assertStatus(422);
    }
}

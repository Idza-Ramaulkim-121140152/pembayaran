<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Odp;
use App\Models\User;
use App\Services\OdpPortService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OdpPortAutoAssignTest extends TestCase
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

    public function test_auto_assign_odp_ports_allocates_unassigned_customer_to_port_1(): void
    {
        $odp = Odp::create([
            'nama' => 'KAL-GTR-GTR-001',
            'latitude' => -5.6451,
            'longitude' => 105.5433,
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $customer = Customer::create([
            'name' => 'John Doe',
            'phone' => '081234567890',
            'pppoe_username' => 'gtr_johndoe',
            'address' => 'pertgaan',
            'odp_id' => $odp->id,
            'odp' => $odp->nama,
            'odp_port_number' => null, // Initially null
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(OdpPortService::class);
        $result = $service->autoAssignOdpPorts($odp);

        $this->assertEquals(1, $result['assigned_count']);
        $this->assertEquals(0, $result['failed_count']);

        $customer->refresh();
        $this->assertEquals(1, $customer->odp_port_number);
    }

    public function test_auto_assign_skips_occupied_ports_and_child_odp_ports(): void
    {
        $odp = Odp::create([
            'nama' => 'KAL-TAM-CNS-001',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        // Child ODP estafet on port 1
        Odp::create([
            'nama' => 'KAL-TAM-CNS-002',
            'parent_type' => 'odp',
            'parent_id' => $odp->id,
            'parent_port' => '1',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        // Existing customer on port 2
        Customer::create([
            'name' => 'Existing Customer',
            'phone' => '081234567891',
            'pppoe_username' => 'cust_p2',
            'odp_id' => $odp->id,
            'odp' => $odp->nama,
            'odp_port_number' => 2,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        // New customer without port
        $newCustomer = Customer::create([
            'name' => 'New Customer',
            'phone' => '081234567892',
            'pppoe_username' => 'cust_new',
            'odp_id' => $odp->id,
            'odp' => $odp->nama,
            'odp_port_number' => null,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $service = app(OdpPortService::class);
        $assignedPort = $service->autoAssignCustomer($newCustomer, $odp);

        // Port 1 is Child ODP, Port 2 is existing customer -> should get Port 3
        $this->assertEquals(3, $assignedPort);
        $this->assertEquals(3, $newCustomer->fresh()->odp_port_number);
    }

    public function test_api_attach_customer_automatically_assigns_available_port(): void
    {
        $odp = Odp::create([
            'nama' => 'KAL-GTR-GTR-001',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $customer = Customer::create([
            'name' => 'Ahmad Subarjo',
            'phone' => '081234567893',
            'pppoe_username' => 'ahmad_subarjo',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->admin)->postJson("/api/odp/{$odp->id}/customers", [
            'customer_id' => $customer->id,
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'assigned_port' => 1,
        ]);

        $customer->refresh();
        $this->assertEquals($odp->id, $customer->odp_id);
        $this->assertEquals(1, $customer->odp_port_number);
    }

    public function test_api_ports_summary_auto_assigns_unassigned_customers_on_the_fly(): void
    {
        $odp = Odp::create([
            'nama' => 'KAL-GTR-GTR-001',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        $customer = Customer::create([
            'name' => 'Bambang Hero',
            'phone' => '081234567894',
            'pppoe_username' => 'bambang_h',
            'odp_id' => $odp->id,
            'odp' => $odp->nama,
            'odp_port_number' => null, // Not yet plugged
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->admin)->getJson("/api/odp/{$odp->id}/ports-summary");

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertEquals(1, $data['odp']['occupied_ports']);
        $this->assertEquals(7, $data['odp']['available_ports']);
        $this->assertEquals(0, count($data['unallocated_customers']));
        $this->assertEquals('occupied', $data['ports'][0]['status']);
        $this->assertEquals($customer->id, $data['ports'][0]['customer']['id']);

        // Check DB persisted
        $this->assertEquals(1, $customer->fresh()->odp_port_number);
    }

    public function test_api_auto_assign_ports_endpoint(): void
    {
        $odp = Odp::create([
            'nama' => 'KAL-GTR-GTR-001',
            'rasio_distribusi' => '1:8',
            'total_ports' => 8,
        ]);

        Customer::create([
            'name' => 'Cust 1',
            'phone' => '081234567895',
            'pppoe_username' => 'cust_1',
            'odp_id' => $odp->id,
            'odp' => $odp->nama,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        Customer::create([
            'name' => 'Cust 2',
            'phone' => '081234567896',
            'pppoe_username' => 'cust_2',
            'odp_id' => $odp->id,
            'odp' => $odp->nama,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->admin)->postJson("/api/odp/{$odp->id}/ports/auto-assign");

        $response->assertStatus(200);
        $response->assertJson([
            'data' => [
                'assigned_count' => 2,
                'occupied_count' => 2,
                'free_count' => 6,
            ],
        ]);
    }
}

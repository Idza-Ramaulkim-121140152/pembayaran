<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Odp;
use App\Services\CustomerHomeRouterService;
use App\Services\CustomerPortalService;
use App\Services\MikroTikService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class CustomerPortalDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_dashboard_requires_customer_session(): void
    {
        $response = $this->getJson('/api/customer/dashboard');

        $response
            ->assertStatus(401)
            ->assertJson([
                'success' => false,
                'message' => 'Unauthorized',
            ]);
    }

    public function test_customer_dashboard_returns_v2_payload(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Test',
            'phone' => '081234567890',
            'address' => 'Jl. Test No. 1',
            'package_type' => '20 Mbps',
            'custom_package' => '250000',
            'pppoe_username' => 'TST-pelanggan01',
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
        ]);

        $this->mock(CustomerPortalService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('buildDashboard')
                ->once()
                ->withArgs(function ($arg) use ($customer) {
                    return $arg instanceof Customer && $arg->id === $customer->id;
                })
                ->andReturn([
                    'customer' => [
                        'id' => $customer->id,
                        'nama' => 'Pelanggan Test',
                        'alamat' => 'Jl. Test No. 1',
                        'no_telp' => '081234567890',
                        'user_pppoe' => 'TST-pelanggan01',
                        'paket' => '20 Mbps',
                        'harga' => '250000',
                        'tanggal_jatuh_tempo' => '2026-03-28',
                        'is_active' => true,
                        'odp' => null,
                    ],
                    'account_summary' => [
                        'due_date' => '2026-03-28',
                        'days_until_due' => 7,
                        'open_invoice_count' => 1,
                        'paid_invoice_count' => 3,
                    ],
                    'connection' => [
                        'status' => 'online',
                        'status_label' => 'Online',
                        'is_online' => true,
                    ],
                    'usage' => [
                        'available' => true,
                        'total_label' => '1.25 GB',
                    ],
                    'household' => [
                        'active_household_sessions' => 1,
                        'home_device_count_available' => false,
                    ],
                    'support_summary' => [
                        'active_count' => 1,
                        'latest_subject' => 'Internet lambat',
                    ],
                    'portal_meta' => [
                        'version' => 'v2',
                        'capabilities' => [
                            'realtime_connection' => true,
                            'session_traffic' => true,
                            'home_device_count' => false,
                        ],
                    ],
                    'invoices' => [],
                    'complaints' => [],
                ]);
        });

        $response = $this
            ->withSession([
                'customer_id' => $customer->id,
                'customer_logged_in' => true,
            ])
            ->getJson('/api/customer/dashboard');

        $response
            ->assertOk()
            ->assertJson([
                'success' => true,
                'customer' => [
                    'id' => $customer->id,
                    'nama' => 'Pelanggan Test',
                ],
                'connection' => [
                    'status' => 'online',
                    'is_online' => true,
                ],
                'usage' => [
                    'available' => true,
                ],
                'household' => [
                    'home_device_count_available' => false,
                ],
                'portal_meta' => [
                    'version' => 'v2',
                ],
            ]);
    }

    public function test_customer_dashboard_handles_odp_attribute_and_relation_name_collision(): void
    {
        $odp = Odp::create([
            'nama' => 'ODP-TEST',
            'rasio_distribusi' => '1:8',
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan ODP',
            'phone' => '081111111111',
            'address' => 'Jl. ODP Test',
            'package_type' => '30 Mbps',
            'pppoe_username' => 'ODP-pelanggan01',
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
            'odp' => $odp->nama,
        ]);

        $this->mock(MikroTikService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('getSystemResources')->once()->andReturn([
                'version' => '7.18',
            ]);
            $mock->shouldReceive('getIdentity')->once()->andReturn('RTR-TEST');
            $mock->shouldReceive('getPPPoESecret')->once()->with($customer->pppoe_username)->andReturn(null);
            $mock->shouldReceive('getActivePPPoEConnections')->once()->andReturn([]);
        });

        $response = $this
            ->withSession([
                'customer_id' => $customer->id,
                'customer_logged_in' => true,
            ])
            ->getJson('/api/customer/dashboard');

        $response
            ->assertOk()
            ->assertJson([
                'success' => true,
                'customer' => [
                    'id' => $customer->id,
                    'odp' => 'ODP-TEST',
                ],
                'connection' => [
                    'status' => 'provisioning',
                ],
            ]);
    }

    public function test_customer_dashboard_prefers_direct_home_router_data_when_available(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Router Rumah',
            'phone' => '082222222222',
            'address' => 'Jl. Router Rumah',
            'package_type' => '50 Mbps',
            'pppoe_username' => 'RTR-rumah01',
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
            'home_router_type' => 'mikrotik',
            'home_router_host' => '192.168.88.1',
            'home_router_port' => 8728,
            'home_router_username' => 'admin',
            'home_router_password' => 'super-secret',
            'home_router_monitoring_enabled' => true,
        ]);

        $this->mock(MikroTikService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('getSystemResources')->once()->andReturn([
                'version' => '7.18.2',
            ]);
            $mock->shouldReceive('getIdentity')->once()->andReturn('RTR-PUSAT');
            $mock->shouldReceive('getPPPoESecret')->once()->with($customer->pppoe_username)->andReturn([
                'profile' => 'Paket 50Mbps',
                'service' => 'pppoe',
                'remote_address' => '10.10.10.10',
                'disabled' => 'false',
            ]);
            $mock->shouldReceive('getActivePPPoEConnections')->once()->andReturn([
                [
                    'name' => $customer->pppoe_username,
                    'address' => '10.10.10.10',
                    'uptime' => '1d2h',
                    'caller_id' => 'AA:BB:CC:DD:EE:FF',
                    'bytes_in' => 1024,
                    'bytes_out' => 2048,
                    'total_bytes' => 3072,
                    'source' => 'ppp-active',
                ],
            ]);
        });

        $this->mock(CustomerHomeRouterService::class, function (MockInterface $mock) {
            $mock->shouldReceive('getSnapshot')->once()->andReturn([
                'enabled' => true,
                'configured' => true,
                'reachable' => true,
                'type' => 'mikrotik',
                'identity' => 'RUMAH-01',
                'version' => '7.18.2',
                'wan_interface' => 'pppoe-out1',
                'wan_uptime' => '3d4h',
                'note' => 'Data tambahan diambil langsung dari router rumah pelanggan melalui interface pppoe-out1.',
                'traffic' => [
                    'available' => true,
                    'source' => 'home_router_wan',
                    'source_label' => 'Interface WAN router rumah',
                    'download_bytes' => 5368709120,
                    'upload_bytes' => 1073741824,
                    'total_bytes' => 6442450944,
                    'note' => 'Counter diambil langsung dari interface WAN router rumah pelanggan.',
                ],
                'devices' => [
                    'available' => true,
                    'count' => 6,
                    'source' => 'dhcp_lease',
                    'source_label' => 'Lease DHCP aktif',
                    'note' => 'Jumlah perangkat dihitung dari lease DHCP yang sedang bound di router rumah.',
                ],
            ]);
        });

        $response = $this
            ->withSession([
                'customer_id' => $customer->id,
                'customer_logged_in' => true,
            ])
            ->getJson('/api/customer/dashboard');

        $response
            ->assertOk()
            ->assertJson([
                'success' => true,
                'usage' => [
                    'available' => true,
                    'source' => 'home_router_wan',
                    'source_label' => 'Interface WAN router rumah',
                    'total_label' => '6 GB',
                ],
                'household' => [
                    'home_device_count_available' => true,
                    'home_device_count' => 6,
                    'home_device_source' => 'dhcp_lease',
                ],
                'connection' => [
                    'home_router' => [
                        'reachable' => true,
                        'identity' => 'RUMAH-01',
                        'wan_interface' => 'pppoe-out1',
                    ],
                ],
                'portal_meta' => [
                    'capabilities' => [
                        'home_device_count' => true,
                        'customer_router_monitoring' => true,
                    ],
                ],
            ]);
    }
}

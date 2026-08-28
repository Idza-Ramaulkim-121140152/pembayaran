<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerWifiAllowedPublicIp;
use App\Models\CustomerWifiSettingLink;
use App\Models\Odp;
use App\Models\PaymentMethod;
use App\Models\User;
use App\Services\CustomerPortalService;
use App\Services\GenieAcsService;
use App\Services\MikroTikService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class CustomerPortalDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_dashboard_returns_ok_with_payment_methods_sorted_by_created_at_fallback(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Dashboard PM',
            'phone' => '081000000001',
            'address' => 'Jl. Dashboard PM',
            'package_type' => '20 Mbps',
            'pppoe_username' => null,
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
        ]);

        $highPriorityMethod = PaymentMethod::unguarded(function () {
            return PaymentMethod::create([
                'type' => 'qris',
                'instructions' => 'QRIS utama',
                'is_active' => true,
                'is_default' => true,
                'sort_order' => 1,
                'created_at' => '2026-01-01 00:00:00',
                'updated_at' => '2026-01-01 00:00:00',
            ]);
        });

        $olderSameSortMethod = PaymentMethod::unguarded(function () {
            return PaymentMethod::create([
                'type' => 'bank_transfer',
                'bank_name' => 'Bank Alpha',
                'account_name' => 'Akun Alpha',
                'account_number' => '001',
                'instructions' => 'Transfer ke Alpha',
                'is_active' => true,
                'is_default' => false,
                'sort_order' => 5,
                'created_at' => '2026-01-10 08:00:00',
                'updated_at' => '2026-01-10 08:00:00',
            ]);
        });

        $newerSameSortMethod = PaymentMethod::unguarded(function () {
            return PaymentMethod::create([
                'type' => 'bank_transfer',
                'bank_name' => 'Bank Beta',
                'account_name' => 'Akun Beta',
                'account_number' => '002',
                'instructions' => 'Transfer ke Beta',
                'is_active' => true,
                'is_default' => false,
                'sort_order' => 5,
                'created_at' => '2026-01-10 09:00:00',
                'updated_at' => '2026-01-10 09:00:00',
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
            ]);

        $this->assertSame(
            [
                $highPriorityMethod->id,
                $olderSameSortMethod->id,
                $newerSameSortMethod->id,
            ],
            collect($response->json('payment_methods'))->pluck('id')->all()
        );
    }

    public function test_customer_payment_methods_endpoint_returns_ok_and_uses_created_at_fallback_sort(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan PM Endpoint',
            'phone' => '081000000002',
            'address' => 'Jl. PM Endpoint',
            'package_type' => '30 Mbps',
            'pppoe_username' => null,
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
        ]);

        $olderSameSortMethod = PaymentMethod::unguarded(function () {
            return PaymentMethod::create([
                'type' => 'bank_transfer',
                'bank_name' => 'Bank Gamma',
                'account_name' => 'Akun Gamma',
                'account_number' => '003',
                'instructions' => 'Transfer ke Gamma',
                'is_active' => true,
                'is_default' => false,
                'sort_order' => 9,
                'created_at' => '2026-01-11 07:00:00',
                'updated_at' => '2026-01-11 07:00:00',
            ]);
        });

        $newerSameSortMethod = PaymentMethod::unguarded(function () {
            return PaymentMethod::create([
                'type' => 'bank_transfer',
                'bank_name' => 'Bank Delta',
                'account_name' => 'Akun Delta',
                'account_number' => '004',
                'instructions' => 'Transfer ke Delta',
                'is_active' => true,
                'is_default' => false,
                'sort_order' => 9,
                'created_at' => '2026-01-11 08:00:00',
                'updated_at' => '2026-01-11 08:00:00',
            ]);
        });

        $response = $this
            ->withSession([
                'customer_id' => $customer->id,
                'customer_logged_in' => true,
            ])
            ->getJson('/api/customer/payment-methods');

        $response
            ->assertOk()
            ->assertJson([
                'success' => true,
            ]);

        $this->assertSame(
            [
                $olderSameSortMethod->id,
                $newerSameSortMethod->id,
            ],
            collect($response->json('data'))->pluck('id')->all()
        );
    }

    public function test_customer_dashboard_returns_wifi_links_when_public_ip_is_allowed(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Link WiFi',
            'phone' => '081000000003',
            'address' => 'Jl. Link WiFi',
            'package_type' => '20 Mbps',
            'pppoe_username' => null,
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
        ]);
        $link = CustomerWifiSettingLink::create([
            'title' => 'Router Rumah',
            'url' => 'https://router.example.test',
            'description' => 'Ubah password WiFi dari router rumah.',
            'sort_order' => 1,
            'is_active' => true,
        ]);
        CustomerWifiSettingLink::create([
            'title' => 'Nonaktif',
            'url' => 'https://inactive.example.test',
            'is_active' => false,
        ]);
        CustomerWifiAllowedPublicIp::create([
            'ip_address' => '198.51.100.10',
            'is_active' => true,
        ]);

        $response = $this
            ->withServerVariables(['REMOTE_ADDR' => '198.51.100.10'])
            ->withSession([
                'customer_id' => $customer->id,
                'customer_logged_in' => true,
            ])
            ->getJson('/api/customer/dashboard')
            ->assertOk();

        $response->assertJsonPath('wifi_link_portal.ip_allowed', true);
        $response->assertJsonPath('wifi_link_portal.client_ip', '198.51.100.10');
        $this->assertSame([$link->id], collect($response->json('wifi_link_portal.links'))->pluck('id')->all());
    }

    public function test_customer_dashboard_blocks_wifi_links_when_public_ip_is_not_allowed(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Link WiFi Block',
            'phone' => '081000000004',
            'address' => 'Jl. Link WiFi Block',
            'package_type' => '20 Mbps',
            'pppoe_username' => null,
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
        ]);
        CustomerWifiSettingLink::create([
            'title' => 'Router Rumah',
            'url' => 'https://router.example.test',
            'is_active' => true,
        ]);
        CustomerWifiAllowedPublicIp::create([
            'ip_address' => '198.51.100.10',
            'is_active' => true,
        ]);

        $response = $this
            ->withServerVariables(['REMOTE_ADDR' => '198.51.100.11'])
            ->withSession([
                'customer_id' => $customer->id,
                'customer_logged_in' => true,
            ])
            ->getJson('/api/customer/dashboard')
            ->assertOk();

        $response->assertJsonPath('wifi_link_portal.ip_allowed', false);
        $response->assertJsonPath('wifi_link_portal.message', 'Gunakan internet dari WiFi rumah Anda untuk membuka fitur ini.');
        $this->assertCount(1, $response->json('wifi_link_portal.links'));
    }

    public function test_admin_can_manage_customer_wifi_link_master(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $linkResponse = $this->actingAs($admin)->postJson('/api/master/customer-wifi-links', [
            'title' => 'Router Utama',
            'url' => 'https://router.example.test',
            'description' => 'Akses router pelanggan',
            'sort_order' => 2,
            'is_active' => true,
        ])->assertCreated();
        $linkId = $linkResponse->json('data.id');

        $ipResponse = $this->actingAs($admin)->postJson('/api/master/customer-wifi-allowed-public-ips', [
            'ip_address' => '198.51.100.20',
            'notes' => 'Gateway pelanggan',
            'is_active' => true,
        ])->assertCreated();
        $ipId = $ipResponse->json('data.id');

        $this->actingAs($admin)->putJson("/api/master/customer-wifi-links/{$linkId}", [
            'title' => 'Router Utama Edit',
            'url' => 'https://router-edit.example.test',
            'sort_order' => 1,
            'is_active' => false,
        ])->assertOk();

        $this->actingAs($admin)->putJson("/api/master/customer-wifi-allowed-public-ips/{$ipId}", [
            'ip_address' => '198.51.100.21',
            'notes' => 'Gateway edit',
            'is_active' => false,
        ])->assertOk();

        $index = $this->actingAs($admin)->getJson('/api/master/customer-wifi-links')->assertOk();
        $index->assertJsonPath('summary.active_link_count', 0);
        $index->assertJsonPath('summary.active_ip_count', 0);

        $this->actingAs($admin)->deleteJson("/api/master/customer-wifi-links/{$linkId}")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/master/customer-wifi-allowed-public-ips/{$ipId}")->assertOk();
        $this->assertDatabaseCount('customer_wifi_setting_links', 0);
        $this->assertDatabaseCount('customer_wifi_allowed_public_ips', 0);
    }

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
	                ->withArgs(function ($arg, $request = null) use ($customer) {
	                    return $arg instanceof Customer && $arg->id === $customer->id && $request instanceof \Illuminate\Http\Request;
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

        $this->mock(GenieAcsService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('summarizePortalTelemetryByPppoe')
                ->once()
                ->with($customer->pppoe_username)
                ->andThrow(new \App\Exceptions\GenieAcsException('Device GenieACS tidak ditemukan untuk PPPoE pelanggan ini.', 404));
        });
        $this->mock(MikroTikService::class, function (MockInterface $mock) {
            $mock->shouldReceive('getActivePPPoEConnections')
                ->once()
                ->andReturn([]);
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
                    'status' => 'unknown',
                ],
            ]);
    }

    public function test_customer_dashboard_uses_genieacs_telemetry_when_available(): void
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
        ]);

        $this->mock(GenieAcsService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('summarizePortalTelemetryByPppoe')
                ->once()
                ->with($customer->pppoe_username)
                ->andReturn([
                    'device_id' => 'device-telemetry-1',
                    'serial_number' => 'SN-GEN-01',
                    'product_class' => 'V2801RGW',
                    'last_inform_at' => now()->subMinutes(2)->toIso8601String(),
                    'last_inform_recent' => true,
                    'wan_connected' => true,
                    'wan_status' => 'Connected',
                    'uptime' => '3d4h',
                    'ip_address' => '203.0.113.99',
                    'traffic' => [
                        'available' => true,
                        'source' => 'genieacs_tr098_wan',
                        'source_label' => 'Counter WAN GenieACS',
                        'download_bytes' => 5368709120,
                        'upload_bytes' => 1073741824,
                        'total_bytes' => 6442450944,
                    ],
                    'hosts' => [
                        'available' => true,
                        'count' => 6,
                        'source' => 'genieacs_hosts',
                        'source_label' => 'Host aktif GenieACS',
                    ],
                    'connected_devices' => [
                        'available' => true,
                        'count' => 9,
                        'source' => 'virtual_parameter_activedevices',
                        'source_label' => 'Perangkat terhubung',
                    ],
                    'wifi_clients' => [
                        'available' => true,
                        'ssids' => [
                            [
                                'ssid' => 'Summon',
                                'devices' => [
                                    [
                                        'name' => 'Redmi-Note-12',
                                        'ip_address' => '192.168.1.5',
                                        'mac_address' => '26:94:4A:B5:C3:68',
                                        'type' => '802.11',
                                    ],
                                ],
                            ],
                        ],
                    ],
                ]);
        });
        $this->mock(MikroTikService::class, function (MockInterface $mock) {
            $mock->shouldReceive('getActivePPPoEConnections')
                ->once()
                ->andReturn([]);
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
                    'total_label' => '6 GB',
                ],
                'household' => [
                    'home_device_count_available' => true,
                    'home_device_count' => 9,
                    'connected_wifi_ssids' => [
                        [
                            'ssid' => 'Summon',
                            'devices' => [
                                [
                                    'name' => 'Redmi-Note-12',
                                    'ip_address' => '192.168.1.5',
                                    'mac_address' => '26:94:4A:B5:C3:68',
                                    'type' => '802.11',
                                ],
                            ],
                        ],
                    ],
                ],
                'connection' => [
                    'status' => 'online',
                    'status_label' => 'Online',
                    'status_available' => true,
                    'uptime_label' => '3 hari 4 jam',
                    'home_router' => [
                        'reachable' => true,
                        'identity' => 'V2801RGW',
                        'serial_number' => 'SN-GEN-01',
                    ],
                ],
                'billing' => [
                    'has_open_invoices' => false,
                ],
                'portal_meta' => [
                    'capabilities' => [
                        'home_device_count' => true,
                        'connected_wifi_devices' => true,
                        'customer_router_monitoring' => true,
                    ],
                ],
            ]);
    }

    public function test_customer_dashboard_marks_status_online_when_pppoe_is_active_even_if_genieacs_is_not_ready(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan PPPoE Aktif',
            'phone' => '083333333333',
            'address' => 'Jl. PPPoE Aktif',
            'package_type' => '30 Mbps',
            'pppoe_username' => 'PPPOE-online-01',
            'due_date' => '2026-03-28',
            'activation_date' => '2026-02-01',
            'is_active' => true,
        ]);

        $this->mock(GenieAcsService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('summarizePortalTelemetryByPppoe')
                ->once()
                ->with($customer->pppoe_username)
                ->andThrow(new \App\Exceptions\GenieAcsException('Device GenieACS tidak ditemukan untuk PPPoE pelanggan ini.', 404));
        });
        $this->mock(MikroTikService::class, function (MockInterface $mock) use ($customer) {
            $mock->shouldReceive('getActivePPPoEConnections')
                ->once()
                ->andReturn([
                    [
                        'name' => $customer->pppoe_username,
                        'address' => '203.0.113.10',
                        'uptime' => '63046',
                        'session_id' => 'session-portal-1',
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
                'connection' => [
                    'status' => 'online',
                    'status_label' => 'Online',
                    'status_available' => true,
                    'uptime_label' => '17 jam 30 menit',
                    'status_source' => 'pppoe',
                ],
            ]);
    }
}

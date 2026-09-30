<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MasterOlt;
use App\Models\OltOnu;
use App\Models\OltPonPort;
use App\Models\User;
use App\Services\GenieAcsService;
use App\Services\MikroTikService;
use App\Services\OltSnmpService;
use App\Services\OltTelnetService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class MasterOltMikrotikGenieAcsDiscoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_match_olt_onu_with_genie_and_mikrotik_mac_offset_and_pppoe()
    {
        $genieService = Mockery::mock(GenieAcsService::class);
        $telnetService = Mockery::mock(OltTelnetService::class);
        $mikrotikService = Mockery::mock(MikroTikService::class);

        $oltSnmpService = new OltSnmpService($genieService, $telnetService, $mikrotikService);

        // Customer sapar
        $customer = Customer::create([
            'name' => 'Sapar',
            'pppoe_username' => 'CJA-sapar',
            'phone' => '081234567890',
            'address' => 'Jl. Kalianda No. 12',
            'is_active' => true,
        ]);

        $parsedGenie = [
            [
                'device_id' => '202BC1-XPON-B46415B2F489',
                'all_macs' => ['B46415B2F489'],
                'pon_mac' => 'B46415B2F483',
                'pppoe' => 'CJA-sapar',
                'sn' => 'ZTEG12345678',
                'model' => 'F670L',
            ]
        ];

        $mikrotikData = [
            'reachable' => true,
            'active' => [
                [
                    'name' => 'CJA-sapar',
                    'caller_id' => 'B4:64:15:B2:F4:89',
                    'clean_mac' => 'B46415B2F489',
                    'address' => '10.1.0.143',
                    'uptime' => '3d12h',
                    'service' => 'pppoe',
                ]
            ],
            'secrets' => [
                [
                    'name' => 'CJA-sapar',
                    'caller_id' => 'B4:64:15:B2:F4:89',
                    'clean_mac' => 'B46415B2F489',
                    'remote_address' => '10.1.0.143',
                    'profile' => 'default-encryption',
                ]
            ],
        ];

        $custByPppoe = ['cja-sapar' => $customer];
        $custByName = ['sapar' => $customer];

        // OLT MAC is B4:64:15:B2:F4:83 (Differs by 6 from MikroTik MAC B4:64:15:B2:F4:89)
        $match = $oltSnmpService->matchOltOnuWithGenieAndMikrotik(
            'B4:64:15:B2:F4:83',
            $parsedGenie,
            $mikrotikData,
            $custByPppoe,
            $custByName
        );

        $this->assertTrue($match['matched']);
        $this->assertNotNull($match['customer']);
        $this->assertEquals($customer->id, $match['customer']->id);
        $this->assertEquals('CJA-sapar', $match['pppoe_username']);
        $this->assertEquals('B4:64:15:B2:F4:89', $match['mikrotik_caller_id']);
        $this->assertEquals(6, $match['mac_offset']);
        $this->assertStringContainsString('MikroTik', $match['source']);
    }

    public function test_api_sync_mikrotik_genieacs_endpoint()
    {
        $user = User::factory()->create(['role' => 'admin']);

        $olt = MasterOlt::create([
            'name' => 'OLT Sentral Kalianda',
            'host' => '10.1.0.2',
            'username' => 'admin',
            'password' => 'admin',
            'snmp_port' => 161,
            'telnet_port' => 23,
            'total_pon_ports' => 2,
            'is_active' => true,
        ]);

        $ponPort = OltPonPort::create([
            'olt_id' => $olt->id,
            'pon_index' => 1,
            'pon_identifier' => 'EPON0/1',
            'name' => 'PON 1 - Kalianda',
            'admin_status' => 'up',
            'oper_status' => 'up',
            'total_registered_onu' => 1,
        ]);

        $customer = Customer::create([
            'name' => 'Saparudin',
            'pppoe_username' => 'CJA-sapar',
            'phone' => '081234567890',
            'is_active' => true,
        ]);

        $onu = OltOnu::create([
            'olt_id' => $olt->id,
            'pon_port_id' => $ponPort->id,
            'onu_index' => 1,
            'mac_address' => 'B4:64:15:B2:F4:83',
            'serial_number' => 'ONU-B46415B2F483',
            'status' => 'online',
        ]);

        // Mock MikroTikService in container
        $this->mock(MikroTikService::class, function ($mock) {
            $mock->shouldReceive('getActivePPPoEConnections')
                ->andReturn([
                    [
                        'name' => 'CJA-sapar',
                        'caller_id' => 'B4:64:15:B2:F4:89',
                        'address' => '10.1.0.143',
                        'uptime' => '2d',
                        'service' => 'pppoe',
                    ]
                ]);
            $mock->shouldReceive('getAllPPPoESecrets')
                ->andReturn([
                    'CJA-sapar' => [
                        'name' => 'CJA-sapar',
                        'caller_id' => 'B4:64:15:B2:F4:89',
                    ]
                ]);
        });

        $response = $this->actingAs($user)->postJson("/api/master-olts/{$olt->id}/sync-mikrotik");

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
        ]);

        $data = $response->json('data');
        $this->assertEquals(1, $data['matched_customers']);
        $this->assertEquals(1, $data['matched_onus']);

        // Assert customer was updated with OLT, PON port, and ONU mapping
        $customer->refresh();
        $this->assertEquals($olt->id, $customer->olt_id);
        $this->assertEquals($ponPort->id, $customer->pon_port_id);
        $this->assertEquals($onu->id, $customer->olt_onu_id);
    }
}

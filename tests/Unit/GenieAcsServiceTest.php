<?php

namespace Tests\Unit;

use App\Services\GenieAcsService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GenieAcsServiceTest extends TestCase
{
    public function test_it_matches_pppoe_and_builds_wifi_password_tasks_for_tr098_device(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('PPPOE-USER-01'),
            ]),
            'http://genie.test/devices/*/tasks*' => Http::response(['status' => 'ok']),
        ]);

        $result = app(GenieAcsService::class)->changeWifiPasswordByPppoe('pppoe-user-01', 'password123');

        $this->assertSame('device-1', $result['device_id']);
        $this->assertSame(1, $result['updated_ssid_count']);

        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $request->method() === 'POST'
                && str_contains((string) $request->url(), '/devices/device-1/tasks')
                && ($payload['name'] ?? null) === 'setParameterValues'
                && ($payload['parameterValues'][0][0] ?? null) === 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'
                && ($payload['parameterValues'][0][1] ?? null) === 'password123';
        });

        Http::assertSent(function ($request) {
            return $request->method() === 'POST'
                && ($request->data()['name'] ?? null) === 'refreshObject';
        });
    }

    public function test_it_describes_active_wifi_ssids_with_internal_target_path(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
        ]);

        $device = app(GenieAcsService::class)->describeDeviceByPppoe('client-a');

        $this->assertSame('device-1', $device['device_id']);
        $this->assertSame('Rumah Client', $device['ssids'][0]['ssid']);
        $this->assertArrayHasKey('password_path', $device['ssids'][0]);
        $this->assertSame('old-password', $device['ssids'][0]['current_password']);
    }

    public function test_it_reads_current_password_from_tr098_preshared_key_fallback(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098DeviceWithPresharedKeyFallback('client-b'),
            ]),
        ]);

        $device = app(GenieAcsService::class)->describeDeviceByPppoe('client-b');

        $this->assertSame('fallback-password', $device['ssids'][0]['current_password']);
        $this->assertSame(
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase',
            $device['ssids'][0]['password_path']
        );
    }

    public function test_it_reads_current_password_from_tr181_access_point_security(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr181Device('client-c'),
            ]),
        ]);

        $device = app(GenieAcsService::class)->describeDeviceByPppoe('client-c');

        $this->assertSame('TR181 Home', $device['ssids'][0]['ssid']);
        $this->assertSame('tr181-password', $device['ssids'][0]['current_password']);
    }

    public function test_it_verifies_wifi_password_when_all_targets_match(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a', 'newpass123'),
            ]),
        ]);

        $result = app(GenieAcsService::class)->verifyWifiPasswordByPppoe('client-a', 'newpass123', [
            [
                'ssid' => 'Rumah Client',
                'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
            ],
        ]);

        $this->assertSame('verified', $result['status']);
        $this->assertSame(1, $result['verified_ssid_count']);
    }

    public function test_it_marks_verification_partial_when_only_some_targets_match(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a', 'newpass123'),
            ]),
        ]);

        $result = app(GenieAcsService::class)->verifyWifiPasswordByPppoe('client-a', 'newpass123', [
            [
                'ssid' => 'Rumah Client',
                'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
            ],
            [
                'ssid' => 'Guest',
                'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2',
                'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase',
            ],
        ]);

        $this->assertSame('partial', $result['status']);
        $this->assertSame(1, $result['verified_ssid_count']);
        $this->assertSame(2, $result['target_ssid_count']);
    }

    public function test_it_keeps_verification_pending_when_password_has_not_changed_yet(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a', 'old-password'),
            ]),
        ]);

        $result = app(GenieAcsService::class)->verifyWifiPasswordByPppoe('client-a', 'newpass123', [
            [
                'ssid' => 'Rumah Client',
                'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
            ],
        ]);

        $this->assertSame('pending', $result['status']);
        $this->assertSame(0, $result['verified_ssid_count']);
    }

    public function test_it_marks_verification_failed_when_device_is_missing(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([]),
        ]);

        $result = app(GenieAcsService::class)->verifyWifiPasswordByPppoe('missing-client', 'newpass123', [
            [
                'ssid' => 'Rumah Client',
                'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
            ],
        ]);

        $this->assertSame('failed', $result['status']);
    }

    public function test_it_summarizes_genieacs_portal_telemetry_for_online_device(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
        ]);

        $summary = app(GenieAcsService::class)->summarizePortalTelemetryByPppoe('client-a');

        $this->assertSame('device-1', $summary['device_id']);
        $this->assertTrue($summary['last_inform_recent']);
        $this->assertTrue($summary['wan_connected']);
        $this->assertSame('Connected', $summary['wan_status']);
        $this->assertSame('203.0.113.10', $summary['ip_address']);
        $this->assertTrue($summary['traffic']['available']);
        $this->assertSame(4096, $summary['traffic']['download_bytes']);
        $this->assertSame(2048, $summary['traffic']['upload_bytes']);
        $this->assertTrue($summary['connected_devices']['available']);
        $this->assertSame(5, $summary['connected_devices']['count']);
        $this->assertTrue($summary['hosts']['available']);
        $this->assertSame(2, $summary['hosts']['count']);
    }

    public function test_it_marks_portal_telemetry_offline_when_last_inform_is_stale(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a', 'old-password', now()->subHours(2)->toIso8601String(), 'Disconnected'),
            ]),
        ]);

        $summary = app(GenieAcsService::class)->summarizePortalTelemetryByPppoe('client-a');

        $this->assertFalse($summary['last_inform_recent']);
        $this->assertFalse($summary['wan_connected']);
        $this->assertSame('Disconnected', $summary['wan_status']);
    }

    public function test_it_counts_connected_hosts_from_tr181_hosts_table(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr181Device('client-c'),
            ]),
        ]);

        $summary = app(GenieAcsService::class)->summarizePortalTelemetryByPppoe('client-c');

        $this->assertTrue($summary['hosts']['available']);
        $this->assertSame(2, $summary['hosts']['count']);
        $this->assertTrue($summary['traffic']['available']);
        $this->assertSame(8192, $summary['traffic']['download_bytes']);
        $this->assertSame(4096, $summary['traffic']['upload_bytes']);
    }

    public function test_it_builds_connected_wifi_devices_grouped_by_ssid_from_virtual_parameters(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
        ]);

        $summary = app(GenieAcsService::class)->summarizePortalTelemetryByPppoe('client-a');

        $this->assertTrue($summary['wifi_clients']['available']);
        $this->assertCount(2, $summary['wifi_clients']['ssids']);
        $this->assertSame('Summon', $summary['wifi_clients']['ssids'][0]['ssid']);
        $this->assertCount(2, $summary['wifi_clients']['ssids'][0]['devices']);
        $this->assertSame('Perangkat 192.168.1.10', $summary['wifi_clients']['ssids'][0]['devices'][0]['name']);
        $this->assertSame('802.11', $summary['wifi_clients']['ssids'][0]['devices'][0]['type']);
        $this->assertSame('Redmi-Note-12', $summary['wifi_clients']['ssids'][0]['devices'][1]['name']);
        $this->assertSame('Guest', $summary['wifi_clients']['ssids'][1]['ssid']);
        $this->assertSame('OPPO-A18', $summary['wifi_clients']['ssids'][1]['devices'][0]['name']);
    }

    private function tr098Device(
        string $pppoeUsername,
        string $wifiPassword = 'old-password',
        ?string $lastInformAt = null,
        string $connectionStatus = 'Connected'
    ): array
    {
        return [
            '_id' => 'device-1',
            '_lastInform' => $lastInformAt ?: now()->subMinutes(3)->toIso8601String(),
            'DeviceID' => [
                'SerialNumber' => ['_value' => 'SN001'],
                'ProductClass' => ['_value' => 'V2801RGW'],
            ],
            'VirtualParameters' => [
                'activedevices' => ['_value' => '5'],
                'Wifi Connected SSID1' => ['_value' => implode("\n", [
                    'Summon',
                    'IP Address    MAC Addr',
                    '192.168.1.10    c2:cc:b1:69:3b:59',
                    '192.168.1.5    26:94:4a:b5:c3:68',
                    '192.168.1.10    c2:cc:b1:69:3b:59',
                ])],
                'Wifi Connected SSID2' => ['_value' => implode("\n", [
                    'Guest',
                    'IP Address    MAC Addr',
                    '192.168.1.4    f6:31:b8:95:64:7c',
                ])],
                'LAN HOST' => ['_value' => implode("\n", [
                    'Host name    IP address    MAC address    Type',
                    'Redmi-Note-12    192.168.1.5    26:94:4a:b5:c3:68    802.11',
                    '192.168.1.10    c2:cc:b1:69:3b:59    802.11',
                    'OPPO-A18    192.168.1.4    f6:31:b8:95:64:7c    802.11',
                ])],
            ],
            'InternetGatewayDevice' => [
                'WANDevice' => [
                    '1' => [
                        'WANConnectionDevice' => [
                            '1' => [
                                'WANPPPConnection' => [
                                    '1' => [
                                        'Username' => ['_value' => $pppoeUsername],
                                        'ConnectionStatus' => ['_value' => $connectionStatus],
                                        'ExternalIPAddress' => ['_value' => '203.0.113.10'],
                                        'Uptime' => ['_value' => '2d4h'],
                                        'Stats' => [
                                            'BytesReceived' => ['_value' => 4096],
                                            'BytesSent' => ['_value' => 2048],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
                'LANDevice' => [
                    '1' => [
                        'WLANConfiguration' => [
                            '1' => [
                                'Enable' => ['_value' => true],
                                'SSID' => ['_value' => 'Rumah Client'],
                                'KeyPassphrase' => [
                                    '_value' => $wifiPassword,
                                    '_writable' => true,
                                ],
                            ],
                            '2' => [
                                'Enable' => ['_value' => false],
                                'SSID' => ['_value' => 'Guest'],
                                'KeyPassphrase' => [
                                    '_value' => 'guest-password',
                                    '_writable' => true,
                                ],
                            ],
                            ],
                        'Hosts' => [
                            'Host' => [
                                '1' => [
                                    'Active' => ['_value' => true],
                                    'MACAddress' => ['_value' => 'AA:BB:CC:DD:EE:01'],
                                ],
                                '2' => [
                                    'Active' => ['_value' => true],
                                    'MACAddress' => ['_value' => 'AA:BB:CC:DD:EE:02'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
    }

    private function tr098DeviceWithPresharedKeyFallback(string $pppoeUsername): array
    {
        $device = $this->tr098Device($pppoeUsername);
        unset($device['InternetGatewayDevice']['LANDevice']['1']['WLANConfiguration']['1']['KeyPassphrase']);
        $device['InternetGatewayDevice']['LANDevice']['1']['WLANConfiguration']['1']['PreSharedKey'] = [
            '1' => [
                'KeyPassphrase' => [
                    '_value' => 'fallback-password',
                    '_writable' => true,
                ],
            ],
        ];

        return $device;
    }

    private function tr181Device(string $pppoeUsername): array
    {
        return [
            '_id' => 'device-tr181',
            '_lastInform' => now()->subMinutes(4)->toIso8601String(),
            'DeviceID' => [
                'SerialNumber' => ['_value' => 'SNTR181'],
                'ProductClass' => ['_value' => 'TR181-CPE'],
            ],
            'Device' => [
                'PPP' => [
                    'Interface' => [
                        '1' => [
                            'Username' => ['_value' => $pppoeUsername],
                            'Status' => ['_value' => 'Up'],
                            'Stats' => [
                                'BytesReceived' => ['_value' => 8192],
                                'BytesSent' => ['_value' => 4096],
                            ],
                        ],
                    ],
                ],
                'Hosts' => [
                    'Host' => [
                        '1' => [
                            'Active' => ['_value' => true],
                            'PhysAddress' => ['_value' => 'AA:00:00:00:00:01'],
                        ],
                        '2' => [
                            'Active' => ['_value' => true],
                            'PhysAddress' => ['_value' => 'AA:00:00:00:00:02'],
                        ],
                    ],
                ],
                'WiFi' => [
                    'SSID' => [
                        '1' => [
                            'Enable' => ['_value' => true],
                            'SSID' => ['_value' => 'TR181 Home'],
                        ],
                    ],
                    'AccessPoint' => [
                        '1' => [
                            'Enable' => ['_value' => true],
                            'SSIDReference' => ['_value' => 'Device.WiFi.SSID.1'],
                            'Security' => [
                                'KeyPassphrase' => [
                                    '_value' => 'tr181-password',
                                    '_writable' => true,
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
    }
}

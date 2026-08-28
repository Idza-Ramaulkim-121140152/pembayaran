<?php

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CustomerPortalWifiManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_lookup_wifi_device_via_session(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
        ]);

        $customer = $this->createCustomer('client-a');

        $response = $this->withCustomerSession($customer)
            ->getJson('/api/customer/wifi/device');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.device_id', 'device-1')
            ->assertJsonPath('data.ssids.0.current_password', 'old-password');

        $this->assertArrayNotHasKey('password_path', $response->json('data.ssids.0'));
    }

    public function test_customer_without_pppoe_gets_clear_error(): void
    {
        $customer = $this->createCustomer(null);

        $this->withCustomerSession($customer)
            ->getJson('/api/customer/wifi/device')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Akun Anda belum memiliki PPPoE username. Hubungi admin.');
    }

    public function test_customer_wifi_password_change_stays_available_even_when_portal_password_must_be_changed(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
            'http://genie.test/devices/*/tasks*' => Http::response(['status' => 'ok']),
        ]);

        $customer = $this->createCustomer('client-a', [
            'mobile_force_password_change' => true,
        ]);

        $this->withCustomerSession($customer)
            ->postJson('/api/customer/wifi/password', [
                'password' => 'newpass123',
                'password_confirmation' => 'newpass123',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.verification_status', 'pending');
    }

    public function test_customer_wifi_password_change_returns_verification_id_and_keeps_password_encrypted_in_cache(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
            'http://genie.test/devices/*/tasks*' => Http::response(['status' => 'ok']),
        ]);

        $customer = $this->createCustomer('client-a');

        $response = $this->withCustomerSession($customer)
            ->postJson('/api/customer/wifi/password', [
                'password' => 'newpass123',
                'password_confirmation' => 'newpass123',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.verification_status', 'pending')
            ->assertJsonPath('data.target_ssid_count', 1);

        $verificationId = $response->json('data.verification_id');
        $this->assertNotEmpty($verificationId);

        $cached = Cache::get("customer_wifi_password_verification:{$customer->id}:{$verificationId}");
        $this->assertNotEmpty($cached);
        $this->assertArrayHasKey('encrypted_password', $cached);
        $this->assertStringNotContainsString('newpass123', json_encode($cached));
    }

    public function test_customer_wifi_password_verification_returns_verified_status(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        $deviceRequestCount = 0;
        Http::fake(function ($request) use (&$deviceRequestCount) {
            if ($request->method() === 'POST') {
                return Http::response(['status' => 'ok']);
            }

            $deviceRequestCount++;

            return Http::response([
                $deviceRequestCount === 1
                    ? $this->tr098Device('client-a')
                    : $this->tr098Device('client-a', 'newpass123'),
            ]);
        });

        $customer = $this->createCustomer('client-a');

        $response = $this->withCustomerSession($customer)
            ->postJson('/api/customer/wifi/password', [
                'password' => 'newpass123',
                'password_confirmation' => 'newpass123',
            ])
            ->assertOk();

        $verificationId = $response->json('data.verification_id');

        $this->withCustomerSession($customer)
            ->getJson("/api/customer/wifi/password-verifications/{$verificationId}")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'verified')
            ->assertJsonPath('data.verified_ssid_count', 1)
            ->assertJsonPath('data.target_ssid_count', 1);
    }

    private function withCustomerSession(Customer $customer): self
    {
        return $this->withSession([
            'customer_id' => $customer->id,
            'customer_logged_in' => true,
        ]);
    }

    private function createCustomer(?string $pppoeUsername, array $attributes = []): Customer
    {
        return Customer::create(array_merge([
            'name' => 'Portal WiFi Customer',
            'phone' => '081234567890',
            'is_active' => true,
            'due_date' => now()->toDateString(),
            'pppoe_username' => $pppoeUsername,
            'mobile_password' => Hash::make('portal123'),
            'mobile_force_password_change' => false,
            'portal_login_enabled' => true,
        ], $attributes));
    }

    private function tr098Device(string $pppoeUsername, string $wifiPassword = 'old-password'): array
    {
        return [
            '_id' => 'device-1',
            'DeviceID' => [
                'SerialNumber' => ['_value' => 'SN001'],
                'ProductClass' => ['_value' => 'V2801RGW'],
            ],
            'InternetGatewayDevice' => [
                'WANDevice' => [
                    '1' => [
                        'WANConnectionDevice' => [
                            '1' => [
                                'WANPPPConnection' => [
                                    '1' => [
                                        'Username' => ['_value' => $pppoeUsername],
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
                        ],
                    ],
                ],
            ],
        ];
    }
}

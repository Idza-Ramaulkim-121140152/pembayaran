<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\SystemAuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CustomerWifiPasswordTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_without_permission_cannot_lookup_wifi_device(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $customer = $this->createCustomer('client-a');

        $this->actingAs($user)
            ->getJson("/api/customers/{$customer->id}/wifi/device")
            ->assertForbidden();
    }

    public function test_customer_without_pppoe_returns_validation_error(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = $this->createCustomer(null);

        $this->actingAs($user)
            ->getJson("/api/customers/{$customer->id}/wifi/device")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Pelanggan belum memiliki PPPoE username.');
    }

    public function test_password_must_follow_wpa_length_and_confirmation_rules(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = $this->createCustomer('client-a');

        $this->actingAs($user)
            ->postJson("/api/customers/{$customer->id}/wifi/password", [
                'password' => 'short',
                'password_confirmation' => 'different',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_successful_password_change_sends_genieacs_task_and_audits_without_plaintext_password(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
            'http://genie.test/devices/*/tasks*' => Http::response(['status' => 'ok']),
        ]);

        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = $this->createCustomer('client-a');

        $response = $this->actingAs($user)
            ->postJson("/api/customers/{$customer->id}/wifi/password", [
                'password' => 'newpass123',
                'password_confirmation' => 'newpass123',
            ])
            ->assertOk()
            ->assertJsonPath('data.device_id', 'device-1')
            ->assertJsonPath('data.updated_ssid_count', 1)
            ->assertJsonPath('data.verification_status', 'pending');

        $verificationId = $response->json('data.verification_id');
        $this->assertNotEmpty($verificationId);

        $cached = Cache::get("customer_wifi_password_verification:{$customer->id}:{$verificationId}");
        $this->assertNotEmpty($cached);
        $this->assertArrayHasKey('encrypted_password', $cached);
        $this->assertStringNotContainsString('newpass123', json_encode($cached));

        Http::assertSent(function ($request) {
            return $request->method() === 'POST'
                && ($request->data()['name'] ?? null) === 'setParameterValues'
                && ($request->data()['parameterValues'][0][1] ?? null) === 'newpass123';
        });

        $audit = SystemAuditLog::query()
            ->where('event_type', 'customer_wifi_password.changed')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('client-a', $audit->payload['pppoe_username']);
        $this->assertStringNotContainsString('newpass123', json_encode($audit->payload));
        $this->assertStringNotContainsString('old-password', json_encode($audit->payload));
    }

    public function test_wifi_password_verification_endpoint_reads_cache_and_returns_verified_status(): void
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

        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = $this->createCustomer('client-a');

        $response = $this->actingAs($user)
            ->postJson("/api/customers/{$customer->id}/wifi/password", [
                'password' => 'newpass123',
                'password_confirmation' => 'newpass123',
            ])
            ->assertOk();

        $verificationId = $response->json('data.verification_id');

        $this->actingAs($user)
            ->getJson("/api/customers/{$customer->id}/wifi/password-verifications/{$verificationId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'verified')
            ->assertJsonPath('data.verified_ssid_count', 1)
            ->assertJsonPath('data.target_ssid_count', 1);
    }

    public function test_invalid_wifi_password_verification_id_returns_clear_error(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = $this->createCustomer('client-a');

        $this->actingAs($user)
            ->getJson("/api/customers/{$customer->id}/wifi/password-verifications/not-found")
            ->assertStatus(404)
            ->assertJsonPath('message', 'Data verifikasi password WiFi tidak ditemukan atau sudah kedaluwarsa.');
    }

    public function test_device_lookup_response_exposes_current_password_without_internal_password_path(): void
    {
        config(['services.genieacs.api_url' => 'http://genie.test']);

        Http::fake([
            'http://genie.test/devices*' => Http::response([
                $this->tr098Device('client-a'),
            ]),
        ]);

        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = $this->createCustomer('client-a');

        $response = $this->actingAs($user)
            ->getJson("/api/customers/{$customer->id}/wifi/device")
            ->assertOk()
            ->assertJsonPath('data.device_id', 'device-1')
            ->assertJsonPath('data.ssids.0.current_password', 'old-password');

        $this->assertArrayNotHasKey('password_path', $response->json('data.ssids.0'));
    }

    private function createCustomer(?string $pppoeUsername): Customer
    {
        return Customer::create([
            'name' => 'WiFi Customer ' . ($pppoeUsername ?: 'No PPPoE'),
            'phone' => '08123456789',
            'is_active' => true,
            'due_date' => now()->toDateString(),
            'pppoe_username' => $pppoeUsername,
        ]);
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

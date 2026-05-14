<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MobileCustomerToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MobileCustomerAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_login_success_with_default_password_and_force_change_flag(): void
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Mobile',
            'phone' => '081111111111',
            'pppoe_username' => 'MOBILE-USER-01',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/mobile/customer/auth/login', [
            'pppoe_username' => 'MOBILE-USER-01',
            'password' => '12345678',
            'device_name' => 'Unit Test Device',
        ]);

        $response
            ->assertOk()
            ->assertJson([
                'must_change_password' => true,
                'customer' => [
                    'id' => $customer->id,
                    'pppoe_username' => 'MOBILE-USER-01',
                ],
            ])
            ->assertJsonStructure([
                'access_token',
                'expires_at',
                'token_type',
            ]);

        $this->assertDatabaseHas('mobile_customer_tokens', [
            'customer_id' => $customer->id,
            'device_name' => 'Unit Test Device',
        ]);
    }

    public function test_mobile_login_fails_with_wrong_password(): void
    {
        Customer::create([
            'name' => 'Pelanggan Gagal',
            'phone' => '082222222222',
            'pppoe_username' => 'MOBILE-FAIL-01',
            'mobile_password' => Hash::make('benar1234'),
            'mobile_force_password_change' => false,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/mobile/customer/auth/login', [
            'pppoe_username' => 'MOBILE-FAIL-01',
            'password' => 'salah1234',
        ]);

        $response
            ->assertStatus(401)
            ->assertJson([
                'message' => 'Username PPPoE atau password salah.',
            ]);
    }

    public function test_change_password_and_logout_flow(): void
    {
        Customer::create([
            'name' => 'Pelanggan Flow',
            'phone' => '083333333333',
            'pppoe_username' => 'MOBILE-FLOW-01',
            'is_active' => true,
        ]);

        $loginResponse = $this->postJson('/api/mobile/customer/auth/login', [
            'pppoe_username' => 'MOBILE-FLOW-01',
            'password' => '12345678',
        ])->assertOk();

        $token = (string) $loginResponse->json('access_token');

        $this->postJson('/api/mobile/customer/auth/change-password', [
            'current_password' => '12345678',
            'new_password' => 'baru12345',
            'new_password_confirmation' => 'baru12345',
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk()->assertJson([
            'must_change_password' => false,
        ]);

        $this->postJson('/api/mobile/customer/auth/logout', [], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $this->assertDatabaseHas('mobile_customer_tokens', [
            'token_hash' => hash('sha256', $token),
        ]);

        $this->assertNotNull(
            MobileCustomerToken::query()
                ->where('token_hash', hash('sha256', $token))
                ->first()
                ?->revoked_at
        );
    }

    public function test_protected_mobile_route_requires_token(): void
    {
        $this->getJson('/api/mobile/customer/invoices')
            ->assertStatus(401);
    }

    public function test_mobile_login_is_rate_limited_after_five_attempts(): void
    {
        Customer::create([
            'name' => 'Pelanggan Limit',
            'phone' => '084444444444',
            'pppoe_username' => 'MOBILE-LIMIT-01',
            'mobile_password' => Hash::make('benar1234'),
            'mobile_force_password_change' => false,
            'is_active' => true,
        ]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/mobile/customer/auth/login', [
                'pppoe_username' => 'MOBILE-LIMIT-01',
                'password' => 'salah1234',
            ])->assertStatus(401);
        }

        $this->postJson('/api/mobile/customer/auth/login', [
            'pppoe_username' => 'MOBILE-LIMIT-01',
            'password' => 'salah1234',
        ])->assertStatus(429);
    }

    public function test_staff_can_reset_mobile_password_to_default(): void
    {
        $user = User::create([
            'name' => 'Admin',
            'email' => 'admin@example.test',
            'password' => Hash::make('secret1234'),
            'role' => User::ROLE_ADMIN,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Reset',
            'phone' => '085555555555',
            'pppoe_username' => 'MOBILE-RESET-01',
            'mobile_password' => Hash::make('oldpassword'),
            'mobile_force_password_change' => false,
            'is_active' => true,
        ]);

        $this->actingAs($user)->postJson('/api/customers/'.$customer->id.'/mobile-password/reset', [
            'reason' => 'permintaan_cs',
        ])->assertOk()->assertJson([
            'data' => [
                'customer_id' => $customer->id,
                'must_change_password' => true,
                'default_password' => '12345678',
            ],
        ]);

        $customer->refresh();

        $this->assertTrue(Hash::check('12345678', (string) $customer->mobile_password));
        $this->assertTrue((bool) $customer->mobile_force_password_change);
    }

    public function test_legacy_customer_login_endpoint_still_works(): void
    {
        Customer::create([
            'name' => 'Portal Lama',
            'phone' => '086666666666',
            'pppoe_username' => 'LEGACY-USER-01',
            'is_active' => true,
        ]);

        $this->postJson('/api/customer/login', [
            'identifier' => 'LEGACY-USER-01',
        ])->assertOk()->assertJson([
            'success' => true,
            'message' => 'Login berhasil',
        ]);
    }
}

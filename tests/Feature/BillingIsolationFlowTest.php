<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\User;
use App\Services\MikroTikService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class BillingIsolationFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_isolate_customer_saves_local_isolation_tracking_and_restore_profile(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Isolation Target',
            'phone' => '081200000001',
            'pppoe_username' => 'ISO-TARGET',
            'is_active' => true,
            'due_date' => '2026-06-10',
        ]);

        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('getPPPoESecret')
            ->once()
            ->with('ISO-TARGET')
            ->andReturn([
                'id' => '*1',
                'name' => 'ISO-TARGET',
                'profile' => 'Paket 200K',
            ]);
        $mikrotik->shouldReceive('isolateUser')
            ->once()
            ->with('ISO-TARGET')
            ->andReturn([
                'success' => true,
                'username' => 'ISO-TARGET',
                'original_profile' => 'Paket 200K',
                'new_profile' => 'Isolir',
            ]);

        $this->app->instance(MikroTikService::class, $mikrotik);

        $this->actingAs($user)
            ->postJson('/api/billing/customer/' . $customer->id . '/isolate')
            ->assertOk()
            ->assertJsonPath('data.saved_profile', 'Paket 200K')
            ->assertJsonPath('data.local_isolation_saved', true);

        $customer->refresh();

        $this->assertTrue((bool) $customer->is_service_isolated);
        $this->assertSame('Paket 200K', $customer->isolation_restore_profile);
        $this->assertNotNull($customer->service_isolated_at);
        $this->assertSame($user->id, $customer->service_isolated_by);

        $this->assertDatabaseHas('system_audit_logs', [
            'event_type' => 'billing.customer_isolated',
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'actor_id' => $user->id,
        ]);
    }

    public function test_confirm_payment_for_isolated_customer_restores_service_and_uses_confirmation_date_for_due_date(): void
    {
        Carbon::setTestNow('2026-06-17 10:00:00');

        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Isolated Customer',
            'phone' => '081200000002',
            'pppoe_username' => 'ISO-PAID',
            'is_active' => true,
            'due_date' => '2026-05-26',
            'is_service_isolated' => true,
            'service_isolated_at' => '2026-06-15 08:00:00',
            'service_isolated_by' => $user->id,
            'isolation_restore_profile' => 'Paket 200K',
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-06-17',
            'due_date' => '2026-06-17',
            'amount' => 200000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-isolated-paid',
        ]);

        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('connect')->once();
        $mikrotik->shouldReceive('getPPPoESecret')
            ->once()
            ->with('ISO-PAID')
            ->andReturn([
                'id' => '*2',
                'name' => 'ISO-PAID',
                'profile' => 'Isolir',
            ]);
        $mikrotik->shouldReceive('command')
            ->once()
            ->with('/ppp/profile/print')
            ->andReturn([
                ['name' => 'Paket 200K'],
                ['name' => 'Isolir'],
            ]);
        $mikrotik->shouldReceive('unrestrictUser')
            ->once()
            ->with('ISO-PAID', 'Paket 200K')
            ->andReturn([
                'success' => true,
                'username' => 'ISO-PAID',
                'profile' => 'Paket 200K',
            ]);
        $mikrotik->shouldReceive('disconnect')->once();

        $this->app->instance(MikroTikService::class, $mikrotik);

        $this->actingAs($user)
            ->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
                'paid_amount' => 200000,
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Pembayaran berhasil dikonfirmasi dan status isolir pelanggan dicabut.');

        $invoice->refresh();
        $customer->refresh();

        $this->assertSame('paid', $invoice->status);
        $this->assertSame('2026-07-17', optional($customer->due_date)->format('Y-m-d'));
        $this->assertFalse((bool) $customer->is_service_isolated);
        $this->assertNull($customer->service_isolated_at);
        $this->assertNull($customer->service_isolated_by);
        $this->assertNull($customer->isolation_restore_profile);

        $this->assertDatabaseHas('system_audit_logs', [
            'event_type' => 'billing.customer_unisolated_after_payment',
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'actor_id' => $user->id,
        ]);
    }

    public function test_confirm_payment_still_marks_invoice_paid_when_isolation_restore_fails(): void
    {
        Carbon::setTestNow('2026-06-17 10:00:00');

        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Missing Secret Customer',
            'phone' => '081200000004',
            'pppoe_username' => 'ISO-MISSING',
            'is_active' => true,
            'due_date' => '2026-05-26',
            'is_service_isolated' => true,
            'service_isolated_at' => '2026-06-15 08:00:00',
            'service_isolated_by' => $user->id,
            'isolation_restore_profile' => 'Paket 200K',
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-06-17',
            'due_date' => '2026-06-17',
            'amount' => 200000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-isolated-restore-failed',
        ]);

        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('connect')->once();
        $mikrotik->shouldReceive('getPPPoESecret')
            ->once()
            ->with('ISO-MISSING')
            ->andReturn([
                'id' => '*3',
                'name' => 'ISO-MISSING',
                'profile' => 'Isolir',
            ]);
        $mikrotik->shouldReceive('command')
            ->once()
            ->with('/ppp/profile/print')
            ->andReturn([
                ['name' => 'Paket 200K'],
                ['name' => 'Isolir'],
            ]);
        $mikrotik->shouldReceive('unrestrictUser')
            ->once()
            ->with('ISO-MISSING', 'Paket 200K')
            ->andThrow(new \Exception('Secret not found for username: ISO-MISSING'));
        $mikrotik->shouldReceive('disconnect')->once();

        $this->app->instance(MikroTikService::class, $mikrotik);

        $response = $this->actingAs($user)
            ->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
                'paid_amount' => 200000,
            ])
            ->assertOk();

        $responseMessage = (string) $response->json('message');
        $this->assertStringContainsString('Pembayaran berhasil dikonfirmasi', $responseMessage);
        $this->assertStringContainsString('status isolir belum bisa dicabut otomatis', $responseMessage);
        $this->assertStringContainsString('Secret not found for username: ISO-MISSING', $responseMessage);

        $invoice->refresh();
        $customer->refresh();

        $this->assertSame('paid', $invoice->status);
        $this->assertNotNull($invoice->paid_at);
        $this->assertSame('2026-07-17', optional($customer->due_date)->format('Y-m-d'));
        $this->assertTrue((bool) $customer->is_service_isolated);
        $this->assertSame('Paket 200K', $customer->isolation_restore_profile);

        $this->assertTrue(FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->exists());

        $this->assertDatabaseHas('system_audit_logs', [
            'event_type' => 'billing.customer_unisolation_failed_after_payment',
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'actor_id' => $user->id,
        ]);
    }

    public function test_confirm_payment_for_non_isolated_customer_uses_previous_due_date_even_if_overdue(): void
    {
        Carbon::setTestNow('2026-06-17 10:00:00');

        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'can_confirm_payments' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Regular Customer',
            'phone' => '081200000003',
            'is_active' => true,
            'due_date' => '2026-05-26',
            'is_service_isolated' => false,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-06-17',
            'due_date' => '2026-06-17',
            'amount' => 175000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-regular-paid',
        ]);

        $this->actingAs($user)
            ->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
                'paid_amount' => 175000,
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Pembayaran berhasil dikonfirmasi');

        $customer->refresh();
        $invoice->refresh();

        $this->assertSame('paid', $invoice->status);
        $this->assertSame('2026-06-25', optional($customer->due_date)->format('Y-m-d'));
        $this->assertFalse((bool) $customer->is_service_isolated);
    }
}

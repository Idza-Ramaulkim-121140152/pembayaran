<?php

namespace Tests\Feature;

use App\Models\BillingPaymentCapture;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\User;
use App\Services\BillingDunningService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingCustomerAutomationTest extends TestCase
{
    use RefreshDatabase;

    public function test_superadmin_can_toggle_customer_automation(): void
    {
        $superadmin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $customer = Customer::create([
            'name' => 'Customer Toggle',
            'phone' => '081234567890',
            'pppoe_username' => 'TOGGLE-001',
            'is_active' => true,
            'due_date' => now()->toDateString(),
            'billing_auto_disabled' => false,
        ]);

        $this->actingAs($superadmin)
            ->putJson('/api/billing/customers/' . $customer->id . '/automation', [
                'billing_auto_disabled' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.customer_id', $customer->id)
            ->assertJsonPath('data.billing_auto_disabled', true);

        $this->assertTrue((bool) $customer->fresh()->billing_auto_disabled);
    }

    public function test_non_superadmin_cannot_toggle_customer_automation(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = Customer::create([
            'name' => 'Customer Forbidden',
            'phone' => '081234567891',
            'pppoe_username' => 'FORBID-001',
            'is_active' => true,
            'due_date' => now()->toDateString(),
        ]);

        $this->actingAs($admin)
            ->putJson('/api/billing/customers/' . $customer->id . '/automation', [
                'billing_auto_disabled' => true,
            ])
            ->assertStatus(403);
    }

    public function test_dunning_run_skips_customer_with_auto_disabled(): void
    {
        $customer = Customer::create([
            'name' => 'Customer Dunning Skip',
            'phone' => '081234567892',
            'pppoe_username' => 'DUNNING-001',
            'is_active' => true,
            'due_date' => now()->toDateString(),
            'billing_auto_disabled' => true,
        ]);

        Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(3)->toDateString(),
            'amount' => 250000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-dunning-skip',
        ]);

        $summary = app(BillingDunningService::class)->run(now()->toDateString(), true);

        $this->assertSame('ok', $summary['status'] ?? null);
        $this->assertSame(1, (int) ($summary['skipped_auto_disabled'] ?? 0));
    }

    public function test_confirm_payment_does_not_send_auto_notification_for_auto_disabled_customer(): void
    {
        $superadmin = User::factory()->create([
            'role' => User::ROLE_SUPERADMIN,
        ]);

        $customer = Customer::create([
            'name' => 'Customer No Auto Notify',
            'phone' => '081234567893',
            'pppoe_username' => null,
            'is_active' => true,
            'due_date' => now()->toDateString(),
            'billing_auto_disabled' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 300000,
            'status' => 'menunggu konfirmasi',
            'invoice_link' => 'inv-no-auto-notif',
        ]);

        $this->actingAs($superadmin)
            ->postJson('/api/billing/invoice/' . $invoice->id . '/confirm', [
                'paid_amount' => 300000,
            ])
            ->assertOk();

        $autoConfirmCount = NotificationLog::query()
            ->where('customer_id', $customer->id)
            ->where('message', 'like', '[AUTO]%')
            ->count();

        $this->assertSame(0, $autoConfirmCount);
    }

    public function test_run_match_auto_apply_skips_auto_approval_for_auto_disabled_customer(): void
    {
        $superadmin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $customer = Customer::create([
            'name' => 'Customer Match Skip',
            'phone' => '081234567894',
            'pppoe_username' => 'MATCH-001',
            'is_active' => true,
            'due_date' => now()->toDateString(),
            'billing_auto_disabled' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-match-skip',
        ]);

        $capture = BillingPaymentCapture::query()->create([
            'source' => 'manual_test',
            'invoice_id' => $invoice->id,
            'customer_id' => $customer->id,
            'amount' => 200000,
            'paid_date' => now()->toDateString(),
            'reference_code' => 'ref-match-skip',
            'fingerprint' => 'fp-match-skip-001',
            'match_status' => 'pending',
            'meta' => [],
        ]);

        $this->actingAs($superadmin)
            ->postJson('/api/billing/payments/match', [
                'capture_id' => $capture->id,
                'auto_apply' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.skipped_auto_disabled', 1);

        $capture->refresh();
        $this->assertSame('needs_review', $capture->match_status);
    }
}

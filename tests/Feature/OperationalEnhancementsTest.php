<?php

namespace Tests\Feature;

use App\Models\Complaint;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NetworkIncident;
use App\Models\NetworkNotice;
use App\Models\Odp;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OperationalEnhancementsTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_self_service_dashboard_exposes_payment_history_tickets_and_notices(): void
    {
        $customer = Customer::create([
            'name' => 'Portal V2 Customer',
            'phone' => '081111111111',
            'pppoe_username' => null,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->toDateString(),
            'amount' => 150000,
            'status' => 'paid',
            'paid_at' => now(),
            'invoice_link' => 'inv-paid-v2',
        ]);

        $complaint = Complaint::create([
            'customer_id' => $customer->id,
            'subject' => 'Internet lambat',
            'message' => 'Mohon dicek.',
            'category' => 'gangguan',
            'status' => 'pending',
            'priority' => 'medium',
        ]);
        $complaint->events()->create([
            'event_type' => 'reply',
            'message' => 'Kami cek dari NOC.',
            'is_internal' => false,
        ]);
        $complaint->events()->create([
            'event_type' => 'comment',
            'message' => 'Catatan internal teknisi.',
            'is_internal' => true,
        ]);

        NetworkNotice::create([
            'title' => 'Gangguan Area',
            'message' => 'Ada gangguan.',
            'type' => 'gangguan',
            'severity' => 'high',
            'is_mass' => true,
            'is_active' => true,
        ]);

        $response = $this
            ->withSession(['customer_id' => $customer->id, 'customer_logged_in' => true])
            ->getJson('/api/customer/dashboard');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'payment_history')
            ->assertJsonCount(1, 'tickets')
            ->assertJsonCount(1, 'tickets.0.public_ticket_events')
            ->assertJsonCount(1, 'network_notices');

        $this->assertSame('Kami cek dari NOC.', $response->json('tickets.0.public_ticket_events.0.message'));
    }

    public function test_customer_dashboard_still_reports_must_change_password_flag_as_information(): void
    {
        $customer = Customer::create([
            'name' => 'Must Change Info Customer',
            'phone' => '082222222221',
            'pppoe_username' => null,
            'due_date' => now()->toDateString(),
            'is_active' => true,
            'mobile_force_password_change' => true,
        ]);

        $this
            ->withSession(['customer_id' => $customer->id, 'customer_logged_in' => true])
            ->getJson('/api/customer/dashboard')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('must_change_password', true);
    }

    public function test_customer_required_password_change_no_longer_blocks_complaints(): void
    {
        $customer = Customer::create([
            'name' => 'Must Change Customer',
            'phone' => '082222222222',
            'pppoe_username' => null,
            'due_date' => now()->toDateString(),
            'is_active' => true,
            'mobile_force_password_change' => true,
        ]);

        $this
            ->withSession(['customer_id' => $customer->id, 'customer_logged_in' => true])
            ->postJson('/api/customer/complaint', [
                'subject' => 'Test',
                'message' => 'Test',
                'category' => 'gangguan',
            ])
            ->assertCreated()
            ->assertJsonPath('success', true);
    }

    public function test_customer_required_password_change_no_longer_blocks_profile_payment_and_auto_message_actions(): void
    {
        $customer = Customer::create([
            'name' => 'Portal Action Customer',
            'phone' => '082222222223',
            'pppoe_username' => null,
            'due_date' => now()->toDateString(),
            'is_active' => true,
            'mobile_force_password_change' => true,
            'billing_auto_disabled' => false,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(5)->toDateString(),
            'amount' => 175000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-portal-open',
        ]);

        $session = ['customer_id' => $customer->id, 'customer_logged_in' => true];

        $this
            ->withSession($session)
            ->patchJson('/api/customer/profile', [
                'phone' => '082222222224',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.phone', '082222222224');

        $this
            ->withSession($session)
            ->patchJson('/api/customer/auto-message', [
                'billing_auto_disabled' => true,
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.billing_auto_disabled', true);

        $this
            ->withSession($session)
            ->postJson('/api/customer/payments/confirm', [
                'invoice_id' => $invoice->id,
                'paid_amount' => 175000,
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $customer->refresh();
        $invoice->refresh();

        $this->assertSame('082222222224', $customer->phone);
        $this->assertTrue((bool) $customer->billing_auto_disabled);
        $this->assertSame('menunggu konfirmasi', $invoice->status);
    }

    public function test_sla_live_board_groups_breached_ticket(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $customer = Customer::create([
            'name' => 'SLA Customer',
            'phone' => '083333333333',
            'due_date' => now()->toDateString(),
        ]);

        Complaint::create([
            'customer_id' => $customer->id,
            'subject' => 'SLA Breach',
            'message' => 'Breach',
            'category' => 'gangguan',
            'status' => 'pending',
            'priority' => 'high',
            'opened_at' => now()->subHours(3),
            'sla_first_response_due_at' => now()->subHour(),
            'sla_resolution_due_at' => now()->addHour(),
        ]);

        $this->actingAs($user)
            ->getJson('/api/complaints/sla-live')
            ->assertOk()
            ->assertJsonPath('data.summary.breached_total', 1)
            ->assertJsonCount(1, 'data.breached');
    }

    public function test_incident_transition_records_mtta_metadata(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $odp = Odp::create(['nama' => 'ODP-TEST', 'rasio_distribusi' => '1:8']);
        $incident = NetworkIncident::create([
            'title' => 'Incident Test',
            'severity' => 'high',
            'status' => 'open',
            'started_at' => now()->subMinutes(10),
            'detected_by' => 'manual',
        ]);
        $incident->odps()->sync([$odp->id]);

        $this->actingAs($user)
            ->postJson("/api/network-incidents/{$incident->id}/acknowledge", ['note' => 'Diterima NOC'])
            ->assertOk()
            ->assertJsonPath('data.status', 'acknowledged');

        $this->assertNotNull($incident->fresh()->meta['mtta_minutes'] ?? null);
    }

    public function test_odp_quality_score_reports_unmapped_customer_issue(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        Odp::create(['nama' => 'ODP-MAPPED', 'rasio_distribusi' => '1:8']);
        Customer::create([
            'name' => 'Unmapped Customer',
            'phone' => '084444444444',
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        $response = $this->actingAs($user)->getJson('/api/odp-mapping/quality-audit');

        $response->assertOk();
        $this->assertGreaterThan(0, collect($response->json('data.issues'))->firstWhere('key', 'unmapped_customers')['count']);
    }
}

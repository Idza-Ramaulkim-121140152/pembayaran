<?php

namespace Tests\Feature;

use App\Models\CashObligationEntry;
use App\Models\FinancialPlanningTarget;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CashObligationCalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_finance_can_fetch_cash_obligation_calendar_with_system_and_manual_rows(): void
    {
        Carbon::setTestNow('2026-07-10 09:00:00');

        try {
            $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

            FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'Bandwidth Bulanan',
                'amount' => 450000,
                'is_recurring_monthly' => true,
                'recurrence_forever' => true,
                'is_active' => true,
                'priority' => 20,
                'meta' => [
                    'monthly_day' => 8,
                    'start_month' => '2026-05-01',
                    'confirmations' => [
                        '2026-07-08' => [
                            'actual_date' => '2026-07-08',
                            'confirmed_at' => '2026-07-08T08:00:00+07:00',
                            'notes' => 'Sudah dibayar',
                        ],
                    ],
                ],
            ]);

            FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'Sewa Tower',
                'amount' => 300000,
                'start_date' => '2026-07-01',
                'end_date' => '2026-07-05',
                'is_recurring_monthly' => false,
                'recurrence_forever' => false,
                'is_active' => true,
                'priority' => 60,
            ]);

            FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_PURCHASE_TARGET,
                'name' => 'Pembelian OLT Cadangan',
                'amount' => 1500000,
                'target_date' => '2026-07-20',
                'is_active' => true,
                'priority' => 100,
            ]);

            CashObligationEntry::query()->create([
                'title' => 'Bayar Vendor Kabel',
                'amount' => 700000,
                'due_date' => '2026-07-10',
                'category' => CashObligationEntry::CATEGORY_VENDOR,
                'priority' => CashObligationEntry::PRIORITY_HIGH,
                'status' => CashObligationEntry::STATUS_PENDING,
            ]);

            $response = $this->actingAs($user)->getJson('/api/cash-obligation-calendar?start_date=2026-07-01&end_date=2026-07-31');

            $response->assertOk()
                ->assertJsonPath('data.summary.due_today_amount', 700000)
                ->assertJsonPath('data.summary.overdue_amount', 300000)
                ->assertJsonPath('data.summary.completed_amount', 450000)
                ->assertJsonPath('data.summary.next_7_days_amount', 700000);

            $items = collect($response->json('data.items'));

            $this->assertTrue($items->contains(fn (array $item) => ($item['source_type'] ?? null) === 'mandatory_target' && ($item['display_status'] ?? null) === 'completed' && ($item['due_date'] ?? null) === '2026-07-08'));
            $this->assertTrue($items->contains(fn (array $item) => ($item['source_type'] ?? null) === 'mandatory_target' && ($item['display_status'] ?? null) === 'overdue' && ($item['due_date'] ?? null) === '2026-07-05'));
            $this->assertTrue($items->contains(fn (array $item) => ($item['source_type'] ?? null) === 'purchase_target' && ($item['due_date'] ?? null) === '2026-07-20'));
            $this->assertTrue($items->contains(fn (array $item) => ($item['source_type'] ?? null) === 'manual_entry' && ($item['due_date'] ?? null) === '2026-07-10'));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_finance_can_create_update_and_change_status_of_manual_entries(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $create = $this->actingAs($user)->postJson('/api/cash-obligation-calendar/manual-entries', [
            'title' => 'Bayar Security',
            'amount' => 250000,
            'due_date' => '2026-07-15',
            'category' => CashObligationEntry::CATEGORY_OPERATIONAL,
            'priority' => CashObligationEntry::PRIORITY_MEDIUM,
            'notes' => 'Shift malam',
        ]);

        $create->assertCreated()
            ->assertJsonPath('data.source_type', 'manual_entry')
            ->assertJsonPath('data.status', 'pending');

        $entryId = (int) CashObligationEntry::query()->value('id');

        $this->actingAs($user)->putJson("/api/cash-obligation-calendar/manual-entries/{$entryId}", [
            'title' => 'Bayar Security Revisi',
            'amount' => 300000,
            'due_date' => '2026-07-16',
            'category' => CashObligationEntry::CATEGORY_VENDOR,
            'priority' => CashObligationEntry::PRIORITY_HIGH,
            'status' => CashObligationEntry::STATUS_PENDING,
            'notes' => 'Nominal revisi',
        ])->assertOk()
            ->assertJsonPath('data.title', 'Bayar Security Revisi')
            ->assertJsonPath('data.priority', 'high');

        $this->actingAs($user)->patchJson("/api/cash-obligation-calendar/manual-entries/{$entryId}/status", [
            'status' => CashObligationEntry::STATUS_COMPLETED,
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->assertDatabaseHas('cash_obligation_entries', [
            'id' => $entryId,
            'status' => CashObligationEntry::STATUS_COMPLETED,
            'category' => CashObligationEntry::CATEGORY_VENDOR,
            'priority' => CashObligationEntry::PRIORITY_HIGH,
        ]);

        $this->actingAs($user)->deleteJson("/api/cash-obligation-calendar/manual-entries/{$entryId}")
            ->assertOk();

        $this->assertDatabaseMissing('cash_obligation_entries', ['id' => $entryId]);
    }

    public function test_non_finance_role_is_rejected_from_cash_obligation_calendar_api(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_TEKNISI]);

        $this->actingAs($user)->getJson('/api/cash-obligation-calendar')
            ->assertForbidden();
    }
}

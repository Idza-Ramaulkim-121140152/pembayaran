<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialBalanceSnapshot;
use App\Models\FinancialPlanningTarget;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DashboardPredictionOptimizationTest extends TestCase
{
    use RefreshDatabase;

    private function setPredictionEnv(string $key, ?string $value): void
    {
        if ($value === null) {
            putenv($key);
            unset($_ENV[$key], $_SERVER[$key]);
            return;
        }

        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }

    private function createStaffUser(string $role = 'superadmin'): User
    {
        return User::query()->create([
            'name' => 'Staff Test',
            'email' => $role . '.' . uniqid() . '@example.test',
            'password' => Hash::make('password'),
            'role' => $role,
        ]);
    }

    private function createPaidInvoice(Customer $customer, string $invoiceDate, int $amount, ?string $paidAt = null): Invoice
    {
        $invoiceDateValue = Carbon::parse($invoiceDate)->toDateString();
        $paidAtValue = $paidAt ? Carbon::parse($paidAt) : Carbon::parse($invoiceDate)->endOfDay();

        return Invoice::query()->create([
            'customer_id' => $customer->id,
            'invoice_date' => $invoiceDateValue,
            'due_date' => Carbon::parse($invoiceDate)->toDateString(),
            'amount' => $amount,
            'status' => 'paid',
            'invoice_link' => 'inv_' . uniqid(),
            'paid_at' => $paidAtValue,
        ]);
    }

    public function test_revenue_forecast_includes_due_health_adjustment_metadata_and_guardrails(): void
    {
        $user = $this->createStaffUser('superadmin');

        Package::query()->create([
            'name' => 'Paket A',
            'speed' => '20 Mbps',
            'price' => 250000,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $customer = Customer::query()->create([
            'name' => 'Pelanggan Forecast',
            'phone' => '081111111111',
            'due_date' => Carbon::today()->toDateString(),
            'package_type' => 'Paket A',
            'custom_package' => 'Rp250.000',
            'is_active' => true,
        ]);

        for ($i = 1; $i <= 45; $i++) {
            $date = Carbon::today()->subDays($i);
            $amount = $i % 7 === 0 ? 0 : 245000 + (($i % 5) * 5000);
            if ($amount <= 0) {
                continue;
            }

            $this->createPaidInvoice($customer, $date->toDateString(), $amount, $date->copy()->setTime(10, 0, 0)->toDateTimeString());
        }

        Cache::put(
            'dashboard:forecast:customer-health-map:' . Carbon::today()->toDateString(),
            [
                'as_of_date' => Carbon::today()->toDateString(),
                'map' => [$customer->id => 92],
                'average_score' => 92,
            ],
            now()->addMinutes(5)
        );

        $response = $this->actingAs($user)->getJson('/api/dashboard/revenue-forecast', [
            'start_date' => Carbon::today()->toDateString(),
            'end_date' => Carbon::today()->addDays(6)->toDateString(),
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.collection_adjustment.method', 'due_date_plus_health_blend_v1');
        $response->assertJsonPath('data.collection_adjustment.max_adjustment_ratio', 0.25);

        $dailyRows = $response->json('data.daily_forecast');
        $this->assertIsArray($dailyRows);
        $this->assertNotEmpty($dailyRows);

        foreach ($dailyRows as $row) {
            $ratio = (float) data_get($row, 'components.due_health_adjustment_ratio_percent', 0);
            $this->assertLessThanOrEqual(25.01, $ratio);
            $this->assertGreaterThanOrEqual(-25.01, $ratio);
            $this->assertArrayHasKey('due_health_expected_collection', $row['components']);
            $this->assertArrayHasKey('baseline_predicted_revenue', $row['components']);
        }
    }

    public function test_financial_projection_exposes_actual_balance_today_and_ai_uses_it(): void
    {
        $user = $this->createStaffUser('superadmin');

        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income kemarin',
            'amount' => 1000,
            'transaction_date' => Carbon::today()->subDay()->toDateString(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'expense',
            'source' => 'manual_expense',
            'category' => 'manual',
            'description' => 'Expense hari ini',
            'amount' => 200,
            'transaction_date' => Carbon::today()->toDateString(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'adjustment',
            'source' => 'manual_adjustment',
            'category' => 'manual',
            'description' => 'Adjustment besok',
            'amount' => 500,
            'transaction_date' => Carbon::today()->addDay()->toDateString(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/dashboard/financial-projection', [
            'start_date' => Carbon::today()->startOfMonth()->toDateString(),
            'end_date' => Carbon::today()->endOfMonth()->toDateString(),
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.summary.actual_balance_today', 800);
        $response->assertJsonPath('data.summary.actual_balance_today_date', Carbon::today()->toDateString());
        $response->assertJsonPath('data.summary.actual_balance_today_source', 'ledger_as_of_today');

        $keyFindings = $response->json('data.ai_assistant.key_findings');
        $this->assertIsArray($keyFindings);
        $this->assertNotEmpty($keyFindings);
        $this->assertTrue(
            collect($keyFindings)->contains(function ($text) {
                return str_contains((string) $text, 'Saldo aktual per');
            })
        );

        $todayRow = collect($response->json('data.daily_projection'))
            ->firstWhere('date', Carbon::today()->toDateString());
        $this->assertNotNull($todayRow);
        $this->assertSame(800, (int) ($todayRow['chart_balance'] ?? -1));
        $this->assertSame('actual_today', (string) ($todayRow['chart_balance_source'] ?? ''));
        $this->assertSame(200, (int) ($todayRow['daily_total_expense'] ?? -1));
        $this->assertSame('ledger_actual', (string) ($todayRow['daily_total_expense_source'] ?? ''));
    }

    public function test_snapshot_balance_command_captures_as_of_date_balance(): void
    {
        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income kemarin',
            'amount' => 1000,
            'transaction_date' => Carbon::today()->subDay()->toDateString(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'expense',
            'source' => 'manual_expense',
            'category' => 'manual',
            'description' => 'Expense hari ini',
            'amount' => 200,
            'transaction_date' => Carbon::today()->toDateString(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income besok',
            'amount' => 500,
            'transaction_date' => Carbon::today()->addDay()->toDateString(),
        ]);

        $this->artisan('finance:snapshot-balance', [
            '--date' => Carbon::today()->toDateString(),
        ])->assertSuccessful();

        $snapshot = FinancialBalanceSnapshot::query()
            ->whereDate('snapshot_date', Carbon::today()->toDateString())
            ->first();

        $this->assertNotNull($snapshot);
        $this->assertSame(800, (int) round((float) ($snapshot->closing_balance ?? 0)));
    }

    public function test_snapshot_backfill_command_generates_rows_for_requested_days(): void
    {
        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income hari ini',
            'amount' => 1000,
            'transaction_date' => Carbon::today()->toDateString(),
        ]);

        $this->artisan('finance:snapshot-backfill', [
            '--days' => 3,
        ])->assertSuccessful();

        $this->assertSame(3, FinancialBalanceSnapshot::query()->count());
        $this->assertDatabaseHas('financial_balance_snapshots', [
            'snapshot_date' => Carbon::today()->toDateString(),
        ]);
        $this->assertDatabaseHas('financial_balance_snapshots', [
            'snapshot_date' => Carbon::today()->subDays(2)->toDateString(),
        ]);
    }

    public function test_dashboard_finance_summary_balance_uses_as_of_today(): void
    {
        $user = $this->createStaffUser('superadmin');

        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income kemarin',
            'amount' => 1000,
            'transaction_date' => Carbon::today()->subDay()->toDateString(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'expense',
            'source' => 'manual_expense',
            'category' => 'manual',
            'description' => 'Expense hari ini',
            'amount' => 300,
            'transaction_date' => Carbon::today()->toDateString(),
        ]);
        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income masa depan',
            'amount' => 700,
            'transaction_date' => Carbon::today()->addDay()->toDateString(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/dashboard');
        $response->assertOk();
        $response->assertJsonPath('data.finance_summary.balance', 700);
    }

    public function test_financial_projection_uses_snapshot_for_past_and_forecast_for_future_chart_balance(): void
    {
        $user = $this->createStaffUser('superadmin');
        $yesterday = Carbon::today()->subDay()->toDateString();
        $today = Carbon::today()->toDateString();
        $tomorrow = Carbon::today()->addDay()->toDateString();

        FinancialTransaction::query()->create([
            'type' => 'income',
            'source' => 'manual_income',
            'category' => 'manual',
            'description' => 'Income kemarin',
            'amount' => 1000,
            'transaction_date' => $yesterday,
        ]);
        FinancialTransaction::query()->create([
            'type' => 'expense',
            'source' => 'manual_expense',
            'category' => 'manual',
            'description' => 'Expense hari ini',
            'amount' => 200,
            'transaction_date' => $today,
        ]);

        FinancialBalanceSnapshot::query()->create([
            'snapshot_date' => $yesterday,
            'closing_balance' => 999,
            'total_income' => 1000,
            'total_expense' => 1,
            'total_adjustment' => 0,
            'captured_at' => now(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/dashboard/financial-projection', [
            'start_date' => $yesterday,
            'end_date' => $tomorrow,
        ]);
        $response->assertOk();

        $rows = collect($response->json('data.daily_projection'));
        $yesterdayRow = $rows->firstWhere('date', $yesterday);
        $todayRow = $rows->firstWhere('date', $today);
        $tomorrowRow = $rows->firstWhere('date', $tomorrow);

        $this->assertNotNull($yesterdayRow);
        $this->assertNotNull($todayRow);
        $this->assertNotNull($tomorrowRow);

        $this->assertSame(999, (int) ($yesterdayRow['chart_balance'] ?? 0));
        $this->assertSame('snapshot', (string) ($yesterdayRow['chart_balance_source'] ?? ''));
        $this->assertSame('actual_today', (string) ($todayRow['chart_balance_source'] ?? ''));
        $this->assertSame('forecast', (string) ($tomorrowRow['chart_balance_source'] ?? ''));
        $this->assertSame(0, (int) ($yesterdayRow['daily_total_expense'] ?? -1));
        $this->assertSame('ledger_actual', (string) ($yesterdayRow['daily_total_expense_source'] ?? ''));
        $this->assertSame(200, (int) ($todayRow['daily_total_expense'] ?? -1));
        $this->assertSame('ledger_actual', (string) ($todayRow['daily_total_expense_source'] ?? ''));
        $this->assertSame(0, (int) ($tomorrowRow['daily_total_expense'] ?? -1));
        $this->assertSame('ledger_future_zero', (string) ($tomorrowRow['daily_total_expense_source'] ?? ''));
    }

    public function test_financial_projection_future_month_opening_balance_carries_forward_from_today_projection(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            Package::query()->create([
                'name' => 'Paket Continuity',
                'speed' => '50 Mbps',
                'price' => 350000,
                'is_active' => true,
                'sort_order' => 1,
            ]);

            $customer = Customer::query()->create([
                'name' => 'Pelanggan Continuity',
                'phone' => '081234567890',
                'due_date' => '15',
                'package_type' => 'Paket Continuity',
                'custom_package' => 'Rp350.000',
                'is_active' => true,
            ]);

            for ($i = 1; $i <= 75; $i++) {
                $date = Carbon::today()->subDays($i);
                $this->createPaidInvoice(
                    $customer,
                    $date->toDateString(),
                    340000 + (($i % 5) * 10000),
                    $date->copy()->setTime(9, 30, 0)->toDateTimeString()
                );
            }

            FinancialTransaction::query()->create([
                'type' => 'income',
                'source' => 'manual_income',
                'category' => 'manual',
                'description' => 'Modal awal Mei',
                'amount' => 10000000,
                'transaction_date' => '2026-05-10',
            ]);
            FinancialTransaction::query()->create([
                'type' => 'expense',
                'source' => 'manual_expense',
                'category' => 'manual',
                'description' => 'Pengeluaran hari ini',
                'amount' => 500000,
                'transaction_date' => '2026-05-18',
            ]);

            $bridge = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-05-18&end_date=2026-05-31');
            $bridge->assertOk();

            $juneOnly = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-06-01&end_date=2026-06-30');
            $juneOnly->assertOk();

            $this->assertSame(
                (int) $bridge->json('data.summary.projected_ending_balance'),
                (int) $juneOnly->json('data.summary.opening_balance')
            );
            $this->assertSame(
                '2026-06-01',
                (string) $juneOnly->json('data.range.start_date')
            );

            $ledgerOpeningBeforeJune = 9500000;
            $this->assertNotSame(
                $ledgerOpeningBeforeJune,
                (int) $juneOnly->json('data.summary.opening_balance')
            );
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_purchase_goal_prediction_date_is_stable_across_month_filters_and_actionable_matches_can_execute_now(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            Package::query()->create([
                'name' => 'Paket Stabil',
                'speed' => '30 Mbps',
                'price' => 300000,
                'is_active' => true,
                'sort_order' => 1,
            ]);

            $customer = Customer::query()->create([
                'name' => 'Pelanggan Stabil',
                'phone' => '081000000001',
                'due_date' => '10',
                'package_type' => 'Paket Stabil',
                'custom_package' => 'Rp300.000',
                'is_active' => true,
            ]);

            for ($i = 1; $i <= 60; $i++) {
                $date = Carbon::today()->subDays($i);
                $this->createPaidInvoice(
                    $customer,
                    $date->toDateString(),
                    280000 + (($i % 4) * 15000),
                    $date->copy()->setTime(10, 0, 0)->toDateTimeString()
                );
            }

            FinancialTransaction::query()->create([
                'type' => 'income',
                'source' => 'manual_income',
                'category' => 'manual',
                'description' => 'Saldo awal stabil',
                'amount' => 12000000,
                'transaction_date' => Carbon::today()->toDateString(),
            ]);

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_PURCHASE_TARGET,
                'name' => 'UPS Stabil',
                'description' => 'Target stabilitas prediksi',
                'amount' => 4500000,
                'target_date' => null,
                'start_date' => null,
                'end_date' => null,
                'is_recurring_monthly' => false,
                'recurrence_until' => null,
                'recurrence_forever' => false,
                'is_active' => true,
                'priority' => 100,
                'meta' => null,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $mayResponse = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-05-01&end_date=2026-05-31');
            $mayResponse->assertOk();
            $juneResponse = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-06-01&end_date=2026-06-30');
            $juneResponse->assertOk();

            $mayGoal = collect($mayResponse->json('data.purchase_goals'))->firstWhere('id', $target->id);
            $juneGoal = collect($juneResponse->json('data.purchase_goals'))->firstWhere('id', $target->id);

            $this->assertNotNull($mayGoal);
            $this->assertNotNull($juneGoal);
            $this->assertSame($mayGoal['predicted_buy_date'] ?? null, $juneGoal['predicted_buy_date'] ?? null);
            $this->assertSame((bool) ($mayGoal['can_execute_now'] ?? false), (bool) ($juneGoal['can_execute_now'] ?? false));
            $this->assertTrue((bool) ($mayGoal['is_actionable'] ?? false));
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_fulfill_purchase_goal_preview_returns_risk_rows_and_does_not_deactivate_target(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'Sewa POP',
                'description' => 'Wajib bulanan',
                'amount' => 1500000,
                'is_recurring_monthly' => true,
                'recurrence_forever' => true,
                'is_active' => true,
                'priority' => 1,
                'meta' => [
                    'monthly_day' => 12,
                    'start_month' => '2026-05-01',
                ],
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);
            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'Backhaul',
                'description' => 'Wajib bulanan',
                'amount' => 2000000,
                'is_recurring_monthly' => true,
                'recurrence_forever' => true,
                'is_active' => true,
                'priority' => 2,
                'meta' => [
                    'monthly_day' => 25,
                    'start_month' => '2026-05-01',
                ],
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            FinancialTransaction::query()->create([
                'type' => 'income',
                'source' => 'manual_income',
                'category' => 'manual',
                'description' => 'Saldo kecil',
                'amount' => 100000,
                'transaction_date' => Carbon::today()->toDateString(),
            ]);

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_PURCHASE_TARGET,
                'name' => 'Splicer Besar',
                'description' => 'Target yang belum aman',
                'amount' => 10000000,
                'is_active' => true,
                'priority' => 100,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $response = $this->actingAs($user)->postJson('/api/dashboard/financial-projection/purchase-goals/fulfill', [
                'target_id' => $target->id,
                'preview_only' => true,
            ]);

            $response->assertOk();
            $response->assertJsonPath('data.target_id', $target->id);
            $response->assertJsonPath('data.target_name', 'Splicer Besar');
            $rows = collect($response->json('data.risk_rows'));
            $this->assertGreaterThan(2, $rows->count());
            $this->assertTrue($rows->contains(fn ($row) => array_key_exists('total_balance_before', (array) $row)));
            $this->assertTrue($rows->contains(fn ($row) => array_key_exists('free_balance_after_purchase', (array) $row)));

            $this->assertDatabaseHas('financial_planning_targets', [
                'id' => $target->id,
                'is_active' => true,
            ]);
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_fulfill_purchase_goal_succeeds_even_when_free_balance_is_not_ready(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            FinancialTransaction::query()->create([
                'type' => 'income',
                'source' => 'manual_income',
                'category' => 'manual',
                'description' => 'Saldo minim',
                'amount' => 150000,
                'transaction_date' => Carbon::today()->toDateString(),
            ]);

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_PURCHASE_TARGET,
                'name' => 'UPS Tetap Jalan',
                'description' => 'Target tetap bisa dieksekusi',
                'amount' => 2500000,
                'is_active' => true,
                'priority' => 100,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $projection = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-05-01&end_date=2026-05-31');
            $projection->assertOk();
            $goal = collect($projection->json('data.purchase_goals'))->firstWhere('id', $target->id);
            $this->assertNotNull($goal);
            $this->assertFalse((bool) ($goal['can_execute_now'] ?? true));

            $response = $this->actingAs($user)->postJson('/api/dashboard/financial-projection/purchase-goals/fulfill', [
                'target_id' => $target->id,
                'preview_only' => false,
            ]);

            $response->assertOk();
            $this->assertDatabaseHas('financial_planning_targets', [
                'id' => $target->id,
                'is_active' => false,
            ]);
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_confirm_mandatory_execution_defaults_actual_date_to_due_date_when_missing(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'Bandwidth',
                'description' => 'Wajib bulanan',
                'amount' => 16912500,
                'target_date' => null,
                'start_date' => null,
                'end_date' => null,
                'is_recurring_monthly' => true,
                'recurrence_until' => null,
                'recurrence_forever' => true,
                'is_active' => true,
                'priority' => 1,
                'meta' => [
                    'monthly_day' => 14,
                    'start_month' => '2026-05-01',
                ],
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $response = $this->actingAs($user)->postJson('/api/dashboard/financial-projection/mandatory-events/confirm', [
                'target_id' => $target->id,
                'due_date' => '2026-06-14',
                'amount' => 16912500,
            ]);
            $response->assertOk();
            $response->assertJsonPath('data.due_date', '2026-06-14');
            $response->assertJsonPath('data.actual_date', '2026-06-14');

            $projection = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-06-01&end_date=2026-06-30');
            $projection->assertOk();
            $rows = collect($projection->json('data.daily_projection'));
            $dueRow = $rows->firstWhere('date', '2026-06-14');
            $nextRow = $rows->firstWhere('date', '2026-06-15');

            $this->assertNotNull($dueRow);
            $this->assertNotNull($nextRow);
            $this->assertSame(0, (int) ($dueRow['confirmed_monthly_allocation_accumulated'] ?? -1));
            $this->assertGreaterThan(0, (int) ($nextRow['confirmed_monthly_allocation_accumulated'] ?? 0));
            $this->assertLessThan(16912500, (int) ($nextRow['confirmed_monthly_allocation_accumulated'] ?? 0));
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_confirm_mandatory_execution_clamps_legacy_actual_date_before_due_date(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'FIF',
                'description' => 'Wajib bulanan',
                'amount' => 737000,
                'target_date' => null,
                'start_date' => null,
                'end_date' => null,
                'is_recurring_monthly' => true,
                'recurrence_until' => null,
                'recurrence_forever' => true,
                'is_active' => true,
                'priority' => 1,
                'meta' => [
                    'monthly_day' => 12,
                    'start_month' => '2026-05-01',
                ],
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $response = $this->actingAs($user)->postJson('/api/dashboard/financial-projection/mandatory-events/confirm', [
                'target_id' => $target->id,
                'due_date' => '2026-06-12',
                'actual_date' => '2026-05-18',
                'amount' => 737000,
            ]);
            $response->assertOk();
            $response->assertJsonPath('data.actual_date', '2026-05-18');

            $projection = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-06-01&end_date=2026-06-30');
            $projection->assertOk();
            $mandatoryRows = collect($projection->json('data.mandatory_expense_projection'));
            $rows = collect($projection->json('data.daily_projection'));
            $mandatoryRow = $mandatoryRows->first(function ($row) use ($target) {
                return (int) ($row['target_id'] ?? 0) === (int) $target->id
                    && (string) ($row['due_date'] ?? '') === '2026-06-12';
            });
            $dueRow = $rows->firstWhere('date', '2026-06-12');
            $nextRow = $rows->firstWhere('date', '2026-06-13');

            $this->assertNotNull($mandatoryRow);
            $this->assertNotNull($dueRow);
            $this->assertNotNull($nextRow);
            $this->assertSame('actual_date_clamped_to_due_date', (string) ($mandatoryRow['confirmation_anchor_source'] ?? ''));
            $this->assertSame('2026-06-12', (string) ($mandatoryRow['confirmation_anchor_date'] ?? ''));
            $this->assertSame(0, (int) ($dueRow['confirmed_monthly_allocation_accumulated'] ?? -1));
            $this->assertGreaterThan(0, (int) ($nextRow['confirmed_monthly_allocation_accumulated'] ?? 0));
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_confirm_mandatory_execution_respects_explicit_actual_date_on_or_after_due_date(): void
    {
        $originalNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-05-18 09:00:00'));

        try {
            $user = $this->createStaffUser('superadmin');

            $target = FinancialPlanningTarget::query()->create([
                'type' => FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                'name' => 'Server Colocation',
                'description' => 'Wajib bulanan',
                'amount' => 1200000,
                'target_date' => null,
                'start_date' => null,
                'end_date' => null,
                'is_recurring_monthly' => true,
                'recurrence_until' => null,
                'recurrence_forever' => true,
                'is_active' => true,
                'priority' => 1,
                'meta' => [
                    'monthly_day' => 12,
                    'start_month' => '2026-05-01',
                ],
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $response = $this->actingAs($user)->postJson('/api/dashboard/financial-projection/mandatory-events/confirm', [
                'target_id' => $target->id,
                'due_date' => '2026-06-12',
                'actual_date' => '2026-06-16',
                'amount' => 1200000,
            ]);
            $response->assertOk();
            $response->assertJsonPath('data.actual_date', '2026-06-16');

            $projection = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-06-01&end_date=2026-06-30');
            $projection->assertOk();
            $mandatoryRows = collect($projection->json('data.mandatory_expense_projection'));
            $rows = collect($projection->json('data.daily_projection'));
            $mandatoryRow = $mandatoryRows->first(function ($row) use ($target) {
                return (int) ($row['target_id'] ?? 0) === (int) $target->id
                    && (string) ($row['due_date'] ?? '') === '2026-06-12';
            });
            $anchorRow = $rows->firstWhere('date', '2026-06-16');
            $afterAnchorRow = $rows->firstWhere('date', '2026-06-17');

            $this->assertNotNull($mandatoryRow);
            $this->assertNotNull($anchorRow);
            $this->assertNotNull($afterAnchorRow);
            $this->assertSame('actual_date', (string) ($mandatoryRow['confirmation_anchor_source'] ?? ''));
            $this->assertSame('2026-06-16', (string) ($mandatoryRow['confirmation_anchor_date'] ?? ''));
            $this->assertSame(0, (int) ($anchorRow['confirmed_monthly_allocation_accumulated'] ?? -1));
            $this->assertGreaterThan(0, (int) ($afterAnchorRow['confirmed_monthly_allocation_accumulated'] ?? 0));
        } finally {
            Carbon::setTestNow($originalNow);
        }
    }

    public function test_revenue_forecast_marks_collection_adjustment_disabled_via_env_toggle(): void
    {
        $user = $this->createStaffUser('superadmin');
        $this->setPredictionEnv('PREDICTION_DUE_HEALTH_ADJUSTMENT_ENABLED', 'false');
        $this->setPredictionEnv('PREDICTION_DUE_HEALTH_FORCE_FAILURE', null);

        try {
            $response = $this->actingAs($user)->getJson('/api/dashboard/revenue-forecast', [
                'start_date' => Carbon::today()->toDateString(),
                'end_date' => Carbon::today()->addDays(6)->toDateString(),
            ]);

            $response->assertOk();
            $response->assertJsonPath('data.collection_adjustment.enabled', false);
            $response->assertJsonPath('data.collection_adjustment.status', 'disabled');
            $response->assertJsonPath('data.collection_adjustment.reason', 'disabled_by_env');
        } finally {
            $this->setPredictionEnv('PREDICTION_DUE_HEALTH_ADJUSTMENT_ENABLED', null);
            $this->setPredictionEnv('PREDICTION_DUE_HEALTH_FORCE_FAILURE', null);
        }
    }

    public function test_due_health_failure_falls_back_and_prediction_endpoints_stay_available(): void
    {
        $user = $this->createStaffUser('superadmin');
        $this->setPredictionEnv('PREDICTION_DUE_HEALTH_ADJUSTMENT_ENABLED', 'true');
        $this->setPredictionEnv('PREDICTION_DUE_HEALTH_FORCE_FAILURE', 'true');

        try {
            $revenue = $this->actingAs($user)->getJson('/api/dashboard/revenue-forecast', [
                'start_date' => Carbon::today()->toDateString(),
                'end_date' => Carbon::today()->addDays(6)->toDateString(),
            ]);
            $revenue->assertOk();
            $revenue->assertJsonPath('data.collection_adjustment.status', 'fallback');
            $revenue->assertJsonPath('data.collection_adjustment.reason', 'adjustment_error');

            $projection = $this->actingAs($user)->getJson('/api/dashboard/financial-projection', [
                'start_date' => Carbon::today()->startOfMonth()->toDateString(),
                'end_date' => Carbon::today()->endOfMonth()->toDateString(),
            ]);
            $projection->assertOk();

            $isp = $this->actingAs($user)->getJson('/api/dashboard/isp-intelligence', [
                'start_date' => Carbon::today()->subDays(29)->toDateString(),
                'end_date' => Carbon::today()->toDateString(),
            ]);
            $isp->assertOk();
        } finally {
            $this->setPredictionEnv('PREDICTION_DUE_HEALTH_ADJUSTMENT_ENABLED', null);
            $this->setPredictionEnv('PREDICTION_DUE_HEALTH_FORCE_FAILURE', null);
        }
    }
}

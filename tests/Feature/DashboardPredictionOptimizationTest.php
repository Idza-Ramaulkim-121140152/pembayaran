<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialBalanceSnapshot;
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

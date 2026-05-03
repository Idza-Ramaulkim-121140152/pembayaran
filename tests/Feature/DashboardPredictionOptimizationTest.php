<?php

namespace Tests\Feature;

use App\Models\Customer;
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
    }
}

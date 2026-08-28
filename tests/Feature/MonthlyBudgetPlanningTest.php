<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\BorrowerLoanPayment;
use App\Models\FinancialTransaction;
use App\Models\MonthlyBudget;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MonthlyBudgetPlanningTest extends TestCase
{
    use RefreshDatabase;

    public function test_finance_can_create_fetch_and_update_monthly_budget(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $payload = [
            'month' => '2026-07',
            'notes' => 'Budget Juli',
            'items' => [
                ['category_key' => 'invoice_income', 'target_amount' => 200000],
                ['category_key' => 'non_invoice_income', 'target_amount' => 15000],
                ['category_key' => 'mandatory_expense', 'target_amount' => 40000],
                ['category_key' => 'operational_expense', 'target_amount' => 30000],
                ['category_key' => 'payroll_expense', 'target_amount' => 25000],
                ['category_key' => 'purchase_investment', 'target_amount' => 10000],
                ['category_key' => 'loan_settlement', 'target_amount' => 5000],
                ['category_key' => 'minimum_cash_reserve', 'target_amount' => 50000],
            ],
        ];

        $create = $this->actingAs($user)->postJson('/api/monthly-budgets', $payload);
        $create->assertCreated()
            ->assertJsonPath('data.status', 'configured')
            ->assertJsonPath('data.month', '2026-07')
            ->assertJsonCount(8, 'data.items');

        $budgetId = (int) MonthlyBudget::query()->value('id');

        $this->actingAs($user)->getJson('/api/monthly-budgets?month=2026-07')
            ->assertOk()
            ->assertJsonPath('data.id', $budgetId)
            ->assertJsonPath('data.items.0.category_key', 'invoice_income');

        $this->actingAs($user)->putJson("/api/monthly-budgets/{$budgetId}", [
            'notes' => 'Budget Juli revisi',
            'items' => [
                ['category_key' => 'invoice_income', 'target_amount' => 220000],
                ['category_key' => 'non_invoice_income', 'target_amount' => 18000],
                ['category_key' => 'mandatory_expense', 'target_amount' => 45000],
                ['category_key' => 'operational_expense', 'target_amount' => 35000],
                ['category_key' => 'payroll_expense', 'target_amount' => 27000],
                ['category_key' => 'purchase_investment', 'target_amount' => 15000],
                ['category_key' => 'loan_settlement', 'target_amount' => 8000],
                ['category_key' => 'minimum_cash_reserve', 'target_amount' => 55000],
            ],
        ])->assertOk()
            ->assertJsonPath('data.notes', 'Budget Juli revisi');

        $this->assertDatabaseHas('monthly_budget_items', [
            'monthly_budget_id' => $budgetId,
            'category_key' => 'invoice_income',
            'target_amount' => 220000,
        ]);
    }

    public function test_financial_projection_returns_budget_and_cash_position_adjusted_by_loans(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $this->createBudgetForMonth('2026-07');

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'category' => 'pembayaran',
            'description' => 'Pembayaran invoice',
            'amount' => 150000,
            'transaction_date' => '2026-07-10',
        ]);

        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Budget',
            'mapped_user_id' => $user->id,
            'is_active' => true,
        ]);

        BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => '2026-07-05 09:00:00',
        ]);

        $response = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-07-01&end_date=2026-07-31');

        $response->assertOk()
            ->assertJsonPath('data.monthly_budget.status', 'configured')
            ->assertJsonPath('data.monthly_budget_summary.configuration_status', 'configured')
            ->assertJsonPath('data.cash_position.loan_outstanding', 100000)
            ->assertJsonPath('data.cash_position.reserve_status', 'configured');

        $ledgerBalance = (int) data_get($response->json(), 'data.cash_position.ledger_balance', 0);
        $availableCash = (int) data_get($response->json(), 'data.cash_position.available_cash', 0);

        $this->assertSame($ledgerBalance - 100000, $availableCash);
    }

    public function test_month_without_manual_budget_returns_system_generated_guardrail(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-10 09:00:00'));

        try {
            $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

            FinancialTransaction::create([
                'type' => 'income',
                'source' => 'invoice_payment',
                'category' => 'pembayaran',
                'description' => 'Pembayaran invoice',
                'amount' => 300000,
                'transaction_date' => '2026-07-09',
            ]);

            FinancialTransaction::create([
                'type' => 'expense',
                'source' => 'payroll',
                'category' => 'payroll',
                'description' => 'Gaji teknisi',
                'amount' => 100000,
                'transaction_date' => '2026-07-08',
            ]);

            $customer = Customer::query()->create([
                'name' => 'Customer Budget Sistem',
                'phone' => '081111111111',
                'due_date' => '10',
                'package_type' => 'Paket A',
                'custom_package' => 'Rp300.000',
                'is_active' => true,
            ]);

            $this->createPaidInvoice($customer, '2026-06-08', 400000);
            $this->createPaidInvoice($customer, '2026-05-07', 200000);

            $response = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-07-01&end_date=2026-07-31');

            $response->assertOk()
                ->assertJsonPath('data.monthly_budget.status', 'system_generated')
                ->assertJsonPath('data.cash_position.reserve_source', 'system')
                ->assertJsonPath('data.cash_position.reserve_formula', 'invoice_paid_12m_average_25pct')
                ->assertJsonPath('data.cash_position.reserve_basis_months_count', 2)
                ->assertJsonPath('data.cash_position.reserve_basis_average_invoice_income', 300000)
                ->assertJsonPath('data.cash_position.reserve_basis_percentage', 25)
                ->assertJsonPath('data.cash_position.minimum_cash_reserve_target', 75000)
                ->assertJsonPath('data.system_cash_guardrail.recommended_minimum_cash_reserve', 75000);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_system_generated_reserve_uses_twelve_month_paid_invoice_window(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-12 09:00:00'));

        try {
            $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
            $customer = Customer::query()->create([
                'name' => 'Customer Reserve Window',
                'phone' => '081222222222',
                'due_date' => '10',
                'package_type' => 'Paket A',
                'custom_package' => 'Rp100.000',
                'is_active' => true,
            ]);

            for ($offset = 1; $offset <= 12; $offset++) {
                $paidDate = Carbon::parse('2026-07-01')->subMonthsNoOverflow($offset)->setDay(10);
                $this->createPaidInvoice($customer, $paidDate->toDateString(), 100000, $paidDate->setTime(10, 0)->toDateTimeString());
            }

            $oldDate = Carbon::parse('2025-06-10 10:00:00');
            $this->createPaidInvoice($customer, $oldDate->toDateString(), 999999, $oldDate->toDateTimeString());

            $response = $this->actingAs($user)->getJson('/api/dashboard/financial-projection?start_date=2026-07-01&end_date=2026-07-31');

            $response->assertOk()
                ->assertJsonPath('data.cash_position.reserve_formula', 'invoice_paid_12m_average_25pct')
                ->assertJsonPath('data.cash_position.reserve_basis_months_count', 12)
                ->assertJsonPath('data.cash_position.reserve_basis_average_invoice_income', 100000)
                ->assertJsonPath('data.cash_position.minimum_cash_reserve_target', 25000)
                ->assertJsonPath('data.system_cash_guardrail.reserve_basis_months_count', 12);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_report_summary_includes_budget_breakdown_and_loan_cash_impact(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $this->createBudgetForMonth('2026-07');

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'category' => 'pembayaran',
            'description' => 'Pembayaran invoice',
            'amount' => 100000,
            'transaction_date' => '2026-07-03',
        ]);

        FinancialTransaction::create([
            'type' => 'expense',
            'source' => 'payroll',
            'category' => 'payroll',
            'description' => 'Pembayaran gaji',
            'amount' => 25000,
            'transaction_date' => '2026-07-05',
        ]);

        $borrower = Borrower::query()->create([
            'name' => 'Peminjam Laporan',
            'mapped_user_id' => $user->id,
            'is_active' => true,
        ]);

        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 120000,
            'settled_amount' => 30000,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => '2026-07-02 09:00:00',
        ]);

        BorrowerLoanPayment::query()->create([
            'borrower_loan_id' => $loan->id,
            'amount' => 30000,
            'payment_date' => '2026-07-20',
            'received_by_user_id' => $user->id,
            'notes' => 'Pelunasan sebagian',
        ]);

        $response = $this->actingAs($user)->getJson('/api/reports/summary?month=2026-07');

        $response->assertOk()
            ->assertJsonPath('data.budget_summary.configuration_status', 'configured')
            ->assertJsonPath('data.loan_cash_impact.new_loans', 120000)
            ->assertJsonPath('data.loan_cash_impact.settlements', 30000)
            ->assertJsonPath('data.summary.net_cashflow_ledger', 75000)
            ->assertJsonPath('data.summary.net_cashflow_real', -15000);

        $budgetBreakdown = collect($response->json('data.budget_breakdown'));
        $this->assertTrue($budgetBreakdown->contains(fn ($row) => ($row['category_key'] ?? null) === 'payroll_expense'));
    }

    private function createBudgetForMonth(string $month): void
    {
        $monthlyBudget = MonthlyBudget::query()->create([
            'month' => "{$month}-01",
            'notes' => 'Budget test',
        ]);

        $monthlyBudget->items()->createMany([
            ['category_key' => 'invoice_income', 'target_amount' => 200000],
            ['category_key' => 'non_invoice_income', 'target_amount' => 20000],
            ['category_key' => 'mandatory_expense', 'target_amount' => 40000],
            ['category_key' => 'operational_expense', 'target_amount' => 30000],
            ['category_key' => 'payroll_expense', 'target_amount' => 30000],
            ['category_key' => 'purchase_investment', 'target_amount' => 15000],
            ['category_key' => 'loan_settlement', 'target_amount' => 10000],
            ['category_key' => 'minimum_cash_reserve', 'target_amount' => 50000],
        ]);
    }

    private function createPaidInvoice(Customer $customer, string $invoiceDate, int $amount, ?string $paidAt = null): Invoice
    {
        $paidAtValue = $paidAt ? Carbon::parse($paidAt) : Carbon::parse($invoiceDate)->endOfDay();

        return Invoice::query()->create([
            'customer_id' => $customer->id,
            'invoice_date' => Carbon::parse($invoiceDate)->toDateString(),
            'due_date' => Carbon::parse($invoiceDate)->toDateString(),
            'amount' => $amount,
            'status' => 'paid',
            'invoice_link' => 'INV-' . uniqid(),
            'paid_at' => $paidAtValue,
        ]);
    }
}

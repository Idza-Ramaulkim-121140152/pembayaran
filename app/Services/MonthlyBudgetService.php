<?php

namespace App\Services;

use App\Models\BorrowerLoan;
use App\Models\BorrowerLoanPayment;
use App\Models\FinancialPlanningTarget;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\MonthlyBudget;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class MonthlyBudgetService
{
    public const RESERVE_FORMULA_INVOICE_PAID_12M_AVERAGE_25PCT = 'invoice_paid_12m_average_25pct';
    public const RESERVE_BASIS_PERCENTAGE = 25;

    public const CATEGORY_INVOICE_INCOME = 'invoice_income';
    public const CATEGORY_NON_INVOICE_INCOME = 'non_invoice_income';
    public const CATEGORY_MANDATORY_EXPENSE = 'mandatory_expense';
    public const CATEGORY_OPERATIONAL_EXPENSE = 'operational_expense';
    public const CATEGORY_PAYROLL_EXPENSE = 'payroll_expense';
    public const CATEGORY_PURCHASE_INVESTMENT = 'purchase_investment';
    public const CATEGORY_LOAN_SETTLEMENT = 'loan_settlement';
    public const CATEGORY_MINIMUM_CASH_RESERVE = 'minimum_cash_reserve';

    private const CATEGORY_DEFINITIONS = [
        self::CATEGORY_INVOICE_INCOME => ['label' => 'Pemasukan Invoice', 'direction' => 'inflow'],
        self::CATEGORY_NON_INVOICE_INCOME => ['label' => 'Pemasukan Non-Invoice', 'direction' => 'inflow'],
        self::CATEGORY_MANDATORY_EXPENSE => ['label' => 'Pengeluaran Wajib', 'direction' => 'outflow'],
        self::CATEGORY_OPERATIONAL_EXPENSE => ['label' => 'Pengeluaran Operasional', 'direction' => 'outflow'],
        self::CATEGORY_PAYROLL_EXPENSE => ['label' => 'Payroll', 'direction' => 'outflow'],
        self::CATEGORY_PURCHASE_INVESTMENT => ['label' => 'Pembelian/Investasi', 'direction' => 'outflow'],
        self::CATEGORY_LOAN_SETTLEMENT => ['label' => 'Pelunasan Pinjaman', 'direction' => 'outflow'],
        self::CATEGORY_MINIMUM_CASH_RESERVE => ['label' => 'Cadangan Kas Minimum', 'direction' => 'reserve'],
    ];

    public function isReady(): bool
    {
        return Schema::hasTable('monthly_budgets') && Schema::hasTable('monthly_budget_items');
    }

    public function categoryDefinitions(): array
    {
        return collect(self::CATEGORY_DEFINITIONS)
            ->map(fn (array $definition, string $key) => ['key' => $key] + $definition)
            ->values()
            ->all();
    }

    public function categoryKeys(): array
    {
        return array_keys(self::CATEGORY_DEFINITIONS);
    }

    public function findByMonth(string $month): ?MonthlyBudget
    {
        if (!$this->isReady()) {
            return null;
        }

        $monthDate = Carbon::createFromFormat('Y-m', $month)->startOfMonth()->toDateString();

        return MonthlyBudget::query()
            ->with('items')
            ->whereDate('month', $monthDate)
            ->first();
    }

    public function serializeBudget(?MonthlyBudget $budget, string $month, array $systemRecommendation = []): array
    {
        $recommendedMap = $this->normalizeRecommendedMap($systemRecommendation['items'] ?? []);
        $confidence = (int) round((float) ($systemRecommendation['confidence'] ?? 0));
        $items = [];
        $hasOverride = false;

        foreach ($this->categoryDefinitions() as $definition) {
            $key = $definition['key'];
            $recommendedAmount = (float) ($recommendedMap[$key] ?? 0);
            $storedItem = $budget?->items?->firstWhere('category_key', $key);
            $storedTargetAmount = (float) ($storedItem->target_amount ?? 0);

            $finalActiveAmount = $storedItem
                ? (float) ($storedItem->final_active_amount ?? 0)
                : $recommendedAmount;
            $systemRecommendedAmount = $storedItem
                ? (float) ($storedItem->system_recommended_amount ?? 0)
                : $recommendedAmount;

            if ($storedItem && $finalActiveAmount <= 0 && $storedTargetAmount > 0) {
                $finalActiveAmount = $storedTargetAmount;
            }

            if ($storedItem && $systemRecommendedAmount <= 0) {
                $systemRecommendedAmount = $recommendedAmount > 0 ? $recommendedAmount : $finalActiveAmount;
            }
            $isOverridden = $storedItem
                ? (bool) ($storedItem->is_overridden ?? (abs($finalActiveAmount - $systemRecommendedAmount) > 0.01))
                : false;
            $source = $storedItem
                ? (string) ($storedItem->source ?: ($isOverridden ? 'manual_override' : 'system'))
                : ($confidence > 0 ? 'system' : 'unconfigured');

            $hasOverride = $hasOverride || $isOverridden;

            $items[] = [
                'category_key' => $key,
                'label' => $definition['label'],
                'direction' => $definition['direction'],
                'target_amount' => (int) round($finalActiveAmount),
                'system_recommended_amount' => (int) round($systemRecommendedAmount),
                'final_active_amount' => (int) round($finalActiveAmount),
                'is_overridden' => $isOverridden,
                'source' => $source,
            ];
        }

        if ($budget) {
            $status = $hasOverride ? 'manual_override' : 'configured';
        } else {
            $status = $confidence > 0 ? 'system_generated' : 'unconfigured';
        }

        return [
            'id' => $budget?->id,
            'month' => $month,
            'notes' => $budget?->notes,
            'status' => $status,
            'source' => $budget ? ($hasOverride ? 'manual_override' : 'configured') : ($confidence > 0 ? 'system' : 'unconfigured'),
            'confidence' => $confidence,
            'items' => $items,
        ];
    }

    public function normalizeItemPayload(array $items): array
    {
        $itemsByKey = collect($items)
            ->filter(fn ($item) => is_array($item) && isset($item['category_key']))
            ->mapWithKeys(function (array $item) {
                $categoryKey = (string) $item['category_key'];
                $finalActiveAmount = max(0, (float) ($item['final_active_amount'] ?? $item['target_amount'] ?? 0));
                $systemRecommendedAmount = max(0, (float) ($item['system_recommended_amount'] ?? $finalActiveAmount));
                $isOverridden = array_key_exists('is_overridden', $item)
                    ? (bool) $item['is_overridden']
                    : abs($finalActiveAmount - $systemRecommendedAmount) > 0.01;

                return [
                    $categoryKey => [
                        'category_key' => $categoryKey,
                        'target_amount' => $finalActiveAmount,
                        'system_recommended_amount' => $systemRecommendedAmount,
                        'final_active_amount' => $finalActiveAmount,
                        'is_overridden' => $isOverridden,
                        'source' => (string) ($item['source'] ?? ($isOverridden ? 'manual_override' : 'system')),
                    ],
                ];
            });

        return collect($this->categoryKeys())->map(function (string $key) use ($itemsByKey) {
            return $itemsByKey->get($key, [
                'category_key' => $key,
                'target_amount' => 0.0,
                'system_recommended_amount' => 0.0,
                'final_active_amount' => 0.0,
                'is_overridden' => false,
                'source' => 'system',
            ]);
        })->values()->all();
    }

    public function createBudget(string $month, array $items, ?string $notes, ?int $actorId): MonthlyBudget
    {
        $monthDate = Carbon::createFromFormat('Y-m', $month)->startOfMonth()->toDateString();
        $budget = MonthlyBudget::query()->create([
            'month' => $monthDate,
            'notes' => $notes,
            'created_by' => $actorId,
            'updated_by' => $actorId,
        ]);

        $budget->items()->createMany($this->normalizeItemPayload($items));

        return $budget->fresh('items');
    }

    public function updateBudget(MonthlyBudget $budget, array $items, ?string $notes, ?int $actorId): MonthlyBudget
    {
        $budget->update([
            'notes' => $notes,
            'updated_by' => $actorId,
        ]);

        $normalizedItems = collect($this->normalizeItemPayload($items))->keyBy('category_key');
        $existingItems = $budget->items()->get()->keyBy('category_key');

        foreach ($normalizedItems as $categoryKey => $item) {
            $existing = $existingItems->get($categoryKey);

            if ($existing) {
                $existing->update($item);
                continue;
            }

            $budget->items()->create($item);
        }

        return $budget->fresh('items');
    }

    public function buildInsights(Carbon $startDate, Carbon $endDate, ?array $projectionData = null): array
    {
        $month = $startDate->format('Y-m');
        $budget = $this->findByMonth($month);

        $actualRangeEnd = $endDate->copy()->lt(Carbon::today()->startOfDay())
            ? $endDate->copy()
            : $endDate->copy()->min(Carbon::today()->startOfDay());

        $actualBreakdown = $this->buildActualBreakdown($startDate->copy(), $actualRangeEnd);
        $historicalAverages = $this->buildHistoricalMonthlyAverages($startDate->copy()->startOfMonth());
        $forecastBreakdown = $this->buildForecastBreakdown($startDate->copy(), $endDate->copy(), $actualBreakdown, $projectionData);
        $loanCashImpact = $this->buildLoanCashImpact($startDate->copy(), $endDate->copy());
        $systemRecommendation = $this->buildSystemBudgetRecommendation(
            $startDate->copy(),
            $endDate->copy(),
            $actualBreakdown,
            $forecastBreakdown,
            $historicalAverages,
            $loanCashImpact,
            $projectionData
        );

        $budgetPayload = $this->serializeBudget($budget, $month, $systemRecommendation);
        $budgetMap = collect($budgetPayload['items'])->mapWithKeys(fn (array $item) => [
            $item['category_key'] => (float) ($item['final_active_amount'] ?? $item['target_amount'] ?? 0),
        ])->all();

        $cashPosition = $this->buildCashPosition($budgetMap, $budgetPayload, $projectionData, $loanCashImpact, $forecastBreakdown, $systemRecommendation);
        $budgetBreakdown = $this->buildBudgetBreakdown($budgetMap, $actualBreakdown, $forecastBreakdown, $cashPosition);
        $budgetSummary = $this->buildBudgetSummary(
            $month,
            $budgetPayload['status'],
            $budgetMap,
            $actualBreakdown,
            $forecastBreakdown,
            $cashPosition,
            $budgetBreakdown,
            $systemRecommendation
        );

        return [
            'monthly_budget' => $budgetPayload,
            'cash_position' => $cashPosition,
            'monthly_budget_summary' => $budgetSummary,
            'monthly_budget_breakdown' => $budgetBreakdown,
            'budget_summary' => $budgetSummary,
            'budget_breakdown' => $budgetBreakdown,
            'loan_cash_impact' => $loanCashImpact,
            'system_cash_guardrail' => $systemRecommendation['guardrail'],
        ];
    }

    private function buildActualBreakdown(Carbon $startDate, Carbon $endDate): array
    {
        $empty = $this->emptyBreakdown();
        if ($endDate->lt($startDate)) {
            return $empty;
        }

        $transactions = Schema::hasTable('financial_transactions')
            ? FinancialTransaction::query()
                ->whereBetween('transaction_date', [$startDate->toDateString(), $endDate->toDateString()])
                ->get()
            : collect();

        $invoiceIncome = (float) $transactions
            ->where('type', 'income')
            ->where('source', 'invoice_payment')
            ->sum('amount');

        $allIncome = (float) $transactions
            ->where('type', 'income')
            ->sum('amount');

        $payrollExpense = (float) $transactions
            ->filter(fn (FinancialTransaction $transaction) => $transaction->type === 'expense' && $this->isPayrollExpense($transaction))
            ->sum('amount');

        $purchaseExpense = (float) $transactions
            ->filter(fn (FinancialTransaction $transaction) => $transaction->type === 'expense' && $this->isPurchaseExpense($transaction))
            ->sum('amount');

        $operationalExpense = (float) $transactions
            ->filter(function (FinancialTransaction $transaction) {
                if ($transaction->type !== 'expense') {
                    return false;
                }

                return !$this->isPurchaseExpense($transaction) && !$this->isPayrollExpense($transaction);
            })
            ->sum('amount');

        $loanSettlement = Schema::hasTable('borrower_loan_payments')
            ? (float) BorrowerLoanPayment::query()
                ->whereBetween('payment_date', [$startDate->toDateString(), $endDate->toDateString()])
                ->sum('amount')
            : 0.0;

        $mandatoryExpense = $this->sumMandatoryConfirmedAmounts($startDate->copy(), $endDate->copy());

        return [
            self::CATEGORY_INVOICE_INCOME => $invoiceIncome,
            self::CATEGORY_NON_INVOICE_INCOME => max(0, $allIncome - $invoiceIncome),
            self::CATEGORY_MANDATORY_EXPENSE => $mandatoryExpense,
            self::CATEGORY_OPERATIONAL_EXPENSE => max(0, $operationalExpense),
            self::CATEGORY_PAYROLL_EXPENSE => max(0, $payrollExpense),
            self::CATEGORY_PURCHASE_INVESTMENT => max(0, $purchaseExpense),
            self::CATEGORY_LOAN_SETTLEMENT => max(0, $loanSettlement),
            self::CATEGORY_MINIMUM_CASH_RESERVE => 0.0,
        ];
    }

    private function buildForecastBreakdown(Carbon $startDate, Carbon $endDate, array $actualBreakdown, ?array $projectionData = null): array
    {
        $today = Carbon::today()->startOfDay();
        $monthStart = $startDate->copy()->startOfMonth();
        $monthEnd = $endDate->copy()->endOfMonth();
        $daysInMonth = max(1, $monthStart->diffInDays($monthEnd) + 1);
        $elapsedDays = 0;
        if ($today->betweenIncluded($monthStart, $monthEnd)) {
            $elapsedDays = max(1, $monthStart->diffInDays($today) + 1);
        } elseif ($monthEnd->lt($today)) {
            $elapsedDays = $daysInMonth;
        }

        $historicalAverages = $this->buildHistoricalMonthlyAverages($monthStart->copy());
        $projectionSummary = $projectionData['summary'] ?? [];

        if ($monthEnd->lt($today)) {
            return $actualBreakdown;
        }

        $invoiceActual = (float) ($actualBreakdown[self::CATEGORY_INVOICE_INCOME] ?? 0);
        $nonInvoiceActual = (float) ($actualBreakdown[self::CATEGORY_NON_INVOICE_INCOME] ?? 0);
        $actualTotalIncome = $invoiceActual + $nonInvoiceActual;
        $invoiceRatio = $actualTotalIncome > 0
            ? ($invoiceActual / $actualTotalIncome)
            : $this->historicalInvoiceIncomeRatio($historicalAverages);

        $predictedIncomeTotal = (float) ($projectionSummary['predicted_income'] ?? 0);

        if ($monthStart->gt($today)) {
            $projectedIncome = $predictedIncomeTotal > 0
                ? $predictedIncomeTotal
                : ((float) ($historicalAverages[self::CATEGORY_INVOICE_INCOME] ?? 0) + (float) ($historicalAverages[self::CATEGORY_NON_INVOICE_INCOME] ?? 0));

            return [
                self::CATEGORY_INVOICE_INCOME => round($projectedIncome * $invoiceRatio, 2),
                self::CATEGORY_NON_INVOICE_INCOME => round($projectedIncome * (1 - $invoiceRatio), 2),
                self::CATEGORY_MANDATORY_EXPENSE => (float) ($projectionSummary['mandatory_expense'] ?? ($historicalAverages[self::CATEGORY_MANDATORY_EXPENSE] ?? 0)),
                self::CATEGORY_OPERATIONAL_EXPENSE => (float) ($historicalAverages[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0),
                self::CATEGORY_PAYROLL_EXPENSE => (float) ($historicalAverages[self::CATEGORY_PAYROLL_EXPENSE] ?? 0),
                self::CATEGORY_PURCHASE_INVESTMENT => (float) ($historicalAverages[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0),
                self::CATEGORY_LOAN_SETTLEMENT => (float) ($historicalAverages[self::CATEGORY_LOAN_SETTLEMENT] ?? 0),
                self::CATEGORY_MINIMUM_CASH_RESERVE => 0.0,
            ];
        }

        $remainingPredictedIncome = max(0, $predictedIncomeTotal - $actualTotalIncome);

        return [
            self::CATEGORY_INVOICE_INCOME => round($invoiceActual + ($remainingPredictedIncome * $invoiceRatio), 2),
            self::CATEGORY_NON_INVOICE_INCOME => round($nonInvoiceActual + ($remainingPredictedIncome * (1 - $invoiceRatio)), 2),
            self::CATEGORY_MANDATORY_EXPENSE => max(
                (float) ($actualBreakdown[self::CATEGORY_MANDATORY_EXPENSE] ?? 0),
                (float) ($projectionSummary['mandatory_expense'] ?? ($historicalAverages[self::CATEGORY_MANDATORY_EXPENSE] ?? 0))
            ),
            self::CATEGORY_OPERATIONAL_EXPENSE => $this->projectRecurringOutflow(
                $actualBreakdown[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0,
                $historicalAverages[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0,
                $elapsedDays,
                $daysInMonth
            ),
            self::CATEGORY_PAYROLL_EXPENSE => $this->projectRecurringOutflow(
                $actualBreakdown[self::CATEGORY_PAYROLL_EXPENSE] ?? 0,
                $historicalAverages[self::CATEGORY_PAYROLL_EXPENSE] ?? 0,
                $elapsedDays,
                $daysInMonth
            ),
            self::CATEGORY_PURCHASE_INVESTMENT => max(
                (float) ($actualBreakdown[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0),
                (float) ($historicalAverages[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0)
            ),
            self::CATEGORY_LOAN_SETTLEMENT => max(
                (float) ($actualBreakdown[self::CATEGORY_LOAN_SETTLEMENT] ?? 0),
                (float) ($historicalAverages[self::CATEGORY_LOAN_SETTLEMENT] ?? 0)
            ),
            self::CATEGORY_MINIMUM_CASH_RESERVE => 0.0,
        ];
    }

    private function buildBudgetBreakdown(array $budgetMap, array $actualBreakdown, array $forecastBreakdown, array $cashPosition): array
    {
        return collect($this->categoryDefinitions())->map(function (array $definition) use ($budgetMap, $actualBreakdown, $forecastBreakdown, $cashPosition) {
            $key = $definition['key'];
            $direction = $definition['direction'];
            $budgetAmount = (float) ($budgetMap[$key] ?? 0);
            $actualAmount = (float) ($actualBreakdown[$key] ?? 0);
            $forecastAmount = (float) ($forecastBreakdown[$key] ?? 0);

            if ($direction === 'reserve') {
                $actualAmount = (float) ($cashPosition['available_cash'] ?? 0);
                $forecastAmount = (float) ($cashPosition['projected_end_of_month_available_cash'] ?? 0);
            }

            $varianceAmount = $forecastAmount - $budgetAmount;
            $variancePct = $budgetAmount > 0 ? round(($varianceAmount / $budgetAmount) * 100, 2) : ($forecastAmount > 0 ? 100.0 : 0.0);
            $status = $this->resolveBudgetStatus($direction, $budgetAmount, $forecastAmount);

            return [
                'category_key' => $key,
                'label' => $definition['label'],
                'direction' => $direction,
                'budget_amount' => (int) round($budgetAmount),
                'actual_amount' => (int) round($actualAmount),
                'forecast_amount' => (int) round($forecastAmount),
                'variance_amount' => (int) round($varianceAmount),
                'variance_pct' => $variancePct,
                'status' => $status,
            ];
        })->values()->all();
    }

    private function buildBudgetSummary(
        string $month,
        string $budgetStatus,
        array $budgetMap,
        array $actualBreakdown,
        array $forecastBreakdown,
        array $cashPosition,
        array $budgetBreakdown,
        array $systemRecommendation
    ): array {
        $budgetInflows = (float) ($budgetMap[self::CATEGORY_INVOICE_INCOME] ?? 0) + (float) ($budgetMap[self::CATEGORY_NON_INVOICE_INCOME] ?? 0);
        $budgetOutflows = (float) ($budgetMap[self::CATEGORY_MANDATORY_EXPENSE] ?? 0)
            + (float) ($budgetMap[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0)
            + (float) ($budgetMap[self::CATEGORY_PAYROLL_EXPENSE] ?? 0)
            + (float) ($budgetMap[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0)
            + (float) ($budgetMap[self::CATEGORY_LOAN_SETTLEMENT] ?? 0);

        $actualInflows = (float) ($actualBreakdown[self::CATEGORY_INVOICE_INCOME] ?? 0) + (float) ($actualBreakdown[self::CATEGORY_NON_INVOICE_INCOME] ?? 0);
        $actualOutflows = (float) ($actualBreakdown[self::CATEGORY_MANDATORY_EXPENSE] ?? 0)
            + (float) ($actualBreakdown[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0)
            + (float) ($actualBreakdown[self::CATEGORY_PAYROLL_EXPENSE] ?? 0)
            + (float) ($actualBreakdown[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0)
            + (float) ($actualBreakdown[self::CATEGORY_LOAN_SETTLEMENT] ?? 0);

        $forecastInflows = (float) ($forecastBreakdown[self::CATEGORY_INVOICE_INCOME] ?? 0) + (float) ($forecastBreakdown[self::CATEGORY_NON_INVOICE_INCOME] ?? 0);
        $forecastOutflows = (float) ($forecastBreakdown[self::CATEGORY_MANDATORY_EXPENSE] ?? 0)
            + (float) ($forecastBreakdown[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0)
            + (float) ($forecastBreakdown[self::CATEGORY_PAYROLL_EXPENSE] ?? 0)
            + (float) ($forecastBreakdown[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0)
            + (float) ($forecastBreakdown[self::CATEGORY_LOAN_SETTLEMENT] ?? 0);

        $reserveTarget = (float) ($budgetMap[self::CATEGORY_MINIMUM_CASH_RESERVE] ?? 0);
        $projectedAvailableAfterReserve = (float) ($cashPosition['projected_end_of_month_available_cash_after_reserve'] ?? 0);
        $hasOverspend = collect($budgetBreakdown)->contains(fn (array $row) => in_array($row['status'], ['lewat_budget', 'defisit'], true));

        $status = 'aman';
        if ($projectedAvailableAfterReserve < 0 || $hasOverspend) {
            $status = 'defisit';
        } elseif ($forecastOutflows > $budgetOutflows || $projectedAvailableAfterReserve < ($reserveTarget * 0.1)) {
            $status = 'waspada';
        }

        return [
            'month' => $month,
            'status' => $budgetStatus === 'unconfigured' ? 'unconfigured' : $status,
            'configuration_status' => $budgetStatus,
            'total_budget_inflows' => (int) round($budgetInflows),
            'total_budget_outflows' => (int) round($budgetOutflows),
            'total_actual_inflows' => (int) round($actualInflows),
            'total_actual_outflows' => (int) round($actualOutflows),
            'total_forecast_inflows' => (int) round($forecastInflows),
            'total_forecast_outflows' => (int) round($forecastOutflows),
            'remaining_safe_budget' => (int) round($budgetOutflows - $forecastOutflows),
            'remaining_operational_budget' => (int) round(((float) ($budgetMap[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0)) - ((float) ($forecastBreakdown[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0))),
            'remaining_purchase_budget' => (int) round(((float) ($budgetMap[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0)) - ((float) ($forecastBreakdown[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0))),
            'projected_end_of_month_cash' => (int) round($cashPosition['projected_end_of_month_cash'] ?? 0),
            'projected_end_of_month_available_cash' => (int) round($cashPosition['projected_end_of_month_available_cash'] ?? 0),
            'minimum_cash_reserve_target' => (int) round($reserveTarget),
            'projected_available_after_reserve' => (int) round($projectedAvailableAfterReserve),
            'additional_income_needed_for_reserve' => (int) round(max(0, 0 - $projectedAvailableAfterReserve)),
            'system_confidence' => (int) round((float) ($systemRecommendation['confidence'] ?? 0)),
        ];
    }

    private function buildCashPosition(
        array $budgetMap,
        array $budgetPayload,
        ?array $projectionData,
        array $loanCashImpact,
        array $forecastBreakdown,
        array $systemRecommendation
    ): array {
        $projectionSummary = $projectionData['summary'] ?? [];
        $ledgerBalance = (float) ($projectionSummary['actual_balance_today'] ?? $projectionSummary['projected_ending_balance'] ?? 0);
        $projectedEndingCash = (float) ($projectionSummary['projected_ending_balance'] ?? $ledgerBalance);
        $loanOutstanding = (float) ($loanCashImpact['current_outstanding'] ?? 0);
        $forecastLoanSettlement = (float) ($forecastBreakdown[self::CATEGORY_LOAN_SETTLEMENT] ?? 0);
        $minimumReserve = (float) ($budgetMap[self::CATEGORY_MINIMUM_CASH_RESERVE] ?? 0);
        $projectedLoanOutstanding = max(0, $loanOutstanding - $forecastLoanSettlement);
        $availableCash = $ledgerBalance - $loanOutstanding;
        $projectedAvailableCash = $projectedEndingCash - $projectedLoanOutstanding;
        $reserveItem = collect($budgetPayload['items'] ?? [])->firstWhere('category_key', self::CATEGORY_MINIMUM_CASH_RESERVE);
        $reserveMeta = is_array($systemRecommendation['reserve_meta'] ?? null) ? $systemRecommendation['reserve_meta'] : [];
        $reserveStatus = $minimumReserve > 0
            ? ($budgetPayload['status'] === 'system_generated'
                ? 'system_generated'
                : ($budgetPayload['status'] === 'manual_override' ? 'manual_override' : 'configured'))
            : 'unconfigured';
        $reserveSource = (string) ($reserveItem['source'] ?? (
            $budgetPayload['status'] === 'manual_override'
                ? 'manual_override'
                : (($budgetPayload['status'] === 'system_generated' || $budgetPayload['status'] === 'configured') ? 'system' : 'unconfigured')
        ));

        return [
            'ledger_balance' => (int) round($ledgerBalance),
            'loan_outstanding' => (int) round($loanOutstanding),
            'available_cash' => (int) round($availableCash),
            'minimum_cash_reserve_target' => (int) round($minimumReserve),
            'available_cash_after_reserve' => (int) round($availableCash - $minimumReserve),
            'projected_end_of_month_cash' => (int) round($projectedEndingCash),
            'projected_end_of_month_loan_outstanding' => (int) round($projectedLoanOutstanding),
            'projected_end_of_month_available_cash' => (int) round($projectedAvailableCash),
            'projected_end_of_month_available_cash_after_reserve' => (int) round($projectedAvailableCash - $minimumReserve),
            'reserve_status' => $reserveStatus,
            'reserve_source' => $reserveSource,
            'reserve_confidence' => (int) round((float) ($systemRecommendation['confidence'] ?? 0)),
            'reserve_formula' => (string) ($reserveMeta['formula'] ?? self::RESERVE_FORMULA_INVOICE_PAID_12M_AVERAGE_25PCT),
            'reserve_basis_months_count' => (int) round((float) ($reserveMeta['basis_months_count'] ?? 0)),
            'reserve_basis_average_invoice_income' => (int) round((float) ($reserveMeta['basis_average_invoice_income'] ?? 0)),
            'reserve_basis_percentage' => (int) round((float) ($reserveMeta['basis_percentage'] ?? self::RESERVE_BASIS_PERCENTAGE)),
            'reserve_message' => $minimumReserve > 0
                ? sprintf(
                    'Cadangan kas minimum aktif: %d%% x rata-rata invoice paid %d bulan (%s).',
                    (int) round((float) ($reserveMeta['basis_percentage'] ?? self::RESERVE_BASIS_PERCENTAGE)),
                    (int) round((float) ($reserveMeta['basis_months_count'] ?? 0)),
                    number_format((float) ($reserveMeta['basis_average_invoice_income'] ?? 0), 0, ',', '.')
                )
                : 'Kas Setelah Cadangan masih sama dengan Kas Riil karena belum ada basis invoice paid historis yang cukup untuk mengaktifkan cadangan minimum.',
        ];
    }

    private function buildLoanCashImpact(Carbon $startDate, Carbon $endDate): array
    {
        if (!Schema::hasTable('borrower_loans')) {
            return [
                'opening_outstanding' => 0,
                'new_loans' => 0,
                'settlements' => 0,
                'closing_outstanding' => 0,
                'current_outstanding' => 0,
                'cash_adjusted_net' => 0,
            ];
        }

        $openingOutstanding = $this->outstandingAsOf($startDate->copy()->subDay()->endOfDay());
        $closingOutstanding = $this->outstandingAsOf($endDate->copy()->endOfDay());
        $currentOutstanding = $this->outstandingAsOf(Carbon::today()->endOfDay());
        $newLoans = (float) BorrowerLoan::query()
            ->whereDate('occurred_at', '>=', $startDate->toDateString())
            ->whereDate('occurred_at', '<=', $endDate->toDateString())
            ->whereNotIn('status', [BorrowerLoan::STATUS_PENDING_RECEIVER_APPROVAL])
            ->sum('amount');
        $settlements = Schema::hasTable('borrower_loan_payments')
            ? (float) BorrowerLoanPayment::query()
                ->whereBetween('payment_date', [$startDate->toDateString(), $endDate->toDateString()])
                ->sum('amount')
            : 0.0;

        return [
            'opening_outstanding' => (int) round($openingOutstanding),
            'new_loans' => (int) round($newLoans),
            'settlements' => (int) round($settlements),
            'closing_outstanding' => (int) round($closingOutstanding),
            'current_outstanding' => (int) round($currentOutstanding),
            'cash_adjusted_net' => (int) round($settlements - $newLoans),
        ];
    }

    private function outstandingAsOf(Carbon $asOf): float
    {
        if (!Schema::hasTable('borrower_loans')) {
            return 0.0;
        }

        $loans = BorrowerLoan::query()
            ->whereDate('occurred_at', '<=', $asOf->toDateString())
            ->whereNotIn('status', [BorrowerLoan::STATUS_PENDING_RECEIVER_APPROVAL])
            ->get(['id', 'amount']);

        if ($loans->isEmpty()) {
            return 0.0;
        }

        $paymentsByLoan = Schema::hasTable('borrower_loan_payments')
            ? BorrowerLoanPayment::query()
                ->whereIn('borrower_loan_id', $loans->pluck('id'))
                ->whereDate('payment_date', '<=', $asOf->toDateString())
                ->get(['borrower_loan_id', 'amount'])
                ->groupBy('borrower_loan_id')
            : collect();

        return (float) $loans->sum(function (BorrowerLoan $loan) use ($paymentsByLoan) {
            $paid = (float) collect($paymentsByLoan->get($loan->id, []))->sum('amount');

            return max(0, (float) $loan->amount - $paid);
        });
    }

    private function buildHistoricalMonthlyAverages(Carbon $referenceMonthStart): array
    {
        $months = collect();
        for ($i = 1; $i <= 3; $i++) {
            $monthStart = $referenceMonthStart->copy()->subMonthsNoOverflow($i)->startOfMonth();
            $monthEnd = $monthStart->copy()->endOfMonth();
            $months->push($this->buildActualBreakdown($monthStart, $monthEnd));
        }

        return collect($this->categoryKeys())->mapWithKeys(function (string $key) use ($months) {
            $avg = $months->avg(fn (array $row) => (float) ($row[$key] ?? 0));
            return [$key => (float) $avg];
        })->all();
    }

    private function buildSystemBudgetRecommendation(
        Carbon $startDate,
        Carbon $endDate,
        array $actualBreakdown,
        array $forecastBreakdown,
        array $historicalAverages,
        array $loanCashImpact,
        ?array $projectionData
    ): array {
        $projectionSummary = $projectionData['summary'] ?? [];
        $forecastContext = $projectionData['forecast_context'] ?? [];
        $invoiceHealth = $this->buildInvoiceHealthContext($startDate->copy(), $endDate->copy());
        $reserveBaseline = $this->buildInvoicePaidReserveBaseline($startDate->copy()->startOfMonth());

        $forecastInvoiceIncome = max(
            (float) ($forecastBreakdown[self::CATEGORY_INVOICE_INCOME] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_INVOICE_INCOME] ?? 0)
        );
        $forecastNonInvoiceIncome = max(
            (float) ($forecastBreakdown[self::CATEGORY_NON_INVOICE_INCOME] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_NON_INVOICE_INCOME] ?? 0) * 0.9
        );
        $forecastMandatory = max(
            (float) ($forecastBreakdown[self::CATEGORY_MANDATORY_EXPENSE] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_MANDATORY_EXPENSE] ?? 0)
        );
        $forecastOperational = max(
            (float) ($forecastBreakdown[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0)
        );
        $forecastPayroll = max(
            (float) ($forecastBreakdown[self::CATEGORY_PAYROLL_EXPENSE] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_PAYROLL_EXPENSE] ?? 0)
        );
        $forecastPurchase = max(
            (float) ($forecastBreakdown[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_PURCHASE_INVESTMENT] ?? 0) * 0.7
        );
        $forecastLoanSettlement = max(
            (float) ($forecastBreakdown[self::CATEGORY_LOAN_SETTLEMENT] ?? 0),
            (float) ($historicalAverages[self::CATEGORY_LOAN_SETTLEMENT] ?? 0)
        );

        $predictedIncome = max(0, $forecastInvoiceIncome + $forecastNonInvoiceIncome);
        $currentOutstanding = (float) ($loanCashImpact['current_outstanding'] ?? 0);
        $volatilityIndex = (float) ($forecastContext['volatility_index'] ?? 0);
        $collectionRate = (float) ($invoiceHealth['collection_rate'] ?? 0);
        $overdueTotal = (float) ($invoiceHealth['overdue_total'] ?? 0);
        $projectedEndingCash = (float) ($projectionSummary['projected_ending_balance_ledger'] ?? $projectionSummary['projected_ending_balance'] ?? 0);
        $projectedAvailableCash = (float) ($projectionSummary['projected_ending_balance_available_cash'] ?? ($projectedEndingCash - max(0, $currentOutstanding - $forecastLoanSettlement)));
        $overduePressure = $predictedIncome > 0 ? min(1.5, $overdueTotal / $predictedIncome) : ($overdueTotal > 0 ? 1.0 : 0.0);
        $recommendedReserve = (float) ($reserveBaseline['recommended_reserve'] ?? 0);

        $supportingSignals = collect([
            $predictedIncome > 0,
            $recommendedReserve > 0,
            $currentOutstanding > 0,
            $collectionRate > 0,
            $overdueTotal > 0,
        ])->filter()->count();

        $confidence = min(95, max(
            $supportingSignals > 0 ? 35 + ($supportingSignals * 10) : 0,
            min(20, (int) round(100 - $volatilityIndex)) + ($collectionRate > 0 ? 10 : 0)
        ));

        $projectedAvailableAfterReserve = $projectedAvailableCash - $recommendedReserve;
        $maxDiscretionarySpend = max(0, $projectedAvailableAfterReserve);
        $recommendedOperationalBudget = min($forecastOperational, max(0, $maxDiscretionarySpend * 0.7));
        $recommendedPurchaseBudget = min(
            $forecastPurchase,
            max(0, ($maxDiscretionarySpend - $recommendedOperationalBudget) * (1 - min(0.7, ($overduePressure * 0.45) + ($currentOutstanding > 0 ? 0.15 : 0))))
        );

        $healthScore = 100;
        if ($projectedAvailableAfterReserve < 0) {
            $healthScore -= 35;
        }
        if ($collectionRate > 0 && $collectionRate < 85) {
            $healthScore -= min(20, (85 - $collectionRate) * 0.6);
        }
        if ($overduePressure > 0.25) {
            $healthScore -= min(15, $overduePressure * 12);
        }
        if ($volatilityIndex > 40) {
            $healthScore -= min(10, ($volatilityIndex - 40) * 0.2);
        }
        if ($currentOutstanding > 0 && $projectedEndingCash > 0) {
            $healthScore -= min(15, ($currentOutstanding / max(1, $projectedEndingCash)) * 12);
        }
        $healthScore = (int) round(max(0, min(100, $healthScore)));

        $healthStatus = 'aman';
        if ($healthScore < 35) {
            $healthStatus = 'defisit';
        } elseif ($healthScore < 55) {
            $healthStatus = 'rawan';
        } elseif ($healthScore < 75) {
            $healthStatus = 'waspada';
        }

        $drivers = $this->buildSystemDrivers(
            $currentOutstanding,
            $collectionRate,
            $overdueTotal,
            $volatilityIndex,
            $forecastOperational,
            (float) ($historicalAverages[self::CATEGORY_OPERATIONAL_EXPENSE] ?? 0),
            $projectedAvailableAfterReserve
        );

        $actions = [
            [
                'key' => 'max_safe_spend',
                'title' => 'Maksimal belanja aman minggu ini',
                'value' => (int) round(max(0, $recommendedOperationalBudget)),
                'note' => 'Batas aman belanja operasional berdasarkan kas riil setelah cadangan.',
            ],
            [
                'key' => 'income_needed',
                'title' => 'Minimal pemasukan tambahan',
                'value' => (int) round(max(0, 0 - $projectedAvailableAfterReserve)),
                'note' => 'Tambahan pemasukan agar cadangan kas minimum tetap aman.',
            ],
            [
                'key' => 'purchase_hold',
                'title' => 'Belanja pembelian yang aman',
                'value' => (int) round(max(0, $recommendedPurchaseBudget)),
                'note' => 'Envelope aman untuk pembelian/investasi setelah memperhitungkan risiko kas.',
            ],
            [
                'key' => 'loan_priority',
                'title' => 'Pinjaman yang harus ditekan',
                'value' => (int) round(max(0, $currentOutstanding)),
                'note' => 'Outstanding pinjaman aktif yang sedang menekan kas riil perusahaan.',
            ],
        ];

        return [
            'items' => [
                self::CATEGORY_INVOICE_INCOME => $forecastInvoiceIncome,
                self::CATEGORY_NON_INVOICE_INCOME => $forecastNonInvoiceIncome,
                self::CATEGORY_MANDATORY_EXPENSE => $forecastMandatory,
                self::CATEGORY_OPERATIONAL_EXPENSE => $recommendedOperationalBudget,
                self::CATEGORY_PAYROLL_EXPENSE => $forecastPayroll,
                self::CATEGORY_PURCHASE_INVESTMENT => $recommendedPurchaseBudget,
                self::CATEGORY_LOAN_SETTLEMENT => $forecastLoanSettlement,
                self::CATEGORY_MINIMUM_CASH_RESERVE => max(0, $recommendedReserve),
            ],
            'confidence' => $confidence,
            'reserve_meta' => $reserveBaseline + [
                'formula' => self::RESERVE_FORMULA_INVOICE_PAID_12M_AVERAGE_25PCT,
                'basis_percentage' => self::RESERVE_BASIS_PERCENTAGE,
            ],
            'guardrail' => [
                'recommended_minimum_cash_reserve' => (int) round(max(0, $recommendedReserve)),
                'recommended_operational_budget' => (int) round(max(0, $recommendedOperationalBudget)),
                'recommended_purchase_budget' => (int) round(max(0, $recommendedPurchaseBudget)),
                'recommended_max_discretionary_spend' => (int) round(max(0, $maxDiscretionarySpend)),
                'projected_available_after_reserve' => (int) round($projectedAvailableAfterReserve),
                'health_status' => $healthStatus,
                'health_score' => $healthScore,
                'confidence' => $confidence,
                'reserve_formula' => self::RESERVE_FORMULA_INVOICE_PAID_12M_AVERAGE_25PCT,
                'reserve_basis_months_count' => (int) round((float) ($reserveBaseline['basis_months_count'] ?? 0)),
                'reserve_basis_average_invoice_income' => (int) round((float) ($reserveBaseline['basis_average_invoice_income'] ?? 0)),
                'reserve_basis_percentage' => self::RESERVE_BASIS_PERCENTAGE,
                'drivers' => $drivers,
                'action_center' => $actions,
            ],
        ];
    }

    private function buildInvoicePaidReserveBaseline(Carbon $referenceMonthStart): array
    {
        if (!Schema::hasTable('invoices')) {
            return [
                'formula' => self::RESERVE_FORMULA_INVOICE_PAID_12M_AVERAGE_25PCT,
                'basis_months_count' => 0,
                'basis_average_invoice_income' => 0.0,
                'basis_percentage' => self::RESERVE_BASIS_PERCENTAGE,
                'recommended_reserve' => 0.0,
            ];
        }

        $historyStart = $referenceMonthStart->copy()->subMonthsNoOverflow(12)->startOfMonth();
        $historyEnd = $referenceMonthStart->copy()->subMonthNoOverflow()->endOfMonth();

        $rows = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$historyStart->copy()->startOfDay(), $historyEnd->copy()->endOfDay()])
            ->get(['amount', 'paid_at'])
            ->groupBy(fn (Invoice $invoice) => optional($invoice->paid_at)->format('Y-m'))
            ->map(fn (Collection $items) => (float) $items->sum('amount'))
            ->filter(fn (float $amount) => $amount > 0);

        $basisMonthsCount = $rows->count();
        $averageInvoiceIncome = $basisMonthsCount > 0
            ? (float) $rows->avg()
            : 0.0;

        return [
            'formula' => self::RESERVE_FORMULA_INVOICE_PAID_12M_AVERAGE_25PCT,
            'basis_months_count' => $basisMonthsCount,
            'basis_average_invoice_income' => round($averageInvoiceIncome, 2),
            'basis_percentage' => self::RESERVE_BASIS_PERCENTAGE,
            'recommended_reserve' => round($averageInvoiceIncome * (self::RESERVE_BASIS_PERCENTAGE / 100), 2),
        ];
    }

    private function buildInvoiceHealthContext(Carbon $startDate, Carbon $endDate): array
    {
        if (!Schema::hasTable('invoices')) {
            return [
                'collection_rate' => 0.0,
                'overdue_total' => 0.0,
            ];
        }

        $dueInvoices = Invoice::query()
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('due_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get(['status', 'amount', 'paid_at', 'due_date']);

        $paidDueCount = $dueInvoices
            ->filter(fn (Invoice $invoice) => $invoice->status === 'paid' && $invoice->paid_at && $invoice->paid_at->lessThanOrEqualTo($endDate->copy()->endOfDay()))
            ->count();

        $collectionRate = $dueInvoices->count() > 0
            ? round(($paidDueCount / $dueInvoices->count()) * 100, 2)
            : 0.0;

        $overdueTotal = (float) Invoice::query()
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->whereDate('due_date', '<=', $endDate->toDateString())
            ->sum('amount');

        return [
            'collection_rate' => $collectionRate,
            'overdue_total' => $overdueTotal,
        ];
    }

    private function buildSystemDrivers(
        float $currentOutstanding,
        float $collectionRate,
        float $overdueTotal,
        float $volatilityIndex,
        float $forecastOperational,
        float $historicalOperational,
        float $projectedAvailableAfterReserve
    ): array {
        $drivers = [];

        if ($currentOutstanding > 0) {
            $drivers[] = [
                'key' => 'loan_pressure',
                'title' => 'Outstanding pinjaman menekan kas riil',
                'impact' => 'tinggi',
                'detail' => 'Kas riil perusahaan berkurang langsung oleh outstanding pinjaman yang belum kembali.',
            ];
        }

        if ($collectionRate > 0 && $collectionRate < 85) {
            $drivers[] = [
                'key' => 'collection_weak',
                'title' => 'Collection rate masih lemah',
                'impact' => 'tinggi',
                'detail' => 'Pemasukan invoice belum masuk secepat yang dibutuhkan untuk menjaga cadangan kas.',
            ];
        }

        if ($overdueTotal > 0) {
            $drivers[] = [
                'key' => 'overdue_pressure',
                'title' => 'Piutang overdue masih tinggi',
                'impact' => 'menengah',
                'detail' => 'Piutang tertahan membuat kas aktual lebih ketat dibanding pendapatan yang seharusnya masuk.',
            ];
        }

        if ($volatilityIndex > 40) {
            $drivers[] = [
                'key' => 'income_volatility',
                'title' => 'Volatilitas pemasukan tinggi',
                'impact' => 'menengah',
                'detail' => 'Pola pemasukan tidak stabil sehingga reserve perlu dibuat lebih tebal.',
            ];
        }

        if ($historicalOperational > 0 && $forecastOperational > ($historicalOperational * 1.15)) {
            $drivers[] = [
                'key' => 'operational_spike',
                'title' => 'Belanja operasional cenderung naik',
                'impact' => 'menengah',
                'detail' => 'Outflow operasional bulan ini lebih tinggi dari pola historis dan perlu dikendalikan.',
            ];
        }

        if ($projectedAvailableAfterReserve < 0) {
            $drivers[] = [
                'key' => 'reserve_thin',
                'title' => 'Cadangan kas masih tipis',
                'impact' => 'tinggi',
                'detail' => 'Setelah reserve diterapkan, kas riil diproyeksikan tidak cukup menutup tekanan bulan berjalan.',
            ];
        }

        return array_slice($drivers, 0, 5);
    }

    private function normalizeRecommendedMap(array $items): array
    {
        return collect($this->categoryKeys())->mapWithKeys(function (string $key) use ($items) {
            return [$key => max(0, (float) ($items[$key] ?? 0))];
        })->all();
    }

    private function historicalInvoiceIncomeRatio(array $historicalAverages): float
    {
        $invoice = (float) ($historicalAverages[self::CATEGORY_INVOICE_INCOME] ?? 0);
        $nonInvoice = (float) ($historicalAverages[self::CATEGORY_NON_INVOICE_INCOME] ?? 0);
        $total = $invoice + $nonInvoice;

        if ($total <= 0) {
            return 0.85;
        }

        return $invoice / $total;
    }

    private function projectRecurringOutflow(float $actual, float $historicalAverage, int $elapsedDays, int $daysInMonth): float
    {
        if ($elapsedDays >= $daysInMonth) {
            return $actual;
        }

        if ($elapsedDays > 0 && $actual > 0) {
            $remainingDays = max(0, $daysInMonth - $elapsedDays);
            return round($actual + (($actual / $elapsedDays) * $remainingDays), 2);
        }

        return (float) $historicalAverage;
    }

    private function resolveBudgetStatus(string $direction, float $budgetAmount, float $forecastAmount): string
    {
        if ($direction === 'reserve') {
            if ($forecastAmount >= $budgetAmount) {
                return 'aman';
            }
            if ($forecastAmount > 0) {
                return 'waspada';
            }
            return 'defisit';
        }

        if ($budgetAmount <= 0) {
            return $forecastAmount > 0 ? 'unconfigured' : 'aman';
        }

        if ($direction === 'inflow') {
            if ($forecastAmount >= $budgetAmount) {
                return 'aman';
            }
            if ($forecastAmount >= ($budgetAmount * 0.9)) {
                return 'waspada';
            }
            return 'defisit';
        }

        if ($forecastAmount <= $budgetAmount) {
            return 'aman';
        }
        if ($forecastAmount <= ($budgetAmount * 1.1)) {
            return 'waspada';
        }
        return 'lewat_budget';
    }

    private function sumMandatoryConfirmedAmounts(Carbon $startDate, Carbon $endDate): float
    {
        if (!Schema::hasTable('financial_planning_targets')) {
            return 0.0;
        }

        return (float) FinancialPlanningTarget::query()
            ->where('type', FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE)
            ->get(['meta'])
            ->sum(function (FinancialPlanningTarget $target) use ($startDate, $endDate) {
                $meta = is_array($target->meta) ? $target->meta : [];
                $confirmations = is_array($meta['confirmations'] ?? null) ? $meta['confirmations'] : [];

                return collect($confirmations)->sum(function ($confirmation) use ($startDate, $endDate) {
                    $actualDate = isset($confirmation['actual_date']) ? Carbon::parse($confirmation['actual_date'])->toDateString() : null;
                    if (!$actualDate) {
                        return 0;
                    }

                    if ($actualDate < $startDate->toDateString() || $actualDate > $endDate->toDateString()) {
                        return 0;
                    }

                    return (float) ($confirmation['amount'] ?? 0);
                });
            });
    }

    private function isPurchaseExpense(FinancialTransaction $transaction): bool
    {
        $haystack = strtolower(implode(' ', [
            (string) $transaction->source,
            (string) $transaction->category,
            (string) $transaction->description,
        ]));

        foreach (['inventory', 'inventori', 'pembelian', 'belanja', 'router', 'kabel', 'modem', 'onu'] as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    private function isPayrollExpense(FinancialTransaction $transaction): bool
    {
        $haystack = strtolower(implode(' ', [
            (string) $transaction->source,
            (string) $transaction->category,
            (string) $transaction->description,
        ]));

        return str_contains($haystack, 'payroll');
    }

    private function emptyBreakdown(): array
    {
        return collect($this->categoryKeys())->mapWithKeys(fn (string $key) => [$key => 0.0])->all();
    }
}

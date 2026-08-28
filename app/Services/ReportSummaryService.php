<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerTerminationRequest;
use App\Models\BorrowerLoan;
use App\Models\FinancialTransaction;
use App\Models\InventoryDebt;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class ReportSummaryService
{
    public function summary(?string $month = null): array
    {
        $period = $this->resolvePeriod($month);
        $start = $period['start'];
        $end = $period['end'];

        $paidInvoices = Invoice::query()
            ->with(['customer.package:id,name', 'customer.kecamatan:id,name', 'customer.desa:id,name,kecamatan_id', 'customer.dusun:id,name,desa_id'])
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$start->startOfDay(), $end->endOfDay()])
            ->get();

        $overdueInvoices = Invoice::query()
            ->with(['customer.package:id,name', 'customer.kecamatan:id,name', 'customer.desa:id,name,kecamatan_id', 'customer.dusun:id,name,desa_id'])
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->whereDate('due_date', '<=', $end->toDateString())
            ->get();

        $dueInvoicesInPeriod = Invoice::query()
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('due_date', [$start->toDateString(), $end->toDateString()])
            ->get();

        $installations = Customer::query()
            ->with(['package:id,name', 'kecamatan:id,name', 'desa:id,name,kecamatan_id', 'dusun:id,name,desa_id'])
            ->whereBetween('activation_date', [$start->toDateString(), $end->toDateString()])
            ->get();

        $expenses = $this->financialTransactions()
            ->where('type', 'expense')
            ->whereBetween('transaction_date', [$start->toDateString(), $end->toDateString()])
            ->get();

        $periodTransactions = $this->financialTransactions()
            ->whereBetween('transaction_date', [$start->toDateString(), $end->toDateString()])
            ->get();

        $installationIncome = $this->financialTransactions()
            ->where('type', 'income')
            ->where('source', 'installation_income')
            ->whereBetween('transaction_date', [$start->toDateString(), $end->toDateString()])
            ->sum('amount');

        $ledgerIncome = (float) $this->financialTransactions()
            ->where('type', 'income')
            ->whereBetween('transaction_date', [$start->toDateString(), $end->toDateString()])
            ->sum('amount');

        $terminations = CustomerTerminationRequest::query()
            ->with(['customer.package:id,name', 'customer.kecamatan:id,name', 'customer.desa:id,name,kecamatan_id', 'customer.dusun:id,name,desa_id'])
            ->where('status', 'completed')
            ->whereBetween('completed_at', [$start->startOfDay(), $end->endOfDay()])
            ->get();

        $purchaseExpenses = $expenses->filter(fn (FinancialTransaction $transaction) => $this->isPurchaseExpense($transaction));
        $operationalExpenses = $expenses->reject(fn (FinancialTransaction $transaction) => $this->isPurchaseExpense($transaction));
        $paidCustomerCount = $paidInvoices->pluck('customer_id')->unique()->count();
        $paidInvoiceCount = $paidInvoices->count();
        $dueInvoiceCount = $dueInvoicesInPeriod->count();
        $paidDueInvoiceCount = $dueInvoicesInPeriod
            ->filter(fn (Invoice $invoice) => $invoice->status === 'paid' && $invoice->paid_at && $invoice->paid_at->lessThanOrEqualTo($end->endOfDay()))
            ->count();
        $purchaseTotal = (float) $purchaseExpenses->sum('amount');
        $expenseTotal = (float) $operationalExpenses->sum('amount');
        $activeCustomerBase = Customer::query()->where('is_active', true)->count() + $terminations->count();
        $paymentsByRegion = $this->invoiceGroupRows($paidInvoices, fn (Invoice $invoice) => $this->regionLabel($invoice->customer));
        $overdueByRegion = $this->invoiceGroupRows($overdueInvoices, fn (Invoice $invoice) => $this->regionLabel($invoice->customer));
        $monthlyBudgetInsights = app(MonthlyBudgetService::class)->buildInsights(
            Carbon::parse($start->toDateString())->startOfDay(),
            Carbon::parse($end->toDateString())->endOfDay()
        );
        $loanCashImpact = $monthlyBudgetInsights['loan_cash_impact'] ?? [];
        $cashAdjustedNet = $ledgerIncome - $purchaseTotal - $expenseTotal + (float) ($loanCashImpact['cash_adjusted_net'] ?? 0);
        $financialStatement = $this->buildFinancialStatement(
            $start,
            $end,
            $periodTransactions,
            $paidInvoices,
            $overdueInvoices,
            $purchaseExpenses,
            $operationalExpenses,
            (float) $installationIncome,
            $loanCashImpact
        );

        return [
            'period' => [
                'month' => $start->format('Y-m'),
                'label' => $start->translatedFormat('F Y'),
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
            ],
            'summary' => [
                'paid_customer_count' => $paidCustomerCount,
                'paid_invoice_count' => $paidInvoiceCount,
                'paid_total' => (float) $paidInvoices->sum('amount'),
                'due_invoice_count' => $dueInvoiceCount,
                'paid_due_invoice_count' => $paidDueInvoiceCount,
                'collection_rate' => $dueInvoiceCount > 0 ? round(($paidDueInvoiceCount / $dueInvoiceCount) * 100, 2) : 0.0,
                'overdue_customer_count' => $overdueInvoices->pluck('customer_id')->unique()->count(),
                'overdue_invoice_count' => $overdueInvoices->count(),
                'overdue_total' => (float) $overdueInvoices->sum('amount'),
                'overdue_aging' => $this->overdueAgingRows($overdueInvoices, $end),
                'installation_count' => $installations->count(),
                'installation_fee_total' => (float) $installations->sum('installation_fee'),
                'installation_income_total' => (float) $installationIncome,
                'installation_margin' => (float) $installationIncome - (float) $installations->sum('installation_fee'),
                'ledger_income_total' => $ledgerIncome,
                'net_cashflow_ledger' => $ledgerIncome - $purchaseTotal - $expenseTotal,
                'net_cashflow_real' => $cashAdjustedNet,
                'purchase_total' => $purchaseTotal,
                'expense_total' => $expenseTotal,
                'net_cashflow' => $ledgerIncome - $purchaseTotal - $expenseTotal,
                'arpu' => $paidCustomerCount > 0 ? round((float) $paidInvoices->sum('amount') / $paidCustomerCount, 2) : 0.0,
                'termination_count' => $terminations->count(),
                'active_customer_base' => $activeCustomerBase,
                'churn_rate' => $activeCustomerBase > 0 ? round(($terminations->count() / $activeCustomerBase) * 100, 2) : 0.0,
                'top_overdue_region' => $overdueByRegion[0] ?? null,
            ],
            'revenue_by_package' => $this->invoiceGroupRows($paidInvoices, fn (Invoice $invoice) => $this->packageLabel($invoice->customer)),
            'installations_by_region' => $this->customerGroupRows($installations, fn (Customer $customer) => $this->regionLabel($customer), 'installation_fee'),
            'payments_by_region' => $paymentsByRegion,
            'inactive_by_region' => $this->terminationGroupRows($terminations),
            'purchases' => $this->transactionGroupRows($purchaseExpenses, 'source'),
            'expenses' => $this->transactionGroupRows($operationalExpenses, 'category'),
            'monthly_budget' => $monthlyBudgetInsights['monthly_budget'] ?? null,
            'budget_summary' => $monthlyBudgetInsights['budget_summary'] ?? null,
            'budget_breakdown' => $monthlyBudgetInsights['budget_breakdown'] ?? [],
            'loan_cash_impact' => $loanCashImpact,
            'financial_statement' => $financialStatement,
        ];
    }

    private function resolvePeriod(?string $month): array
    {
        $target = $month && preg_match('/^\d{4}-\d{2}$/', $month)
            ? CarbonImmutable::createFromFormat('Y-m-d', $month . '-01')
            : CarbonImmutable::now()->subMonthNoOverflow()->startOfMonth();

        return [
            'start' => $target->startOfMonth(),
            'end' => $target->endOfMonth(),
        ];
    }

    private function financialTransactions()
    {
        if (!Schema::hasTable('financial_transactions')) {
            return FinancialTransaction::query()->whereRaw('1 = 0');
        }

        return FinancialTransaction::query();
    }

    private function buildFinancialStatement(
        CarbonImmutable $start,
        CarbonImmutable $end,
        Collection $periodTransactions,
        Collection $paidInvoices,
        Collection $openInvoices,
        Collection $purchaseExpenses,
        Collection $operationalExpenses,
        float $installationIncome,
        array $loanCashImpact
    ): array {
        $cashIncome = (float) $periodTransactions
            ->where('type', 'income')
            ->sum('amount');
        $cashExpense = (float) $periodTransactions
            ->where('type', 'expense')
            ->sum('amount');
        $cashAdjustment = (float) $periodTransactions
            ->where('type', 'adjustment')
            ->sum('amount');
        $purchaseTotal = (float) $purchaseExpenses->sum('amount');
        $operationalExpenseTotal = (float) $operationalExpenses->sum('amount');
        $invoicePaidTotal = (float) $paidInvoices->sum('amount');
        $receivableTotal = (float) $openInvoices->sum('amount');
        $openingCash = $this->cashBalanceBefore($start);
        $endingCash = $openingCash + $cashIncome - $cashExpense + $cashAdjustment;
        $inventoryValue = $this->inventoryValueAsOf($end);
        $inventoryDebt = $this->inventoryDebtOutstandingAsOf($end);
        $borrowerOutstanding = $this->borrowerOutstandingAsOf($end);
        $totalAssets = $endingCash + $receivableTotal + $inventoryValue;
        $totalLiabilities = $inventoryDebt + $borrowerOutstanding;

        return [
            'basis' => 'gabungan',
            'income_statement' => [
                'cash_revenue' => $cashIncome,
                'invoice_paid_revenue' => $invoicePaidTotal,
                'installation_income' => $installationIncome,
                'operational_expense' => $operationalExpenseTotal,
                'purchase_expense' => $purchaseTotal,
                'total_expense' => $operationalExpenseTotal + $purchaseTotal,
                'net_profit' => $cashIncome - $operationalExpenseTotal - $purchaseTotal,
                'net_profit_after_adjustment' => $cashIncome - $operationalExpenseTotal - $purchaseTotal + $cashAdjustment,
            ],
            'cash_flow' => [
                'opening_cash' => $openingCash,
                'cash_in' => $cashIncome,
                'cash_out' => $cashExpense,
                'adjustment' => $cashAdjustment,
                'ending_cash' => $endingCash,
                'loan_cash_adjusted_net' => (float) ($loanCashImpact['cash_adjusted_net'] ?? 0),
            ],
            'balance_sheet' => [
                'assets' => [
                    'cash' => $endingCash,
                    'receivables' => $receivableTotal,
                    'inventory_estimated_value' => $inventoryValue,
                    'total_assets' => $totalAssets,
                ],
                'liabilities' => [
                    'inventory_supplier_debt' => $inventoryDebt,
                    'borrower_internal_debt' => $borrowerOutstanding,
                    'total_liabilities' => $totalLiabilities,
                ],
                'equity' => [
                    'simple_equity' => $totalAssets - $totalLiabilities,
                ],
            ],
            'receivables' => [
                'invoice_count' => $openInvoices->count(),
                'customer_count' => $openInvoices->pluck('customer_id')->unique()->count(),
                'total' => $receivableTotal,
                'aging' => $this->overdueAgingRows($openInvoices, $end),
            ],
            'payables_or_loans' => [
                'inventory_supplier_debt' => $inventoryDebt,
                'borrower_internal_debt' => $borrowerOutstanding,
                'opening_borrower_outstanding' => (float) ($loanCashImpact['opening_outstanding'] ?? 0),
                'new_borrower_loans' => (float) ($loanCashImpact['new_loans'] ?? 0),
                'borrower_settlements' => (float) ($loanCashImpact['settlements'] ?? 0),
                'closing_borrower_outstanding' => (float) ($loanCashImpact['closing_outstanding'] ?? $borrowerOutstanding),
            ],
            'accounting_notes' => [
                'Laporan ini bersifat manajerial, bukan laporan audit formal.',
                'Mutasi/financial_transactions menjadi sumber utama kas; invoice dipakai sebagai pembanding akrual dan piutang.',
                'Nilai persediaan adalah estimasi dari stok inventory dan harga movement masuk yang tersedia.',
            ],
        ];
    }

    private function cashBalanceBefore(CarbonImmutable $start): float
    {
        $transactions = $this->financialTransactions()
            ->whereDate('transaction_date', '<', $start->toDateString())
            ->get(['type', 'amount']);

        return (float) $transactions->sum(function (FinancialTransaction $transaction) {
            return match ($transaction->type) {
                'income' => (float) $transaction->amount,
                'expense' => -1 * (float) $transaction->amount,
                'adjustment' => (float) $transaction->amount,
                default => 0.0,
            };
        });
    }

    private function inventoryValueAsOf(CarbonImmutable $end): float
    {
        if (!Schema::hasTable('inventory_movements')) {
            return 0.0;
        }

        return (float) InventoryMovement::query()
            ->whereDate('transaction_date', '<=', $end->toDateString())
            ->get()
            ->groupBy('inventory_item_id')
            ->sum(function (Collection $movements) {
                $stock = $movements->sum(function (InventoryMovement $movement) {
                    $quantity = (float) $movement->quantity;

                    return $movement->movement_type === 'in' ? $quantity : -1 * $quantity;
                });

                if ($stock <= 0) {
                    return 0.0;
                }

                $incoming = $movements->filter(fn (InventoryMovement $movement) => $movement->movement_type === 'in' && (float) $movement->quantity > 0);
                $incomingQuantity = (float) $incoming->sum('quantity');
                $incomingValue = (float) $incoming->sum(function (InventoryMovement $movement) {
                    if ($movement->total_amount !== null) {
                        return (float) $movement->total_amount;
                    }

                    return (float) $movement->quantity * (float) ($movement->unit_price ?? 0);
                });

                $averageUnitPrice = $incomingQuantity > 0 ? $incomingValue / $incomingQuantity : 0.0;

                return $stock * $averageUnitPrice;
            });
    }

    private function inventoryDebtOutstandingAsOf(CarbonImmutable $end): float
    {
        if (!Schema::hasTable('inventory_debts')) {
            return 0.0;
        }

        return (float) InventoryDebt::query()
            ->whereDate('created_at', '<=', $end->toDateString())
            ->get()
            ->sum(fn (InventoryDebt $debt) => max(0, (float) ($debt->original_amount ?? 0) - (float) ($debt->paid_amount ?? 0)));
    }

    private function borrowerOutstandingAsOf(CarbonImmutable $end): float
    {
        if (!Schema::hasTable('borrower_loans')) {
            return 0.0;
        }

        return (float) BorrowerLoan::query()
            ->with(['payments' => fn ($query) => $query->whereDate('payment_date', '<=', $end->toDateString())])
            ->whereDate('occurred_at', '<=', $end->toDateString())
            ->get()
            ->sum(fn (BorrowerLoan $loan) => max(0, (float) $loan->amount - (float) $loan->payments->sum('amount')));
    }

    private function overdueAgingRows(Collection $invoices, CarbonImmutable $asOfDate): array
    {
        $buckets = [
            'overdue_1_30' => ['key' => 'overdue_1_30', 'label' => '1-30 Hari', 'invoice_count' => 0, 'amount' => 0.0],
            'overdue_31_60' => ['key' => 'overdue_31_60', 'label' => '31-60 Hari', 'invoice_count' => 0, 'amount' => 0.0],
            'overdue_61_90' => ['key' => 'overdue_61_90', 'label' => '61-90 Hari', 'invoice_count' => 0, 'amount' => 0.0],
            'overdue_90_plus' => ['key' => 'overdue_90_plus', 'label' => '>90 Hari', 'invoice_count' => 0, 'amount' => 0.0],
        ];

        foreach ($invoices as $invoice) {
            if (!$invoice->due_date) {
                continue;
            }

            $days = max(1, $invoice->due_date->diffInDays($asOfDate));
            $bucketKey = match (true) {
                $days <= 30 => 'overdue_1_30',
                $days <= 60 => 'overdue_31_60',
                $days <= 90 => 'overdue_61_90',
                default => 'overdue_90_plus',
            };

            $buckets[$bucketKey]['invoice_count']++;
            $buckets[$bucketKey]['amount'] += (float) $invoice->amount;
        }

        return array_values($buckets);
    }

    private function invoiceGroupRows(Collection $invoices, callable $labelResolver): array
    {
        return $invoices
            ->groupBy(fn (Invoice $invoice) => $labelResolver($invoice) ?: 'Tidak Terdata')
            ->map(fn (Collection $rows, string $label) => [
                'label' => $label,
                'count' => $rows->count(),
                'customer_count' => $rows->pluck('customer_id')->unique()->count(),
                'total' => (float) $rows->sum('amount'),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    private function customerGroupRows(Collection $customers, callable $labelResolver, string $sumField): array
    {
        return $customers
            ->groupBy(fn (Customer $customer) => $labelResolver($customer) ?: 'Tidak Terdata')
            ->map(fn (Collection $rows, string $label) => [
                'label' => $label,
                'count' => $rows->count(),
                'total' => (float) $rows->sum($sumField),
            ])
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function terminationGroupRows(Collection $terminations): array
    {
        return $terminations
            ->groupBy(fn (CustomerTerminationRequest $request) => $this->regionLabel($request->customer))
            ->map(fn (Collection $rows, string $label) => [
                'label' => $label ?: 'Tidak Terdata',
                'count' => $rows->count(),
            ])
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function transactionGroupRows(Collection $transactions, string $field): array
    {
        return $transactions
            ->groupBy(fn (FinancialTransaction $transaction) => $transaction->{$field} ?: 'Lainnya')
            ->map(fn (Collection $rows, string $label) => [
                'label' => $label,
                'count' => $rows->count(),
                'total' => (float) $rows->sum('amount'),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    private function packageLabel(?Customer $customer): string
    {
        if (!$customer) {
            return 'Tidak Terdata';
        }

        return $customer->package?->name
            ?: $customer->package_type
            ?: $customer->custom_package
            ?: 'Tanpa Paket';
    }

    private function regionLabel(?Customer $customer): string
    {
        if (!$customer) {
            return 'Tidak Terdata';
        }

        if ($customer->dusun?->name) {
            return $customer->dusun->name;
        }

        if ($customer->desa?->name) {
            return $customer->desa->name;
        }

        if ($customer->kecamatan?->name) {
            return $customer->kecamatan->name;
        }

        return $customer->area_code ?: ($customer->address ?: 'Tidak Terdata');
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
}

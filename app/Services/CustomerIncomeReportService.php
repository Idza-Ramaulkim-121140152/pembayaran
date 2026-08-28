<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class CustomerIncomeReportService
{
    public function __construct(
        private CustomerInstallationCostSnapshotService $snapshotService,
    ) {
    }

    public function build(array $filters = []): array
    {
        $paidInvoices = Invoice::query()
            ->select(['id', 'customer_id', 'invoice_link', 'amount', 'paid_at'])
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->get();

        $invoiceTotals = $paidInvoices
            ->groupBy('customer_id')
            ->map(fn (Collection $rows) => (float) $rows->sum('amount'));

        $invoiceRows = $paidInvoices
            ->groupBy('customer_id')
            ->map(fn (Collection $rows) => $rows->map(fn (Invoice $invoice) => [
                'invoice_id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
                'paid_at' => $invoice->paid_at?->toDateTimeString(),
                'amount' => (float) $invoice->amount,
            ])->values()->all());

        $installationIncomeTotals = $this->installationIncomeTotals();
        $snapshotCustomerIds = Schema::hasTable('customer_installation_cost_snapshots')
            ? \App\Models\CustomerInstallationCostSnapshot::query()->pluck('customer_id')
            : collect();

        $customerIds = collect()
            ->merge(Customer::query()->whereNotNull('activation_date')->pluck('id'))
            ->merge($invoiceTotals->keys())
            ->merge($installationIncomeTotals->keys())
            ->merge($snapshotCustomerIds)
            ->unique()
            ->values();

        $customers = Customer::query()
            ->with('installationCostSnapshot')
            ->whereIn('id', $customerIds)
            ->orderBy('name')
            ->get();

        $allRows = $customers->map(function (Customer $customer) use ($invoiceTotals, $invoiceRows, $installationIncomeTotals) {
            $snapshot = $this->snapshotService->resolveForReport($customer);
            $effectiveRouterUsed = true;
            $effectiveInstallationCost = $this->calculateEffectiveInstallationCost($snapshot, $effectiveRouterUsed);
            $installationIncome = (float) ($installationIncomeTotals[$customer->id] ?? 0);
            $invoiceIncome = (float) ($invoiceTotals[$customer->id] ?? 0);
            $totalIncome = $installationIncome + $invoiceIncome;
            $margin = $totalIncome - $effectiveInstallationCost;
            $cableMaterialRate = (float) ($snapshot['cable_material_price_per_meter'] ?? $snapshot['cable_price_per_meter'] ?? 0);
            $cablePayrollRate = (float) ($snapshot['cable_payroll_price_per_meter'] ?? 0);
            $cableCombinedRate = $cableMaterialRate + $cablePayrollRate;
            $costBreakdown = [
                'cable_used_meter' => (float) ($snapshot['cable_used_meter'] ?? 0),
                'cable_price_per_meter' => $cableMaterialRate,
                'cable_material_price_per_meter' => $cableMaterialRate,
                'cable_payroll_price_per_meter' => $cablePayrollRate,
                'cable_payroll_source' => (string) ($snapshot['cable_payroll_source'] ?? 'snapshot'),
                'cable_combined_price_per_meter' => $cableCombinedRate,
                'cable_total' => (float) ($snapshot['cable_total'] ?? ((float) ($snapshot['cable_used_meter'] ?? 0) * $cableCombinedRate)),
                'connector_quantity' => (int) ($snapshot['connector_quantity'] ?? 0),
                'connector_unit_price' => (float) ($snapshot['connector_unit_price'] ?? 0),
                'connector_total' => (int) ($snapshot['connector_quantity'] ?? 0) * (float) ($snapshot['connector_unit_price'] ?? 0),
                'router_used' => $effectiveRouterUsed,
                'router_unit_price' => (float) ($snapshot['router_unit_price'] ?? 0),
                'router_total' => $effectiveRouterUsed ? (float) ($snapshot['router_unit_price'] ?? 0) : 0.0,
                'labor_fee' => (float) ($snapshot['labor_fee'] ?? 0),
            ];
            $hasCable = $costBreakdown['cable_used_meter'] > 0;
            $detailPayload = [
                'customer' => [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'phone' => $customer->phone,
                    'activation_date' => $customer->activation_date?->toDateString() ?? ($snapshot['installation_date'] ?? null),
                ],
                'status' => $margin > 0 ? 'untung' : ($margin < 0 ? 'rugi' : 'impas'),
                'installation_cost_total' => $effectiveInstallationCost,
                'total_customer_income' => $totalIncome,
                'installation_income_total' => $installationIncome,
                'invoice_income_total' => $invoiceIncome,
                'gross_margin' => $margin,
                'is_estimated' => (bool) ($snapshot['is_estimated'] ?? false),
                'estimation_notes' => $snapshot['estimation_notes'] ?? null,
                'snapshot_label' => $snapshot['pricing_basis_label'] ?? null,
                'cost_breakdown' => $costBreakdown,
                'invoices' => Arr::wrap($invoiceRows[$customer->id] ?? []),
            ];

            return [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'activation_date' => $customer->activation_date?->toDateString() ?? ($snapshot['installation_date'] ?? null),
                'installation_cost_total' => $effectiveInstallationCost,
                'installation_income_total' => $installationIncome,
                'invoice_income_total' => $invoiceIncome,
                'total_customer_income' => $totalIncome,
                'gross_margin' => $margin,
                'profit_status' => $margin > 0 ? 'untung' : ($margin < 0 ? 'rugi' : 'impas'),
                'is_estimated' => (bool) ($snapshot['is_estimated'] ?? false),
                'estimation_notes' => $snapshot['estimation_notes'] ?? null,
                'snapshot_source' => $snapshot['source'] ?? 'fallback',
                'snapshot_label' => $snapshot['pricing_basis_label'] ?? null,
                'has_cable' => $hasCable,
                'cable_used_meter' => $costBreakdown['cable_used_meter'],
                'cost_breakdown' => $costBreakdown,
                'invoices' => $detailPayload['invoices'],
                'detail_payload' => $detailPayload,
            ];
        });

        $rows = $this->applyFilters($allRows, $filters)->values();

        return [
            'summary' => $this->buildSummary($allRows),
            'rows' => $rows->all(),
            'meta' => [
                'filters' => [
                    'search' => trim((string) ($filters['search'] ?? '')),
                    'profit_status' => $filters['profit_status'] ?? 'all',
                    'include_estimated' => array_key_exists('include_estimated', $filters) ? (bool) $filters['include_estimated'] : true,
                    'has_cable_only' => array_key_exists('has_cable_only', $filters) ? (bool) $filters['has_cable_only'] : false,
                ],
            ],
        ];
    }

    private function installationIncomeTotals(): Collection
    {
        if (!Schema::hasTable('financial_transactions')) {
            return collect();
        }

        return FinancialTransaction::query()
            ->selectRaw('reference_id, COALESCE(SUM(amount), 0) as total')
            ->where('source', 'installation_income')
            ->where('reference_type', Customer::class)
            ->where('type', 'income')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->groupBy('reference_id')
            ->pluck('total', 'reference_id');
    }

    private function applyFilters(Collection $rows, array $filters): Collection
    {
        $profitStatus = (string) ($filters['profit_status'] ?? 'all');
        $includeEstimated = !array_key_exists('include_estimated', $filters) || filter_var($filters['include_estimated'], FILTER_VALIDATE_BOOL);
        $hasCableOnly = array_key_exists('has_cable_only', $filters) && filter_var($filters['has_cable_only'], FILTER_VALIDATE_BOOL);

        return $rows->filter(function (array $row) use ($profitStatus, $includeEstimated, $hasCableOnly) {
            if ($profitStatus !== 'all' && $row['profit_status'] !== $profitStatus) {
                return false;
            }

            if (!$includeEstimated && $row['is_estimated']) {
                return false;
            }

            if ($hasCableOnly && !(bool) ($row['has_cable'] ?? false)) {
                return false;
            }

            return true;
        });
    }

    private function buildSummary(Collection $rows): array
    {
        $best = $rows->sortByDesc('gross_margin')->first();
        $worst = $rows->sortBy('gross_margin')->first();

        return [
            'customer_count' => $rows->count(),
            'installation_cost_total' => (float) $rows->sum('installation_cost_total'),
            'installation_income_total' => (float) $rows->sum('installation_income_total'),
            'invoice_income_total' => (float) $rows->sum('invoice_income_total'),
            'total_margin' => (float) $rows->sum('gross_margin'),
            'estimated_count' => (int) $rows->where('is_estimated', true)->count(),
            'most_profitable_customer' => $best ? [
                'customer_id' => $best['customer_id'],
                'customer_name' => $best['customer_name'],
                'gross_margin' => (float) $best['gross_margin'],
            ] : null,
            'least_profitable_customer' => $worst ? [
                'customer_id' => $worst['customer_id'],
                'customer_name' => $worst['customer_name'],
                'gross_margin' => (float) $worst['gross_margin'],
            ] : null,
        ];
    }

    private function calculateEffectiveInstallationCost(array $snapshot, bool $routerUsed): float
    {
        $cableMaterialRate = (float) ($snapshot['cable_material_price_per_meter'] ?? $snapshot['cable_price_per_meter'] ?? 0);
        $cablePayrollRate = (float) ($snapshot['cable_payroll_price_per_meter'] ?? 0);
        $cableTotal = (float) ($snapshot['cable_total'] ?? ((float) ($snapshot['cable_used_meter'] ?? 0) * ($cableMaterialRate + $cablePayrollRate)));
        $connectorTotal = (int) ($snapshot['connector_quantity'] ?? 0) * (float) ($snapshot['connector_unit_price'] ?? 0);
        $routerTotal = $routerUsed ? (float) ($snapshot['router_unit_price'] ?? 0) : 0.0;
        $laborFee = (float) ($snapshot['labor_fee'] ?? 0);

        return $cableTotal + $connectorTotal + $routerTotal + $laborFee;
    }
}

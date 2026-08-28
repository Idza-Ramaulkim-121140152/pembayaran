<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\ProjectReport;
use App\Models\ProjectReportManualExpense;
use App\Models\ProjectReportWilayahMapping;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ProjectReportService
{
    public function __construct(
        private CustomerInstallationCostSnapshotService $snapshotService,
    ) {
    }

    public function index(): array
    {
        $projects = ProjectReport::query()
            ->with(['wilayahMappings', 'customers:id,name', 'manualExpenses'])
            ->orderByDesc('starts_at')
            ->orderBy('name')
            ->get();

        $rows = $projects->map(fn (ProjectReport $project) => $this->buildProjectPayload($project, false));

        return [
            'summary' => [
                'project_count' => $rows->count(),
                'active_project_count' => (int) $projects->where('is_active', true)->count(),
                'customer_count' => (int) $rows->sum('customer_count'),
                'wilayah_count' => (int) $rows->sum('wilayah_count'),
                'total_income' => (float) $rows->sum('total_income'),
                'total_expense' => (float) $rows->sum('total_expense'),
                'total_margin' => (float) $rows->sum('margin'),
            ],
            'rows' => $rows->values()->all(),
        ];
    }

    public function detail(ProjectReport $projectReport): array
    {
        $projectReport->load([
            'wilayahMappings',
            'manualExpenses',
            'customers.kecamatan:id,name',
            'customers.desa:id,name',
            'customers.dusun:id,name',
            'customers.installationCostSnapshot',
        ]);

        return $this->buildProjectPayload($projectReport, true);
    }

    public function options(): array
    {
        $wilayah = MasterWilayahKecamatan::query()
            ->with([
                'desas' => fn ($desaQuery) => $desaQuery->orderBy('name')->with([
                    'dusuns' => fn ($dusunQuery) => $dusunQuery->orderBy('name'),
                ]),
            ])
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        $customers = Customer::query()
            ->with(['kecamatan:id,name', 'desa:id,name', 'dusun:id,name'])
            ->orderBy('name')
            ->get(['id', 'name', 'pppoe_username', 'phone', 'is_active', 'kecamatan_id', 'desa_id', 'dusun_id'])
            ->map(fn (Customer $customer) => [
                'id' => $customer->id,
                'name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'is_active' => (bool) $customer->is_active,
                'kecamatan_id' => $customer->kecamatan_id,
                'desa_id' => $customer->desa_id,
                'dusun_id' => $customer->dusun_id,
                'wilayah_label' => $customer->dusun?->name ?: ($customer->desa?->name ?: ($customer->kecamatan?->name ?: '-')),
            ])
            ->values()
            ->all();

        return [
            'wilayah_hierarchy' => $wilayah,
            'customers' => $customers,
        ];
    }

    public function store(array $payload): ProjectReport
    {
        return DB::transaction(function () use ($payload) {
            $projectReport = ProjectReport::query()->create([
                'name' => trim((string) $payload['name']),
                'notes' => $payload['notes'] ?? null,
                'starts_at' => $payload['starts_at'] ?? null,
                'ends_at' => $payload['ends_at'] ?? null,
                'is_active' => array_key_exists('is_active', $payload) ? (bool) $payload['is_active'] : true,
            ]);

            $this->syncRelations($projectReport, $payload);

            return $projectReport->fresh();
        });
    }

    public function update(ProjectReport $projectReport, array $payload): ProjectReport
    {
        return DB::transaction(function () use ($projectReport, $payload) {
            $projectReport->update([
                'name' => trim((string) $payload['name']),
                'notes' => $payload['notes'] ?? null,
                'starts_at' => $payload['starts_at'] ?? null,
                'ends_at' => $payload['ends_at'] ?? null,
                'is_active' => array_key_exists('is_active', $payload) ? (bool) $payload['is_active'] : true,
            ]);

            $this->syncRelations($projectReport, $payload);

            return $projectReport->fresh();
        });
    }

    private function syncRelations(ProjectReport $projectReport, array $payload): void
    {
        $projectReport->customers()->sync(collect($payload['customer_ids'] ?? [])->map(fn ($id) => (int) $id)->all());

        $projectReport->wilayahMappings()->delete();
        foreach ($payload['wilayah_mappings'] ?? [] as $mapping) {
            $projectReport->wilayahMappings()->create([
                'wilayah_level' => (string) $mapping['level'],
                'wilayah_id' => (int) $mapping['id'],
                'label_snapshot' => $this->resolveWilayahLabel((string) $mapping['level'], (int) $mapping['id']),
            ]);
        }

        $projectReport->manualExpenses()->delete();
        foreach ($payload['manual_expenses'] ?? [] as $expense) {
            $quantity = (float) ($expense['quantity'] ?? 0);
            $unitPrice = (float) ($expense['unit_price'] ?? 0);

            $projectReport->manualExpenses()->create([
                'name' => trim((string) ($expense['name'] ?? '')),
                'category' => $expense['category'] ?? null,
                'quantity' => $quantity,
                'unit' => $expense['unit'] ?? null,
                'unit_price' => $unitPrice,
                'subtotal' => $quantity * $unitPrice,
                'notes' => $expense['notes'] ?? null,
            ]);
        }
    }

    private function buildProjectPayload(ProjectReport $projectReport, bool $includeDetail): array
    {
        $projectReport->loadMissing([
            'wilayahMappings',
            'manualExpenses',
            'customers.kecamatan:id,name',
            'customers.desa:id,name',
            'customers.dusun:id,name',
            'customers.installationCostSnapshot',
        ]);

        $customers = $projectReport->customers;
        $customerRows = $this->buildCustomerRows($customers);
        $customerInstallationExpense = (float) $customerRows->sum('installation_cost_total');
        $installationIncome = (float) $customerRows->sum('installation_income_total');
        $invoiceIncome = (float) $customerRows->sum('invoice_income_total');
        $manualExpense = (float) $projectReport->manualExpenses->sum(fn (ProjectReportManualExpense $expense) => (float) $expense->subtotal);
        $totalIncome = $installationIncome + $invoiceIncome;
        $totalExpense = $customerInstallationExpense + $manualExpense;
        $margin = $totalIncome - $totalExpense;

        $payload = [
            'id' => $projectReport->id,
            'name' => $projectReport->name,
            'notes' => $projectReport->notes,
            'starts_at' => $projectReport->starts_at?->toDateString(),
            'ends_at' => $projectReport->ends_at?->toDateString(),
            'is_active' => (bool) $projectReport->is_active,
            'status' => $margin > 0 ? 'untung' : ($margin < 0 ? 'rugi' : 'impas'),
            'customer_count' => $customers->count(),
            'wilayah_count' => $projectReport->wilayahMappings->count(),
            'manual_expense_count' => $projectReport->manualExpenses->count(),
            'installation_income_total' => $installationIncome,
            'invoice_income_total' => $invoiceIncome,
            'total_income' => $totalIncome,
            'customer_installation_expense_total' => $customerInstallationExpense,
            'manual_expense_total' => $manualExpense,
            'total_expense' => $totalExpense,
            'margin' => $margin,
            'wilayah_mappings' => $projectReport->wilayahMappings->map(fn (ProjectReportWilayahMapping $mapping) => [
                'id' => $mapping->id,
                'level' => $mapping->wilayah_level,
                'wilayah_id' => (int) $mapping->wilayah_id,
                'label' => $mapping->label_snapshot ?: $this->resolveWilayahLabel($mapping->wilayah_level, (int) $mapping->wilayah_id),
            ])->values()->all(),
        ];

        if (!$includeDetail) {
            return $payload;
        }

        return array_merge($payload, [
            'breakdown' => [
                'income' => [
                    'installation_income_total' => $installationIncome,
                    'invoice_income_total' => $invoiceIncome,
                    'total_income' => $totalIncome,
                ],
                'expense' => [
                    'customer_installation_total' => $customerInstallationExpense,
                    'manual_expenses_total' => $manualExpense,
                    'total_expense' => $totalExpense,
                ],
            ],
            'customers' => $customerRows->values()->all(),
            'manual_expenses' => $projectReport->manualExpenses->map(fn (ProjectReportManualExpense $expense) => [
                'id' => $expense->id,
                'name' => $expense->name,
                'category' => $expense->category,
                'quantity' => (float) $expense->quantity,
                'unit' => $expense->unit,
                'unit_price' => (float) $expense->unit_price,
                'subtotal' => (float) $expense->subtotal,
                'notes' => $expense->notes,
            ])->values()->all(),
        ]);
    }

    private function buildCustomerRows(Collection $customers): Collection
    {
        $customerIds = $customers->pluck('id')->values();

        $paidInvoices = Invoice::query()
            ->select(['id', 'customer_id', 'invoice_link', 'amount', 'paid_at'])
            ->whereIn('customer_id', $customerIds)
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

        $installationIncomeTotals = FinancialTransaction::query()
            ->selectRaw('reference_id, COALESCE(SUM(amount), 0) as total')
            ->where('source', 'installation_income')
            ->where('reference_type', Customer::class)
            ->where('type', 'income')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereIn('reference_id', $customerIds)
            ->groupBy('reference_id')
            ->pluck('total', 'reference_id');

        return $customers->map(function (Customer $customer) use ($invoiceRows, $invoiceTotals, $installationIncomeTotals) {
            $snapshot = $this->snapshotService->resolveForReport($customer);
            $installationIncome = (float) ($installationIncomeTotals[$customer->id] ?? 0);
            $invoiceIncome = (float) ($invoiceTotals[$customer->id] ?? 0);
            $costBreakdown = $this->buildCustomerCostBreakdown($snapshot);
            $installationCost = (float) $costBreakdown['installation_cost_total'];

            return [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'wilayah_label' => $customer->dusun?->name ?: ($customer->desa?->name ?: ($customer->kecamatan?->name ?: '-')),
                'installation_cost_total' => $installationCost,
                'installation_income_total' => $installationIncome,
                'invoice_income_total' => $invoiceIncome,
                'total_income' => $installationIncome + $invoiceIncome,
                'margin' => ($installationIncome + $invoiceIncome) - $installationCost,
                'is_estimated' => (bool) ($snapshot['is_estimated'] ?? false),
                'estimation_notes' => $snapshot['estimation_notes'] ?? null,
                'snapshot_source' => $snapshot['source'] ?? 'fallback',
                'cost_breakdown' => $costBreakdown,
                'invoices' => Arr::wrap($invoiceRows[$customer->id] ?? []),
            ];
        });
    }

    private function buildCustomerCostBreakdown(array $snapshot): array
    {
        $effectiveRouterUsed = true;
        $cableMaterialRate = (float) ($snapshot['cable_material_price_per_meter'] ?? $snapshot['cable_price_per_meter'] ?? 0);
        $cablePayrollRate = (float) ($snapshot['cable_payroll_price_per_meter'] ?? 0);
        $cableCombinedRate = $cableMaterialRate + $cablePayrollRate;
        $cableTotal = (float) ($snapshot['cable_total'] ?? ((float) ($snapshot['cable_used_meter'] ?? 0) * $cableCombinedRate));
        $connectorQuantity = (int) ($snapshot['connector_quantity'] ?? 0);
        $connectorUnitPrice = (float) ($snapshot['connector_unit_price'] ?? 0);
        $connectorTotal = $connectorQuantity * $connectorUnitPrice;
        $routerUnitPrice = (float) ($snapshot['router_unit_price'] ?? 0);
        $routerTotal = $effectiveRouterUsed ? $routerUnitPrice : 0.0;
        $laborFee = (float) ($snapshot['labor_fee'] ?? 0);

        return [
            'cable_used_meter' => (float) ($snapshot['cable_used_meter'] ?? 0),
            'cable_price_per_meter' => $cableMaterialRate,
            'cable_material_price_per_meter' => $cableMaterialRate,
            'cable_payroll_price_per_meter' => $cablePayrollRate,
            'cable_payroll_source' => (string) ($snapshot['cable_payroll_source'] ?? 'snapshot'),
            'cable_combined_price_per_meter' => $cableCombinedRate,
            'cable_total' => $cableTotal,
            'connector_quantity' => $connectorQuantity,
            'connector_unit_price' => $connectorUnitPrice,
            'connector_total' => $connectorTotal,
            'router_used' => $effectiveRouterUsed,
            'router_unit_price' => $routerUnitPrice,
            'router_total' => $routerTotal,
            'labor_fee' => $laborFee,
            'installation_cost_total' => $cableTotal + $connectorTotal + $routerTotal + $laborFee,
        ];
    }

    public function validateWilayahMappings(array $mappings): array
    {
        $errors = [];

        foreach ($mappings as $index => $mapping) {
            $level = (string) ($mapping['level'] ?? '');
            $id = (int) ($mapping['id'] ?? 0);

            if ($level === '' || $id <= 0) {
                $errors["wilayah_mappings.$index.id"] = 'Wilayah project wajib valid.';
                continue;
            }

            $exists = match ($level) {
                'kecamatan' => MasterWilayahKecamatan::query()->whereKey($id)->exists(),
                'desa' => MasterWilayahDesa::query()->whereKey($id)->exists(),
                'dusun' => MasterWilayahDusun::query()->whereKey($id)->exists(),
                default => false,
            };

            if (!$exists) {
                $errors["wilayah_mappings.$index.id"] = 'Wilayah project tidak ditemukan.';
            }
        }

        return $errors;
    }

    private function resolveWilayahLabel(string $level, int $id): string
    {
        return match ($level) {
            'kecamatan' => MasterWilayahKecamatan::query()->whereKey($id)->value('name') ?? "Kecamatan #{$id}",
            'desa' => MasterWilayahDesa::query()->whereKey($id)->value('name') ?? "Desa #{$id}",
            'dusun' => MasterWilayahDusun::query()->whereKey($id)->value('name') ?? "Dusun #{$id}",
            default => "Wilayah #{$id}",
        };
    }
}

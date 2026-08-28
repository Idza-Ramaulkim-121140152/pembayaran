<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\InstallationWorkOrder;
use App\Models\PayrollProject;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class InstallationReportService
{
    public function __construct(
        private CustomerInstallationCostSnapshotService $snapshotService,
    ) {
    }

    public function build(array $filters = []): array
    {
        $filters = $this->normalizeFilters($filters);
        $customers = $this->baseCustomerQuery($filters)->get();
        $customerIds = $customers->pluck('id')->values();
        $installationIncomeTotals = $this->installationIncomeTotals($customerIds);
        $workOrdersByCustomer = $this->workOrdersByCustomer($customerIds);

        $rows = $customers->map(function (Customer $customer) use ($installationIncomeTotals, $workOrdersByCustomer) {
            $snapshot = $this->snapshotService->resolveForReport($customer);
            $workOrder = $workOrdersByCustomer->get($customer->id);
            $costBreakdown = $this->buildCostBreakdown($snapshot);
            $installationCost = (float) array_sum([
                $costBreakdown['cable_total'],
                $costBreakdown['connector_total'],
                $costBreakdown['router_total'],
                $costBreakdown['labor_fee'],
            ]);
            $installationIncome = (float) ($installationIncomeTotals[$customer->id] ?? 0);
            $installationFeeFallback = (float) ($customer->installation_fee ?? 0);
            $margin = $installationIncome - $installationCost;
            $payrollProject = $this->resolvePayrollProject($snapshot);
            $installers = $this->resolveInstallers($payrollProject, $workOrder);
            $checklist = $this->workOrderChecklistPayload($workOrder);

            return [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'package_label' => $customer->package?->name ?: ($customer->package_type ?: ($customer->custom_package ?: '-')),
                'activation_date' => $customer->activation_date?->toDateString(),
                'region_label' => $this->regionLabel($customer),
                'kecamatan_id' => $customer->kecamatan_id,
                'desa_id' => $customer->desa_id,
                'dusun_id' => $customer->dusun_id,
                'installation_income_total' => $installationIncome,
                'installation_fee_fallback' => $installationFeeFallback,
                'installation_cost_total' => $installationCost,
                'gross_margin' => $margin,
                'profit_status' => $margin > 0 ? 'untung' : ($margin < 0 ? 'rugi' : 'impas'),
                'is_estimated' => (bool) ($snapshot['is_estimated'] ?? false),
                'has_snapshot' => !empty($snapshot['id']),
                'snapshot_source' => $snapshot['source'] ?? 'fallback',
                'snapshot_label' => $snapshot['pricing_basis_label'] ?? null,
                'estimation_notes' => $snapshot['estimation_notes'] ?? null,
                'cost_breakdown' => $costBreakdown,
                'payroll_project' => $payrollProject ? [
                    'id' => $payrollProject->id,
                    'tanggal' => $payrollProject->tanggal?->toDateString(),
                    'total' => (float) $payrollProject->total,
                    'status' => $payrollProject->status,
                    'catatan' => $payrollProject->catatan,
                ] : null,
                'installers' => $installers,
                'work_order' => $workOrder ? [
                    'id' => $workOrder->id,
                    'status' => $workOrder->status,
                    'scheduled_at' => $workOrder->scheduled_at?->toDateTimeString(),
                    'completed_at' => $workOrder->completed_at?->toDateTimeString(),
                    'assignee_name' => $workOrder->assignee?->name,
                    'checklist' => $checklist,
                    'is_incomplete' => !in_array($workOrder->status, ['completed', 'cancelled'], true),
                ] : null,
                'detail_payload' => [
                    'customer' => [
                        'id' => $customer->id,
                        'name' => $customer->name,
                        'pppoe_username' => $customer->pppoe_username,
                        'phone' => $customer->phone,
                        'activation_date' => $customer->activation_date?->toDateString(),
                    ],
                    'region_label' => $this->regionLabel($customer),
                    'installation_income_total' => $installationIncome,
                    'installation_fee_fallback' => $installationFeeFallback,
                    'installation_cost_total' => $installationCost,
                    'gross_margin' => $margin,
                    'profit_status' => $margin > 0 ? 'untung' : ($margin < 0 ? 'rugi' : 'impas'),
                    'cost_breakdown' => $costBreakdown,
                    'is_estimated' => (bool) ($snapshot['is_estimated'] ?? false),
                    'estimation_notes' => $snapshot['estimation_notes'] ?? null,
                    'snapshot_label' => $snapshot['pricing_basis_label'] ?? null,
                    'payroll_project' => $payrollProject?->only(['id', 'status', 'catatan']),
                    'work_order' => $workOrder ? [
                        'id' => $workOrder->id,
                        'status' => $workOrder->status,
                        'assignee_name' => $workOrder->assignee?->name,
                        'scheduled_at' => $workOrder->scheduled_at?->toDateTimeString(),
                        'completed_at' => $workOrder->completed_at?->toDateTimeString(),
                        'checklist' => $checklist,
                    ] : null,
                ],
            ];
        });

        $rows = $this->applyPostFilters($rows, $filters)->values();

        return [
            'summary' => $this->buildSummary($rows),
            'operational_health' => $this->buildOperationalHealth($rows),
            'by_region' => $this->groupByRegion($rows),
            'by_installer' => $this->groupByInstaller($rows),
            'material_efficiency' => $this->buildMaterialEfficiency($rows),
            'rows' => $rows->all(),
            'meta' => [
                'filters' => $filters,
            ],
        ];
    }

    private function normalizeFilters(array $filters): array
    {
        $start = trim((string) ($filters['start_date'] ?? now()->startOfMonth()->toDateString()));
        $end = trim((string) ($filters['end_date'] ?? now()->endOfMonth()->toDateString()));
        $profitStatus = (string) ($filters['profit_status'] ?? 'all');
        $wilayahLevel = (string) ($filters['wilayah_level'] ?? 'all');

        return [
            'start_date' => $start,
            'end_date' => $end,
            'search' => trim((string) ($filters['search'] ?? '')),
            'profit_status' => in_array($profitStatus, ['all', 'untung', 'rugi', 'impas'], true) ? $profitStatus : 'all',
            'wilayah_level' => in_array($wilayahLevel, ['all', 'kecamatan', 'desa', 'dusun'], true) ? $wilayahLevel : 'all',
            'wilayah_id' => $filters['wilayah_id'] ?? null,
            'include_estimated' => array_key_exists('include_estimated', $filters) ? (bool) $filters['include_estimated'] : true,
        ];
    }

    private function baseCustomerQuery(array $filters)
    {
        $query = Customer::query()
            ->with(['package:id,name', 'kecamatan:id,name', 'desa:id,name,kecamatan_id', 'dusun:id,name,desa_id'])
            ->whereNotNull('activation_date')
            ->whereBetween('activation_date', [$filters['start_date'], $filters['end_date']])
            ->orderByDesc('activation_date')
            ->orderBy('name');

        if ($filters['search'] !== '') {
            $search = $filters['search'];
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('pppoe_username', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($filters['wilayah_level'] !== 'all' && $filters['wilayah_id']) {
            $query->where($filters['wilayah_level'] . '_id', (int) $filters['wilayah_id']);
        }

        return $query;
    }

    private function installationIncomeTotals(Collection $customerIds): Collection
    {
        if ($customerIds->isEmpty() || !Schema::hasTable('financial_transactions')) {
            return collect();
        }

        return FinancialTransaction::query()
            ->selectRaw('reference_id, COALESCE(SUM(amount), 0) as total')
            ->where('source', 'installation_income')
            ->where('reference_type', Customer::class)
            ->where('type', 'income')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereIn('reference_id', $customerIds)
            ->groupBy('reference_id')
            ->pluck('total', 'reference_id');
    }

    private function workOrdersByCustomer(Collection $customerIds): Collection
    {
        if ($customerIds->isEmpty() || !Schema::hasTable('installation_work_orders')) {
            return collect();
        }

        return InstallationWorkOrder::query()
            ->with(['assignee:id,name', 'checklists:id,installation_work_order_id,is_required,is_completed'])
            ->whereIn('customer_id', $customerIds)
            ->orderByRaw("CASE WHEN status = 'completed' THEN 0 ELSE 1 END")
            ->orderByDesc('completed_at')
            ->orderByDesc('scheduled_at')
            ->get()
            ->unique('customer_id')
            ->keyBy('customer_id');
    }

    private function buildCostBreakdown(array $snapshot): array
    {
        $cableMaterialRate = (float) ($snapshot['cable_material_price_per_meter'] ?? $snapshot['cable_price_per_meter'] ?? 0);
        $cablePayrollRate = (float) ($snapshot['cable_payroll_price_per_meter'] ?? 0);
        $cableUsed = (float) ($snapshot['cable_used_meter'] ?? 0);
        $cableTotal = (float) ($snapshot['cable_total'] ?? ($cableUsed * ($cableMaterialRate + $cablePayrollRate)));
        $connectorQuantity = (int) ($snapshot['connector_quantity'] ?? 0);
        $connectorUnitPrice = (float) ($snapshot['connector_unit_price'] ?? 0);
        $routerUnitPrice = (float) ($snapshot['router_unit_price'] ?? 0);

        return [
            'cable_used_meter' => $cableUsed,
            'cable_material_price_per_meter' => $cableMaterialRate,
            'cable_payroll_price_per_meter' => $cablePayrollRate,
            'cable_payroll_source' => (string) ($snapshot['cable_payroll_source'] ?? 'snapshot'),
            'cable_combined_price_per_meter' => $cableMaterialRate + $cablePayrollRate,
            'cable_total' => $cableTotal,
            'connector_quantity' => $connectorQuantity,
            'connector_unit_price' => $connectorUnitPrice,
            'connector_total' => $connectorQuantity * $connectorUnitPrice,
            'router_used' => true,
            'router_unit_price' => $routerUnitPrice,
            'router_total' => $routerUnitPrice,
            'labor_fee' => (float) ($snapshot['labor_fee'] ?? 0),
        ];
    }

    private function resolvePayrollProject(array $snapshot): ?PayrollProject
    {
        $payrollProjectId = Arr::get($snapshot, 'meta.payroll_project_id');

        if (!$payrollProjectId || !Schema::hasTable('payroll_projects')) {
            return null;
        }

        return PayrollProject::query()
            ->with('members:id,nama')
            ->find((int) $payrollProjectId);
    }

    private function resolveInstallers(?PayrollProject $payrollProject, ?InstallationWorkOrder $workOrder): array
    {
        if ($payrollProject) {
            return $payrollProject->members->map(fn ($member) => [
                'source' => 'payroll_project',
                'id' => $member->id,
                'name' => $member->nama,
                'payroll_share' => (float) ($member->pivot->bagian ?? 0),
            ])->values()->all();
        }

        if ($workOrder?->assignee) {
            return [[
                'source' => 'work_order',
                'id' => $workOrder->assignee->id,
                'name' => $workOrder->assignee->name,
                'payroll_share' => 0.0,
            ]];
        }

        return [[
            'source' => 'unlinked',
            'id' => null,
            'name' => 'Belum terhubung',
            'payroll_share' => 0.0,
        ]];
    }

    private function workOrderChecklistPayload(?InstallationWorkOrder $workOrder): array
    {
        if (!$workOrder) {
            return ['total' => 0, 'completed' => 0, 'required_total' => 0, 'required_completed' => 0, 'progress_percent' => 0.0];
        }

        $total = $workOrder->checklists->count();
        $completed = $workOrder->checklists->where('is_completed', true)->count();
        $required = $workOrder->checklists->where('is_required', true);
        $requiredTotal = $required->count();
        $requiredCompleted = $required->where('is_completed', true)->count();

        return [
            'total' => $total,
            'completed' => $completed,
            'required_total' => $requiredTotal,
            'required_completed' => $requiredCompleted,
            'progress_percent' => $total > 0 ? round(($completed / $total) * 100, 2) : 0.0,
        ];
    }

    private function applyPostFilters(Collection $rows, array $filters): Collection
    {
        return $rows->filter(function (array $row) use ($filters) {
            if ($filters['profit_status'] !== 'all' && $row['profit_status'] !== $filters['profit_status']) {
                return false;
            }

            if (!$filters['include_estimated'] && (bool) $row['is_estimated']) {
                return false;
            }

            return true;
        });
    }

    private function buildSummary(Collection $rows): array
    {
        $best = $rows->sortByDesc('gross_margin')->first();
        $worst = $rows->sortBy('gross_margin')->first();
        $count = $rows->count();
        $statusCounts = $rows->countBy('profit_status');

        return [
            'installation_count' => $count,
            'installation_income_total' => (float) $rows->sum('installation_income_total'),
            'installation_fee_fallback_total' => (float) $rows->sum('installation_fee_fallback'),
            'installation_cost_total' => (float) $rows->sum('installation_cost_total'),
            'gross_margin_total' => (float) $rows->sum('gross_margin'),
            'estimated_count' => (int) $rows->where('is_estimated', true)->count(),
            'estimated_percent' => $count > 0 ? round(($rows->where('is_estimated', true)->count() / $count) * 100, 2) : 0.0,
            'average_cable_meter' => $count > 0 ? round((float) $rows->sum('cost_breakdown.cable_used_meter') / $count, 2) : 0.0,
            'status_counts' => [
                'untung' => (int) ($statusCounts['untung'] ?? 0),
                'rugi' => (int) ($statusCounts['rugi'] ?? 0),
                'impas' => (int) ($statusCounts['impas'] ?? 0),
            ],
            'dominant_status' => $statusCounts->sortDesc()->keys()->first() ?? 'impas',
            'top_profitable_customer' => $best ? Arr::only($best, ['customer_id', 'customer_name', 'gross_margin']) : null,
            'top_loss_customer' => $worst ? Arr::only($worst, ['customer_id', 'customer_name', 'gross_margin']) : null,
        ];
    }

    private function buildOperationalHealth(Collection $rows): array
    {
        $missingSnapshot = $rows->where('has_snapshot', false)->count();
        $estimated = $rows->where('is_estimated', true)->count();
        $missingPayroll = $rows->filter(fn (array $row) => empty($row['payroll_project']))->count();
        $missingWorkOrder = $rows->filter(fn (array $row) => empty($row['work_order']))->count();
        $incompleteWorkOrder = $rows->filter(fn (array $row) => (bool) ($row['work_order']['is_incomplete'] ?? false))->count();
        $lossInstallations = $rows->where('profit_status', 'rugi')->count();

        return [
            'completed_installations' => $rows->count(),
            'missing_snapshot' => $missingSnapshot,
            'estimated_snapshot' => $estimated,
            'missing_payroll_link' => $missingPayroll,
            'missing_work_order' => $missingWorkOrder,
            'incomplete_work_order' => $incompleteWorkOrder,
            'loss_installations' => $lossInstallations,
        ];
    }

    private function groupByRegion(Collection $rows): array
    {
        return $rows
            ->groupBy('region_label')
            ->map(fn (Collection $group, string $label) => $this->groupPayload($group, $label))
            ->sortByDesc('gross_margin_total')
            ->values()
            ->all();
    }

    private function groupByInstaller(Collection $rows): array
    {
        return $rows
            ->flatMap(function (array $row) {
                return collect($row['installers'] ?? [])->map(fn (array $installer) => [
                    'key' => $installer['source'] . ':' . ($installer['id'] ?? 'unlinked') . ':' . $installer['name'],
                    'label' => $installer['name'],
                    'source' => $installer['source'],
                    'payroll_share' => (float) ($installer['payroll_share'] ?? 0),
                    'row' => $row,
                ]);
            })
            ->groupBy('key')
            ->map(function (Collection $group) {
                $rows = $group->pluck('row');
                $first = $group->first();

                return array_merge($this->groupPayload($rows, $first['label']), [
                    'source' => $first['source'],
                    'payroll_share_total' => (float) $group->sum('payroll_share'),
                ]);
            })
            ->sortByDesc('gross_margin_total')
            ->values()
            ->all();
    }

    private function groupPayload(Collection $group, string $label): array
    {
        $count = $group->count();

        return [
            'label' => $label ?: 'Tidak Terdata',
            'installation_count' => $count,
            'installation_income_total' => (float) $group->sum('installation_income_total'),
            'installation_cost_total' => (float) $group->sum('installation_cost_total'),
            'gross_margin_total' => (float) $group->sum('gross_margin'),
            'average_income' => $count > 0 ? round((float) $group->sum('installation_income_total') / $count, 2) : 0.0,
            'average_cost' => $count > 0 ? round((float) $group->sum('installation_cost_total') / $count, 2) : 0.0,
            'cable_used_meter_total' => (float) $group->sum('cost_breakdown.cable_used_meter'),
            'loss_count' => (int) $group->where('profit_status', 'rugi')->count(),
        ];
    }

    private function buildMaterialEfficiency(Collection $rows): array
    {
        $count = $rows->count();

        return [
            'cable_used_meter_total' => (float) $rows->sum('cost_breakdown.cable_used_meter'),
            'average_cable_meter' => $count > 0 ? round((float) $rows->sum('cost_breakdown.cable_used_meter') / $count, 2) : 0.0,
            'cable_cost_total' => (float) $rows->sum('cost_breakdown.cable_total'),
            'router_count' => (int) $rows->filter(fn (array $row) => (bool) ($row['cost_breakdown']['router_used'] ?? false))->count(),
            'router_cost_total' => (float) $rows->sum('cost_breakdown.router_total'),
            'connector_quantity_total' => (int) $rows->sum('cost_breakdown.connector_quantity'),
            'connector_cost_total' => (float) $rows->sum('cost_breakdown.connector_total'),
            'labor_cost_total' => (float) $rows->sum('cost_breakdown.labor_fee'),
            'highest_cable_usage_customers' => $rows
                ->sortByDesc('cost_breakdown.cable_used_meter')
                ->take(5)
                ->map(fn (array $row) => [
                    'customer_id' => $row['customer_id'],
                    'customer_name' => $row['customer_name'],
                    'region_label' => $row['region_label'],
                    'cable_used_meter' => (float) ($row['cost_breakdown']['cable_used_meter'] ?? 0),
                    'cable_total' => (float) ($row['cost_breakdown']['cable_total'] ?? 0),
                ])
                ->values()
                ->all(),
        ];
    }

    private function regionLabel(Customer $customer): string
    {
        return $customer->dusun?->name
            ?: ($customer->desa?->name
                ?: ($customer->kecamatan?->name
                    ?: ($customer->area_code ?: ($customer->address ?: 'Tidak Terdata'))));
    }
}

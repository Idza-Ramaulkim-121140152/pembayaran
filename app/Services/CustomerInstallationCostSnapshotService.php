<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerInstallationCostSnapshot;
use App\Models\InventoryMovement;
use App\Models\PayrollProjectDetail;
use App\Models\SiteSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class CustomerInstallationCostSnapshotService
{
    private const SETTING_DEFAULT_INSTALLATION_CABLE_RATE = 'default_installation_cable_rate_payroll';

    public function __construct(
        private InstallationPricingService $pricingService,
    ) {
    }

    public function captureForVerification(Customer $customer, array $payload, ?int $actorId = null): ?CustomerInstallationCostSnapshot
    {
        if (!Schema::hasTable('customer_installation_cost_snapshots')) {
            return null;
        }

        $installationDate = !empty($payload['installation_date'])
            ? Carbon::parse($payload['installation_date'])->toDateString()
            : ($customer->activation_date?->toDateString() ?? now()->toDateString());

        $pricing = $this->pricingService->resolveForDate(Carbon::parse($installationDate));
        $connectorQuantity = (int) ($payload['connector_quantity'] ?? $pricing?->connector_quantity_default ?? InstallationPricingService::DEFAULT_CONNECTOR_QUANTITY);
        $connectorUnitPrice = (float) ($payload['connector_unit_price'] ?? $pricing?->connector_unit_price ?? InstallationPricingService::DEFAULT_CONNECTOR_UNIT_PRICE);
        $routerUnitPrice = (float) ($payload['router_unit_price'] ?? $pricing?->router_unit_price ?? InstallationPricingService::DEFAULT_ROUTER_UNIT_PRICE);
        $cableMaterialRate = (float) ($payload['cable_material_price_per_meter'] ?? $payload['cable_price_per_meter'] ?? 0);
        $cablePayrollRate = (float) ($payload['cable_payroll_price_per_meter'] ?? 0);
        $cableUsed = (float) ($payload['cable_used_meter'] ?? 0);
        $routerUsed = (bool) ($payload['router_used'] ?? false);
        $laborFee = (float) ($payload['labor_fee'] ?? 0);
        $cableTotal = $cableUsed * ($cableMaterialRate + $cablePayrollRate);

        return CustomerInstallationCostSnapshot::query()->updateOrCreate(
            ['customer_id' => $customer->id],
            [
                'installation_pricing_id' => $pricing?->id,
                'installation_date' => $installationDate,
                'cable_used_meter' => $cableUsed,
                'cable_price_per_meter' => $cableMaterialRate,
                'cable_material_price_per_meter' => $cableMaterialRate,
                'cable_payroll_price_per_meter' => $cablePayrollRate,
                'cable_total' => $cableTotal,
                'connector_quantity' => $connectorQuantity,
                'connector_unit_price' => $connectorUnitPrice,
                'router_used' => $routerUsed,
                'router_unit_price' => $routerUnitPrice,
                'labor_fee' => $laborFee,
                'total_cost' => $this->calculateTotalCost($cableTotal, $connectorQuantity, $connectorUnitPrice, $routerUsed, $routerUnitPrice, $laborFee),
                'source' => (string) ($payload['source'] ?? 'verification'),
                'is_estimated' => false,
                'estimation_notes' => null,
                'meta' => $payload['meta'] ?? null,
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]
        );
    }

    public function resolveForReport(Customer $customer): array
    {
        $snapshot = $customer->relationLoaded('installationCostSnapshot')
            ? $customer->installationCostSnapshot
            : $customer->installationCostSnapshot()->first();

        if ($snapshot) {
            return $this->toArray($snapshot);
        }

        return $this->buildEstimatedSnapshot($customer);
    }

    private function buildEstimatedSnapshot(Customer $customer): array
    {
        $installationDate = $customer->activation_date?->toDateString();
        $pricing = $this->pricingService->resolveForDate($customer->activation_date);
        $movements = Schema::hasTable('inventory_movements')
            ? InventoryMovement::query()
                ->where('source', 'installation')
                ->where('reference_type', Customer::class)
                ->where('reference_id', $customer->id)
                ->get()
            : collect();

        $cableUsed = (float) $movements
            ->filter(fn (InventoryMovement $movement) => ($movement->meta['kind'] ?? null) === 'cable')
            ->sum('quantity');

        $routerUsed = $movements->contains(fn (InventoryMovement $movement) => ($movement->meta['kind'] ?? null) === 'router');
        $laborFee = $this->guessLaborFee($customer);
        $connectorQuantity = (int) ($pricing?->connector_quantity_default ?? InstallationPricingService::DEFAULT_CONNECTOR_QUANTITY);
        $connectorUnitPrice = (float) ($pricing?->connector_unit_price ?? InstallationPricingService::DEFAULT_CONNECTOR_UNIT_PRICE);
        $routerUnitPrice = (float) ($pricing?->router_unit_price ?? InstallationPricingService::DEFAULT_ROUTER_UNIT_PRICE);
        $cableMaterialRate = (float) ($pricing?->cable_price_per_meter ?? InstallationPricingService::DEFAULT_CABLE_PRICE_PER_METER);
        $cablePayrollRate = $this->defaultCablePayrollRate();
        $cableTotal = $cableUsed * ($cableMaterialRate + $cablePayrollRate);

        $notes = [];
        $notes[] = 'Snapshot historis dibentuk otomatis dari data lama.';
        if ($laborFee <= 0) {
            $notes[] = 'Biaya labor tidak ditemukan pasti di histori.';
        }
        $notes[] = 'Payroll kabel per meter tidak ditemukan pasti di histori, jadi memakai default inventori aktif saat ini.';
        if ($movements->isEmpty()) {
            $notes[] = 'Data inventori instalasi tidak lengkap atau belum dicatat.';
        }

        return [
            'id' => null,
            'installation_date' => $installationDate,
            'cable_used_meter' => $cableUsed,
            'cable_price_per_meter' => $cableMaterialRate,
            'cable_material_price_per_meter' => $cableMaterialRate,
            'cable_payroll_price_per_meter' => $cablePayrollRate,
            'cable_payroll_source' => 'inventory_default',
            'cable_total' => $cableTotal,
            'connector_quantity' => $connectorQuantity,
            'connector_unit_price' => $connectorUnitPrice,
            'router_used' => $routerUsed,
            'router_unit_price' => $routerUnitPrice,
            'labor_fee' => $laborFee,
            'total_cost' => $this->calculateTotalCost($cableTotal, $connectorQuantity, $connectorUnitPrice, $routerUsed, $routerUnitPrice, $laborFee),
            'source' => 'fallback',
            'is_estimated' => true,
            'estimation_notes' => implode(' ', $notes),
            'pricing_basis_label' => 'Estimasi dari master harga aktif + histori instalasi yang tersedia',
        ];
    }

    private function guessLaborFee(Customer $customer): float
    {
        if (!Schema::hasTable('payroll_project_details') || !Schema::hasTable('payroll_projects')) {
            return 0;
        }

        $query = PayrollProjectDetail::query()
            ->where('tipe', 'pemasangan')
            ->where('deskripsi', 'like', '%pelanggan ' . $customer->name . '%')
            ->whereHas('project', function ($projectQuery) use ($customer) {
                if ($customer->activation_date) {
                    $projectQuery->whereDate('tanggal', $customer->activation_date->toDateString());
                }
            })
            ->latest('id');

        $detail = $query->first();

        return $detail ? (float) $detail->subtotal : 0;
    }

    private function calculateTotalCost(
        float $cableTotal,
        int $connectorQuantity,
        float $connectorUnitPrice,
        bool $routerUsed,
        float $routerUnitPrice,
        float $laborFee
    ): float {
        return $cableTotal
            + ($connectorQuantity * $connectorUnitPrice)
            + ($routerUsed ? $routerUnitPrice : 0)
            + $laborFee;
    }

    private function toArray(CustomerInstallationCostSnapshot $snapshot): array
    {
        $cableMaterialRate = (float) ($snapshot->cable_material_price_per_meter ?? $snapshot->cable_price_per_meter);
        [$cablePayrollRate, $cablePayrollSource] = $this->resolveCablePayrollRateForReport($snapshot);
        $cableTotal = (float) $snapshot->cable_used_meter * ($cableMaterialRate + $cablePayrollRate);
        $totalCost = $this->calculateTotalCost(
            $cableTotal,
            (int) $snapshot->connector_quantity,
            (float) $snapshot->connector_unit_price,
            (bool) $snapshot->router_used,
            (float) $snapshot->router_unit_price,
            (float) $snapshot->labor_fee
        );
        $estimationNotes = $snapshot->estimation_notes;

        if ($cablePayrollSource === 'inventory_default') {
            $fallbackNote = 'Payroll kabel per meter memakai default inventori aktif karena snapshot historis belum menyimpan nilainya.';
            $estimationNotes = $estimationNotes
                ? trim($estimationNotes . ' ' . $fallbackNote)
                : $fallbackNote;
        }

        return [
            'id' => $snapshot->id,
            'installation_date' => $snapshot->installation_date?->toDateString(),
            'cable_used_meter' => (float) $snapshot->cable_used_meter,
            'cable_price_per_meter' => (float) $snapshot->cable_price_per_meter,
            'cable_material_price_per_meter' => $cableMaterialRate,
            'cable_payroll_price_per_meter' => $cablePayrollRate,
            'cable_payroll_source' => $cablePayrollSource,
            'cable_total' => $cableTotal,
            'connector_quantity' => (int) $snapshot->connector_quantity,
            'connector_unit_price' => (float) $snapshot->connector_unit_price,
            'router_used' => (bool) $snapshot->router_used,
            'router_unit_price' => (float) $snapshot->router_unit_price,
            'labor_fee' => (float) $snapshot->labor_fee,
            'total_cost' => $totalCost,
            'source' => $snapshot->source,
            'is_estimated' => (bool) $snapshot->is_estimated,
            'estimation_notes' => $estimationNotes,
            'meta' => $snapshot->meta ?? [],
            'pricing_basis_label' => $snapshot->is_estimated
                ? 'Estimasi snapshot historis'
                : 'Snapshot biaya tersimpan saat instalasi',
        ];
    }

    private function resolveCablePayrollRateForReport(CustomerInstallationCostSnapshot $snapshot): array
    {
        $storedRate = (float) ($snapshot->cable_payroll_price_per_meter ?? 0);

        if ($storedRate > 0) {
            return [$storedRate, 'snapshot'];
        }

        return [$this->defaultCablePayrollRate(), 'inventory_default'];
    }

    private function defaultCablePayrollRate(): float
    {
        return (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_CABLE_RATE, 0);
    }
}

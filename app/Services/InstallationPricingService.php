<?php

namespace App\Services;

use App\Models\CustomerInstallationCostSnapshot;
use App\Models\InstallationPricing;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class InstallationPricingService
{
    public const APPLY_SCOPE_FUTURE_ONLY = 'future_only';
    public const APPLY_SCOPE_RECALCULATE_EXISTING = 'recalculate_existing';
    public const DEFAULT_CABLE_PRICE_PER_METER = 1200;
    public const DEFAULT_CONNECTOR_UNIT_PRICE = 8000;
    public const DEFAULT_CONNECTOR_QUANTITY = 2;
    public const DEFAULT_ROUTER_UNIT_PRICE = 225000;

    public function isReady(): bool
    {
        return Schema::hasTable('installation_pricings');
    }

    public function getOrCreateActive(): ?InstallationPricing
    {
        if (!$this->isReady()) {
            return null;
        }

        $active = InstallationPricing::query()->latest('id')->first();

        if ($active) {
            return $active;
        }

        return InstallationPricing::query()->create([
            'cable_price_per_meter' => self::DEFAULT_CABLE_PRICE_PER_METER,
            'connector_unit_price' => self::DEFAULT_CONNECTOR_UNIT_PRICE,
            'connector_quantity_default' => self::DEFAULT_CONNECTOR_QUANTITY,
            'router_unit_price' => self::DEFAULT_ROUTER_UNIT_PRICE,
        ]);
    }

    public function resolveForDate(?CarbonInterface $date = null): ?InstallationPricing
    {
        if (!$this->isReady()) {
            return null;
        }

        $target = $date ? Carbon::parse($date)->endOfDay() : null;

        if (!$target) {
            return $this->getOrCreateActive();
        }

        $historical = InstallationPricing::query()
            ->where('created_at', '<=', $target)
            ->latest('created_at')
            ->latest('id')
            ->first();

        if ($historical) {
            return $historical;
        }

        return InstallationPricing::query()->oldest('created_at')->oldest('id')->first()
            ?: $this->getOrCreateActive();
    }

    public function createVersion(array $payload, ?int $actorId = null): InstallationPricing
    {
        $active = $this->getOrCreateActive();

        $attributes = [
            'cable_price_per_meter' => (float) ($payload['cable_price_per_meter'] ?? $active?->cable_price_per_meter ?? self::DEFAULT_CABLE_PRICE_PER_METER),
            'connector_unit_price' => (float) ($payload['connector_unit_price'] ?? $active?->connector_unit_price ?? self::DEFAULT_CONNECTOR_UNIT_PRICE),
            'connector_quantity_default' => (int) ($payload['connector_quantity_default'] ?? $active?->connector_quantity_default ?? self::DEFAULT_CONNECTOR_QUANTITY),
            'router_unit_price' => (float) ($payload['router_unit_price'] ?? $active?->router_unit_price ?? self::DEFAULT_ROUTER_UNIT_PRICE),
            'created_by' => $actorId,
        ];

        if ($active
            && (float) $active->cable_price_per_meter === $attributes['cable_price_per_meter']
            && (float) $active->connector_unit_price === $attributes['connector_unit_price']
            && (int) $active->connector_quantity_default === $attributes['connector_quantity_default']
            && (float) $active->router_unit_price === $attributes['router_unit_price']) {
            return $active;
        }

        return InstallationPricing::query()->create($attributes);
    }

    public function updateReportPricing(array $payload, string $applyScope = self::APPLY_SCOPE_FUTURE_ONLY, ?int $actorId = null): array
    {
        return DB::transaction(function () use ($payload, $applyScope, $actorId) {
            $pricing = $this->createVersion($payload, $actorId);
            $updatedSnapshotCount = 0;

            if ($applyScope === self::APPLY_SCOPE_RECALCULATE_EXISTING && Schema::hasTable('customer_installation_cost_snapshots')) {
                $updatedSnapshotCount = $this->recalculateExistingSnapshots($pricing, $actorId);
            }

            return [
                'active' => $pricing,
                'history' => $this->history(),
                'updated_snapshot_count' => $updatedSnapshotCount,
                'apply_scope' => $applyScope,
            ];
        });
    }

    public function history(): Collection
    {
        if (!$this->isReady()) {
            return new Collection();
        }

        $this->getOrCreateActive();

        return InstallationPricing::query()
            ->with('creator:id,name')
            ->latest('created_at')
            ->latest('id')
            ->get();
    }

    private function recalculateExistingSnapshots(InstallationPricing $pricing, ?int $actorId = null): int
    {
        $count = 0;

        CustomerInstallationCostSnapshot::query()
            ->orderBy('id')
            ->chunkById(200, function (Collection $snapshots) use ($pricing, $actorId, &$count) {
                foreach ($snapshots as $snapshot) {
                    $routerUsed = true;
                    $cableUsed = (float) $snapshot->cable_used_meter;
                    $cableMaterialRate = (float) $pricing->cable_price_per_meter;
                    $cablePayrollRate = (float) ($snapshot->cable_payroll_price_per_meter ?? 0);
                    $connectorQuantity = (int) $snapshot->connector_quantity;
                    $connectorUnitPrice = (float) $snapshot->connector_unit_price;
                    $routerUnitPrice = (float) $pricing->router_unit_price;
                    $laborFee = (float) $snapshot->labor_fee;
                    $cableTotal = $cableUsed * ($cableMaterialRate + $cablePayrollRate);

                    $snapshot->forceFill([
                        'installation_pricing_id' => $pricing->id,
                        'cable_price_per_meter' => $cableMaterialRate,
                        'cable_material_price_per_meter' => $cableMaterialRate,
                        'cable_total' => $cableTotal,
                        'router_used' => $routerUsed,
                        'router_unit_price' => $routerUnitPrice,
                        'total_cost' => $cableTotal
                            + ($connectorQuantity * $connectorUnitPrice)
                            + ($routerUsed ? $routerUnitPrice : 0)
                            + $laborFee,
                        'updated_by' => $actorId,
                    ])->save();

                    $count++;
                }
            });

        return $count;
    }
}

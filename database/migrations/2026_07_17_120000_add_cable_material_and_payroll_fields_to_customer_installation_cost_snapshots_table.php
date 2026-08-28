<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_installation_cost_snapshots', function (Blueprint $table) {
            $table->decimal('cable_material_price_per_meter', 15, 2)->default(0)->after('cable_price_per_meter');
            $table->decimal('cable_payroll_price_per_meter', 15, 2)->default(0)->after('cable_material_price_per_meter');
            $table->decimal('cable_total', 15, 2)->default(0)->after('cable_payroll_price_per_meter');
        });

        $snapshots = DB::table('customer_installation_cost_snapshots')->get();

        foreach ($snapshots as $snapshot) {
            $materialRate = 0.0;

            if (!empty($snapshot->installation_pricing_id)) {
                $materialRate = (float) DB::table('installation_pricings')
                    ->where('id', $snapshot->installation_pricing_id)
                    ->value('cable_price_per_meter');
            }

            $payrollRate = (float) ($snapshot->cable_price_per_meter ?? 0);
            $cableUsed = (float) ($snapshot->cable_used_meter ?? 0);
            $connectorQuantity = (int) ($snapshot->connector_quantity ?? 0);
            $connectorUnitPrice = (float) ($snapshot->connector_unit_price ?? 0);
            $routerUsed = (bool) ($snapshot->router_used ?? false);
            $routerUnitPrice = (float) ($snapshot->router_unit_price ?? 0);
            $laborFee = (float) ($snapshot->labor_fee ?? 0);
            $cableTotal = $cableUsed * ($materialRate + $payrollRate);

            DB::table('customer_installation_cost_snapshots')
                ->where('id', $snapshot->id)
                ->update([
                    'cable_price_per_meter' => $materialRate,
                    'cable_material_price_per_meter' => $materialRate,
                    'cable_payroll_price_per_meter' => $payrollRate,
                    'cable_total' => $cableTotal,
                    'total_cost' => $cableTotal
                        + ($connectorQuantity * $connectorUnitPrice)
                        + ($routerUsed ? $routerUnitPrice : 0)
                        + $laborFee,
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('customer_installation_cost_snapshots', function (Blueprint $table) {
            $table->dropColumn([
                'cable_material_price_per_meter',
                'cable_payroll_price_per_meter',
                'cable_total',
            ]);
        });
    }
};

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerInstallationCostSnapshot extends Model
{
    protected $fillable = [
        'customer_id',
        'installation_pricing_id',
        'installation_date',
        'cable_used_meter',
        'cable_price_per_meter',
        'cable_material_price_per_meter',
        'cable_payroll_price_per_meter',
        'cable_total',
        'connector_quantity',
        'connector_unit_price',
        'router_used',
        'router_unit_price',
        'labor_fee',
        'total_cost',
        'source',
        'is_estimated',
        'estimation_notes',
        'meta',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'installation_date' => 'date:Y-m-d',
        'cable_used_meter' => 'decimal:2',
        'cable_price_per_meter' => 'decimal:2',
        'cable_material_price_per_meter' => 'decimal:2',
        'cable_payroll_price_per_meter' => 'decimal:2',
        'cable_total' => 'decimal:2',
        'connector_quantity' => 'integer',
        'connector_unit_price' => 'decimal:2',
        'router_used' => 'boolean',
        'router_unit_price' => 'decimal:2',
        'labor_fee' => 'decimal:2',
        'total_cost' => 'decimal:2',
        'is_estimated' => 'boolean',
        'meta' => 'array',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function pricing(): BelongsTo
    {
        return $this->belongsTo(InstallationPricing::class, 'installation_pricing_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

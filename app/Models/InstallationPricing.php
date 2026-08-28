<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InstallationPricing extends Model
{
    protected $fillable = [
        'cable_price_per_meter',
        'connector_unit_price',
        'connector_quantity_default',
        'router_unit_price',
        'created_by',
    ];

    protected $casts = [
        'cable_price_per_meter' => 'decimal:2',
        'connector_unit_price' => 'decimal:2',
        'connector_quantity_default' => 'integer',
        'router_unit_price' => 'decimal:2',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function customerSnapshots(): HasMany
    {
        return $this->hasMany(CustomerInstallationCostSnapshot::class);
    }
}

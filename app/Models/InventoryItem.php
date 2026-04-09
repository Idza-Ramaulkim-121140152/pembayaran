<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryItem extends Model
{
    protected $fillable = [
        'inventory_item_type_id',
        'name',
        'unit',
        'default_length',
        'length_unit',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'default_length' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function type(): BelongsTo
    {
        return $this->belongsTo(InventoryItemType::class, 'inventory_item_type_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class);
    }

    public function debts(): HasMany
    {
        return $this->hasMany(InventoryDebt::class);
    }
}

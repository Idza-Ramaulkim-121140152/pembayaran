<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryDebt extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'inventory_movement_id',
        'quantity',
        'unit_price',
        'original_amount',
        'paid_amount',
        'status',
        'due_date',
        'notes',
        'settled_at',
        'created_by',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'original_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'due_date' => 'date:Y-m-d',
        'settled_at' => 'datetime',
    ];

    protected $appends = [
        'remaining_amount',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function movement(): BelongsTo
    {
        return $this->belongsTo(InventoryMovement::class, 'inventory_movement_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(InventoryDebtPayment::class);
    }

    public function getRemainingAmountAttribute(): ?float
    {
        if ($this->original_amount === null) {
            return null;
        }

        return max(0, (float) $this->original_amount - (float) $this->paid_amount);
    }
}

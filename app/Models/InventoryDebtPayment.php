<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryDebtPayment extends Model
{
    protected $fillable = [
        'inventory_debt_id',
        'amount',
        'payment_date',
        'notes',
        'pengeluaran_id',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date:Y-m-d',
    ];

    public function debt(): BelongsTo
    {
        return $this->belongsTo(InventoryDebt::class, 'inventory_debt_id');
    }

    public function pengeluaran(): BelongsTo
    {
        return $this->belongsTo(Pengeluaran::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MonthlyBudget extends Model
{
    protected $fillable = [
        'month',
        'notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'month' => 'date:Y-m-d',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(MonthlyBudgetItem::class);
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

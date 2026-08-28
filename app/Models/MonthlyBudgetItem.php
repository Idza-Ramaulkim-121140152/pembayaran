<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MonthlyBudgetItem extends Model
{
    protected $fillable = [
        'monthly_budget_id',
        'category_key',
        'target_amount',
        'system_recommended_amount',
        'final_active_amount',
        'is_overridden',
        'source',
    ];

    protected $casts = [
        'target_amount' => 'decimal:2',
        'system_recommended_amount' => 'decimal:2',
        'final_active_amount' => 'decimal:2',
        'is_overridden' => 'boolean',
    ];

    public function monthlyBudget(): BelongsTo
    {
        return $this->belongsTo(MonthlyBudget::class);
    }
}

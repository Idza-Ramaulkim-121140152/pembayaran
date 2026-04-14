<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialPlanningTarget extends Model
{
    public const TYPE_MANDATORY_EXPENSE = 'mandatory_expense';
    public const TYPE_PURCHASE_TARGET = 'purchase_target';

    protected $fillable = [
        'type',
        'name',
        'description',
        'amount',
        'target_date',
        'start_date',
        'end_date',
        'is_recurring_monthly',
        'recurrence_until',
        'recurrence_forever',
        'is_active',
        'priority',
        'meta',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'target_date' => 'date:Y-m-d',
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'is_recurring_monthly' => 'boolean',
        'recurrence_until' => 'date:Y-m-d',
        'recurrence_forever' => 'boolean',
        'is_active' => 'boolean',
        'priority' => 'integer',
        'meta' => 'array',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

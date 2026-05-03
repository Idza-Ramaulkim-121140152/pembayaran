<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinancialBalanceSnapshot extends Model
{
    protected $fillable = [
        'snapshot_date',
        'closing_balance',
        'total_income',
        'total_expense',
        'total_adjustment',
        'captured_at',
        'meta',
    ];

    protected $casts = [
        'snapshot_date' => 'date:Y-m-d',
        'closing_balance' => 'decimal:2',
        'total_income' => 'decimal:2',
        'total_expense' => 'decimal:2',
        'total_adjustment' => 'decimal:2',
        'captured_at' => 'datetime',
        'meta' => 'array',
    ];
}

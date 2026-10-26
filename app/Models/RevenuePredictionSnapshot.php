<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RevenuePredictionSnapshot extends Model
{
    protected $fillable = [
        'range_key',
        'start_date',
        'end_date',
        'realized_revenue',
        'predicted_remaining_revenue',
        'total_expected_revenue',
        'potential_total_revenue',
        'customer_count',
        'chart_data',
        'customer_breakdown',
        'meta',
        'calculated_at',
    ];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'realized_revenue' => 'float',
        'predicted_remaining_revenue' => 'float',
        'total_expected_revenue' => 'float',
        'potential_total_revenue' => 'float',
        'customer_count' => 'integer',
        'chart_data' => 'array',
        'customer_breakdown' => 'array',
        'meta' => 'array',
        'calculated_at' => 'datetime',
    ];
}

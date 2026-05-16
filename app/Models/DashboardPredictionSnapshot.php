<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DashboardPredictionSnapshot extends Model
{
    protected $fillable = [
        'scope',
        'period_start',
        'period_end',
        'payload_json',
        'model_meta_json',
        'generated_at',
        'expires_at',
        'status',
        'error_message',
    ];

    protected $casts = [
        'period_start' => 'datetime',
        'period_end' => 'datetime',
        'payload_json' => 'array',
        'model_meta_json' => 'array',
        'generated_at' => 'datetime',
        'expires_at' => 'datetime',
    ];
}


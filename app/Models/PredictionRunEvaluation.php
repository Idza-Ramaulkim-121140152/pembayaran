<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PredictionRunEvaluation extends Model
{
    protected $fillable = [
        'prediction_run_id',
        'metric',
        'metric_value',
        'sample_size',
        'period_start',
        'period_end',
        'retrain_status',
        'retrained_at',
        'notes',
    ];

    protected $casts = [
        'metric_value' => 'float',
        'sample_size' => 'integer',
        'period_start' => 'date',
        'period_end' => 'date',
        'retrained_at' => 'datetime',
    ];

    public function run(): BelongsTo
    {
        return $this->belongsTo(PredictionRun::class, 'prediction_run_id');
    }
}


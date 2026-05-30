<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PredictionRunItem extends Model
{
    protected $fillable = [
        'prediction_run_id',
        'target_date',
        'domain',
        'predicted_value',
        'actual_value',
    ];

    protected $casts = [
        'target_date' => 'date',
        'predicted_value' => 'float',
        'actual_value' => 'float',
    ];

    public function run(): BelongsTo
    {
        return $this->belongsTo(PredictionRun::class, 'prediction_run_id');
    }
}


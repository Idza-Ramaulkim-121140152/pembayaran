<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PredictionRun extends Model
{
    protected $fillable = [
        'run_date',
        'horizon_days',
        'status',
        'model_version',
        'model_trained_at',
        'snapshot_id',
        'evaluated_at',
    ];

    protected $casts = [
        'run_date' => 'date',
        'horizon_days' => 'integer',
        'model_trained_at' => 'datetime',
        'evaluated_at' => 'datetime',
    ];

    public function snapshot(): BelongsTo
    {
        return $this->belongsTo(DashboardPredictionSnapshot::class, 'snapshot_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PredictionRunItem::class);
    }

    public function evaluations(): HasMany
    {
        return $this->hasMany(PredictionRunEvaluation::class);
    }
}


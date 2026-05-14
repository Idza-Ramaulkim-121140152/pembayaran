<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallationSurvey extends Model
{
    protected $fillable = [
        'lead_id',
        'scheduled_by',
        'scheduled_at',
        'recommended_odp_id',
        'result',
        'notes',
        'photos',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'photos' => 'array',
    ];

    public function lead()
    {
        return $this->belongsTo(InstallationLead::class, 'lead_id');
    }

    public function scheduler()
    {
        return $this->belongsTo(User::class, 'scheduled_by');
    }

    public function recommendedOdp()
    {
        return $this->belongsTo(Odp::class, 'recommended_odp_id');
    }
}

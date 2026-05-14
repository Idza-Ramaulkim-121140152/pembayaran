<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NetworkIncident extends Model
{
    protected $fillable = [
        'title',
        'severity',
        'status',
        'started_at',
        'resolved_at',
        'detected_by',
        'meta',
        'created_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'resolved_at' => 'datetime',
        'meta' => 'array',
    ];

    public function odps()
    {
        return $this->belongsToMany(Odp::class, 'network_incident_odps');
    }

    public function events()
    {
        return $this->hasMany(IncidentEvent::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

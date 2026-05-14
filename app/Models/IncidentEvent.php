<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IncidentEvent extends Model
{
    protected $fillable = [
        'network_incident_id',
        'event_type',
        'message',
        'meta',
        'created_by',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function incident()
    {
        return $this->belongsTo(NetworkIncident::class, 'network_incident_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

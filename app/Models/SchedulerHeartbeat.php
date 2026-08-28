<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SchedulerHeartbeat extends Model
{
    protected $fillable = [
        'command',
        'status',
        'message',
        'last_started_at',
        'last_finished_at',
        'last_duration_ms',
        'meta',
    ];

    protected $casts = [
        'last_started_at' => 'datetime',
        'last_finished_at' => 'datetime',
        'meta' => 'array',
    ];
}

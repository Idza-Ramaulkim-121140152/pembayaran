<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemHealthCheck extends Model
{
    protected $fillable = [
        'check_key',
        'label',
        'status',
        'message',
        'meta',
        'checked_at',
        'last_alerted_at',
    ];

    protected $casts = [
        'meta' => 'array',
        'checked_at' => 'datetime',
        'last_alerted_at' => 'datetime',
    ];
}

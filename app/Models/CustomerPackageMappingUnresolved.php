<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPackageMappingUnresolved extends Model
{
    protected $fillable = [
        'customer_id',
        'pppoe_username',
        'mikrotik_profile',
        'status',
        'reason',
        'meta',
        'resolved_at',
        'created_by',
        'resolved_by',
    ];

    protected $casts = [
        'meta' => 'array',
        'resolved_at' => 'datetime',
    ];
}


<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPackageManagementIgnore extends Model
{
    protected $fillable = [
        'customer_id',
        'status_code',
        'reason',
        'created_by',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];
}


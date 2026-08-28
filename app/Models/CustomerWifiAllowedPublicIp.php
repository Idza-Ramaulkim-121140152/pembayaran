<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerWifiAllowedPublicIp extends Model
{
    protected $fillable = [
        'ip_address',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}

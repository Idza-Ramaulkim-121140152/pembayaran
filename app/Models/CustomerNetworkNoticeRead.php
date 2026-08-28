<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerNetworkNoticeRead extends Model
{
    protected $fillable = [
        'customer_id',
        'network_notice_id',
        'read_at',
        'dismissed_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
        'dismissed_at' => 'datetime',
    ];
}

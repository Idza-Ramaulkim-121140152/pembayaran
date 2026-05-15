<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingDunningConfig extends Model
{
    protected $fillable = [
        'is_active',
        'timezone',
        'send_time',
        'max_retry',
        'template_h_minus_7',
        'template_h_minus_3',
        'template_h_minus_1',
        'template_h_plus_1',
        'template_h_plus_3',
        'meta',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'max_retry' => 'integer',
        'meta' => 'array',
    ];
}

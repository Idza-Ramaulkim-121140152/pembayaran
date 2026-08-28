<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerWifiSettingLink extends Model
{
    protected $fillable = [
        'title',
        'url',
        'description',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];
}

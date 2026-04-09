<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DistributionRoute extends Model
{
    protected $fillable = [
        'name',
        'nodes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'nodes' => 'array',
    ];
}

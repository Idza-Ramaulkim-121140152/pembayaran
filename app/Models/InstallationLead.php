<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallationLead extends Model
{
    protected $fillable = [
        'name',
        'phone',
        'address',
        'lead_source',
        'latitude',
        'longitude',
        'status',
        'meta',
    ];

    protected $casts = [
        'latitude' => 'decimal:8',
        'longitude' => 'decimal:8',
        'meta' => 'array',
    ];

    public function surveys()
    {
        return $this->hasMany(InstallationSurvey::class, 'lead_id');
    }

    public function workOrders()
    {
        return $this->hasMany(InstallationWorkOrder::class, 'lead_id');
    }
}

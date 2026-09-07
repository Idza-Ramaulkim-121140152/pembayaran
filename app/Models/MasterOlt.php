<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterOlt extends Model
{
    protected $fillable = [
        'name',
        'brand',
        'model',
        'host',
        'snmp_port',
        'snmp_community',
        'snmp_version',
        'total_pon_ports',
        'is_active',
        'simulation_mode',
        'latitude',
        'longitude',
        'location_address',
        'description',
        'last_status',
        'last_checked_at',
        'telemetry_data',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'simulation_mode' => 'boolean',
        'telemetry_data' => 'array',
        'last_checked_at' => 'datetime',
        'latitude' => 'decimal:8',
        'longitude' => 'decimal:8',
        'total_pon_ports' => 'integer',
        'snmp_port' => 'integer',
    ];

    public function ponPorts(): HasMany
    {
        return $this->hasMany(OltPonPort::class, 'olt_id')->orderBy('pon_index');
    }

    public function onus(): HasMany
    {
        return $this->hasMany(OltOnu::class, 'olt_id');
    }

    public function odps(): HasMany
    {
        return $this->hasMany(Odp::class, 'olt_id');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'olt_id');
    }
}

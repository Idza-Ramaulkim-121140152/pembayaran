<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OltPonPort extends Model
{
    protected $fillable = [
        'olt_id',
        'pon_index',
        'pon_identifier',
        'name',
        'admin_status',
        'oper_status',
        'tx_power_dbm',
        'temperature',
        'voltage',
        'current_ma',
        'total_registered_onu',
        'online_onu_count',
        'offline_onu_count',
        'max_onu_capacity',
        'description',
    ];

    protected $casts = [
        'pon_index' => 'integer',
        'tx_power_dbm' => 'decimal:2',
        'temperature' => 'decimal:2',
        'voltage' => 'decimal:2',
        'current_ma' => 'decimal:2',
        'total_registered_onu' => 'integer',
        'online_onu_count' => 'integer',
        'offline_onu_count' => 'integer',
        'max_onu_capacity' => 'integer',
    ];

    public function olt(): BelongsTo
    {
        return $this->belongsTo(MasterOlt::class, 'olt_id');
    }

    public function onus(): HasMany
    {
        return $this->hasMany(OltOnu::class, 'pon_port_id')->orderBy('onu_index');
    }

    public function odps(): HasMany
    {
        return $this->hasMany(Odp::class, 'pon_port_id');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'pon_port_id');
    }
}

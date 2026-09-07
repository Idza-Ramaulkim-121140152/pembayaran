<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OltOnu extends Model
{
    protected $fillable = [
        'olt_id',
        'pon_port_id',
        'onu_index',
        'customer_id',
        'serial_number',
        'mac_address',
        'model',
        'optical_rx_dbm',
        'optical_tx_dbm',
        'distance_meter',
        'status',
        'last_online_at',
        'last_offline_at',
        'offline_reason',
    ];

    protected $casts = [
        'onu_index' => 'integer',
        'optical_rx_dbm' => 'decimal:2',
        'optical_tx_dbm' => 'decimal:2',
        'distance_meter' => 'integer',
        'last_online_at' => 'datetime',
        'last_offline_at' => 'datetime',
    ];

    public function olt(): BelongsTo
    {
        return $this->belongsTo(MasterOlt::class, 'olt_id');
    }

    public function ponPort(): BelongsTo
    {
        return $this->belongsTo(OltPonPort::class, 'pon_port_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}

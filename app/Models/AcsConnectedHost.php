<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcsConnectedHost extends Model
{
    use HasFactory;

    protected $table = 'acs_connected_hosts';

    protected $fillable = [
        'acs_device_id',
        'mac_address',
        'ip_address',
        'hostname',
        'interface_type',
        'rssi',
        'is_active',
        'last_seen_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'rssi' => 'integer',
        'last_seen_at' => 'datetime',
    ];

    public function device(): BelongsTo
    {
        return $this->belongsTo(AcsDevice::class, 'acs_device_id');
    }
}

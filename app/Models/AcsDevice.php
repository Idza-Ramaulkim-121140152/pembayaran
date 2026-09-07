<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcsDevice extends Model
{
    use HasFactory;

    protected $table = 'acs_devices';

    protected $fillable = [
        'device_id',
        'manufacturer',
        'oui',
        'product_class',
        'serial_number',
        'hardware_version',
        'software_version',
        'spec_version',
        'provisioning_code',
        'pon_mode',
        'optical_rx_power',
        'optical_tx_power',
        'temperature',
        'device_uptime',
        'device_uptime_seconds',
        'ppp_uptime',
        'ppp_uptime_seconds',
        'pppoe_username',
        'pppoe_password',
        'pppoe_ip',
        'wan_ip',
        'wan_mac',
        'lan_mac',
        'ip_address',
        'wifi_ssid',
        'wifi_password',
        'wifi_security_mode',
        'wifi_enabled',
        'wifi_ssid_5g',
        'wifi_password_5g',
        'wifi_enabled_5g',
        'wifi_clients_count',
        'connection_request_url',
        'connection_request_user',
        'connection_request_pass',
        'customer_id',
        'matched_via',
        'is_online',
        'last_inform_at',
        'registered_at',
        'vendor_raw_summary',
    ];

    protected $casts = [
        'optical_rx_power' => 'float',
        'optical_tx_power' => 'float',
        'temperature' => 'float',
        'wifi_enabled' => 'boolean',
        'wifi_enabled_5g' => 'boolean',
        'wifi_clients_count' => 'integer',
        'device_uptime_seconds' => 'integer',
        'ppp_uptime_seconds' => 'integer',
        'is_online' => 'boolean',
        'last_inform_at' => 'datetime',
        'registered_at' => 'datetime',
        'vendor_raw_summary' => 'array',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function parameters(): HasMany
    {
        return $this->hasMany(AcsDeviceParameter::class, 'acs_device_id');
    }

    public function connectedHosts(): HasMany
    {
        return $this->hasMany(AcsConnectedHost::class, 'acs_device_id');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(AcsTask::class, 'acs_device_id');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(AcsLog::class, 'acs_device_id');
    }

    /**
     * Optical RX quality classification
     */
    public function getRxQualityAttribute(): string
    {
        if ($this->optical_rx_power === null) return 'unknown';
        if ($this->optical_rx_power >= -24.0) return 'normal';
        if ($this->optical_rx_power >= -27.0) return 'warning';
        return 'critical';
    }
}

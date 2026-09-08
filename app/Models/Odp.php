<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Odp extends Model
{
    protected $fillable = [
        'nama',
        'device_type',
        'parent_type',
        'parent_id',
        'rasio_spesial',
        'rasio_distribusi',
        'foto',
        'olt_id',
        'pon_port_id',
        'feeder_cable_info',
        'distribution_line',
        'total_ports',
        'latitude',
        'longitude',
        'kecamatan_id',
        'desa_id',
        'dusun_id',
        'alamat_detail',
    ];

    protected $casts = [
        'latitude' => 'decimal:8',
        'longitude' => 'decimal:8',
        'total_ports' => 'integer',
        'olt_id' => 'integer',
        'pon_port_id' => 'integer',
        'parent_id' => 'integer',
        'kecamatan_id' => 'integer',
        'desa_id' => 'integer',
        'dusun_id' => 'integer',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Odp::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Odp::class, 'parent_id');
    }

    public function getNameAttribute(): ?string
    {
        return $this->nama;
    }

    public function setNameAttribute($value): void
    {
        $this->attributes['nama'] = $value;
    }

    public function getLocationAddressAttribute(): ?string
    {
        return $this->alamat_detail;
    }

    public function setLocationAddressAttribute($value): void
    {
        $this->attributes['alamat_detail'] = $value;
    }

    public function getIsOdcAttribute(): bool
    {
        return ($this->device_type ?? 'odp') === 'odc';
    }

    public function olt(): BelongsTo
    {
        return $this->belongsTo(MasterOlt::class, 'olt_id');
    }

    public function ponPort(): BelongsTo
    {
        return $this->belongsTo(OltPonPort::class, 'pon_port_id');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'odp_id');
    }

    public function legacyCustomers(): HasMany
    {
        return $this->hasMany(Customer::class, 'odp', 'nama');
    }

    public function incidents(): BelongsToMany
    {
        return $this->belongsToMany(NetworkIncident::class, 'network_incident_odps');
    }

    public function kecamatan(): BelongsTo
    {
        return $this->belongsTo(MasterWilayahKecamatan::class, 'kecamatan_id');
    }

    public function desa(): BelongsTo
    {
        return $this->belongsTo(MasterWilayahDesa::class, 'desa_id');
    }

    public function dusun(): BelongsTo
    {
        return $this->belongsTo(MasterWilayahDusun::class, 'dusun_id');
    }

    /**
     * Compute total capacity based on rasio_distribusi or total_ports
     */
    public function getPortCapacityAttribute(): int
    {
        if (!empty($this->total_ports) && $this->total_ports > 0) {
            return (int) $this->total_ports;
        }

        return match ($this->rasio_distribusi) {
            '1:16' => 16,
            '1:4' => 4,
            '1:2' => 2,
            default => 8, // '1:8'
        };
    }
}

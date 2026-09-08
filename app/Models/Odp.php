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
        'schematic_data',
    ];

    protected $appends = [
        'name',
        'location_address',
        'is_odc',
        'resolved_schematic',
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
        'schematic_data' => 'array',
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

    /**
     * Resolve schematic diagram data (stored or inferred from ratios)
     */
    public function getResolvedSchematicAttribute(): array
    {
        if (!empty($this->schematic_data) && is_array($this->schematic_data) && !empty($this->schematic_data['modules'])) {
            return $this->schematic_data;
        }

        $modules = [];
        $isAsymmetric = !empty($this->rasio_spesial) && $this->rasio_spesial !== 'none';
        $distRatio = $this->rasio_distribusi ?: (($this->device_type ?? 'odp') === 'odc' ? 'none' : '1:8');

        if ($isAsymmetric) {
            $modules[] = [
                'id' => 'mod_tap_1',
                'name' => 'Coupler Tap ' . $this->rasio_spesial,
                'type' => 'asymmetric',
                'ratio' => $this->rasio_spesial,
                'in_source' => 'feeder_in',
                'outputs' => [
                    'thru' => [
                        'label' => 'Thru (Rasio Besar)',
                        'target_type' => 'next_hop',
                        'target_id' => null,
                        'target_label' => 'Lanjut ke ODP/ODC Hilir',
                    ],
                    'tap' => [
                        'label' => 'Tap (Rasio Kecil)',
                        'target_type' => $distRatio !== 'none' ? 'module' : 'port',
                        'target_id' => $distRatio !== 'none' ? 'mod_plc_1' : 1,
                        'target_label' => $distRatio !== 'none' ? 'Masuk ke Splitter Distribusi' : 'Port Pelanggan 1',
                    ],
                ],
            ];
        }

        if ($distRatio !== 'none') {
            $portCount = match ($distRatio) {
                '1:16' => 16,
                '1:4' => 4,
                '1:2' => 2,
                default => 8,
            };

            $plcOutputs = [];
            for ($i = 1; $i <= $portCount; $i++) {
                $plcOutputs['out_' . $i] = [
                    'label' => 'Out ' . $i,
                    'target_type' => 'port',
                    'target_id' => $i,
                    'target_label' => 'Port Pelanggan ' . $i,
                ];
            }

            $modules[] = [
                'id' => 'mod_plc_1',
                'name' => 'Splitter PLC ' . $distRatio,
                'type' => 'plc',
                'ratio' => $distRatio,
                'in_source' => $isAsymmetric ? 'mod_tap_1:tap' : 'feeder_in',
                'outputs' => $plcOutputs,
            ];
        }

        return [
            'input_source' => [
                'type' => $this->parent_type ?: 'pon',
                'id' => $this->parent_id ?: $this->pon_port_id,
                'label' => $this->parent_type === 'pon' ? 'Port PON OLT' : 'ODP/ODC Hulu',
            ],
            'modules' => $modules,
        ];
    }
}

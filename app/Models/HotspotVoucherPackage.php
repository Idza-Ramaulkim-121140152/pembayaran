<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HotspotVoucherPackage extends Model
{
    use HasFactory;

    protected $table = 'hotspot_voucher_packages';

    protected $fillable = [
        'name',
        'code',
        'price',
        'duration_minutes',
        'max_devices',
        'rate_limit',
        'mikrotik_profile_name',
        'hotspot_server',
        'description',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'price' => 'float',
        'duration_minutes' => 'integer',
        'max_devices' => 'integer',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    protected $appends = [
        'duration_label',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(HotspotVoucherOrder::class, 'package_id');
    }

    public function getDurationLabelAttribute(): string
    {
        $mins = (int) $this->duration_minutes;
        if ($mins >= 1440 && $mins % 1440 === 0) {
            $days = (int) ($mins / 1440);
            return "{$days} Hari";
        }
        if ($mins >= 60 && $mins % 60 === 0) {
            $hours = (int) ($mins / 60);
            return "{$hours} Jam";
        }
        if ($mins >= 60) {
            $hours = (int) floor($mins / 60);
            $rem = $mins % 60;
            return "{$hours} Jam {$rem} Menit";
        }

        return "{$mins} Menit";
    }
}

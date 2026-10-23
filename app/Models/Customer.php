<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'area_code', 'phone', 'email', 'due_date', 'is_active',
        'billing_auto_disabled',
        'kecamatan_id', 'desa_id', 'dusun_id', 'enable_home_router', 'enable_installation_team',
        'activation_date', 'gender', 'address', 'package_type', 'custom_package',
        'pppoe_username', 'mikrotik_profile', 'home_router_type', 'home_router_host',
        'home_router_port', 'home_router_username', 'home_router_password',
        'is_service_isolated', 'service_isolated_at', 'service_isolated_by', 'isolation_restore_profile',
        'mobile_password', 'mobile_force_password_change', 'mobile_password_changed_at',
        'mobile_password_reset_at', 'mobile_password_reset_meta', 'mobile_password_reset_by_user_id',
        'portal_login_enabled',
        'home_router_wan_interface', 'home_router_monitoring_enabled', 'odp',
        'odp_id', 'package_id', 'installation_fee', 'latitude', 'longitude', 'google_sheets_timestamp',
        'olt_id', 'pon_port_id', 'olt_onu_id', 'odp_port_number', 'dropcore_cable_length_meters',
        'deleted_by_user_id', 'delete_reason'
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'billing_auto_disabled' => 'boolean',
        'due_date' => 'date:Y-m-d',
        'activation_date' => 'date:Y-m-d',
        'installation_fee' => 'decimal:0',
        'latitude' => 'decimal:8',
        'longitude' => 'decimal:8',
        'home_router_port' => 'integer',
        'home_router_monitoring_enabled' => 'boolean',
        'odp_id' => 'integer',
        'package_id' => 'integer',
        'enable_home_router' => 'boolean',
        'enable_installation_team' => 'boolean',
        'home_router_password' => 'encrypted',
        'is_service_isolated' => 'boolean',
        'service_isolated_at' => 'datetime',
        'service_isolated_by' => 'integer',
        'mobile_force_password_change' => 'boolean',
        'mobile_password_changed_at' => 'datetime',
        'mobile_password_reset_at' => 'datetime',
        'mobile_password_reset_meta' => 'array',
        'portal_login_enabled' => 'boolean',
    ];

    protected $appends = ['nama', 'alamat', 'no_telp', 'user_pppoe', 'paket', 'harga', 'tanggal_jatuh_tempo', 'wilayah_lengkap', 'odp_full_text'];
    protected $hidden = ['home_router_password', 'mobile_password'];

    public function getWilayahLengkapAttribute(): string
    {
        try {
            $parts = [];
            if ($this->dusun && !empty($this->dusun->name)) {
                $parts[] = 'Dusun ' . $this->dusun->name;
            }
            if ($this->desa && !empty($this->desa->name)) {
                $parts[] = 'Desa ' . $this->desa->name;
            }
            if ($this->kecamatan && !empty($this->kecamatan->name)) {
                $parts[] = 'Kec. ' . $this->kecamatan->name;
            }

            return !empty($parts) ? implode(', ', $parts) : '-';
        } catch (\Throwable) {
            return '-';
        }
    }

    public function getResolvedOdpNameAttribute(): ?string
    {
        try {
            if ($this->relationLoaded('odpBox') && $this->odpBox) {
                return $this->odpBox->nama ?? $this->odpBox->name;
            }

            if ($this->relationLoaded('odp') && is_object($this->getRelation('odp'))) {
                return $this->getRelation('odp')->nama ?? $this->getRelation('odp')->name;
            }

            if ($this->odpBox) {
                return $this->odpBox->nama ?? $this->odpBox->name;
            }

            $legacyOdp = $this->attributes['odp'] ?? null;
            if (!empty($legacyOdp)) {
                return (string) $legacyOdp;
            }

            return null;
        } catch (\Throwable) {
            return null;
        }
    }

    public function getOdpFullTextAttribute(): ?string
    {
        $name = $this->resolved_odp_name;
        if (!$name) {
            return null;
        }

        if (!empty($this->odp_port_number)) {
            $name .= " (Port {$this->odp_port_number})";
        }

        return $name;
    }

    // Accessor untuk kompatibilitas dengan field lama
    public function getNamaAttribute()
    {
        return $this->name;
    }

    public function getAlamatAttribute()
    {
        return $this->address;
    }

    public function getNoTelpAttribute()
    {
        return $this->phone;
    }

    public function getUserPppoeAttribute()
    {
        return $this->pppoe_username;
    }

    public function getPaketAttribute()
    {
        return $this->package_type;
    }

    public function getHargaAttribute()
    {
        return $this->custom_package;
    }

    public function getTanggalJatuhTempoAttribute()
    {
        return $this->due_date;
    }

    public function invoices()
    {
        return $this->hasMany(\App\Models\Invoice::class);
    }

    public function latestInvoice()
    {
        return $this->hasOne(\App\Models\Invoice::class)->latestOfMany('id');
    }

    public function complaints()
    {
        return $this->hasMany(\App\Models\Complaint::class);
    }

    public function mobileTokens()
    {
        return $this->hasMany(\App\Models\MobileCustomerToken::class);
    }

    public function odp()
    {
        return $this->belongsTo(\App\Models\Odp::class, 'odp_id');
    }

    public function odpBox()
    {
        return $this->belongsTo(\App\Models\Odp::class, 'odp_id');
    }

    public function odpLegacy()
    {
        return $this->belongsTo(\App\Models\Odp::class, 'odp', 'nama');
    }

    public function package()
    {
        return $this->belongsTo(\App\Models\Package::class, 'package_id');
    }

    public function billingProfile()
    {
        return $this->hasOne(\App\Models\CustomerBillingProfile::class);
    }

    public function packageHistories()
    {
        return $this->hasMany(\App\Models\CustomerPackageHistory::class);
    }

    public function agreements()
    {
        return $this->hasMany(\App\Models\CustomerAgreement::class);
    }

    public function latestAgreement()
    {
        return $this->hasOne(\App\Models\CustomerAgreement::class)->latestOfMany('id');
    }

    public function installationCostSnapshot()
    {
        return $this->hasOne(\App\Models\CustomerInstallationCostSnapshot::class);
    }

    public function terminationRequests()
    {
        return $this->hasMany(\App\Models\CustomerTerminationRequest::class);
    }

    public function kecamatan()
    {
        return $this->belongsTo(MasterWilayahKecamatan::class, 'kecamatan_id');
    }

    public function desa()
    {
        return $this->belongsTo(MasterWilayahDesa::class, 'desa_id');
    }

    public function dusun()
    {
        return $this->belongsTo(MasterWilayahDusun::class, 'dusun_id');
    }

    public function olt()
    {
        return $this->belongsTo(\App\Models\MasterOlt::class, 'olt_id');
    }

    public function ponPort()
    {
        return $this->belongsTo(\App\Models\OltPonPort::class, 'pon_port_id');
    }

    public function onu()
    {
        return $this->belongsTo(\App\Models\OltOnu::class, 'olt_onu_id');
    }

    public function deletedBy()
    {
        return $this->belongsTo(User::class, 'deleted_by_user_id');
    }
}

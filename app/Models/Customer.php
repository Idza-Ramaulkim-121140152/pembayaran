<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $fillable = [
        'name', 'area_code', 'phone', 'email', 'due_date', 'is_active',
        'kecamatan_id', 'desa_id', 'dusun_id', 'enable_home_router', 'enable_installation_team',
        'activation_date', 'gender', 'address', 'package_type', 'custom_package',
        'pppoe_username', 'mikrotik_profile', 'home_router_type', 'home_router_host',
        'home_router_port', 'home_router_username', 'home_router_password',
        'home_router_wan_interface', 'home_router_monitoring_enabled', 'odp',
        'installation_fee', 'latitude', 'longitude', 'google_sheets_timestamp'
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'due_date' => 'date:Y-m-d',
        'activation_date' => 'date:Y-m-d',
        'installation_fee' => 'decimal:0',
        'latitude' => 'decimal:8',
        'longitude' => 'decimal:8',
        'home_router_port' => 'integer',
        'home_router_monitoring_enabled' => 'boolean',
        'enable_home_router' => 'boolean',
        'enable_installation_team' => 'boolean',
        'home_router_password' => 'encrypted',
    ];

    protected $appends = ['nama', 'alamat', 'no_telp', 'user_pppoe', 'paket', 'harga', 'tanggal_jatuh_tempo'];
    protected $hidden = ['home_router_password'];

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

    public function odp()
    {
        return $this->belongsTo(\App\Models\Odp::class, 'odp', 'nama');
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
}

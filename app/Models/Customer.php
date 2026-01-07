<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $fillable = [
        'name', 'area_code', 'phone', 'email', 'due_date', 'is_active',
        'activation_date', 'nik', 'gender', 'address', 'package_type', 'custom_package',
    'photo_front', 'photo_modem', 'pppoe_username', 'odp', 'installation_fee',
    'photo_opm', 'photo_ktp', 'latitude', 'longitude'
    ];

    protected $appends = ['nama', 'alamat', 'no_telp', 'user_pppoe', 'paket', 'harga', 'tanggal_jatuh_tempo'];

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

    public function complaints()
    {
        return $this->hasMany(\App\Models\Complaint::class);
    }

    public function odp()
    {
        return $this->belongsTo(\App\Models\Odp::class, 'odp');
    }
}

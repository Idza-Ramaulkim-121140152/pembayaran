<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Odp extends Model
{
    protected $fillable = [
        'nama',
        'rasio_spesial',
        'rasio_distribusi',
        'foto',
        'latitude',
        'longitude',
        'kecamatan_id',
        'desa_id',
        'dusun_id',
        'alamat_detail',
    ];

    public function customers()
    {
        return $this->hasMany(\App\Models\Customer::class, 'odp_id');
    }

    public function legacyCustomers()
    {
        return $this->hasMany(\App\Models\Customer::class, 'odp', 'nama');
    }

    public function incidents()
    {
        return $this->belongsToMany(\App\Models\NetworkIncident::class, 'network_incident_odps');
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

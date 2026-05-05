<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MasterWilayahDesa extends Model
{
    protected $fillable = [
        'kecamatan_id',
        'name',
        'code',
    ];

    public function kecamatan()
    {
        return $this->belongsTo(MasterWilayahKecamatan::class, 'kecamatan_id');
    }

    public function dusuns()
    {
        return $this->hasMany(MasterWilayahDusun::class, 'desa_id');
    }
}

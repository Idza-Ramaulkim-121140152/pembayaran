<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MasterWilayahKecamatan extends Model
{
    protected $fillable = [
        'name',
        'code',
    ];

    public function desas()
    {
        return $this->hasMany(MasterWilayahDesa::class, 'kecamatan_id');
    }
}

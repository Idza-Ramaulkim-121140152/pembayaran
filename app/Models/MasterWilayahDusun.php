<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MasterWilayahDusun extends Model
{
    protected $fillable = [
        'desa_id',
        'name',
        'code',
    ];

    public function desa()
    {
        return $this->belongsTo(MasterWilayahDesa::class, 'desa_id');
    }
}

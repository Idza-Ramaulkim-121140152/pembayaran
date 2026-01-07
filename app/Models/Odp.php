<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Odp extends Model
{
    protected $fillable = [
        'nama', 'rasio_spesial', 'rasio_distribusi', 'foto'
    ];

    public function customers()
    {
        return $this->hasMany(\App\Models\Customer::class, 'odp', 'nama');
    }
}

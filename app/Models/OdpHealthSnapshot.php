<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OdpHealthSnapshot extends Model
{
    protected $fillable = [
        'odp_id',
        'customer_count',
        'online_count',
        'offline_count',
        'offline_ratio',
        'checked_at',
    ];

    protected $casts = [
        'checked_at' => 'datetime',
        'offline_ratio' => 'decimal:2',
    ];

    public function odp()
    {
        return $this->belongsTo(Odp::class);
    }
}

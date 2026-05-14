<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OdpMappingAnomaly extends Model
{
    protected $fillable = [
        'customer_id',
        'legacy_odp_name',
        'anomaly_type',
        'notes',
        'resolved',
        'resolved_by',
        'resolved_at',
    ];

    protected $casts = [
        'resolved' => 'boolean',
        'resolved_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}

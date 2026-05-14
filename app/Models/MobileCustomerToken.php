<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MobileCustomerToken extends Model
{
    protected $fillable = [
        'customer_id',
        'token_hash',
        'device_name',
        'device_id',
        'ip_address',
        'user_agent',
        'last_used_at',
        'expires_at',
        'revoked_at',
    ];

    protected $casts = [
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function scopeActive($query)
    {
        return $query
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now());
    }
}

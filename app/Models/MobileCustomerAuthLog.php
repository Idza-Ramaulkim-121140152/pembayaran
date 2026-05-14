<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MobileCustomerAuthLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'customer_id',
        'pppoe_username',
        'event',
        'status',
        'message',
        'ip_address',
        'user_agent',
        'meta',
        'created_at',
    ];

    protected $casts = [
        'meta' => 'array',
        'created_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerBillingProfile extends Model
{
    protected $fillable = [
        'customer_id',
        'billing_cycle',
        'billing_day',
        'prorate_policy',
        'addon_bundle',
    ];

    protected $casts = [
        'addon_bundle' => 'array',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}

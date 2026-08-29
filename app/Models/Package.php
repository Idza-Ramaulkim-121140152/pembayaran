<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Package extends Model
{
    protected $fillable = [
        'name',
        'speed',
        'mikrotik_profile',
        'price',
        'device_count',
        'features',
        'description',
        'is_popular',
        'is_active',
        'show_in_public_registration',
        'sort_order',
    ];

    protected $casts = [
        'price' => 'decimal:0',
        'features' => 'array',
        'is_popular' => 'boolean',
        'is_active' => 'boolean',
        'show_in_public_registration' => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true)->orderBy('sort_order');
    }

    public function scopePublicRegistration($query)
    {
        return $query->where('is_active', true)
            ->where(function ($q) {
                $q->where('show_in_public_registration', true)
                  ->orWhereNull('show_in_public_registration');
            })
            ->orderBy('sort_order');
    }

    public function priceHistories()
    {
        return $this->hasMany(PackagePriceHistory::class);
    }

    public function customers()
    {
        return $this->hasMany(Customer::class, 'package_id');
    }
}

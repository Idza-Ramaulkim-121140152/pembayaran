<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentReceiptOption extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'is_active',
        'is_default',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_default' => 'boolean',
    ];

    public function getDisplayNameAttribute(): string
    {
        return $this->name;
    }
}

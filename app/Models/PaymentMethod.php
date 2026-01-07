<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class PaymentMethod extends Model
{
    use HasFactory;

    protected $fillable = [
        'type',
        'bank_name',
        'account_name',
        'account_number',
        'qris_image',
        'instructions',
        'is_active',
        'is_default',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_default' => 'boolean',
    ];

    public function getDisplayNameAttribute()
    {
        if ($this->type === 'qris') {
            return 'QRIS';
        }
        return $this->bank_name;
    }
}

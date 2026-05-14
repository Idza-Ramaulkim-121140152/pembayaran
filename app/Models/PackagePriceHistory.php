<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PackagePriceHistory extends Model
{
    protected $fillable = [
        'package_id',
        'old_price',
        'new_price',
        'effective_from',
        'reason',
        'changed_by',
    ];

    protected $casts = [
        'old_price' => 'decimal:2',
        'new_price' => 'decimal:2',
        'effective_from' => 'date:Y-m-d',
    ];

    public function package()
    {
        return $this->belongsTo(Package::class);
    }

    public function changer()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}

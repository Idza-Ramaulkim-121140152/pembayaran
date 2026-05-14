<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPackageHistory extends Model
{
    protected $fillable = [
        'customer_id',
        'old_package_id',
        'new_package_id',
        'old_package_label',
        'new_package_label',
        'effective_from',
        'reason',
        'changed_by',
    ];

    protected $casts = [
        'effective_from' => 'date:Y-m-d',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function oldPackage()
    {
        return $this->belongsTo(Package::class, 'old_package_id');
    }

    public function newPackage()
    {
        return $this->belongsTo(Package::class, 'new_package_id');
    }

    public function changer()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}

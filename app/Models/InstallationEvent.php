<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallationEvent extends Model
{
    protected $fillable = [
        'installation_work_order_id',
        'event_type',
        'message',
        'meta',
        'created_by',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function workOrder()
    {
        return $this->belongsTo(InstallationWorkOrder::class, 'installation_work_order_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

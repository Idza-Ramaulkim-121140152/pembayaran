<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallationChecklist extends Model
{
    protected $fillable = [
        'installation_work_order_id',
        'step_key',
        'label',
        'is_required',
        'is_completed',
        'completed_at',
        'completed_by',
        'sort_order',
    ];

    protected $casts = [
        'is_required' => 'boolean',
        'is_completed' => 'boolean',
        'completed_at' => 'datetime',
    ];

    public function workOrder()
    {
        return $this->belongsTo(InstallationWorkOrder::class, 'installation_work_order_id');
    }

    public function completer()
    {
        return $this->belongsTo(User::class, 'completed_by');
    }
}

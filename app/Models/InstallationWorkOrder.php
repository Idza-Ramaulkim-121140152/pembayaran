<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallationWorkOrder extends Model
{
    protected $fillable = [
        'lead_id',
        'customer_id',
        'assigned_to',
        'odp_id',
        'scheduled_at',
        'status',
        'completed_at',
        'meta',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'completed_at' => 'datetime',
        'meta' => 'array',
    ];

    public function lead()
    {
        return $this->belongsTo(InstallationLead::class, 'lead_id');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function odp()
    {
        return $this->belongsTo(Odp::class);
    }

    public function events()
    {
        return $this->hasMany(InstallationEvent::class, 'installation_work_order_id');
    }

    public function checklists()
    {
        return $this->hasMany(InstallationChecklist::class, 'installation_work_order_id');
    }

    public function documents()
    {
        return $this->hasMany(InstallationDocument::class, 'installation_work_order_id');
    }
}

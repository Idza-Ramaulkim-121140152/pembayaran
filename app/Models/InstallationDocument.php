<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallationDocument extends Model
{
    protected $fillable = [
        'installation_work_order_id',
        'doc_type',
        'file_path',
        'notes',
        'meta',
        'uploaded_by',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function workOrder()
    {
        return $this->belongsTo(InstallationWorkOrder::class, 'installation_work_order_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}

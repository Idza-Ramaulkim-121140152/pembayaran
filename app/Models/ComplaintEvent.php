<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ComplaintEvent extends Model
{
    protected $fillable = [
        'complaint_id',
        'event_type',
        'message',
        'is_internal',
        'meta',
        'created_by',
    ];

    protected $casts = [
        'is_internal' => 'boolean',
        'meta' => 'array',
    ];

    public function complaint()
    {
        return $this->belongsTo(Complaint::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

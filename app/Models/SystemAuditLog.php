<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemAuditLog extends Model
{
    protected $fillable = [
        'event_type',
        'subject_type',
        'subject_id',
        'actor_id',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function subject()
    {
        return $this->morphTo();
    }
}

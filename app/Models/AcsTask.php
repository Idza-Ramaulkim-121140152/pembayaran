<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcsTask extends Model
{
    use HasFactory;

    protected $table = 'acs_tasks';

    protected $fillable = [
        'acs_device_id',
        'name',
        'payload',
        'status',
        'retries',
        'error_message',
        'sent_at',
        'completed_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'retries' => 'integer',
        'sent_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function device(): BelongsTo
    {
        return $this->belongsTo(AcsDevice::class, 'acs_device_id');
    }
}

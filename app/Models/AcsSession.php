<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcsSession extends Model
{
    use HasFactory;

    protected $table = 'acs_sessions';
    protected $primaryKey = 'session_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'session_id',
        'acs_device_id',
        'state',
        'current_task_id',
        'last_activity_at',
        'expires_at',
    ];

    protected $casts = [
        'last_activity_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function device(): BelongsTo
    {
        return $this->belongsTo(AcsDevice::class, 'acs_device_id');
    }

    public function currentTask(): BelongsTo
    {
        return $this->belongsTo(AcsTask::class, 'current_task_id');
    }
}

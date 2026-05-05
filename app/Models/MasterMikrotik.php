<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MasterMikrotik extends Model
{
    protected $fillable = [
        'name',
        'host',
        'port',
        'username',
        'password_encrypted',
        'is_active',
        'alert_recipients',
        'last_status',
        'last_checked_at',
        'last_alerted_at',
        'created_by',
        'updated_by',
    ];

    protected $hidden = [
        'password_encrypted',
    ];

    protected function casts(): array
    {
        return [
            'port' => 'integer',
            'is_active' => 'boolean',
            'password_encrypted' => 'encrypted',
            'last_checked_at' => 'datetime',
            'last_alerted_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

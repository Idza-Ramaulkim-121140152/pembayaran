<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QrisSettlement extends Model
{
    public const SOURCE_WEBHOOK = 'webhook';
    public const SOURCE_MANUAL = 'manual';

    public const TYPE_MANUAL = 'manual';
    public const TYPE_AUTO = 'auto';

    protected $fillable = [
        'cycle_date',
        'settled_at',
        'amount',
        'source',
        'settlement_type',
        'device_name',
        'raw_title',
        'raw_text',
        'reference_code',
        'fingerprint',
        'qris_webhook_log_id',
        'created_by',
        'notes',
        'meta',
    ];

    protected $casts = [
        'cycle_date' => 'date:Y-m-d',
        'settled_at' => 'datetime',
        'amount' => 'decimal:2',
        'meta' => 'array',
    ];

    public function webhookLog(): BelongsTo
    {
        return $this->belongsTo(QrisWebhookLog::class, 'qris_webhook_log_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

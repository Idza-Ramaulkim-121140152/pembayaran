<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QrisWebhookLog extends Model
{
    protected $fillable = [
        'device_name',
        'raw_title',
        'raw_text',
        'extracted_amount',
        'status',
        'invoice_id',
        'meta',
    ];

    protected $casts = [
        'extracted_amount' => 'decimal:2',
        'meta' => 'array',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}

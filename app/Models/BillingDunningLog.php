<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingDunningLog extends Model
{
    protected $fillable = [
        'invoice_id',
        'customer_id',
        'wave',
        'scheduled_date',
        'status',
        'attempt_count',
        'message',
        'last_error',
        'sent_at',
        'meta',
    ];

    protected $casts = [
        'scheduled_date' => 'date:Y-m-d',
        'sent_at' => 'datetime',
        'attempt_count' => 'integer',
        'meta' => 'array',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}

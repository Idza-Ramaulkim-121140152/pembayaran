<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingAutoInvoiceJob extends Model
{
    protected $fillable = [
        'requested_by_user_id',
        'segment',
        'state',
        'phase',
        'customer_ids',
        'search_context',
        'summary',
        'results',
        'invalid_services',
        'error_message',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'customer_ids' => 'array',
        'summary' => 'array',
        'results' => 'array',
        'invalid_services' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }
}


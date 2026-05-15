<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingPaymentCapture extends Model
{
    protected $fillable = [
        'source',
        'invoice_id',
        'customer_id',
        'amount',
        'paid_date',
        'reference_code',
        'fingerprint',
        'match_status',
        'match_confidence',
        'reviewed_by',
        'reviewed_at',
        'meta',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_date' => 'date:Y-m-d',
        'match_confidence' => 'decimal:2',
        'reviewed_at' => 'datetime',
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

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function matchReviews()
    {
        return $this->hasMany(BillingPaymentMatchReview::class, 'capture_id');
    }
}

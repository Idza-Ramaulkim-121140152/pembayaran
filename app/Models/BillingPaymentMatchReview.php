<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingPaymentMatchReview extends Model
{
    protected $fillable = [
        'capture_id',
        'candidate_invoice_id',
        'score',
        'reason',
        'status',
        'meta',
    ];

    protected $casts = [
        'score' => 'decimal:2',
        'meta' => 'array',
    ];

    public function capture()
    {
        return $this->belongsTo(BillingPaymentCapture::class, 'capture_id');
    }

    public function candidateInvoice()
    {
        return $this->belongsTo(Invoice::class, 'candidate_invoice_id');
    }
}

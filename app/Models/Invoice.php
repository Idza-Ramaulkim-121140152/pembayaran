<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $fillable = [
        'customer_id',
        'invoice_date',
        'due_date',
        'amount',
        'status',
        'invoice_link',
        'paid_at',
        'received_via_payment_method_id',
        'received_via_payment_receipt_option_id',
        'bukti_pembayaran',
        'tolak_info',
    ];

    protected $casts = [
        'invoice_date' => 'date:Y-m-d',
        'due_date' => 'date:Y-m-d',
        'paid_at' => 'datetime',
        'amount' => 'decimal:0',
    ];
    public function customer()
    {
        return $this->belongsTo(\App\Models\Customer::class);
    }

    public function receivedViaPaymentMethod()
    {
        return $this->belongsTo(\App\Models\PaymentMethod::class, 'received_via_payment_method_id');
    }

    public function receivedViaPaymentReceiptOption()
    {
        return $this->belongsTo(\App\Models\PaymentReceiptOption::class, 'received_via_payment_receipt_option_id');
    }
}

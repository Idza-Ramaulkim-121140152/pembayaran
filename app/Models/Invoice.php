<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $fillable = [
        'customer_id', 'invoice_date', 'due_date', 'amount', 'status', 'invoice_link', 'paid_at', 'bukti_pembayaran', 'tolak_info'
    ];
    public function customer()
    {
        return $this->belongsTo(\App\Models\Customer::class);
    }
}

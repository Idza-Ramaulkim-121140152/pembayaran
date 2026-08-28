<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentReceiverApprovalRequest extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'invoice_id',
        'customer_id',
        'source_type',
        'source_id',
        'financial_transaction_id',
        'requested_by_user_id',
        'receiver_user_id',
        'borrower_id',
        'amount',
        'status',
        'decision_at',
        'decision_note',
        'meta',
    ];

    protected $casts = [
        'decision_at' => 'datetime',
        'meta' => 'array',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function financialTransaction()
    {
        return $this->belongsTo(FinancialTransaction::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'receiver_user_id');
    }

    public function borrower()
    {
        return $this->belongsTo(Borrower::class);
    }
}

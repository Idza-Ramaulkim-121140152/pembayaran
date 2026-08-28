<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BorrowerLoan extends Model
{
    use HasFactory;

    public const STATUS_PENDING_RECEIVER_APPROVAL = 'pending_receiver_approval';
    public const STATUS_OUTSTANDING = 'outstanding';
    public const STATUS_REJECTED_BY_RECEIVER = 'rejected_by_receiver';
    public const STATUS_SETTLED = 'settled';

    protected $fillable = [
        'borrower_id',
        'invoice_id',
        'confirmed_by_user_id',
        'target_receiver_user_id',
        'actual_receiver_user_id',
        'amount',
        'settled_amount',
        'status',
        'source',
        'occurred_at',
        'notes',
        'meta',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
        'meta' => 'array',
    ];

    public function borrower()
    {
        return $this->belongsTo(Borrower::class);
    }

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function confirmedBy()
    {
        return $this->belongsTo(User::class, 'confirmed_by_user_id');
    }

    public function targetReceiver()
    {
        return $this->belongsTo(User::class, 'target_receiver_user_id');
    }

    public function actualReceiver()
    {
        return $this->belongsTo(User::class, 'actual_receiver_user_id');
    }

    public function payments()
    {
        return $this->hasMany(BorrowerLoanPayment::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BorrowerLoanPayment extends Model
{
    use HasFactory;

    protected $fillable = [
        'borrower_loan_id',
        'amount',
        'payment_date',
        'action_group_key',
        'received_by_user_id',
        'financial_transaction_id',
        'pengeluaran_id',
        'notes',
    ];

    protected $casts = [
        'payment_date' => 'date:Y-m-d',
    ];

    public function loan()
    {
        return $this->belongsTo(BorrowerLoan::class, 'borrower_loan_id');
    }

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    public function financialTransaction()
    {
        return $this->belongsTo(FinancialTransaction::class);
    }

    public function pengeluaran()
    {
        return $this->belongsTo(Pengeluaran::class);
    }
}

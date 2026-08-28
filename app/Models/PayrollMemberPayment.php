<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollMemberPayment extends Model
{
    protected $fillable = [
        'payroll_member_id',
        'nominal',
        'catatan',
        'loan_handling',
        'gross_nominal',
        'loan_deduction_amount',
        'cash_paid_amount',
        'borrower_id',
        'borrower_loan_settlement_action_group_key',
    ];

    protected $casts = [
        'nominal' => 'decimal:0',
        'gross_nominal' => 'decimal:0',
        'loan_deduction_amount' => 'decimal:0',
        'cash_paid_amount' => 'decimal:0',
    ];

    public function member()
    {
        return $this->belongsTo(PayrollMember::class, 'payroll_member_id');
    }

    public function borrower()
    {
        return $this->belongsTo(Borrower::class);
    }
}

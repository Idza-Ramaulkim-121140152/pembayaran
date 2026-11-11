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
        'payment_method',
        'bank_name',
        'account_number',
        'account_holder',
        'attendance_summary',
        'whatsapp_status',
        'whatsapp_sent_at',
        'whatsapp_error',
    ];

    protected $casts = [
        'nominal' => 'decimal:0',
        'gross_nominal' => 'decimal:0',
        'loan_deduction_amount' => 'decimal:0',
        'cash_paid_amount' => 'decimal:0',
        'attendance_summary' => 'array',
        'whatsapp_sent_at' => 'datetime',
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

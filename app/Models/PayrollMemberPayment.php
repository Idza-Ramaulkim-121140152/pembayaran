<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollMemberPayment extends Model
{
    protected $fillable = ['payroll_member_id', 'nominal', 'catatan'];

    public function member()
    {
        return $this->belongsTo(PayrollMember::class, 'payroll_member_id');
    }
}

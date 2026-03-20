<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollMember extends Model
{
    protected $fillable = ['nama', 'telepon'];

    public function projects()
    {
        return $this->belongsToMany(PayrollProject::class, 'payroll_project_members')
            ->withPivot('bagian', 'paid_at')
            ->withTimestamps();
    }

    public function payments()
    {
        return $this->hasMany(PayrollMemberPayment::class);
    }

    /**
     * Total gaji belum dibayar = total bagian semua proyek - total pembayaran
     */
    public function getUnpaidTotalAttribute()
    {
        $totalBagian = $this->projects()->sum('payroll_project_members.bagian');
        $totalPayments = $this->payments()->sum('nominal');
        return max(0, $totalBagian - $totalPayments);
    }
}

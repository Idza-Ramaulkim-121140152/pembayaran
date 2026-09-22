<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollMember extends Model
{
    protected $fillable = [
        'nama',
        'telepon',
        'tipe_gaji',
        'gaji_pokok',
        'tunjangan',
        'tanggal_gajian',
        'nama_bank',
        'nomor_rekening',
        'is_active',
    ];

    protected $casts = [
        'gaji_pokok'     => 'decimal:0',
        'tunjangan'      => 'decimal:0',
        'tanggal_gajian' => 'integer',
        'is_active'      => 'boolean',
    ];

    public function getTotalGajiBulananAttribute(): float
    {
        return (float) ($this->gaji_pokok ?? 0) + (float) ($this->tunjangan ?? 0);
    }


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

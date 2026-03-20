<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollProject extends Model
{
    protected $fillable = ['tanggal', 'total', 'status', 'paid_at', 'catatan'];

    protected $casts = [
        'tanggal' => 'date',
        'paid_at' => 'datetime',
    ];

    public function members()
    {
        return $this->belongsToMany(PayrollMember::class, 'payroll_project_members')
            ->withPivot('bagian', 'paid_at')
            ->withTimestamps();
    }

    public function details()
    {
        return $this->hasMany(PayrollProjectDetail::class);
    }

    /**
     * Hitung total dari semua detail dan bagi rata ke anggota
     */
    public function recalculate()
    {
        $total = $this->details()->sum('subtotal');
        $this->total = $total;
        $this->save();

        $memberCount = $this->members()->count();
        if ($memberCount > 0) {
            $bagian = floor($total / $memberCount);
            $sisa = $total - ($bagian * $memberCount);

            $members = $this->members()->get();
            foreach ($members as $i => $member) {
                // Anggota pertama dapat sisa pembulatan
                $share = $bagian + ($i === 0 ? $sisa : 0);
                $this->members()->updateExistingPivot($member->id, ['bagian' => $share]);
            }
        }
    }
}

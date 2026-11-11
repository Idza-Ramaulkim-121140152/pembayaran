<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollMemberAllowance extends Model
{
    public const JENIS_BULANAN = 'bulanan';
    public const JENIS_HARIAN = 'harian';

    protected $fillable = [
        'payroll_member_id',
        'nama',
        'jenis',
        'nominal',
    ];

    protected $casts = [
        'nominal' => 'decimal:0',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(PayrollMember::class, 'payroll_member_id');
    }
}

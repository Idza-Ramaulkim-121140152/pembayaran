<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerPaymentBehaviorProfile extends Model
{
    protected $fillable = [
        'customer_id',
        'total_invoices_analyzed',
        'total_paid_invoices',
        'ontime_paid_count',
        'early_paid_count',
        'late_paid_count',
        'avg_delta_days',
        'median_delta_days',
        'payment_probability',
        'behavior_segment',
        'behavior_summary',
        'last_calculated_at',
    ];

    protected $casts = [
        'total_invoices_analyzed' => 'integer',
        'total_paid_invoices' => 'integer',
        'ontime_paid_count' => 'integer',
        'early_paid_count' => 'integer',
        'late_paid_count' => 'integer',
        'avg_delta_days' => 'float',
        'median_delta_days' => 'float',
        'payment_probability' => 'float',
        'last_calculated_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function getSegmentBadgeAttribute(): array
    {
        return match ($this->behavior_segment) {
            'early_payer' => [
                'label' => 'Bayar Cepat',
                'bg' => 'bg-emerald-100 text-emerald-800 border-emerald-200',
                'icon' => 'zap',
                'description' => sprintf('Rata-rata bayar %.0f hari lebih cepat', abs($this->avg_delta_days)),
            ],
            'ontime_payer' => [
                'label' => 'Tepat Waktu',
                'bg' => 'bg-blue-100 text-blue-800 border-blue-200',
                'icon' => 'check-circle',
                'description' => 'Selalu tepat waktu sesuai jatuh tempo',
            ],
            'grace_payer' => [
                'label' => 'Toleransi (1-3 Hari)',
                'bg' => 'bg-amber-100 text-amber-800 border-amber-200',
                'icon' => 'clock',
                'description' => sprintf('Membayar mundur sekitar %.0f hari', $this->avg_delta_days),
            ],
            'late_payer' => [
                'label' => 'Sering Terlambat',
                'bg' => 'bg-red-100 text-red-800 border-red-200',
                'icon' => 'alert-triangle',
                'description' => sprintf('Keterlambatan rata-rata %.0f hari', $this->avg_delta_days),
            ],
            default => [
                'label' => 'Pelanggan Baru',
                'bg' => 'bg-purple-100 text-purple-800 border-purple-200',
                'icon' => 'sparkles',
                'description' => 'Menggunakan estimasi baseline sistem',
            ],
        };
    }
}

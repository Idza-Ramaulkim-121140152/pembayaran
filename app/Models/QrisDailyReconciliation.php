<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QrisDailyReconciliation extends Model
{
    public const STATUS_NO_ACTIVITY = 'no_activity';
    public const STATUS_PENDING = 'pending';
    public const STATUS_MATCHED = 'matched';
    public const STATUS_MISMATCH = 'mismatch';

    protected $fillable = [
        'cycle_date',
        'period_start',
        'period_end',
        'system_qris_gross_amount',
        'system_qris_count',
        'expected_mdr_fee',
        'expected_payout_fee',
        'expected_net_amount',
        'settled_amount',
        'settlement_count',
        'discrepancy_amount',
        'status',
        'last_evaluated_at',
        'alert_sent_at',
        'last_alert_discrepancy',
        'alert_count',
        'notes',
        'meta',
    ];

    protected $casts = [
        'cycle_date' => 'date:Y-m-d',
        'period_start' => 'datetime',
        'period_end' => 'datetime',
        'system_qris_gross_amount' => 'decimal:2',
        'system_qris_count' => 'integer',
        'expected_mdr_fee' => 'decimal:2',
        'expected_payout_fee' => 'decimal:2',
        'expected_net_amount' => 'decimal:2',
        'settled_amount' => 'decimal:2',
        'settlement_count' => 'integer',
        'discrepancy_amount' => 'decimal:2',
        'last_evaluated_at' => 'datetime',
        'alert_sent_at' => 'datetime',
        'last_alert_discrepancy' => 'decimal:2',
        'alert_count' => 'integer',
        'meta' => 'array',
    ];

    public function settlements(): HasMany
    {
        return $this->hasMany(QrisSettlement::class, 'cycle_date', 'cycle_date');
    }
}

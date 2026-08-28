<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashObligationEntry extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_CANCELLED = 'cancelled';

    public const PRIORITY_HIGH = 'high';
    public const PRIORITY_MEDIUM = 'medium';
    public const PRIORITY_LOW = 'low';

    public const CATEGORY_OPERATIONAL = 'operasional';
    public const CATEGORY_LOAN = 'pinjaman';
    public const CATEGORY_VENDOR = 'vendor';
    public const CATEGORY_PURCHASE = 'pembelian';
    public const CATEGORY_OTHER = 'lainnya';

    protected $fillable = [
        'title',
        'amount',
        'due_date',
        'category',
        'priority',
        'status',
        'notes',
        'completed_at',
        'created_by',
        'updated_by',
        'meta',
    ];

    protected $casts = [
        'due_date' => 'date:Y-m-d',
        'completed_at' => 'datetime',
        'meta' => 'array',
    ];

    public static function statusOptions(): array
    {
        return [
            self::STATUS_PENDING,
            self::STATUS_COMPLETED,
            self::STATUS_CANCELLED,
        ];
    }

    public static function priorityOptions(): array
    {
        return [
            self::PRIORITY_HIGH,
            self::PRIORITY_MEDIUM,
            self::PRIORITY_LOW,
        ];
    }

    public static function categoryOptions(): array
    {
        return [
            self::CATEGORY_OPERATIONAL,
            self::CATEGORY_LOAN,
            self::CATEGORY_VENDOR,
            self::CATEGORY_PURCHASE,
            self::CATEGORY_OTHER,
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HotspotVoucherOrder extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_PAID = 'paid';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    public const VOUCHER_PENDING = 'pending';
    public const VOUCHER_UNUSED = 'unused';
    public const VOUCHER_ACTIVE = 'active';
    public const VOUCHER_EXPIRED = 'expired';

    protected $table = 'hotspot_voucher_orders';

    protected $fillable = [
        'order_code',
        'package_id',
        'customer_phone',
        'customer_name',
        'base_amount',
        'qris_unique_code',
        'qris_expected_amount',
        'qris_dynamic_payload',
        'qris_expired_at',
        'status',
        'paid_at',
        'voucher_code',
        'voucher_status',
        'first_login_at',
        'expires_at',
        'mikrotik_synced_at',
        'whatsapp_sent_at',
        'qris_sender',
        'qris_transaction_number',
        'login_url',
        'meta',
    ];

    protected $casts = [
        'base_amount' => 'float',
        'qris_unique_code' => 'integer',
        'qris_expected_amount' => 'float',
        'qris_expired_at' => 'datetime',
        'paid_at' => 'datetime',
        'first_login_at' => 'datetime',
        'expires_at' => 'datetime',
        'mikrotik_synced_at' => 'datetime',
        'whatsapp_sent_at' => 'datetime',
        'meta' => 'array',
    ];

    public function package(): BelongsTo
    {
        return $this->belongsTo(HotspotVoucherPackage::class, 'package_id');
    }
}

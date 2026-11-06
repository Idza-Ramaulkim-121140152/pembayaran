<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class FinancialTransaction extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_CONFIRMED = 'confirmed';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'type',
        'source',
        'category',
        'description',
        'amount',
        'transaction_date',
        'reference_type',
        'reference_id',
        'created_by',
        'updated_by',
        'meta',
        'status',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'transaction_date' => 'date:Y-m-d',
        'meta' => 'array',
    ];

    protected $appends = [
        'confirmation_via',
    ];

    /**
     * Mendeteksi metode konfirmasi pembayaran:
     * - 'unique_code': Terkonfirmasi otomatis dari QRIS dinamis / notifikasi push webhook (Kode Unik - Hijau)
     * - 'wa_photo': Terkonfirmasi via bot AI WhatsApp capture bukti transfer (Kirim Foto WA - Orange)
     * - 'manual': Dikonfirmasi secara manual oleh admin kantor (Konfirmasi Manual - Biru)
     */
    public function getConfirmationViaAttribute(): string
    {
        $explicit = data_get($this->meta, 'confirmation_method');
        if (in_array($explicit, ['unique_code', 'wa_photo', 'manual'], true)) {
            return $explicit;
        }

        if ($this->source === 'invoice_payment') {
            // 1. Cek apakah ada bukti capture dari Bot WhatsApp
            $proofSource = data_get($this->meta, 'payment_proof.source');
            $captureId = data_get($this->meta, 'payment_proof.capture_id');
            if ($proofSource === 'whatsapp_webhook' || $proofSource === 'whatsapp' || !empty($captureId)) {
                return 'wa_photo';
            }

            if ($this->relationLoaded('reference') && $this->reference instanceof Invoice) {
                if ($this->reference->relationLoaded('approvedPaymentCapture') && $this->reference->approvedPaymentCapture) {
                    return 'wa_photo';
                }
            }

            // 2. Cek apakah terkonfirmasi dari QRIS Dinamis (Kode Unik / Webhook)
            $qrisTxNum = (string) data_get($this->meta, 'qris_transaction_number', '');
            $qrisSender = (string) data_get($this->meta, 'qris_sender', '');
            $settledVia = data_get($this->meta, 'settled_via');
            if ($settledVia === 'qris_webhook' || str_starts_with($qrisTxNum, 'QG-') || $qrisSender === 'GoPay QRIS') {
                return 'unique_code';
            }

            if ($this->relationLoaded('reference') && $this->reference instanceof Invoice) {
                if ((int) $this->reference->qris_unique_code > 0 && (
                    str_starts_with((string) $this->reference->qris_transaction_number, 'QG-') ||
                    ($this->reference->qris_payment_time && !$this->reference->approvedPaymentCapture)
                )) {
                    return 'unique_code';
                }
            }
        }

        return 'manual';
    }

    public function reference(): MorphTo
    {
        return $this->morphTo();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function receiverApprovalRequests()
    {
        return $this->hasMany(PaymentReceiverApprovalRequest::class);
    }
}

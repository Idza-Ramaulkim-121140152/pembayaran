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
        'unique_code_info',
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

    /**
     * Ringkasan informasi kode unik QRIS (jika pembayaran menggunakan kode unik atau via QRIS webhook).
     */
    public function getUniqueCodeInfoAttribute(): ?array
    {
        if ($this->type === 'expense') {
            return null;
        }

        $meta = is_array($this->meta) ? $this->meta : [];
        $method = $this->getConfirmationViaAttribute();
        $invoice = ($this->relationLoaded('reference') && $this->reference instanceof Invoice)
            ? $this->reference
            : null;
        $settledLog = ($invoice && $invoice->relationLoaded('settledQrisWebhookLog'))
            ? $invoice->settledQrisWebhookLog
            : null;
        $package = ($invoice && $invoice->relationLoaded('customer') && $invoice->customer && $invoice->customer->relationLoaded('package'))
            ? $invoice->customer->package
            : null;

        return self::resolveUniqueCodeBreakdown(
            $meta,
            abs((float) $this->amount),
            $method,
            $invoice,
            $package,
            $settledLog
        );
    }

    /**
     * Resolusi terpusat rincian kode unik QRIS dari metadata transaksi, invoice, paket, dan webhook log.
     */
    public static function resolveUniqueCodeBreakdown(
        array $meta,
        float $ledgerAmount,
        string $confirmationMethod,
        ?Invoice $invoice = null,
        ?\App\Models\Package $package = null,
        ?\App\Models\QrisWebhookLog $settledLog = null,
        array $extraMeta = []
    ): ?array {
        $metaCode = (int) data_get($meta, 'qris_unique_code', 0);
        $metaGenCode = (int) data_get($meta, 'qris_generated_unique_code', 0);
        $invCode = $invoice ? (int) ($invoice->qris_unique_code ?? 0) : 0;
        $generatedCode = $metaCode > 0 ? $metaCode : ($metaGenCode > 0 ? $metaGenCode : ($invCode > 0 ? $invCode : null));

        $settledAmount = isset($extraMeta['qris_settled_amount']) && (float) $extraMeta['qris_settled_amount'] > 0
            ? (float) $extraMeta['qris_settled_amount']
            : (data_get($meta, 'qris_settled_amount') !== null
                ? (float) data_get($meta, 'qris_settled_amount')
                : ($settledLog && (float) $settledLog->extracted_amount > 0 ? (float) $settledLog->extracted_amount : null));

        $expectedAmount = data_get($meta, 'qris_expected_amount') !== null
            ? (float) data_get($meta, 'qris_expected_amount')
            : ($invoice && $invoice->qris_expected_amount !== null ? (float) $invoice->qris_expected_amount : null);

        $invAmount = $invoice ? (float) $invoice->amount : null;
        $packagePrice = $package ? (float) $package->price : null;

        $code = null;
        $baseAmount = null;
        $totalAmount = null;
        $isExactSettlement = false;
        $source = null;

        if ($settledAmount !== null && $settledAmount > 0) {
            if ($expectedAmount !== null && abs($settledAmount - $expectedAmount) <= 1 && $generatedCode) {
                $code = $generatedCode;
                $totalAmount = $settledAmount;
                $baseAmount = data_get($meta, 'qris_base_amount') !== null
                    ? (float) data_get($meta, 'qris_base_amount')
                    : max(0.0, $totalAmount - $code);
                $source = $metaCode > 0 ? 'meta' : 'qris_webhook_log';
            } elseif ($invAmount !== null && $settledAmount > $invAmount && ($settledAmount - $invAmount) < 1000) {
                $code = (int) round($settledAmount - $invAmount);
                $baseAmount = $invAmount;
                $totalAmount = $settledAmount;
                $source = 'webhook_amount_diff';
            } elseif ($generatedCode && $packagePrice !== null && $packagePrice > 0 && abs($settledAmount - ($packagePrice + $generatedCode)) <= 1) {
                $code = $generatedCode;
                $baseAmount = $packagePrice;
                $totalAmount = $settledAmount;
                $source = 'package_plus_code';
            } elseif ($invAmount !== null && abs($settledAmount - $invAmount) <= 1 && ((int) round($settledAmount) % 1000 === 0 || ($expectedAmount !== null && abs($settledAmount - $expectedAmount) > 1))) {
                $isExactSettlement = true;
                $baseAmount = $settledAmount;
                $totalAmount = $settledAmount;
                $source = 'exact_amount';
            }
        }

        if ($code === null && !$isExactSettlement) {
            $candidateCode = $metaCode > 0
                ? $metaCode
                : (($confirmationMethod === 'unique_code' && $generatedCode)
                    ? $generatedCode
                    : (($invCode > 0 && $expectedAmount !== null && abs($ledgerAmount - $expectedAmount) <= 1) ? $invCode : null));

            if ($candidateCode !== null && $candidateCode > 0) {
                $code = $candidateCode;
                if ($expectedAmount !== null && $expectedAmount > 0) {
                    $totalAmount = $expectedAmount;
                    $baseAmount = data_get($meta, 'qris_base_amount') !== null
                        ? (float) data_get($meta, 'qris_base_amount')
                        : max(0.0, $expectedAmount - $code);
                } elseif ($packagePrice !== null && $packagePrice > 0 && abs($ledgerAmount - ($packagePrice + $code)) <= 1) {
                    $baseAmount = $packagePrice;
                    $totalAmount = $ledgerAmount;
                } else {
                    $baseAmount = $invAmount ?? $ledgerAmount;
                    $totalAmount = $baseAmount + $code;
                }
                $source = $metaCode > 0 ? 'meta' : 'invoice_qris';
            }
        }

        if ($code === null && !$isExactSettlement && $confirmationMethod === 'unique_code') {
            $candidateTotal = $settledAmount ?? $ledgerAmount;
            if ($packagePrice !== null && $packagePrice > 0 && (int) round($packagePrice) % 1000 === 0) {
                $diff = (int) round($candidateTotal - $packagePrice);
                if ($diff > 0 && $diff < 1000) {
                    $code = $diff;
                    $baseAmount = $packagePrice;
                    $totalAmount = $candidateTotal;
                    $source = 'package_diff';
                }
            }
        }

        if ($confirmationMethod !== 'unique_code' && $code === null) {
            return null;
        }

        $resolvedTotal = $totalAmount !== null ? (float) $totalAmount : ($settledAmount ?? $ledgerAmount);
        $resolvedBase = $baseAmount !== null ? (float) $baseAmount : ($invAmount ?? $ledgerAmount);

        return [
            'has_unique_code' => $code !== null && $code > 0,
            'code' => $code,
            'formatted_code' => $code !== null && $code > 0 ? ('+' . $code) : null,
            'base_amount' => $resolvedBase,
            'expected_amount' => $expectedAmount ?? $resolvedTotal,
            'settled_amount' => $settledAmount,
            'total_amount' => $resolvedTotal,
            'amount_differs_from_ledger' => abs($resolvedTotal - $ledgerAmount) > 0.5,
            'is_exact_amount_settlement' => $isExactSettlement,
            'generated_code' => $generatedCode,
            'webhook_device' => $extraMeta['qris_webhook_device'] ?? data_get($meta, 'qris_webhook_device') ?: $settledLog?->device_name,
            'source' => $source ?: ($confirmationMethod === 'unique_code' ? 'webhook_no_code' : null),
        ];
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

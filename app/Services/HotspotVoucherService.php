<?php

namespace App\Services;

use App\Models\FinancialTransaction;
use App\Models\HotspotVoucherOrder;
use App\Models\HotspotVoucherPackage;
use App\Models\NotificationLog;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class HotspotVoucherService
{
    // Karakter tanpa huruf/angka mirip (tanpa 0/O, 1/I/L) agar mudah diketik di HP
    private const VOUCHER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    public function __construct(
        protected DynamicQrisService $dynamicQrisService,
        protected PaymentReceiverService $paymentReceiverService,
        protected ?MikroTikService $mikroTikService = null,
    ) {
    }

    /**
     * Generate kode voucher 6-8 karakter huruf besar & angka tanpa karakter ambigu.
     */
    public function generateVoucherCode(int $length = 6): string
    {
        $chars = self::VOUCHER_ALPHABET;
        $maxIndex = strlen($chars) - 1;

        for ($attempt = 0; $attempt < 30; $attempt++) {
            $code = '';
            for ($i = 0; $i < $length; $i++) {
                $code .= $chars[random_int(0, $maxIndex)];
            }

            if (!HotspotVoucherOrder::where('voucher_code', $code)->exists()) {
                return $code;
            }
        }

        return 'RK' . strtoupper(Str::random(6));
    }

    /**
     * Normalisasi nomor WA ke format 628... / 08... yang rapi.
     */
    public function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', trim($phone)) ?? '';
        if (str_starts_with($digits, '0')) {
            return '62' . substr($digits, 1);
        }
        if (str_starts_with($digits, '8')) {
            return '62' . $digits;
        }

        return $digits;
    }

    /**
     * Buat order pembelian voucher self-service dengan QRIS Dinamis kode unik.
     */
    public function createOrder(
        HotspotVoucherPackage $package,
        string $phone,
        ?string $customerName = null,
        ?string $loginUrl = null
    ): HotspotVoucherOrder {
        $baseAmount = (int) round((float) $package->price);
        $uniqueCode = $this->dynamicQrisService->generateUniqueCode($baseAmount);
        $expectedAmount = $baseAmount + $uniqueCode;

        $staticPayload = $this->dynamicQrisService->getStaticPayload();
        $dynamicPayload = $this->dynamicQrisService->convertStaticToDynamic($staticPayload, $expectedAmount);

        $expHours = (int) SiteSetting::get(DynamicQrisService::SETTING_EXPIRATION_HOURS, 3);
        $expiredAt = now()->addHours(max(1, min(24, $expHours)));

        $orderCode = 'VCH-' . now('Asia/Jakarta')->format('Ymd') . '-' . strtoupper(Str::random(5));

        return HotspotVoucherOrder::create([
            'order_code' => $orderCode,
            'package_id' => $package->id,
            'customer_phone' => $this->normalizePhone($phone),
            'customer_name' => $customerName ? trim($customerName) : null,
            'base_amount' => $baseAmount,
            'qris_unique_code' => $uniqueCode,
            'qris_expected_amount' => $expectedAmount,
            'qris_dynamic_payload' => $dynamicPayload,
            'qris_expired_at' => $expiredAt,
            'status' => HotspotVoucherOrder::STATUS_PENDING,
            'voucher_status' => HotspotVoucherOrder::VOUCHER_PENDING,
            'login_url' => $loginUrl ? trim($loginUrl) : null,
        ]);
    }

    /**
     * Generate voucher manual oleh Admin (langsung lunas, buat user MikroTik, opsional kirim WA).
     */
    public function createManualVoucher(
        HotspotVoucherPackage $package,
        string $phone = '',
        ?string $customerName = null,
        string $actorName = 'Admin'
    ): array {
        $baseAmount = (int) round((float) $package->price);
        $orderCode = 'VCHM-' . now('Asia/Jakarta')->format('Ymd') . '-' . strtoupper(Str::random(5));

        $order = HotspotVoucherOrder::create([
            'order_code' => $orderCode,
            'package_id' => $package->id,
            'customer_phone' => $phone !== '' ? $this->normalizePhone($phone) : '-',
            'customer_name' => $customerName ? trim($customerName) : null,
            'base_amount' => $baseAmount,
            'qris_unique_code' => 0,
            'qris_expected_amount' => $baseAmount,
            'status' => HotspotVoucherOrder::STATUS_PENDING,
            'voucher_status' => HotspotVoucherOrder::VOUCHER_PENDING,
            'meta' => [
                'manual_generated_by' => $actorName,
            ],
        ]);

        return $this->settleOrder($order, $baseAmount, [
            'sender' => $customerName ?: $actorName,
            'reference_code' => $orderCode,
        ], "Manual-Admin ({$actorName})", false);
    }

    /**
     * Lunaskan order voucher, buat akun di MikroTik, catat Mutasi Kas & Rekonsiliasi QRIS, dan kirim WA.
     */
    public function settleOrder(
        HotspotVoucherOrder $order,
        float $paidAmount,
        array $parsed = [],
        string $deviceName = 'Webhook',
        bool $isQrisWebhook = true
    ): array {
        $order->loadMissing('package');
        $package = $order->package;

        if ($order->status === HotspotVoucherOrder::STATUS_PAID && $order->voucher_code) {
            return [
                'already_paid' => true,
                'order' => $order,
                'voucher_code' => $order->voucher_code,
                'mikrotik_synced' => $order->mikrotik_synced_at !== null,
                'whatsapp_sent' => $order->whatsapp_sent_at !== null,
            ];
        }

        $now = now();
        $voucherCode = $order->voucher_code ?: $this->generateVoucherCode(6);
        $refCode = trim((string) ($parsed['reference_code'] ?? '')) ?: ('VCH-' . $now->format('YmdHis'));
        $senderName = trim((string) ($parsed['sender'] ?? '')) ?: ($order->customer_name ?: 'Pembeli Voucher');

        $order->status = HotspotVoucherOrder::STATUS_PAID;
        $order->paid_at = $now;
        $order->voucher_code = $voucherCode;
        $order->voucher_status = HotspotVoucherOrder::VOUCHER_UNUSED;
        $order->qris_sender = $senderName;
        $order->qris_transaction_number = $refCode;
        $order->save();

        // 1. Sync user voucher ke MikroTik
        $mikrotikSync = $this->syncOrderToMikroTik($order);

        // 2. Catat pemasukan ke Buku Kas (Mutasi) & Rekonsiliasi QRIS Harian
        $this->recordLedgerIncome($order, $paidAmount, $deviceName, $isQrisWebhook);

        // 3. Kirim kode voucher via WhatsApp ke pelanggan
        $waSent = $this->sendVoucherWhatsApp($order);

        return [
            'already_paid' => false,
            'order' => $order->fresh('package'),
            'voucher_code' => $voucherCode,
            'mikrotik_synced' => $mikrotikSync['success'],
            'mikrotik_error' => $mikrotikSync['error'] ?? null,
            'whatsapp_sent' => $waSent,
        ];
    }

    /**
     * Sinkronisasi User Profile & User Voucher ke MikroTik.
     */
    public function syncOrderToMikroTik(HotspotVoucherOrder $order): array
    {
        $order->loadMissing('package');
        $package = $order->package;
        if (!$package || !$order->voucher_code) {
            return ['success' => false, 'error' => 'Paket atau kode voucher belum tersedia.'];
        }

        $profileName = trim((string) ($package->mikrotik_profile_name ?: ('vch-' . $package->code)));
        $server = trim((string) ($package->hotspot_server ?: 'hotspot1'));

        try {
            $mikrotik = $this->mikroTikService ?? app(MikroTikService::class);
            $mikrotik->syncHotspotUserProfile(
                $profileName,
                (int) $package->max_devices,
                $package->rate_limit,
                (int) $package->duration_minutes
            );

            $mikrotik->createHotspotUser(
                $order->voucher_code,
                $profileName,
                (int) $package->duration_minutes,
                $server,
                "Order {$order->order_code} | WA {$order->customer_phone}"
            );

            $order->mikrotik_synced_at = now();
            $meta = is_array($order->meta) ? $order->meta : [];
            unset($meta['mikrotik_error']);
            $order->meta = $meta;
            $order->save();

            return ['success' => true, 'profile' => $profileName];
        } catch (\Throwable $e) {
            Log::warning('HotspotVoucherService: MikroTik sync warning', [
                'order_code' => $order->order_code,
                'voucher_code' => $order->voucher_code,
                'error' => $e->getMessage(),
            ]);

            $meta = is_array($order->meta) ? $order->meta : [];
            $meta['mikrotik_error'] = $e->getMessage();
            $order->meta = $meta;
            $order->save();

            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Sinkronisasi paket ke User Profile MikroTik saat Admin simpan paket.
     */
    public function syncPackageProfileToMikroTik(HotspotVoucherPackage $package): array
    {
        $profileName = trim((string) ($package->mikrotik_profile_name ?: ('vch-' . $package->code)));
        try {
            $mikrotik = $this->mikroTikService ?? app(MikroTikService::class);
            $res = $mikrotik->syncHotspotUserProfile(
                $profileName,
                (int) $package->max_devices,
                $package->rate_limit,
                (int) $package->duration_minutes
            );

            return ['success' => true, 'profile' => $profileName, 'result' => $res];
        } catch (\Throwable $e) {
            Log::warning('HotspotVoucherService: syncPackageProfileToMikroTik warning', [
                'package_id' => $package->id,
                'error' => $e->getMessage(),
            ]);

            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Catat pemasukan voucher ke financial_transactions agar masuk Mutasi & Rekonsiliasi QRIS Harian.
     */
    protected function recordLedgerIncome(
        HotspotVoucherOrder $order,
        float $paidAmount,
        string $deviceName,
        bool $isQrisWebhook
    ): void {
        if (!Schema::hasTable('financial_transactions')) {
            return;
        }

        try {
            $defaultFinanceId = $this->paymentReceiverService->defaultCompanyFinanceReceiverId();
            $packageName = $order->package?->name ?: 'Voucher Hotspot';
            $baseAmount = (float) $order->base_amount;
            $uniqueCode = (int) ($order->qris_unique_code ?? 0);

            FinancialTransaction::updateOrCreate(
                [
                    'source' => 'hotspot_voucher',
                    'reference_type' => HotspotVoucherOrder::class,
                    'reference_id' => $order->id,
                ],
                [
                    'type' => 'income',
                    'category' => 'hotspot_voucher',
                    'description' => "Penjualan Voucher Hotspot {$packageName} ({$order->voucher_code})",
                    'amount' => $baseAmount,
                    'transaction_date' => now('Asia/Jakarta')->toDateString(),
                    'created_by' => $defaultFinanceId,
                    'updated_by' => $defaultFinanceId,
                    'status' => FinancialTransaction::STATUS_CONFIRMED,
                    'meta' => [
                        'order_code' => $order->order_code,
                        'voucher_code' => $order->voucher_code,
                        'package_name' => $packageName,
                        'customer_phone' => $order->customer_phone,
                        'received_via_name' => ($isQrisWebhook || (float) $order->qris_expected_amount > 0)
                            ? 'QRIS Voucher Hotspot'
                            : 'Kas Tunai / Manual Voucher',
                        'confirmation_method' => $isQrisWebhook ? 'unique_code' : 'manual',
                        'settled_via' => $isQrisWebhook ? 'qris_webhook' : 'manual_admin',
                        'qris_unique_code' => $uniqueCode,
                        'qris_expected_amount' => (float) ($order->qris_expected_amount ?: $paidAmount),
                        'qris_settled_amount' => (float) $paidAmount,
                        'qris_webhook_device' => $deviceName,
                        'qris_transaction_number' => $order->qris_transaction_number,
                    ],
                ]
            );
        } catch (\Throwable $e) {
            Log::error('HotspotVoucherService: recordLedgerIncome error: ' . $e->getMessage());
        }
    }

    /**
     * Kirim kode voucher ke nomor WhatsApp pelanggan.
     */
    public function sendVoucherWhatsApp(HotspotVoucherOrder $order): bool
    {
        $phone = trim((string) $order->customer_phone);
        if ($phone === '' || $phone === '-') {
            return false;
        }

        $order->loadMissing('package');
        $package = $order->package;
        $packageName = $package?->name ?: 'Voucher Hotspot';
        $durationLabel = $package?->duration_label ?: '-';
        $maxDevices = (int) ($package?->max_devices ?: 1);
        $rateText = $package?->rate_limit ? "\n• Kecepatan: {$package->rate_limit}" : '';
        $loginLink = $order->login_url ?: 'http://rumahkita.id/login';

        $message = "✅ *PEMBAYARAN VOUCHER HOTSPOT BERHASIL*\n\n"
            . "Terima kasih telah membeli voucher WiFi *RUMAH KITA NETWORK POWERED BY PT. Megarap Mitra Solusi (MMS)*.\n\n"
            . "🎟️ *KODE VOUCHER ANDA:*\n"
            . "*{$order->voucher_code}*\n\n"
            . "📋 *Detail Paket:*\n"
            . "• Paket: {$packageName}\n"
            . "• Masa Aktif: {$durationLabel} (dihitung sejak login pertama)\n"
            . "• Maksimal Perangkat: {$maxDevices} perangkat{$rateText}\n"
            . "• No. Order: {$order->order_code}\n\n"
            . "📶 *Cara Menggunakan:*\n"
            . "1. Hubungkan HP ke WiFi Hotspot Rumah Kita Network\n"
            . "2. Buka halaman login ({$loginLink})\n"
            . "3. Masukkan kode voucher *{$order->voucher_code}* pada kolom voucher lalu klik Login.\n\n"
            . "Selamat berselancar! 🚀\n"
            . "_RUMAH KITA NETWORK POWERED BY PT. Megarap Mitra Solusi (MMS)_";

        try {
            $response = app(WhatsAppGatewayService::class)->sendBulk([[
                'phone' => $phone,
                'name' => $order->customer_name ?: 'Pelanggan Hotspot',
            ]], $message, 0, 25);

            $json = $response->json();
            $success = (bool) ($json['success'] ?? false);

            if ($success) {
                $order->whatsapp_sent_at = now();
                $order->save();
            }

            if (Schema::hasTable('notification_logs')) {
                NotificationLog::create([
                    'customer_id' => null,
                    'phone' => $phone,
                    'message' => $message,
                    'notice_id' => null,
                    'status' => $success ? 'sent' : 'failed',
                ]);
            }

            return $success;
        } catch (\Throwable $e) {
            Log::warning('HotspotVoucherService: sendVoucherWhatsApp warning: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Format response payload status order untuk halaman publik.
     */
    public function presentPublicOrder(HotspotVoucherOrder $order): array
    {
        $order->loadMissing('package');

        return [
            'order_code' => $order->order_code,
            'status' => $order->status,
            'is_paid' => $order->status === HotspotVoucherOrder::STATUS_PAID,
            'customer_phone' => $order->customer_phone,
            'customer_name' => $order->customer_name,
            'base_amount' => (float) $order->base_amount,
            'unique_code' => (int) ($order->qris_unique_code ?? 0),
            'expected_amount' => (float) ($order->qris_expected_amount ?: $order->base_amount),
            'expired_at' => $order->qris_expired_at?->toIso8601String(),
            'paid_at' => $order->paid_at?->toIso8601String(),
            'qr_data_uri' => $order->qris_dynamic_payload
                ? $this->dynamicQrisService->renderQrDataUri($order->qris_dynamic_payload)
                : '',
            'voucher_code' => $order->status === HotspotVoucherOrder::STATUS_PAID ? $order->voucher_code : null,
            'voucher_status' => $order->voucher_status,
            'whatsapp_sent' => $order->whatsapp_sent_at !== null,
            'mikrotik_synced' => $order->mikrotik_synced_at !== null,
            'login_url' => $order->login_url ?: 'http://rumahkita.id/login',
            'package' => $order->package ? [
                'id' => $order->package->id,
                'name' => $order->package->name,
                'price' => (float) $order->package->price,
                'duration_minutes' => (int) $order->package->duration_minutes,
                'duration_label' => $order->package->duration_label,
                'max_devices' => (int) $order->package->max_devices,
                'rate_limit' => $order->package->rate_limit,
            ] : null,
        ];
    }
}

<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\PaymentReceiptOption;
use App\Models\QrisWebhookLog;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class QrisWebhookService
{
    public function __construct(
        protected PaymentReceiverService $paymentReceiverService,
        protected FinancialLedgerService $financialLedgerService,
        protected BillingMessageTemplateService $billingMessageTemplateService
    ) {}

    /**
     * Verifikasi secret key webhook.
     */
    public function validateSecret(?string $providedSecret): bool
    {
        $configured = SiteSetting::get(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'rknet-secret-qris-key');
        
        // Jika diset kosong, bypass otentikasi
        if (empty($configured)) {
            return true;
        }

        return hash_equals((string) $configured, (string) ($providedSecret ?? ''));
    }

    /**
     * Ekstrak nominal uang, nama pengirim, dan nomor referensi dari teks notifikasi push Android (GoBiz, dll).
     */
    public function parseNotificationText(string $text, ?string $title = null): array
    {
        $combined = trim(($title ? $title . ' ' : '') . $text);

        // 1. Ekstrak Nominal Rupiah
        // Contoh pattern: "Rp 150.124", "Rp. 150.124", "IDR 150124", "sebesar 150.124", "Rp 150.000,00"
        $amount = null;
        $matchedNominal = null;

        if (preg_match('/(?:Rp|IDR)?\.?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+)/i', $combined, $matches)) {
            $rawNumber = $matches[1];
            // Format Indonesia: titik pemisah ribuan, koma pemisah desimal
            $cleaned = str_replace('.', '', $rawNumber);
            $cleaned = str_replace(',', '.', $cleaned);
            $val = (float) $cleaned;
            if ($val >= 1000) { // minimal Rp 1.000 untuk tagihan internet
                $amount = (int) round($val);
                $matchedNominal = $rawNumber;
            }
        }

        // Fallback jika belum ketemu (misal ada tulisan "sebesar 150124")
        if (!$amount && preg_match('/(?:sebesar|nominal|total|masuk|berhasil)\s*(?:Rp|IDR)?\.?\s*([0-9\.\,]+)/i', $combined, $matches)) {
            $rawNumber = $matches[1];
            $cleaned = str_replace('.', '', $rawNumber);
            $cleaned = str_replace(',', '.', $cleaned);
            $val = (float) $cleaned;
            if ($val >= 1000) {
                $amount = (int) round($val);
                $matchedNominal = $rawNumber;
            }
        }

        // 2. Ekstrak Nama Pengirim jika ada (contoh: "...dari BUDI SANTOSO", "dari SITI via GoPay")
        $sender = null;
        if (preg_match('/(?:dari|from)\s+([A-Za-z0-9\s\.\'\-]+?)(?:\.|\s+(?:via|pada|sebesar|berhasil|dengan|di|ref|id)|$)/i', $combined, $matches)) {
            $cleanSender = trim($matches[1], " \t\n\r\0\x0B.");
            if (strlen($cleanSender) > 2 && !preg_match('/^(?:qris|gobiz|gopay|bca|dana|bank)$/i', $cleanSender)) {
                $sender = $cleanSender;
            }
        }

        // 3. Ekstrak Nomor Referensi / ID Transaksi jika ada (contoh: "Ref: 93848826679", "ID: TRX12345")
        $referenceCode = null;
        if (preg_match('/(?:ref|transaksi|order|id)\s*[:#]?\s*([A-Za-z0-9]{6,})/i', $combined, $matches)) {
            $referenceCode = trim($matches[1]);
        }

        return [
            'amount' => $amount,
            'matched_nominal_str' => $matchedNominal,
            'sender' => $sender,
            'reference_code' => $referenceCode,
            'combined_text' => $combined,
        ];
    }

    /**
     * Memproses payload webhook dari notifikasi perangkat Android.
     * Dilengkapi Deduplikasi Otomatis (Idempotency) dan Atomic Lock untuk Multi-Device.
     */
    public function processWebhook(array $payload, ?string $providedSecret = null): array
    {
        // 1. Validasi Secret
        if (!$this->validateSecret($providedSecret)) {
            return [
                'success' => false,
                'status' => 'unauthorized',
                'http_code' => 401,
                'message' => 'Secret token tidak valid atau tidak sesuai.',
            ];
        }

        $rawText = trim((string) ($payload['text'] ?? $payload['body'] ?? $payload['message'] ?? ''));
        $rawTitle = trim((string) ($payload['title'] ?? ''));
        $deviceName = trim((string) ($payload['device_name'] ?? $payload['device'] ?? 'Android-Device'));

        if ($rawText === '' && $rawTitle === '') {
            return [
                'success' => false,
                'status' => 'empty_payload',
                'http_code' => 422,
                'message' => 'Teks notifikasi kosong.',
            ];
        }

        // 2. Parsing teks
        $parsed = $this->parseNotificationText($rawText, $rawTitle);
        $amount = $parsed['amount'];

        if (!$amount) {
            QrisWebhookLog::create([
                'device_name' => $deviceName,
                'raw_title' => $rawTitle ?: null,
                'raw_text' => $rawText ?: null,
                'extracted_amount' => null,
                'status' => 'invalid_payload',
                'meta' => [
                    'reason' => 'Nominal transaksi tidak dapat diekstrak dari teks notifikasi.',
                    'parsed' => $parsed,
                ],
            ]);

            return [
                'success' => false,
                'status' => 'invalid_payload',
                'http_code' => 422,
                'message' => 'Tidak dapat menemukan nominal transaksi dari notifikasi yang dikirimkan.',
            ];
        }

        // 3. Multi-Device Deduplication & Concurrency Lock
        // Mencegah duplikasi jika 2 HP admin menangkap notifikasi GoBiz yang sama
        $lockKey = "qris_settle_lock_{$amount}";
        $lock = Cache::lock($lockKey, 15);

        return $lock->get(function () use ($amount, $parsed, $deviceName, $rawTitle, $rawText) {
            // A. Cek apakah ada invoice yang cocok dengan nominal unik QRIS ini
            $invoice = Invoice::query()
                ->where('status', '!=', 'paid')
                ->where(function ($q) use ($amount) {
                    $q->where('qris_expected_amount', $amount)
                      ->orWhere('amount', $amount);
                })
                ->latest('updated_at')
                ->first();

            // B. Jika tidak ada invoice pending, cek apakah invoice ini SUDAH dibayar dalam 3 jam terakhir
            // (Kasus Multi-HP: HP 2 mengirim webhook beberapa detik setelah HP 1)
            if (!$invoice) {
                $recentlyPaid = Invoice::query()
                    ->where('status', 'paid')
                    ->where(function ($q) use ($amount) {
                        $q->where('qris_expected_amount', $amount)
                          ->orWhere('amount', $amount);
                    })
                    ->where('paid_at', '>=', now()->subHours(3))
                    ->latest('paid_at')
                    ->first();

                if ($recentlyPaid) {
                    // Catat ke log sebagai duplicate_ignored (berhasil diterima, tapi abaikan duplikasi)
                    QrisWebhookLog::create([
                        'device_name' => $deviceName,
                        'raw_title' => $rawTitle ?: null,
                        'raw_text' => $rawText ?: null,
                        'extracted_amount' => $amount,
                        'status' => 'duplicate_ignored',
                        'invoice_id' => $recentlyPaid->id,
                        'meta' => [
                            'reason' => 'Transaksi sudah diselesaikan sebelumnya oleh perangkat lain.',
                            'original_settled_at' => $recentlyPaid->paid_at?->toIso8601String(),
                        ],
                    ]);

                    return [
                        'success' => true,
                        'status' => 'duplicate_ignored',
                        'http_code' => 200,
                        'message' => 'Notifikasi duplikat diterima dan diabaikan dengan aman (invoice sudah berstatus lunas).',
                        'invoice_id' => $recentlyPaid->id,
                        'amount' => $amount,
                    ];
                }

                // C. Jika benar-benar tidak ditemukan tagihan
                QrisWebhookLog::create([
                    'device_name' => $deviceName,
                    'raw_title' => $rawTitle ?: null,
                    'raw_text' => $rawText ?: null,
                    'extracted_amount' => $amount,
                    'status' => 'unmatched',
                    'meta' => [
                        'reason' => 'Tidak ditemukan tagihan pending dengan nominal pas ini.',
                        'parsed' => $parsed,
                    ],
                ]);

                return [
                    'success' => false,
                    'status' => 'unmatched',
                    'http_code' => 404,
                    'message' => "Tagihan dengan nominal Rp " . number_format($amount, 0, ',', '.') . " tidak ditemukan atau sudah kadaluarsa.",
                    'amount' => $amount,
                ];
            }

            // D. Eksekusi Pelunasan Otomatis (Auto-Settlement)
            $settleResult = $this->settleInvoice($invoice, $amount, $parsed, $deviceName);

            // E. Simpan Log Sukses
            QrisWebhookLog::create([
                'device_name' => $deviceName,
                'raw_title' => $rawTitle ?: null,
                'raw_text' => $rawText ?: null,
                'extracted_amount' => $amount,
                'status' => 'settled',
                'invoice_id' => $invoice->id,
                'meta' => [
                    'settle_result' => $settleResult,
                    'parsed' => $parsed,
                ],
            ]);

            return [
                'success' => true,
                'status' => 'settled',
                'http_code' => 200,
                'message' => "Pembayaran tagihan {$invoice->invoice_link} sebesar Rp " . number_format($amount, 0, ',', '.') . " berhasil dikonfirmasi lunas otomatis.",
                'invoice_id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
                'amount' => $amount,
                'customer_name' => $invoice->customer?->name,
                'isolation_restored' => $settleResult['isolation_restored'] ?? false,
            ];
        }) ?? [
            'success' => false,
            'status' => 'locked',
            'http_code' => 429,
            'message' => 'Transaksi sedang diproses bersamaan oleh sistem. Silakan coba sesaat lagi.',
        ];
    }

    /**
     * Eksekusi konfirmasi lunas, buka isolir MikroTik, update keuangan, dan kirim kuitansi WhatsApp.
     */
    protected function settleInvoice(Invoice $invoice, int|float $amount, array $parsed, string $deviceName): array
    {
        $now = now();
        $senderName = $parsed['sender'] ?: ($invoice->customer?->name ?? 'GoPay QRIS');
        $refCode = $parsed['reference_code'] ?: ('QG-' . $now->format('YmdHis') . '-' . substr(md5(uniqid()), 0, 4));

        $defaultFinanceId = $this->paymentReceiverService->defaultCompanyFinanceReceiverId();

        // 1. Update data invoice
        $invoice->status = 'paid';
        $invoice->paid_at = $now;
        $invoice->tolak_info = null;
        $invoice->qris_payment_time = $now;
        $invoice->qris_sender = $senderName;
        $invoice->qris_transaction_number = $refCode;
        if (Schema::hasColumn('invoices', 'include_in_mutation')) {
            $invoice->include_in_mutation = true;
        }
        if (Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
            $invoice->payment_receiver_user_id = $defaultFinanceId;
        }

        // Hubungkan ke opsi penerimaan QRIS jika ada
        if (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id') && Schema::hasTable('payment_receipt_options')) {
            $qrisOption = PaymentReceiptOption::query()
                ->where('is_active', true)
                ->where('name', 'like', '%qris%')
                ->first();
            if ($qrisOption) {
                $invoice->received_via_payment_receipt_option_id = $qrisOption->id;
            }
        }

        $invoice->save();

        // 2. Pulihkan Layanan & Cabut Isolir jika pelanggan terisolir
        $customer = $invoice->customer;
        $isolationRestored = false;

        if ($customer) {
            $wasIsolated = (bool) ($customer->is_service_isolated ?? false);

            // Perpanjang Jatuh Tempo (+30 Hari)
            if ($wasIsolated) {
                $customer->due_date = $now->copy()->startOfDay()->addDays(30)->toDateString();
            } elseif (!empty($customer->due_date)) {
                $customer->due_date = Carbon::parse($customer->due_date)->startOfDay()->addDays(30)->toDateString();
            } else {
                $customer->due_date = $now->copy()->startOfDay()->addDays(30)->toDateString();
            }

            // Cabut status isolir pada database
            $customer->is_service_isolated = false;
            $customer->service_isolated_at = null;
            $customer->service_isolated_by = null;
            $customer->isolation_restore_profile = null;
            $customer->save();

            // Reset usage snapshot jika modul aktif
            if (class_exists(\App\Services\CustomerUsageSnapshotService::class)) {
                try {
                    app(\App\Services\CustomerUsageSnapshotService::class)->resetPeriodByCustomerId((int) $customer->id);
                } catch (\Throwable $snapEx) {
                    Log::warning('DynamicQris settle: snapshot reset warning: ' . $snapEx->getMessage());
                }
            }

            // Buka isolir di MikroTik (kembalikan profil asli pelanggan)
            if ($customer->pppoe_username) {
                try {
                    $mikrotik = app(\App\Services\MikroTikService::class);
                    $package = $customer->package;
                    $targetProfile = $customer->mikrotik_profile ?: ($package?->mikrotik_profile ?: $package?->name ?: 'default');
                    $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                    $isolationRestored = true;
                } catch (\Throwable $mikEx) {
                    Log::warning('DynamicQris settle: MikroTik unrestrict warning: ' . $mikEx->getMessage(), [
                        'customer_id' => $customer->id,
                        'username' => $customer->pppoe_username,
                    ]);
                }
            }
        }

        // 3. Sinkronisasi Buku Kas / Mutasi Keuangan
        try {
            $this->financialLedgerService->syncInvoicePayment($invoice->fresh(), $defaultFinanceId);
        } catch (\Throwable $ledgerEx) {
            Log::error('DynamicQris settle: FinancialLedgerService error: ' . $ledgerEx->getMessage());
        }

        // 4. Kirim Kuitansi / Bukti Bayar WhatsApp ke Pelanggan
        $waSent = false;
        if ($customer && !empty($customer->phone)) {
            $waSent = $this->sendPaymentConfirmationWhatsApp($customer, $invoice, $amount, $refCode);
        }

        return [
            'invoice_id' => $invoice->id,
            'amount' => $amount,
            'ref_code' => $refCode,
            'isolation_restored' => $isolationRestored,
            'whatsapp_sent' => $waSent,
            'settled_at' => $now->toIso8601String(),
        ];
    }

    /**
     * Kirim notifikasi WhatsApp resmi terima pembayaran via WA Gateway.
     */
    protected function sendPaymentConfirmationWhatsApp(Customer $customer, Invoice $invoice, int|float $amount, string $refCode): bool
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '') {
            return false;
        }

        $activeUntil = '-';
        if (!empty($customer->due_date)) {
            try {
                $activeUntil = Carbon::parse((string) $customer->due_date)->format('d/m/Y');
            } catch (\Throwable) {
                $activeUntil = '-';
            }
        }

        $message = "🎉 *PEMBAYARAN DITERIMA & LUNAS* 🎉\n\n" .
            "Halo kak *{$customer->name}*,\n" .
            "Terima kasih, pembayaran tagihan internet Anda via *QRIS Dinamis* telah berhasil diverifikasi otomatis oleh sistem.\n\n" .
            "📄 *No. Invoice:* {$invoice->invoice_link}\n" .
            "💰 *Nominal Dibayar:* Rp " . number_format($amount, 0, ',', '.') . "\n" .
            "📦 *Paket:* " . ($customer->package_type ?: '-') . "\n" .
            "📅 *Masa Aktif s/d:* {$activeUntil}\n" .
            "🔖 *No. Ref:* {$refCode}\n\n" .
            "Layanan internet Anda tetap aktif optimal. Terima kasih telah setia bersama Rumah Kita Network!";

        $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');

        try {
            $response = Http::timeout(25)->post($gatewayUrl . '/send-bulk', [
                'recipients' => [[
                    'phone' => $phone,
                    'name' => (string) ($customer->name ?? 'Pelanggan'),
                ]],
                'message' => $message,
                'delay' => 0,
            ]);

            $json = $response->json();
            $success = (bool) ($json['success'] ?? false);

            NotificationLog::create([
                'customer_id' => $customer->id,
                'phone' => $phone,
                'message' => $message,
                'notice_id' => null,
                'status' => $success ? 'sent' : 'failed',
            ]);

            return $success;
        } catch (\Throwable $e) {
            Log::warning('DynamicQris sendPaymentConfirmationWhatsApp warning: ' . $e->getMessage());
            return false;
        }
    }
}

<?php

namespace App\Services;

use App\Models\BillingPaymentCapture;
use App\Models\BillingPaymentMatchReview;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\PaymentReceiptOption;
use App\Models\QrisWebhookLog;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class QrisWebhookService
{
    public function __construct(
        protected PaymentReceiverService $paymentReceiverService,
        protected FinancialLedgerService $financialLedgerService,
        protected BillingMessageTemplateService $billingMessageTemplateService,
        protected ?CustomerIsolationService $customerIsolationService = null,
        protected ?PaymentVerificationConfigService $paymentVerificationConfigService = null,
        protected ?PaymentCaptureNotificationService $paymentCaptureNotificationService = null
    ) {
        $this->customerIsolationService = $customerIsolationService ?? app(CustomerIsolationService::class);
        $this->paymentVerificationConfigService = $paymentVerificationConfigService ?? app(PaymentVerificationConfigService::class);
        $this->paymentCaptureNotificationService = $paymentCaptureNotificationService ?? app(PaymentCaptureNotificationService::class);
    }

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
        $amount = null;
        $matchedNominal = null;
        $distinctCurrencyAmounts = [];

        // 0. Deteksi notifikasi non-transaksi masuk / gagal / pencairan / refund / rekap
        $isNonIncomingEvent = (bool) preg_match(
            '/\b(pencairan|settlement|cair|disbursement|withdraw|penarikan|refund|pengembalian|gagal|failed|ditolak|rejected|dibatalkan|cancelled|canceled|batal|kadaluarsa|expired|pending|menunggu|total\s+harian|rekap|rincian)\b/i',
            $combined
        );
        $hasNegativeSign = (bool) preg_match('/(?:^|\s)-\s*(?:Rp|IDR)\.?\s*[0-9]{1,3}|(?:Rp|IDR)\.?\s*-\s*[0-9]{1,3}/i', $combined);

        // 1. Ekstrak Nominal Rupiah
        // Prioritas 1: Format tegas dengan prefix mata uang Rp / IDR (mencegah salah tangkap digit angka '1 transaksi', tanggal, jam, dll)
        if (preg_match_all('/(?:Rp|IDR)\.?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,})/i', $combined, $currencyMatches)) {
            foreach ($currencyMatches[1] as $rawNumber) {
                $val = $this->parseIndonesianNumber($rawNumber);
                if ($val >= 1000) {
                    $intVal = (int) round($val);
                    $distinctCurrencyAmounts[$intVal] = true;
                    if ($amount === null) {
                        $amount = $intVal;
                        $matchedNominal = $rawNumber;
                    }
                }
            }
        }

        // Prioritas 2: Format dengan kata kunci transaksi (sebesar, diterima, masuk, berhasil, nominal, total, pembayaran)
        if ($amount === null && preg_match('/(?:sebesar|nominal|total|masuk|berhasil|diterima|terima|bayar|pembayaran)\s*(?:sebesar)?\s*(?:Rp|IDR)?\.?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,})/i', $combined, $matches)) {
            $rawNumber = $matches[1];
            $val = $this->parseIndonesianNumber($rawNumber);
            if ($val >= 1000) {
                $amount = (int) round($val);
                $matchedNominal = $rawNumber;
            }
        }

        // Prioritas 3: Fallback scan seluruh kumpulan angka yang valid >= 1000 (menghindari angka kecil di depan seperti '1 transaksi')
        if ($amount === null && preg_match_all('/(?:Rp|IDR)?\.?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+)/i', $combined, $allMatches)) {
            foreach ($allMatches[1] as $candidate) {
                $val = $this->parseIndonesianNumber($candidate);
                if ($val >= 1000) {
                    $amount = (int) round($val);
                    $matchedNominal = $candidate;
                    break;
                }
            }
        }

        $distinctAmounts = array_keys($distinctCurrencyAmounts);
        $hasMultipleAmounts = count($distinctAmounts) > 1;

        // 2. Ekstrak Nama Pengirim jika ada (contoh: "...dari BUDI SANTOSO", "sumber dana RODIAH", "pengirim M. ABDUL ROHMAN")
        $sender = null;
        if (preg_match_all('/\b(?:dari|from|sumber\s*dana|pengirim|atas\s*nama|a\.n\.?)\s*[:#]?\s+([A-Za-z0-9\s\.\'\-]+?)(?=\.\s*(?:$|ref\b|transaksi\b|order\b|id\b)|\s+(?:via|pada|sebesar|berhasil|dengan|di|ref|id)\b|$)/i', $combined, $senderMatches, PREG_SET_ORDER)) {
            foreach ($senderMatches as $senderMatch) {
                $cleanSender = trim($senderMatch[1], " \t\n\r\0\x0B.");
                if (strlen($cleanSender) > 2 && !preg_match('/^(?:qris|gobiz|gopay|bca|bni|bri|mandiri|dana|ovo|shopeepay|bank)$/i', $cleanSender)) {
                    $sender = $cleanSender;
                    break;
                }
            }
        }

        // 3. Ekstrak Nomor Referensi / ID Transaksi jika ada (contoh: "Ref: 93848826679", "ID: TRX12345")
        $referenceCode = null;
        if (preg_match('/(?:ref|transaksi|order|id)\s*[:#]?\s*([A-Za-z0-9\-]{6,})/i', $combined, $matches)) {
            $referenceCode = trim($matches[1]);
        }

        return [
            'amount' => $amount,
            'matched_nominal_str' => $matchedNominal,
            'sender' => $sender,
            'reference_code' => $referenceCode,
            'combined_text' => $combined,
            'distinct_amounts' => $distinctAmounts,
            'has_multiple_amounts' => $hasMultipleAmounts,
            'is_non_incoming_event' => $isNonIncomingEvent || $hasNegativeSign,
            'is_suspicious' => $hasMultipleAmounts || $isNonIncomingEvent || $hasNegativeSign,
        ];
    }

    protected function parseIndonesianNumber(string $rawNumber): float
    {
        $cleaned = str_replace('.', '', $rawNumber);
        $cleaned = str_replace(',', '.', $cleaned);

        return (float) $cleaned;
    }

    /**
     * Memproses payload webhook dari notifikasi perangkat Android.
     * Dilengkapi Deduplikasi Otomatis, Pengecualian Admin, dan Penahanan Konfirmasi Manual jika ambigu/mencurigakan.
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

        if (!empty($parsed['is_non_incoming_event'])) {
            $this->safeLog([
                'device_name' => $deviceName,
                'raw_title' => $rawTitle ?: null,
                'raw_text' => $rawText ?: null,
                'extracted_amount' => (float) ($amount ?? 0),
                'status' => 'ignored_non_payment',
                'meta' => [
                    'reason' => 'Notifikasi terdeteksi sebagai pencairan, pembatalan, gagal, pending, atau bukan uang masuk.',
                    'parsed' => $parsed,
                ],
            ]);

            return [
                'success' => true,
                'status' => 'ignored_non_payment',
                'http_code' => 200,
                'message' => 'Notifikasi diabaikan karena bukan pembayaran masuk yang berhasil.',
                'amount' => $amount ?? 0,
            ];
        }

        if (!$amount) {
            $this->safeLog([
                'device_name' => $deviceName,
                'raw_title' => $rawTitle ?: null,
                'raw_text' => $rawText ?: null,
                'extracted_amount' => 0,
                'status' => 'unmatched',
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

        // 3. Multi-Device Deduplication, Admin Exclusion Guard & Concurrency Lock
        $processExecution = function () use ($amount, $parsed, $deviceName, $rawTitle, $rawText) {
            $configService = $this->paymentVerificationConfigService ?? app(PaymentVerificationConfigService::class);
            $refCode = trim((string) ($parsed['reference_code'] ?? ''));

            // A. Cek duplikasi nomor referensi terhadap invoice yang SUDAH lunas
            if ($refCode !== '' && strlen($refCode) >= 6) {
                $paidByRef = Invoice::query()
                    ->where('status', 'paid')
                    ->whereRaw('LOWER(qris_transaction_number) = ?', [strtolower($refCode)])
                    ->latest('paid_at')
                    ->first();

                if ($paidByRef) {
                    $paidExpected = (float) ($paidByRef->qris_expected_amount ?: $paidByRef->amount);
                    $sameTransaction = abs($paidExpected - (float) $amount) <= 0.01
                        && $paidByRef->paid_at
                        && $paidByRef->paid_at->gte(now()->subHours(3));

                    if ($sameTransaction) {
                        $this->safeLog([
                            'device_name' => $deviceName,
                            'raw_title' => $rawTitle ?: null,
                            'raw_text' => $rawText ?: null,
                            'extracted_amount' => $amount,
                            'status' => 'duplicate_ignored',
                            'invoice_id' => $paidByRef->id,
                            'meta' => [
                                'reason' => 'Transaksi sudah diselesaikan sebelumnya oleh perangkat lain (Ref cocok).',
                                'original_settled_at' => $paidByRef->paid_at?->toIso8601String(),
                            ],
                        ]);

                        return [
                            'success' => true,
                            'status' => 'duplicate_ignored',
                            'http_code' => 200,
                            'message' => 'Notifikasi duplikat diterima dan diabaikan dengan aman (invoice sudah berstatus lunas).',
                            'invoice_id' => $paidByRef->id,
                            'amount' => $amount,
                        ];
                    }

                    // Reference reused on a different amount or outside deduplication window: hold for manual check
                    return $this->holdForManualReview(
                        $amount,
                        $parsed,
                        $deviceName,
                        $rawTitle,
                        $rawText,
                        collect(),
                        'duplicate_reference_code',
                        null,
                        'Nomor referensi transaksi sudah pernah digunakan pada invoice lain, ditahan untuk konfirmasi manual.'
                    );
                }
            }

            // B. Kumpulkan semua kandidat tagihan unpaid (bedakan kode unik QRIS vs nominal dasar polos)
            $uniqueQrisCandidates = Invoice::query()
                ->with('customer')
                ->where('status', '!=', 'paid')
                ->whereNotNull('qris_expected_amount')
                ->where('qris_expected_amount', $amount)
                ->orderByDesc('updated_at')
                ->get();

            $baseAmountCandidates = Invoice::query()
                ->with('customer')
                ->where('status', '!=', 'paid')
                ->where('amount', $amount)
                ->where(function ($q) use ($amount) {
                    $q->whereNull('qris_expected_amount')
                      ->orWhere('qris_expected_amount', '!=', $amount);
                })
                ->orderByDesc('updated_at')
                ->get();

            $allUnpaidCandidates = $uniqueQrisCandidates
                ->concat($baseAmountCandidates)
                ->unique('id')
                ->values();

            // C. Guard #1: Manipulasi teks notifikasi (terdeteksi lebih dari 1 nominal Rp/IDR berbeda)
            if (!empty($parsed['has_multiple_amounts'])) {
                return $this->holdForManualReview(
                    $amount,
                    $parsed,
                    $deviceName,
                    $rawTitle,
                    $rawText,
                    $allUnpaidCandidates,
                    'manipulated_or_ambiguous_notification',
                    null,
                    'Notifikasi memuat lebih dari satu nominal berbeda, ditahan untuk konfirmasi manual agar tidak terjadi miskonfirmasi.'
                );
            }

            // D. Guard #2: Pengirim / isi teks notifikasi termasuk daftar pengecualian admin (contoh: Adul / Abdrohman / M ABDUL ROHMAN)
            $excludedMatch = null;
            if (!empty($parsed['sender'])) {
                $excludedMatch = $configService->matchExcludedSender(null, null, $parsed['sender']);
            }
            if (!$excludedMatch) {
                $excludedMatch = $configService->matchExcludedSenderInText($parsed['combined_text']);
            }
            if ($excludedMatch) {
                return $this->holdForManualReview(
                    $amount,
                    $parsed,
                    $deviceName,
                    $rawTitle,
                    $rawText,
                    $allUnpaidCandidates,
                    'excluded_admin_payer',
                    [
                        'type' => 'excluded_sender',
                        'label' => (string) ($excludedMatch['name'] ?? 'Admin Dikecualikan'),
                        'entry' => $excludedMatch,
                    ],
                    'Pembayaran QRIS terdeteksi berasal dari admin yang dikecualikan (' . ($excludedMatch['name'] ?? 'Admin') . '), ditahan untuk konfirmasi manual.'
                );
            }

            // E. Guard #3: Pengirim termasuk staf/karyawan internal (User admin/teknisi/finance atau Payroll)
            $singleCandidateCustomer = $uniqueQrisCandidates->count() === 1
                ? $uniqueQrisCandidates->first()->customer
                : ($uniqueQrisCandidates->isEmpty() && $baseAmountCandidates->count() === 1
                    ? $baseAmountCandidates->first()->customer
                    : null);

            if (!empty($parsed['sender'])) {
                $staffMatch = $configService->matchInternalStaffIdentity(null, null, $parsed['sender'], $singleCandidateCustomer);
                if ($staffMatch) {
                    return $this->holdForManualReview(
                        $amount,
                        $parsed,
                        $deviceName,
                        $rawTitle,
                        $rawText,
                        $allUnpaidCandidates,
                        'admin_payer_needs_manual_review',
                        $staffMatch,
                        'Pembayaran QRIS terdeteksi atas nama admin/staf internal (' . ($staffMatch['label'] ?? $parsed['sender']) . '), wajib dikonfirmasi manual.'
                    );
                }
            }

            // F. Evaluasi kandidat kode unik QRIS dinamis
            if ($uniqueQrisCandidates->count() > 1) {
                return $this->holdForManualReview(
                    $amount,
                    $parsed,
                    $deviceName,
                    $rawTitle,
                    $rawText,
                    $uniqueQrisCandidates,
                    'ambiguous_qris_candidates',
                    null,
                    'Ditemukan lebih dari satu tagihan dengan nominal kode unik yang sama, ditahan untuk review manual.'
                );
            }

            if ($uniqueQrisCandidates->count() === 1) {
                $invoice = $uniqueQrisCandidates->first();

                if ((bool) ($invoice->customer?->billing_auto_disabled ?? false)) {
                    return $this->holdForManualReview(
                        $amount,
                        $parsed,
                        $deviceName,
                        $rawTitle,
                        $rawText,
                        $uniqueQrisCandidates,
                        'customer_billing_auto_disabled',
                        null,
                        'Auto-konfirmasi untuk pelanggan ini dinonaktifkan, pembayaran ditahan untuk konfirmasi manual.'
                    );
                }

                $settleResult = $this->settleInvoice($invoice, $amount, $parsed, $deviceName);
                $this->safeLog([
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
            }

            // G. Evaluasi kandidat nominal dasar (QRIS statis / tanpa kode unik) - WAJIB ketat!
            if ($baseAmountCandidates->count() > 1) {
                return $this->holdForManualReview(
                    $amount,
                    $parsed,
                    $deviceName,
                    $rawTitle,
                    $rawText,
                    $baseAmountCandidates,
                    'ambiguous_base_amount',
                    null,
                    'Nominal dasar tanpa kode unik cocok dengan beberapa pelanggan sekaligus, ditahan untuk konfirmasi manual.'
                );
            }

            if ($baseAmountCandidates->count() === 1) {
                $invoice = $baseAmountCandidates->first();
                $senderName = trim((string) ($parsed['sender'] ?? ''));

                if ($senderName === '') {
                    return $this->holdForManualReview(
                        $amount,
                        $parsed,
                        $deviceName,
                        $rawTitle,
                        $rawText,
                        $baseAmountCandidates,
                        'unverified_static_qris_base_amount',
                        null,
                        'Pembayaran QRIS tanpa kode unik dan tanpa identitas pengirim tidak di-auto-konfirmasi, ditahan untuk review manual.'
                    );
                }

                if (!$this->doesSenderMatchCustomer($senderName, $invoice->customer, $configService)) {
                    return $this->holdForManualReview(
                        $amount,
                        $parsed,
                        $deviceName,
                        $rawTitle,
                        $rawText,
                        $baseAmountCandidates,
                        'sender_customer_mismatch_base_amount',
                        null,
                        'Nama pengirim QRIS tanpa kode unik tidak cocok dengan nama pelanggan pemilik tagihan, ditahan untuk konfirmasi manual.'
                    );
                }

                if ((bool) ($invoice->customer?->billing_auto_disabled ?? false)) {
                    return $this->holdForManualReview(
                        $amount,
                        $parsed,
                        $deviceName,
                        $rawTitle,
                        $rawText,
                        $baseAmountCandidates,
                        'customer_billing_auto_disabled',
                        null,
                        'Auto-konfirmasi untuk pelanggan ini dinonaktifkan, pembayaran ditahan untuk konfirmasi manual.'
                    );
                }

                $settleResult = $this->settleInvoice($invoice, $amount, $parsed, $deviceName);
                $this->safeLog([
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
            }

            // H. Jika tidak ada invoice pending: cek apakah baru saja lunas oleh perangkat lain (Multi-HP Deduplication)
            $recentlyPaid = Invoice::query()
                ->where('status', 'paid')
                ->where('paid_at', '>=', now()->subHours(3))
                ->where(function ($q) use ($amount) {
                    $q->where('qris_expected_amount', $amount)
                      ->orWhere('amount', $amount);
                })
                ->latest('paid_at')
                ->first();

            if ($recentlyPaid) {
                $isUniquePaidMatch = $recentlyPaid->qris_expected_amount && abs((float) $recentlyPaid->qris_expected_amount - (float) $amount) <= 0.01;
                $sameRef = $refCode !== '' && strcasecmp((string) $recentlyPaid->qris_transaction_number, $refCode) === 0;
                $recentWindowForBase = $recentlyPaid->paid_at && $recentlyPaid->paid_at->gte(now()->subMinutes(15))
                    && (
                        trim((string) ($parsed['sender'] ?? '')) === ''
                        || strcasecmp(trim((string) ($parsed['sender'] ?? '')), trim((string) ($recentlyPaid->qris_sender ?? ''))) === 0
                    );

                if ($isUniquePaidMatch || $sameRef || $recentWindowForBase) {
                    $this->safeLog([
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
            }

            // I. Benar-benar tidak ditemukan tagihan yang cocok
            $this->safeLog([
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
        };

        $lockKey = "qris_settle_lock_{$amount}";
        try {
            $lock = Cache::lock($lockKey, 15);
            return $lock->get($processExecution) ?? [
                'success' => false,
                'status' => 'locked',
                'http_code' => 429,
                'message' => 'Transaksi sedang diproses bersamaan oleh sistem. Silakan coba sesaat lagi.',
            ];
        } catch (\Throwable $lockEx) {
            Log::info("Cache lock not supported or failed, executing settlement directly: " . $lockEx->getMessage());
            return $processExecution();
        }
    }

    protected function holdForManualReview(
        int|float $amount,
        array $parsed,
        string $deviceName,
        string $rawTitle,
        string $rawText,
        Collection $candidates,
        string $reason,
        ?array $staffMatch,
        string $humanMessage
    ): array {
        $refCode = trim((string) ($parsed['reference_code'] ?? ''));
        $refPart = $refCode !== '' ? strtolower($refCode) : ('window:' . floor(now()->timestamp / 300));
        $senderPart = mb_strtolower(trim((string) ($parsed['sender'] ?? ($staffMatch['label'] ?? ''))));
        $fingerprint = 'qris_webhook:' . hash('sha256', implode('|', [
            (int) round((float) $amount),
            $refPart,
            $senderPart,
            mb_strtolower(preg_replace('/\s+/', ' ', (string) ($parsed['combined_text'] ?? '')) ?: ''),
        ]));

        $existingCapture = BillingPaymentCapture::query()->where('fingerprint', $fingerprint)->first();
        if ($existingCapture) {
            $this->safeLog([
                'device_name' => $deviceName,
                'raw_title' => $rawTitle ?: null,
                'raw_text' => $rawText ?: null,
                'extracted_amount' => $amount,
                'status' => 'duplicate_ignored',
                'invoice_id' => $existingCapture->invoice_id,
                'meta' => [
                    'reason' => 'Notifikasi duplikat untuk capture QRIS yang sudah menunggu konfirmasi manual.',
                    'capture_id' => $existingCapture->id,
                    'hold_reason' => $reason,
                ],
            ]);

            return [
                'success' => true,
                'status' => 'duplicate_ignored',
                'http_code' => 200,
                'message' => 'Notifikasi duplikat diterima; pembayaran sudah berada di antrean review manual.',
                'capture_id' => $existingCapture->id,
                'amount' => $amount,
            ];
        }

        $singleInvoice = $candidates->count() === 1 ? $candidates->first() : null;
        $singleCustomer = $singleInvoice?->customer;
        $senderDisplay = trim((string) ($parsed['sender'] ?? ($staffMatch['label'] ?? '')));
        $confidence = $candidates->count() === 1 ? 70.0 : 55.0;

        $capture = BillingPaymentCapture::query()->create([
            'source' => 'qris_webhook',
            'invoice_id' => $singleInvoice?->id,
            'customer_id' => $singleCustomer?->id,
            'amount' => (float) $amount,
            'paid_date' => now()->toDateString(),
            'reference_code' => $refCode !== '' ? $refCode : null,
            'fingerprint' => $fingerprint,
            'match_status' => 'needs_review',
            'match_confidence' => $confidence,
            'meta' => [
                'sender_name' => $senderDisplay !== '' ? $senderDisplay : null,
                'source' => [
                    'type' => 'qris_webhook',
                    'device_name' => $deviceName,
                    'caption' => $parsed['combined_text'] ?? $rawText,
                ],
                'qris_webhook' => [
                    'device_name' => $deviceName,
                    'raw_title' => $rawTitle,
                    'raw_text' => $rawText,
                    'parsed' => $parsed,
                ],
                'analysis' => [
                    'provider_used' => 'qris_webhook',
                    'is_payment_proof' => true,
                    'success_status' => true,
                    'amount' => (float) $amount,
                    'sender_name' => $senderDisplay !== '' ? $senderDisplay : null,
                    'destination_name' => 'GoPay Merchant QRIS',
                    'reference_code' => $refCode !== '' ? $refCode : null,
                    'paid_date' => now()->toDateString(),
                    'paid_time' => now()->format('H:i:s'),
                    'ocr_raw_text' => $parsed['combined_text'] ?? $rawText,
                ],
                'validation' => [
                    'status' => 'needs_review',
                    'failure_reason' => $reason,
                    'staff_match' => $staffMatch,
                    'flags' => [
                        'is_payment_proof' => true,
                        'success_status' => true,
                        'non_admin_payer' => $staffMatch === null && !in_array($reason, ['excluded_admin_payer', 'admin_payer_needs_manual_review'], true),
                        'destination_whitelisted' => true,
                        'customer_identified' => $singleCustomer !== null,
                        'active_invoice_found' => $singleInvoice !== null,
                        'amount_matches_invoice' => $candidates->isNotEmpty(),
                    ],
                ],
            ],
        ]);

        foreach ($candidates as $candidateInvoice) {
            $isUniqueQris = $candidateInvoice->qris_expected_amount
                && abs((float) $candidateInvoice->qris_expected_amount - (float) $amount) <= 0.01;
            $rowScore = $isUniqueQris ? 75.0 : ($candidates->count() === 1 ? 70.0 : 60.0);

            BillingPaymentMatchReview::query()->create([
                'capture_id' => $capture->id,
                'candidate_invoice_id' => $candidateInvoice->id,
                'score' => $rowScore,
                'reason' => ($isUniqueQris ? 'qris_unique_amount_exact,' : 'qris_base_amount,') . $reason,
                'status' => 'candidate',
            ]);
        }

        try {
            $notificationService = $this->paymentCaptureNotificationService ?? app(PaymentCaptureNotificationService::class);
            $notificationService->notifyNeedsReview($capture->fresh(['customer', 'invoice']));
        } catch (\Throwable $notifyEx) {
            Log::warning('Failed notifying admin for manual review QRIS webhook capture', [
                'capture_id' => $capture->id,
                'error' => $notifyEx->getMessage(),
            ]);
        }

        $this->safeLog([
            'device_name' => $deviceName,
            'raw_title' => $rawTitle ?: null,
            'raw_text' => $rawText ?: null,
            'extracted_amount' => $amount,
            'status' => 'manual_review_required',
            'invoice_id' => $singleInvoice?->id,
            'meta' => [
                'reason' => $humanMessage,
                'failure_reason' => $reason,
                'capture_id' => $capture->id,
                'candidate_count' => $candidates->count(),
                'staff_match' => $staffMatch,
                'parsed' => $parsed,
            ],
        ]);

        return [
            'success' => true,
            'status' => 'manual_review_required',
            'http_code' => 200,
            'message' => $humanMessage,
            'reason' => $reason,
            'capture_id' => $capture->id,
            'invoice_id' => $singleInvoice?->id,
            'amount' => $amount,
        ];
    }

    protected function doesSenderMatchCustomer(?string $senderName, ?Customer $customer, PaymentVerificationConfigService $configService): bool
    {
        if (!$customer) {
            return false;
        }

        $senderNorm = $configService->normalizeComparableName($senderName);
        $customerNorm = $configService->normalizeComparableName((string) $customer->name);

        if ($senderNorm === '' || $customerNorm === '') {
            return false;
        }

        if ($senderNorm === $customerNorm) {
            return true;
        }

        if (strlen($senderNorm) >= 4 && preg_match('/\b' . preg_quote($senderNorm, '/') . '\b/', $customerNorm)) {
            return true;
        }

        if (strlen($customerNorm) >= 4 && preg_match('/\b' . preg_quote($customerNorm, '/') . '\b/', $senderNorm)) {
            return true;
        }

        return false;
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
        $unisolirResult = [];

        if ($customer) {
            $unisolirResult = $this->customerIsolationService->unisolateCustomer($customer, $now, $invoice);
            $isolationRestored = (bool) ($unisolirResult['isolation_restored'] ?? false);
        }

        // 3. Sinkronisasi Buku Kas / Mutasi Keuangan (Konfirmasi via Kode Unik QRIS Dinamis)
        try {
            $this->financialLedgerService->syncInvoicePayment(
                $invoice->fresh(), 
                $defaultFinanceId, 
                \App\Models\FinancialTransaction::STATUS_CONFIRMED, 
                'unique_code',
                [
                    'settled_via' => 'qris_webhook',
                    'qris_settled_amount' => (float) $amount,
                    'qris_webhook_device' => $deviceName,
                ]
            );
        } catch (\Throwable $ledgerEx) {
            Log::error('DynamicQris settle: FinancialLedgerService error: ' . $ledgerEx->getMessage());
        }

        // 4. Kirim Kuitansi / Bukti Bayar WhatsApp ke Pelanggan
        $waSent = false;
        if ($customer && !empty($customer->phone)) {
            $waSent = $this->sendPaymentConfirmationWhatsApp($customer->fresh(), $invoice, $amount, $refCode);
        }

        return [
            'invoice_id' => $invoice->id,
            'amount' => $amount,
            'ref_code' => $refCode,
            'isolation_restored' => $isolationRestored,
            'unisolir_result' => $unisolirResult,
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

        // Pesan konfirmasi resmi terpadu dan konsisten (sama persis dengan konfirmasi tagihan utama)
        $message = $this->billingMessageTemplateService->buildPaymentConfirmationMessage($customer, true);

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

    /**
     * Simpan log webhook dengan aman tanpa menyebabkan 500 jika terjadi kegagalan skema / database.
     */
    protected function safeLog(array $attributes): ?QrisWebhookLog
    {
        try {
            if (!isset($attributes['extracted_amount']) || $attributes['extracted_amount'] === null) {
                $attributes['extracted_amount'] = 0;
            }
            return QrisWebhookLog::create($attributes);
        } catch (\Throwable $e) {
            Log::warning('QrisWebhookLog creation failed: ' . $e->getMessage(), ['attributes' => $attributes]);
            return null;
        }
    }
}

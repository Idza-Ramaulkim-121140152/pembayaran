<?php

namespace App\Services;

use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\PaymentReceiptOption;
use App\Models\QrisDailyReconciliation;
use App\Models\QrisSettlement;
use App\Models\QrisWebhookLog;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class QrisSettlementReconciliationService
{
    public const TZ = 'Asia/Jakarta';

    public const SETTING_ENABLED = 'qris_reconciliation_enabled';
    public const SETTING_CUTOFF_TIME = 'qris_reconciliation_cutoff_time';
    public const SETTING_CHECK_TIME = 'qris_reconciliation_check_time';
    public const SETTING_GRACE_MINUTES = 'qris_reconciliation_grace_minutes';
    public const SETTING_MDR_PERCENT = 'qris_reconciliation_mdr_percent';
    public const SETTING_PAYOUT_FEE = 'qris_reconciliation_payout_fee';
    public const SETTING_TOLERANCE_AMOUNT = 'qris_reconciliation_tolerance_amount';
    public const SETTING_ALERT_RECIPIENTS = 'qris_reconciliation_alert_recipients';
    public const SETTING_INCLUDE_OWNER_RECIPIENTS = 'qris_reconciliation_include_owner_recipients';

    public const DEDUP_WINDOW_SECONDS = 600; // 10 menit untuk cegah duplikat multi-HP MacroDroid

    public function __construct(
        protected ExecutiveDailyReportService $executiveDailyReportService,
        protected InternalAlertService $internalAlertService
    ) {}

    public function isReady(): bool
    {
        return Schema::hasTable('qris_settlements') && Schema::hasTable('qris_daily_reconciliations');
    }

    public function getConfig(): array
    {
        $cutoff = $this->normalizeTimeString((string) SiteSetting::get(self::SETTING_CUTOFF_TIME, '21:00'), '21:00');
        $checkTime = $this->normalizeTimeString((string) SiteSetting::get(self::SETTING_CHECK_TIME, '21:15'), '21:15');
        $graceMinutes = max(0, min(180, (int) SiteSetting::get(self::SETTING_GRACE_MINUTES, '30')));
        $mdrPercent = max(0.0, min(10.0, (float) SiteSetting::get(self::SETTING_MDR_PERCENT, '0')));
        $payoutFee = max(0.0, (float) SiteSetting::get(self::SETTING_PAYOUT_FEE, '0'));
        $tolerance = max(0.0, (float) SiteSetting::get(self::SETTING_TOLERANCE_AMOUNT, '0'));
        $includeOwner = SiteSetting::get(self::SETTING_INCLUDE_OWNER_RECIPIENTS, '1') !== '0';
        $customRaw = (string) SiteSetting::get(self::SETTING_ALERT_RECIPIENTS, '');

        return [
            'enabled' => SiteSetting::get(self::SETTING_ENABLED, '1') !== '0',
            'cutoff_time' => $cutoff,
            'check_time' => $checkTime,
            'grace_minutes' => $graceMinutes,
            'mdr_percent' => round($mdrPercent, 3),
            'payout_fee' => round($payoutFee, 0),
            'tolerance_amount' => round($tolerance, 0),
            'include_owner_recipients' => $includeOwner,
            'alert_recipients_raw' => $customRaw,
            'owner_recipients' => $this->executiveDailyReportService->getRecipients(),
            'resolved_recipients' => $this->getAlertRecipients(),
        ];
    }

    public function updateConfig(array $payload): array
    {
        if (array_key_exists('enabled', $payload)) {
            SiteSetting::set(self::SETTING_ENABLED, $payload['enabled'] ? '1' : '0');
        }
        if (array_key_exists('cutoff_time', $payload) && trim((string) $payload['cutoff_time']) !== '') {
            SiteSetting::set(self::SETTING_CUTOFF_TIME, $this->normalizeTimeString((string) $payload['cutoff_time'], '21:00'));
        }
        if (array_key_exists('check_time', $payload) && trim((string) $payload['check_time']) !== '') {
            SiteSetting::set(self::SETTING_CHECK_TIME, $this->normalizeTimeString((string) $payload['check_time'], '21:15'));
        }
        if (array_key_exists('grace_minutes', $payload)) {
            $grace = max(0, min(180, (int) $payload['grace_minutes']));
            SiteSetting::set(self::SETTING_GRACE_MINUTES, (string) $grace);
        }
        if (array_key_exists('mdr_percent', $payload)) {
            $mdr = max(0.0, min(10.0, (float) $payload['mdr_percent']));
            SiteSetting::set(self::SETTING_MDR_PERCENT, (string) $mdr);
        }
        if (array_key_exists('payout_fee', $payload)) {
            $fee = max(0.0, (float) $payload['payout_fee']);
            SiteSetting::set(self::SETTING_PAYOUT_FEE, (string) $fee);
        }
        if (array_key_exists('tolerance_amount', $payload)) {
            $tol = max(0.0, (float) $payload['tolerance_amount']);
            SiteSetting::set(self::SETTING_TOLERANCE_AMOUNT, (string) $tol);
        }
        if (array_key_exists('include_owner_recipients', $payload)) {
            SiteSetting::set(self::SETTING_INCLUDE_OWNER_RECIPIENTS, $payload['include_owner_recipients'] ? '1' : '0');
        }
        if (array_key_exists('alert_recipients_raw', $payload)) {
            SiteSetting::set(self::SETTING_ALERT_RECIPIENTS, trim((string) ($payload['alert_recipients_raw'] ?? '')));
        }

        return $this->getConfig();
    }

    public function getAlertRecipients(): array
    {
        $includeOwner = SiteSetting::get(self::SETTING_INCLUDE_OWNER_RECIPIENTS, '1') !== '0';
        $merged = [];

        if ($includeOwner) {
            foreach ($this->executiveDailyReportService->getRecipients() as $rec) {
                $phone = trim((string) ($rec['phone'] ?? ''));
                if ($phone !== '') {
                    $merged[] = [
                        'phone' => $phone,
                        'name' => trim((string) ($rec['name'] ?? 'Owner')),
                        'origin' => 'executive_report',
                    ];
                }
            }
        }

        $rawCustom = trim((string) SiteSetting::get(self::SETTING_ALERT_RECIPIENTS, ''));
        if ($rawCustom !== '') {
            $decoded = json_decode($rawCustom, true);
            if (is_array($decoded)) {
                foreach ($decoded as $item) {
                    if (is_string($item) && trim($item) !== '') {
                        $merged[] = ['phone' => trim($item), 'name' => 'Admin QRIS', 'origin' => 'qris_custom'];
                    } elseif (is_array($item) && !empty($item['phone'])) {
                        $merged[] = [
                            'phone' => trim((string) $item['phone']),
                            'name' => trim((string) ($item['name'] ?? 'Admin QRIS')),
                            'origin' => 'qris_custom',
                        ];
                    }
                }
            } else {
                foreach (preg_split('/[,;\r\n]+/', $rawCustom) ?: [] as $num) {
                    $num = trim((string) $num);
                    if ($num !== '') {
                        $merged[] = ['phone' => $num, 'name' => 'Admin QRIS', 'origin' => 'qris_custom'];
                    }
                }
            }
        }

        $seen = [];
        $unique = [];
        foreach ($merged as $rec) {
            $key = $this->canonicalPhoneDigits($rec['phone']);
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $unique[] = $rec;
        }

        return $unique;
    }

    /**
     * Hitung rentang waktu transaksi QRIS dan jendela pencairan GoPay untuk suatu tanggal siklus (WIB).
     */
    public function resolveCycleWindow(string|Carbon $cycleDate): array
    {
        $config = $this->getConfig();
        $dateStr = $cycleDate instanceof Carbon
            ? $cycleDate->copy()->timezone(self::TZ)->toDateString()
            : Carbon::parse((string) $cycleDate, self::TZ)->toDateString();

        [$cutH, $cutM] = array_map('intval', explode(':', $config['cutoff_time']));
        [$chkH, $chkM] = array_map('intval', explode(':', $config['check_time']));

        $periodEndWib = Carbon::createFromFormat('Y-m-d', $dateStr, self::TZ)->setTime($cutH, $cutM, 0);
        $periodStartWib = $periodEndWib->copy()->subDay();
        $settlementEndWib = $periodEndWib->copy()->addMinutes((int) $config['grace_minutes']);
        $settlementStartWib = $periodStartWib->copy()->addMinutes((int) $config['grace_minutes']);
        $checkAtWib = Carbon::createFromFormat('Y-m-d', $dateStr, self::TZ)->setTime($chkH, $chkM, 0);
        if ($checkAtWib->lessThan($periodEndWib)) {
            $checkAtWib = $periodEndWib->copy();
        }

        return [
            'cycle_date' => $dateStr,
            'period_start_wib' => $periodStartWib,
            'period_end_wib' => $periodEndWib,
            'settlement_start_wib' => $settlementStartWib,
            'settlement_end_wib' => $settlementEndWib,
            'check_at_wib' => $checkAtWib,
        ];
    }

    /**
     * Tentukan tanggal siklus (YYYY-MM-DD WIB) untuk suatu waktu pencairan GoPay Merchant.
     * Contoh: pencairan manual jam 06:37 WIB maupun otomatis jam 21:01 WIB pada tgl 12
     * keduanya masuk ke siklus 2026-11-12 (cut-off 21:00 + grace 30m).
     */
    public function resolveCycleDateForSettlementAt(Carbon $settledAt): string
    {
        $config = $this->getConfig();
        [$cutH, $cutM] = array_map('intval', explode(':', $config['cutoff_time']));

        $settledWib = $settledAt->copy()->timezone(self::TZ);
        $sameDayBoundary = $settledWib->copy()->setTime($cutH, $cutM, 0)->addMinutes((int) $config['grace_minutes']);

        if ($settledWib->greaterThan($sameDayBoundary)) {
            return $settledWib->copy()->addDay()->toDateString();
        }

        return $settledWib->toDateString();
    }

    /**
     * Catat notifikasi "Pencairan dana berhasil" dari webhook GoPay Merchant / MacroDroid.
     * Menangani deduplikasi multi-perangkat dan TIDAK menyentuh tagihan pelanggan.
     */
    public function recordWebhookSettlement(
        float $amount,
        array $parsed,
        string $deviceName,
        ?string $rawTitle,
        string $rawText,
        ?QrisWebhookLog $webhookLog = null,
        ?Carbon $settledAt = null
    ): array {
        if (!$this->isReady()) {
            return [
                'success' => false,
                'duplicate' => false,
                'message' => 'Tabel rekonsiliasi QRIS belum tersedia.',
            ];
        }

        $settledAt = ($settledAt ?: now())->copy();
        $settledWib = $settledAt->copy()->timezone(self::TZ);
        $cycleDate = $this->resolveCycleDateForSettlementAt($settledWib);
        $normalizedText = $this->normalizeNotificationText(($rawTitle ? $rawTitle . ' ' : '') . $rawText);
        $refCode = trim((string) ($parsed['reference_code'] ?? ''));
        $roundedAmount = (int) round($amount);

        $lockKey = 'qris-settlement-' . $cycleDate . '-' . $roundedAmount;

        $outcome = Cache::lock($lockKey, 10)->block(5, function () use (
            $amount,
            $settledAt,
            $settledWib,
            $cycleDate,
            $normalizedText,
            $refCode,
            $deviceName,
            $rawTitle,
            $rawText,
            $webhookLog,
            $parsed
        ) {
            // 1. Cek duplikasi by reference_code jika tersedia
            if ($refCode !== '' && strlen($refCode) >= 5) {
                $existingByRef = QrisSettlement::query()
                    ->where('reference_code', $refCode)
                    ->whereBetween('amount', [$amount - 0.5, $amount + 0.5])
                    ->first();

                if ($existingByRef) {
                    return [
                        'duplicate' => true,
                        'reason' => 'Notifikasi pencairan dengan kode referensi yang sama sudah tercatat.',
                        'settlement' => $existingByRef,
                    ];
                }
            }

            // 2. Cek duplikasi multi-perangkat (HP admin 1 & HP admin 2 mengirim push yg sama dalam jendela waktu 10 menit)
            $windowStart = $settledAt->copy()->subSeconds(self::DEDUP_WINDOW_SECONDS)->timezone(config('app.timezone'));
            $windowEnd = $settledAt->copy()->addSeconds(self::DEDUP_WINDOW_SECONDS)->timezone(config('app.timezone'));

            $recentSameAmount = QrisSettlement::query()
                ->where('source', QrisSettlement::SOURCE_WEBHOOK)
                ->whereBetween('amount', [$amount - 0.5, $amount + 0.5])
                ->whereBetween('settled_at', [$windowStart, $windowEnd])
                ->get();

            foreach ($recentSameAmount as $candidate) {
                $candidateNorm = (string) data_get($candidate->meta, 'normalized_text', '');
                if ($candidateNorm === $normalizedText || strtolower((string) $candidate->device_name) !== strtolower($deviceName)) {
                    return [
                        'duplicate' => true,
                        'reason' => 'Notifikasi pencairan ganda dari perangkat lain diabaikan dengan aman.',
                        'settlement' => $candidate,
                    ];
                }
            }

            $window = $this->resolveCycleWindow($cycleDate);
            $autoStartWib = $window['period_end_wib']->copy()->subMinutes(10);
            $autoEndWib = $window['settlement_end_wib'];
            $isAutoKeyword = (bool) preg_match('/\b(otomatis|auto|jadwal|scheduled|21[.:]00)\b/i', $normalizedText);
            $isWithinAutoWindow = $settledWib->betweenIncluded($autoStartWib, $autoEndWib);
            $settlementType = ($isAutoKeyword || $isWithinAutoWindow)
                ? QrisSettlement::TYPE_AUTO
                : QrisSettlement::TYPE_MANUAL;

            $timeBucket = (int) floor($settledAt->timestamp / self::DEDUP_WINDOW_SECONDS);
            $fingerprint = hash('sha256', implode('|', [
                $cycleDate,
                number_format($amount, 2, '.', ''),
                $refCode !== '' ? strtolower($refCode) : sha1($normalizedText),
                $timeBucket,
            ]));

            // Fallback guard against exact fingerprint collision
            $existingByFp = QrisSettlement::query()->where('fingerprint', $fingerprint)->first();
            if ($existingByFp) {
                return [
                    'duplicate' => true,
                    'reason' => 'Notifikasi pencairan duplikat (fingerprint cocok).',
                    'settlement' => $existingByFp,
                ];
            }

            $settlement = QrisSettlement::create([
                'cycle_date' => $cycleDate,
                'settled_at' => $settledAt->copy()->timezone(config('app.timezone')),
                'amount' => $amount,
                'source' => QrisSettlement::SOURCE_WEBHOOK,
                'settlement_type' => $settlementType,
                'device_name' => $deviceName,
                'raw_title' => $rawTitle ?: null,
                'raw_text' => $rawText ?: null,
                'reference_code' => $refCode !== '' ? $refCode : null,
                'fingerprint' => $fingerprint,
                'qris_webhook_log_id' => $webhookLog?->id,
                'notes' => $settlementType === QrisSettlement::TYPE_AUTO
                    ? 'Pencairan otomatis GoPay Merchant terdeteksi via webhook.'
                    : 'Pencairan manual/dini GoPay Merchant terdeteksi via webhook.',
                'meta' => [
                    'normalized_text' => $normalizedText,
                    'settled_at_wib' => $settledWib->format('Y-m-d H:i:s'),
                    'parsed' => $parsed,
                ],
            ]);

            return [
                'duplicate' => false,
                'settlement' => $settlement,
            ];
        });

        if (!empty($outcome['duplicate'])) {
            $reconciliation = $this->reconcileCycle($cycleDate, sendAlertOnMismatch: false);
            return [
                'success' => true,
                'duplicate' => true,
                'message' => $outcome['reason'],
                'settlement' => $outcome['settlement'],
                'reconciliation' => $reconciliation,
                'alert_result' => null,
            ];
        }

        /** @var QrisSettlement $settlement */
        $settlement = $outcome['settlement'];
        $reconciliation = $this->reconcileCycle($cycleDate, sendAlertOnMismatch: false);

        // Jika sebelumnya alert selisih sudah terkirim (misal pukul 21:15 notif belum masuk), dan webhook pencairan
        // susulan baru diterima setelah jam cek harian, evaluasi pemulihan / pembaruan selisih otomatis.
        $alertResult = null;
        $window = $this->resolveCycleWindow($cycleDate);
        if ($reconciliation->alert_sent_at !== null && now(self::TZ)->greaterThanOrEqualTo($window['check_at_wib'])) {
            $alertResult = $this->handlePostCheckWebhookEvaluation($reconciliation);
        }

        return [
            'success' => true,
            'duplicate' => false,
            'message' => 'Pencairan dana GoPay Merchant berhasil dicatat untuk rekonsiliasi.',
            'settlement' => $settlement,
            'reconciliation' => $reconciliation->fresh(),
            'alert_result' => $alertResult,
        ];
    }

    /**
     * Input pencairan manual oleh Admin/Finance (misal saat HP notifier mati / pencatatan koreksi).
     */
    public function recordManualSettlement(array $data, ?int $actorId = null): array
    {
        $settledAt = !empty($data['settled_at'])
            ? Carbon::parse((string) $data['settled_at'], self::TZ)
            : now(self::TZ);

        $cycleDate = !empty($data['cycle_date'])
            ? Carbon::parse((string) $data['cycle_date'], self::TZ)->toDateString()
            : $this->resolveCycleDateForSettlementAt($settledAt);

        $amount = round((float) $data['amount'], 2);
        $settlementType = in_array(($data['settlement_type'] ?? ''), [QrisSettlement::TYPE_AUTO, QrisSettlement::TYPE_MANUAL], true)
            ? $data['settlement_type']
            : QrisSettlement::TYPE_MANUAL;

        $settlement = QrisSettlement::create([
            'cycle_date' => $cycleDate,
            'settled_at' => $settledAt->copy()->timezone(config('app.timezone')),
            'amount' => $amount,
            'source' => QrisSettlement::SOURCE_MANUAL,
            'settlement_type' => $settlementType,
            'device_name' => 'Manual Input',
            'raw_title' => 'Input Pencairan Manual',
            'raw_text' => $data['notes'] ?? null,
            'reference_code' => !empty($data['reference_code']) ? trim((string) $data['reference_code']) : null,
            'fingerprint' => null,
            'created_by' => $actorId,
            'notes' => !empty($data['notes']) ? trim((string) $data['notes']) : 'Dicatat manual oleh admin/finance.',
            'meta' => [
                'settled_at_wib' => $settledAt->copy()->timezone(self::TZ)->format('Y-m-d H:i:s'),
            ],
        ]);

        $reconciliation = $this->reconcileCycle($cycleDate, sendAlertOnMismatch: false);

        return [
            'settlement' => $settlement,
            'reconciliation' => $reconciliation,
        ];
    }

    public function deleteSettlement(QrisSettlement $settlement): QrisDailyReconciliation
    {
        $cycleDate = Carbon::parse($settlement->cycle_date)->toDateString();
        $settlement->delete();

        return $this->reconcileCycle($cycleDate, sendAlertOnMismatch: false);
    }

    /**
     * Rekonsiliasi pendapatan QRIS vs total pencairan GoPay Merchant pada suatu siklus tanggal.
     */
    public function reconcileCycle(
        string|Carbon|null $cycleDate = null,
        bool $sendAlertOnMismatch = false,
        bool $forceAlert = false,
        bool $treatOngoingAsFinal = false,
        bool $dryRun = false
    ): QrisDailyReconciliation {
        $targetDate = $cycleDate ?: now(self::TZ)->toDateString();
        $window = $this->resolveCycleWindow($targetDate);
        $config = $this->getConfig();

        $incomeSummary = $this->collectCycleQrisIncome($window['period_start_wib'], $window['period_end_wib']);
        $settlements = $this->collectCycleSettlements($window['cycle_date']);

        $grossAmount = (float) $incomeSummary['gross_amount'];
        $trxCount = (int) $incomeSummary['count'];
        $settledAmount = round((float) $settlements->sum('amount'), 2);
        $settlementCount = $settlements->count();

        $mdrFee = round($grossAmount * ((float) $config['mdr_percent'] / 100), 0);
        $payoutFee = round($settlementCount * (float) $config['payout_fee'], 0);
        $expectedNet = round(max(0.0, $grossAmount - $mdrFee - $payoutFee), 2);
        $discrepancy = round($settledAmount - $expectedNet, 2);
        $tolerance = (float) $config['tolerance_amount'];

        $nowWib = now(self::TZ);
        $isPastCutoff = $nowWib->greaterThanOrEqualTo($window['period_end_wib']);

        if ($grossAmount <= 0.01 && $settledAmount <= 0.01) {
            $status = QrisDailyReconciliation::STATUS_NO_ACTIVITY;
        } elseif (abs($discrepancy) <= $tolerance) {
            $status = QrisDailyReconciliation::STATUS_MATCHED;
        } elseif (!$isPastCutoff && !$treatOngoingAsFinal && $settledAmount <= $expectedNet + $tolerance) {
            // Sebelum jam 21:00 cut-off dan pencairan masih kurang (menunggu sweep 21:00 atau penarikan sisa)
            $status = QrisDailyReconciliation::STATUS_PENDING;
        } else {
            $status = QrisDailyReconciliation::STATUS_MISMATCH;
        }

        $existing = QrisDailyReconciliation::query()->whereDate('cycle_date', $window['cycle_date'])->first();
        $existingMeta = is_array($existing?->meta) ? $existing->meta : [];

        $settlementBreakdown = $settlements->map(function (QrisSettlement $row) {
            $wibTime = $row->settled_at ? $row->settled_at->copy()->timezone(self::TZ) : null;
            return [
                'id' => $row->id,
                'amount' => (float) $row->amount,
                'type' => $row->settlement_type,
                'source' => $row->source,
                'device_name' => $row->device_name,
                'settled_at_wib' => $wibTime?->format('H:i') . ' WIB',
                'settled_datetime_wib' => $wibTime?->format('Y-m-d H:i:s'),
                'notes' => $row->notes,
            ];
        })->values()->all();

        $meta = array_merge($existingMeta, [
            'cutoff_time' => $config['cutoff_time'],
            'check_time' => $config['check_time'],
            'mdr_percent' => $config['mdr_percent'],
            'payout_fee_per_settlement' => $config['payout_fee'],
            'tolerance_amount' => $config['tolerance_amount'],
            'period_start_wib' => $window['period_start_wib']->format('Y-m-d H:i:s'),
            'period_end_wib' => $window['period_end_wib']->format('Y-m-d H:i:s'),
            'transactions' => $incomeSummary['transactions'],
            'unsynced_paid_qris_invoices' => $incomeSummary['unsynced_paid_qris_invoices'],
            'unsynced_paid_qris_amount' => $incomeSummary['unsynced_paid_qris_amount'],
            'settlements' => $settlementBreakdown,
        ]);

        // Reset recovery flag if cycle swings back into mismatch
        if ($status === QrisDailyReconciliation::STATUS_MISMATCH) {
            unset($meta['recovery_sent_at']);
        }

        $record = QrisDailyReconciliation::updateOrCreate(
            ['cycle_date' => $window['cycle_date']],
            [
                'period_start' => $window['period_start_wib']->copy()->timezone(config('app.timezone')),
                'period_end' => $window['period_end_wib']->copy()->timezone(config('app.timezone')),
                'system_qris_gross_amount' => $grossAmount,
                'system_qris_count' => $trxCount,
                'expected_mdr_fee' => $mdrFee,
                'expected_payout_fee' => $payoutFee,
                'expected_net_amount' => $expectedNet,
                'settled_amount' => $settledAmount,
                'settlement_count' => $settlementCount,
                'discrepancy_amount' => $discrepancy,
                'status' => $status,
                'last_evaluated_at' => now(),
                'meta' => $meta,
            ]
        );

        if ($sendAlertOnMismatch && !$dryRun && $status === QrisDailyReconciliation::STATUS_MISMATCH) {
            $this->dispatchMismatchAlert($record, $forceAlert);
        }

        return $record->fresh();
    }

    /**
     * Dipanggil oleh scheduler / artisan command untuk evaluasi rutin siklus hari ini (dan siklus kemarin jika terlewat).
     */
    public function evaluateScheduledReconciliations(
        ?string $cycleDate = null,
        bool $force = false,
        bool $dryRun = false
    ): array {
        $config = $this->getConfig();
        if (!$this->isReady()) {
            return ['status' => 'not_ready', 'records' => []];
        }
        if (!$config['enabled'] && !$force) {
            return ['status' => 'disabled', 'records' => []];
        }

        $nowWib = now(self::TZ);
        $targetDate = $cycleDate ?: $nowWib->toDateString();
        $window = $this->resolveCycleWindow($targetDate);

        $shouldAlertNow = $force || $nowWib->greaterThanOrEqualTo($window['check_at_wib']);
        $treatFinal = $force || $nowWib->greaterThanOrEqualTo($window['period_end_wib']);

        $record = $this->reconcileCycle(
            $targetDate,
            sendAlertOnMismatch: $shouldAlertNow,
            forceAlert: $force,
            treatOngoingAsFinal: $treatFinal,
            dryRun: $dryRun
        );

        $records = [$record];

        // Jika mode cron harian untuk hari ini dan kemarin belum pernah dievaluasi setelah check_at kemarin, evaluasi kemarin juga (1x tangkap keterlambatan cron)
        if ($cycleDate === null && !$dryRun) {
            $yesterday = $nowWib->copy()->subDay()->toDateString();
            $existingYesterday = QrisDailyReconciliation::query()->whereDate('cycle_date', $yesterday)->first();
            $yesterdayWindow = $this->resolveCycleWindow($yesterday);

            $needsYesterdayCheck = !$existingYesterday
                || ($existingYesterday->last_evaluated_at !== null
                    && $existingYesterday->last_evaluated_at->copy()->timezone(self::TZ)->lessThan($yesterdayWindow['check_at_wib']));

            if ($needsYesterdayCheck) {
                $records[] = $this->reconcileCycle(
                    $yesterday,
                    sendAlertOnMismatch: true,
                    forceAlert: false,
                    treatOngoingAsFinal: true,
                    dryRun: false
                );
            }
        }

        return [
            'status' => 'ok',
            'checked_at_wib' => $nowWib->format('Y-m-d H:i:s'),
            'should_alert_now' => $shouldAlertNow,
            'records' => $records,
        ];
    }

    public function handlePostCheckWebhookEvaluation(QrisDailyReconciliation $record): ?array
    {
        $config = $this->getConfig();
        if (!$config['enabled']) {
            return null;
        }

        if ($record->status === QrisDailyReconciliation::STATUS_MISMATCH) {
            return $this->dispatchMismatchAlert($record, false);
        }

        // Jika sebelumnya sempat terkirim alert karena notif GoPay telat masuk setelah 21:15, dan sekarang sudah MATCHED -> kirim konfirmasi pemulihan sekali
        $meta = (array) ($record->meta ?? []);
        if (
            $record->status === QrisDailyReconciliation::STATUS_MATCHED
            && $record->alert_sent_at !== null
            && empty($meta['recovery_sent_at'])
        ) {
            $recipients = $this->getAlertRecipients();
            if (empty($recipients)) {
                return null;
            }

            $message = $this->buildRecoveryMessage($record);
            $this->internalAlertService->sendToRecipients(
                $recipients,
                $message,
                'qris_reconciliation_recovered',
                [
                    'cycle_date' => Carbon::parse($record->cycle_date)->toDateString(),
                    'settled_amount' => (float) $record->settled_amount,
                    'expected_net_amount' => (float) $record->expected_net_amount,
                ],
                'Nomor penerima alert QRIS belum diisi.'
            );

            $meta['recovery_sent_at'] = now()->toIso8601String();
            $record->update(['meta' => $meta]);

            return [
                'sent' => true,
                'type' => 'recovery',
                'recipients_count' => count($recipients),
                'message' => $message,
            ];
        }

        return null;
    }

    public function dispatchMismatchAlert(QrisDailyReconciliation $record, bool $force = false, ?array $customRecipients = null): array
    {
        $discrepancy = round((float) $record->discrepancy_amount, 2);

        if (!$force && $record->alert_sent_at !== null && $record->last_alert_discrepancy !== null) {
            if (abs((float) $record->last_alert_discrepancy - $discrepancy) <= 0.5) {
                return [
                    'sent' => false,
                    'reason' => 'already_alerted_same_discrepancy',
                    'recipients_count' => 0,
                ];
            }
        }

        $recipients = $customRecipients ?: $this->getAlertRecipients();
        if (empty($recipients)) {
            return [
                'sent' => false,
                'reason' => 'no_recipients',
                'recipients_count' => 0,
            ];
        }

        $message = $this->buildMismatchAlertMessage($record);

        $this->internalAlertService->sendToRecipients(
            $recipients,
            $message,
            'qris_reconciliation_mismatch',
            [
                'cycle_date' => Carbon::parse($record->cycle_date)->toDateString(),
                'system_qris_gross_amount' => (float) $record->system_qris_gross_amount,
                'expected_net_amount' => (float) $record->expected_net_amount,
                'settled_amount' => (float) $record->settled_amount,
                'discrepancy_amount' => $discrepancy,
            ],
            'Nomor WhatsApp penerima alert rekonsiliasi QRIS belum diisi.'
        );

        $record->update([
            'alert_sent_at' => now(),
            'last_alert_discrepancy' => $discrepancy,
            'alert_count' => (int) $record->alert_count + 1,
        ]);

        Log::warning('QRIS reconciliation mismatch alert dispatched', [
            'cycle_date' => Carbon::parse($record->cycle_date)->toDateString(),
            'discrepancy' => $discrepancy,
            'recipients_count' => count($recipients),
        ]);

        return [
            'sent' => true,
            'type' => 'mismatch',
            'recipients_count' => count($recipients),
            'message' => $message,
        ];
    }

    public function buildMismatchAlertMessage(QrisDailyReconciliation $record): string
    {
        $cycleDate = Carbon::parse($record->cycle_date)->locale('id');
        $dateLabel = $cycleDate->translatedFormat('l, d F Y');
        $meta = (array) ($record->meta ?? []);
        $cutoff = (string) ($meta['cutoff_time'] ?? '21:00');

        $periodStartLabel = !empty($meta['period_start_wib'])
            ? Carbon::parse($meta['period_start_wib'])->format('d/m H:i')
            : ($record->period_start ? $record->period_start->copy()->timezone(self::TZ)->format('d/m H:i') : '-');
        $periodEndLabel = !empty($meta['period_end_wib'])
            ? Carbon::parse($meta['period_end_wib'])->format('d/m H:i')
            : ($record->period_end ? $record->period_end->copy()->timezone(self::TZ)->format('d/m H:i') : '-');

        $gross = (float) $record->system_qris_gross_amount;
        $mdr = (float) $record->expected_mdr_fee;
        $payoutFee = (float) $record->expected_payout_fee;
        $expectedNet = (float) $record->expected_net_amount;
        $settled = (float) $record->settled_amount;
        $diff = (float) $record->discrepancy_amount;

        $diffDirection = $diff < 0
            ? 'Kurang Cair / Belum Tercairkan'
            : 'Lebih Cair (Ada Dana QRIS Belum Tercatat di Mutasi)';

        $diffSign = $diff > 0 ? '+' : ($diff < 0 ? '-' : '');
        $diffFormatted = $diffSign . 'Rp ' . number_format(abs($diff), 0, ',', '.');

        $lines = [
            '⚠️ *PERINGATAN REKONSILIASI QRIS*',
            '',
            'Pendapatan via QRIS hari ini tidak sesuai harap cek mutasi keuangan perusahaan anda.',
            '',
            "📅 Tanggal Siklus: *{$dateLabel}*",
            "🕒 Rentang Cut-off ({$cutoff} WIB): {$periodStartLabel} s/d {$periodEndLabel} WIB",
            '',
            '💳 *Uang Masuk QRIS (Mutasi Keuangan)*: Rp ' . number_format($gross, 0, ',', '.') . " ({$record->system_qris_count} transaksi)",
        ];

        if ($mdr > 0 || $payoutFee > 0) {
            $lines[] = '• Potongan MDR / Admin Pencairan: -Rp ' . number_format($mdr + $payoutFee, 0, ',', '.');
            $lines[] = '• Ekspektasi Dana Bersih Cair: Rp ' . number_format($expectedNet, 0, ',', '.');
        }

        $lines[] = '🏦 *Total Pencairan GoPay Merchant*: Rp ' . number_format($settled, 0, ',', '.') . " ({$record->settlement_count}x penarikan)";

        $settlements = is_array($meta['settlements'] ?? null) ? $meta['settlements'] : [];
        if (count($settlements) > 0) {
            foreach ($settlements as $s) {
                $sTime = $s['settled_at_wib'] ?? '-';
                $sType = ($s['type'] ?? 'manual') === 'auto' ? 'Otomatis' : 'Manual';
                $sAmt = 'Rp ' . number_format((float) ($s['amount'] ?? 0), 0, ',', '.');
                $lines[] = "  - {$sTime} ({$sType}): {$sAmt}";
            }
        } else {
            $lines[] = '  - Belum ada notifikasi pencairan dana GoPay Merchant yang masuk pada siklus ini.';
        }

        $lines[] = '';
        $lines[] = "📊 *Selisih*: *{$diffFormatted}* ({$diffDirection})";

        $unsyncedCount = count((array) ($meta['unsynced_paid_qris_invoices'] ?? []));
        $unsyncedAmount = (float) ($meta['unsynced_paid_qris_amount'] ?? 0);
        if ($unsyncedCount > 0) {
            $lines[] = '';
            $lines[] = "🔎 *Catatan*: Terdeteksi {$unsyncedCount} invoice QRIS berstatus lunas (Rp " . number_format($unsyncedAmount, 0, ',', '.') . ') yang belum masuk ke Mutasi Keuangan.';
        }

        $lines[] = '';
        $lines[] = 'Silakan periksa menu Mutasi Keuangan & Pengaturan QRIS untuk mencocokkan mutasi perusahaan Anda.';

        return implode("\n", $lines);
    }

    public function buildRecoveryMessage(QrisDailyReconciliation $record): string
    {
        $cycleDate = Carbon::parse($record->cycle_date)->locale('id')->translatedFormat('d F Y');
        $settled = 'Rp ' . number_format((float) $record->settled_amount, 0, ',', '.');
        $expected = 'Rp ' . number_format((float) $record->expected_net_amount, 0, ',', '.');

        return "✅ *UPDATE REKONSILIASI QRIS SESUAI*\n\n"
            . "Notifikasi pencairan GoPay Merchant terbaru telah diterima.\n"
            . "📅 Siklus: *{$cycleDate}*\n"
            . "💳 Mutasi QRIS: {$expected}\n"
            . "🏦 Total Pencairan: {$settled}\n\n"
            . 'Status rekonsiliasi QRIS hari ini kini *SESUAI (Matched)*.';
    }

    public function sendTestAlert(?string $phone = null): array
    {
        $today = now(self::TZ)->toDateString();
        $record = $this->reconcileCycle($today, sendAlertOnMismatch: false);

        $recipients = null;
        if ($phone !== null && trim($phone) !== '') {
            $recipients = [['phone' => trim($phone), 'name' => 'Test QRIS Alert']];
        } else {
            $recipients = $this->getAlertRecipients();
        }

        if (empty($recipients)) {
            return [
                'success' => false,
                'message' => 'Belum ada nomor WhatsApp penerima alert yang terkonfigurasi.',
            ];
        }

        $message = $this->buildMismatchAlertMessage($record) . "\n\n[UJI COBA ALERT REKONSILIASI QRIS]";

        $this->internalAlertService->sendToRecipients(
            $recipients,
            $message,
            'qris_reconciliation_test',
            ['cycle_date' => $today],
            'Nomor WhatsApp penerima alert rekonsiliasi QRIS belum diisi.'
        );

        return [
            'success' => true,
            'recipients_count' => count($recipients),
            'message' => 'Pesan uji coba alert rekonsiliasi QRIS berhasil dikirim ke ' . count($recipients) . ' penerima.',
            'preview' => $message,
        ];
    }

    public function dashboardPayload(?string $cycleDate = null): array
    {
        $config = $this->getConfig();
        $targetDate = $cycleDate ?: now(self::TZ)->toDateString();
        $todayReconciliation = $this->reconcileCycle($targetDate, sendAlertOnMismatch: false);

        $recentReconciliations = QrisDailyReconciliation::query()
            ->orderByDesc('cycle_date')
            ->limit(30)
            ->get();

        $recentSettlements = QrisSettlement::query()
            ->with('creator:id,name')
            ->orderByDesc('settled_at')
            ->orderByDesc('id')
            ->limit(40)
            ->get()
            ->map(function (QrisSettlement $row) {
                return [
                    'id' => $row->id,
                    'cycle_date' => Carbon::parse($row->cycle_date)->toDateString(),
                    'settled_at' => $row->settled_at?->toIso8601String(),
                    'settled_at_wib' => $row->settled_at?->copy()->timezone(self::TZ)->format('Y-m-d H:i:s'),
                    'amount' => (float) $row->amount,
                    'source' => $row->source,
                    'settlement_type' => $row->settlement_type,
                    'device_name' => $row->device_name,
                    'raw_title' => $row->raw_title,
                    'raw_text' => $row->raw_text,
                    'reference_code' => $row->reference_code,
                    'notes' => $row->notes,
                    'creator_name' => $row->creator?->name,
                ];
            })->values()->all();

        return [
            'config' => $config,
            'current_cycle' => $todayReconciliation,
            'recent_reconciliations' => $recentReconciliations,
            'recent_settlements' => $recentSettlements,
        ];
    }

    /**
     * Kumpulkan transaksi pendapatan QRIS terkonfirmasi pada jendela waktu [periodStartWib, periodEndWib).
     */
    public function collectCycleQrisIncome(Carbon $periodStartWib, Carbon $periodEndWib): array
    {
        if (!Schema::hasTable('financial_transactions')) {
            return [
                'gross_amount' => 0.0,
                'count' => 0,
                'transactions' => [],
                'unsynced_paid_qris_invoices' => [],
                'unsynced_paid_qris_amount' => 0.0,
            ];
        }

        $dateFrom = $periodStartWib->copy()->subDay()->toDateString();
        $dateTo = $periodEndWib->copy()->addDay()->toDateString();

        $candidates = FinancialTransaction::query()
            ->where('type', 'income')
            ->when(Schema::hasColumn('financial_transactions', 'status'), function ($q) {
                $q->where('status', FinancialTransaction::STATUS_CONFIRMED);
            })
            ->whereBetween('transaction_date', [$dateFrom, $dateTo])
            ->with([
                'reference' => function (\Illuminate\Database\Eloquent\Relations\MorphTo $morphTo) {
                    $morphTo->morphWith([
                        Invoice::class => [
                            'customer:id,name,pppoe_username,package_id',
                            'customer.package:id,name,price',
                            'receivedViaPaymentReceiptOption:id,name',
                            'receivedViaPaymentMethod:id,name',
                            'settledQrisWebhookLog',
                            'approvedPaymentCapture',
                        ],
                    ]);
                },
            ])
            ->orderBy('transaction_date')
            ->orderBy('id')
            ->get();

        $matched = [];
        $syncedInvoiceIds = [];
        $totalAmount = 0.0;

        foreach ($candidates as $tx) {
            if (!$this->isQrisTransaction($tx)) {
                continue;
            }

            $occurredWib = $this->resolveTransactionTimestampWib($tx);
            if ($occurredWib->lessThan($periodStartWib) || $occurredWib->greaterThanOrEqualTo($periodEndWib)) {
                continue;
            }

            $cashAmount = $this->resolveTransactionQrisCashAmount($tx);
            $totalAmount += $cashAmount;

            if ($tx->reference_type === Invoice::class && $tx->reference_id) {
                $syncedInvoiceIds[(int) $tx->reference_id] = true;
            }

            $matched[] = [
                'id' => $tx->id,
                'source' => $tx->source,
                'description' => $tx->description,
                'ledger_amount' => (float) $tx->amount,
                'qris_cash_amount' => $cashAmount,
                'confirmation_via' => $tx->confirmation_via,
                'received_via' => data_get($tx->meta, 'received_via_name'),
                'occurred_at_wib' => $occurredWib->format('Y-m-d H:i:s'),
            ];
        }

        // Diagnostik tambahan: apakah ada invoice QRIS berstatus 'paid' dalam periode ini yg belum punya mutasi confirmed?
        $unsyncedInvoices = [];
        $unsyncedAmount = 0.0;
        if (Schema::hasTable('invoices')) {
            $paidInvoices = Invoice::query()
                ->where('status', 'paid')
                ->whereNotNull('paid_at')
                ->when(Schema::hasColumn('invoices', 'include_in_mutation'), function ($q) {
                    $q->where('include_in_mutation', true);
                })
                ->where(function ($q) use ($periodStartWib, $periodEndWib) {
                    $startApp = $periodStartWib->copy()->subDay()->timezone(config('app.timezone'));
                    $endApp = $periodEndWib->copy()->addDay()->timezone(config('app.timezone'));
                    $q->whereBetween('paid_at', [$startApp, $endApp]);
                    if (Schema::hasColumn('invoices', 'qris_payment_time')) {
                        $q->orWhereBetween('qris_payment_time', [$startApp, $endApp]);
                    }
                })
                ->with(['receivedViaPaymentReceiptOption:id,name', 'receivedViaPaymentMethod:id,name', 'settledQrisWebhookLog'])
                ->get();

            foreach ($paidInvoices as $inv) {
                if (isset($syncedInvoiceIds[(int) $inv->id])) {
                    continue;
                }
                if (!$this->isQrisInvoice($inv)) {
                    continue;
                }
                $invTs = ($inv->qris_payment_time ?: $inv->paid_at)?->copy()->timezone(self::TZ);
                if (!$invTs || $invTs->lessThan($periodStartWib) || $invTs->greaterThanOrEqualTo($periodEndWib)) {
                    continue;
                }
                $invCash = (float) ($inv->settledQrisWebhookLog?->extracted_amount ?: ($inv->qris_expected_amount ?: $inv->amount));
                $unsyncedAmount += $invCash;
                $unsyncedInvoices[] = [
                    'invoice_id' => $inv->id,
                    'invoice_link' => $inv->invoice_link,
                    'amount' => $invCash,
                    'paid_at_wib' => $invTs->format('Y-m-d H:i:s'),
                ];
            }
        }

        return [
            'gross_amount' => round($totalAmount, 2),
            'count' => count($matched),
            'transactions' => $matched,
            'unsynced_paid_qris_invoices' => $unsyncedInvoices,
            'unsynced_paid_qris_amount' => round($unsyncedAmount, 2),
        ];
    }

    public function collectCycleSettlements(string $cycleDate): Collection
    {
        if (!Schema::hasTable('qris_settlements')) {
            return collect();
        }

        return QrisSettlement::query()
            ->whereDate('cycle_date', $cycleDate)
            ->orderBy('settled_at')
            ->orderBy('id')
            ->get();
    }

    protected function isQrisTransaction(FinancialTransaction $tx): bool
    {
        $meta = is_array($tx->meta) ? $tx->meta : [];
        $receivedVia = strtolower(trim((string) ($meta['received_via_name'] ?? '')));

        if (str_contains($receivedVia, 'qris')) {
            return true;
        }

        if (
            ($meta['confirmation_method'] ?? null) === 'unique_code'
            || ($meta['settled_via'] ?? null) === 'qris_webhook'
            || str_starts_with((string) ($meta['qris_transaction_number'] ?? ''), 'QG-')
            || strtolower((string) ($meta['qris_sender'] ?? '')) === 'gopay qris'
        ) {
            return true;
        }

        if ($tx->reference instanceof Invoice && $this->isQrisInvoice($tx->reference)) {
            return true;
        }

        if ($receivedVia === '') {
            $proofChannel = strtolower(trim((string) data_get($meta, 'payment_proof.bank_name', '')));
            if (str_contains($proofChannel, 'qris')) {
                return true;
            }
        }

        return false;
    }

    protected function isQrisInvoice(Invoice $invoice): bool
    {
        $optName = strtolower((string) ($invoice->receivedViaPaymentReceiptOption?->name ?? ''));
        $methodName = strtolower((string) ($invoice->receivedViaPaymentMethod?->name ?? ''));

        if (str_contains($optName, 'qris') || str_contains($methodName, 'qris')) {
            return true;
        }

        if (
            str_starts_with((string) ($invoice->qris_transaction_number ?? ''), 'QG-')
            || strtolower((string) ($invoice->qris_sender ?? '')) === 'gopay qris'
            || $invoice->settledQrisWebhookLog !== null
        ) {
            return true;
        }

        return false;
    }

    protected function resolveTransactionTimestampWib(FinancialTransaction $tx): Carbon
    {
        if ($tx->reference instanceof Invoice) {
            $inv = $tx->reference;
            if ($inv->qris_payment_time) {
                return $inv->qris_payment_time->copy()->timezone(self::TZ);
            }
            if ($inv->paid_at) {
                return $inv->paid_at->copy()->timezone(self::TZ);
            }
        }

        $createdWib = $tx->created_at ? $tx->created_at->copy()->timezone(self::TZ) : null;
        $txDateStr = $tx->transaction_date ? Carbon::parse($tx->transaction_date)->toDateString() : null;

        if ($createdWib && ($txDateStr === null || $createdWib->toDateString() === $txDateStr)) {
            return $createdWib;
        }

        if ($txDateStr !== null) {
            return Carbon::createFromFormat('Y-m-d H:i:s', $txDateStr . ' 12:00:00', self::TZ);
        }

        return now(self::TZ);
    }

    protected function resolveTransactionQrisCashAmount(FinancialTransaction $tx): float
    {
        if ($tx->source === 'invoice_payment') {
            $info = $tx->unique_code_info;
            if (is_array($info) && ($info['total_amount'] ?? 0) > 0) {
                return (float) $info['total_amount'];
            }
        }

        return abs((float) $tx->amount);
    }

    protected function normalizeTimeString(string $raw, string $default): string
    {
        $trimmed = trim($raw);
        if (preg_match('/^([01]?\d|2[0-3]):([0-5]\d)/', $trimmed, $m)) {
            return str_pad($m[1], 2, '0', STR_PAD_LEFT) . ':' . $m[2];
        }

        return $default;
    }

    protected function normalizeNotificationText(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', mb_strtolower($text)));
    }

    protected function canonicalPhoneDigits(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?: '';
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '62')) {
            return '0' . substr($digits, 2);
        }

        return str_starts_with($digits, '0') ? $digits : '0' . $digits;
    }
}

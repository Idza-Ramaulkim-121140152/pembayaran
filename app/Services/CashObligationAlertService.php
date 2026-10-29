<?php

namespace App\Services;

use App\Models\CashObligationEntry;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class CashObligationAlertService
{
    public const SETTING_ENABLED = 'cash_obligation_alert_enabled';
    public const SETTING_DAYS_AHEAD = 'cash_obligation_days_ahead'; // default 3 hari

    public function __construct(
        protected FinancialLedgerService $financialLedgerService,
        protected InternalAlertService $internalAlertService,
        protected ExecutiveDailyReportService $executiveDailyReportService
    ) {}

    /**
     * Memeriksa kewajiban kas yang mendekati jatuh tempo dan mengirim peringatan dini ke WA Owner.
     */
    public function checkAndSendAlerts(?array $customRecipients = null, ?Carbon $now = null): array
    {
        $enabled = SiteSetting::get(self::SETTING_ENABLED, '1') !== '0';
        if (!$enabled && empty($customRecipients)) {
            return [
                'success' => false,
                'status' => 'disabled',
                'message' => 'Pengingat kewajiban kas sedang dinonaktifkan di pengaturan.',
                'alerts_sent' => 0,
            ];
        }

        $recipients = $customRecipients ?: $this->executiveDailyReportService->getRecipients();
        if (empty($recipients)) {
            return [
                'success' => false,
                'status' => 'no_recipients',
                'message' => 'Belum ada nomor WhatsApp penerima laporan eksekutif yang dikonfigurasi.',
                'alerts_sent' => 0,
            ];
        }

        $today = $now ? $now->copy()->startOfDay() : Carbon::today('Asia/Jakarta')->startOfDay();
        $daysAhead = max(1, (int) SiteSetting::get(self::SETTING_DAYS_AHEAD, 3));
        $maxDueDate = $today->copy()->addDays($daysAhead)->toDateString();

        // Cari kewajiban pending yang jatuh tempo antara hari ini sampai X hari ke depan
        $upcomingEntries = CashObligationEntry::query()
            ->where('status', CashObligationEntry::STATUS_PENDING)
            ->whereDate('due_date', '>=', $today->toDateString())
            ->whereDate('due_date', '<=', $maxDueDate)
            ->orderBy('due_date')
            ->get();

        if ($upcomingEntries->isEmpty()) {
            return [
                'success' => true,
                'status' => 'no_upcoming_obligations',
                'message' => "Tidak ada kewajiban kas yang jatuh tempo dalam {$daysAhead} hari ke depan.",
                'alerts_sent' => 0,
            ];
        }

        // Ambil saldo kas berjalan saat ini
        $ledgerSummary = $this->financialLedgerService->getSummaryAsOfDate($today);
        $currentBalance = (float) ($ledgerSummary['balance'] ?? 0);

        // Hitung rata-rata penerimaan kas harian 7 hari terakhir
        $incomeLast7Days = (float) FinancialTransaction::query()
            ->where('type', 'income')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereBetween('transaction_date', [
                $today->copy()->subDays(7)->toDateString(),
                $today->toDateString(),
            ])
            ->sum('amount');
        $avgDailyIncome = round($incomeLast7Days / 7, 0);

        $alertsSent = 0;
        $sentPreviews = [];

        foreach ($upcomingEntries as $entry) {
            $entryDueDate = Carbon::parse($entry->due_date)->startOfDay();
            $daysLeft = $today->diffInDays($entryDueDate, false);

            // Cek apakah sudah pernah dikirimkan alert untuk kewajiban ini dalam 18 jam terakhir (cegah duplikasi / spam)
            $alreadySentToday = NotificationLog::query()
                ->where('meta->type', 'cash_obligation_alert')
                ->where(function ($q) use ($entry) {
                    $q->where('meta->obligation_id', $entry->id)
                      ->orWhere('meta->obligation_id', (string) $entry->id);
                })
                ->where('created_at', '>=', now()->subHours(18))
                ->exists();

            if ($alreadySentToday && empty($customRecipients)) {
                Log::info("CashObligationAlert: Alert untuk obligation #{$entry->id} sudah dikirim hari ini. Skip.");
                continue;
            }

            // Hitung tagihan pelanggan yang jatuh tempo sebelum atau pada tanggal jatuh tempo kewajiban
            $projectedCustomerInvoices = (float) Invoice::query()
                ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->whereBetween('due_date', [$today->toDateString(), $entryDueDate->toDateString()])
                ->sum('amount');

            $message = $this->buildAlertMessage(
                $entry,
                $daysLeft,
                $currentBalance,
                $projectedCustomerInvoices,
                $avgDailyIncome
            );

            $this->internalAlertService->sendToRecipients(
                $recipients,
                $message,
                'cash_obligation_alert',
                [
                    'obligation_id' => $entry->id,
                    'title' => $entry->title,
                    'amount' => $entry->amount,
                    'due_date' => $entry->due_date->toDateString(),
                    'days_left' => $daysLeft,
                    'current_balance' => $currentBalance,
                ],
                'Nomor WhatsApp Owner belum diisi.'
            );

            $alertsSent++;
            $sentPreviews[] = $message;
        }

        return [
            'success' => true,
            'status' => 'completed',
            'message' => "Berhasil memproses {$upcomingEntries->count()} kewajiban kas. Dikirim: {$alertsSent} alert.",
            'alerts_sent' => $alertsSent,
            'previews' => $sentPreviews,
        ];
    }

    /**
     * Menyusun format pesan WhatsApp pengingat kewajiban kas yang terstruktur dan analitis.
     */
    public function buildAlertMessage(
        CashObligationEntry $entry,
        int $daysLeft,
        float $currentBalance,
        float $projectedCustomerInvoices,
        float $avgDailyIncome
    ): string {
        $obligationAmount = (float) $entry->amount;
        $gap = $currentBalance - $obligationAmount;

        $urgencyLabel = $daysLeft <= 0 ? "HARI INI (SEGERA LUNASI!)" : ($daysLeft === 1 ? "H-1 (BESOK)" : "H-{$daysLeft}");
        $dueDateFormatted = Carbon::parse($entry->due_date)->translatedFormat('d F Y');

        $message = "⚠️ *PENGINGAT KEWAJIBAN KAS ({$urgencyLabel})*\n" .
            "Rumah Kita Network\n\n" .
            "📌 *Kewajiban:* {$entry->title}\n" .
            "📅 *Jatuh Tempo:* {$dueDateFormatted} (" . ($daysLeft <= 0 ? "Hari Ini" : "{$daysLeft} hari lagi") . ")\n" .
            "💵 *Nominal Tagihan:* *Rp " . number_format($obligationAmount, 0, ',', '.') . "*\n" .
            "🏷️ *Kategori:* " . strtoupper((string) ($entry->category ?: 'Operasional')) . "\n";

        if (!empty($entry->notes)) {
            $message .= "📝 *Catatan:* {$entry->notes}\n";
        }

        $message .= "\n📊 *ANALISA KESIAPAN KAS:*\n" .
            "• Saldo Kas Berjalan: Rp " . number_format($currentBalance, 0, ',', '.') . "\n";

        if ($gap >= 0) {
            $message .= "• Status Kas: *CUKUP & AMAN* (+Rp " . number_format($gap, 0, ',', '.') . ")\n";
        } else {
            $shortfall = abs($gap);
            $message .= "• Status Kas: *KURANG Rp " . number_format($shortfall, 0, ',', '.') . "*\n";
        }

        $message .= "\n💡 *PROYEKSI & SARAN AI:*\n";

        if ($gap >= 0) {
            $message .= "Saldo kas saat ini mencukupi untuk melakukan pembayaran kewajiban ini tanpa mengganggu operasional harian.";
        } else {
            $potentialTotal = $currentBalance + $projectedCustomerInvoices;
            if ($potentialTotal >= $obligationAmount) {
                $message .= "Terdapat tagihan pelanggan senilai *Rp " . number_format($projectedCustomerInvoices, 0, ',', '.') . "* yang jatuh tempo sebelum tanggal pembayaran.\n" .
                    "Dengan rata-rata penerimaan kas Rp " . number_format($avgDailyIncome, 0, ',', '.') . "/hari, kas diproyeksikan *AMAN* menutup kekurangan sebelum jatuh tempo.";
            } else {
                $deficit = $obligationAmount - $potentialTotal;
                $message .= "⚠️ *PERHATIAN:* Saldo kas dan proyeksi tagihan masih berpotensi defisit sekitar *Rp " . number_format($deficit, 0, ',', '.') . "*.\n" .
                    "Disarankan untuk mendorong penagihan pelanggan tertunggak atau mengalokasikan cadangan kas.";
            }
        }

        $message .= "\n\n[Peringatan Dini Otomatis Finansial]";

        return $message;
    }
}

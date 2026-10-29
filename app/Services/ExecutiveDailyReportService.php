<?php

namespace App\Services;

use App\Models\Complaint;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\MasterMikrotik;
use App\Models\NotificationLog;
use App\Models\Pengeluaran;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ExecutiveDailyReportService
{
    public const SETTING_ENABLED = 'executive_daily_report_enabled';
    public const SETTING_RECIPIENTS = 'executive_report_recipients';
    public const SETTING_TIME = 'executive_daily_report_time';

    public function __construct(
        protected FinancialLedgerService $financialLedgerService,
        protected InternalAlertService $internalAlertService
    ) {}

    /**
     * Mengambil daftar nomor WhatsApp penerima laporan eksekutif.
     */
    public function getRecipients(): array
    {
        $raw = trim((string) SiteSetting::get(self::SETTING_RECIPIENTS, ''));

        if ($raw === '') {
            $fallback = trim((string) (SiteSetting::get('company_whatsapp') ?: SiteSetting::get('company_phone', '085158025553')));
            return $fallback !== '' ? [['phone' => $fallback, 'name' => 'Owner Rumah Kita Net']] : [];
        }

        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $recipients = [];
            foreach ($decoded as $item) {
                if (is_string($item) && trim($item) !== '') {
                    $recipients[] = ['phone' => trim($item), 'name' => 'Owner'];
                } elseif (is_array($item) && !empty($item['phone'])) {
                    $recipients[] = ['phone' => trim((string) $item['phone']), 'name' => trim((string) ($item['name'] ?? 'Owner'))];
                }
            }
            if (!empty($recipients)) {
                return $recipients;
            }
        }

        // Parsing comma-separated string: "08123456789, 08987654321"
        $numbers = array_filter(array_map('trim', explode(',', $raw)));
        $recipients = [];
        foreach ($numbers as $num) {
            if ($num !== '') {
                $recipients[] = ['phone' => $num, 'name' => 'Owner'];
            }
        }

        return $recipients;
    }

    /**
     * Mengumpulkan data agregasi operasional dan keuangan hari ini.
     */
    public function generateReportData(?Carbon $date = null): array
    {
        $targetDate = $date ? $date->copy()->startOfDay() : Carbon::today('Asia/Jakarta')->startOfDay();
        $dateStr = $targetDate->toDateString();

        // 1. Kas Masuk Hari Ini
        $incomeTrx = FinancialTransaction::query()
            ->where('type', 'income')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereDate('transaction_date', $dateStr)
            ->get();

        $totalIncome = (float) $incomeTrx->sum('amount');
        $incomeCount = $incomeTrx->count();

        // Rincian Pembayaran Invoice Hari Ini
        $invoicesPaidToday = Invoice::query()
            ->with(['receivedViaPaymentReceiptOption', 'receivedViaPaymentMethod'])
            ->where('status', 'paid')
            ->whereDate('paid_at', $dateStr)
            ->get();

        $qrisIncome = 0;
        $qrisCount = 0;
        $transferIncome = 0;
        $transferCount = 0;
        $cashIncome = 0;
        $cashCount = 0;

        foreach ($invoicesPaidToday as $inv) {
            $amt = (float) $inv->amount;
            $optName = strtolower((string) ($inv->receivedViaPaymentReceiptOption?->name ?? ''));
            $methodName = strtolower((string) ($inv->receivedViaPaymentMethod?->name ?? ''));
            $isQris = str_contains($optName, 'qris') || str_contains($methodName, 'qris') || !empty($inv->qris_payment_time);
            $isCash = str_contains($optName, 'tunai') || str_contains($optName, 'cash') || str_contains($methodName, 'cash');

            if ($isQris) {
                $qrisIncome += $amt;
                $qrisCount++;
            } elseif ($isCash) {
                $cashIncome += $amt;
                $cashCount++;
            } else {
                $transferIncome += $amt;
                $transferCount++;
            }
        }

        // Jika tidak ada data spesifik invoice tapi ada mutasi kas masuk
        if ($invoicesPaidToday->isEmpty() && $totalIncome > 0) {
            $transferIncome = $totalIncome;
            $transferCount = $incomeCount;
        }

        // 2. Kas Keluar Hari Ini
        $expenseTrx = FinancialTransaction::query()
            ->where('type', 'expense')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereDate('transaction_date', $dateStr)
            ->get();

        $totalExpense = (float) $expenseTrx->sum('amount');
        if ($totalExpense === 0.0 && Schema::hasTable('pengeluarans')) {
            $totalExpense = (float) Pengeluaran::query()->whereDate('tanggal', $dateStr)->sum('jumlah');
        }

        // Rincian kategori pengeluaran teratas hari ini
        $expenseHighlights = [];
        if ($expenseTrx->isNotEmpty()) {
            $expenseHighlights = $expenseTrx->take(2)->map(function ($exp) {
                return trim((string) ($exp->description ?: $exp->category ?: 'Operasional'));
            })->all();
        } elseif (Schema::hasTable('pengeluarans')) {
            $expenseHighlights = Pengeluaran::query()
                ->whereDate('tanggal', $dateStr)
                ->latest('id')
                ->take(2)
                ->pluck('kategori')
                ->all();
        }

        // 3. Saldo Kas Berjalan
        $ledgerSummary = $this->financialLedgerService->getSummaryAsOfDate($targetDate);
        $closingBalance = (float) ($ledgerSummary['balance'] ?? 0);

        // 4. Status Tagihan
        $unpaidInvoices = Invoice::query()
            ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
            ->whereDate('due_date', '<=', $targetDate->copy()->endOfMonth()->toDateString())
            ->get();

        $unpaidCount = $unpaidInvoices->count();
        $unpaidAmount = (float) $unpaidInvoices->sum('amount');

        // Pelanggan Terisolir Hari Ini
        $isolatedTodayCount = Customer::query()
            ->where('is_service_isolated', true)
            ->whereDate('service_isolated_at', $dateStr)
            ->count();

        // 5. Layanan & Komplain
        $complaintsToday = Complaint::query()->whereDate('opened_at', $dateStr)->count();
        $resolvedToday = Complaint::query()->whereDate('resolved_at', $dateStr)->count();
        $pendingComplaints = Complaint::query()->whereIn('status', ['pending', 'open', 'in_progress'])->count();

        // 6. Router & Jaringan
        $router = MasterMikrotik::query()->where('is_active', true)->first();
        $routerStatus = $router ? ($router->last_status ?: 'up') : 'up';
        $activeCustomersCount = Customer::query()->where('is_active', true)->count();
        $onlinePPPoECount = Customer::query()->where('is_active', true)->where('is_service_isolated', false)->count();

        return [
            'date' => $targetDate,
            'date_formatted' => $this->formatIndonesianDate($targetDate),
            'total_income' => $totalIncome,
            'income_count' => $incomeCount,
            'qris_income' => $qrisIncome,
            'qris_count' => $qrisCount,
            'transfer_income' => $transferIncome,
            'transfer_count' => $transferCount,
            'cash_income' => $cashIncome,
            'cash_count' => $cashCount,
            'total_expense' => $totalExpense,
            'expense_highlights' => $expenseHighlights,
            'closing_balance' => $closingBalance,
            'paid_today_count' => $invoicesPaidToday->count(),
            'unpaid_count' => $unpaidCount,
            'unpaid_amount' => $unpaidAmount,
            'isolated_today_count' => $isolatedTodayCount,
            'complaints_today' => $complaintsToday,
            'resolved_today' => $resolvedToday,
            'pending_complaints' => $pendingComplaints,
            'router_name' => $router?->name ?: 'MikroTik Utama',
            'router_status' => $routerStatus,
            'active_customers' => $activeCustomersCount,
            'online_pppoe' => $onlinePPPoECount,
        ];
    }

    /**
     * Menyusun format pesan WhatsApp Laporan Harian yang elegan dan terstruktur.
     */
    public function buildMessage(array $data): string
    {
        $dateFormatted = $data['date_formatted'];
        $incomeFormatted = 'Rp ' . number_format($data['total_income'], 0, ',', '.');
        $expenseFormatted = 'Rp ' . number_format($data['total_expense'], 0, ',', '.');
        $balanceFormatted = 'Rp ' . number_format($data['closing_balance'], 0, ',', '.');
        $unpaidFormatted = 'Rp ' . number_format($data['unpaid_amount'], 0, ',', '.');

        $expenseDesc = !empty($data['expense_highlights'])
            ? ' (' . implode(', ', array_slice($data['expense_highlights'], 0, 2)) . ')'
            : '';

        $message = "📊 *REKAP HARIAN RUMAH KITA NETWORK*\n" .
            "📅 {$dateFormatted} (Tutup Buku 21:00 WIB)\n\n" .
            "💰 *ARUS KAS HARI INI*\n" .
            "• Kas Masuk: *{$incomeFormatted}* ({$data['income_count']} trx)\n";

        if ($data['qris_count'] > 0) {
            $message .= "  - QRIS (Otomatis): Rp " . number_format($data['qris_income'], 0, ',', '.') . " ({$data['qris_count']} trx)\n";
        }
        if ($data['transfer_count'] > 0) {
            $message .= "  - Transfer Bank: Rp " . number_format($data['transfer_income'], 0, ',', '.') . " ({$data['transfer_count']} trx)\n";
        }
        if ($data['cash_count'] > 0) {
            $message .= "  - Tunai (Cash): Rp " . number_format($data['cash_income'], 0, ',', '.') . " ({$data['cash_count']} trx)\n";
        }

        $message .= "• Kas Keluar: {$expenseFormatted}{$expenseDesc}\n" .
            "• Saldo Kas Berjalan: *{$balanceFormatted}*\n\n" .
            "📄 *STATUS TAGIHAN*\n" .
            "• Invoice Lunas Hari Ini: {$data['paid_today_count']} tagihan\n" .
            "• Sisa Tagihan Belum Lunas: {$data['unpaid_count']} tagihan ({$unpaidFormatted})\n" .
            "• Terisolir Hari Ini: {$data['isolated_today_count']} pelanggan\n\n" .
            "🛠️ *KOMPLAIN & LAYANAN*\n" .
            "• Tiket Masuk Hari Ini: {$data['complaints_today']} tiket\n" .
            "• Tiket Selesai: {$data['resolved_today']} tiket\n" .
            "• Masih Menunggu (Pending): {$data['pending_complaints']} tiket\n\n" .
            "⚡ *JARINGAN & SERVER*\n" .
            "• Router {$data['router_name']}: " . (strtoupper($data['router_status']) === 'UP' ? "Normal (Online)" : "Peringatan (Cek Fisik)") . "\n" .
            "• Pelanggan Aktif: {$data['active_customers']} user ({$data['online_pppoe']} aktif online)\n\n" .
            "Semua sistem tercatat otomatis. Selamat beristirahat, Pak!\n\n" .
            "[Laporan Eksekutif Otomatis Sistem]";

        return $message;
    }

    /**
     * Mengirimkan laporan harian ke seluruh nomor WhatsApp Owner.
     */
    public function sendReport(?array $customRecipients = null, ?Carbon $date = null): array
    {
        $enabled = SiteSetting::get(self::SETTING_ENABLED, '1') !== '0';
        if (!$enabled && empty($customRecipients)) {
            return [
                'success' => false,
                'status' => 'disabled',
                'message' => 'Laporan harian eksekutif sedang dinonaktifkan di pengaturan.',
            ];
        }

        $recipients = $customRecipients ?: $this->getRecipients();
        if (empty($recipients)) {
            return [
                'success' => false,
                'status' => 'no_recipients',
                'message' => 'Belum ada nomor WhatsApp penerima laporan eksekutif yang dikonfigurasi.',
            ];
        }

        $data = $this->generateReportData($date);
        $message = $this->buildMessage($data);

        $this->internalAlertService->sendToRecipients(
            $recipients,
            $message,
            'executive_daily_report',
            [
                'report_date' => $data['date']->toDateString(),
                'total_income' => $data['total_income'],
                'total_expense' => $data['total_expense'],
                'closing_balance' => $data['closing_balance'],
            ],
            'Nomor WhatsApp Owner belum diisi.'
        );

        Log::info('ExecutiveDailyReport sent to owner', [
            'date' => $data['date']->toDateString(),
            'recipients_count' => count($recipients),
            'total_income' => $data['total_income'],
        ]);

        return [
            'success' => true,
            'status' => 'sent',
            'message' => 'Laporan harian eksekutif berhasil dikirimkan.',
            'recipients_count' => count($recipients),
            'preview' => $message,
        ];
    }

    protected function formatIndonesianDate(Carbon $date): string
    {
        $days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        $months = [
            1 => 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];

        $dayName = $days[$date->dayOfWeek];
        $monthName = $months[$date->month];

        return "{$dayName}, {$date->day} {$monthName} {$date->year}";
    }
}

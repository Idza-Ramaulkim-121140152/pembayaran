<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerTerminationRequest;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Pengeluaran;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class MonthlyFinancialReportService
{
    public const SETTING_ENABLED = 'monthly_pnl_report_enabled';

    public function __construct(
        protected InternalAlertService $internalAlertService,
        protected ExecutiveDailyReportService $executiveDailyReportService
    ) {}

    /**
     * Mengumpulkan data Laba-Rugi dan Kinerja Operasional Bulanan.
     */
    public function generateMonthlyReportData(?int $year = null, ?int $month = null): array
    {
        $now = Carbon::now('Asia/Jakarta');
        // Default: bulan sebelumnya jika dijalankan di awal bulan (tanggal 1-5)
        if ($year === null || $month === null) {
            $target = $now->day <= 5 ? $now->copy()->subMonth() : $now->copy();
            $year = (int) $target->year;
            $month = (int) $target->month;
        }

        $startDate = Carbon::create($year, $month, 1, 0, 0, 0, 'Asia/Jakarta')->startOfDay();
        $endDate = $startDate->copy()->endOfMonth()->endOfDay();
        $startStr = $startDate->toDateString();
        $endStr = $endDate->toDateString();

        // 1. PENDAPATAN (REVENUE)
        $paidInvoices = Invoice::query()
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$startDate, $endDate])
            ->get();

        $invoiceRevenue = (float) $paidInvoices->sum('amount');
        $paidInvoicesCount = $paidInvoices->count();

        // Total transaksi income dari buku kas
        $ledgerIncome = (float) FinancialTransaction::query()
            ->where('type', 'income')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereBetween('transaction_date', [$startStr, $endStr])
            ->sum('amount');

        $grossRevenue = max($invoiceRevenue, $ledgerIncome);

        // Tagihan yang belum lunas untuk periode bulan tersebut
        $unpaidInvoices = Invoice::query()
            ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
            ->whereBetween('due_date', [$startStr, $endStr])
            ->get();

        $unpaidCount = $unpaidInvoices->count();
        $unpaidAmount = (float) $unpaidInvoices->sum('amount');

        // Tingkat Kepatuhan Bayar (Collection Rate)
        $totalBilledInvoices = $paidInvoicesCount + $unpaidCount;
        $collectionRate = $totalBilledInvoices > 0
            ? round(($paidInvoicesCount / $totalBilledInvoices) * 100, 1)
            : 100.0;

        // 2. PENGELUARAN (OPEX)
        $expenseTransactions = FinancialTransaction::query()
            ->where('type', 'expense')
            ->where('status', FinancialTransaction::STATUS_CONFIRMED)
            ->whereBetween('transaction_date', [$startStr, $endStr])
            ->get();

        $totalOpex = (float) $expenseTransactions->sum('amount');

        // Jika transaksi kas kosong, gunakan tabel pengeluarans
        $pengeluarans = collect();
        if ($totalOpex === 0.0 && Schema::hasTable('pengeluarans')) {
            $pengeluarans = Pengeluaran::query()
                ->whereBetween('tanggal', [$startStr, $endStr])
                ->get();
            $totalOpex = (float) $pengeluarans->sum('jumlah');
        }

        // Kategorisasi Pengeluaran ISP
        $catUpstream = 0.0;
        $catPayroll = 0.0;
        $catMaterial = 0.0;
        $catOperational = 0.0;

        $itemsToClassify = $expenseTransactions->isNotEmpty() ? $expenseTransactions : $pengeluarans;

        foreach ($itemsToClassify as $item) {
            $amt = (float) ($item->amount ?? $item->jumlah ?? 0);
            $desc = strtolower((string) ($item->description ?? $item->kategori ?? $item->detail ?? ''));

            if (str_contains($desc, 'upstream') || str_contains($desc, 'bandwidth') || str_contains($desc, 'astinet') || str_contains($desc, 'provider')) {
                $catUpstream += $amt;
            } elseif (str_contains($desc, 'gaji') || str_contains($desc, 'payroll') || str_contains($desc, 'upah') || str_contains($desc, 'insentif')) {
                $catPayroll += $amt;
            } elseif (str_contains($desc, 'kabel') || str_contains($desc, 'dropcore') || str_contains($desc, 'connector') || str_contains($desc, 'ont') || str_contains($desc, 'modem') || str_contains($desc, 'odp') || str_contains($desc, 'material')) {
                $catMaterial += $amt;
            } else {
                $catOperational += $amt;
            }
        }

        // 3. LABA BERSIH & MARGIN
        $netProfit = $grossRevenue - $totalOpex;
        $profitMargin = $grossRevenue > 0 ? round(($netProfit / $grossRevenue) * 100, 1) : 0.0;

        // 4. METRIK PELANGGAN
        $newCustomersCount = Customer::query()
            ->whereBetween('created_at', [$startDate, $endDate])
            ->count();

        $terminatedCount = 0;
        if (Schema::hasTable('customer_termination_requests')) {
            $terminatedCount = CustomerTerminationRequest::query()
                ->where('status', 'approved')
                ->whereBetween('updated_at', [$startDate, $endDate])
                ->count();
        }

        $totalActiveCustomers = Customer::query()->where('is_active', true)->count();

        return [
            'year' => $year,
            'month' => $month,
            'month_name' => $this->monthName($month),
            'start_date' => $startStr,
            'end_date' => $endStr,
            'gross_revenue' => $grossRevenue,
            'paid_invoices_count' => $paidInvoicesCount,
            'unpaid_count' => $unpaidCount,
            'unpaid_amount' => $unpaidAmount,
            'collection_rate' => $collectionRate,
            'total_opex' => $totalOpex,
            'cat_upstream' => $catUpstream,
            'cat_payroll' => $catPayroll,
            'cat_material' => $catMaterial,
            'cat_operational' => $catOperational,
            'net_profit' => $netProfit,
            'profit_margin' => $profitMargin,
            'new_customers' => $newCustomersCount,
            'terminated_customers' => $terminatedCount,
            'total_active_customers' => $totalActiveCustomers,
        ];
    }

    /**
     * Menyusun format pesan WhatsApp Laporan Tutup Buku Bulanan.
     */
    public function buildMessage(array $data): string
    {
        $revenueFormatted = 'Rp ' . number_format($data['gross_revenue'], 0, ',', '.');
        $opexFormatted = 'Rp ' . number_format($data['total_opex'], 0, ',', '.');
        $profitFormatted = 'Rp ' . number_format(abs($data['net_profit']), 0, ',', '.');
        $profitPrefix = $data['net_profit'] >= 0 ? '' : '- ';

        $message = "📑 *LAPORAN KEUANGAN & LABA RUGI BULANAN*\n" .
            "Periode: *{$data['month_name']} {$data['year']}*\n" .
            "Rumah Kita Network\n\n" .
            "📈 *PENDAPATAN KOTOR (REVENUE):*\n" .
            "• Iuran Tagihan Lunas: *{$revenueFormatted}* ({$data['paid_invoices_count']} pelanggan)\n";

        if ($data['unpaid_count'] > 0) {
            $message .= "• Tertunggak/Pending: Rp " . number_format($data['unpaid_amount'], 0, ',', '.') . " ({$data['unpaid_count']} tagihan)\n";
        }

        $message .= "• *Total Pendapatan:* *{$revenueFormatted}*\n\n" .
            "📉 *PENGELUARAN OPERASIONAL (OPEX):*\n";

        if ($data['cat_upstream'] > 0) {
            $message .= "• Sewa Bandwidth Upstream: Rp " . number_format($data['cat_upstream'], 0, ',', '.') . "\n";
        }
        if ($data['cat_payroll'] > 0) {
            $message .= "• Gaji & Upah Tim: Rp " . number_format($data['cat_payroll'], 0, ',', '.') . "\n";
        }
        if ($data['cat_material'] > 0) {
            $message .= "• Belanja Material & Dropcore: Rp " . number_format($data['cat_material'], 0, ',', '.') . "\n";
        }
        if ($data['cat_operational'] > 0 || $data['total_opex'] === 0.0) {
            $message .= "• Listrik & Operasional Kantor: Rp " . number_format($data['cat_operational'], 0, ',', '.') . "\n";
        }

        $message .= "• *Total Pengeluaran:* *{$opexFormatted}*\n\n" .
            "━━━━━━━━━━━━━━━━━━━\n" .
            "💵 *LABA BERSIH (NET PROFIT):*\n" .
            "👉 *{$profitPrefix}{$profitFormatted}* (Margin: {$data['profit_margin']}%)\n" .
            "━━━━━━━━━━━━━━━━━━━\n\n" .
            "📊 *METRIK PERTUMBUHAN & PENAGIHAN:*\n" .
            "• Total Pelanggan Aktif: {$data['total_active_customers']} user\n" .
            "• Pasang Baru Bulan Ini: +{$data['new_customers']} pelanggan\n" .
            "• Berhenti Berlangganan: -{$data['terminated_customers']} pelanggan\n" .
            "• Rasio Sukses Penagihan: *{$data['collection_rate']}%*\n\n" .
            "Laporan pembukuan bulanan selesai secara otomatis.\n\n" .
            "[Laporan Eksekutif Bulanan Otomatis]";

        return $message;
    }

    /**
     * Mengirimkan laporan tutup buku bulanan ke WhatsApp Owner.
     */
    public function sendReport(?array $customRecipients = null, ?int $year = null, ?int $month = null): array
    {
        $enabled = SiteSetting::get(self::SETTING_ENABLED, '1') !== '0';
        if (!$enabled && empty($customRecipients)) {
            return [
                'success' => false,
                'status' => 'disabled',
                'message' => 'Laporan bulanan eksekutif sedang dinonaktifkan di pengaturan.',
            ];
        }

        $recipients = $customRecipients ?: $this->executiveDailyReportService->getRecipients();
        if (empty($recipients)) {
            return [
                'success' => false,
                'status' => 'no_recipients',
                'message' => 'Belum ada nomor WhatsApp penerima laporan eksekutif yang dikonfigurasi.',
            ];
        }

        $data = $this->generateMonthlyReportData($year, $month);
        $message = $this->buildMessage($data);

        $this->internalAlertService->sendToRecipients(
            $recipients,
            $message,
            'executive_monthly_pnl_report',
            [
                'period' => "{$data['year']}-" . str_pad((string) $data['month'], 2, '0', STR_PAD_LEFT),
                'gross_revenue' => $data['gross_revenue'],
                'total_opex' => $data['total_opex'],
                'net_profit' => $data['net_profit'],
                'profit_margin' => $data['profit_margin'],
            ],
            'Nomor WhatsApp Owner belum diisi.'
        );

        Log::info('MonthlyFinancialReport sent to owner', [
            'period' => "{$data['year']}-{$data['month']}",
            'recipients_count' => count($recipients),
            'net_profit' => $data['net_profit'],
        ]);

        return [
            'success' => true,
            'status' => 'sent',
            'message' => 'Laporan tutup buku bulanan berhasil dikirimkan.',
            'recipients_count' => count($recipients),
            'preview' => $message,
        ];
    }

    protected function monthName(int $month): string
    {
        $months = [
            1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April',
            5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus',
            9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember'
        ];

        return $months[$month] ?? 'Bulan ' . $month;
    }
}

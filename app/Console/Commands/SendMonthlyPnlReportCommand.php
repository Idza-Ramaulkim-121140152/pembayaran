<?php

namespace App\Console\Commands;

use App\Services\MonthlyFinancialReportService;
use Illuminate\Console\Command;

class SendMonthlyPnlReportCommand extends Command
{
    protected $signature = 'finance:send-monthly-pnl 
                            {--year= : Tahun laporan (contoh: 2026)}
                            {--month= : Bulan laporan 1-12 (contoh: 10)}
                            {--dry-run : Hanya tampilkan pratinjau pesan tanpa mengirim WhatsApp}
                            {--test-phone= : Kirim hanya ke nomor WhatsApp pengujian ini}';

    protected $description = 'Kirim laporan tutup buku laba-rugi bulanan ke WhatsApp Owner.';

    public function handle(MonthlyFinancialReportService $reportService): int
    {
        $year = $this->option('year') !== null ? (int) $this->option('year') : null;
        $month = $this->option('month') !== null ? (int) $this->option('month') : null;
        $dryRun = (bool) $this->option('dry-run');
        $testPhone = trim((string) $this->option('test-phone'));

        if ($dryRun) {
            $data = $reportService->generateMonthlyReportData($year, $month);
            $message = $reportService->buildMessage($data);

            $this->info("=== PRATINJAU LAPORAN LABA RUGI BULANAN (DRY-RUN) ===");
            $this->line($message);
            $this->info("=====================================================");
            return self::SUCCESS;
        }

        $customRecipients = null;
        if ($testPhone !== '') {
            $customRecipients = [['phone' => $testPhone, 'name' => 'Test Recipient']];
            $this->info("Mengirim laporan bulanan uji coba ke nomor: {$testPhone}...");
        } else {
            $this->info("Mengirim laporan bulanan laba-rugi ke WhatsApp Owner yang terdaftar...");
        }

        $result = $reportService->sendReport($customRecipients, $year, $month);

        if ($result['success']) {
            $this->info("✅ {$result['message']} (Penerima: {$result['recipients_count']})");
            return self::SUCCESS;
        }

        $this->warn("⚠️ {$result['message']}");
        return self::FAILURE;
    }
}

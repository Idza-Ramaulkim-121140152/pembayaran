<?php

namespace App\Console\Commands;

use App\Services\ExecutiveDailyReportService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendExecutiveDailyReportCommand extends Command
{
    protected $signature = 'executive:send-daily-report 
                            {--date= : Tanggal laporan dengan format YYYY-MM-DD}
                            {--dry-run : Hanya tampilkan pratinjau pesan tanpa mengirim WhatsApp}
                            {--test-phone= : Kirim hanya ke nomor WhatsApp pengujian ini}';

    protected $description = 'Kirim laporan tutup buku harian dan status jaringan ISP ke WhatsApp Owner.';

    public function handle(ExecutiveDailyReportService $reportService): int
    {
        $dateOption = trim((string) $this->option('date'));
        $targetDate = null;

        if ($dateOption !== '') {
            try {
                $targetDate = Carbon::parse($dateOption)->startOfDay();
            } catch (\Throwable $e) {
                $this->error('Format --date tidak valid. Gunakan format YYYY-MM-DD.');
                return self::FAILURE;
            }
        }

        $dryRun = (bool) $this->option('dry-run');
        $testPhone = trim((string) $this->option('test-phone'));

        if ($dryRun) {
            $data = $reportService->generateReportData($targetDate);
            $message = $reportService->buildMessage($data);

            $this->info("=== PRATINJAU LAPORAN HARIAN EKSEKUTIF (DRY-RUN) ===");
            $this->line($message);
            $this->info("=====================================================");
            return self::SUCCESS;
        }

        $customRecipients = null;
        if ($testPhone !== '') {
            $customRecipients = [['phone' => $testPhone, 'name' => 'Test Recipient']];
            $this->info("Mengirim laporan uji coba ke nomor: {$testPhone}...");
        } else {
            $this->info("Mengirim laporan harian eksekutif ke nomor Owner yang terdaftar...");
        }

        $result = $reportService->sendReport($customRecipients, $targetDate);

        if ($result['success']) {
            $this->info("✅ {$result['message']} (Penerima: {$result['recipients_count']})");
            return self::SUCCESS;
        }

        $this->warn("⚠️ {$result['message']}");
        return self::FAILURE;
    }
}

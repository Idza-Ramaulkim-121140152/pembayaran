<?php

namespace App\Console\Commands;

use App\Services\CashObligationAlertService;
use Illuminate\Console\Command;

class SendCashObligationAlertCommand extends Command
{
    protected $signature = 'finance:send-obligation-alert 
                            {--dry-run : Hanya tampilkan pratinjau pesan tanpa mengirim WhatsApp}
                            {--test-phone= : Kirim hanya ke nomor WhatsApp pengujian ini}';

    protected $description = 'Kirim peringatan dini jatuh tempo kewajiban kas & sewa upstream (H-3 dan H-1) ke WhatsApp Owner.';

    public function handle(CashObligationAlertService $alertService): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $testPhone = trim((string) $this->option('test-phone'));

        $customRecipients = null;
        if ($testPhone !== '') {
            $customRecipients = [['phone' => $testPhone, 'name' => 'Test Recipient']];
            $this->info("Mengirim alert uji coba ke nomor: {$testPhone}...");
        }

        if ($dryRun) {
            $this->info("Menjalankan pengecekan kewajiban kas (DRY-RUN)...");
        } else {
            $this->info("Menjalankan pengecekan kewajiban kas dan mengirim alert ke WhatsApp Owner...");
        }

        $result = $alertService->checkAndSendAlerts($customRecipients);

        if ($dryRun && !empty($result['previews'])) {
            $this->info("=== PRATINJAU ALERT KEWAJIBAN KAS (DRY-RUN) ===");
            foreach ($result['previews'] as $idx => $preview) {
                $num = $idx + 1;
                $this->line("--- Alert #{$num} ---");
                $this->line($preview);
            }
            $this->info("================================================");
            return self::SUCCESS;
        }

        if ($result['success']) {
            $this->info("✅ {$result['message']}");
            return self::SUCCESS;
        }

        $this->warn("⚠️ {$result['message']}");
        return self::FAILURE;
    }
}

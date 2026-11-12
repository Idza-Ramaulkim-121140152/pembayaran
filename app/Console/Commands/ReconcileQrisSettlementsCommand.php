<?php

namespace App\Console\Commands;

use App\Services\QrisSettlementReconciliationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class ReconcileQrisSettlementsCommand extends Command
{
    protected $signature = 'qris:reconcile-settlements
                            {--date= : Tanggal siklus YYYY-MM-DD (default hari ini Asia/Jakarta)}
                            {--force : Evaluasi sebagai final dan kirim alert WhatsApp jika tidak sesuai tanpa menunggu jam cek}
                            {--dry-run : Hanya tampilkan hasil rekonsiliasi tanpa mengirim WhatsApp}';

    protected $description = 'Mencocokkan pendapatan QRIS mutasi keuangan terhadap pencairan dana GoPay Merchant dan mengirim alert WhatsApp bila tidak sesuai.';

    public function handle(QrisSettlementReconciliationService $reconciliationService): int
    {
        $dateOption = trim((string) $this->option('date'));
        $cycleDate = null;

        if ($dateOption !== '') {
            try {
                $cycleDate = Carbon::parse($dateOption, QrisSettlementReconciliationService::TZ)->toDateString();
            } catch (\Throwable) {
                $this->error('Format --date tidak valid. Gunakan format YYYY-MM-DD.');
                return self::FAILURE;
            }
        }

        $force = (bool) $this->option('force');
        $dryRun = (bool) $this->option('dry-run');

        $result = $reconciliationService->evaluateScheduledReconciliations($cycleDate, $force, $dryRun);

        if (($result['status'] ?? '') === 'disabled') {
            $this->info('Rekonsiliasi QRIS otomatis sedang dinonaktifkan.');
            return self::SUCCESS;
        }

        if (($result['status'] ?? '') === 'not_ready') {
            $this->warn('Tabel rekonsiliasi QRIS belum tersedia.');
            return self::SUCCESS;
        }

        foreach ($result['records'] ?? [] as $record) {
            $d = Carbon::parse($record->cycle_date)->toDateString();
            $this->line(sprintf(
                '[%s] Status: %s | QRIS Mutasi: Rp %s (%d trx) | Ekspektasi Bersih: Rp %s | Pencairan GoPay: Rp %s (%d trx) | Selisih: Rp %s',
                $d,
                strtoupper((string) $record->status),
                number_format((float) $record->system_qris_gross_amount, 0, ',', '.'),
                (int) $record->system_qris_count,
                number_format((float) $record->expected_net_amount, 0, ',', '.'),
                number_format((float) $record->settled_amount, 0, ',', '.'),
                (int) $record->settlement_count,
                number_format((float) $record->discrepancy_amount, 0, ',', '.')
            ));

            if ($dryRun && $record->status === 'mismatch') {
                $this->line('--- PRATINJAU PESAN WHATSAPP ---');
                $this->line($reconciliationService->buildMismatchAlertMessage($record));
                $this->line('--------------------------------');
            }
        }

        return self::SUCCESS;
    }
}

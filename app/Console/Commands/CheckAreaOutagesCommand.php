<?php

namespace App\Console\Commands;

use App\Services\AreaOutageMonitorService;
use Illuminate\Console\Command;

class CheckAreaOutagesCommand extends Command
{
    protected $signature = 'network:check-area-outages {--force : Abaikan jeda cooldown saat scan}';

    protected $description = 'Scan pelanggan PPPoE per area/dusun untuk mendeteksi gangguan massal (>=50% offline) dan kirim notifikasi ke grup WhatsApp.';

    public function handle(): int
    {
        $force = (bool) $this->option('force');
        $this->info('Memulai pengecekan gangguan area PPPoE' . ($force ? ' (mode force)...' : '...'));

        try {
            $service = app(AreaOutageMonitorService::class);
            $result = $service->scanAreaOutages($force);

            if (($result['status'] ?? '') === 'error') {
                $this->error('Gagal scan: ' . ($result['message'] ?? 'Unknown error'));
                return self::FAILURE;
            }

            if (($result['status'] ?? '') === 'disabled') {
                $this->warn('Scan dilewati: ' . ($result['message'] ?? 'Fitur dinonaktifkan'));
                return self::SUCCESS;
            }

            $this->info(sprintf(
                'Scan selesai: Total area: %d, Area mengalami gangguan: %d, Alert terkirim: %d',
                $result['total_areas'] ?? 0,
                $result['outages_detected'] ?? 0,
                $result['alerts_sent'] ?? 0
            ));

            if (!empty($result['details'])) {
                foreach ($result['details'] as $detail) {
                    $status = $detail['alert_sent'] ? '[ALERT DIKIRIM]' : (!empty($detail['skipped_reason']) ? '[' . $detail['skipped_reason'] . ']' : '[OK]');
                    $this->line(sprintf(
                        ' - Area %s: %d/%d offline (%.1f%%) %s',
                        $detail['area_code'],
                        $detail['inactive'],
                        $detail['total'],
                        $detail['inactive_pct'],
                        $status
                    ));
                }
            }

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Terjadi kesalahan: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}


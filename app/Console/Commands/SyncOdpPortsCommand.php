<?php

namespace App\Console\Commands;

use App\Models\Odp;
use App\Services\OdpPortService;
use Illuminate\Console\Command;

class SyncOdpPortsCommand extends Command
{
    protected $signature = 'odp:sync-ports {odp_id? : Optional ID or Name of a specific ODP}';

    protected $description = 'Harmonize and auto-allocate unassigned customers into free ODP ports';

    public function handle(OdpPortService $odpPortService): int
    {
        $target = $this->argument('odp_id');

        if ($target) {
            $odp = is_numeric($target)
                ? Odp::find($target)
                : Odp::where('nama', $target)->first();

            if (!$odp) {
                $this->error("ODP [{$target}] tidak ditemukan.");
                return self::FAILURE;
            }

            $this->info("Menyelaraskan port untuk ODP: {$odp->nama} (ID: {$odp->id})...");
            $result = $odpPortService->autoAssignOdpPorts($odp);

            $this->table(
                ['ODP', 'Kapasitas', 'Terisi', 'Sisa Bebas', 'Berhasil Ditautkan', 'Gagal (Penuh)'],
                [[
                    $result['odp_name'],
                    $result['capacity'],
                    $result['occupied_count'],
                    $result['free_count'],
                    $result['assigned_count'],
                    $result['failed_count'],
                ]]
            );

            if (!empty($result['assigned'])) {
                $this->info("Daftar pelanggan yang berhasil ditautkan ke port:");
                foreach ($result['assigned'] as $item) {
                    $this->line("  ✓ Port #{$item['port_number']}: {$item['name']} ({$item['pppoe_username']})");
                }
            }

            return self::SUCCESS;
        }

        $this->info("Memulai penyelarasan otomatis seluruh port ODP di jaringan...");
        $result = $odpPortService->autoAssignAllOdpPorts();

        $this->info("Selesai! ODP diproses: {$result['total_odps_processed']}, Berhasil dialokasikan ke port: {$result['total_assigned']}, Gagal: {$result['total_failed']}");

        if (!empty($result['details'])) {
            $rows = [];
            foreach ($result['details'] as $d) {
                $rows[] = [
                    $d['odp_name'],
                    $d['capacity'],
                    $d['occupied_count'],
                    $d['assigned_count'],
                    $d['failed_count'],
                ];
            }
            $this->table(['ODP', 'Kapasitas', 'Terisi', 'Baru Dimapping', 'Gagal/Penuh'], $rows);
        }

        return self::SUCCESS;
    }
}

<?php

namespace App\Console\Commands;

use App\Models\FinancialBalanceSnapshot;
use App\Services\FinancialLedgerService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

class CaptureFinancialBalanceSnapshot extends Command
{
    protected $signature = 'finance:snapshot-balance {--date=}';

    protected $description = 'Capture or update daily financial balance snapshot';

    public function handle(FinancialLedgerService $ledgerService): int
    {
        if (!Schema::hasTable('financial_balance_snapshots')) {
            $this->error('Tabel financial_balance_snapshots belum tersedia. Jalankan migrasi terlebih dahulu.');
            return self::FAILURE;
        }

        $dateOption = trim((string) $this->option('date'));
        $snapshotDate = Carbon::today()->startOfDay();

        if ($dateOption !== '') {
            try {
                $snapshotDate = Carbon::parse($dateOption)->startOfDay();
            } catch (\Throwable $e) {
                $this->error('Format --date tidak valid. Gunakan format YYYY-MM-DD.');
                return self::FAILURE;
            }
        }

        $summary = $ledgerService->getSummaryAsOfDate($snapshotDate);
        $timestamp = now();

        FinancialBalanceSnapshot::query()->updateOrCreate(
            ['snapshot_date' => $snapshotDate->toDateString()],
            [
                'closing_balance' => (float) ($summary['balance'] ?? 0),
                'total_income' => (float) ($summary['total_income'] ?? 0),
                'total_expense' => (float) ($summary['total_expense'] ?? 0),
                'total_adjustment' => (float) ($summary['adjustment_net'] ?? 0),
                'captured_at' => $timestamp,
                'meta' => [
                    'source' => 'ledger_as_of_date',
                    'timezone' => 'Asia/Jakarta',
                    'captured_at_iso' => $timestamp->toIso8601String(),
                ],
            ]
        );

        $this->info('Snapshot saldo berhasil disimpan untuk tanggal ' . $snapshotDate->toDateString() . '.');

        return self::SUCCESS;
    }
}

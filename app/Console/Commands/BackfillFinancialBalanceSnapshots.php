<?php

namespace App\Console\Commands;

use App\Models\FinancialBalanceSnapshot;
use App\Services\FinancialLedgerService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

class BackfillFinancialBalanceSnapshots extends Command
{
    protected $signature = 'finance:snapshot-backfill {--days=90}';

    protected $description = 'Backfill daily financial balance snapshots for past dates';

    public function handle(FinancialLedgerService $ledgerService): int
    {
        if (!Schema::hasTable('financial_balance_snapshots')) {
            $this->error('Tabel financial_balance_snapshots belum tersedia. Jalankan migrasi terlebih dahulu.');
            return self::FAILURE;
        }

        $days = (int) $this->option('days');
        if ($days < 1) {
            $this->error('Nilai --days minimal 1.');
            return self::FAILURE;
        }

        $today = Carbon::today()->startOfDay();
        $startDate = $today->copy()->subDays($days - 1);
        $timestamp = now();
        $saved = 0;

        for ($cursor = $startDate->copy(); $cursor->lte($today); $cursor->addDay()) {
            $summary = $ledgerService->getSummaryAsOfDate($cursor);

            FinancialBalanceSnapshot::query()->updateOrCreate(
                ['snapshot_date' => $cursor->toDateString()],
                [
                    'closing_balance' => (float) ($summary['balance'] ?? 0),
                    'total_income' => (float) ($summary['total_income'] ?? 0),
                    'total_expense' => (float) ($summary['total_expense'] ?? 0),
                    'total_adjustment' => (float) ($summary['adjustment_net'] ?? 0),
                    'captured_at' => $timestamp,
                    'meta' => [
                        'source' => 'ledger_as_of_date',
                        'timezone' => 'Asia/Jakarta',
                        'backfill_days' => $days,
                        'captured_at_iso' => $timestamp->toIso8601String(),
                    ],
                ]
            );

            $saved++;
        }

        $this->info("Backfill snapshot selesai: {$saved} hari ({$startDate->toDateString()} s.d. {$today->toDateString()}).");

        return self::SUCCESS;
    }
}

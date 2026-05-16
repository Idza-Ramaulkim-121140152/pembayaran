<?php

namespace App\Console\Commands;

use App\Models\FinancialTransaction;
use App\Services\DashboardPredictionPythonWorker;
use Carbon\Carbon;
use Illuminate\Console\Command;

class TrainDashboardPredictionModel extends Command
{
    protected $signature = 'dashboard:prediction-train';

    protected $description = 'Train dashboard prediction ML model (daily)';

    public function __construct(
        private DashboardPredictionPythonWorker $pythonWorker,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $payload = [
            'generated_at' => now()->toIso8601String(),
            'daily_finance_history' => $this->buildDailyFinanceHistory(180),
        ];

        $result = $this->pythonWorker->train($payload);
        if (!$result['ok']) {
            $this->error('Training model gagal: ' . ($result['error'] ?? 'unknown_error'));
            return self::FAILURE;
        }

        $meta = (array) ($result['data']['model_meta'] ?? []);
        $this->info('Training model sukses. Version: ' . (string) ($meta['model_version'] ?? 'xgboost-lag-v2'));
        if (!empty($meta['metrics'])) {
            $this->line('Metrics: ' . json_encode($meta['metrics']));
        }

        return self::SUCCESS;
    }

    private function buildDailyFinanceHistory(int $days = 180): array
    {
        $start = Carbon::today()->subDays(max($days - 1, 1))->toDateString();

        $rows = FinancialTransaction::query()
            ->selectRaw('transaction_date, SUM(CASE WHEN type = "income" THEN amount ELSE 0 END) as income_total, SUM(CASE WHEN type = "expense" THEN amount ELSE 0 END) as expense_total, SUM(CASE WHEN type = "adjustment" THEN amount ELSE 0 END) as adjustment_total')
            ->whereDate('transaction_date', '>=', $start)
            ->groupBy('transaction_date')
            ->orderBy('transaction_date')
            ->get();

        return $rows->map(fn ($row) => [
            'date' => (string) $row->transaction_date,
            'income' => (float) ($row->income_total ?? 0),
            'expense' => (float) ($row->expense_total ?? 0),
            'adjustment' => (float) ($row->adjustment_total ?? 0),
            'net' => (float) (($row->income_total ?? 0) - ($row->expense_total ?? 0) + ($row->adjustment_total ?? 0)),
        ])->values()->all();
    }
}


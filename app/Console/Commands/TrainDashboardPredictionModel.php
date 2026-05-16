<?php

namespace App\Console\Commands;

use App\Models\FinancialTransaction;
use App\Services\DashboardPredictionPythonWorker;
use Carbon\Carbon;
use Illuminate\Console\Command;

class TrainDashboardPredictionModel extends Command
{
    protected $signature = 'dashboard:prediction-train';

    protected $description = 'Train dashboard prediction ML model (hourly series)';

    public function __construct(
        private DashboardPredictionPythonWorker $pythonWorker,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $payload = [
            'generated_at' => now()->toIso8601String(),
            'hourly_revenue_history' => $this->buildHourlyRevenueHistory(90),
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

    private function buildHourlyRevenueHistory(int $days = 90): array
    {
        $start = Carbon::now()->subDays(max($days, 2))->startOfHour();
        $end = Carbon::now()->startOfHour();

        $rows = FinancialTransaction::query()
            ->selectRaw('DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00") as ts_hour, SUM(CASE WHEN type = "income" THEN amount ELSE 0 END) as income_total, SUM(CASE WHEN type = "expense" THEN amount ELSE 0 END) as expense_total, SUM(CASE WHEN type = "adjustment" THEN amount ELSE 0 END) as adjustment_total')
            ->whereBetween('created_at', [$start, $end->copy()->addHour()])
            ->groupBy('ts_hour')
            ->orderBy('ts_hour')
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $map[(string) $row->ts_hour] = [
                'revenue' => max(0.0, (float) ($row->income_total ?? 0)),
                'expense' => max(0.0, (float) ($row->expense_total ?? 0)),
                'adjustment' => (float) ($row->adjustment_total ?? 0),
            ];
        }

        $result = [];
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $hourKey = $cursor->format('Y-m-d H:00:00');
            $item = $map[$hourKey] ?? ['revenue' => 0.0, 'expense' => 0.0, 'adjustment' => 0.0];
            $result[] = [
                'ts' => $hourKey,
                'revenue' => (float) ($item['revenue'] ?? 0),
                'expense' => (float) ($item['expense'] ?? 0),
                'adjustment' => (float) ($item['adjustment'] ?? 0),
                'complaint_count' => 0,
                'incident_count' => 0,
            ];
            $cursor->addHour();
        }

        return $result;
    }
}

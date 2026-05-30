<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\PredictionRun;
use App\Models\PredictionRunEvaluation;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class EvaluateDashboardPredictionRuns extends Command
{
    protected $signature = 'dashboard:prediction-evaluate';

    protected $description = 'Evaluate 7-day prediction baseline and retrain model';

    public function handle(): int
    {
        $today = Carbon::today('Asia/Jakarta');
        $runs = PredictionRun::query()
            ->where('horizon_days', 7)
            ->whereDate('run_date', '<=', $today->copy()->subDays(7)->toDateString())
            ->where(function ($query) {
                $query->whereNull('evaluated_at')
                    ->orWhere('status', 'ready');
            })
            ->orderBy('run_date')
            ->get();

        foreach ($runs as $run) {
            $this->evaluateRun($run);
        }

        $this->info('Evaluasi prediction run selesai. Total run diproses: ' . $runs->count());
        return self::SUCCESS;
    }

    private function evaluateRun(PredictionRun $run): void
    {
        DB::transaction(function () use ($run) {
            $fresh = PredictionRun::query()->lockForUpdate()->find($run->id);
            if (!$fresh || $fresh->evaluated_at !== null) {
                return;
            }

            $items = $fresh->items()
                ->where('domain', 'revenue_daily')
                ->orderBy('target_date')
                ->get();

            if ($items->count() === 0) {
                return;
            }

            $absPctErrors = [];
            $periodStart = null;
            $periodEnd = null;

            foreach ($items as $item) {
                $date = Carbon::parse($item->target_date)->toDateString();
                $actual = (float) Invoice::query()
                    ->where('status', 'paid')
                    ->whereDate('paid_at', $date)
                    ->sum('amount');

                $predicted = (float) ($item->predicted_value ?? 0);
                $denominator = max(abs($actual), 1.0);
                $absPctErrors[] = abs($actual - $predicted) / $denominator;

                $item->update([
                    'actual_value' => $actual,
                ]);

                $periodStart = $periodStart === null ? $date : min($periodStart, $date);
                $periodEnd = $periodEnd === null ? $date : max($periodEnd, $date);
            }

            $sampleSize = count($absPctErrors);
            $mape = $sampleSize > 0
                ? round((array_sum($absPctErrors) / $sampleSize) * 100, 4)
                : null;

            PredictionRunEvaluation::query()->updateOrCreate(
                [
                    'prediction_run_id' => $fresh->id,
                    'metric' => 'mape_7d',
                ],
                [
                    'metric_value' => $mape,
                    'sample_size' => $sampleSize,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'retrain_status' => 'pending',
                ]
            );

            $fresh->update([
                'evaluated_at' => now(),
                'status' => 'evaluated',
            ]);

            Log::info('dashboard.prediction.evaluation_done', [
                'prediction_run_id' => $fresh->id,
                'run_date' => optional($fresh->run_date)->toDateString(),
                'mape_7d' => $mape,
                'sample_size' => $sampleSize,
            ]);
        });

        $evaluation = PredictionRunEvaluation::query()
            ->where('prediction_run_id', $run->id)
            ->where('metric', 'mape_7d')
            ->first();

        if (!$evaluation || $evaluation->retrain_status === 'success') {
            return;
        }

        $exitCode = Artisan::call('dashboard:prediction-train');
        if ($exitCode === 0) {
            $evaluation->update([
                'retrain_status' => 'success',
                'retrained_at' => now(),
                'notes' => trim((string) Artisan::output()) ?: null,
            ]);

            Log::info('dashboard.prediction.retrain_done', [
                'prediction_run_id' => $run->id,
                'evaluation_id' => $evaluation->id,
            ]);
        } else {
            $evaluation->update([
                'retrain_status' => 'failed',
                'notes' => trim((string) Artisan::output()) ?: 'retrain_failed',
            ]);

            Log::warning('dashboard.prediction.retrain_failed', [
                'prediction_run_id' => $run->id,
                'evaluation_id' => $evaluation->id,
                'exit_code' => $exitCode,
            ]);
        }
    }
}


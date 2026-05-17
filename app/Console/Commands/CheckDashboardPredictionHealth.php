<?php

namespace App\Console\Commands;

use App\Services\DashboardPredictionSnapshotService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CheckDashboardPredictionHealth extends Command
{
    protected $signature = 'dashboard:prediction-health 
        {--scope=prediction_bundle} 
        {--max-age-minutes=120}
        {--quiet-ok}';

    protected $description = 'Check dashboard prediction snapshot health and completeness';

    public function __construct(
        private DashboardPredictionSnapshotService $snapshotService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $scope = (string) $this->option('scope');
        $maxAgeMinutes = max((int) $this->option('max-age-minutes'), 1);
        $quietOk = (bool) $this->option('quiet-ok');

        $snapshot = $this->snapshotService->latestReady($scope);
        if (!$snapshot) {
            $message = 'Snapshot prediksi ready belum tersedia.';
            $this->warn($message);
            Log::warning('dashboard.prediction.health', [
                'status' => 'no_ready_snapshot',
                'scope' => $scope,
                'max_age_minutes' => $maxAgeMinutes,
            ]);

            return self::SUCCESS;
        }

        $bundle = $this->snapshotService->asBundleResponse($snapshot);
        $completeness = $this->summarizeCompleteness(is_array($bundle) ? $bundle : []);
        $ageMinutes = $snapshot->generated_at ? $snapshot->generated_at->diffInMinutes(now()) : null;
        $tooOld = $ageMinutes !== null && $ageMinutes > $maxAgeMinutes;

        $payload = [
            'snapshot_id' => (int) $snapshot->id,
            'scope' => $scope,
            'status' => 'ok',
            'age_minutes' => $ageMinutes,
            'max_age_minutes' => $maxAgeMinutes,
            'completeness' => $completeness,
        ];

        if ($tooOld || (($completeness['percent'] ?? 0) < 100)) {
            $payload['status'] = 'warning';
            $payload['reason'] = $tooOld ? 'snapshot_too_old' : 'incomplete_sections';
            Log::warning('dashboard.prediction.health', $payload);
            $this->warn(sprintf(
                'Health warning: age=%s menit, completeness=%s%%, missing=%s',
                (string) $ageMinutes,
                (string) ($completeness['percent'] ?? 0),
                implode(', ', (array) ($completeness['missing_sections'] ?? []))
            ));

            return self::SUCCESS;
        }

        Log::info('dashboard.prediction.health', $payload);
        if (!$quietOk) {
            $this->info(sprintf(
                'Health OK: snapshot #%d, age=%s menit, completeness=%s%%',
                (int) $snapshot->id,
                (string) $ageMinutes,
                (string) ($completeness['percent'] ?? 0)
            ));
        }

        return self::SUCCESS;
    }

    private function summarizeCompleteness(array $bundle): array
    {
        $keys = [
            'hourly_forecast_24h',
            'risk_alarm_24h',
            'what_if_simulator',
            'collection_probability',
            'monthly_total_revenue_forecast',
            'backtest_report',
        ];

        $missing = [];
        foreach ($keys as $key) {
            if (!$this->hasSectionData($bundle, $key)) {
                $missing[] = $key;
            }
        }

        $required = count($keys);
        $available = $required - count($missing);

        return [
            'required' => $required,
            'available' => $available,
            'percent' => $required > 0 ? (int) round(($available / $required) * 100) : 100,
            'missing_sections' => $missing,
        ];
    }

    private function hasSectionData(array $bundle, string $sectionKey): bool
    {
        return match ($sectionKey) {
            'hourly_forecast_24h' => count((array) data_get($bundle, 'hourly_forecast_24h', [])) > 0,
            'risk_alarm_24h' => is_array(data_get($bundle, 'risk_alarm_24h')) && count((array) data_get($bundle, 'risk_alarm_24h', [])) > 0,
            'what_if_simulator' => is_array(data_get($bundle, 'what_if_simulator')) && count((array) data_get($bundle, 'what_if_simulator.scenarios', [])) > 0,
            'collection_probability' => count((array) data_get($bundle, 'collection_probability', [])) > 0,
            'monthly_total_revenue_forecast' => count((array) data_get($bundle, 'monthly_total_revenue_forecast.months', [])) > 0,
            'backtest_report' => (
                (int) data_get($bundle, 'backtest_report.window_7d.sample_size', 0) > 0
                || (int) data_get($bundle, 'backtest_report.window_30d.sample_size', 0) > 0
            ),
            default => false,
        };
    }
}


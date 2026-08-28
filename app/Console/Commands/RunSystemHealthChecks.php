<?php

namespace App\Console\Commands;

use App\Services\FeatureService;
use App\Services\SystemHealthService;
use Illuminate\Console\Command;

class RunSystemHealthChecks extends Command
{
    protected $signature = 'system:health-check';

    protected $description = 'Run internal observability health checks';

    public function handle(FeatureService $featureService, SystemHealthService $healthService): int
    {
        $started = now();

        if (!$featureService->enabled('observability_dashboard_v1')) {
            $healthService->recordHeartbeat($this->signature, 'healthy', 'Feature observability nonaktif.', null, ['started_at' => $started]);
            $this->info('Observability feature disabled.');
            return self::SUCCESS;
        }

        $dashboard = $healthService->runChecks();
        $durationMs = (int) $started->diffInMilliseconds(now());
        $healthService->recordHeartbeat($this->signature, $dashboard['status'] ?? 'unknown', 'System health checks completed.', $durationMs, [
            'started_at' => $started,
            'summary' => $dashboard['summary'] ?? [],
        ]);

        $this->info('System health status: ' . ($dashboard['status'] ?? 'unknown'));

        return self::SUCCESS;
    }
}

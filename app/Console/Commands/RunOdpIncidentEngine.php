<?php

namespace App\Console\Commands;

use App\Services\OdpIncidentEngineService;
use App\Services\FeatureService;
use Illuminate\Console\Command;

class RunOdpIncidentEngine extends Command
{
    protected $signature = 'incident:run-odp-engine';

    protected $description = 'Run ODP health aggregation and incident automation';

    public function handle(OdpIncidentEngineService $service, FeatureService $featureService): int
    {
        if (!$featureService->enabled('incident_engine_v1')) {
            $this->info('FEATURE_INCIDENT_ENGINE_V1=false, engine dilewati.');
            return self::SUCCESS;
        }

        $summary = $service->run();

        $this->info(sprintf(
            'ODP incident engine completed. Created: %d, Resolved: %d, Checked: %s',
            $summary['created'] ?? 0,
            $summary['resolved'] ?? 0,
            $summary['checked_at'] ?? '-'
        ));

        return self::SUCCESS;
    }
}

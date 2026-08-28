<?php

namespace App\Console\Commands;

use App\Services\ComplaintSlaService;
use App\Services\FeatureService;
use App\Services\SystemHealthService;
use Illuminate\Console\Command;

class WatchComplaintSla extends Command
{
    protected $signature = 'complaints:sla-watch';

    protected $description = 'Watch complaint SLA breaches and send internal alerts';

    public function handle(ComplaintSlaService $slaService, FeatureService $featureService, SystemHealthService $healthService): int
    {
        $started = now();

        if (!$featureService->enabled('sla_board_v1')) {
            $healthService->recordHeartbeat($this->signature, 'healthy', 'Feature SLA board nonaktif.', null, ['started_at' => $started]);
            $this->info('SLA board feature disabled.');
            return self::SUCCESS;
        }

        $summary = $slaService->watchBreaches();
        $durationMs = (int) $started->diffInMilliseconds(now());
        $message = sprintf('SLA watch checked=%d created=%d', $summary['checked'], $summary['created']);

        $healthService->recordHeartbeat($this->signature, 'healthy', $message, $durationMs, [
            'started_at' => $started,
            'summary' => $summary,
        ]);

        $this->info($message);

        return self::SUCCESS;
    }
}

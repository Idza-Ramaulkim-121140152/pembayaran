<?php

namespace App\Console\Commands;

use App\Services\CustomerUsageSnapshotService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

class CaptureCustomerUsageSnapshot extends Command
{
    protected $signature = 'customer:usage-snapshot';

    protected $description = 'Capture PPPoE usage delta snapshots per customer';

    public function handle(CustomerUsageSnapshotService $usageSnapshotService): int
    {
        if (!Schema::hasTable('customer_usage_totals') || !Schema::hasTable('customer_usage_checkpoints')) {
            $this->info('Usage tracking tables belum tersedia. Skip snapshot.');
            return self::SUCCESS;
        }

        $summary = $usageSnapshotService->captureSnapshot();

        $this->info(sprintf(
            'Usage snapshot done. connections=%d processed=%d updated=%d skipped_no_customer=%d',
            (int) ($summary['connections'] ?? 0),
            (int) ($summary['processed'] ?? 0),
            (int) ($summary['updated'] ?? 0),
            (int) ($summary['skipped_no_customer'] ?? 0)
        ));

        return self::SUCCESS;
    }
}

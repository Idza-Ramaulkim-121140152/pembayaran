<?php

namespace App\Console\Commands;

use App\Services\BillingDunningService;
use Illuminate\Console\Command;

class RunBillingDunning extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'billing:dunning-run {--date=} {--force}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Run automated billing dunning reminders';

    public function __construct(
        private BillingDunningService $billingDunningService,
    ) {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $result = $this->billingDunningService->run(
            $this->option('date') ? (string) $this->option('date') : null,
            (bool) $this->option('force'),
        );

        $this->line('Billing dunning result: ' . json_encode($result));
        return self::SUCCESS;
    }
}

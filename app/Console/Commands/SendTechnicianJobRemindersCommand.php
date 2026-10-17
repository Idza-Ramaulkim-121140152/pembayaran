<?php

namespace App\Console\Commands;

use App\Services\TechnicianJobNotificationService;
use Illuminate\Console\Command;

class SendTechnicianJobRemindersCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'jobs:send-morning-reminders';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send daily 08:00 AM WhatsApp notifications and reminders for unfinished technician jobs (skips Sundays)';

    /**
     * Execute the console command.
     */
    public function handle(TechnicianJobNotificationService $service): int
    {
        $this->info('Starting morning technician job reminders check...');

        $result = $service->sendMorningReminders();

        if ($result['skipped'] ?? false) {
            $this->comment('Reminder skipped: ' . ($result['reason'] ?? 'Skipped'));
            return Command::SUCCESS;
        }

        $processed = $result['processed_jobs_count'] ?? 0;
        $this->info("Successfully processed {$processed} active jobs for WhatsApp notifications/reminders.");

        return Command::SUCCESS;
    }
}

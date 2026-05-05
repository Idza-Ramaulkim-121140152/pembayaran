<?php

namespace App\Jobs;

use App\Models\BillingAutoInvoiceJob;
use App\Services\BillingAutoInvoiceService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ProcessBillingAutoInvoiceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1200;
    public int $tries = 1;

    public function __construct(public int $jobTrackingId)
    {
    }

    public function handle(BillingAutoInvoiceService $service): void
    {
        $job = BillingAutoInvoiceJob::find($this->jobTrackingId);
        if (!$job) {
            return;
        }

        $service->process($job);
    }

    public function failed(\Throwable $exception): void
    {
        $job = BillingAutoInvoiceJob::find($this->jobTrackingId);
        if ($job) {
            app(BillingAutoInvoiceService::class)->fail($job, $exception->getMessage());
        }

        Log::error('ProcessBillingAutoInvoiceJob failed', [
            'billing_auto_invoice_job_id' => $this->jobTrackingId,
            'error' => $exception->getMessage(),
        ]);
    }
}


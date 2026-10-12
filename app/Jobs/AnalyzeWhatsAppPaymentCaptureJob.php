<?php

namespace App\Jobs;

use App\Models\BillingPaymentCapture;
use App\Services\PaymentCaptureNotificationService;
use App\Services\PaymentMatchingService;
use App\Services\PaymentProofAnalysisService;
use App\Services\PaymentProofValidationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class AnalyzeWhatsAppPaymentCaptureJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;
    public int $tries = 1;

    public function __construct(public int $captureId)
    {
    }

    public function handle(
        PaymentProofAnalysisService $analysisService,
        PaymentProofValidationService $validationService,
        PaymentMatchingService $paymentMatchingService,
        PaymentCaptureNotificationService $notificationService,
        \App\Services\CustomerResolutionService $customerResolutionService,
    ): void {
        $capture = BillingPaymentCapture::query()->with(['customer', 'invoice'])->find($this->captureId);
        if (!$capture) {
            return;
        }

        // Auto-resolve customer from sender_phone, caption, or OCR if not yet attached
        if (!$capture->customer_id || !$capture->customer) {
            $resolvedCustomer = $customerResolutionService->resolveFromCapture($capture);
            if ($resolvedCustomer) {
                $capture->customer_id = $resolvedCustomer->id;
                $activeInvoice = $customerResolutionService->findActiveInvoices($resolvedCustomer)->first();
                if ($activeInvoice && !$capture->invoice_id) {
                    $capture->invoice_id = $activeInvoice->id;
                }
                $capture->save();
                $capture->load(['customer', 'invoice']);
            }
        }

        $analysis = $analysisService->analyze($capture);

        // If customer was still not identified, attempt resolution with newly extracted OCR text
        if (!$capture->customer_id || !$capture->customer) {
            $ocrText = (string) ($analysis['ocr_raw_text'] ?? '');
            if ($ocrText !== '') {
                $resolvedCustomer = $customerResolutionService->resolveFromText($ocrText);
                if ($resolvedCustomer) {
                    $capture->customer_id = $resolvedCustomer->id;
                    $capture->save();
                    $capture->load(['customer']);
                }
            }
        }

        // Resolve target invoice for customer based on detected payment amount
        if ($capture->customer) {
            $detectedAmount = isset($analysis['amount']) ? (float) $analysis['amount'] : 0;
            $activeInvoices = $customerResolutionService->findActiveInvoices($capture->customer);

            // If source is web_public and invoice_id already set, keep it intact
            if ($capture->invoice_id && ($capture->source === 'web_public' || str_starts_with((string) $capture->source, 'web'))) {
                // Keep existing invoice_id
            } else {
                // Try to find exact amount match among customer's active unpaid invoices
                $matchingInvoice = $detectedAmount > 0
                    ? $activeInvoices->first(fn ($inv) => abs((float) $inv->amount - $detectedAmount) <= 0.01)
                    : null;

                if ($matchingInvoice) {
                    $capture->invoice_id = $matchingInvoice->id;
                } elseif (!$capture->invoice_id && $activeInvoices->isNotEmpty()) {
                    $capture->invoice_id = $activeInvoices->first()->id;
                }
                $capture->save();
            }
            $capture->load(['customer', 'invoice']);
        }

        $validation = $validationService->validate($capture, $analysis, $capture->customer, $capture->invoice);

        Log::info('WhatsApp payment capture analyzed', [
            'capture_id' => $capture->id,
            'customer_id' => $capture->customer_id,
            'invoice_id' => $capture->invoice_id,
            'confidence' => $analysis['confidence_overall'] ?? null,
            'status' => $validation['status'],
            'failure_reason' => $validation['failure_reason'],
        ]);

        $meta = array_merge((array) ($capture->meta ?? []), [
            'analysis' => $analysis,
            'validation' => [
                'status' => $validation['status'],
                'failure_reason' => $validation['failure_reason'],
                'flags' => $validation['validation_flags'],
                'destination_match' => $validation['destination_match'],
                'normalized' => $validation['normalized'],
            ],
        ]);

        $capture->amount = max(0, (float) ($validation['normalized']['amount'] ?? 0));
        $capture->paid_date = (string) ($validation['normalized']['paid_date'] ?? now()->toDateString());
        $validRef = $validation['normalized']['reference_code'] ?? null;
        if ($validRef && !str_starts_with(strtolower($validRef), 'inv_') && !str_starts_with(strtolower($validRef), 'invoice')) {
            $capture->reference_code = $validRef;
        } else {
            $capture->reference_code = null;
        }
        $capture->match_confidence = (float) ($analysis['confidence_overall'] ?? 0);
        $capture->meta = $meta;

        if ($validation['status'] === 'approved') {
            $capture->match_status = 'matched';
            $capture->save();

            $summary = $paymentMatchingService->runMatching($capture->id, true);
            $capture->refresh();

            if ($capture->match_status === 'approved' && $capture->invoice) {
                if (Schema::hasColumn('invoices', 'bukti_pembayaran')) {
                    $invoice = $capture->invoice->fresh();
                    $proofPath = (string) data_get($capture->meta, 'media.path', '');
                    if ($proofPath !== '' && !$invoice->bukti_pembayaran) {
                        $invoice->bukti_pembayaran = $proofPath;
                        $invoice->save();
                    }
                }

                $notificationService->notifyAutoApproved($capture->fresh(['customer', 'invoice']));
            } else {
                $notificationService->notifyNeedsReview($capture->fresh(['customer', 'invoice']));
            }

            $capture->meta = array_merge((array) ($capture->meta ?? []), [
                'matching_summary' => $summary,
            ]);
            $capture->save();
            return;
        }

        $capture->match_status = $validation['status'] === 'unmatched' ? 'unmatched' : 'needs_review';
        $capture->save();
        $notificationService->notifyNeedsReview($capture->fresh(['customer', 'invoice']));
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('AnalyzeWhatsAppPaymentCaptureJob failed', [
            'capture_id' => $this->captureId,
            'error' => $exception->getMessage(),
        ]);
    }
}

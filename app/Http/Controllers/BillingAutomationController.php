<?php

namespace App\Http\Controllers;

use App\Models\BillingPaymentCapture;
use App\Services\BillingDunningService;
use App\Services\BillingPaymentCapturePresenter;
use App\Services\PaymentMatchingService;
use App\Services\PaymentVerificationConfigService;
use App\Jobs\AnalyzeWhatsAppPaymentCaptureJob;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class BillingAutomationController extends Controller
{
    public function __construct(
        private BillingDunningService $billingDunningService,
        private PaymentMatchingService $paymentMatchingService,
        private BillingPaymentCapturePresenter $capturePresenter,
        private PaymentVerificationConfigService $paymentVerificationConfigService,
    ) {
    }

    public function dunningConfig()
    {
        return response()->json([
            'data' => $this->billingDunningService->getConfig(),
        ]);
    }

    public function updateDunningConfig(Request $request)
    {
        $validated = $request->validate([
            'is_active' => 'sometimes|boolean',
            'timezone' => 'sometimes|string|max:64',
            'send_time' => 'sometimes|date_format:H:i',
            'max_retry' => 'sometimes|integer|min:0|max:10',
            'template_h_minus_7' => 'sometimes|nullable|string',
            'template_h_minus_3' => 'sometimes|nullable|string',
            'template_h_minus_1' => 'sometimes|nullable|string',
            'template_h_plus_1' => 'sometimes|nullable|string',
            'template_h_plus_3' => 'sometimes|nullable|string',
            'meta' => 'sometimes|array',
        ]);

        if (isset($validated['send_time'])) {
            $validated['send_time'] = $validated['send_time'] . ':00';
        }

        $config = $this->billingDunningService->updateConfig($validated, auth()->id());

        return response()->json([
            'message' => 'Konfigurasi dunning berhasil diperbarui.',
            'data' => $config,
        ]);
    }

    public function runDunning(Request $request)
    {
        $validated = $request->validate([
            'date' => 'nullable|date',
            'force' => 'nullable|boolean',
        ]);

        $result = $this->billingDunningService->run(
            $validated['date'] ?? null,
            (bool) ($validated['force'] ?? true),
            auth()->id()
        );

        return response()->json([
            'message' => 'Dunning run selesai diproses.',
            'data' => $result,
        ]);
    }

    public function dunningLogs(Request $request)
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'sent', 'failed', 'skipped'])],
            'wave' => ['nullable', Rule::in(['h_minus_7', 'h_minus_3', 'h_minus_1', 'h_plus_1', 'h_plus_3'])],
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
            'per_page' => 'nullable|integer|min:1|max:200',
        ]);

        $logs = $this->billingDunningService->logs($validated, (int) ($validated['per_page'] ?? 50));
        return response()->json($logs);
    }

    public function capturePayment(Request $request)
    {
        $validated = $request->validate([
            'source' => 'required|string|max:50',
            'invoice_id' => 'nullable|integer|exists:invoices,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'amount' => 'required|numeric|min:1',
            'paid_date' => 'required|date',
            'reference_code' => 'nullable|string|max:120',
            'meta' => 'nullable|array',
        ]);

        $result = $this->paymentMatchingService->capture($validated, auth()->id());

        return response()->json([
            'message' => $result['message'],
            'duplicate' => $result['duplicate'],
            'data' => $this->capturePresenter->present($result['capture']),
        ]);
    }

    public function paymentVerificationConfig()
    {
        return response()->json([
            'data' => $this->paymentVerificationConfigService->getConfig(),
        ]);
    }

    public function updatePaymentVerificationConfig(Request $request)
    {
        $validated = $request->validate([
            'openai_model' => 'sometimes|string|max:120',
            'auto_approve_enabled' => 'sometimes|boolean',
            'confidence_thresholds' => 'sometimes|array',
            'confidence_thresholds.auto_approve' => 'sometimes|numeric|min:0|max:100',
            'confidence_thresholds.manual_review' => 'sometimes|numeric|min:0|max:100',
            'allowed_source_mime_types' => 'sometimes|array',
            'allowed_source_mime_types.*' => 'string|max:120',
            'destination_whitelist' => 'sometimes|array',
            'destination_whitelist.qris' => 'sometimes|array',
            'destination_whitelist.transfer_bank' => 'sometimes|array',
            'notification_recipients' => 'sometimes|array',
            'notification_recipients.*.id' => 'nullable|string|max:80',
            'notification_recipients.*.name' => 'required_with:notification_recipients|string|max:120',
            'notification_recipients.*.phone' => 'required_with:notification_recipients|string|max:40',
            'notification_recipients.*.is_active' => 'nullable|boolean',
            'notification_recipients.*.receive_auto_approved' => 'nullable|boolean',
            'notification_recipients.*.receive_needs_review' => 'nullable|boolean',
        ]);

        if (array_key_exists('notification_recipients', $validated)) {
            $validated['notification_recipients'] = $this->validateNotificationRecipients(
                is_array($validated['notification_recipients']) ? $validated['notification_recipients'] : []
            );
        }

        $config = $this->paymentVerificationConfigService->updateConfig($validated);

        return response()->json([
            'message' => 'Konfigurasi verifikasi pembayaran berhasil diperbarui.',
            'data' => $config,
        ]);
    }

    private function validateNotificationRecipients(array $recipients): array
    {
        $normalized = $this->paymentVerificationConfigService->normalizeNotificationRecipients($recipients);
        $phones = [];

        foreach ($normalized as $index => $recipient) {
            $phone = trim((string) ($recipient['phone'] ?? ''));
            $name = trim((string) ($recipient['name'] ?? ''));
            $enabledForSomething = (bool) ($recipient['receive_auto_approved'] ?? false) || (bool) ($recipient['receive_needs_review'] ?? false);
            $digits = preg_replace('/\D/', '', $phone) ?: '';

            if ($name === '') {
                throw ValidationException::withMessages([
                    "notification_recipients.$index.name" => ['Nama penerima wajib diisi.'],
                ]);
            }

            if (strlen($digits) < 10 || strlen($digits) > 15) {
                throw ValidationException::withMessages([
                    "notification_recipients.$index.phone" => ['Nomor WA penerima harus 10-15 digit.'],
                ]);
            }

            if (in_array($phone, $phones, true)) {
                throw ValidationException::withMessages([
                    "notification_recipients.$index.phone" => ['Nomor WA penerima tidak boleh duplikat.'],
                ]);
            }

            if (!$enabledForSomething) {
                throw ValidationException::withMessages([
                    "notification_recipients.$index.receive_auto_approved" => ['Pilih minimal satu jenis notifikasi untuk penerima ini.'],
                ]);
            }

            $phones[] = $phone;
        }

        return $normalized;
    }

    public function runMatch(Request $request)
    {
        $validated = $request->validate([
            'capture_id' => 'nullable|integer|exists:billing_payment_captures,id',
            'auto_apply' => 'nullable|boolean',
        ]);

        $autoApply = (bool) ($validated['auto_apply'] ?? true);

        $summary = $this->paymentMatchingService->runMatching(
            isset($validated['capture_id']) ? (int) $validated['capture_id'] : null,
            $autoApply,
            auth()->id()
        );

        return response()->json([
            'message' => 'Proses matching selesai.',
            'data' => $summary,
        ]);
    }

    public function unmatched(Request $request)
    {
        $validated = $request->validate([
            'per_page' => 'nullable|integer|min:1|max:200',
        ]);

        $paginator = $this->paymentMatchingService->unmatched((int) ($validated['per_page'] ?? 50));

        return response()->json([
            'data' => $this->capturePresenter->presentPaginator($paginator),
        ]);
    }

    public function resolveCapture(Request $request, BillingPaymentCapture $capture)
    {
        $validated = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'reject'])],
            'candidate_invoice_id' => 'nullable|integer|exists:invoices,id',
        ]);

        $resolved = $this->paymentMatchingService->resolve(
            $capture,
            (string) $validated['decision'],
            isset($validated['candidate_invoice_id']) ? (int) $validated['candidate_invoice_id'] : null,
            auth()->id()
        );

        return response()->json([
            'message' => 'Capture pembayaran berhasil diproses.',
            'data' => $this->capturePresenter->present($resolved),
        ]);
    }

    public function reanalyzeCapture(BillingPaymentCapture $capture)
    {
        $capture->update([
            'match_status' => 'pending',
            'meta' => array_merge((array) ($capture->meta ?? []), [
                'reanalyze_requested_at' => now()->toISOString(),
            ]),
        ]);

        AnalyzeWhatsAppPaymentCaptureJob::dispatch($capture->id);

        return response()->json([
            'message' => 'Capture pembayaran dijadwalkan untuk analisis ulang.',
            'data' => $this->capturePresenter->present($capture->fresh(['invoice', 'customer', 'matchReviews.candidateInvoice'])),
        ], 202);
    }
}

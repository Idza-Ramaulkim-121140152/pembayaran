<?php

namespace App\Http\Controllers;

use App\Models\BillingPaymentCapture;
use App\Services\BillingDunningService;
use App\Services\PaymentMatchingService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BillingAutomationController extends Controller
{
    public function __construct(
        private BillingDunningService $billingDunningService,
        private PaymentMatchingService $paymentMatchingService,
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
            'data' => $result['capture'],
        ]);
    }

    public function runMatch(Request $request)
    {
        $validated = $request->validate([
            'capture_id' => 'nullable|integer|exists:billing_payment_captures,id',
            'auto_apply' => 'nullable|boolean',
        ]);

        $summary = $this->paymentMatchingService->runMatching(
            isset($validated['capture_id']) ? (int) $validated['capture_id'] : null,
            (bool) ($validated['auto_apply'] ?? true),
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

        return response()->json(
            $this->paymentMatchingService->unmatched((int) ($validated['per_page'] ?? 50))
        );
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
            'data' => $resolved,
        ]);
    }
}

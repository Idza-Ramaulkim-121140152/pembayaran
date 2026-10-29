<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\QrisWebhookLog;
use App\Models\SiteSetting;
use App\Services\DynamicQrisService;
use App\Services\QrisWebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class QrisWebhookController extends Controller
{
    public function __construct(
        protected QrisWebhookService $webhookService,
        protected DynamicQrisService $dynamicQrisService
    ) {}

    /**
     * Endpoint Webhook penerima notifikasi GoBiz / e-wallet dari MacroDroid (HP Android).
     * POST /api/qris/webhook
     */
    public function webhook(Request $request): JsonResponse
    {
        // Tangkap secret token dari berbagai variasi header / parameter
        $secret = $request->header('X-QRIS-SECRET')
            ?: $request->header('X-Webhook-Secret')
            ?: $request->header('Authorization')
            ?: $request->input('secret')
            ?: $request->query('secret');

        // Bersihkan prefix 'Bearer ' jika dikirim via Authorization header
        if ($secret && str_starts_with(strtolower($secret), 'bearer ')) {
            $secret = trim(substr($secret, 7));
        }

        $payload = $request->all();

        // Tangani jika dikirim berupa raw string JSON atau form urlencoded
        if (empty($payload)) {
            $rawContent = $request->getContent();
            $decoded = json_decode($rawContent, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            } else {
                $payload = [
                    'text' => $rawContent,
                ];
            }
        }

        // Jalankan pemrosesan webhook & settlement otomatis
        $result = $this->webhookService->processWebhook($payload, $secret);

        $httpCode = $result['http_code'] ?? ($result['success'] ? 200 : 400);

        return response()->json($result, $httpCode);
    }

    /**
     * Public API untuk halaman invoice pelanggan: mengambil QRIS dinamis ber-nominal pas.
     * GET /api/invoice/{invoice_link}/dynamic-qris
     */
    public function getDynamicQris(string $invoiceLink, Request $request): JsonResponse
    {
        $invoice = Invoice::where('invoice_link', $invoiceLink)
            ->with(['customer', 'items'])
            ->first();

        if (!$invoice) {
            return response()->json([
                'status' => 'not_found',
                'message' => 'Invoice tidak ditemukan.',
            ], 404);
        }

        $isPaid = strtolower((string) $invoice->status) === 'paid';

        if ($isPaid) {
            return response()->json([
                'status' => 'paid',
                'is_paid' => true,
                'message' => 'Tagihan ini sudah lunas.',
                'invoice' => [
                    'id' => $invoice->id,
                    'invoice_link' => $invoice->invoice_link,
                    'status' => 'paid',
                    'paid_at' => $invoice->paid_at?->toIso8601String(),
                    'amount' => (float) $invoice->amount,
                ],
            ]);
        }

        $dynamicData = $this->dynamicQrisService->generateForInvoice($invoice);

        return response()->json([
            'status' => 'success',
            'is_paid' => false,
            'data' => array_merge($dynamicData, [
                'status' => $invoice->status,
                'customer_name' => $invoice->customer?->name,
                'package_name' => $invoice->customer?->package_type,
            ]),
        ]);
    }

    /**
     * Cek status pelunasan invoice (digunakan oleh polling frontend setiap 3 detik).
     * GET /api/invoice/{invoice_link}/check-status
     */
    public function checkInvoiceStatus(string $invoiceLink): JsonResponse
    {
        $invoice = Invoice::where('invoice_link', $invoiceLink)
            ->select(['id', 'invoice_link', 'status', 'amount', 'paid_at', 'qris_expected_amount', 'qris_sender'])
            ->first();

        if (!$invoice) {
            return response()->json(['status' => 'not_found'], 404);
        }

        $isPaid = strtolower((string) $invoice->status) === 'paid';

        return response()->json([
            'invoice_link' => $invoice->invoice_link,
            'status' => $invoice->status,
            'is_paid' => $isPaid,
            'paid_at' => $invoice->paid_at?->toIso8601String(),
            'sender' => $invoice->qris_sender,
            'amount' => (float) ($invoice->qris_expected_amount ?: $invoice->amount),
        ]);
    }

    /**
     * Mengambil status sistem Dynamic QRIS, URL Webhook, Secret, dan riwayat log untuk Admin Console.
     * GET /api/settings/qris
     */
    public function getSettings(): JsonResponse
    {
        $webhookSecret = SiteSetting::get(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'rknet-secret-qris-key');
        $staticPayload = $this->dynamicQrisService->getStaticPayload();
        $codeMin = (int) SiteSetting::get(DynamicQrisService::SETTING_UNIQUE_CODE_MIN, 101);
        $codeMax = (int) SiteSetting::get(DynamicQrisService::SETTING_UNIQUE_CODE_MAX, 499);
        $expHours = (int) SiteSetting::get(DynamicQrisService::SETTING_EXPIRATION_HOURS, 3);

        $today = now()->startOfDay();

        $stats = [
            'today_total' => QrisWebhookLog::where('created_at', '>=', $today)->count(),
            'today_settled' => QrisWebhookLog::where('created_at', '>=', $today)->where('status', 'settled')->count(),
            'today_duplicates_ignored' => QrisWebhookLog::where('created_at', '>=', $today)->where('status', 'duplicate_ignored')->count(),
            'today_unmatched' => QrisWebhookLog::where('created_at', '>=', $today)->where('status', 'unmatched')->count(),
            'today_settled_amount' => (float) QrisWebhookLog::where('created_at', '>=', $today)
                ->where('status', 'settled')
                ->sum('extracted_amount'),
        ];

        $recentLogs = QrisWebhookLog::with('invoice:id,invoice_link,status,amount')
            ->latest()
            ->limit(20)
            ->get();

        $webhookUrl = url('/api/qris/webhook');

        return response()->json([
            'webhook_url' => $webhookUrl,
            'webhook_secret' => $webhookSecret,
            'static_payload' => $staticPayload,
            'unique_code_min' => $codeMin,
            'unique_code_max' => $codeMax,
            'expiration_hours' => $expHours,
            'stats' => $stats,
            'recent_logs' => $recentLogs,
        ]);
    }

    /**
     * Menyimpan pembaruan konfigurasi QRIS oleh Admin.
     * POST /api/settings/qris
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'webhook_secret' => 'nullable|string|max:100',
            'static_payload' => 'nullable|string|min:30',
            'unique_code_min' => 'nullable|integer|min:1|max:999',
            'unique_code_max' => 'nullable|integer|min:1|max:999',
            'expiration_hours' => 'nullable|integer|min:1|max:24',
        ]);

        if (isset($validated['webhook_secret'])) {
            SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, trim($validated['webhook_secret']));
        }
        if (isset($validated['static_payload']) && trim($validated['static_payload']) !== '') {
            SiteSetting::set(DynamicQrisService::SETTING_STATIC_PAYLOAD, trim($validated['static_payload']));
        }
        if (isset($validated['unique_code_min'])) {
            SiteSetting::set(DynamicQrisService::SETTING_UNIQUE_CODE_MIN, (string) $validated['unique_code_min']);
        }
        if (isset($validated['unique_code_max'])) {
            SiteSetting::set(DynamicQrisService::SETTING_UNIQUE_CODE_MAX, (string) $validated['unique_code_max']);
        }
        if (isset($validated['expiration_hours'])) {
            SiteSetting::set(DynamicQrisService::SETTING_EXPIRATION_HOURS, (string) $validated['expiration_hours']);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Konfigurasi QRIS Dinamis berhasil diperbarui.',
        ]);
    }

    /**
     * Simulasi teks notifikasi untuk pengetesan oleh Admin tanpa transfer uang sungguhan.
     * POST /api/settings/qris/test-parser
     */
    public function testParser(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string',
            'title' => 'nullable|string',
        ]);

        $parsed = $this->webhookService->parseNotificationText($request->input('text'), $request->input('title'));

        $matchingInvoice = null;
        if ($parsed['amount']) {
            $matchingInvoice = Invoice::query()
                ->where('status', '!=', 'paid')
                ->where(function ($q) use ($parsed) {
                    $q->where('qris_expected_amount', $parsed['amount'])
                      ->orWhere('amount', $parsed['amount']);
                })
                ->with('customer:id,name,phone')
                ->first();
        }

        return response()->json([
            'parsed' => $parsed,
            'matching_invoice' => $matchingInvoice ? [
                'id' => $matchingInvoice->id,
                'invoice_link' => $matchingInvoice->invoice_link,
                'status' => $matchingInvoice->status,
                'customer_name' => $matchingInvoice->customer?->name,
                'amount' => $matchingInvoice->amount,
                'qris_expected_amount' => $matchingInvoice->qris_expected_amount,
            ] : null,
        ]);
    }
}

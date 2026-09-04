<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\SiteSetting;
use App\Services\IpaymuPaymentProcessor;
use App\Services\IpaymuService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class IpaymuIntegrationController extends Controller
{
    protected IpaymuService $ipaymu;
    protected IpaymuPaymentProcessor $processor;

    public function __construct(IpaymuService $ipaymu, IpaymuPaymentProcessor $processor)
    {
        $this->ipaymu = $ipaymu;
        $this->processor = $processor;
    }

    /**
     * Get integration status, credentials info, and live balance
     */
    public function getStatus()
    {
        $va = $this->ipaymu->getVa();
        $apiKey = $this->ipaymu->getApiKey();
        $maskedKey = strlen($apiKey) > 8
            ? substr($apiKey, 0, 4) . '...' . substr($apiKey, -4)
            : '****';

        $appUrl = config('app.url', 'https://rumahkitanet.site');
        $serverIp = $this->ipaymu->getServerIp();
        $isActive = $this->processor->isPaymentGatewayActive();

        // Perform balance & connection check
        $balanceResult = $this->ipaymu->checkBalance();

        return response()->json([
            'success' => true,
            'is_active' => $isActive,
            'config' => [
                'va' => $va,
                'api_key' => $apiKey,
                'masked_key' => $maskedKey,
                'env' => $this->ipaymu->getEnv(),
                'base_url' => $this->ipaymu->getBaseUrl(),
                'app_url' => $appUrl,
                'server_ip' => $serverIp,
                'webhook_urls' => [
                    'notify_url' => "{$appUrl}/api/ipaymu/notify",
                    'return_url' => "{$appUrl}/api/ipaymu/return",
                    'cancel_url' => "{$appUrl}/api/ipaymu/cancel",
                ],
            ],
            'connection' => [
                'connected' => $balanceResult['success'] ?? false,
                'http_code' => $balanceResult['http_code'] ?? 0,
                'merchant_balance' => $balanceResult['response']['Data']['MerchantBalance'] ?? 0,
                'member_balance' => $balanceResult['response']['Data']['MemberBalance'] ?? 0,
                'message' => $balanceResult['response']['Message'] ?? ($balanceResult['curl_error'] ?: 'Unknown response'),
                'raw_debug' => $balanceResult,
            ],
        ]);
    }

    /**
     * Toggle active / inactive state of payment gateway
     */
    public function toggleActive(Request $request)
    {
        $request->validate([
            'active' => 'required|boolean',
        ]);

        $active = (bool) $request->input('active');
        $this->processor->setPaymentGatewayActive($active);

        return response()->json([
            'success' => true,
            'is_active' => $active,
            'message' => $active
                ? 'Payment Gateway iPaymu berhasil DIAKTIFKAN. Opsi pembayaran online sekarang tersedia untuk pelanggan.'
                : 'Payment Gateway iPaymu berhasil DINONAKTIFKAN. Pelanggan hanya dapat menggunakan metode pembayaran transfer manual.',
        ]);
    }

    /**
     * Save / Update iPaymu Credentials
     */
    public function saveConfig(Request $request)
    {
        $validated = $request->validate([
            'va' => 'required|string|max:50',
            'api_key' => 'required|string|max:100',
            'env' => 'required|in:production,sandbox',
        ]);

        SiteSetting::set('ipaymu_va', trim($validated['va']));
        SiteSetting::set('ipaymu_api_key', trim($validated['api_key']));
        SiteSetting::set('ipaymu_env', $validated['env']);

        // Refresh service and test balance
        $freshService = new IpaymuService();
        $balanceResult = $freshService->checkBalance();

        return response()->json([
            'success' => true,
            'message' => 'Konfigurasi kredensial iPaymu berhasil disimpan!',
            'connection' => [
                'connected' => $balanceResult['success'] ?? false,
                'http_code' => $balanceResult['http_code'] ?? 0,
                'merchant_balance' => $balanceResult['response']['Data']['MerchantBalance'] ?? 0,
                'message' => $balanceResult['response']['Message'] ?? ($balanceResult['curl_error'] ?: 'Unknown response'),
                'raw_debug' => $balanceResult,
            ],
        ]);
    }

    /**
     * Run Test Payment Transaction
     */
    public function testPayment(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:redirect,direct_qris,direct_va',
            'amount' => 'required|numeric|min:1000',
            'buyer_name' => 'nullable|string|max:100',
            'buyer_phone' => 'nullable|string|max:20',
            'buyer_email' => 'nullable|email|max:100',
            'product_name' => 'nullable|string|max:150',
            'va_bank' => 'nullable|string|max:20',
        ]);

        $amount = (float) $validated['amount'];
        $buyerName = $validated['buyer_name'] ?: 'Pelanggan Uji Coba';
        $buyerPhone = $validated['buyer_phone'] ?: '085158025553';
        $buyerEmail = $validated['buyer_email'] ?: 'test@rumahkitanet.com';
        $productName = $validated['product_name'] ?: 'Uji Coba Pembayaran Paket Internet';

        if ($validated['type'] === 'redirect') {
            $result = $this->ipaymu->createRedirectPayment([
                'product' => [$productName],
                'qty' => [1],
                'price' => [$amount],
                'description' => ['Uji coba integrasi iPaymu Redirect Checkout'],
                'referenceId' => 'TEST-RED-' . time(),
                'buyerName' => $buyerName,
                'buyerPhone' => $buyerPhone,
                'buyerEmail' => $buyerEmail,
            ]);
        } elseif ($validated['type'] === 'direct_qris') {
            $result = $this->ipaymu->createDirectPayment([
                'name' => $buyerName,
                'phone' => $buyerPhone,
                'email' => $buyerEmail,
                'amount' => $amount,
                'paymentMethod' => 'qris',
                'paymentChannel' => 'mpm',
                'referenceId' => 'TEST-QRIS-' . time(),
                'description' => 'Uji coba Direct QRIS iPaymu',
            ]);
        } else {
            // direct_va
            $bank = strtolower($validated['va_bank'] ?: 'bag');
            $result = $this->ipaymu->createDirectPayment([
                'name' => $buyerName,
                'phone' => $buyerPhone,
                'email' => $buyerEmail,
                'amount' => $amount,
                'paymentMethod' => 'va',
                'paymentChannel' => $bank,
                'referenceId' => 'TEST-VA-' . time(),
                'description' => "Uji coba Direct VA {$bank} iPaymu",
            ]);
        }

        // Enhance QRIS response with direct renderable QR Image URL
        if (!empty($result['response']['Data']['QrString']) || !empty($result['response']['Data']['PaymentNo'])) {
            $qrData = $result['response']['Data']['QrString'] ?? $result['response']['Data']['PaymentNo'];
            if (str_starts_with($qrData, '000201')) {
                $result['response']['Data']['qr_image_url'] = 'https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=' . urlencode($qrData);
            }
        }

        return response()->json([
            'success' => $result['success'],
            'http_code' => $result['http_code'],
            'message' => $result['response']['Message'] ?? ($result['curl_error'] ?: 'Respons diterima dari iPaymu'),
            'result' => $result,
        ]);
    }

    /**
     * Check Transaction Status
     */
    public function checkTransaction(Request $request)
    {
        $validated = $request->validate([
            'transaction_id' => 'required|string|max:100',
        ]);

        $result = $this->ipaymu->checkTransaction($validated['transaction_id']);

        return response()->json([
            'success' => $result['success'],
            'http_code' => $result['http_code'],
            'result' => $result,
        ]);
    }

    /**
     * Handle Customer Return URL after payment checkout
     */
    public function handleReturn(Request $request)
    {
        $status = $request->query('status', 'berhasil');
        $trxId = $request->query('trx_id');
        $sid = $request->query('sid');
        $invoiceLink = $request->query('invoice');
        $paymentMethod = $request->query('payment_method') ?: $request->query('tipe');
        $isSuccess = in_array(strtolower($status), ['berhasil', 'success', 'settlement', 'paid']);
        $isCancel = in_array(strtolower($status), ['batal', 'cancel', 'cancelled', 'failed', 'gagal']);

        // If success and linked to an invoice, process confirmation immediately
        if ($isSuccess) {
            $invoice = null;
            if ($invoiceLink) {
                $invoice = Invoice::where('invoice_link', $invoiceLink)->first();
            } elseif ($sid && str_starts_with($sid, 'INV-')) {
                $parts = explode('-', $sid);
                if (isset($parts[1]) && is_numeric($parts[1])) {
                    $invoice = Invoice::find($parts[1]);
                }
            }

            if ($invoice && $invoice->status !== 'paid') {
                $this->processor->processSuccessfulPayment($invoice, $request->all());
            }
        }

        return view('payment.ipaymu_return', [
            'status' => $status,
            'trxId' => $trxId,
            'sid' => $sid,
            'paymentMethod' => $paymentMethod,
            'isSuccess' => $isSuccess,
            'isCancel' => $isCancel,
        ]);
    }

    /**
     * Handle Customer Cancel URL
     */
    public function handleCancel(Request $request)
    {
        return view('payment.ipaymu_return', [
            'status' => 'dibatalkan',
            'trxId' => $request->query('trx_id'),
            'sid' => $request->query('sid'),
            'paymentMethod' => $request->query('payment_method') ?: $request->query('tipe'),
            'isSuccess' => false,
            'isCancel' => true,
        ]);
    }

    /**
     * Handle iPaymu Webhook Notification (POST)
     */
    public function handleNotify(Request $request)
    {
        $payload = $request->all();
        Log::info('iPaymu Webhook Notification Received:', $payload);

        $status = strtolower((string) ($payload['status'] ?? $payload['status_code'] ?? ''));
        $sid = (string) ($payload['sid'] ?? $payload['session_id'] ?? $payload['reference_id'] ?? '');
        $trxId = (string) ($payload['trx_id'] ?? $payload['transaction_id'] ?? '');

        $isPaid = in_array($status, ['berhasil', 'success', 'settlement', 'paid', '1', '200'], true);

        if ($isPaid) {
            $invoice = null;
            // Match reference id pattern: INV-{id}-{timestamp}
            if ($sid && preg_match('/INV-(\d+)/i', $sid, $matches)) {
                $invoice = Invoice::find($matches[1]);
            } elseif (!empty($payload['reference_id']) && preg_match('/INV-(\d+)/i', $payload['reference_id'], $matches)) {
                $invoice = Invoice::find($matches[1]);
            }

            if ($invoice) {
                $result = $this->processor->processSuccessfulPayment($invoice, $payload);
                Log::info("iPaymu Webhook: Invoice #{$invoice->id} successfully processed:", $result);
            } else {
                Log::warning("iPaymu Webhook: No matching invoice found for reference ID '{$sid}'");
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Notification processed successfully',
        ]);
    }
}

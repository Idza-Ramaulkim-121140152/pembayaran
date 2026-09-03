<?php

namespace App\Http\Controllers;

use App\Models\SiteSetting;
use App\Services\IpaymuService;
use Illuminate\Http\Request;

class IpaymuIntegrationController extends Controller
{
    protected IpaymuService $ipaymu;

    public function __construct(IpaymuService $ipaymu)
    {
        $this->ipaymu = $ipaymu;
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

        // Perform balance & connection check
        $balanceResult = $this->ipaymu->checkBalance();

        return response()->json([
            'success' => true,
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
            'va_bank' => 'nullable|string|max:20', // bca, bri, mandiri, bni, etc.
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
}

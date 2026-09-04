<?php

namespace App\Services;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Log;

class IpaymuService
{
    public function getVa(): string
    {
        try {
            return SiteSetting::get('ipaymu_va', env('IPAYMU_VA', '1179002377569258'));
        } catch (\Throwable $e) {
            return env('IPAYMU_VA', '1179002377569258');
        }
    }

    public function getApiKey(): string
    {
        try {
            return SiteSetting::get('ipaymu_api_key', env('IPAYMU_API_KEY', '6670407D-18BA-4683-A5A8-E7EDEA2C66C7'));
        } catch (\Throwable $e) {
            return env('IPAYMU_API_KEY', '6670407D-18BA-4683-A5A8-E7EDEA2C66C7');
        }
    }

    public function getEnv(): string
    {
        try {
            return SiteSetting::get('ipaymu_env', env('IPAYMU_ENV', 'production'));
        } catch (\Throwable $e) {
            return env('IPAYMU_ENV', 'production');
        }
    }

    public function getBaseUrl(): string
    {
        return $this->getEnv() === 'sandbox'
            ? 'https://sandbox.ipaymu.com/api/v2'
            : 'https://my.ipaymu.com/api/v2';
    }

    /**
     * Generate iPaymu v2 Signature
     */
    public function generateSignature(string $method, array $body = []): array
    {
        $method = strtoupper($method);
        $va = $this->getVa();
        $apiKey = $this->getApiKey();

        $jsonBody = !empty($body) ? json_encode($body, JSON_UNESCAPED_SLASHES) : '';
        $bodyHash = strtolower(hash('sha256', $jsonBody));
        $stringToSign = "{$method}:{$va}:{$bodyHash}:{$apiKey}";
        $signature = hash_hmac('sha256', $stringToSign, $apiKey);
        $timestamp = date('YmdHis');

        return [
            'signature' => $signature,
            'stringToSign' => $stringToSign,
            'bodyHash' => $bodyHash,
            'jsonBody' => $jsonBody,
            'timestamp' => $timestamp,
        ];
    }

    /**
     * Send HTTP Request to iPaymu API
     */
    public function request(string $endpoint, string $method = 'POST', array $body = []): array
    {
        $url = $this->getBaseUrl() . $endpoint;
        $sigData = $this->generateSignature($method, $body);

        $headers = [
            'Content-Type: application/json',
            'va: ' . $this->getVa(),
            'signature: ' . $sigData['signature'],
            'timestamp' => $sigData['timestamp'],
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $sigData['jsonBody']);
        }

        $startTime = microtime(true);
        $responseRaw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        $durationMs = round((microtime(true) - $startTime) * 1000, 2);
        curl_close($ch);

        $responseDecoded = json_decode($responseRaw, true);

        return [
            'success' => $httpCode >= 200 && $httpCode < 300 && ($responseDecoded['Success'] ?? false),
            'http_code' => $httpCode,
            'duration_ms' => $durationMs,
            'endpoint' => $endpoint,
            'url' => $url,
            'request_headers' => $headers,
            'request_body' => $body,
            'debug' => [
                'string_to_sign' => $sigData['stringToSign'],
                'signature' => $sigData['signature'],
                'timestamp' => $sigData['timestamp'],
            ],
            'response' => $responseDecoded,
            'raw_response' => $responseRaw,
            'curl_error' => $curlError,
        ];
    }

    /**
     * Check Merchant Balance & API Status
     */
    public function checkBalance(): array
    {
        return $this->request('/balance', 'POST', [
            'account' => $this->getVa(),
        ]);
    }

    /**
     * Create Redirect Payment (iPaymu Cashier / Checkout)
     */
    public function createRedirectPayment(array $params): array
    {
        $appUrl = config('app.url', 'https://rumahkitanet.site');

        $payload = [
            'product' => $params['product'] ?? ['Pembayaran Internet Rumah Kita Net'],
            'qty' => $params['qty'] ?? [1],
            'price' => $params['price'] ?? [10000],
            'description' => $params['description'] ?? ['Uji Coba Integrasi iPaymu'],
            'notifyUrl' => $params['notifyUrl'] ?? "{$appUrl}/api/ipaymu/notify",
            'returnUrl' => $params['returnUrl'] ?? "{$appUrl}/api/ipaymu/return",
            'cancelUrl' => $params['cancelUrl'] ?? "{$appUrl}/api/ipaymu/cancel",
            'referenceId' => $params['referenceId'] ?? 'TRX-TEST-' . time(),
            'buyerName' => $params['buyerName'] ?? 'Pelanggan Uji Coba',
            'buyerEmail' => $params['buyerEmail'] ?? 'test@rumahkitanet.com',
            'buyerPhone' => $params['buyerPhone'] ?? '085158025553',
        ];

        return $this->request('/payment', 'POST', $payload);
    }

    /**
     * Create Direct Payment (QRIS / Virtual Account / etc.)
     */
    public function createDirectPayment(array $params): array
    {
        $appUrl = config('app.url', 'https://rumahkitanet.site');

        $payload = [
            'name' => $params['name'] ?? 'Pelanggan Uji Coba',
            'phone' => $params['phone'] ?? '085158025553',
            'email' => $params['email'] ?? 'test@rumahkitanet.com',
            'amount' => $params['amount'] ?? 10000,
            'notifyUrl' => $params['notifyUrl'] ?? "{$appUrl}/api/ipaymu/notify",
            'paymentMethod' => $params['paymentMethod'] ?? 'qris',
            'paymentChannel' => $params['paymentChannel'] ?? 'mpm',
            'referenceId' => $params['referenceId'] ?? 'DIRECT-TEST-' . time(),
            'description' => $params['description'] ?? 'Uji Coba Direct Payment iPaymu',
        ];

        return $this->request('/payment/direct', 'POST', $payload);
    }

    /**
     * Check Transaction Status
     */
    public function checkTransaction(string $transactionId): array
    {
        return $this->request('/transaction', 'POST', [
            'transactionId' => $transactionId,
            'account' => $this->getVa(),
        ]);
    }

    /**
     * Helper to get current server outgoing IP
     */
    public function getServerIp(): string
    {
        try {
            $ip = file_get_contents('https://api.ipify.org', false, stream_context_create([
                'http' => ['timeout' => 3],
            ]));
            return trim($ip) ?: ($_SERVER['SERVER_ADDR'] ?? '127.0.0.1');
        } catch (\Exception $e) {
            return $_SERVER['SERVER_ADDR'] ?? '127.0.0.1';
        }
    }
}

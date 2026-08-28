<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class WifiPasswordVerificationService
{
    public const TTL_SECONDS = 120;

    public function create(Customer $customer, string $pppoeUsername, string $password, array $changeResult): string
    {
        $verificationId = (string) Str::uuid();

        Cache::put($this->cacheKey($customer, $verificationId), [
            'customer_id' => $customer->id,
            'pppoe_username' => $pppoeUsername,
            'encrypted_password' => Crypt::encryptString($password),
            'targets' => $changeResult['targets'] ?? [],
            'device_id' => $changeResult['device_id'] ?? null,
            'created_at' => now()->toIso8601String(),
        ], now()->addSeconds(self::TTL_SECONDS));

        return $verificationId;
    }

    public function get(Customer $customer, string $verificationId): ?array
    {
        $payload = Cache::get($this->cacheKey($customer, $verificationId));

        if (!$payload || (int) ($payload['customer_id'] ?? 0) !== (int) $customer->id) {
            return null;
        }

        return $payload;
    }

    public function decryptPassword(array $payload): string
    {
        return Crypt::decryptString((string) ($payload['encrypted_password'] ?? ''));
    }

    private function cacheKey(Customer $customer, string $verificationId): string
    {
        return "customer_wifi_password_verification:{$customer->id}:{$verificationId}";
    }
}

<?php

namespace App\Http\Controllers;

use App\Exceptions\GenieAcsException;
use App\Models\Customer;
use App\Services\AuditLogService;
use App\Services\GenieAcsService;
use App\Services\WifiPasswordVerificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class CustomerWifiController extends Controller
{
    public function __construct(
        private readonly GenieAcsService $genieAcsService,
        private readonly AuditLogService $auditLogService,
        private readonly WifiPasswordVerificationService $wifiPasswordVerificationService,
    ) {
    }

    public function device(Customer $customer)
    {
        $pppoeUsername = trim((string) $customer->pppoe_username);
        if ($pppoeUsername === '') {
            return response()->json([
                'message' => 'Pelanggan belum memiliki PPPoE username.',
            ], 422);
        }

        try {
            $device = $this->genieAcsService->describeDeviceByPppoe($pppoeUsername);

            return response()->json([
                'data' => $this->safeDeviceSummary($device),
            ]);
        } catch (GenieAcsException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], $exception->status());
        }
    }

    public function updatePassword(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:63', 'confirmed'],
        ], [
            'password.confirmed' => 'Konfirmasi password WiFi tidak cocok.',
            'password.min' => 'Password WiFi minimal 8 karakter.',
            'password.max' => 'Password WiFi maksimal 63 karakter.',
        ]);

        $pppoeUsername = trim((string) $customer->pppoe_username);
        if ($pppoeUsername === '') {
            return response()->json([
                'message' => 'Pelanggan belum memiliki PPPoE username.',
            ], 422);
        }

        try {
            $result = $this->genieAcsService->changeWifiPasswordByPppoe($pppoeUsername, $validated['password']);
            $verificationId = $this->wifiPasswordVerificationService->create(
                $customer,
                $pppoeUsername,
                $validated['password'],
                $result
            );

            $this->auditLogService->log('customer_wifi_password.changed', $customer, [
                'customer_id' => $customer->id,
                'pppoe_username' => $pppoeUsername,
                'device_id' => $result['device_id'] ?? null,
                'updated_ssid_count' => $result['updated_ssid_count'] ?? 0,
                'verification_id' => $verificationId,
            ], auth()->id());

            return response()->json([
                'message' => 'Task ubah password WiFi berhasil dikirim ke GenieACS.',
                'data' => [
                    'device_id' => $result['device_id'] ?? null,
                    'updated_ssid_count' => $result['updated_ssid_count'] ?? 0,
                    'target_ssid_count' => $result['target_ssid_count'] ?? ($result['updated_ssid_count'] ?? 0),
                    'verification_id' => $verificationId,
                    'verification_status' => 'pending',
                    'verified_ssid_count' => 0,
                    'ssids' => $result['ssids'] ?? [],
                ],
            ]);
        } catch (GenieAcsException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], $exception->status());
        }
    }

    public function verification(Customer $customer, string $verificationId)
    {
        $payload = $this->wifiPasswordVerificationService->get($customer, $verificationId);

        if (!$payload) {
            return response()->json([
                'message' => 'Data verifikasi password WiFi tidak ditemukan atau sudah kedaluwarsa.',
            ], 404);
        }

        try {
            $password = $this->wifiPasswordVerificationService->decryptPassword($payload);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Data verifikasi password WiFi tidak valid.',
            ], 422);
        }

        $result = $this->genieAcsService->verifyWifiPasswordByPppoe(
            (string) ($payload['pppoe_username'] ?? $customer->pppoe_username),
            $password,
            (array) ($payload['targets'] ?? [])
        );

        return response()->json([
            'data' => [
                'verification_id' => $verificationId,
                'device_id' => $payload['device_id'] ?? null,
                'status' => $result['status'] ?? 'pending',
                'verified_ssid_count' => $result['verified_ssid_count'] ?? 0,
                'target_ssid_count' => $result['target_ssid_count'] ?? 0,
                'ssids' => collect($result['ssids'] ?? [])
                    ->map(fn (array $ssid) => Arr::except($ssid, ['password_path', 'current_password']))
                    ->values()
                    ->all(),
                'message' => $result['message'] ?? 'Status verifikasi belum tersedia.',
            ],
        ]);
    }

    private function safeDeviceSummary(array $device): array
    {
        return [
            'device_id' => $device['device_id'] ?? null,
            'serial_number' => $device['serial_number'] ?? null,
            'product_class' => $device['product_class'] ?? null,
            'ssids' => collect($device['ssids'] ?? [])
                ->map(fn (array $ssid) => Arr::except($ssid, ['password_path']))
                ->values()
                ->all(),
        ];
    }

}

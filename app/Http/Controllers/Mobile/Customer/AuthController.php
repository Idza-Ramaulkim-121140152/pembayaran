<?php

namespace App\Http\Controllers\Mobile\Customer;

use App\Models\Customer;
use App\Models\MobileCustomerToken;
use App\Services\MobileCustomerAuthLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends BaseMobileCustomerController
{
    private const DEFAULT_PASSWORD = 'user123';
    private const TOKEN_TTL_DAYS = 30;

    public function __construct(private MobileCustomerAuthLogService $authLogService)
    {
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'pppoe_username' => 'required|string|max:64',
            'password' => 'required|string|min:6|max:255',
            'device_name' => 'nullable|string|max:100',
            'device_id' => 'nullable|string|max:100',
        ]);

        $normalizedUsername = strtolower(trim((string) $validated['pppoe_username']));

        $customer = Customer::query()
            ->whereRaw('LOWER(pppoe_username) = ?', [$normalizedUsername])
            ->first();

        if (!$customer) {
            $this->authLogService->write(
                request: $request,
                event: 'login',
                status: 'failed',
                pppoeUsername: $validated['pppoe_username'],
                message: 'Customer not found'
            );

            return response()->json([
                'message' => 'Username PPPoE atau password salah.',
            ], 401);
        }

        if (!(bool) ($customer->portal_login_enabled ?? true)) {
            return response()->json([
                'message' => 'Akses login akun Anda sedang dinonaktifkan. Hubungi admin.',
            ], 403);
        }

        if (empty($customer->mobile_password)) {
            $customer->mobile_password = Hash::make(self::DEFAULT_PASSWORD);
            $customer->mobile_force_password_change = true;
            $customer->mobile_password_changed_at = null;
            $customer->mobile_password_reset_at = now();
            $customer->mobile_password_reset_meta = [
                'reason' => 'autofill_default_password',
            ];
            $customer->save();
        }

        if (!Hash::check($validated['password'], (string) $customer->mobile_password)) {
            $this->authLogService->write(
                request: $request,
                event: 'login',
                status: 'failed',
                customer: $customer,
                message: 'Invalid password'
            );

            return response()->json([
                'message' => 'Username PPPoE atau password salah.',
            ], 401);
        }

        $plainTextToken = Str::random(64);
        $tokenHash = hash('sha256', $plainTextToken);

        MobileCustomerToken::create([
            'customer_id' => $customer->id,
            'token_hash' => $tokenHash,
            'device_name' => $validated['device_name'] ?? 'Android Device',
            'device_id' => $validated['device_id'] ?? null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'last_used_at' => now(),
            'expires_at' => now()->addDays(self::TOKEN_TTL_DAYS),
        ]);

        $this->authLogService->write(
            request: $request,
            event: 'login',
            status: 'success',
            customer: $customer
        );

        return response()->json([
            'message' => 'Login berhasil.',
            'access_token' => $plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => now()->addDays(self::TOKEN_TTL_DAYS)->toIso8601String(),
            'must_change_password' => (bool) $customer->mobile_force_password_change,
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'is_active' => (bool) $customer->is_active,
            ],
        ]);
    }

    public function changePassword(Request $request)
    {
        $customer = $this->customer($request);

        $validated = $request->validate([
            'current_password' => 'required|string|min:6|max:255',
            'new_password' => 'required|string|min:6|max:255|confirmed',
        ]);

        if (!Hash::check($validated['current_password'], (string) $customer->mobile_password)) {
            $this->authLogService->write(
                request: $request,
                event: 'change_password',
                status: 'failed',
                customer: $customer,
                message: 'Current password mismatch'
            );

            return response()->json([
                'message' => 'Password saat ini tidak sesuai.',
            ], 422);
        }

        $customer->mobile_password = Hash::make($validated['new_password']);
        $customer->mobile_force_password_change = false;
        $customer->mobile_password_changed_at = now();
        $customer->save();

        $this->authLogService->write(
            request: $request,
            event: 'change_password',
            status: 'success',
            customer: $customer
        );

        return response()->json([
            'message' => 'Password berhasil diperbarui.',
            'must_change_password' => false,
        ]);
    }

    public function logout(Request $request)
    {
        $token = $this->tokenRecord($request);
        $customer = $this->customer($request);

        $token->revoked_at = now();
        $token->save();

        $this->authLogService->write(
            request: $request,
            event: 'logout',
            status: 'success',
            customer: $customer
        );

        return response()->json([
            'message' => 'Logout berhasil.',
        ]);
    }
}

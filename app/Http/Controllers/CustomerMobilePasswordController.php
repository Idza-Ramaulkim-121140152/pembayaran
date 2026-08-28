<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Services\MobileCustomerAuthLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class CustomerMobilePasswordController extends Controller
{
    private const DEFAULT_PASSWORD = 'user123';

    public function __construct(private MobileCustomerAuthLogService $authLogService)
    {
    }

    public function reset(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'reason' => 'nullable|string|max:255',
        ]);

        $customer->mobile_password = Hash::make(self::DEFAULT_PASSWORD);
        $customer->mobile_force_password_change = true;
        $customer->mobile_password_changed_at = null;
        $customer->mobile_password_reset_at = now();
        $customer->mobile_password_reset_by_user_id = optional($request->user())->id;
        $customer->mobile_password_reset_meta = [
            'reason' => $validated['reason'] ?? 'manual_reset_by_staff',
        ];
        $customer->save();

        $customer->mobileTokens()
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $this->authLogService->write(
            request: $request,
            event: 'reset_password',
            status: 'success',
            customer: $customer,
            message: 'Password reset by staff',
            meta: [
                'staff_user_id' => optional($request->user())->id,
                'reason' => $validated['reason'] ?? null,
            ]
        );

        return response()->json([
            'message' => 'Password mobile pelanggan berhasil direset ke default.',
            'data' => [
                'customer_id' => $customer->id,
                'must_change_password' => true,
                'default_password' => self::DEFAULT_PASSWORD,
            ],
        ]);
    }
}

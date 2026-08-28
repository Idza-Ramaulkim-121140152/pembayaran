<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class CustomerAccountMappingController extends Controller
{
    private const DEFAULT_PASSWORD = 'user123';

    public function index(Request $request)
    {
        $query = Customer::query()->select([
            'id',
            'name',
            'phone',
            'pppoe_username',
            'portal_login_enabled',
            'mobile_force_password_change',
            'mobile_password_changed_at',
            'mobile_password_reset_at',
            'updated_at',
        ]);

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('pppoe_username', 'like', "%{$search}%");
            });
        }

        $query->orderBy('name');

        return response()->json([
            'data' => $query->paginate((int) $request->input('per_page', 20)),
        ]);
    }

    public function update(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'pppoe_username' => 'nullable|string|max:64|unique:customers,pppoe_username,' . $customer->id,
            'phone' => 'nullable|string|max:32|unique:customers,phone,' . $customer->id,
        ]);

        $customer->pppoe_username = $validated['pppoe_username'] ?? null;
        $customer->phone = $validated['phone'] ?? null;
        $customer->save();

        return response()->json([
            'message' => 'Identitas login pelanggan berhasil diperbarui.',
            'data' => $customer->only(['id', 'name', 'phone', 'pppoe_username', 'portal_login_enabled']),
        ]);
    }

    public function setPassword(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'password' => 'required|string|min:6|max:255|confirmed',
        ]);

        $customer->mobile_password = Hash::make($validated['password']);
        $customer->mobile_force_password_change = true;
        $customer->mobile_password_changed_at = null;
        $customer->mobile_password_reset_at = now();
        $customer->mobile_password_reset_by_user_id = optional($request->user())->id;
        $customer->mobile_password_reset_meta = [
            'reason' => 'manual_set_by_superadmin',
        ];
        $customer->save();

        $customer->mobileTokens()->whereNull('revoked_at')->update(['revoked_at' => now()]);

        return response()->json([
            'message' => 'Password pelanggan berhasil diperbarui.',
        ]);
    }

    public function resetPassword(Request $request, Customer $customer)
    {
        $customer->mobile_password = Hash::make(self::DEFAULT_PASSWORD);
        $customer->mobile_force_password_change = true;
        $customer->mobile_password_changed_at = null;
        $customer->mobile_password_reset_at = now();
        $customer->mobile_password_reset_by_user_id = optional($request->user())->id;
        $customer->mobile_password_reset_meta = [
            'reason' => 'reset_to_default_by_superadmin',
        ];
        $customer->save();

        $customer->mobileTokens()->whereNull('revoked_at')->update(['revoked_at' => now()]);

        return response()->json([
            'message' => 'Password pelanggan direset ke default user123.',
            'data' => [
                'default_password' => self::DEFAULT_PASSWORD,
            ],
        ]);
    }

    public function updateLoginStatus(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'portal_login_enabled' => 'required|boolean',
        ]);

        $customer->portal_login_enabled = (bool) $validated['portal_login_enabled'];
        $customer->save();

        if (!$customer->portal_login_enabled) {
            $customer->mobileTokens()->whereNull('revoked_at')->update(['revoked_at' => now()]);
        }

        return response()->json([
            'message' => $customer->portal_login_enabled
                ? 'Akses login pelanggan diaktifkan.'
                : 'Akses login pelanggan dinonaktifkan.',
            'data' => [
                'customer_id' => $customer->id,
                'portal_login_enabled' => (bool) $customer->portal_login_enabled,
            ],
        ]);
    }
}

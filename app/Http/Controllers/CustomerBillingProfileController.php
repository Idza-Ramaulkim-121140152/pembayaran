<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerBillingProfile;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class CustomerBillingProfileController extends Controller
{
    public function __construct(private AuditLogService $auditLogService)
    {
    }

    public function upsert(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'billing_cycle' => 'nullable|in:monthly',
            'billing_day' => 'nullable|integer|min:1|max:28',
            'prorate_policy' => 'nullable|in:daily,half_month,none',
            'addon_bundle' => 'nullable|array',
        ]);

        $profile = CustomerBillingProfile::query()->updateOrCreate(
            ['customer_id' => $customer->id],
            [
                'billing_cycle' => $validated['billing_cycle'] ?? 'monthly',
                'billing_day' => $validated['billing_day'] ?? null,
                'prorate_policy' => $validated['prorate_policy'] ?? 'daily',
                'addon_bundle' => $validated['addon_bundle'] ?? null,
            ]
        );

        $this->auditLogService->log('billing.profile_updated', $customer, [
            'profile' => $profile->toArray(),
        ], auth()->id());

        return response()->json([
            'message' => 'Billing profile berhasil diperbarui.',
            'data' => $profile,
        ]);
    }
}

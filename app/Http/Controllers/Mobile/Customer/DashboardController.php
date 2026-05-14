<?php

namespace App\Http\Controllers\Mobile\Customer;

use App\Services\CustomerPortalService;
use Illuminate\Http\Request;

class DashboardController extends BaseMobileCustomerController
{
    public function __construct(private CustomerPortalService $customerPortalService)
    {
    }

    public function show(Request $request)
    {
        $customer = $this->customer($request)->loadMissing('odp');

        return response()->json([
            'success' => true,
            ...$this->customerPortalService->buildDashboard($customer),
        ]);
    }
}

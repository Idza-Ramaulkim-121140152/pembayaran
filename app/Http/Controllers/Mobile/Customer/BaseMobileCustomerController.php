<?php

namespace App\Http\Controllers\Mobile\Customer;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\MobileCustomerToken;
use Illuminate\Http\Request;

abstract class BaseMobileCustomerController extends Controller
{
    protected function customer(Request $request): Customer
    {
        /** @var Customer|null $customer */
        $customer = $request->attributes->get('mobile_customer');

        abort_if(!$customer, 401, 'Unauthenticated.');

        return $customer;
    }

    protected function tokenRecord(Request $request): MobileCustomerToken
    {
        /** @var MobileCustomerToken|null $token */
        $token = $request->attributes->get('mobile_customer_token');

        abort_if(!$token, 401, 'Unauthenticated.');

        return $token;
    }
}

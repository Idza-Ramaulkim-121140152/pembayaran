<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\MobileCustomerAuthLog;
use Illuminate\Http\Request;

class MobileCustomerAuthLogService
{
    public function write(
        Request $request,
        string $event,
        string $status,
        ?Customer $customer = null,
        ?string $pppoeUsername = null,
        ?string $message = null,
        array $meta = []
    ): void {
        MobileCustomerAuthLog::create([
            'customer_id' => $customer?->id,
            'pppoe_username' => $pppoeUsername ?: $customer?->pppoe_username,
            'event' => $event,
            'status' => $status,
            'message' => $message,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'meta' => $meta,
            'created_at' => now(),
        ]);
    }
}

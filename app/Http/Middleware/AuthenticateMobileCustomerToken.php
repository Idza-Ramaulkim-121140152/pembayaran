<?php

namespace App\Http\Middleware;

use App\Models\MobileCustomerToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateMobileCustomerToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $tokenHash = hash('sha256', $token);

        $record = MobileCustomerToken::query()
            ->with('customer')
            ->active()
            ->where('token_hash', $tokenHash)
            ->first();

        if (!$record || !$record->customer) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $record->forceFill([
            'last_used_at' => now(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ])->save();

        $request->attributes->set('mobile_customer', $record->customer);
        $request->attributes->set('mobile_customer_token', $record);

        return $next($request);
    }
}

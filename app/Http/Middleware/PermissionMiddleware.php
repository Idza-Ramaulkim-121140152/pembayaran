<?php

namespace App\Http\Middleware;

use App\Services\AccessPolicyService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PermissionMiddleware
{
    public function __construct(private AccessPolicyService $accessPolicyService)
    {
    }

    public function handle(Request $request, Closure $next, string $permissionKey): Response
    {
        if (!auth()->check()) {
            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json(['error' => 'Unauthenticated.'], 401);
            }

            return redirect('/login');
        }

        $user = auth()->user();

        if (!$this->accessPolicyService->has($user, $permissionKey)) {
            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json([
                    'error' => 'Forbidden by access policy.',
                    'permission' => $permissionKey,
                ], 403);
            }

            abort(403, 'Forbidden by access policy.');
        }

        return $next($request);
    }
}

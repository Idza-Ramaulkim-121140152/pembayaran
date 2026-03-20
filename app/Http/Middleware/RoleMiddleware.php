<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    /**
     * Handle an incoming request.
     * Usage: ->middleware('role:admin,teknisi') — allows superadmin + listed roles
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        if (!auth()->check()) {
            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json(['error' => 'Unauthenticated.'], 401);
            }
            return redirect('/login');
        }

        $user = auth()->user();

        // Superadmin always has access
        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        // Admin has access to everything except superadmin-only routes
        if ($user->isAdmin() && !in_array('superadmin', $roles)) {
            return $next($request);
        }

        // Check if user's role is in the allowed roles
        if ($user->hasRole(...$roles)) {
            return $next($request);
        }

        if ($request->wantsJson() || $request->is('api/*')) {
            return response()->json(['error' => 'Unauthorized. Insufficient permissions.'], 403);
        }
        abort(403, 'Unauthorized. Insufficient permissions.');
    }
}

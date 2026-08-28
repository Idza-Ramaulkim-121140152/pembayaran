<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\AuditLogService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class AuthenticatedSessionController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /**
     * Display the login view.
     */
    public function create()
    {
        // Return React app for SPA
        return view('app');
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request)
    {
        $request->authenticate();

        $request->session()->regenerate();

        $this->auditLogService->log('auth.login', $request->user(), [
            'ip' => $request->ip(),
            'user_agent' => (string) $request->userAgent(),
        ], $request->user()?->id);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'message' => 'Login successful',
                'user' => $request->user(),
                'redirect' => '/dashboard'
            ]);
        }

        return redirect()->intended('/dashboard');
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $user = $request->user();
        if ($user) {
            $this->auditLogService->log('auth.logout', $user, [
                'ip' => $request->ip(),
                'user_agent' => (string) $request->userAgent(),
            ], $user->id);
        }

        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
    }
}

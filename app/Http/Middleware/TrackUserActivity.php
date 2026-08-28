<?php

namespace App\Http\Middleware;

use App\Services\AuditLogService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class TrackUserActivity
{
    private const SENSITIVE_KEYS = [
        'password',
        'password_confirmation',
        'current_password',
        'token',
        'remember_token',
        'secret',
        'api_key',
        'authorization',
    ];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $user = $request->user();
        if (!$user || $this->shouldSkip($request)) {
            return $response;
        }

        $this->auditLogService->log(
            $this->resolveEventType($request),
            null,
            [
                'method' => $request->method(),
                'path' => '/' . ltrim($request->path(), '/'),
                'route_name' => $request->route()?->getName(),
                'status_code' => $response->getStatusCode(),
                'ip' => $request->ip(),
                'user_agent' => Str::limit((string) $request->userAgent(), 500, ''),
                'query' => $this->sanitizePayload($request->query()),
                'body' => $this->sanitizePayload($request->except(['_token', '_method'])),
                'route_params' => $this->sanitizePayload($this->routeParameters($request)),
            ],
            (int) $user->id,
        );

        return $response;
    }

    private function shouldSkip(Request $request): bool
    {
        if ($request->routeIs('api.system-activity-logs.index', 'settings.system-logs')) {
            return true;
        }

        if ($request->routeIs('api.access-control.me', 'api.payment-receiver-approvals.pending')) {
            return true;
        }

        if ($request->is('api/whatsapp/status')) {
            return true;
        }

        return false;
    }

    private function resolveEventType(Request $request): string
    {
        if ($request->isMethod('GET')) {
            return $request->is('api/*') ? 'activity.api_read' : 'activity.page_view';
        }

        return 'activity.account_action';
    }

    private function routeParameters(Request $request): array
    {
        $route = $request->route();
        if (!$route) {
            return [];
        }

        $parameters = [];
        foreach ($route->parameters() as $key => $value) {
            if (is_object($value) && method_exists($value, 'getKey')) {
                $parameters[$key] = [
                    'type' => $value::class,
                    'id' => $value->getKey(),
                ];
                continue;
            }

            $parameters[$key] = $value;
        }

        return $parameters;
    }

    private function sanitizePayload(mixed $value, ?string $key = null): mixed
    {
        if ($key !== null && in_array(Str::lower($key), self::SENSITIVE_KEYS, true)) {
            return '[REDACTED]';
        }

        if ($value instanceof UploadedFile) {
            return [
                'uploaded_file' => true,
                'name' => $value->getClientOriginalName(),
                'size' => $value->getSize(),
            ];
        }

        if (is_array($value)) {
            $sanitized = [];
            foreach ($value as $childKey => $childValue) {
                $sanitized[$childKey] = $this->sanitizePayload($childValue, is_string($childKey) ? $childKey : null);
            }

            return $sanitized;
        }

        if (is_string($value) && Str::length($value) > 1000) {
            return Str::limit($value, 1000, '...');
        }

        return $value;
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\SystemAuditLog;
use Illuminate\Http\Request;

class SystemActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'actor_id' => 'nullable|integer|exists:users,id',
            'event_type' => 'nullable|string|max:120',
            'method' => 'nullable|string|max:10',
            'status_code' => 'nullable|integer|min:100|max:599',
            'search' => 'nullable|string|max:255',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = SystemAuditLog::query()
            ->with('actor:id,name,email,role')
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if (!empty($validated['actor_id'])) {
            $query->where('actor_id', $validated['actor_id']);
        }

        if (!empty($validated['event_type'])) {
            $query->where('event_type', $validated['event_type']);
        }

        if (!empty($validated['method'])) {
            $query->whereRaw(
                "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.method')) = ?",
                [strtoupper((string) $validated['method'])]
            );
        }

        if (!empty($validated['status_code'])) {
            $query->whereRaw(
                "CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status_code')) AS UNSIGNED) = ?",
                [(int) $validated['status_code']]
            );
        }

        if (!empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $like = '%' . $search . '%';

            $query->where(function ($builder) use ($like) {
                $builder
                    ->where('event_type', 'like', $like)
                    ->orWhere('subject_type', 'like', $like)
                    ->orWhereHas('actor', function ($actorQuery) use ($like) {
                        $actorQuery->where('name', 'like', $like)
                            ->orWhere('email', 'like', $like);
                    })
                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(payload, '$.path')) LIKE ?", [$like])
                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(payload, '$.route_name')) LIKE ?", [$like]);
            });
        }

        $logs = $query->paginate((int) ($validated['per_page'] ?? 30));
        $eventTypes = SystemAuditLog::query()
            ->select('event_type')
            ->distinct()
            ->orderBy('event_type')
            ->pluck('event_type');

        $logs->getCollection()->transform(function (SystemAuditLog $log) {
            $payload = is_array($log->payload) ? $log->payload : [];

            return [
                'id' => $log->id,
                'event_type' => $log->event_type,
                'subject_type' => $log->subject_type,
                'subject_id' => $log->subject_id,
                'created_at' => optional($log->created_at)?->toISOString(),
                'actor' => $log->actor ? [
                    'id' => $log->actor->id,
                    'name' => $log->actor->name,
                    'email' => $log->actor->email,
                    'role' => $log->actor->role,
                ] : null,
                'payload' => $payload,
                'method' => $payload['method'] ?? null,
                'path' => $payload['path'] ?? null,
                'route_name' => $payload['route_name'] ?? null,
                'status_code' => $payload['status_code'] ?? null,
            ];
        });

        return response()->json([
            'data' => $logs,
            'meta' => [
                'event_types' => $eventTypes,
            ],
        ]);
    }
}

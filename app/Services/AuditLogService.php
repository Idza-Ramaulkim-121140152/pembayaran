<?php

namespace App\Services;

use App\Models\SystemAuditLog;
use Illuminate\Database\Eloquent\Model;

class AuditLogService
{
    public function log(string $eventType, ?Model $subject = null, array $payload = [], ?int $actorId = null): void
    {
        try {
            SystemAuditLog::create([
                'event_type' => $eventType,
                'subject_type' => $subject ? $subject::class : null,
                'subject_id' => $subject?->getKey(),
                'actor_id' => $actorId,
                'payload' => $payload,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

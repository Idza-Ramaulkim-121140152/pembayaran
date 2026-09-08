<?php

namespace App\Services;

use App\Models\SystemAuditLog;
use Illuminate\Database\Eloquent\Model;

class AuditLogService
{
    public function log(mixed $eventType, mixed $subject = null, mixed $payload = [], mixed $actorId = null): void
    {
        try {
            // Support both standard signature (string $eventType, ?Model $subject, array $payload, ?int $actorId)
            // and legacy/inverted signature (?Model $actor, string $eventType, string $description, array $payload)
            if ($eventType instanceof Model && is_string($subject)) {
                $actualActor = $eventType;
                $actualEvent = $subject;
                $actualSubject = null;
                $actualPayload = is_array($actorId) ? $actorId : (is_array($payload) ? $payload : []);
                if (is_string($payload) && !empty($payload)) {
                    $actualPayload['description'] = $payload;
                }
                $actualActorId = $actualActor->getKey();
            } else {
                $actualEvent = is_string($eventType) ? $eventType : 'system.event';
                $actualSubject = $subject instanceof Model ? $subject : null;
                $actualPayload = is_array($payload) ? $payload : (is_string($payload) ? ['description' => $payload] : []);
                $actualActorId = is_numeric($actorId) ? (int)$actorId : ($actorId instanceof Model ? $actorId->getKey() : null);
            }

            SystemAuditLog::create([
                'event_type' => $actualEvent,
                'subject_type' => $actualSubject ? $actualSubject::class : null,
                'subject_id' => $actualSubject?->getKey(),
                'actor_id' => $actualActorId,
                'payload' => $actualPayload,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

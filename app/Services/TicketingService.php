<?php

namespace App\Services;

use App\Models\Complaint;
use App\Models\ComplaintEvent;
use App\Models\SlaPolicy;

class TicketingService
{
    public function applySla(Complaint $complaint): Complaint
    {
        $policy = SlaPolicy::query()
            ->where('priority', $complaint->priority)
            ->where('is_active', true)
            ->where(function ($query) use ($complaint) {
                $query->whereNull('cause_category_id')
                    ->orWhere('cause_category_id', $complaint->root_cause_id);
            })
            ->orderByDesc('cause_category_id')
            ->first();

        if (!$policy) {
            return $complaint;
        }

        $openedAt = $complaint->opened_at ?: now();
        $complaint->opened_at = $openedAt;
        $complaint->sla_first_response_due_at = $openedAt->copy()->addMinutes((int) $policy->first_response_minutes);
        $complaint->sla_resolution_due_at = $openedAt->copy()->addMinutes((int) $policy->resolution_minutes);
        $complaint->save();

        return $complaint;
    }

    public function logEvent(Complaint $complaint, string $eventType, ?string $message, bool $isInternal, ?int $userId, array $meta = []): void
    {
        ComplaintEvent::create([
            'complaint_id' => $complaint->id,
            'event_type' => $eventType,
            'message' => $message,
            'is_internal' => $isInternal,
            'created_by' => $userId,
            'meta' => $meta,
        ]);

        $complaint->last_activity_at = now();
        $complaint->save();
    }

    public function generateTicketNumber(Complaint $complaint): string
    {
        return sprintf('TCK-%s-%06d', now()->format('Ymd'), $complaint->id);
    }
}

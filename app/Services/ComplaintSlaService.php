<?php

namespace App\Services;

use App\Models\Complaint;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

class ComplaintSlaService
{
    public function __construct(
        private TicketingService $ticketingService,
        private InternalAlertService $internalAlertService
    ) {
    }

    public function liveBoard(): array
    {
        $now = now();
        $query = Complaint::query()
            ->with(['customer:id,name,phone', 'assignee:id,name', 'rootCause:id,name'])
            ->whereNotIn('status', ['resolved', 'closed']);

        $tickets = $query->orderByRaw('COALESCE(sla_resolution_due_at, created_at) ASC')->get();

        $decorate = fn (Complaint $complaint) => $this->ticketPayload($complaint, $now);

        return [
            'summary' => [
                'open_total' => $tickets->count(),
                'breached_total' => $tickets->filter(fn ($ticket) => $this->isBreached($ticket, $now))->count(),
                'due_soon_total' => $tickets->filter(fn ($ticket) => $this->isDueSoon($ticket, $now))->count(),
                'unassigned_total' => $tickets->whereNull('assigned_to')->count(),
                'generated_at' => $now->toIso8601String(),
            ],
            'breached' => $tickets->filter(fn ($ticket) => $this->isBreached($ticket, $now))->map($decorate)->values(),
            'due_soon' => $tickets->filter(fn ($ticket) => $this->isDueSoon($ticket, $now))->map($decorate)->values(),
            'unassigned' => $tickets->whereNull('assigned_to')->map($decorate)->values(),
            'by_priority' => $tickets->groupBy('priority')->map->count(),
            'by_assignee' => $tickets->groupBy(fn ($ticket) => $ticket->assignee?->name ?: 'Belum ditugaskan')->map->count(),
        ];
    }

    public function watchBreaches(): array
    {
        if (!Schema::hasTable('complaints') || !Schema::hasTable('complaint_events')) {
            return ['checked' => 0, 'created' => 0];
        }

        $created = 0;
        $now = now();

        $tickets = Complaint::query()
            ->whereNotIn('status', ['resolved', 'closed'])
            ->where(function ($query) use ($now) {
                $query->where(function ($q) use ($now) {
                    $q->whereNull('first_response_at')
                        ->whereNotNull('sla_first_response_due_at')
                        ->where('sla_first_response_due_at', '<', $now);
                })->orWhere(function ($q) use ($now) {
                    $q->whereNotNull('sla_resolution_due_at')
                        ->where('sla_resolution_due_at', '<', $now);
                });
            })
            ->get();

        foreach ($tickets as $ticket) {
            $types = [];
            if (!$ticket->first_response_at && $ticket->sla_first_response_due_at?->lt($now)) {
                $types[] = 'first_response';
            }
            if ($ticket->sla_resolution_due_at?->lt($now)) {
                $types[] = 'resolution';
            }

            foreach ($types as $type) {
                $exists = $ticket->events()
                    ->where('event_type', 'sla_breached')
                    ->where('meta->breach_type', $type)
                    ->exists();

                if ($exists) {
                    continue;
                }

                $this->ticketingService->logEvent(
                    $ticket,
                    'sla_breached',
                    $type === 'first_response' ? 'SLA first response terlewati.' : 'SLA resolution terlewati.',
                    true,
                    null,
                    ['breach_type' => $type, 'breached_at' => $now->toIso8601String()]
                );

                $this->internalAlertService->send(
                    $this->buildBreachMessage($ticket, $type),
                    'sla_breach_alert',
                    ['complaint_id' => $ticket->id, 'breach_type' => $type],
                    [User::ROLE_SUPERADMIN, User::ROLE_ADMIN, User::ROLE_TEKNISI]
                );

                $created++;
            }
        }

        return ['checked' => $tickets->count(), 'created' => $created];
    }

    private function isBreached(Complaint $ticket, $now): bool
    {
        return (!$ticket->first_response_at && $ticket->sla_first_response_due_at?->lt($now))
            || $ticket->sla_resolution_due_at?->lt($now);
    }

    private function isDueSoon(Complaint $ticket, $now): bool
    {
        $limit = $now->copy()->addHours(2);

        return !$this->isBreached($ticket, $now)
            && (
                (!$ticket->first_response_at && $ticket->sla_first_response_due_at?->between($now, $limit))
                || $ticket->sla_resolution_due_at?->between($now, $limit)
            );
    }

    private function ticketPayload(Complaint $ticket, $now): array
    {
        return [
            'id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'subject' => $ticket->subject,
            'status' => $ticket->status,
            'priority' => $ticket->priority,
            'customer_name' => $ticket->customer?->name,
            'assignee_name' => $ticket->assignee?->name,
            'root_cause' => $ticket->rootCause?->name,
            'sla_first_response_due_at' => $ticket->sla_first_response_due_at?->toIso8601String(),
            'sla_resolution_due_at' => $ticket->sla_resolution_due_at?->toIso8601String(),
            'is_breached' => $this->isBreached($ticket, $now),
            'is_due_soon' => $this->isDueSoon($ticket, $now),
        ];
    }

    private function buildBreachMessage(Complaint $ticket, string $type): string
    {
        $label = $type === 'first_response' ? 'First Response' : 'Resolution';

        return "[SLA BREACH]\n"
            . "Tiket: {$ticket->ticket_number}\n"
            . "Jenis: {$label}\n"
            . "Prioritas: {$ticket->priority}\n"
            . "Subjek: {$ticket->subject}\n"
            . 'Waktu: ' . now()->timezone('Asia/Jakarta')->format('d-m-Y H:i:s') . ' WIB';
    }
}

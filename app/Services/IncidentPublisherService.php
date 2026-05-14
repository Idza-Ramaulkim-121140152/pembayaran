<?php

namespace App\Services;

use App\Models\IncidentEvent;
use App\Models\NetworkIncident;
use App\Models\NetworkNotice;
use App\Models\User;

class IncidentPublisherService
{
    public function publish(NetworkIncident $incident, ?int $userId = null): void
    {
        $incident->loadMissing('odps');

        NetworkNotice::updateOrCreate(
            ['network_incident_id' => $incident->id],
            [
                'title' => $incident->title,
                'message' => $incident->meta['message'] ?? $incident->title,
                'type' => 'gangguan',
                'severity' => $incident->severity,
                'is_mass' => true,
                'affected_area' => $incident->meta['affected_area'] ?? null,
                'affected_odp' => $incident->odps->pluck('nama')->implode(', '),
                'start_time' => $incident->started_at,
                'end_time' => $incident->resolved_at,
                'is_active' => $incident->status === 'open',
                'created_by' => $userId,
            ]
        );

        IncidentEvent::create([
            'network_incident_id' => $incident->id,
            'event_type' => 'notice_published',
            'message' => 'Incident dipublikasikan ke status jaringan.',
            'created_by' => $userId,
            'meta' => [
                'status' => $incident->status,
            ],
        ]);

        $this->logInternalRecipients($incident, $userId);
    }

    private function logInternalRecipients(NetworkIncident $incident, ?int $userId = null): void
    {
        $recipientIds = User::query()
            ->whereIn('role', [User::ROLE_TEKNISI, User::ROLE_ADMIN, User::ROLE_SUPERADMIN])
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        IncidentEvent::create([
            'network_incident_id' => $incident->id,
            'event_type' => 'manual_update',
            'message' => 'Notifikasi internal incident dikirim ke teknisi/admin/superadmin.',
            'created_by' => $userId,
            'meta' => [
                'recipient_user_ids' => $recipientIds,
                'recipient_count' => count($recipientIds),
                'incident_status' => $incident->status,
            ],
        ]);
    }
}

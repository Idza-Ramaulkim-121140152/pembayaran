<?php

namespace App\Services;

use App\Models\NotificationLog;
use App\Models\User;
use Illuminate\Support\Facades\Http;

class InternalAlertService
{
    public function send(string $message, string $type, array $meta = [], array $roles = [User::ROLE_SUPERADMIN, User::ROLE_ADMIN, User::ROLE_TEKNISI]): void
    {
        $recipients = User::query()
            ->with('payrollMember:id,telepon')
            ->whereIn('role', $roles)
            ->get()
            ->map(fn (User $user) => [
                'phone' => trim((string) ($user->payrollMember?->telepon ?? '')),
                'name' => $user->name,
            ])
            ->filter(fn (array $recipient) => $recipient['phone'] !== '')
            ->unique('phone')
            ->values()
            ->all();

        $this->sendToRecipients($recipients, $message, $type, $meta, 'Tidak ada nomor internal role target.');
    }

    public function sendToRecipients(array $recipients, string $message, string $type, array $meta = [], string $emptyReason = 'Tidak ada penerima notifikasi.'): void
    {
        $recipients = collect($recipients)
            ->filter(fn ($recipient) => is_array($recipient))
            ->map(function (array $recipient): array {
                return [
                    'phone' => trim((string) ($recipient['phone'] ?? '')),
                    'name' => trim((string) ($recipient['name'] ?? '')),
                ];
            })
            ->filter(fn (array $recipient) => $recipient['phone'] !== '')
            ->unique('phone')
            ->values()
            ->all();

        if (count($recipients) === 0) {
            NotificationLog::create([
                'phone' => null,
                'message' => $message,
                'status' => 'skipped',
                'error' => $emptyReason,
                'meta' => array_merge($meta, ['type' => $type]),
                'sent_at' => now(),
            ]);
            return;
        }

        try {
            $response = Http::timeout(60)->post(rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/') . '/send-bulk', [
                'recipients' => $recipients,
                'message' => $message,
                'delay' => 1000,
            ]);

            $gateway = $response->json();
            $results = is_array($gateway['results'] ?? null) ? $gateway['results'] : [];

            if (count($results) === 0) {
                foreach ($recipients as $recipient) {
                    NotificationLog::create([
                        'phone' => $recipient['phone'],
                        'message' => $message,
                        'status' => $response->successful() ? 'sent' : 'failed',
                        'error' => $response->successful() ? null : ($gateway['error'] ?? 'Gateway response invalid'),
                        'meta' => array_merge($meta, ['type' => $type]),
                        'sent_at' => now(),
                    ]);
                }
                return;
            }

            foreach ($results as $result) {
                NotificationLog::create([
                    'phone' => $result['phone'] ?? null,
                    'message' => $message,
                    'status' => ($result['success'] ?? false) ? 'sent' : 'failed',
                    'error' => $result['error'] ?? null,
                    'meta' => array_merge($meta, ['type' => $type]),
                    'sent_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            foreach ($recipients as $recipient) {
                NotificationLog::create([
                    'phone' => $recipient['phone'],
                    'message' => $message,
                    'status' => 'failed',
                    'error' => 'Gateway error: ' . $e->getMessage(),
                    'meta' => array_merge($meta, ['type' => $type]),
                    'sent_at' => now(),
                ]);
            }
        }
    }
}

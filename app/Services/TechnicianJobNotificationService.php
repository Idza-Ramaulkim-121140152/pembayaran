<?php

namespace App\Services;

use App\Models\NotificationLog;
use App\Models\TechnicianJob;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TechnicianJobNotificationService
{
    /**
     * Handle initial notification upon job creation according to 08:00 WIB cutoff rule.
     */
    public function handleJobCreatedNotification(TechnicianJob $job): array
    {
        $now = Carbon::now('Asia/Jakarta');
        $cutoffToday = $now->copy()->setTime(8, 0, 0);

        // 1. Hari Minggu teknisi libur operasional: JANGAN kirim pesan di hari Minggu
        if ($now->isSunday()) {
            $nextMondayAt8 = $now->copy()->next(Carbon::MONDAY)->setTime(8, 0, 0);
            $job->scheduled_notify_at = $nextMondayAt8;
            $job->notified_at = null;
            $job->save();

            return [
                'immediate' => false,
                'scheduled_for' => $nextMondayAt8->toDateTimeString(),
                'message' => 'Hari Minggu teknisi libur. Notifikasi penugasan pekerjaan dijadwalkan otomatis pada hari Senin jam 08.00 WIB saat mulai bekerja.',
            ];
        }

        // 2. Hari kerja (Senin - Sabtu):
        if ($now->greaterThanOrEqualTo($cutoffToday)) {
            // Dibuat pada atau setelah jam 08.00 WIB -> kirim langsung
            $results = $this->sendJobAssignmentNotification($job, isReminder: false);
            $job->notified_at = now();
            $job->scheduled_notify_at = null;
            $job->save();

            return [
                'immediate' => true,
                'sent_at' => $now->toDateTimeString(),
                'results' => $results,
                'message' => 'Pesan penugasan pekerjaan telah langsung dikirim ke WhatsApp teknisi.',
            ];
        }

        // Dibuat sebelum jam 08.00 WIB -> jadwalkan jam 08.00 WIB hari ini
        $job->scheduled_notify_at = $cutoffToday;
        $job->notified_at = null;
        $job->save();

        return [
            'immediate' => false,
            'scheduled_for' => $cutoffToday->toDateTimeString(),
            'message' => 'Pekerjaan dibuat sebelum jam 08.00 WIB. Notifikasi WA dijadwalkan otomatis pada jam 08.00 WIB hari ini.',
        ];
    }

    /**
     * Send WhatsApp notification to all assigned technicians for a job.
     */
    public function sendJobAssignmentNotification(TechnicianJob $job, bool $isReminder = false): array
    {
        $job->loadMissing(['technicians', 'customer', 'odp', 'creator']);
        $results = [];

        foreach ($job->technicians as $technician) {
            $phone = trim((string) ($technician->phone ?? ''));
            if (!$this->isValidPhone($phone)) {
                $results[] = [
                    'technician_id' => $technician->id,
                    'name' => $technician->name,
                    'success' => false,
                    'error' => 'Nomor WhatsApp tidak valid atau kosong',
                ];
                continue;
            }

            $message = $isReminder
                ? $this->buildReminderMessage($job, $technician)
                : $this->buildNewJobMessage($job, $technician);

            $res = $this->sendWhatsApp($phone, $technician->name, $message);
            $this->logNotification($job, $technician, $phone, $message, $res['success'], $res['error'] ?? null);

            $results[] = [
                'technician_id' => $technician->id,
                'name' => $technician->name,
                'phone' => $phone,
                'success' => $res['success'],
                'error' => $res['error'] ?? null,
            ];
        }

        return $results;
    }

    /**
     * Send daily 08:00 AM reminders for pending/uncompleted jobs.
     * Note: Sundays are off (libur), no reminder is sent!
     */
    public function sendMorningReminders(): array
    {
        $now = Carbon::now('Asia/Jakarta');

        // Check if Sunday (Hari Minggu Libur)
        if ($now->isSunday()) {
            return [
                'skipped' => true,
                'reason' => 'Hari Minggu libur operasional, tidak ada pengiriman pengingat WA.',
                'sent_count' => 0,
            ];
        }

        $todayStart = $now->copy()->startOfDay();

        // 1. Jobs scheduled for today at 08:00 AM that have not been notified
        // 2. Incomplete active jobs created before today (or before 08:00 AM today)
        $activeJobs = TechnicianJob::query()
            ->where('status', TechnicianJob::STATUS_ACTIVE)
            ->where(function ($query) use ($now, $todayStart) {
                // Scheduled to notify on or before now, but not yet notified
                $query->where(function ($q) use ($now) {
                    $q->whereNull('notified_at')
                      ->where('scheduled_notify_at', '<=', $now);
                })
                // OR active jobs created before today that are still incomplete
                ->orWhere('created_at', '<', $todayStart);
            })
            ->with(['technicians', 'customer', 'odp', 'creator'])
            ->get();

        $sentCount = 0;
        $jobResults = [];

        foreach ($activeJobs as $job) {
            $isFirstNotification = is_null($job->notified_at);
            $sendResults = $this->sendJobAssignmentNotification($job, isReminder: !$isFirstNotification);

            $job->last_reminder_at = now();
            if ($isFirstNotification) {
                $job->notified_at = now();
            }
            $job->save();

            $jobResults[] = [
                'job_id' => $job->id,
                'job_number' => $job->job_number,
                'is_first_notification' => $isFirstNotification,
                'technicians' => $sendResults,
            ];

            $sentCount++;
        }

        return [
            'skipped' => false,
            'processed_jobs_count' => $sentCount,
            'details' => $jobResults,
        ];
    }

    /**
     * Formats WhatsApp message for a newly assigned job.
     */
    public function buildNewJobMessage(TechnicianJob $job, User $technician): string
    {
        $appUrl = rtrim((string) config('app.url', 'http://localhost'), '/');
        $jobUrl = "{$appUrl}/monitoring-pekerjaan?job={$job->id}";
        $allTechs = $job->technicians->pluck('name')->join(', ') ?: $technician->name;

        return "👷 *PENUGASAN PEKERJAAN BARU*\n\n" .
            "Halo *{$technician->name}*,\n" .
            "Anda mendapatkan penugasan pekerjaan dari *{$job->creator?->name}*:\n\n" .
            "🆔 *No. Tiket:* {$job->job_number}\n" .
            "📌 *Jenis:* {$job->type_label}\n" .
            "⚡ *Prioritas:* " . strtoupper($job->priority) . "\n" .
            "🎯 *Target / Lokasi:* {$job->target_summary}\n" .
            "📝 *Catatan / Kendala:* " . ($job->description ?: '-') . "\n" .
            "👥 *Tim Teknisi:* {$allTechs}\n\n" .
            "Silakan buka link berikut untuk melihat detail dan menyelesaikan tugas:\n" .
            "🔗 {$jobUrl}\n\n" .
            "_(Pemberitahuan otomatis sistem Monitoring Pekerjaan)_";
    }

    /**
     * Formats WhatsApp message for 08:00 AM morning reminder for unfinished jobs.
     */
    public function buildReminderMessage(TechnicianJob $job, User $technician): string
    {
        $appUrl = rtrim((string) config('app.url', 'http://localhost'), '/');
        $jobUrl = "{$appUrl}/monitoring-pekerjaan?job={$job->id}";

        return "⏰ *PENGINGAT PEKERJAAN BELUM SELESAI (08:00 WIB)*\n\n" .
            "Halo *{$technician->name}*,\n" .
            "Tugas berikut masih berstatus *AKTIF* dan belum diselesaikan dari hari sebelumnya:\n\n" .
            "🆔 *No. Tiket:* {$job->job_number}\n" .
            "📌 *Jenis:* {$job->type_label}\n" .
            "🎯 *Target / Lokasi:* {$job->target_summary}\n" .
            "📝 *Catatan / Kendala:* " . ($job->description ?: '-') . "\n\n" .
            "Mohon segera diselesaikan hari ini dan lampirkan bukti foto pengerjaan melalui link:\n" .
            "🔗 {$jobUrl}\n\n" .
            "Terima kasih atas dedikasi dan kerja kerasnya!";
    }

    /**
     * Send message to WhatsApp gateway.
     */
    public function sendWhatsApp(string $phone, string $name, string $message): array
    {
        try {
            $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
            $response = Http::timeout(30)->post($gatewayUrl . '/send', [
                'phone' => $phone,
                'name' => $name,
                'message' => $message,
            ]);

            if ($response->successful()) {
                $payload = $response->json();
                if (is_array($payload) && array_key_exists('success', $payload) && !$payload['success']) {
                    return ['success' => false, 'error' => (string) ($payload['message'] ?? 'gateway_rejected')];
                }

                return ['success' => true, 'error' => null];
            }

            return ['success' => false, 'error' => 'HTTP error ' . $response->status()];
        } catch (\Throwable $e) {
            Log::warning('TechnicianJob WhatsApp gateway error: ' . $e->getMessage());
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);
        return strlen((string) $cleaned) >= 9 && strlen((string) $cleaned) <= 16;
    }

    private function logNotification(
        TechnicianJob $job,
        User $technician,
        string $phone,
        string $message,
        bool $success,
        ?string $error
    ): void {
        try {
            NotificationLog::create([
                'user_id' => $technician->id,
                'customer_id' => $job->customer_id,
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'status' => $success ? 'sent' : 'failed',
                'error' => $error,
                'meta' => [
                    'channel' => 'whatsapp',
                    'type' => 'technician_job_assignment',
                    'job_id' => $job->id,
                    'job_number' => $job->job_number,
                ],
                'sent_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to log technician job notification: ' . $e->getMessage());
        }
    }
}

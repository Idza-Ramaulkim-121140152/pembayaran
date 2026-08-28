<?php

namespace App\Services;

use App\Models\SchedulerHeartbeat;
use App\Models\SystemHealthCheck;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class SystemHealthService
{
    public function __construct(private InternalAlertService $internalAlertService)
    {
    }

    public function runChecks(bool $alert = true): array
    {
        if (!Schema::hasTable('system_health_checks')) {
            return ['status' => 'degraded', 'checks' => [], 'message' => 'Tabel health belum tersedia.'];
        }

        $checks = [
            $this->checkDatabase(),
            $this->checkStorage(),
            $this->checkBuildManifest(),
            $this->checkQueue(),
            $this->checkScheduler(),
            $this->checkBackupFreshness(),
            $this->checkWhatsApp(),
            $this->checkMikroTik(),
        ];

        foreach ($checks as $check) {
            $previous = SystemHealthCheck::query()->where('check_key', $check['check_key'])->first();
            $record = SystemHealthCheck::query()->updateOrCreate(
                ['check_key' => $check['check_key']],
                [
                    'label' => $check['label'],
                    'status' => $check['status'],
                    'message' => $check['message'] ?? null,
                    'meta' => $check['meta'] ?? [],
                    'checked_at' => now(),
                ]
            );

            if ($alert && $previous && $previous->status === 'healthy' && in_array($record->status, ['degraded', 'down'], true)) {
                $this->alertHealthChange($record);
                $record->last_alerted_at = now();
                $record->save();
            }
        }

        return $this->dashboard();
    }

    public function dashboard(): array
    {
        $checks = Schema::hasTable('system_health_checks')
            ? SystemHealthCheck::query()->orderBy('check_key')->get()
            : collect();
        $heartbeats = Schema::hasTable('scheduler_heartbeats')
            ? SchedulerHeartbeat::query()->orderBy('command')->get()
            : collect();

        $status = 'healthy';
        if ($checks->contains('status', 'down')) {
            $status = 'down';
        } elseif ($checks->contains('status', 'degraded') || $checks->isEmpty()) {
            $status = 'degraded';
        }

        return [
            'status' => $status,
            'summary' => [
                'healthy' => $checks->where('status', 'healthy')->count(),
                'degraded' => $checks->where('status', 'degraded')->count(),
                'down' => $checks->where('status', 'down')->count(),
                'unknown' => $checks->where('status', 'unknown')->count(),
                'generated_at' => now()->toIso8601String(),
            ],
            'checks' => $checks->values(),
            'scheduler_heartbeats' => $heartbeats->values(),
        ];
    }

    public function recordHeartbeat(string $command, string $status, ?string $message, ?int $durationMs = null, array $meta = []): void
    {
        if (!Schema::hasTable('scheduler_heartbeats')) {
            return;
        }

        SchedulerHeartbeat::query()->updateOrCreate(
            ['command' => $command],
            [
                'status' => $status,
                'message' => $message,
                'last_started_at' => $meta['started_at'] ?? now(),
                'last_finished_at' => now(),
                'last_duration_ms' => $durationMs,
                'meta' => $meta,
            ]
        );
    }

    private function checkDatabase(): array
    {
        try {
            DB::select('select 1');
            return $this->check('database', 'Database', 'healthy', 'Koneksi database normal.');
        } catch (\Throwable $e) {
            return $this->check('database', 'Database', 'down', $e->getMessage());
        }
    }

    private function checkStorage(): array
    {
        try {
            $path = 'healthcheck.tmp';
            Storage::disk('local')->put($path, (string) now());
            Storage::disk('local')->delete($path);
            return $this->check('storage', 'Storage Writable', 'healthy', 'Storage bisa ditulis.');
        } catch (\Throwable $e) {
            return $this->check('storage', 'Storage Writable', 'down', $e->getMessage());
        }
    }

    private function checkBuildManifest(): array
    {
        $exists = File::exists(public_path('build/manifest.json'));
        return $this->check('build_manifest', 'Frontend Build Manifest', $exists ? 'healthy' : 'degraded', $exists ? 'Build manifest tersedia.' : 'Build manifest tidak ditemukan.');
    }

    private function checkQueue(): array
    {
        $pending = Schema::hasTable('jobs') ? DB::table('jobs')->count() : null;
        $failed = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : null;
        $status = ($failed ?? 0) > 0 ? 'degraded' : 'healthy';

        return $this->check('queue', 'Queue', $status, "Pending: " . ($pending ?? 0) . ", failed: " . ($failed ?? 0), [
            'pending_jobs' => $pending,
            'failed_jobs' => $failed,
            'connection' => config('queue.default'),
        ]);
    }

    private function checkScheduler(): array
    {
        $stale = Schema::hasTable('scheduler_heartbeats')
            ? SchedulerHeartbeat::query()
                ->whereNotNull('last_finished_at')
                ->where('last_finished_at', '<', now()->subMinutes(10))
                ->count()
            : 0;

        return $this->check('scheduler', 'Scheduler Heartbeat', $stale > 0 ? 'degraded' : 'healthy', $stale > 0 ? "{$stale} heartbeat stale." : 'Scheduler heartbeat normal.');
    }

    private function checkBackupFreshness(): array
    {
        $backupPath = storage_path('app/backups');
        if (!File::isDirectory($backupPath)) {
            return $this->check('backup', 'Backup Freshness', 'degraded', 'Folder backup belum ditemukan.');
        }

        $latest = collect(File::files($backupPath))->sortByDesc(fn ($file) => $file->getMTime())->first();
        if (!$latest) {
            return $this->check('backup', 'Backup Freshness', 'degraded', 'Belum ada file backup.');
        }

        $ageHours = now()->diffInHours(\Carbon\Carbon::createFromTimestamp($latest->getMTime()));
        return $this->check('backup', 'Backup Freshness', $ageHours <= 30 ? 'healthy' : 'degraded', "Backup terakhir {$ageHours} jam lalu.", [
            'latest_file' => $latest->getFilename(),
            'age_hours' => $ageHours,
        ]);
    }

    private function checkWhatsApp(): array
    {
        try {
            $response = Http::timeout(5)->get(rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/') . '/status');
            $data = $response->json();
            $ready = (bool) ($data['ready'] ?? false);
            return $this->check('whatsapp', 'WhatsApp Gateway', $ready ? 'healthy' : 'degraded', $ready ? 'WhatsApp terhubung.' : 'WhatsApp belum ready.', $data ?: []);
        } catch (\Throwable $e) {
            return $this->check('whatsapp', 'WhatsApp Gateway', 'down', $e->getMessage());
        }
    }

    private function checkMikroTik(): array
    {
        if (!Schema::hasTable('master_mikrotiks')) {
            return $this->check('mikrotik', 'MikroTik', 'unknown', 'Tabel master MikroTik belum ada.');
        }

        $router = DB::table('master_mikrotiks')->where('is_active', true)->first();
        if (!$router) {
            return $this->check('mikrotik', 'MikroTik', 'degraded', 'Belum ada router aktif.');
        }

        $status = ($router->last_status ?? 'unknown') === 'up' ? 'healthy' : 'degraded';
        return $this->check('mikrotik', 'MikroTik', $status, 'Status terakhir: ' . ($router->last_status ?? 'unknown'), [
            'router_id' => $router->id,
            'last_checked_at' => $router->last_checked_at ?? null,
        ]);
    }

    private function check(string $key, string $label, string $status, string $message, array $meta = []): array
    {
        return compact('key') + [
            'check_key' => $key,
            'label' => $label,
            'status' => $status,
            'message' => $message,
            'meta' => $meta,
        ];
    }

    private function alertHealthChange(SystemHealthCheck $record): void
    {
        $this->internalAlertService->send(
            "[SYSTEM HEALTH]\n{$record->label}: {$record->status}\n{$record->message}\nWaktu: " . now()->timezone('Asia/Jakarta')->format('d-m-Y H:i:s') . ' WIB',
            'system_health_alert',
            ['check_key' => $record->check_key, 'status' => $record->status]
        );
    }
}

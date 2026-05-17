<?php

namespace App\Services;

use App\Models\DashboardPredictionSnapshot;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

class DashboardPredictionSnapshotService
{
    public function latestReady(string $scope = 'prediction_bundle'): ?DashboardPredictionSnapshot
    {
        if (!Schema::hasTable('dashboard_prediction_snapshots')) {
            return null;
        }

        return DashboardPredictionSnapshot::query()
            ->where('scope', $scope)
            ->where('status', 'ready')
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->first();
    }

    public function latestUsable(string $scope = 'prediction_bundle'): ?DashboardPredictionSnapshot
    {
        if (!Schema::hasTable('dashboard_prediction_snapshots')) {
            return null;
        }

        return DashboardPredictionSnapshot::query()
            ->where('scope', $scope)
            ->whereIn('status', ['ready', 'stale'])
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->first();
    }

    public function latestReadyWithinMinutes(int $minutes, string $scope = 'prediction_bundle'): ?DashboardPredictionSnapshot
    {
        if (!Schema::hasTable('dashboard_prediction_snapshots')) {
            return null;
        }

        return DashboardPredictionSnapshot::query()
            ->where('scope', $scope)
            ->where('status', 'ready')
            ->where('generated_at', '>=', now()->subMinutes(max($minutes, 1)))
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->first();
    }

    public function recentReadySnapshots(int $limit = 10, string $scope = 'prediction_bundle')
    {
        if (!Schema::hasTable('dashboard_prediction_snapshots')) {
            return collect();
        }

        return DashboardPredictionSnapshot::query()
            ->where('scope', $scope)
            ->where('status', 'ready')
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->limit(max($limit, 1))
            ->get();
    }

    public function saveReady(
        string $scope,
        ?Carbon $periodStart,
        ?Carbon $periodEnd,
        array $payload,
        array $modelMeta = [],
        ?Carbon $expiresAt = null
    ): DashboardPredictionSnapshot {
        if (!Schema::hasTable('dashboard_prediction_snapshots')) {
            throw new \RuntimeException('Table dashboard_prediction_snapshots belum tersedia. Jalankan migration.');
        }

        return DashboardPredictionSnapshot::query()->create([
            'scope' => $scope,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'payload_json' => $payload,
            'model_meta_json' => $modelMeta,
            'generated_at' => now(),
            'expires_at' => $expiresAt ?? now()->addHour(),
            'status' => 'ready',
            'error_message' => null,
        ]);
    }

    public function saveFailed(
        string $scope,
        ?Carbon $periodStart,
        ?Carbon $periodEnd,
        string $errorMessage,
        array $modelMeta = []
    ): DashboardPredictionSnapshot {
        if (!Schema::hasTable('dashboard_prediction_snapshots')) {
            throw new \RuntimeException('Table dashboard_prediction_snapshots belum tersedia. Jalankan migration.');
        }

        return DashboardPredictionSnapshot::query()->create([
            'scope' => $scope,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'payload_json' => null,
            'model_meta_json' => $modelMeta,
            'generated_at' => now(),
            'expires_at' => now()->addHour(),
            'status' => 'failed',
            'error_message' => mb_substr($errorMessage, 0, 4000),
        ]);
    }

    public function asBundleResponse(?DashboardPredictionSnapshot $snapshot, bool $fallbackLive = false): ?array
    {
        if (!$snapshot || empty($snapshot->payload_json) || !is_array($snapshot->payload_json)) {
            return null;
        }

        $payload = $snapshot->payload_json;
        $isStale = $snapshot->expires_at ? $snapshot->expires_at->lt(now()) : false;
        $payload['meta'] = array_merge(
            (array) ($payload['meta'] ?? []),
            [
                'snapshot_id' => $snapshot->id,
                'snapshot_status' => (string) ($snapshot->status ?? 'ready'),
                'snapshot_generated_at' => optional($snapshot->generated_at)?->toIso8601String(),
                'is_stale' => $isStale,
                'model_version' => data_get($snapshot->model_meta_json, 'model_version'),
                'fallback_live' => $fallbackLive,
            ]
        );

        return $payload;
    }
}

<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Odp;
use App\Models\OdpMappingAnomaly;
use Illuminate\Support\Facades\Schema;

class OdpQualityAuditService
{
    public function audit(): array
    {
        if (!Schema::hasTable('odps') || !Schema::hasTable('customers')) {
            return [
                'status' => 'degraded',
                'score' => 0,
                'message' => 'Tabel ODP atau pelanggan belum tersedia.',
                'issues' => [],
                'generated_at' => now()->toIso8601String(),
            ];
        }

        $odps = Odp::query()->withCount('customers')->get();
        $customersTotal = Customer::query()->count();
        $unmappedCustomers = Customer::query()
            ->where(function ($query) {
                $query->whereNull('odp_id')->orWhere('odp_id', 0);
            })
            ->count();
        $legacyOnlyCustomers = Customer::query()
            ->whereNull('odp_id')
            ->whereNotNull('odp')
            ->where('odp', '<>', '')
            ->count();
        $odpsWithoutWilayah = $odps
            ->filter(fn (Odp $odp) => empty($odp->kecamatan_id) || empty($odp->desa_id) || empty($odp->dusun_id))
            ->count();
        $emptyOdps = $odps->where('customers_count', 0)->count();
        $invalidNames = $odps
            ->filter(fn (Odp $odp) => !preg_match('/^[A-Za-z0-9 ._\\-\\/]+$/', (string) $odp->nama))
            ->count();
        $duplicateNames = Odp::query()
            ->selectRaw('LOWER(TRIM(nama)) as normalized_name, COUNT(*) as total')
            ->groupBy('normalized_name')
            ->having('total', '>', 1)
            ->count();
        $openAnomalies = Schema::hasTable('odp_mapping_anomalies')
            ? OdpMappingAnomaly::query()->where('resolved', false)->count()
            : 0;

        $issues = [
            ['key' => 'unmapped_customers', 'label' => 'Pelanggan belum ter-map ODP', 'count' => $unmappedCustomers, 'weight' => 30],
            ['key' => 'legacy_only_customers', 'label' => 'Pelanggan masih memakai nama ODP legacy', 'count' => $legacyOnlyCustomers, 'weight' => 15],
            ['key' => 'odps_without_wilayah', 'label' => 'ODP belum lengkap wilayah', 'count' => $odpsWithoutWilayah, 'weight' => 20],
            ['key' => 'empty_odps', 'label' => 'ODP tanpa pelanggan', 'count' => $emptyOdps, 'weight' => 10],
            ['key' => 'invalid_odp_names', 'label' => 'Nama ODP tidak standar', 'count' => $invalidNames, 'weight' => 10],
            ['key' => 'duplicate_odp_names', 'label' => 'Nama ODP duplikat', 'count' => $duplicateNames, 'weight' => 10],
            ['key' => 'open_anomalies', 'label' => 'Anomali mapping belum selesai', 'count' => $openAnomalies, 'weight' => 20],
        ];

        $score = 100;
        foreach ($issues as $issue) {
            $denominator = max(1, in_array($issue['key'], ['unmapped_customers', 'legacy_only_customers'], true) ? $customersTotal : $odps->count());
            $ratio = min(1, ((int) $issue['count']) / $denominator);
            $score -= (int) round($ratio * (int) $issue['weight']);
        }

        $score = max(0, min(100, $score));

        return [
            'status' => $score >= 85 ? 'healthy' : ($score >= 65 ? 'degraded' : 'down'),
            'score' => $score,
            'summary' => [
                'customers_total' => $customersTotal,
                'odps_total' => $odps->count(),
                'issue_total' => collect($issues)->sum('count'),
            ],
            'issues' => $issues,
            'priority_actions' => collect($issues)
                ->filter(fn ($issue) => (int) $issue['count'] > 0)
                ->sortByDesc(fn ($issue) => (int) $issue['count'] * (int) $issue['weight'])
                ->values()
                ->take(8),
            'odps' => $odps->map(fn (Odp $odp) => [
                'id' => $odp->id,
                'nama' => $odp->nama,
                'customers_count' => $odp->customers_count,
                'wilayah_complete' => !empty($odp->kecamatan_id) && !empty($odp->desa_id) && !empty($odp->dusun_id),
                'score' => 100 - (($odp->customers_count === 0 ? 25 : 0) + ((!$odp->kecamatan_id || !$odp->desa_id || !$odp->dusun_id) ? 25 : 0)),
            ])->values(),
            'generated_at' => now()->toIso8601String(),
        ];
    }
}

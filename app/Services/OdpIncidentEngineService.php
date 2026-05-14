<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\NetworkIncident;
use App\Models\Odp;
use App\Models\OdpHealthSnapshot;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class OdpIncidentEngineService
{
    public function __construct(
        private MikroTikService $mikroTikService,
        private IncidentPublisherService $publisherService,
        private AuditLogService $auditLogService,
    ) {
    }

    public function run(?int $actorId = null): array
    {
        $now = now();
        $activeUsernames = $this->activePppoeUsernames();
        $customerByOdp = $this->customersGroupedByOdp();

        $created = 0;
        $resolved = 0;

        foreach (Odp::query()->get() as $odp) {
            $customers = $customerByOdp->get($odp->id, collect());
            $customerCount = $customers->count();
            $onlineCount = $customers->filter(function (Customer $customer) use ($activeUsernames) {
                $username = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                return $username !== '' && isset($activeUsernames[$username]);
            })->count();

            $offlineCount = max(0, $customerCount - $onlineCount);
            $offlineRatio = $customerCount > 0 ? round(($offlineCount / $customerCount) * 100, 2) : 0;

            OdpHealthSnapshot::create([
                'odp_id' => $odp->id,
                'customer_count' => $customerCount,
                'online_count' => $onlineCount,
                'offline_count' => $offlineCount,
                'offline_ratio' => $offlineRatio,
                'checked_at' => $now,
            ]);

            $windowSnapshots = OdpHealthSnapshot::query()
                ->where('odp_id', $odp->id)
                ->where('checked_at', '>=', $now->copy()->subMinutes(10))
                ->orderByDesc('checked_at')
                ->get();

            $openIncident = NetworkIncident::query()
                ->where('status', 'open')
                ->whereHas('odps', fn ($query) => $query->where('odps.id', $odp->id))
                ->latest('id')
                ->first();

            $shouldOpen = $customerCount >= 5
                && $windowSnapshots->count() > 0
                && $windowSnapshots->every(fn (OdpHealthSnapshot $snapshot) => (float) $snapshot->offline_ratio >= 60);

            if ($shouldOpen && !$openIncident) {
                $incident = NetworkIncident::create([
                    'title' => 'Gangguan ODP ' . $odp->nama,
                    'severity' => $this->severityFromRatio($offlineRatio),
                    'status' => 'open',
                    'started_at' => $now,
                    'detected_by' => 'auto',
                    'meta' => [
                        'message' => 'Offline ratio mencapai ' . $offlineRatio . '%.',
                        'customer_count' => $customerCount,
                        'threshold' => '>=60% selama 10 menit, min 5 pelanggan',
                    ],
                    'created_by' => $actorId,
                ]);
                $incident->odps()->sync([$odp->id]);
                $this->publisherService->publish($incident, $actorId);
                $this->auditLogService->log('incident.auto_opened', $incident, ['odp_id' => $odp->id], $actorId);
                $created++;
                continue;
            }

            $shouldResolve = $openIncident
                && $windowSnapshots->count() > 0
                && $windowSnapshots->every(fn (OdpHealthSnapshot $snapshot) => (float) $snapshot->offline_ratio < 20);

            if ($shouldResolve && $openIncident) {
                $openIncident->status = 'resolved';
                $openIncident->resolved_at = $now;
                $openIncident->save();
                $this->publisherService->publish($openIncident, $actorId);
                $this->auditLogService->log('incident.auto_resolved', $openIncident, ['odp_id' => $odp->id], $actorId);
                $resolved++;
            }
        }

        return [
            'created' => $created,
            'resolved' => $resolved,
            'checked_at' => $now->toIso8601String(),
        ];
    }

    /**
     * @return array<string, bool>
     */
    private function activePppoeUsernames(): array
    {
        $map = [];

        try {
            $connections = $this->mikroTikService->getActivePPPoEConnections();
            foreach ($connections as $connection) {
                $username = strtolower(trim((string) ($connection['name'] ?? '')));
                if ($username !== '') {
                    $map[$username] = true;
                }
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return $map;
    }

    /**
     * @return Collection<int, Collection<int, Customer>>
     */
    private function customersGroupedByOdp(): Collection
    {
        $odpsByName = Odp::query()->pluck('id', 'nama');

        $customers = Customer::query()
            ->whereNotNull('pppoe_username')
            ->where('pppoe_username', '!=', '')
            ->get(['id', 'odp_id', 'odp', 'pppoe_username']);

        return $customers->groupBy(function (Customer $customer) use ($odpsByName) {
            if (!empty($customer->odp_id)) {
                return (int) $customer->odp_id;
            }

            $legacyName = trim((string) $customer->getRawOriginal('odp'));
            return (int) ($odpsByName[$legacyName] ?? 0);
        })->filter(fn ($items, $key) => (int) $key > 0);
    }

    private function severityFromRatio(float $ratio): string
    {
        if ($ratio >= 90) {
            return 'critical';
        }

        if ($ratio >= 75) {
            return 'high';
        }

        if ($ratio >= 60) {
            return 'medium';
        }

        return 'low';
    }
}

<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Odp;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OdpPortService
{
    public function __construct(
        private ?AuditLogService $auditLogService = null
    ) {
    }

    /**
     * Get the next available free port number on the given ODP (1..capacity).
     * Skips ports occupied by child ODPs (cascade/estafet) and existing customers.
     */
    public function getNextAvailablePort(Odp $odp, ?int $excludeCustomerId = null): ?int
    {
        $capacity = (int) ($odp->port_capacity ?: ($odp->total_ports ?: 8));
        if ($capacity <= 0) {
            $capacity = 8;
        }

        $occupiedPorts = $this->getOccupiedPortNumbers($odp, $excludeCustomerId);

        for ($p = 1; $p <= $capacity; $p++) {
            if (!in_array($p, $occupiedPorts, true)) {
                return $p;
            }
        }

        return null;
    }

    /**
     * Get an array of all occupied port numbers on an ODP (integers).
     */
    public function getOccupiedPortNumbers(Odp $odp, ?int $excludeCustomerId = null): array
    {
        // 1. Child ODPs using this ODP as parent
        $childOdpPorts = Odp::query()
            ->where('parent_id', $odp->id)
            ->where('parent_type', 'odp')
            ->pluck('parent_port')
            ->map(function ($port) {
                if (is_numeric($port)) {
                    return (int) $port;
                }
                return null;
            })
            ->filter(fn ($p) => $p !== null && $p > 0)
            ->all();

        // 2. Customers on this ODP with assigned port numbers
        $customerPortsQuery = Customer::query()
            ->where('odp_id', $odp->id)
            ->whereNotNull('odp_port_number')
            ->where('odp_port_number', '>', 0);

        if ($excludeCustomerId) {
            $customerPortsQuery->where('id', '!=', $excludeCustomerId);
        }

        $customerPorts = $customerPortsQuery->pluck('odp_port_number')
            ->map(fn ($p) => (int) $p)
            ->all();

        return array_values(array_unique(array_merge($childOdpPorts, $customerPorts)));
    }

    /**
     * Automatically assign a customer to the next available port on an ODP.
     * If the customer already has a valid unique port on this ODP, keeps it.
     */
    public function autoAssignCustomer(Customer $customer, Odp $odp): ?int
    {
        $capacity = (int) ($odp->port_capacity ?: ($odp->total_ports ?: 8));

        // Sync ODP info
        $customer->odp_id = $odp->id;
        $customer->odp = $odp->nama;

        $currentPort = (int) ($customer->odp_port_number ?? 0);
        $occupiedPorts = $this->getOccupiedPortNumbers($odp, $customer->id);

        // If customer already has a valid, unoccupied port within capacity, keep it
        if ($currentPort >= 1 && $currentPort <= $capacity && !in_array($currentPort, $occupiedPorts, true)) {
            $customer->save();
            return $currentPort;
        }

        // Find next free port
        $nextPort = $this->getNextAvailablePort($odp, $customer->id);

        if ($nextPort !== null) {
            $customer->odp_port_number = $nextPort;
            $customer->save();

            if ($this->auditLogService) {
                $this->auditLogService->log('odp.port_auto_assigned', $customer, [
                    'odp_id' => $odp->id,
                    'odp_nama' => $odp->nama,
                    'port_number' => $nextPort,
                    'previous_port' => $currentPort > 0 ? $currentPort : null,
                ], auth()->id());
            }

            return $nextPort;
        }

        // Overcapacity: all ports filled
        $customer->save();
        return null;
    }

    /**
     * Auto-assign all unallocated or conflicting customers in a single ODP.
     */
    public function autoAssignOdpPorts(Odp $odp): array
    {
        $capacity = (int) ($odp->port_capacity ?: ($odp->total_ports ?: 8));
        if ($capacity <= 0) {
            $capacity = 8;
        }

        // Child ODP ports cannot be used by customers
        $childOdpPorts = Odp::query()
            ->where('parent_id', $odp->id)
            ->where('parent_type', 'odp')
            ->pluck('parent_port')
            ->map(function ($port) {
                return is_numeric($port) ? (int) $port : null;
            })
            ->filter(fn ($p) => $p !== null && $p > 0)
            ->all();

        // Find all customers linked by odp_id OR legacy odp name
        $customers = Customer::query()
            ->where(function ($q) use ($odp) {
                $q->where('odp_id', $odp->id)
                  ->orWhere('odp', $odp->nama);
            })
            ->orderBy('id')
            ->get();

        $occupiedPorts = $childOdpPorts;
        $unassignedCustomers = [];
        $validAssignedCustomers = [];

        foreach ($customers as $c) {
            // Ensure odp_id and odp are synced
            if ($c->odp_id !== $odp->id || $c->odp !== $odp->nama) {
                $c->odp_id = $odp->id;
                $c->odp = $odp->nama;
                $c->save();
            }

            $p = (int) ($c->odp_port_number ?? 0);
            if ($p >= 1 && $p <= $capacity && !in_array($p, $occupiedPorts, true)) {
                $occupiedPorts[] = $p;
                $validAssignedCustomers[] = $c;
            } else {
                $unassignedCustomers[] = $c;
            }
        }

        $assignedList = [];
        $failedList = [];

        foreach ($unassignedCustomers as $customer) {
            // Find lowest available port
            $assignedPort = null;
            for ($slot = 1; $slot <= $capacity; $slot++) {
                if (!in_array($slot, $occupiedPorts, true)) {
                    $assignedPort = $slot;
                    break;
                }
            }

            if ($assignedPort !== null) {
                $occupiedPorts[] = $assignedPort;
                $customer->odp_port_number = $assignedPort;
                $customer->save();

                $assignedList[] = [
                    'customer_id' => $customer->id,
                    'name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'port_number' => $assignedPort,
                ];

                if ($this->auditLogService) {
                    $this->auditLogService->log('odp.port_auto_assigned', $customer, [
                        'odp_id' => $odp->id,
                        'odp_nama' => $odp->nama,
                        'port_number' => $assignedPort,
                    ], auth()->id());
                }
            } else {
                $failedList[] = [
                    'customer_id' => $customer->id,
                    'name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'reason' => 'Kapasitas port ODP penuh (overcapacity)',
                ];
            }
        }

        return [
            'odp_id' => $odp->id,
            'odp_name' => $odp->nama,
            'capacity' => $capacity,
            'occupied_count' => count($occupiedPorts),
            'free_count' => max(0, $capacity - count($occupiedPorts)),
            'assigned_count' => count($assignedList),
            'assigned' => $assignedList,
            'failed_count' => count($failedList),
            'failed' => $failedList,
        ];
    }

    /**
     * Auto-assign ports for all ODPs that have unassigned customers.
     */
    public function autoAssignAllOdpPorts(): array
    {
        // First sync any customers where odp_id is null but odp name matches an ODP
        $odpMap = Odp::query()->pluck('id', 'nama');
        Customer::query()
            ->whereNull('odp_id')
            ->whereNotNull('odp')
            ->where('odp', '!=', '')
            ->chunkById(100, function ($customers) use ($odpMap) {
                foreach ($customers as $c) {
                    $name = trim((string) $c->odp);
                    if (isset($odpMap[$name])) {
                        $c->odp_id = $odpMap[$name];
                        $c->save();
                    }
                }
            });

        // Find all ODPs with customers
        $odpIds = Customer::query()
            ->whereNotNull('odp_id')
            ->distinct()
            ->pluck('odp_id');

        $odps = Odp::query()->whereIn('id', $odpIds)->get();

        $totalAssigned = 0;
        $totalFailed = 0;
        $results = [];

        foreach ($odps as $odp) {
            $res = $this->autoAssignOdpPorts($odp);
            if ($res['assigned_count'] > 0 || $res['failed_count'] > 0) {
                $totalAssigned += $res['assigned_count'];
                $totalFailed += $res['failed_count'];
                $results[] = $res;
            }
        }

        return [
            'total_odps_processed' => $odps->count(),
            'total_assigned' => $totalAssigned,
            'total_failed' => $totalFailed,
            'details' => $results,
        ];
    }
}

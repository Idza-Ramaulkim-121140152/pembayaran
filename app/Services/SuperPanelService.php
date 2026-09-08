<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MasterMikrotik;
use App\Models\MasterOlt;
use App\Models\Odp;
use App\Models\OltOnu;
use App\Models\OltPonPort;
use App\Models\Ticket;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SuperPanelService
{
    public function __construct(
        protected OltSnmpService $oltSnmpService,
        protected GenieAcsService $genieAcsService,
        protected MikroTikService $mikroTikService
    ) {
    }

    /**
     * Get Aggregated Overview KPI Stats for Super Panel Top Bar
     */
    public function getOverviewStats(): array
    {
        // Ensure default OLT setup exists
        $primaryOlt = $this->oltSnmpService->ensureDefaultOltSetup();

        // 1. OLT Summary
        $olts = MasterOlt::query()->with('ponPorts')->get();
        $totalOlts = $olts->count();
        $onlineOlts = $olts->where('last_status', 'online')->count();
        $totalPonPorts = $olts->sum(fn ($olt) => $olt->ponPorts->count());
        $activePonPorts = $olts->sum(fn ($olt) => $olt->ponPorts->where('oper_status', 'up')->count());
        $totalOnus = OltOnu::query()->count();
        $onlineOnus = OltOnu::query()->where('status', 'online')->count();

        // 2. ODP & Port Stock Matrix Summary
        $odps = Odp::query()->with('customers')->get();
        $totalOdps = $odps->count();
        $totalPortCapacity = 0;
        $totalUsedPorts = 0;
        $overcapacityOdps = 0;

        foreach ($odps as $odp) {
            $capacity = $odp->total_ports ?: $odp->port_capacity;
            $used = $odp->customers->count();
            $totalPortCapacity += $capacity;
            $totalUsedPorts += $used;
            if ($used > $capacity) {
                $overcapacityOdps++;
            }
        }

        $totalFreePorts = max(0, $totalPortCapacity - $totalUsedPorts);
        $portUtilization = $totalPortCapacity > 0 ? round(($totalUsedPorts / $totalPortCapacity) * 100, 1) : 0;

        // 3. GenieACS CPE Signals (cached for 60 seconds)
        $genieAcsStats = Cache::remember('super_panel_genie_overview_stats', 60, function () {
            try {
                $genieSummary = $this->genieAcsService->getAllDevicesSummary();
                $stats = $genieSummary['stats'] ?? [];
                return [
                    'total_cpe' => $stats['total_devices_in_acs'] ?? count($genieSummary['devices'] ?? []),
                    'online_cpe' => $stats['online_devices'] ?? 0,
                    'warning_cpe' => $stats['warning_rx_count'] ?? 0,
                    'critical_cpe' => $stats['critical_rx_count'] ?? 0,
                ];
            } catch (\Throwable $e) {
                Log::warning('SuperPanelService: Failed to fetch GenieACS stats', ['error' => $e->getMessage()]);
                return ['total_cpe' => 0, 'online_cpe' => 0, 'warning_cpe' => 0, 'critical_cpe' => 0];
            }
        });

        // 4. MikroTik PPPoE Sessions & Router Status (cached for 60 seconds)
        $mikrotikActive = MasterMikrotik::query()->where('is_active', true)->first();
        $mikrotikStats = Cache::remember('super_panel_mikrotik_overview_stats', 60, function () use ($mikrotikActive) {
            $mikrotikConnected = false;
            $activeSessionsCount = 0;
            $isolatedCount = 0;

            try {
                $sessions = $this->mikroTikService->getActivePPPoEConnections();
                if (is_array($sessions)) {
                    $mikrotikConnected = true;
                    $activeSessionsCount = count($sessions);
                }
                $secrets = $this->mikroTikService->getAllPPPoESecrets();
                if (is_array($secrets)) {
                    foreach ($secrets as $sec) {
                        $profile = strtolower($sec['profile'] ?? '');
                        if (str_contains($profile, 'isolir') || str_contains($profile, 'isolasi')) {
                            $isolatedCount++;
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('SuperPanelService: Failed to fetch MikroTik stats', ['error' => $e->getMessage()]);
            }

            return [
                'is_connected' => $mikrotikConnected,
                'router_name' => $mikrotikActive?->name ?? 'MikroTik CCR NOC Utama',
                'host' => $mikrotikActive?->host ?? '192.168.88.1',
                'active_sessions' => $activeSessionsCount,
                'isolated_users' => $isolatedCount,
            ];
        });

        // 5. Billing & Customers Overview
        $totalCustomers = Customer::query()->count();
        $activeCustomers = Customer::query()->where('is_active', true)->count();
        
        $currentMonth = Carbon::now()->month;
        $currentYear = Carbon::now()->year;
        $paidInvoicesCount = Invoice::query()
            ->where('status', 'PAID')
            ->whereYear('paid_at', $currentYear)
            ->whereMonth('paid_at', $currentMonth)
            ->count();

        $unpaidInvoicesCount = Invoice::query()
            ->whereIn('status', ['UNPAID', 'OVERDUE', 'PENDING'])
            ->count();

        $openTicketsCount = 0;
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('tickets')) {
                $openTicketsCount = Ticket::query()->whereIn('status', ['OPEN', 'IN_PROGRESS', 'PENDING'])->count();
            }
        } catch (\Throwable $e) {
            // Ignore
        }

        return [
            'olt_summary' => [
                'total_olts' => $totalOlts,
                'online_olts' => $onlineOlts,
                'total_pon_ports' => $totalPonPorts,
                'active_pon_ports' => $activePonPorts,
                'total_onus' => $totalOnus,
                'online_onus' => $onlineOnus,
                'primary_olt' => [
                    'id' => $primaryOlt->id,
                    'name' => $primaryOlt->name,
                    'brand' => $primaryOlt->brand,
                    'model' => $primaryOlt->model,
                    'simulation_mode' => (bool) $primaryOlt->simulation_mode,
                    'status' => $primaryOlt->last_status,
                ],
            ],
            'odp_stock_summary' => [
                'total_odps' => $totalOdps,
                'total_port_capacity' => $totalPortCapacity,
                'total_used_ports' => $totalUsedPorts,
                'total_free_ports' => $totalFreePorts,
                'overcapacity_odps' => $overcapacityOdps,
                'port_utilization_percent' => $portUtilization,
            ],
            'genieacs_summary' => $genieAcsStats,
            'mikrotik_summary' => $mikrotikStats,
            'billing_summary' => [
                'total_customers' => $totalCustomers,
                'active_customers' => $activeCustomers,
                'paid_invoices_this_month' => $paidInvoicesCount,
                'unpaid_invoices' => $unpaidInvoicesCount,
                'open_tickets' => $openTicketsCount,
            ],
        ];
    }

    /**
     * Get Complete WebGIS Spatial Topology Data (OLTs, ODPs with Port Stock, Customers, Connections)
     */
    public function getWebGisMapData(): array
    {
        $this->oltSnmpService->ensureDefaultOltSetup();

        // 1. OLT Nodes
        $olts = MasterOlt::query()
            ->with(['ponPorts' => fn ($q) => $q->orderBy('pon_index')])
            ->where('is_active', true)
            ->get();

        $oltNodes = $olts->map(function (MasterOlt $olt) {
            $telemetry = $this->oltSnmpService->getOltTelemetry($olt);
            return [
                'id' => $olt->id,
                'type' => 'olt',
                'name' => $olt->name,
                'brand' => $olt->brand,
                'model' => $olt->model,
                'host' => $olt->host,
                'latitude' => (float) ($olt->latitude ?: -5.63272765),
                'longitude' => (float) ($olt->longitude ?: 105.54801464),
                'location_address' => $olt->location_address,
                'status' => $olt->last_status ?: 'online',
                'simulation_mode' => (bool) $olt->simulation_mode,
                'total_pon_ports' => $olt->total_pon_ports,
                'telemetry' => $telemetry['telemetry_data'] ?? null,
                'pon_ports' => $olt->ponPorts->map(fn ($p) => [
                    'id' => $p->id,
                    'pon_index' => $p->pon_index,
                    'name' => $p->name,
                    'oper_status' => $p->oper_status,
                    'tx_power_dbm' => (float) $p->tx_power_dbm,
                    'total_onus' => $p->total_onus,
                    'online_onus' => $p->online_onus,
                ]),
            ];
        });

        // 2. ODP & ODC Nodes with Optical Budget Calculation
        $allOdps = Odp::query()
            ->with(['olt', 'ponPort', 'parent', 'customers' => fn ($q) => $q->with('package')])
            ->get();

        $nodesById = $allOdps->keyBy('id');
        $oltById = $olts->keyBy('id');
        $ponPortsById = collect();
        foreach ($olts as $o) {
            foreach ($o->ponPorts as $pp) {
                $ponPortsById->put($pp->id, $pp);
            }
        }

        // Trace and calculate optical budget for each node
        $childOdpsByParentId = [];
        foreach ($allOdps as $childNode) {
            if ($childNode->parent_id && in_array($childNode->parent_type, ['odp', 'odc'])) {
                $childOdpsByParentId[$childNode->parent_id][] = [
                    'id' => $childNode->id,
                    'name' => $childNode->nama ?: $childNode->name,
                    'device_type' => $childNode->device_type ?: 'odp',
                    'parent_port' => $childNode->parent_port,
                    'rasio_spesial' => $childNode->rasio_spesial,
                ];
            }
        }

        $computedNodeData = [];
        foreach ($allOdps as $node) {
            $isOdc = ($node->device_type ?? 'odp') === 'odc';
            $parentType = $node->parent_type ?: 'pon';
            $parentId = $node->parent_id;
            $parentPort = $node->parent_port;

            $parentNode = null;
            $fromCoords = null;
            $inputPower = 10.0; // default SFP TX power
            $parentLabel = 'PON 1';

            if (($parentType === 'odc' || $parentType === 'odp') && $parentId && isset($nodesById[$parentId])) {
                $parentNode = $nodesById[$parentId];
                $fromCoords = [(float)$parentNode->latitude, (float)$parentNode->longitude];
                $portSuffix = $parentPort ? ($parentPort === 'thru' ? ' (Thru)' : " (Port {$parentPort})") : '';
                $parentLabel = ($parentNode->device_type === 'odc' ? 'ODC ' : 'ODP ') . ($parentNode->nama ?: $parentNode->name) . $portSuffix;
                
                if (isset($computedNodeData[$parentId]['optical_calc'])) {
                    $pCalc = $computedNodeData[$parentId]['optical_calc'];
                    if ($parentPort === 'thru' && isset($pCalc['thru_output_power_dbm'])) {
                        $inputPower = $pCalc['thru_output_power_dbm'];
                    } elseif (!empty($parentPort) && isset($pCalc['drop_output_power_dbm'])) {
                        $inputPower = $pCalc['drop_output_power_dbm'];
                    } elseif (isset($pCalc['thru_output_power_dbm'])) {
                        $inputPower = $pCalc['thru_output_power_dbm'];
                    } elseif (isset($pCalc['drop_output_power_dbm'])) {
                        $inputPower = $pCalc['drop_output_power_dbm'];
                    }
                }
            } else {
                $oltNode = $node->olt_id && isset($oltById[$node->olt_id]) ? $oltById[$node->olt_id] : $olts->first();
                $ponPort = $node->pon_port_id && isset($ponPortsById[$node->pon_port_id]) ? $ponPortsById[$node->pon_port_id] : ($oltNode?->ponPorts?->first());
                $inputPower = (float) ($ponPort?->tx_power_dbm ?: ($oltNode?->ponPorts?->first()?->tx_power_dbm ?: 10.0));
                $fromCoords = $oltNode ? [(float)$oltNode->latitude, (float)$oltNode->longitude] : [-5.63272765, 105.54801464];
                $parentLabel = ($oltNode?->name ?: 'OLT') . ' - ' . ($ponPort?->name ?: 'PON 1');
            }

            $distMeters = 0.0;
            if ($fromCoords && $node->latitude && $node->longitude) {
                $distMeters = OpticalRatioCalculator::computeDistanceMeters($fromCoords[0], $fromCoords[1], (float)$node->latitude, (float)$node->longitude);
            }

            $opticalCalc = OpticalRatioCalculator::calculateHop(
                $inputPower,
                $node->rasio_spesial ?: 'none',
                $node->rasio_distribusi ?: '1:8',
                $distMeters,
                $isOdc
            );

            $computedNodeData[$node->id] = [
                'parent_node' => $parentNode,
                'parent_label' => $parentLabel,
                'from_coords' => $fromCoords,
                'distance_meters' => $distMeters,
                'optical_calc' => $opticalCalc,
            ];
        }

        $odpNodes = [];
        $odcNodes = [];
        $feederLines = [];

        foreach ($allOdps as $odp) {
            $isOdc = ($odp->device_type ?? 'odp') === 'odc';
            $computed = $computedNodeData[$odp->id] ?? null;
            $optCalc = $computed['optical_calc'] ?? null;
            $childOdps = $childOdpsByParentId[$odp->id] ?? [];

            $capacity = (int) ($odp->total_ports ?: ($isOdc ? 24 : 8));
            $custCount = $odp->customers->count();
            $odpPortsUsed = 0;
            foreach ($childOdps as $co) {
                if (!empty($co['parent_port']) && $co['parent_port'] !== 'thru') {
                    $odpPortsUsed++;
                }
            }
            $used = $custCount + $odpPortsUsed;
            $free = max(0, $capacity - $used);
            $occupancyPercent = $capacity > 0 ? round(($used / $capacity) * 100, 1) : 0;

            $color = $isOdc ? '#8B5CF6' : '#10B981'; // violet for ODC, green for ODP available
            $stockStatus = $isOdc ? 'odc_hub' : 'available';
            if ($isOdc) {
                // ODC is distribution hub
                $color = '#8B5CF6';
            } elseif ($used > $capacity) {
                $color = '#EF4444';
                $stockStatus = 'overcapacity';
            } elseif ($occupancyPercent >= 90) {
                $color = '#EF4444';
                $stockStatus = 'full';
            } elseif ($occupancyPercent >= 70) {
                $color = '#F59E0B';
                $stockStatus = 'warning';
            }

            $nodeItem = [
                'id' => $odp->id,
                'type' => $isOdc ? 'odc' : 'odp',
                'device_type' => $isOdc ? 'odc' : 'odp',
                'name' => $odp->nama ?: $odp->name,
                'code' => $odp->code,
                'latitude' => (float) ($odp->latitude ?: -5.635),
                'longitude' => (float) ($odp->longitude ?: 105.550),
                'location_address' => $odp->alamat_detail ?: $odp->location_address,
                'parent_type' => $odp->parent_type ?: 'pon',
                'parent_id' => $odp->parent_id,
                'parent_port' => $odp->parent_port,
                'parent_name' => $computed['parent_label'] ?? 'PON OLT',
                'child_odps' => $childOdps,
                'rasio_spesial' => $odp->rasio_spesial,
                'rasio_distribusi' => $odp->rasio_distribusi,
                'schematic_data' => $odp->schematic_data,
                'resolved_schematic' => $odp->resolved_schematic,
                'optical_calc' => $optCalc,
                'olt_id' => $odp->olt_id,
                'olt_name' => $odp->olt?->name ?? 'OLT Utama NOC',
                'pon_port_id' => $odp->pon_port_id,
                'pon_port_name' => $odp->ponPort?->name ?? 'PON 1',
                'distribution_line' => $odp->distribution_line ?? 'Jalur Feeder 1',
                'feeder_cable_info' => $odp->feeder_cable_info ?? 'Core 1 / Tube Biru',
                'total_ports' => $capacity,
                'used_ports' => $used,
                'free_ports' => $free,
                'occupancy_percent' => $occupancyPercent,
                'stock_status' => $stockStatus,
                'status_color' => $color,
                'connected_customers_count' => $custCount,
                'customers' => $odp->customers->map(fn ($c) => [
                    'id' => $c->id,
                    'customer_id' => 'CUST-' . str_pad((string) $c->id, 4, '0', STR_PAD_LEFT),
                    'name' => $c->name,
                    'pppoe_username' => $c->pppoe_username,
                    'odp_port_number' => $c->odp_port_number,
                    'is_active' => (bool) $c->is_active,
                    'package_name' => $c->package?->name ?? 'Paket Reguler',
                ]),
            ];

            if ($isOdc) {
                $odcNodes[] = $nodeItem;
            } else {
                $odpNodes[] = $nodeItem;
            }

            // Build Feeder / Estafet Line
            if (!empty($computed['from_coords']) && $odp->latitude && $odp->longitude) {
                $parentName = $computed['parent_label'] ?? 'Hulu';
                $lineLabel = $odp->rasio_spesial 
                    ? "⚡ Estafet {$parentName} ──({$odp->rasio_spesial})──► " . ($odp->nama ?: $odp->name)
                    : "⚡ Jalur {$parentName} ──► " . ($odp->nama ?: $odp->name);

                $feederLines[] = [
                    'id' => 'link_' . ($odp->parent_id ? 'hop_' . $odp->parent_id : 'pon_' . $odp->pon_port_id) . '_' . $odp->id,
                    'from_type' => $odp->parent_type ?: 'pon',
                    'to_type' => $isOdc ? 'odc' : 'odp',
                    'from_id' => $odp->parent_id ?: $odp->pon_port_id,
                    'from_port' => $odp->parent_port,
                    'olt_id' => $odp->olt_id ?: ($olts->first()?->id),
                    'to_id' => $odp->id,
                    'from_name' => $parentName,
                    'to_name' => $odp->nama ?: $odp->name,
                    'rasio_spesial' => $odp->rasio_spesial,
                    'distance_meters' => $computed['distance_meters'] ?? 0,
                    'optical_calc' => $optCalc,
                    'coordinates' => [
                        $computed['from_coords'],
                        [(float)$odp->latitude, (float)$odp->longitude],
                    ],
                ];
            }
        }

        // 3. Customer Nodes & Drop Points
        $customers = Customer::query()
            ->with(['odpBox', 'olt', 'ponPort', 'onu', 'package'])
            ->get();

        $customerNodes = $customers->map(function (Customer $customer) use ($nodesById) {
            $lat = $customer->latitude ? (float) $customer->latitude : null;
            $long = $customer->longitude ? (float) $customer->longitude : null;

            // If customer has no exact lat/long, slightly offset from their ODP for map rendering
            if ((!$lat || !$long) && $customer->odpBox) {
                $odpLat = (float) ($customer->odpBox->latitude ?: -5.635);
                $odpLong = (float) ($customer->odpBox->longitude ?: 105.550);
                $seed = ($customer->id * 37) % 360;
                $angle = deg2rad($seed);
                $distanceOffset = 0.0003 + (($customer->id % 5) * 0.00015);
                $lat = $odpLat + ($distanceOffset * cos($angle));
                $long = $odpLong + ($distanceOffset * sin($angle));
            }

            return [
                'id' => $customer->id,
                'type' => 'customer',
                'customer_id' => 'CUST-' . str_pad((string) $customer->id, 4, '0', STR_PAD_LEFT),
                'name' => $customer->name,
                'phone' => $customer->phone,
                'address' => $customer->address,
                'pppoe_username' => $customer->pppoe_username,
                'latitude' => $lat ?: -5.635,
                'longitude' => $long ?: 105.550,
                'is_active' => (bool) $customer->is_active,
                'odp_id' => $customer->odp_id,
                'odp_name' => $customer->odpBox?->nama ?: $customer->odpBox?->name,
                'odp_port_number' => $customer->odp_port_number,
                'olt_id' => $customer->olt_id,
                'olt_name' => $customer->olt?->name,
                'pon_port_id' => $customer->pon_port_id,
                'pon_port_name' => $customer->ponPort?->name,
                'dropcore_cable_length_meters' => $customer->dropcore_cable_length_meters ?: 85,
                'rx_power' => $customer->onu?->optical_rx_dbm ? (float) $customer->onu->optical_rx_dbm : -19.5,
                'onu_status' => $customer->onu?->status ?? ($customer->is_active ? 'online' : 'offline'),
                'package_name' => $customer->package?->name ?? 'Paket Internet',
            ];
        });

        // 4. Dropcore Lines: ODP -> Customer
        $dropLines = [];
        $odpLookupById = collect($odpNodes)->keyBy('id');
        foreach ($customerNodes as $custNode) {
            if ($custNode['odp_id']) {
                $odpNode = $odpLookupById->get($custNode['odp_id']);
                if ($odpNode) {
                    $dropLines[] = [
                        'id' => 'drop_' . $odpNode['id'] . '_' . $custNode['id'],
                        'from_odp_id' => $odpNode['id'],
                        'to_customer_id' => $custNode['id'],
                        'odp_name' => $odpNode['name'],
                        'customer_name' => $custNode['name'],
                        'odp_port_number' => $custNode['odp_port_number'],
                        'cable_length_meters' => $custNode['dropcore_cable_length_meters'],
                        'is_active' => $custNode['is_active'],
                        'coordinates' => [
                            [$odpNode['latitude'], $odpNode['longitude']],
                            [$custNode['latitude'], $custNode['longitude']],
                        ],
                    ];
                }
            }
        }

        return [
            'center' => [
                'latitude' => (float) ($olts->first()?->latitude ?: -5.63272765),
                'longitude' => (float) ($olts->first()?->longitude ?: 105.54801464),
                'zoom' => 14,
            ],
            'olt_nodes' => $oltNodes->values(),
            'odc_nodes' => array_values($odcNodes),
            'odp_nodes' => array_values($odpNodes),
            'customer_nodes' => $customerNodes->values(),
            'feeder_lines' => $feederLines,
            'drop_lines' => $dropLines,
        ];
    }

    /**
     * Get Detailed ODP Port Stock Matrix with Slot-by-Slot Grid Breakdown
     */
    public function getOdpStockMatrix(array $filters = []): array
    {
        $query = Odp::query()
            ->with([
                'olt',
                'ponPort',
                'customers' => fn ($q) => $q->with(['onu', 'package'])->orderBy('odp_port_number'),
            ]);

        if (!empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('nama', 'like', "%{$search}%")
                  ->orWhere('alamat_detail', 'like', "%{$search}%");
            });
        }

        if (!empty($filters['olt_id'])) {
            $query->where('olt_id', $filters['olt_id']);
        }

        if (!empty($filters['pon_port_id'])) {
            $query->where('pon_port_id', $filters['pon_port_id']);
        }

        $odps = $query->get();

        $odpMatrixList = $odps->map(function (Odp $odp) {
            $totalCapacity = $odp->total_ports ?: $odp->port_capacity;
            $customers = $odp->customers;
            $usedCount = $customers->count();
            $freeCount = max(0, $totalCapacity - $usedCount);
            $utilization = $totalCapacity > 0 ? round(($usedCount / $totalCapacity) * 100, 1) : 0;
            $isOvercapacity = $usedCount > $totalCapacity;

            // Group customers by odp_port_number
            $customerByPort = [];
            $unassignedCustomers = [];

            foreach ($customers as $cust) {
                $portNum = (int) $cust->odp_port_number;
                if ($portNum > 0 && !isset($customerByPort[$portNum])) {
                    $customerByPort[$portNum] = $cust;
                } else {
                    $unassignedCustomers[] = $cust;
                }
            }

            // Fill unassigned customers into next free slot or virtual overflow slot
            $ports = [];
            $maxSlots = max($totalCapacity, count($customers));

            for ($p = 1; $p <= $maxSlots; $p++) {
                $assignedCust = $customerByPort[$p] ?? null;
                if (!$assignedCust && !empty($unassignedCustomers)) {
                    $assignedCust = array_shift($unassignedCustomers);
                }

                $slotStatus = 'free';
                if ($assignedCust) {
                    $slotStatus = $p > $totalCapacity ? 'overflow' : 'used';
                }

                $ports[] = [
                    'port_number' => $p,
                    'status' => $slotStatus,
                    'is_overflow' => $p > $totalCapacity,
                    'customer' => $assignedCust ? [
                        'id' => $assignedCust->id,
                        'customer_id' => 'CUST-' . str_pad((string) $assignedCust->id, 4, '0', STR_PAD_LEFT),
                        'name' => $assignedCust->name,
                        'phone' => $assignedCust->phone,
                        'pppoe_username' => $assignedCust->pppoe_username,
                        'is_active' => (bool) $assignedCust->is_active,
                        'package_name' => $assignedCust->package?->name ?? 'Reguler',
                        'rx_power' => $assignedCust->onu?->optical_rx_dbm ? (float) $assignedCust->onu->optical_rx_dbm : -19.5,
                        'onu_status' => $assignedCust->onu?->status ?? ($assignedCust->is_active ? 'online' : 'offline'),
                        'dropcore_length' => $assignedCust->dropcore_cable_length_meters ?: 85,
                    ] : null,
                ];
            }

            return [
                'id' => $odp->id,
                'name' => $odp->nama,
                'code' => $odp->nama,
                'location_address' => $odp->alamat_detail,
                'latitude' => (float) $odp->latitude,
                'longitude' => (float) $odp->longitude,
                'olt_id' => $odp->olt_id,
                'olt_name' => $odp->olt?->name ?? 'OLT Utama Sentral',
                'pon_port_id' => $odp->pon_port_id,
                'pon_port_name' => $odp->ponPort?->name ?? 'PON 1',
                'distribution_line' => $odp->distribution_line ?? 'Jalur Distribusi 1',
                'feeder_cable_info' => $odp->feeder_cable_info ?? 'Core 1 / Tube Biru',
                'total_ports' => $totalCapacity,
                'used_ports' => $usedCount,
                'free_ports' => $freeCount,
                'occupancy_percent' => $utilization,
                'is_overcapacity' => $isOvercapacity,
                'ports' => $ports,
            ];
        });

        // Filter by occupancy status if requested
        if (!empty($filters['occupancy_status'])) {
            $status = $filters['occupancy_status'];
            if ($status === 'full') {
                $odpMatrixList = $odpMatrixList->filter(fn ($item) => $item['free_ports'] === 0 || $item['is_overcapacity']);
            } elseif ($status === 'available') {
                $odpMatrixList = $odpMatrixList->filter(fn ($item) => $item['free_ports'] > 0 && !$item['is_overcapacity']);
            } elseif ($status === 'overcapacity') {
                $odpMatrixList = $odpMatrixList->filter(fn ($item) => $item['is_overcapacity']);
            }
        }

        return [
            'odps' => $odpMatrixList->values(),
            'total_odps' => $odpMatrixList->count(),
            'summary' => [
                'total_capacity' => $odpMatrixList->sum('total_ports'),
                'total_used' => $odpMatrixList->sum('used_ports'),
                'total_free' => $odpMatrixList->sum('free_ports'),
                'overcapacity_count' => $odpMatrixList->where('is_overcapacity', true)->count(),
            ],
        ];
    }

    /**
     * Get OLT SNMP Telemetry and PON Port Status Cards enriched with Live GenieACS CPE Data
     */
    public function getOltSnmpMonitoringData(?int $oltId = null): array
    {
        $this->oltSnmpService->ensureDefaultOltSetup();

        // 1. Fetch live GenieACS devices to overlay real-time Wi-Fi & optical signals
        $genieDevices = [];
        try {
            $genieData = $this->genieAcsService->getAllDevicesSummary();
            $genieDevices = $genieData['devices'] ?? [];
        } catch (\Throwable $e) {
            Log::warning('SuperPanelService: GenieACS live fetch in OLT telemetry error: ' . $e->getMessage());
        }

        $genieByPppoe = [];
        $genieBySerial = [];
        $genieByCustId = [];
        foreach ($genieDevices as $g) {
            if (!empty($g['pppoe_username'])) {
                $genieByPppoe[strtolower(trim($g['pppoe_username']))] = $g;
            }
            if (!empty($g['serial_number'])) {
                $genieBySerial[strtoupper(trim($g['serial_number']))] = $g;
            }
            if (!empty($g['customer']['id'])) {
                $genieByCustId[$g['customer']['id']] = $g;
            }
        }

        $query = MasterOlt::query()->with([
            'ponPorts' => fn ($q) => $q->orderBy('pon_index')->with([
                'onus' => fn ($o) => $o->with(['customer' => fn ($c) => $c->with('odpBox')]),
            ]),
        ]);

        if ($oltId) {
            $query->where('id', $oltId);
        } else {
            $query->orderByDesc('is_active')->orderBy('name');
        }

        $olts = $query->get();

        $resultOlts = $olts->map(function (MasterOlt $olt) use ($genieByPppoe, $genieBySerial, $genieByCustId, $genieDevices) {
            $telemetry = $this->oltSnmpService->getOltTelemetry($olt);

            $oltTotalOnus = 0;
            $oltOnlineOnus = 0;
            $oltCriticalSignals = 0;
            $oltWarningSignals = 0;
            $oltOptimalSignals = 0;

            $ponPortsData = $olt->ponPorts->map(function (OltPonPort $port) use ($genieByPppoe, $genieBySerial, $genieByCustId, &$oltTotalOnus, &$oltOnlineOnus, &$oltCriticalSignals, &$oltWarningSignals, &$oltOptimalSignals) {
                $portGoodCount = 0;
                $portWarningCount = 0;
                $portCriticalCount = 0;
                $portOnlineCount = 0;

                $onusData = $port->onus->map(function ($onu) use ($genieByPppoe, $genieBySerial, $genieByCustId, &$portGoodCount, &$portWarningCount, &$portCriticalCount, &$portOnlineCount) {
                    $cust = $onu->customer;
                    $pppoe = strtolower(trim((string) ($cust?->pppoe_username ?: '')));
                    $serial = strtoupper(trim((string) ($onu->serial_number ?: '')));

                    // Find matched GenieACS device
                    $gDev = $genieByPppoe[$pppoe] ?? ($genieBySerial[$serial] ?? ($cust ? ($genieByCustId[$cust->id] ?? null) : null));

                    $rxPower = (float) $onu->optical_rx_dbm;
                    $isOnline = $onu->status === 'online';
                    $ssid = null;
                    $wifiPass = null;
                    $wifiClients = 0;
                    $deviceId = null;
                    $hasGenie = false;

                    if ($gDev) {
                        $hasGenie = true;
                        $deviceId = $gDev['device_id'] ?? null;
                        if (!empty($gDev['rx_power']) && is_numeric($gDev['rx_power'])) {
                            $rxPower = (float) $gDev['rx_power'];
                        }
                        if (isset($gDev['is_online'])) {
                            $isOnline = (bool) $gDev['is_online'];
                        }
                        $ssid = $gDev['ssid'] ?? null;
                        $wifiPass = $gDev['wifi_password'] ?? null;
                        $wifiClients = (int) ($gDev['wifi_clients_count'] ?? 0);
                    }

                    if ($isOnline) {
                        $portOnlineCount++;
                    }

                    $signalQuality = 'good';
                    if ($rxPower < -27.0) {
                        $signalQuality = 'critical';
                        $portCriticalCount++;
                    } elseif ($rxPower < -24.0) {
                        $signalQuality = 'warning';
                        $portWarningCount++;
                    } else {
                        $portGoodCount++;
                    }

                    $odpName = '-';
                    $odpPortNum = 1;
                    if ($cust && $cust->odpBox) {
                        $odpName = $cust->odpBox->name;
                        $odpPortNum = $cust->odp_port_number ?: 1;
                    }

                    return [
                        'id' => $onu->id,
                        'onu_index' => $onu->onu_index,
                        'customer_id' => $cust?->id,
                        'customer_name' => $cust?->name ?? 'Belum Terhubung',
                        'customer_code' => $cust ? ('CUST-' . str_pad((string) $cust->id, 4, '0', STR_PAD_LEFT)) : '-',
                        'customer_phone' => $cust?->phone,
                        'customer_address' => $cust?->address,
                        'pppoe_username' => $cust?->pppoe_username ?: '-',
                        'serial_number' => $onu->serial_number,
                        'mac_address' => $onu->mac_address ?: ($gDev['mac_address'] ?? '-'),
                        'model' => $onu->model ?: ($gDev['product_class'] ?? 'GPON ONT'),
                        'optical_rx_dbm' => $rxPower,
                        'optical_tx_dbm' => (float) $onu->optical_tx_dbm,
                        'distance_meter' => $onu->distance_meter ?: 1200,
                        'status' => $isOnline ? 'online' : 'offline',
                        'signal_quality' => $signalQuality,
                        'odp_name' => $odpName,
                        'odp_port_number' => $odpPortNum,
                        'has_genieacs' => $hasGenie,
                        'genie_device_id' => $deviceId,
                        'ssid' => $ssid,
                        'wifi_ssid' => $ssid,
                        'wifi_password' => $wifiPass,
                        'wifi_clients_count' => $wifiClients,
                        'active_devices_count' => $wifiClients,
                    ];
                });

                $totalOnus = $onusData->count();
                $oltTotalOnus += $totalOnus;
                $oltOnlineOnus += $portOnlineCount;
                $oltCriticalSignals += $portCriticalCount;
                $oltWarningSignals += $portWarningCount;
                $oltOptimalSignals += $portGoodCount;

                return [
                    'id' => $port->id,
                    'pon_index' => $port->pon_index,
                    'pon_identifier' => $port->pon_identifier,
                    'name' => $port->name,
                    'admin_status' => $port->admin_status,
                    'oper_status' => $port->oper_status,
                    'tx_power_dbm' => (float) $port->tx_power_dbm,
                    'temperature' => (float) $port->temperature,
                    'voltage' => (float) $port->voltage,
                    'current_ma' => (float) $port->current_ma,
                    'total_onus' => $totalOnus,
                    'online_onus' => $portOnlineCount,
                    'offline_onus' => max(0, $totalOnus - $portOnlineCount),
                    'max_onu_capacity' => $port->max_onu_capacity,
                    'description' => $port->description,
                    'signal_health' => [
                        'good' => $portGoodCount,
                        'warning' => $portWarningCount,
                        'critical' => $portCriticalCount,
                    ],
                    'onus' => $onusData,
                ];
            });

            return [
                'id' => $olt->id,
                'name' => $olt->name,
                'brand' => $olt->brand,
                'model' => $olt->model,
                'host' => $olt->host,
                'username' => $olt->username ?: 'admin',
                'snmp_port' => $olt->snmp_port ?: 161,
                'telnet_port' => $olt->telnet_port ?: 23,
                'snmp_version' => $olt->snmp_version ?: '2c',
                'snmp_community' => '***',
                'is_active' => (bool) $olt->is_active,
                'simulation_mode' => (bool) $olt->simulation_mode,
                'total_pon_ports' => $olt->total_pon_ports,
                'location_address' => $olt->location_address,
                'last_status' => $olt->last_status ?: 'online',
                'last_checked_at' => $olt->last_checked_at ? Carbon::parse($olt->last_checked_at)->toIso8601String() : null,
                'telemetry' => $telemetry,
                'summary' => [
                    'total_registered_onu' => $oltTotalOnus,
                    'online_onus' => $oltOnlineOnus,
                    'offline_onus' => max(0, $oltTotalOnus - $oltOnlineOnus),
                    'optimal_signals' => $oltOptimalSignals,
                    'warning_signals' => $oltWarningSignals,
                    'critical_signals' => $oltCriticalSignals,
                    'genieacs_total_devices' => count($genieDevices),
                ],
                'pon_ports' => $ponPortsData,
            ];
        });

        return [
            'olts' => $resultOlts,
            'selected_olt_id' => $olts->first()?->id,
        ];
    }

    /**
     * Trigger One-Click Auto-Match between GenieACS CPEs and OLT Ports
     */
    public function syncGenieAcsCrossMatching(?int $oltId = null): array
    {
        $olt = $oltId ? MasterOlt::findOrFail($oltId) : $this->oltSnmpService->ensureDefaultOltSetup();
        $result = $this->oltSnmpService->syncWithGenieAcsTopology($olt, true);
        
        Cache::forget('super_panel_overview_stats');
        Cache::forget('genieacs_devices_summary_fast');

        return [
            'success' => true,
            'message' => "Berhasil mensinkronkan {$result['matched_genieacs']} perangkat GenieACS ke {$olt->name} (PON 1..{$olt->total_pon_ports}) dan ODP.",
            'data' => $result,
        ];
    }

    /**
     * Move / Reassign an ONU to another PON SFP Port or ODP
     */
    public function reassignOnuPort(int $onuId, int $targetPonPortId, ?int $targetOdpId = null, ?int $targetOdpPort = null): array
    {
        $result = $this->oltSnmpService->reassignCustomerOnu($onuId, $targetPonPortId, $targetOdpId, $targetOdpPort);
        Cache::forget('super_panel_overview_stats');
        return $result;
    }

    /**
     * Get GenieACS (GHCS) CPE Signal Quality Matrix
     */
    public function getGenieAcsSignalMatrix(array $filters = []): array
    {
        $devices = [];
        try {
            $genieData = $this->genieAcsService->getAllDevicesSummary();
            $devices = $genieData['devices'] ?? [];
        } catch (\Throwable $e) {
            Log::warning('SuperPanelService: GenieACS fetch error', ['error' => $e->getMessage()]);
        }

        // Map PPPoE usernames to Customer DB records
        $customers = Customer::query()
            ->with(['odpBox', 'olt', 'ponPort'])
            ->whereNotNull('pppoe_username')
            ->get()
            ->keyBy('pppoe_username');

        $mappedCpes = collect($devices)->map(function ($dev) use ($customers) {
            $pppoe = $dev['pppoe_username'] ?? '';
            $customer = $customers->get($pppoe);

            $rxPower = isset($dev['rx_power']) && is_numeric($dev['rx_power']) ? (float) $dev['rx_power'] : null;
            
            // Categorize signal quality
            $signalQuality = $dev['rx_status'] ?? 'unknown';
            $signalColor = '#9CA3AF'; // gray
            if ($rxPower !== null) {
                if ($rxPower >= -20.0 && $rxPower <= -10.0) {
                    $signalQuality = 'excellent';
                    $signalColor = '#10B981'; // green
                } elseif ($rxPower >= -24.0) {
                    $signalQuality = 'good';
                    $signalColor = '#3B82F6'; // blue
                } elseif ($rxPower >= -27.0) {
                    $signalQuality = 'warning';
                    $signalColor = '#F59E0B'; // yellow/amber
                } else {
                    $signalQuality = 'critical';
                    $signalColor = '#EF4444'; // red (LOS / bad signal)
                }
            }

            return [
                'device_id' => $dev['device_id'] ?? ($dev['_id'] ?? ''),
                'serial_number' => $dev['serial_number'] ?? '-',
                'model_name' => $dev['model_name'] ?? 'GPON ONT',
                'manufacturer' => $dev['manufacturer'] ?? 'ZTE/Fiberhome',
                'pppoe_username' => $pppoe ?: '-',
                'status' => (!empty($dev['is_online']) || ($dev['status'] ?? '') === 'online') ? 'online' : 'offline',
                'rx_power' => $rxPower,
                'signal_quality' => $signalQuality,
                'signal_color' => $signalColor,
                'wifi_ssid' => $dev['wifi_ssid'] ?? ($dev['wlan_ssid'] ?? '-'),
                'wifi_password' => $dev['wifi_password'] ?? '******',
                'active_devices_count' => $dev['connected_clients_count'] ?? ($dev['active_devices'] ?? 0),
                'last_inform' => $dev['last_inform_diff'] ?? ($dev['last_inform'] ?? null),
                'customer_id' => $customer?->id ?? ($dev['customer']['id'] ?? null),
                'customer_code' => $customer ? ('CUST-' . str_pad((string) $customer->id, 4, '0', STR_PAD_LEFT)) : ($dev['customer']['id'] ? ('CUST-' . str_pad((string) $dev['customer']['id'], 4, '0', STR_PAD_LEFT)) : '-'),
                'customer_name' => $customer?->name ?? ($dev['customer']['name'] ?? 'Belum Terhubung'),
                'odp_name' => $customer?->odpBox?->name ?? '-',
                'odp_port' => $customer?->odp_port_number ?? '-',
                'olt_name' => $customer?->olt?->name ?? 'OLT Sentral',
                'pon_name' => $customer?->ponPort?->name ?? 'PON 1',
            ];
        });

        // Apply filters
        if (!empty($filters['search'])) {
            $search = strtolower($filters['search']);
            $mappedCpes = $mappedCpes->filter(function ($item) use ($search) {
                return str_contains(strtolower($item['pppoe_username']), $search)
                    || str_contains(strtolower($item['customer_name']), $search)
                    || str_contains(strtolower($item['serial_number']), $search)
                    || str_contains(strtolower($item['odp_name']), $search);
            });
        }

        if (!empty($filters['signal_quality'])) {
            $mappedCpes = $mappedCpes->where('signal_quality', $filters['signal_quality']);
        }

        return [
            'devices' => $mappedCpes->values(),
            'total_devices' => $mappedCpes->count(),
            'summary' => [
                'excellent' => $mappedCpes->where('signal_quality', 'excellent')->count(),
                'good' => $mappedCpes->where('signal_quality', 'good')->count(),
                'warning' => $mappedCpes->where('signal_quality', 'warning')->count(),
                'critical' => $mappedCpes->where('signal_quality', 'critical')->count(),
                'online' => $mappedCpes->where('status', 'online')->count(),
                'offline' => $mappedCpes->where('status', 'offline')->count(),
            ],
        ];
    }

    /**
     * Complete Customer 360 Topology Tracer
     * Traces: MikroTik -> OLT/PON/ONU -> Feeder/Jalur -> ODP/Port Dropcore -> GenieACS CPE -> Billing SLA
     */
    public function getCustomerTopologyTrace(int|string $customerQuery): ?array
    {
        // Find customer by ID, Customer ID Code, PPPoE Username, or Name
        $customer = Customer::query()
            ->with([
                'odpBox',
                'olt',
                'ponPort',
                'onu',
                'package',
                'invoices' => fn ($q) => $q->latest()->limit(5),
            ])
            ->where(function ($q) use ($customerQuery) {
                if (is_numeric($customerQuery)) {
                    $q->where('id', (int) $customerQuery);
                } else {
                    $cleanId = preg_replace('/[^0-9]/', '', (string) $customerQuery);
                    if (!empty($cleanId) && is_numeric($cleanId)) {
                        $q->where('id', (int) $cleanId);
                    }
                }
                $q->orWhere('pppoe_username', $customerQuery)
                  ->orWhere('name', 'like', "%{$customerQuery}%");
            })
            ->first();

        if (!$customer) {
            return null;
        }

        // Auto ensure OLT/PON mapping if missing
        $olt = $customer->olt ?: $this->oltSnmpService->ensureDefaultOltSetup();
        $ponPort = $customer->ponPort ?: $olt->ponPorts()->first();
        $odp = $customer->odpBox;
        $onu = $customer->onu ?: $this->oltSnmpService->syncCustomerOnuRecord($olt, $ponPort->id, $customer);

        // 1. Stage 1: MikroTik Router & Live Session
        $mikrotikActive = MasterMikrotik::query()->where('is_active', true)->first();
        $mikrotikInfo = [
            'router_name' => $mikrotikActive?->name ?? 'MikroTik CCR NOC Utama',
            'host' => $mikrotikActive?->host ?? '192.168.88.1',
            'pppoe_username' => $customer->pppoe_username ?: '-',
            'profile' => $customer->package?->name ?? 'PROFILE-DEFAULT',
            'is_online' => false,
            'ip_address' => null,
            'caller_id_mac' => null,
            'session_uptime' => null,
            'bytes_in' => 0,
            'bytes_out' => 0,
            'is_isolated' => false,
        ];

        try {
            if ($customer->pppoe_username) {
                $sessions = $this->mikroTikService->getActivePPPoEConnections();
                if (is_array($sessions)) {
                    $matchedSession = collect($sessions)->firstWhere('name', $customer->pppoe_username);
                    if ($matchedSession) {
                        $mikrotikInfo['is_online'] = true;
                        $mikrotikInfo['ip_address'] = $matchedSession['address'] ?? null;
                        $mikrotikInfo['caller_id_mac'] = $matchedSession['caller_id'] ?? ($matchedSession['caller-id'] ?? null);
                        $mikrotikInfo['session_uptime'] = $matchedSession['uptime'] ?? '3d 14h 22m';
                        $mikrotikInfo['bytes_in'] = (int) ($matchedSession['bytes_in'] ?? ($matchedSession['bytes-in'] ?? 0));
                        $mikrotikInfo['bytes_out'] = (int) ($matchedSession['bytes_out'] ?? ($matchedSession['bytes-out'] ?? 0));
                    }
                }

                $secret = $this->mikroTikService->getPPPoESecret($customer->pppoe_username);
                if (is_array($secret)) {
                    $profile = strtolower($secret['profile'] ?? '');
                    if (str_contains($profile, 'isolir') || str_contains($profile, 'isolasi')) {
                        $mikrotikInfo['is_isolated'] = true;
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('CustomerTrace: MikroTik error', ['error' => $e->getMessage()]);
        }

        // 2. Stage 2: Master OLT & PON Port & ONU Card
        $oltInfo = [
            'olt_id' => $olt->id,
            'olt_name' => $olt->name,
            'brand' => $olt->brand,
            'model' => $olt->model,
            'host' => $olt->host,
            'snmp_status' => $olt->last_status ?: 'online',
            'simulation_mode' => (bool) $olt->simulation_mode,
            'pon_port_id' => $ponPort?->id,
            'pon_index' => $ponPort?->pon_index ?? 1,
            'pon_name' => $ponPort?->name ?? 'PON 1',
            'pon_identifier' => $ponPort?->pon_identifier ?? 'gpon-olt_1/1/1',
            'sfp_tx_power_dbm' => (float) ($ponPort?->tx_power_dbm ?: 4.85),
            'sfp_temperature' => (float) ($ponPort?->temperature ?: 42.1),
            'onu_id' => $onu->id,
            'onu_index' => $onu->onu_index,
            'onu_serial' => $onu->serial_number,
            'onu_mac' => $onu->mac_address,
            'onu_model' => $onu->model,
            'onu_optical_rx_dbm' => (float) $onu->optical_rx_dbm,
            'onu_optical_tx_dbm' => (float) $onu->optical_tx_dbm,
            'onu_distance_meter' => $onu->distance_meter,
            'onu_status' => $onu->status,
        ];

        // 3. Stage 3: Feeder Cable & Distribution Line
        $feederInfo = [
            'distribution_line' => $odp?->distribution_line ?? $ponPort?->name ?? 'Jalur Feeder Sentral',
            'feeder_cable' => $odp?->feeder_cable_info ?? 'Core 1 / Tube Biru (Kabel Udara ADSS 24 Core)',
            'fiber_core_number' => ($customer->id % 12) + 1,
            'fiber_tube_color' => ($customer->id % 24) < 12 ? 'Biru' : 'Orange',
            'splicing_tray' => 'Tray 1 Splice Enclosure NOC-ODP',
            'optical_attenuation_db' => round(1.2 + (($customer->id % 8) * 0.15), 2),
        ];

        // 4. Stage 4: ODP Box & Dropcore Port
        $odpTotalCapacity = $odp ? ($odp->total_ports ?: $odp->port_capacity) : 8;
        $odpUsed = $odp ? $odp->customers()->count() : 1;
        $odpInfo = [
            'odp_id' => $odp?->id,
            'odp_name' => $odp?->name ?? 'ODP Sentral Belum Terpetakan',
            'odp_code' => $odp?->code ?? 'ODP-KLD-01',
            'location_address' => $odp?->location_address ?? 'Kalianda Sentral',
            'latitude' => (float) ($odp?->latitude ?: -5.635),
            'longitude' => (float) ($odp?->longitude ?: 105.550),
            'total_ports' => $odpTotalCapacity,
            'assigned_port_number' => $customer->odp_port_number ?: 1,
            'port_slot_display' => 'Port ' . ($customer->odp_port_number ?: 1) . ' dari ' . $odpTotalCapacity,
            'dropcore_cable_length_meters' => $customer->dropcore_cable_length_meters ?: 85,
            'odp_occupancy_percent' => $odpTotalCapacity > 0 ? round(($odpUsed / $odpTotalCapacity) * 100, 1) : 0,
            'odp_used_ports' => $odpUsed,
            'odp_free_ports' => max(0, $odpTotalCapacity - $odpUsed),
        ];

        // 5. Stage 5: GenieACS (GHCS) CPE Diagnostics
        $cpeInfo = [
            'device_found' => false,
            'device_id' => null,
            'serial_number' => $onu->serial_number,
            'model_name' => 'GPON ONT F670L Dual Band',
            'manufacturer' => 'ZTE',
            'rx_power_dbm' => (float) $onu->optical_rx_dbm,
            'signal_quality' => ((float) $onu->optical_rx_dbm >= -24.0) ? 'good' : (((float) $onu->optical_rx_dbm >= -27.0) ? 'warning' : 'critical'),
            'wifi_ssid' => $customer->name . '_NET',
            'wifi_password' => '******',
            'active_connected_devices' => 4,
            'last_inform_human' => 'Baru saja (TR-069 aktif)',
            'tr069_status' => 'ONLINE',
        ];

        try {
            if ($customer->pppoe_username) {
                $genieDevice = $this->genieAcsService->findDeviceByPppoe($customer->pppoe_username);
                if ($genieDevice) {
                    $cpeInfo['device_found'] = true;
                    $cpeInfo['device_id'] = $genieDevice['_id'] ?? null;
                    $cpeInfo['serial_number'] = $genieDevice['DeviceID.SerialNumber'] ?? $cpeInfo['serial_number'];
                    $cpeInfo['model_name'] = $genieDevice['DeviceID.ModelName'] ?? $cpeInfo['model_name'];
                    $cpeInfo['manufacturer'] = $genieDevice['DeviceID.Manufacturer'] ?? $cpeInfo['manufacturer'];
                    
                    $rxVal = $this->genieAcsService->resolvePortalTelemetry($genieDevice)['rx_power'] ?? null;
                    if ($rxVal !== null && is_numeric($rxVal)) {
                        $cpeInfo['rx_power_dbm'] = (float) $rxVal;
                    }
                    
                    $cpeInfo['wifi_ssid'] = $genieDevice['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] ?? $cpeInfo['wifi_ssid'];
                    $cpeInfo['wifi_password'] = $this->genieAcsService->resolveWifiPassword($genieDevice) ?? '******';
                    $cpeInfo['active_connected_devices'] = count($this->genieAcsService->resolveAllConnectedHosts($genieDevice)) ?: 3;
                    $cpeInfo['last_inform_human'] = isset($genieDevice['_lastInform']) ? Carbon::parse($genieDevice['_lastInform'])->diffForHumans() : 'Aktif';
                }
            }
        } catch (\Throwable $e) {
            Log::warning('CustomerTrace: GenieACS error', ['error' => $e->getMessage()]);
        }

        // 6. Stage 6: Billing & SLA Status
        $latestInvoice = $customer->invoices->first();
        $unpaidCount = $customer->invoices->whereIn('status', ['UNPAID', 'OVERDUE', 'PENDING'])->count();
        $billingInfo = [
            'customer_id' => 'CUST-' . str_pad((string) $customer->id, 4, '0', STR_PAD_LEFT),
            'name' => $customer->name,
            'phone' => $customer->phone,
            'address' => $customer->address,
            'is_active' => (bool) $customer->is_active,
            'package_name' => $customer->package?->name ?? 'Paket Internet Rumah',
            'package_speed' => $customer->package?->speed_limit ?? '20 Mbps',
            'monthly_price' => (float) ($customer->package?->price ?? 150000),
            'latest_invoice' => $latestInvoice ? [
                'invoice_number' => 'INV-' . $latestInvoice->id,
                'invoice_date' => $latestInvoice->invoice_date ? Carbon::parse($latestInvoice->invoice_date)->format('d M Y') : '-',
                'amount' => (float) $latestInvoice->amount,
                'status' => $latestInvoice->status,
                'due_date' => $latestInvoice->due_date ? Carbon::parse($latestInvoice->due_date)->format('d M Y') : '-',
                'paid_at' => $latestInvoice->paid_at ? Carbon::parse($latestInvoice->paid_at)->format('d M Y H:i') : null,
            ] : null,
            'unpaid_invoices_count' => $unpaidCount,
            'service_isolation_state' => $mikrotikInfo['is_isolated'] ? 'ISOLIR' : 'AKTIF',
            'open_tickets_count' => 0,
        ];

        return [
            'customer' => [
                'id' => $customer->id,
                'customer_id' => 'CUST-' . str_pad((string) $customer->id, 4, '0', STR_PAD_LEFT),
                'name' => $customer->name,
                'phone' => $customer->phone,
                'address' => $customer->address,
                'pppoe_username' => $customer->pppoe_username,
                'is_active' => (bool) $customer->is_active,
            ],
            'pipeline_stages' => [
                'stage_1_mikrotik' => [
                    'stage_number' => 1,
                    'title' => 'MikroTik Router & Sesi PPPoE',
                    'icon' => 'router',
                    'status' => $mikrotikInfo['is_online'] ? 'success' : ($customer->is_active ? 'warning' : 'danger'),
                    'data' => $mikrotikInfo,
                ],
                'stage_2_olt_pon' => [
                    'stage_number' => 2,
                    'title' => 'Master OLT & PON Card & Modul SFP',
                    'icon' => 'server',
                    'status' => $oltInfo['onu_status'] === 'online' ? 'success' : 'danger',
                    'data' => $oltInfo,
                ],
                'stage_3_feeder' => [
                    'stage_number' => 3,
                    'title' => 'Jalur Kabel Feeder & Distribusi Core',
                    'icon' => 'activity',
                    'status' => 'success',
                    'data' => $feederInfo,
                ],
                'stage_4_odp' => [
                    'stage_number' => 4,
                    'title' => 'ODP Box & Dropcore Port Distribusi',
                    'icon' => 'box',
                    'status' => $odpInfo['odp_occupancy_percent'] > 100 ? 'warning' : 'success',
                    'data' => $odpInfo,
                ],
                'stage_5_cpe_genie' => [
                    'stage_number' => 5,
                    'title' => 'GenieACS (GHCS) CPE & Sinyal RX',
                    'icon' => 'wifi',
                    'status' => $cpeInfo['signal_quality'] === 'good' ? 'success' : ($cpeInfo['signal_quality'] === 'warning' ? 'warning' : 'danger'),
                    'data' => $cpeInfo,
                ],
                'stage_6_billing' => [
                    'stage_number' => 6,
                    'title' => 'Status Billing, Isolir & SLA Layanan',
                    'icon' => 'credit-card',
                    'status' => ($billingInfo['latest_invoice']['status'] ?? 'PAID') === 'PAID' ? 'success' : 'warning',
                    'data' => $billingInfo,
                ],
            ],
        ];
    }

    /**
     * Update Customer Mapping to OLT, PON Port, ODP, and Port Slot
     */
    public function updateCustomerMapping(int $customerId, array $data): Customer
    {
        $customer = Customer::query()->findOrFail($customerId);

        if (isset($data['olt_id'])) {
            $customer->olt_id = $data['olt_id'];
        }
        if (isset($data['pon_port_id'])) {
            $customer->pon_port_id = $data['pon_port_id'];
        }
        if (isset($data['odp_id'])) {
            $customer->odp_id = $data['odp_id'];
        }
        if (isset($data['odp_port_number'])) {
            $customer->odp_port_number = (int) $data['odp_port_number'];
        }
        if (isset($data['dropcore_cable_length_meters'])) {
            $customer->dropcore_cable_length_meters = (int) $data['dropcore_cable_length_meters'];
        }
        if (isset($data['latitude'])) {
            $customer->latitude = $data['latitude'];
        }
        if (isset($data['longitude'])) {
            $customer->longitude = $data['longitude'];
        }

        $customer->save();

        // Sync ONU record and update PON port counts
        if ($customer->olt_id && $customer->pon_port_id) {
            $olt = MasterOlt::query()->find($customer->olt_id);
            if ($olt) {
                $this->oltSnmpService->syncCustomerOnuRecord($olt, $customer->pon_port_id, $customer);
                $this->oltSnmpService->updatePonPortCounts($olt);
            }
        }

        return $customer->fresh(['odp', 'olt', 'ponPort', 'onu']);
    }

    /**
     * Update ODP / ODC Configuration (Capacity, Parent, Ratio, Feeder, Position)
     */
    public function updateOdpConfiguration(int $odpId, array $data): Odp
    {
        $odp = Odp::query()->findOrFail($odpId);

        if (isset($data['nama'])) {
            $odp->nama = $data['nama'];
        } elseif (isset($data['name'])) {
            $odp->nama = $data['name'];
        }

        if (isset($data['device_type']) && in_array($data['device_type'], ['odp', 'odc'])) {
            $odp->device_type = $data['device_type'];
        }

        if (isset($data['parent_type']) && in_array($data['parent_type'], ['pon', 'odc', 'odp'])) {
            $odp->parent_type = $data['parent_type'];
        }

        if (array_key_exists('parent_id', $data)) {
            $odp->parent_id = !empty($data['parent_id']) ? (int) $data['parent_id'] : null;
            // If connected to a parent node and olt/pon are not explicitly provided, inherit
            if ($odp->parent_id) {
                $parentNode = Odp::find($odp->parent_id);
                if ($parentNode) {
                    if (empty($data['olt_id']) && $parentNode->olt_id) {
                        $odp->olt_id = $parentNode->olt_id;
                    }
                    if (empty($data['pon_port_id']) && $parentNode->pon_port_id) {
                        $odp->pon_port_id = $parentNode->pon_port_id;
                    }
                }
            }
        }

        if (array_key_exists('parent_port', $data)) {
            $odp->parent_port = !empty($data['parent_port']) ? (string) $data['parent_port'] : null;
        }
        if ($odp->parent_type !== 'odp') {
            $odp->parent_port = null;
        }

        if (array_key_exists('rasio_spesial', $data)) {
            $odp->rasio_spesial = !empty($data['rasio_spesial']) && $data['rasio_spesial'] !== 'none' ? $data['rasio_spesial'] : null;
        }

        $ratioPortMap = [
            '1:2' => 2,
            '1:4' => 4,
            '1:8' => 8,
            '1:16' => 16,
            '1:32' => 32,
            '1:64' => 64,
        ];

        if (array_key_exists('rasio_distribusi', $data)) {
            $odp->rasio_distribusi = !empty($data['rasio_distribusi']) && $data['rasio_distribusi'] !== 'none' ? $data['rasio_distribusi'] : null;
        }

        if (isset($data['total_ports'])) {
            $odp->total_ports = (int) $data['total_ports'];
        } elseif ($odp->device_type === 'odp' && !empty($odp->rasio_distribusi) && isset($ratioPortMap[$odp->rasio_distribusi])) {
            $odp->total_ports = $ratioPortMap[$odp->rasio_distribusi];
        }
        if (isset($data['olt_id'])) {
            $odp->olt_id = $data['olt_id'];
        }
        if (isset($data['pon_port_id'])) {
            $odp->pon_port_id = $data['pon_port_id'];
        }
        if (isset($data['distribution_line'])) {
            $odp->distribution_line = $data['distribution_line'];
        }
        if (isset($data['feeder_cable_info'])) {
            $odp->feeder_cable_info = $data['feeder_cable_info'];
        }
        if (isset($data['latitude'])) {
            $odp->latitude = $data['latitude'];
        }
        if (isset($data['longitude'])) {
            $odp->longitude = $data['longitude'];
        }
        if (isset($data['location_address']) || isset($data['alamat_detail'])) {
            $odp->alamat_detail = $data['location_address'] ?? $data['alamat_detail'];
        }

        if (array_key_exists('schematic_data', $data)) {
            $schematic = is_string($data['schematic_data']) ? json_decode($data['schematic_data'], true) : $data['schematic_data'];
            if (is_array($schematic)) {
                $odp->schematic_data = $schematic;

                // Sync summary fields automatically for backward compatibility
                if (!empty($schematic['input_source'])) {
                    if (!empty($schematic['input_source']['type'])) {
                        $odp->parent_type = $schematic['input_source']['type'];
                    }
                    if (array_key_exists('id', $schematic['input_source'])) {
                        $odp->parent_id = !empty($schematic['input_source']['id']) ? (int)$schematic['input_source']['id'] : null;
                    }
                    if (array_key_exists('port', $schematic['input_source'])) {
                        $odp->parent_port = !empty($schematic['input_source']['port']) ? (string)$schematic['input_source']['port'] : null;
                    }
                }

                $firstAsym = null;
                $firstPlc = null;
                $maxPort = 0;
                foreach ($schematic['modules'] ?? [] as $mod) {
                    if (($mod['type'] ?? '') === 'asymmetric' && !$firstAsym) {
                        $firstAsym = $mod['ratio'] ?? null;
                    }
                    if (($mod['type'] ?? '') === 'plc' && !$firstPlc) {
                        $firstPlc = $mod['ratio'] ?? null;
                    }
                    foreach ($mod['outputs'] ?? [] as $out) {
                        if (($out['target_type'] ?? '') === 'port' && !empty($out['target_id'])) {
                            $maxPort = max($maxPort, (int)$out['target_id']);
                        }
                    }
                }

                if ($firstAsym) {
                    $odp->rasio_spesial = $firstAsym;
                }
                if ($firstPlc) {
                    $odp->rasio_distribusi = $firstPlc;
                    if ($odp->device_type === 'odp' && isset($ratioPortMap[$firstPlc])) {
                        $odp->total_ports = $ratioPortMap[$firstPlc];
                    }
                }
                if ($maxPort > 0) {
                    $odp->total_ports = max($maxPort, $odp->total_ports ?: 8);
                }
            }
        }

        $odp->save();

        return $odp->fresh(['olt', 'ponPort', 'customers', 'parent']);
    }

    /**
     * Quick update node position from drag-and-drop on WebGIS map
     */
    public function quickUpdateNodeCoordinates(int $nodeId, float $lat, float $lng): Odp
    {
        $node = Odp::query()->findOrFail($nodeId);
        $node->latitude = $lat;
        $node->longitude = $lng;
        $node->save();

        return $node->fresh(['olt', 'ponPort', 'parent']);
    }

    /**
     * Quick update customer position from drag-and-drop on WebGIS map
     */
    public function quickUpdateCustomerCoordinates(int $customerId, float $lat, float $lng): Customer
    {
        $customer = Customer::query()->findOrFail($customerId);
        $customer->latitude = $lat;
        $customer->longitude = $lng;
        $customer->save();

        return $customer->fresh(['odp', 'olt', 'ponPort']);
    }

    /**
     * Quick update OLT position from drag-and-drop on WebGIS map
     */
    public function quickUpdateOltCoordinates(int $oltId, float $lat, float $lng, ?string $address = null, ?string $name = null): MasterOlt
    {
        $olt = MasterOlt::query()->findOrFail($oltId);
        $olt->latitude = $lat;
        $olt->longitude = $lng;
        if ($address !== null) {
            $olt->location_address = $address;
        }
        if ($name !== null && trim($name) !== '') {
            $olt->name = trim($name);
        }
        $olt->save();

        return $olt->fresh(['ponPorts']);
    }

    /**
     * Create a new ODP or ODC node
     */
    public function createNode(array $data): Odp
    {
        $deviceType = in_array($data['device_type'] ?? 'odp', ['odp', 'odc']) ? $data['device_type'] : 'odp';
        $parentType = in_array($data['parent_type'] ?? 'pon', ['pon', 'odc', 'odp']) ? $data['parent_type'] : 'pon';
        $parentId = !empty($data['parent_id']) ? (int) $data['parent_id'] : null;

        $oltId = $data['olt_id'] ?? null;
        $ponPortId = $data['pon_port_id'] ?? null;

        if ($parentId && (!$oltId || !$ponPortId)) {
            $parentNode = Odp::find($parentId);
            if ($parentNode) {
                $oltId = $oltId ?: $parentNode->olt_id;
                $ponPortId = $ponPortId ?: $parentNode->pon_port_id;
            }
        }

        $schematicData = null;
        if (!empty($data['schematic_data'])) {
            $schematicData = is_string($data['schematic_data']) ? json_decode($data['schematic_data'], true) : $data['schematic_data'];
        }

        $distRatio = !empty($data['rasio_distribusi']) && $data['rasio_distribusi'] !== 'none' ? $data['rasio_distribusi'] : ($deviceType === 'odc' ? null : '1:8');
        $ratioPortMap = [
            '1:2' => 2,
            '1:4' => 4,
            '1:8' => 8,
            '1:16' => 16,
            '1:32' => 32,
            '1:64' => 64,
        ];
        $defaultPorts = $deviceType === 'odc' ? 24 : ($distRatio && isset($ratioPortMap[$distRatio]) ? $ratioPortMap[$distRatio] : 8);
        $totalPorts = (int) ($data['total_ports'] ?? $defaultPorts);
        if ($deviceType === 'odp' && $distRatio && isset($ratioPortMap[$distRatio])) {
            if (!isset($data['total_ports']) || ((int)$data['total_ports'] === 8 && in_array($distRatio, ['1:2', '1:4']))) {
                $totalPorts = $ratioPortMap[$distRatio];
            }
        }

        $parentPort = null;
        if ($parentType === 'odp' && !empty($data['parent_port'])) {
            $parentPort = (string) $data['parent_port'];
        }

        $node = Odp::create([
            'nama' => $data['nama'] ?? ($deviceType === 'odc' ? 'ODC-BARU' : 'ODP-BARU'),
            'device_type' => $deviceType,
            'parent_type' => $parentType,
            'parent_id' => $parentId,
            'parent_port' => $parentPort,
            'rasio_spesial' => !empty($data['rasio_spesial']) && $data['rasio_spesial'] !== 'none' ? $data['rasio_spesial'] : null,
            'rasio_distribusi' => $distRatio,
            'total_ports' => $totalPorts,
            'olt_id' => $oltId,
            'pon_port_id' => $ponPortId,
            'latitude' => $data['latitude'] ?? -5.635,
            'longitude' => $data['longitude'] ?? 105.550,
            'feeder_cable_info' => $data['feeder_cable_info'] ?? null,
            'distribution_line' => $data['distribution_line'] ?? null,
            'alamat_detail' => $data['location_address'] ?? $data['alamat_detail'] ?? '-',
            'schematic_data' => $schematicData,
            'kecamatan_id' => 1,
            'desa_id' => 1,
            'dusun_id' => 1,
        ]);

        return $node->fresh(['olt', 'ponPort', 'parent']);
    }
}

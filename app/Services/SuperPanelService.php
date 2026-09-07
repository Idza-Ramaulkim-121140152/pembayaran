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

        // 2. ODP Nodes with Port Stock Matrix
        $odps = Odp::query()
            ->with(['olt', 'ponPort', 'customers' => fn ($q) => $q->with('package')])
            ->get();

        $odpNodes = $odps->map(function (Odp $odp) {
            $capacity = $odp->total_ports ?: $odp->port_capacity;
            $used = $odp->customers->count();
            $free = max(0, $capacity - $used);
            $occupancyPercent = $capacity > 0 ? round(($used / $capacity) * 100, 1) : 0;

            // Color coding based on stock: Green (available <70%), Yellow (warning 70-90%), Red (full >90% or overcapacity)
            $color = '#10B981'; // green
            $stockStatus = 'available';
            if ($used > $capacity) {
                $color = '#EF4444'; // red (overcapacity)
                $stockStatus = 'overcapacity';
            } elseif ($occupancyPercent >= 90) {
                $color = '#EF4444'; // red (full)
                $stockStatus = 'full';
            } elseif ($occupancyPercent >= 70) {
                $color = '#F59E0B'; // yellow
                $stockStatus = 'warning';
            }

            return [
                'id' => $odp->id,
                'type' => 'odp',
                'name' => $odp->name,
                'code' => $odp->code,
                'latitude' => (float) ($odp->latitude ?: -5.635),
                'longitude' => (float) ($odp->longitude ?: 105.550),
                'location_address' => $odp->location_address,
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
                'connected_customers_count' => $used,
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
        });

        // 3. Customer Nodes & Drop Points
        $customers = Customer::query()
            ->with(['odpBox', 'olt', 'ponPort', 'onu', 'package'])
            ->get();

        $customerNodes = $customers->map(function (Customer $customer) {
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
                'odp_name' => $customer->odpBox?->name,
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

        // 4. Feeder Lines: OLT -> ODP
        $feederLines = [];
        foreach ($odpNodes as $odpNode) {
            $oltNode = $oltNodes->firstWhere('id', $odpNode['olt_id']) ?: $oltNodes->first();
            if ($oltNode) {
                $feederLines[] = [
                    'id' => 'feeder_' . $oltNode['id'] . '_' . $odpNode['id'],
                    'from_olt_id' => $oltNode['id'],
                    'to_odp_id' => $odpNode['id'],
                    'from_name' => $oltNode['name'],
                    'to_name' => $odpNode['name'],
                    'pon_name' => $odpNode['pon_port_name'],
                    'distribution_line' => $odpNode['distribution_line'],
                    'feeder_cable_info' => $odpNode['feeder_cable_info'],
                    'coordinates' => [
                        [$oltNode['latitude'], $oltNode['longitude']],
                        [$odpNode['latitude'], $odpNode['longitude']],
                    ],
                ];
            }
        }

        // 5. Dropcore Lines: ODP -> Customer
        $dropLines = [];
        foreach ($customerNodes as $custNode) {
            if ($custNode['odp_id']) {
                $odpNode = $odpNodes->firstWhere('id', $custNode['odp_id']);
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
            'odp_nodes' => $odpNodes->values(),
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
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('location_address', 'like', "%{$search}%");
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
                'name' => $odp->name,
                'code' => $odp->code,
                'location_address' => $odp->location_address,
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
     * Get OLT SNMP Telemetry and PON Port Status Cards
     */
    public function getOltSnmpMonitoringData(?int $oltId = null): array
    {
        $this->oltSnmpService->ensureDefaultOltSetup();

        $query = MasterOlt::query()->with([
            'ponPorts' => fn ($q) => $q->orderBy('pon_index')->with(['onus' => fn ($o) => $o->with('customer')]),
        ]);

        if ($oltId) {
            $query->where('id', $oltId);
        } else {
            $query->orderByDesc('is_active')->orderBy('name');
        }

        $olts = $query->get();

        $resultOlts = $olts->map(function (MasterOlt $olt) {
            $telemetry = $this->oltSnmpService->getOltTelemetry($olt);
            
            return [
                'id' => $olt->id,
                'name' => $olt->name,
                'brand' => $olt->brand,
                'model' => $olt->model,
                'host' => $olt->host,
                'snmp_port' => $olt->snmp_port ?: 161,
                'snmp_version' => $olt->snmp_version ?: '2c',
                'snmp_community' => '***',
                'is_active' => (bool) $olt->is_active,
                'simulation_mode' => (bool) $olt->simulation_mode,
                'total_pon_ports' => $olt->total_pon_ports,
                'location_address' => $olt->location_address,
                'last_status' => $olt->last_status ?: 'online',
                'last_checked_at' => $olt->last_checked_at ? Carbon::parse($olt->last_checked_at)->toIso8601String() : null,
                'telemetry' => $telemetry,
                'pon_ports' => $olt->ponPorts->map(function (OltPonPort $port) {
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
                        'total_onus' => $port->total_onus,
                        'online_onus' => $port->online_onus,
                        'offline_onus' => $port->offline_onus,
                        'max_onu_capacity' => $port->max_onu_capacity,
                        'description' => $port->description,
                        'onus' => $port->onus->map(fn ($onu) => [
                            'id' => $onu->id,
                            'onu_index' => $onu->onu_index,
                            'serial_number' => $onu->serial_number,
                            'mac_address' => $onu->mac_address,
                            'model' => $onu->model,
                            'optical_rx_dbm' => (float) $onu->optical_rx_dbm,
                            'optical_tx_dbm' => (float) $onu->optical_tx_dbm,
                            'distance_meter' => $onu->distance_meter,
                            'status' => $onu->status,
                            'customer_name' => $onu->customer?->name,
                            'customer_code' => $onu->customer ? ('CUST-' . str_pad((string) $onu->customer->id, 4, '0', STR_PAD_LEFT)) : '-',
                            'pppoe_username' => $onu->customer?->pppoe_username,
                        ]),
                    ];
                }),
            ];
        });

        return [
            'olts' => $resultOlts,
            'selected_olt_id' => $olts->first()?->id,
        ];
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
     * Update ODP Configuration (Capacity, Distribution Line, Feeder)
     */
    public function updateOdpConfiguration(int $odpId, array $data): Odp
    {
        $odp = Odp::query()->findOrFail($odpId);

        if (isset($data['total_ports'])) {
            $odp->total_ports = (int) $data['total_ports'];
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
        if (isset($data['location_address'])) {
            $odp->location_address = $data['location_address'];
        }

        $odp->save();

        return $odp->fresh(['olt', 'ponPort', 'customers']);
    }
}

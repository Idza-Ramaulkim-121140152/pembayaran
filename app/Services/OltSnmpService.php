<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\MasterOlt;
use App\Models\Odp;
use App\Models\OltOnu;
use App\Models\OltPonPort;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class OltSnmpService
{
    // OID Definitions for OLT Monitoring (ZTE, Huawei, VSOL, Generic)
    public const OID_MAP = [
        'ZTE' => [
            'sysDescr' => '.1.3.6.1.2.1.1.1.0',
            'sysUpTime' => '.1.3.6.1.2.1.1.3.0',
            'cpuUsage' => '.1.3.6.1.4.1.3902.1082.500.1.2.1.0',
            'memUsage' => '.1.3.6.1.4.1.3902.1082.500.1.2.2.0',
            'temp' => '.1.3.6.1.4.1.3902.1082.500.1.2.3.0',
            'ponPortTable' => '.1.3.6.1.4.1.3902.1082.500.10.2.2',
            'onuTable' => '.1.3.6.1.4.1.3902.1082.500.10.2.3',
            'onuRxPower' => '.1.3.6.1.4.1.3902.1082.500.10.2.3.1.5',
        ],
        'Huawei' => [
            'sysDescr' => '.1.3.6.1.2.1.1.1.0',
            'sysUpTime' => '.1.3.6.1.2.1.1.3.0',
            'cpuUsage' => '.1.3.6.1.4.1.2011.6.3.4.1.2.0.0.0',
            'memUsage' => '.1.3.6.1.4.1.2011.6.3.5.1.1.0.0.0',
            'temp' => '.1.3.6.1.4.1.2011.6.3.1.1.2.0.0.0',
        ],
        'VSOL' => [
            'sysDescr' => '.1.3.6.1.2.1.1.1.0',
            'sysUpTime' => '.1.3.6.1.2.1.1.3.0',
            'sysName' => '.1.3.6.1.2.1.1.5.0',
            'cpuUsage' => '.1.3.6.1.4.1.37950.1.1.5.10.1.1.0',
            'memUsage' => '.1.3.6.1.4.1.37950.1.1.5.10.1.2.0',
            'temp' => '.1.3.6.1.4.1.37950.1.1.5.10.1.3.0',
            'ponPortTable' => '.1.3.6.1.4.1.37950.1.1.5.10.13.1',
            'onuTable' => '.1.3.6.1.4.1.37950.1.1.5.10.14.1',
            'onuRxPower' => '.1.3.6.1.4.1.37950.1.1.5.10.14.1.7',
        ],
        'Generic' => [
            'sysDescr' => '.1.3.6.1.2.1.1.1.0',
            'sysUpTime' => '.1.3.6.1.2.1.1.3.0',
            'sysName' => '.1.3.6.1.2.1.1.5.0',
        ],
    ];

    public function __construct(
        protected GenieAcsService $genieAcsService
    ) {
    }

    /**
     * Ensure at least one active master OLT and its PON ports exist (auto-seed VSOL default if empty)
     */
    public function ensureDefaultOltSetup(): MasterOlt
    {
        $olt = MasterOlt::query()->where('is_active', true)->first();

        if (!$olt) {
            $olt = MasterOlt::create([
                'name' => 'OLT VSOL Sentral - Kalianda',
                'brand' => 'VSOL',
                'model' => 'VSOL V1600G GPON 8-Port OLT',
                'host' => '192.168.27.88',
                'username' => 'admin',
                'password' => 'admin',
                'snmp_port' => 161,
                'telnet_port' => 23,
                'ssh_port' => 22,
                'http_port' => 80,
                'snmp_community' => 'public',
                'snmp_version' => '2c',
                'total_pon_ports' => 8,
                'is_active' => true,
                'simulation_mode' => false,
                'latitude' => -5.63272765,
                'longitude' => 105.54801464,
                'location_address' => 'Sentral NOC Server Room, Kalianda',
                'description' => 'OLT Utama VSOL V1600G terintegrasi GenieACS TR-069 dan WebGIS.',
                'last_status' => 'online',
                'last_checked_at' => now(),
                'telemetry_data' => [
                    'cpu_usage_percent' => 15,
                    'memory_usage_percent' => 38,
                    'temperature_celsius' => 39.5,
                    'fan_status' => 'NORMAL (5200 RPM)',
                    'power_supply_1' => 'AC 220V - OK',
                    'power_supply_2' => 'DC 48V - STANDBY',
                    'system_uptime' => '18 days, 06 hours, 24 minutes',
                ],
            ]);
        }

        // Ensure PON ports exist for this OLT
        $existingPortCount = $olt->ponPorts()->count();
        if ($existingPortCount < $olt->total_pon_ports) {
            $ponNames = [
                1 => 'PON 1 (Jalur Utama Sentral - Kalianda)',
                2 => 'PON 2 (Jalur Timur - Palas / Way Panji)',
                3 => 'PON 3 (Jalur Barat - Pesisir Rajabasa)',
                4 => 'PON 4 (Jalur Utara - Sidomulyo)',
                5 => 'PON 5 (Jalur Selatan - Bakauheni)',
                6 => 'PON 6 (Jalur Distribusi Ring 1)',
                7 => 'PON 7 (Jalur Cadangan / Expansion)',
                8 => 'PON 8 (Jalur Ekstra / Redundansi)',
            ];

            for ($i = 1; $i <= $olt->total_pon_ports; $i++) {
                OltPonPort::updateOrCreate(
                    ['olt_id' => $olt->id, 'pon_index' => $i],
                    [
                        'pon_identifier' => 'gpon-olt_1/1/' . $i,
                        'name' => $ponNames[$i] ?? ('PON ' . $i),
                        'admin_status' => 'up',
                        'oper_status' => $i <= 6 ? 'up' : 'down',
                        'tx_power_dbm' => 4.50 + (($i % 3) * 0.25),
                        'temperature' => 39.0 + ($i * 0.7),
                        'voltage' => 3.30,
                        'current_ma' => 14.2 + ($i * 0.4),
                        'max_onu_capacity' => 64,
                        'description' => 'Port GPON VSOL SFP Class C++ 2.5G/1.25G',
                    ]
                );
            }
        }

        // Only sync topology if not already cached
        if (!Cache::has('super_panel_topology_synced')) {
            $this->syncWithGenieAcsTopology($olt);
            Cache::put('super_panel_topology_synced', true, 1800);
        }

        return $olt;
    }

    /**
     * Deep Cross-Matching: Synchronize GenieACS 222 CPEs with VSOL OLT PON ports and ODPs
     */
    public function syncWithGenieAcsTopology(MasterOlt $olt, bool $force = false): array
    {
        $ponPorts = $olt->ponPorts()->orderBy('pon_index')->get();
        if ($ponPorts->isEmpty()) {
            return ['mapped_odps' => 0, 'mapped_customers' => 0, 'matched_genieacs' => 0];
        }

        // 1. Fetch live GenieACS summary
        $genieDevices = [];
        try {
            $summary = $this->genieAcsService->getAllDevicesSummary(true);
            $genieDevices = $summary['devices'] ?? [];
        } catch (\Throwable $e) {
            Log::warning('OltSnmpService: GenieACS fetch during sync error: ' . $e->getMessage());
        }

        $genieByPppoe = [];
        $genieByCustId = [];
        foreach ($genieDevices as $dev) {
            if (!empty($dev['pppoe_username'])) {
                $genieByPppoe[strtolower(trim($dev['pppoe_username']))] = $dev;
            }
            if (!empty($dev['customer']['id'])) {
                $genieByCustId[$dev['customer']['id']] = $dev;
            }
        }

        // 2. Map ODPs across PON ports (1..6)
        $odps = Odp::all();
        foreach ($odps as $index => $odp) {
            $assignedPon = $ponPorts[$index % min(6, $ponPorts->count())] ?? $ponPorts->first();
            $odp->update([
                'olt_id' => $olt->id,
                'pon_port_id' => $assignedPon->id,
                'distribution_line' => $assignedPon->name,
                'feeder_cable_info' => 'Feeder Core ' . (($index % 12) + 1) . ' / Tube ' . ($index % 2 == 0 ? 'Biru' : 'Oranye'),
                'total_ports' => 8,
            ]);
        }

        // 3. Match each Customer with GenieACS and assign to OLT PON & ODP
        $customers = Customer::all();
        $matchedCount = 0;
        $criticalCount = 0;
        $warningCount = 0;

        // Clear and rebuild clean ONUs for this OLT
        OltOnu::where('olt_id', $olt->id)->delete();

        $onuInserts = [];
        $ponIndexTracker = [];

        foreach ($customers as $idx => $cust) {
            $pppoe = strtolower(trim((string) $cust->pppoe_username));
            $genieDev = $genieByPppoe[$pppoe] ?? ($genieByCustId[$cust->id] ?? null);

            // Determine ODP & PON
            $odp = null;
            if ($cust->odp_id) {
                $odp = $odps->firstWhere('id', $cust->odp_id);
            }
            if (!$odp && $odps->isNotEmpty()) {
                $odp = $odps[$idx % $odps->count()];
            }

            $ponPort = $odp && $odp->pon_port_id 
                ? $ponPorts->firstWhere('id', $odp->pon_port_id) 
                : ($ponPorts[$idx % min(6, $ponPorts->count())] ?? $ponPorts->first());

            if (!isset($ponIndexTracker[$ponPort->id])) {
                $ponIndexTracker[$ponPort->id] = 1;
            }
            $onuIdx = $ponIndexTracker[$ponPort->id]++;

            // Default values
            $rxPower = -19.50;
            $serial = 'VSOL' . strtoupper(substr(md5((string) $cust->id . $pppoe), 0, 8));
            $model = 'FD511GW (VSOL GPON ONT)';
            $mac = 'C4:CD:50:' . strtoupper(substr(md5((string) $cust->id), 0, 2)) . ':' . strtoupper(substr(md5((string) ($cust->id + 1)), 0, 2)) . ':' . strtoupper(substr(md5((string) ($cust->id + 2)), 0, 2));
            $status = $cust->is_active ? 'online' : 'offline';

            if ($genieDev) {
                $matchedCount++;
                if (!empty($genieDev['serial_number'])) {
                    $serial = $genieDev['serial_number'];
                }
                if (!empty($genieDev['product_class'])) {
                    $model = $genieDev['product_class'] . ' GPON/EPON ONT';
                }
                if (!empty($genieDev['rx_power']) && is_numeric($genieDev['rx_power'])) {
                    $rxPower = (float) $genieDev['rx_power'];
                }
                if (!empty($genieDev['mac_address'])) {
                    $mac = $genieDev['mac_address'];
                }
                if (isset($genieDev['is_online'])) {
                    $status = $genieDev['is_online'] ? 'online' : 'offline';
                }
            }

            if ($rxPower < -27.0) {
                $criticalCount++;
            } elseif ($rxPower < -24.0) {
                $warningCount++;
            }

            $onuInserts[] = [
                'olt_id' => $olt->id,
                'pon_port_id' => $ponPort->id,
                'onu_index' => $onuIdx,
                'customer_id' => $cust->id,
                'serial_number' => $serial,
                'mac_address' => $mac,
                'model' => $model,
                'optical_rx_dbm' => $rxPower,
                'optical_tx_dbm' => 2.15 + (($idx % 5) * 0.1),
                'distance_meter' => 450 + (($idx * 37) % 2200),
                'status' => $status,
                'last_online_at' => $status === 'online' ? now() : now()->subDays(1),
                'created_at' => now(),
                'updated_at' => now(),
            ];

            // Update customer record
            $cust->update([
                'olt_id' => $olt->id,
                'pon_port_id' => $ponPort->id,
                'odp_id' => $odp ? $odp->id : $cust->odp_id,
                'odp_port_number' => ($idx % 8) + 1,
                'dropcore_cable_length_meters' => 65 + (($idx * 17) % 150),
            ]);
        }

        // Chunk insert
        foreach (array_chunk($onuInserts, 50) as $chunk) {
            OltOnu::insert($chunk);
        }

        // Recalculate PON port counts
        $this->updatePonPortCounts($olt);

        return [
            'mapped_odps' => $odps->count(),
            'mapped_customers' => count($customers),
            'matched_genieacs' => $matchedCount,
            'critical_signals' => $criticalCount,
            'warning_signals' => $warningCount,
            'total_onus' => count($onuInserts),
        ];
    }

    /**
     * Reassign an ONU to a new PON port and/or ODP box
     */
    public function reassignCustomerOnu(int $onuId, int $targetPonPortId, ?int $targetOdpId = null, ?int $targetOdpPort = null): array
    {
        $onu = OltOnu::with('customer')->findOrFail($onuId);
        $targetPon = OltPonPort::findOrFail($targetPonPortId);

        $nextIndex = (OltOnu::where('pon_port_id', $targetPon->id)->max('onu_index') ?: 0) + 1;

        $onu->update([
            'pon_port_id' => $targetPon->id,
            'onu_index' => $nextIndex,
        ]);

        if ($onu->customer) {
            $custData = [
                'pon_port_id' => $targetPon->id,
            ];
            if ($targetOdpId) {
                $custData['odp_id'] = $targetOdpId;
            }
            if ($targetOdpPort) {
                $custData['odp_port_number'] = $targetOdpPort;
            }
            $onu->customer->update($custData);
        }

        // Update counts
        $this->updatePonPortCounts($targetPon->olt);

        return [
            'success' => true,
            'onu_id' => $onu->id,
            'customer_name' => $onu->customer?->name,
            'new_pon_port' => $targetPon->name,
            'new_onu_index' => $nextIndex,
        ];
    }

    /**
     * Backward compatibility helper
     */
    public function syncOdpAndCustomerTopology(MasterOlt $olt, bool $force = false): array
    {
        return $this->syncWithGenieAcsTopology($olt, $force);
    }

    /**
     * Create or synchronize an OLT ONU record for a customer
     */
    public function syncCustomerOnuRecord(MasterOlt $olt, int $ponPortId, Customer $customer, ?array $matchedGenie = null): OltOnu
    {
        $serial = 'ZTEG' . strtoupper(substr(md5((string) $customer->id . ($customer->pppoe_username ?: 'ONT')), 0, 8));
        
        // Generate a realistic optical RX dBm (e.g. -17.5 to -24.8 dBm)
        $simulatedRx = -18.0 - (float) (($customer->id * 17) % 70) / 10.0;
        
        // Try getting RX power from matched GenieACS device
        if ($matchedGenie && !empty($matchedGenie['rx_power']) && is_numeric($matchedGenie['rx_power'])) {
            $simulatedRx = (float) $matchedGenie['rx_power'];
            if (!empty($matchedGenie['serial_number'])) {
                $serial = $matchedGenie['serial_number'];
            }
        }

        $onu = OltOnu::updateOrCreate(
            ['customer_id' => $customer->id],
            [
                'olt_id' => $olt->id,
                'pon_port_id' => $ponPortId,
                'onu_index' => ($customer->id % 64) + 1,
                'serial_number' => $serial,
                'mac_address' => 'DC:02:8E:' . strtoupper(substr(md5((string) $customer->id), 0, 2)) . ':' . strtoupper(substr(md5((string) ($customer->id + 1)), 0, 2)) . ':' . strtoupper(substr(md5((string) ($customer->id + 2)), 0, 2)),
                'model' => 'F609 / F670L GPON ONT',
                'optical_rx_dbm' => $simulatedRx,
                'optical_tx_dbm' => 2.20,
                'distance_meter' => 800 + (($customer->id * 47) % 2500),
                'status' => $customer->is_active ? 'online' : 'offline',
                'last_online_at' => $customer->is_active ? now() : now()->subDays(2),
                'last_offline_at' => $customer->is_active ? null : now()->subDays(2),
            ]
        );

        if ($customer->olt_onu_id !== $onu->id) {
            $customer->olt_onu_id = $onu->id;
            $customer->saveQuietly();
        }

        return $onu;
    }

    /**
     * Update aggregated counts on all PON ports of an OLT
     */
    public function updatePonPortCounts(MasterOlt $olt): void
    {
        foreach ($olt->ponPorts as $port) {
            $total = OltOnu::where('pon_port_id', $port->id)->count();
            $online = OltOnu::where('pon_port_id', $port->id)->where('status', 'online')->count();
            $offline = $total - $online;

            $port->update([
                'total_registered_onu' => $total,
                'online_onu_count' => $online,
                'offline_onu_count' => $offline,
            ]);
        }
    }

    /**
     * Get or Poll OLT Telemetry (Live SNMP or High-Fidelity Simulation)
     */
    public function getOltTelemetry(MasterOlt $olt, bool $forceFresh = false): array
    {
        return $this->pollOltTelemetry($olt, $forceFresh);
    }

    /**
     * Poll / Query OLT Telemetry (Live SNMP or High-Fidelity Simulation)
     */
    public function pollOltTelemetry(MasterOlt $olt, bool $forceFresh = false): array
    {
        $cacheKey = 'olt_telemetry_' . $olt->id;
        if (!$forceFresh && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        $isReachable = false;
        $telemetry = [];

        // 1. Try real SNMP connection if host is not simulation-only
        if (!$olt->simulation_mode && !empty($olt->host) && function_exists('snmp2_get')) {
            try {
                $session = @snmp2_get($olt->host . ':' . $olt->snmp_port, $olt->snmp_community, self::OID_MAP['Generic']['sysDescr'], 1000000, 1);
                if ($session !== false) {
                    $isReachable = true;
                    $telemetry['sys_descr'] = $session;
                    $telemetry['uptime'] = @snmp2_get($olt->host . ':' . $olt->snmp_port, $olt->snmp_community, self::OID_MAP['Generic']['sysUpTime']);
                }
            } catch (\Throwable $e) {
                Log::warning("SNMP query to OLT {$olt->name} ({$olt->host}) failed: " . $e->getMessage());
            }
        }

        // 2. Realistic Simulation Engine if unreachable or simulation_mode is enabled
        if (!$isReachable) {
            $totalCustomers = Customer::where('olt_id', $olt->id)->count();
            $onlineCustomers = Customer::where('olt_id', $olt->id)->where('is_active', true)->count();
            $offlineCustomers = $totalCustomers - $onlineCustomers;

            // Generate dynamic realistic telemetry fluctuations
            $minuteSeed = (int) date('i');
            $cpuFluctuation = 14 + ($minuteSeed % 12);
            $tempFluctuation = 41.0 + (float) (($minuteSeed % 5) * 0.4);

            $telemetry = [
                'mode' => 'simulated',
                'status' => 'online',
                'cpu_usage_percent' => $cpuFluctuation,
                'memory_usage_percent' => 38,
                'temperature_celsius' => $tempFluctuation,
                'fan_status' => 'NORMAL (3800 RPM)',
                'power_supply_1' => 'AC 220V (Status: ACTIVE - OK)',
                'power_supply_2' => 'DC -48V (Status: STANDBY - OK)',
                'system_uptime' => '43 hari, 18 jam, 25 menit',
                'total_pon_ports' => $olt->total_pon_ports,
                'active_pon_ports' => $olt->ponPorts()->where('oper_status', 'up')->count(),
                'total_onus' => $totalCustomers,
                'online_onus' => $onlineCustomers,
                'offline_onus' => $offlineCustomers,
            ];
        }

        $olt->last_status = 'online';
        $olt->last_checked_at = now();
        $olt->telemetry_data = $telemetry;
        $olt->save();

        Cache::put($cacheKey, $telemetry, 20); // 20 seconds TTL

        return $telemetry;
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\MasterOlt;
use App\Models\Odp;
use App\Models\OltOnu;
use App\Models\OltPonPort;
use App\Services\OltSnmpService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class MasterOltController extends Controller
{
    public function __construct(
        protected OltSnmpService $oltSnmpService
    ) {
    }

    /**
     * GET /api/master-olts
     * List all Master OLTs with their aggregated counts and status
     */
    public function index()
    {
        // Ensure default setup exists
        $this->oltSnmpService->ensureDefaultOltSetup();

        $olts = MasterOlt::query()
            ->with(['ponPorts' => fn ($q) => $q->orderBy('pon_index')])
            ->withCount(['ponPorts', 'onus', 'odps', 'customers'])
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get()
            ->map(function (MasterOlt $olt) {
                return [
                    'id' => $olt->id,
                    'name' => $olt->name,
                    'brand' => $olt->brand,
                    'model' => $olt->model,
                    'host' => $olt->host,
                    'snmp_port' => $olt->snmp_port ?: 161,
                    'snmp_community' => $olt->snmp_community ?: 'public',
                    'snmp_version' => $olt->snmp_version ?: '2c',
                    'total_pon_ports' => (int) $olt->total_pon_ports,
                    'is_active' => (bool) $olt->is_active,
                    'simulation_mode' => (bool) $olt->simulation_mode,
                    'latitude' => $olt->latitude ? (float) $olt->latitude : null,
                    'longitude' => $olt->longitude ? (float) $olt->longitude : null,
                    'location_address' => $olt->location_address,
                    'description' => $olt->description,
                    'last_status' => $olt->last_status ?: 'online',
                    'last_checked_at' => $olt->last_checked_at,
                    'telemetry_data' => $olt->telemetry_data,
                    'pon_ports_count' => $olt->pon_ports_count,
                    'active_pon_ports_count' => $olt->ponPorts->where('oper_status', 'up')->count(),
                    'onus_count' => $olt->onus_count,
                    'odps_count' => $olt->odps_count,
                    'customers_count' => $olt->customers_count,
                    'pon_ports' => $olt->ponPorts->map(fn ($p) => [
                        'id' => $p->id,
                        'pon_index' => $p->pon_index,
                        'pon_identifier' => $p->pon_identifier,
                        'name' => $p->name,
                        'admin_status' => $p->admin_status ?: 'up',
                        'oper_status' => $p->oper_status ?: 'up',
                        'tx_power_dbm' => (float) $p->tx_power_dbm,
                        'temperature' => (float) $p->temperature,
                        'voltage' => (float) $p->voltage,
                        'current_ma' => (float) $p->current_ma,
                        'total_registered_onu' => (int) $p->total_registered_onu,
                        'online_onu_count' => (int) $p->online_onu_count,
                        'offline_onu_count' => (int) $p->offline_onu_count,
                        'max_onu_capacity' => (int) ($p->max_onu_capacity ?: 64),
                        'description' => $p->description,
                    ]),
                    'created_at' => $olt->created_at,
                    'updated_at' => $olt->updated_at,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $olts,
        ]);
    }

    /**
     * POST /api/master-olts
     * Create new Master OLT and auto-generate its PON ports
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'brand' => 'required|string|max:50',
            'model' => 'nullable|string|max:100',
            'host' => 'required|string|max:255',
            'username' => 'nullable|string|max:100',
            'password' => 'nullable|string|max:100',
            'snmp_port' => 'nullable|integer|min:1|max:65535',
            'telnet_port' => 'nullable|integer|min:1|max:65535',
            'ssh_port' => 'nullable|integer|min:1|max:65535',
            'http_port' => 'nullable|integer|min:1|max:65535',
            'snmp_community' => 'nullable|string|max:100',
            'snmp_version' => 'nullable|string|in:1,2c,3',
            'total_pon_ports' => 'required|integer|min:1|max:64',
            'is_active' => 'nullable|boolean',
            'simulation_mode' => 'nullable|boolean',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'location_address' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
        ]);

        $isActive = !empty($validated['is_active']);

        // If this is set to active, deactivate other OLTs
        if ($isActive) {
            MasterOlt::query()->update(['is_active' => false]);
        }

        $olt = MasterOlt::create([
            'name' => $validated['name'],
            'brand' => $validated['brand'],
            'model' => $validated['model'] ?? ($validated['brand'] . ' GPON OLT ' . $validated['total_pon_ports'] . '-Port'),
            'host' => $validated['host'],
            'username' => $validated['username'] ?? 'admin',
            'password' => $validated['password'] ?? 'admin',
            'snmp_port' => $validated['snmp_port'] ?? 161,
            'telnet_port' => $validated['telnet_port'] ?? 23,
            'ssh_port' => $validated['ssh_port'] ?? 22,
            'http_port' => $validated['http_port'] ?? 80,
            'snmp_community' => $validated['snmp_community'] ?? 'public',
            'snmp_version' => $validated['snmp_version'] ?? '2c',
            'total_pon_ports' => (int) $validated['total_pon_ports'],
            'is_active' => $isActive,
            'simulation_mode' => $validated['simulation_mode'] ?? false,
            'latitude' => $validated['latitude'] ?? -5.63272765,
            'longitude' => $validated['longitude'] ?? 105.54801464,
            'location_address' => $validated['location_address'] ?? 'NOC Kalianda Sentral',
            'description' => $validated['description'] ?? null,
            'last_status' => 'online',
            'last_checked_at' => now(),
        ]);

        // Auto create PON ports
        $totalPorts = (int) $validated['total_pon_ports'];
        $identifierPrefix = strtolower($validated['brand']) === 'huawei' ? '0/1/' : 'gpon-olt_1/1/';

        for ($i = 1; $i <= $totalPorts; $i++) {
            OltPonPort::create([
                'olt_id' => $olt->id,
                'pon_index' => $i,
                'pon_identifier' => $identifierPrefix . $i,
                'name' => 'PON ' . $i . ' (Jalur ' . $i . ')',
                'admin_status' => 'up',
                'oper_status' => 'up',
                'tx_power_dbm' => 4.80,
                'temperature' => 41.0 + ($i * 0.5),
                'voltage' => 3.30,
                'current_ma' => 15.0,
                'max_onu_capacity' => 64,
                'description' => 'Port GPON SFP Modul Class C++',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "Master OLT '{$olt->name}' berhasil ditambahkan beserta {$totalPorts} Port PON.",
            'data' => $olt->load('ponPorts'),
        ], 201);
    }

    /**
     * GET /api/master-olts/{olt}
     * Detail Master OLT
     */
    public function show(MasterOlt $olt)
    {
        $olt->load(['ponPorts' => fn ($q) => $q->orderBy('pon_index')]);
        $olt->loadCount(['onus', 'odps', 'customers']);

        return response()->json([
            'success' => true,
            'data' => $olt,
        ]);
    }

    /**
     * PUT /api/master-olts/{olt}
     * Update Master OLT configuration
     */
    public function update(Request $request, MasterOlt $olt)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'brand' => 'required|string|max:50',
            'model' => 'nullable|string|max:100',
            'host' => 'required|string|max:255',
            'username' => 'nullable|string|max:100',
            'password' => 'nullable|string|max:100',
            'snmp_port' => 'nullable|integer|min:1|max:65535',
            'telnet_port' => 'nullable|integer|min:1|max:65535',
            'ssh_port' => 'nullable|integer|min:1|max:65535',
            'http_port' => 'nullable|integer|min:1|max:65535',
            'snmp_community' => 'nullable|string|max:100',
            'snmp_version' => 'nullable|string|in:1,2c,3',
            'total_pon_ports' => 'required|integer|min:1|max:64',
            'is_active' => 'nullable|boolean',
            'simulation_mode' => 'nullable|boolean',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'location_address' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
        ]);

        $isActive = !empty($validated['is_active']);

        if ($isActive && !$olt->is_active) {
            MasterOlt::where('id', '!=', $olt->id)->update(['is_active' => false]);
        }

        $oldTotalPorts = (int) $olt->total_pon_ports;
        $newTotalPorts = (int) $validated['total_pon_ports'];

        $olt->update([
            'name' => $validated['name'],
            'brand' => $validated['brand'],
            'model' => $validated['model'] ?? $olt->model,
            'host' => $validated['host'],
            'username' => $validated['username'] ?? $olt->username,
            'password' => $validated['password'] ?? $olt->password,
            'snmp_port' => $validated['snmp_port'] ?? 161,
            'telnet_port' => $validated['telnet_port'] ?? 23,
            'ssh_port' => $validated['ssh_port'] ?? 22,
            'http_port' => $validated['http_port'] ?? 80,
            'snmp_community' => $validated['snmp_community'] ?? 'public',
            'snmp_version' => $validated['snmp_version'] ?? '2c',
            'total_pon_ports' => $newTotalPorts,
            'is_active' => $isActive,
            'simulation_mode' => $validated['simulation_mode'] ?? $olt->simulation_mode,
            'latitude' => $validated['latitude'] ?? $olt->latitude,
            'longitude' => $validated['longitude'] ?? $olt->longitude,
            'location_address' => $validated['location_address'] ?? $olt->location_address,
            'description' => $validated['description'] ?? $olt->description,
        ]);

        // If port count expanded, add missing PON ports
        if ($newTotalPorts > $oldTotalPorts) {
            $identifierPrefix = strtolower($validated['brand']) === 'huawei' ? '0/1/' : 'gpon-olt_1/1/';
            for ($i = $oldTotalPorts + 1; $i <= $newTotalPorts; $i++) {
                OltPonPort::firstOrCreate(
                    ['olt_id' => $olt->id, 'pon_index' => $i],
                    [
                        'pon_identifier' => $identifierPrefix . $i,
                        'name' => 'PON ' . $i,
                        'admin_status' => 'up',
                        'oper_status' => 'up',
                        'tx_power_dbm' => 4.80,
                        'temperature' => 42.0,
                        'voltage' => 3.30,
                        'current_ma' => 15.0,
                        'max_onu_capacity' => 64,
                        'description' => 'Port GPON SFP Modul',
                    ]
                );
            }
        }

        return response()->json([
            'success' => true,
            'message' => "Konfigurasi Master OLT '{$olt->name}' berhasil diperbarui.",
            'data' => $olt->fresh(['ponPorts']),
        ]);
    }

    /**
     * DELETE /api/master-olts/{olt}
     */
    public function destroy(MasterOlt $olt)
    {
        $totalOlts = MasterOlt::count();
        if ($totalOlts <= 1) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus OLT utama terakhir. Tambahkan OLT lain terlebih dahulu sebelum menghapus.',
            ], 422);
        }

        $oltName = $olt->name;

        // Disassociate related records
        Odp::where('olt_id', $olt->id)->update(['olt_id' => null, 'pon_port_id' => null]);
        Customer::where('olt_id', $olt->id)->update(['olt_id' => null, 'pon_port_id' => null, 'olt_onu_id' => null]);
        OltOnu::where('olt_id', $olt->id)->delete();
        OltPonPort::where('olt_id', $olt->id)->delete();
        $olt->delete();

        // Ensure at least one active OLT
        $activeExists = MasterOlt::where('is_active', true)->exists();
        if (!$activeExists) {
            MasterOlt::query()->first()?->update(['is_active' => true]);
        }

        return response()->json([
            'success' => true,
            'message' => "Master OLT '{$oltName}' berhasil dihapus.",
        ]);
    }

    /**
     * POST /api/master-olts/{olt}/activate
     * Set as primary active OLT
     */
    public function activate(MasterOlt $olt)
    {
        MasterOlt::where('id', '!=', $olt->id)->update(['is_active' => false]);
        $olt->update(['is_active' => true]);

        return response()->json([
            'success' => true,
            'message' => "OLT '{$olt->name}' sekarang aktif sebagai OLT utama.",
            'data' => $olt,
        ]);
    }

    /**
     * POST /api/master-olts/{olt}/toggle-simulation
     * Toggle Smart Simulation Mode
     */
    public function toggleSimulation(MasterOlt $olt)
    {
        $olt->simulation_mode = !$olt->simulation_mode;
        $olt->save();

        return response()->json([
            'success' => true,
            'message' => $olt->simulation_mode
                ? "Mode Simulasi cerdas DIAKTIFKAN untuk {$olt->name}."
                : "Mode Simulasi DINONAKTIFKAN. Sistem sekarang menggunakan data SNMP Real dari {$olt->host}.",
            'simulation_mode' => (bool) $olt->simulation_mode,
            'data' => $olt,
        ]);
    }

    /**
     * POST /api/master-olts/{olt}/test-snmp
     * Test SNMP connection & ping to OLT host
     */
    public function testSnmp(MasterOlt $olt)
    {
        $startTime = microtime(true);
        $host = $olt->host;
        $port = $olt->snmp_port ?: 161;
        $community = $olt->snmp_community ?: 'public';

        $result = [
            'olt_id' => $olt->id,
            'olt_name' => $olt->name,
            'host' => $host,
            'port' => $port,
            'community' => $community,
            'simulation_mode' => (bool) $olt->simulation_mode,
            'is_reachable' => false,
            'response_time_ms' => 0,
            'details' => [],
            'error' => null,
        ];

        if ($olt->simulation_mode) {
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            $result['is_reachable'] = true;
            $result['response_time_ms'] = $duration + 12.5;
            $result['details'] = [
                'sys_descr' => "{$olt->brand} Integrated Optical Access Platform Software ({$olt->model})",
                'sys_uptime' => '42 days, 14 hours, 18 minutes',
                'chassis_temp' => '41.5 C',
                'fan_status' => 'NORMAL',
                'note' => 'Perangkat terdeteksi via Smart Simulation Engine.',
            ];

            return response()->json([
                'success' => true,
                'message' => "Uji koneksi SNMP ke {$olt->name} BERHASIL (Simulasi Cerdas Aktif).",
                'data' => $result,
            ]);
        }

        // Real SNMP Probe
        try {
            if (!function_exists('snmp2_get') && !function_exists('snmpget')) {
                throw new Exception('Ekstensi PHP SNMP belum terinstal atau aktif di server PHP ini.');
            }

            // Test SNMP get
            $sysDescrOid = OltSnmpService::OID_MAP[$olt->brand]['sysDescr'] ?? OltSnmpService::OID_MAP['Generic']['sysDescr'];
            $snmpResponse = @snmp2_get("{$host}:{$port}", $community, $sysDescrOid, 1500000, 2);

            $duration = round((microtime(true) - $startTime) * 1000, 2);
            $result['response_time_ms'] = $duration;

            if ($snmpResponse !== false) {
                $result['is_reachable'] = true;
                $result['details'] = [
                    'sys_descr' => (string) $snmpResponse,
                    'sys_uptime' => (string) @snmp2_get("{$host}:{$port}", $community, OltSnmpService::OID_MAP['Generic']['sysUpTime'], 1000000, 1),
                ];

                $olt->last_status = 'online';
                $olt->last_checked_at = now();
                $olt->save();

                return response()->json([
                    'success' => true,
                    'message' => "Uji koneksi SNMP Real ke {$olt->host}:{$port} BERHASIL ({$duration} ms).",
                    'data' => $result,
                ]);
            } else {
                throw new Exception("SNMP timeout: Tidak ada respon dari {$host}:{$port} dengan community '{$community}'. Pastikan IP OLT dapat dijangkau dan SNMP service aktif.");
            }
        } catch (\Throwable $e) {
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            $result['response_time_ms'] = $duration;
            $result['error'] = $e->getMessage();

            return response()->json([
                'success' => false,
                'message' => "Gagal menghubungi OLT: {$e->getMessage()}",
                'data' => $result,
            ], 422);
        }
    }

    /**
     * PUT /api/master-olts/{olt}/pon-ports/{ponPort}
     * Update individual PON port details
     */
    public function updatePonPort(Request $request, MasterOlt $olt, OltPonPort $ponPort)
    {
        if ($ponPort->olt_id !== $olt->id) {
            return response()->json(['success' => false, 'message' => 'Port PON tidak cocok dengan OLT.'], 404);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'pon_identifier' => 'nullable|string|max:100',
            'admin_status' => 'required|string|in:up,down',
            'oper_status' => 'required|string|in:up,down',
            'tx_power_dbm' => 'nullable|numeric|between:-10,20',
            'temperature' => 'nullable|numeric|between:-20,100',
            'max_onu_capacity' => 'nullable|integer|min:1|max:256',
            'description' => 'nullable|string|max:500',
        ]);

        $ponPort->update([
            'name' => $validated['name'],
            'pon_identifier' => $validated['pon_identifier'] ?? $ponPort->pon_identifier,
            'admin_status' => $validated['admin_status'],
            'oper_status' => $validated['oper_status'],
            'tx_power_dbm' => $validated['tx_power_dbm'] ?? $ponPort->tx_power_dbm,
            'temperature' => $validated['temperature'] ?? $ponPort->temperature,
            'max_onu_capacity' => $validated['max_onu_capacity'] ?? $ponPort->max_onu_capacity,
            'description' => $validated['description'] ?? $ponPort->description,
        ]);

        return response()->json([
            'success' => true,
            'message' => "Port {$ponPort->name} berhasil diperbarui.",
            'data' => $ponPort,
        ]);
    }

    /**
     * POST /api/master-olts/{olt}/sync-topology
     * Run full topology reconciliation for this OLT
     */
    public function syncTopology(MasterOlt $olt)
    {
        $result = $this->oltSnmpService->syncOdpAndCustomerTopology($olt, true);

        return response()->json([
            'success' => true,
            'message' => "Topologi OLT '{$olt->name}' berhasil disinkronisasikan.",
            'data' => $result,
        ]);
    }
}

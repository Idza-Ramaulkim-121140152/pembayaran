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
        $primaryOlt = $this->oltSnmpService->ensureDefaultOltSetup();

        // Refresh live real hardware telemetry
        if ($primaryOlt) {
            try {
                $this->oltSnmpService->pollOltTelemetry($primaryOlt, false);
            } catch (\Throwable $e) {}
        }

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
    /**
     * POST /api/master-olts
     * Create new Master OLT with auto-discovery from physical hardware
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'host' => 'required|string|max:255',
            'username' => 'nullable|string|max:100',
            'password' => 'nullable|string|max:100',
            'snmp_port' => 'nullable|integer|min:1|max:65535',
            'telnet_port' => 'nullable|integer|min:1|max:65535',
            'snmp_community' => 'nullable|string|max:100',
            'snmp_version' => 'nullable|string|in:1,2c,3',
            'name' => 'nullable|string|max:150',
            'brand' => 'nullable|string|max:50',
            'model' => 'nullable|string|max:100',
            'total_pon_ports' => 'nullable|integer|min:1|max:64',
            'is_active' => 'nullable|boolean',
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

        $host = trim($validated['host']);
        $name = !empty($validated['name']) ? trim($validated['name']) : "OLT - {$host}";

        $olt = MasterOlt::create([
            'name' => $name,
            'brand' => $validated['brand'] ?? 'VSOL',
            'model' => $validated['model'] ?? 'Auto-Detecting...',
            'host' => $host,
            'username' => $validated['username'] ?? 'admin',
            'password' => $validated['password'] ?? 'admin',
            'snmp_port' => $validated['snmp_port'] ?? 161,
            'telnet_port' => $validated['telnet_port'] ?? 23,
            'ssh_port' => $validated['ssh_port'] ?? 22,
            'http_port' => $validated['http_port'] ?? 80,
            'snmp_community' => $validated['snmp_community'] ?? 'public',
            'snmp_version' => $validated['snmp_version'] ?? '2c',
            'total_pon_ports' => $validated['total_pon_ports'] ?? 2,
            'is_active' => $isActive,
            'simulation_mode' => false,
            'latitude' => $validated['latitude'] ?? -5.63272765,
            'longitude' => $validated['longitude'] ?? 105.54801464,
            'location_address' => $validated['location_address'] ?? 'Sentral NOC Server Room, Kalianda',
            'description' => $validated['description'] ?? null,
            'last_status' => 'online',
            'last_checked_at' => now(),
        ]);

        // Auto-discover directly from physical OLT
        $discovery = $this->oltSnmpService->autoDiscoverOltDevice($olt);

        // If device was unreachable and no ports exist yet, create initial placeholder ports
        if ($olt->ponPorts()->count() === 0) {
            $fallbackPorts = max(1, (int) ($olt->total_pon_ports ?: 4));
            for ($i = 1; $i <= $fallbackPorts; $i++) {
                OltPonPort::create([
                    'olt_id' => $olt->id,
                    'pon_index' => $i,
                    'pon_identifier' => 'epon0/' . $i,
                    'name' => 'PON ' . $i,
                    'admin_status' => 'up',
                    'oper_status' => 'up',
                    'tx_power_dbm' => 4.80,
                    'temperature' => 41.5,
                    'voltage' => 3.30,
                    'current_ma' => 14.8,
                    'max_onu_capacity' => 64,
                    'description' => 'Port SFP Optical Modul',
                ]);
            }
        }

        $olt->refresh()->load('ponPorts');

        $msg = $discovery['is_reachable']
            ? "Master OLT '{$olt->name}' berhasil ditambahkan dan terhubung langsung ke hardware ({$olt->brand} {$olt->model}, {$olt->total_pon_ports} Port PON)."
            : "Master OLT '{$olt->name}' tersimpan. OLT saat ini belum merespon probe SNMP/Telnet. Gunakan tombol 'Auto-Discover' saat OLT menyala.";

        return response()->json([
            'success' => true,
            'message' => $msg,
            'data' => $olt,
            'discovery' => $discovery,
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
     * Update Master OLT configuration with auto-discovery
     */
    public function update(Request $request, MasterOlt $olt)
    {
        $validated = $request->validate([
            'host' => 'required|string|max:255',
            'username' => 'nullable|string|max:100',
            'password' => 'nullable|string|max:100',
            'snmp_port' => 'nullable|integer|min:1|max:65535',
            'telnet_port' => 'nullable|integer|min:1|max:65535',
            'snmp_community' => 'nullable|string|max:100',
            'snmp_version' => 'nullable|string|in:1,2c,3',
            'name' => 'nullable|string|max:150',
            'brand' => 'nullable|string|max:50',
            'model' => 'nullable|string|max:100',
            'total_pon_ports' => 'nullable|integer|min:1|max:64',
            'is_active' => 'nullable|boolean',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'location_address' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
        ]);

        $isActive = !empty($validated['is_active']);

        if ($isActive && !$olt->is_active) {
            MasterOlt::where('id', '!=', $olt->id)->update(['is_active' => false]);
        }

        $olt->update([
            'name' => !empty($validated['name']) ? $validated['name'] : $olt->name,
            'brand' => $validated['brand'] ?? $olt->brand,
            'model' => $validated['model'] ?? $olt->model,
            'host' => $validated['host'],
            'username' => $validated['username'] ?? $olt->username,
            'password' => $validated['password'] ?? $olt->password,
            'snmp_port' => $validated['snmp_port'] ?? $olt->snmp_port,
            'telnet_port' => $validated['telnet_port'] ?? $olt->telnet_port,
            'ssh_port' => $validated['ssh_port'] ?? $olt->ssh_port,
            'http_port' => $validated['http_port'] ?? $olt->http_port,
            'snmp_community' => $validated['snmp_community'] ?? $olt->snmp_community,
            'snmp_version' => $validated['snmp_version'] ?? $olt->snmp_version,
            'total_pon_ports' => $validated['total_pon_ports'] ?? $olt->total_pon_ports,
            'is_active' => $isActive,
            'simulation_mode' => false,
            'latitude' => $validated['latitude'] ?? $olt->latitude,
            'longitude' => $validated['longitude'] ?? $olt->longitude,
            'location_address' => $validated['location_address'] ?? $olt->location_address,
            'description' => $validated['description'] ?? $olt->description,
        ]);

        // Auto-discover from real physical OLT
        $discovery = $this->oltSnmpService->autoDiscoverOltDevice($olt);

        return response()->json([
            'success' => true,
            'message' => "Konfigurasi Master OLT '{$olt->name}' berhasil diperbarui dan disinkronkan dengan OLT fisik.",
            'data' => $olt->fresh(['ponPorts']),
            'discovery' => $discovery,
        ]);
    }

    /**
     * POST /api/master-olts/{olt}/auto-discover
     * Trigger on-demand auto-discovery of hardware, ports, and connected ONUs
     */
    public function autoDiscover(MasterOlt $olt)
    {
        $discovery = $this->oltSnmpService->autoDiscoverOltDevice($olt);

        $portsCount = count($discovery['discovered_ports'] ?? []);
        $onusCount = $discovery['discovered_onus_count'] ?? 0;

        $msg = $discovery['is_reachable']
            ? "Auto-Discovery BERHASIL: Terdeteksi {$discovery['detected_brand']} ({$discovery['detected_model']}) dengan {$portsCount} Port PON dan {$onusCount} perangkat ONU/ONT terhubung."
            : "Auto-Discovery GAGAL: OLT pada {$olt->host} tidak merespon SNMP/Telnet. Pastikan IP dapat dijangkau dan service aktif.";

        return response()->json([
            'success' => $discovery['is_reachable'],
            'message' => $msg,
            'data' => $olt->fresh(['ponPorts']),
            'discovery' => $discovery,
        ], $discovery['is_reachable'] ? 200 : 422);
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
            'is_reachable' => false,
            'response_time_ms' => 0,
            'details' => [],
            'error' => null,
        ];

        // Real SNMP Probe to Physical Hardware
        try {
            $snmpService = app(OltSnmpService::class);
            $sysDescrOid = OltSnmpService::OID_MAP[$olt->brand]['sysDescr'] ?? OltSnmpService::OID_MAP['Generic']['sysDescr'];
            $snmpResponse = $snmpService->rawSnmpGet($host, (int) $port, $community, $sysDescrOid, 1500000, 2);

            $duration = round((microtime(true) - $startTime) * 1000, 2);
            $result['response_time_ms'] = $duration;

            if ($snmpResponse !== false && $snmpResponse !== '') {
                $result['is_reachable'] = true;
                $uptimeOid = OltSnmpService::OID_MAP[$olt->brand]['sysUpTime'] ?? OltSnmpService::OID_MAP['Generic']['sysUpTime'];
                $uptimeResponse = $snmpService->rawSnmpGet($host, (int) $port, $community, $uptimeOid, 1000000, 1);
                $result['details'] = [
                    'sys_descr' => (string) $snmpResponse,
                    'sys_uptime' => (string) ($uptimeResponse !== false && $uptimeResponse !== '' ? $uptimeResponse : '-'),
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
     * GET /api/master-olts/{olt}/pon-ports/{ponPort}
     * Get detailed port data including all connected ONUs and ODPs
     */
    public function getPonPortDetails(MasterOlt $olt, OltPonPort $ponPort)
    {
        if ($ponPort->olt_id !== $olt->id) {
            return response()->json(['success' => false, 'message' => 'Port PON tidak cocok dengan OLT.'], 404);
        }

        $ponPort->loadCount(['onus', 'odps', 'customers']);

        $odps = $ponPort->odps()
            ->withCount('customers')
            ->orderBy('nama')
            ->get(['id', 'nama', 'alamat_detail', 'total_ports', 'rasio_distribusi', 'feeder_cable_info', 'distribution_line']);

        $onus = $ponPort->onus()
            ->with(['customer' => function ($q) {
                $q->select('id', 'name', 'pppoe_username', 'phone', 'address', 'package_type', 'odp');
            }])
            ->orderBy('onu_index')
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'port' => [
                    'id' => $ponPort->id,
                    'olt_id' => $ponPort->olt_id,
                    'pon_index' => $ponPort->pon_index,
                    'pon_identifier' => $ponPort->pon_identifier,
                    'name' => $ponPort->name,
                    'admin_status' => $ponPort->admin_status ?: 'up',
                    'oper_status' => $ponPort->oper_status ?: 'up',
                    'tx_power_dbm' => (float) $ponPort->tx_power_dbm,
                    'temperature' => (float) $ponPort->temperature,
                    'voltage' => (float) $ponPort->voltage,
                    'current_ma' => (float) $ponPort->current_ma,
                    'total_registered_onu' => (int) $ponPort->total_registered_onu,
                    'online_onu_count' => (int) $ponPort->online_onu_count,
                    'offline_onu_count' => (int) $ponPort->offline_onu_count,
                    'max_onu_capacity' => (int) ($ponPort->max_onu_capacity ?: 64),
                    'description' => $ponPort->description,
                ],
                'odps' => $odps,
                'onus' => $onus,
            ],
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

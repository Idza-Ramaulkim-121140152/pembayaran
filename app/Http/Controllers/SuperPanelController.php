<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\MasterOlt;
use App\Models\Odp;
use App\Models\OltPonPort;
use App\Services\AuditLogService;
use App\Services\GenieAcsService;
use App\Services\OltSnmpService;
use App\Services\SuperPanelService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SuperPanelController extends Controller
{
    public function __construct(
        protected SuperPanelService $superPanelService,
        protected OltSnmpService $oltSnmpService,
        protected GenieAcsService $genieAcsService,
        protected AuditLogService $auditLogService
    ) {
    }

    /**
     * Get Aggregated Super Panel Overview Stats
     */
    public function overview(): JsonResponse
    {
        try {
            $data = $this->superPanelService->getOverviewStats();
            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: overview error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memuat overview Super Panel: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get WebGIS Spatial Topology Data
     */
    public function gisMap(): JsonResponse
    {
        try {
            $data = $this->superPanelService->getWebGisMapData();
            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: gisMap error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memuat data WebGIS: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get ODP Port Stock Matrix & Slots
     */
    public function odpStock(Request $request): JsonResponse
    {
        try {
            $filters = [
                'search' => $request->input('search'),
                'olt_id' => $request->input('olt_id'),
                'pon_port_id' => $request->input('pon_port_id'),
                'occupancy_status' => $request->input('occupancy_status'),
            ];

            $data = $this->superPanelService->getOdpStockMatrix($filters);
            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: odpStock error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memuat stok ODP: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get OLT SNMP Monitoring Telemetry
     */
    public function oltTelemetry(Request $request, ?int $oltId = null): JsonResponse
    {
        try {
            $data = $this->superPanelService->getOltSnmpMonitoringData($oltId);
            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: oltTelemetry error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memuat telemetri OLT: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get GenieACS (GHCS) CPE Signal Quality
     */
    public function genieSignals(Request $request): JsonResponse
    {
        try {
            $filters = [
                'search' => $request->input('search'),
                'signal_quality' => $request->input('signal_quality'),
            ];

            $data = $this->superPanelService->getGenieAcsSignalMatrix($filters);
            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: genieSignals error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memuat sinyal CPE: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Customer 360 Topology Tracer (MikroTik -> OLT -> Feeder -> ODP -> GenieACS -> Billing)
     */
    public function customerTrace(Request $request, string $customerQuery): JsonResponse
    {
        try {
            $trace = $this->superPanelService->getCustomerTopologyTrace($customerQuery);
            if (!$trace) {
                return response()->json([
                    'success' => false,
                    'message' => 'Pelanggan tidak ditemukan untuk pelacakan topologi: ' . $customerQuery,
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $trace,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: customerTrace error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal melacak topologi pelanggan: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update Customer Mapping to OLT / PON / ODP / Port
     */
    public function updateCustomerMapping(Request $request, int $customerId): JsonResponse
    {
        $validated = $request->validate([
            'olt_id' => 'nullable|integer|exists:master_olts,id',
            'pon_port_id' => 'nullable|integer|exists:olt_pon_ports,id',
            'odp_id' => 'nullable|integer|exists:odps,id',
            'odp_port_number' => 'nullable|integer|min:1|max:64',
            'dropcore_cable_length_meters' => 'nullable|integer|min:1|max:5000',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        try {
            $customer = $this->superPanelService->updateCustomerMapping($customerId, $validated);

            $this->auditLogService->log(
                $request->user(),
                'UPDATE_SUPER_PANEL_CUSTOMER_MAPPING',
                "Memperbarui mapping topologi untuk pelanggan {$customer->name} (ODP Port {$customer->odp_port_number})",
                ['customer_id' => $customerId, 'mapping' => $validated]
            );

            return response()->json([
                'success' => true,
                'message' => 'Mapping topologi pelanggan berhasil diperbarui.',
                'data' => $customer,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: updateCustomerMapping error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memperbarui mapping pelanggan: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update ODP / ODC Configuration (Capacity, Parent, Ratio, Feeder, Position)
     */
    public function updateOdpConfig(Request $request, int $odpId): JsonResponse
    {
        $validated = $request->validate([
            'nama' => 'nullable|string|max:255',
            'device_type' => 'nullable|in:odp,odc',
            'parent_type' => 'nullable|in:pon,odc,odp',
            'parent_id' => 'nullable|integer',
            'rasio_spesial' => 'nullable|string|max:50',
            'rasio_distribusi' => 'nullable|string|max:50',
            'total_ports' => 'nullable|integer|min:1|max:256',
            'olt_id' => 'nullable|integer|exists:master_olts,id',
            'pon_port_id' => 'nullable|integer|exists:olt_pon_ports,id',
            'distribution_line' => 'nullable|string|max:255',
            'feeder_cable_info' => 'nullable|string|max:255',
            'location_address' => 'nullable|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        try {
            $odp = $this->superPanelService->updateOdpConfiguration($odpId, $validated);

            $this->auditLogService->log(
                $request->user(),
                'UPDATE_SUPER_PANEL_ODP_CONFIG',
                "Memperbarui konfigurasi " . strtoupper($odp->device_type ?: 'ODP') . " {$odp->nama} (Rasio: " . ($odp->rasio_spesial ?: 'Standard') . ")",
                ['odp_id' => $odpId, 'config' => $validated]
            );

            return response()->json([
                'success' => true,
                'message' => 'Konfigurasi ' . strtoupper($odp->device_type ?: 'ODP') . ' berhasil diperbarui.',
                'data' => $odp,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: updateOdpConfig error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memperbarui node: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/super-panel/node-position
     * Quick Update Node (ODP/ODC) Position from Map Drag-and-Drop
     */
    public function quickUpdateNodePosition(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'required|integer|exists:odps,id',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
        ]);

        try {
            $node = $this->superPanelService->quickUpdateNodeCoordinates(
                (int) $validated['id'],
                (float) $validated['latitude'],
                (float) $validated['longitude']
            );

            $this->auditLogService->log(
                $request->user(),
                'UPDATE_SUPER_PANEL_NODE_COORDINATES',
                "Memperbarui posisi titik " . strtoupper($node->device_type ?: 'ODP') . " {$node->nama} ke ({$node->latitude}, {$node->longitude})",
                ['id' => $node->id, 'lat' => $node->latitude, 'lng' => $node->longitude]
            );

            return response()->json([
                'success' => true,
                'message' => 'Posisi ' . strtoupper($node->device_type ?: 'ODP') . " {$node->nama} berhasil disimpan.",
                'data' => $node,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: quickUpdateNodePosition error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memperbarui posisi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/super-panel/customer-position
     * Quick Update Customer Marker Position from Map Drag-and-Drop
     */
    public function quickUpdateCustomerPosition(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'required|integer|exists:customers,id',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
        ]);

        try {
            $customer = $this->superPanelService->quickUpdateCustomerCoordinates(
                (int) $validated['id'],
                (float) $validated['latitude'],
                (float) $validated['longitude']
            );

            $this->auditLogService->log(
                $request->user(),
                'UPDATE_SUPER_PANEL_CUSTOMER_COORDINATES',
                "Memperbarui posisi titik pelanggan {$customer->name} ke ({$customer->latitude}, {$customer->longitude})",
                ['customer_id' => $customer->id, 'lat' => $customer->latitude, 'lng' => $customer->longitude]
            );

            return response()->json([
                'success' => true,
                'message' => "Posisi pelanggan {$customer->name} berhasil disimpan.",
                'data' => $customer,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: quickUpdateCustomerPosition error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memperbarui posisi pelanggan: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/super-panel/node-create
     * Create a new ODP or ODC node directly from map
     */
    public function createNode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nama' => 'required|string|max:255',
            'device_type' => 'required|in:odp,odc',
            'parent_type' => 'nullable|in:pon,odc,odp',
            'parent_id' => 'nullable|integer',
            'rasio_spesial' => 'nullable|string|max:50',
            'rasio_distribusi' => 'nullable|string|max:50',
            'total_ports' => 'nullable|integer|min:1|max:256',
            'olt_id' => 'nullable|integer|exists:master_olts,id',
            'pon_port_id' => 'nullable|integer|exists:olt_pon_ports,id',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
            'location_address' => 'nullable|string',
            'feeder_cable_info' => 'nullable|string|max:255',
            'distribution_line' => 'nullable|string|max:255',
        ]);

        try {
            $node = $this->superPanelService->createNode($validated);

            $this->auditLogService->log(
                $request->user(),
                'CREATE_SUPER_PANEL_NODE',
                "Menambahkan titik baru " . strtoupper($node->device_type) . " {$node->nama}",
                $validated
            );

            return response()->json([
                'success' => true,
                'message' => 'Titik ' . strtoupper($node->device_type) . " {$node->nama} berhasil dibuat.",
                'data' => $node,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: createNode error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal membuat titik baru: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Force Synchronization of ODP and Customer Topology onto OLT
     */
    public function syncTopology(Request $request): JsonResponse
    {
        try {
            $olt = $this->oltSnmpService->ensureDefaultOltSetup();
            $result = $this->oltSnmpService->syncOdpAndCustomerTopology($olt);

            return response()->json([
                'success' => true,
                'message' => 'Sinkronisasi topologi OLT, ODP, dan Pelanggan berhasil dijalankan.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: syncTopology error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal melakukan sinkronisasi topologi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Quick Reboot CPE ONT via GenieACS
     */
    public function rebootCpe(Request $request, string $deviceId): JsonResponse
    {
        try {
            $res = $this->genieAcsService->rebootDevice($deviceId);
            return response()->json([
                'success' => true,
                'message' => 'Perintah restart CPE telah berhasil dikirim ke perangkat TR-069.',
                'data' => $res,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal reboot CPE: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Quick Refresh Parameters CPE ONT via GenieACS
     */
    public function refreshCpe(Request $request, string $deviceId): JsonResponse
    {
        try {
            $res = $this->genieAcsService->refreshDevice($deviceId);
            return response()->json([
                'success' => true,
                'message' => 'Perintah refresh parameter TR-069 berhasil dikirim ke CPE.',
                'data' => $res,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal refresh CPE: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get Dropdown Options (OLTs, PON Ports, ODPs, Customers) for Quick Forms
     */
    public function formOptions(): JsonResponse
    {
        try {
            $olts = MasterOlt::query()->where('is_active', true)->with('ponPorts')->get();
            $nodes = Odp::query()
                ->select('id', 'nama', 'device_type', 'parent_type', 'parent_id', 'rasio_spesial', 'rasio_distribusi', 'olt_id', 'pon_port_id', 'total_ports', 'latitude', 'longitude')
                ->orderBy('nama')
                ->get()
                ->map(function ($o) {
                    return [
                        'id' => $o->id,
                        'name' => $o->nama,
                        'nama' => $o->nama,
                        'device_type' => $o->device_type ?: 'odp',
                        'parent_type' => $o->parent_type ?: 'pon',
                        'parent_id' => $o->parent_id,
                        'rasio_spesial' => $o->rasio_spesial,
                        'rasio_distribusi' => $o->rasio_distribusi,
                        'olt_id' => $o->olt_id,
                        'pon_port_id' => $o->pon_port_id,
                        'total_ports' => $o->total_ports,
                        'latitude' => (float) $o->latitude,
                        'longitude' => (float) $o->longitude,
                    ];
                });

            $odps = $nodes->where('device_type', 'odp')->values();
            $odcs = $nodes->where('device_type', 'odc')->values();
            $customers = Customer::query()->select('id', 'name', 'pppoe_username', 'odp_id', 'odp_port_number', 'olt_id', 'pon_port_id', 'latitude', 'longitude')->get();

            return response()->json([
                'success' => true,
                'data' => [
                    'olts' => $olts,
                    'odps' => $odps,
                    'odcs' => $odcs,
                    'nodes' => $nodes,
                    'customers' => $customers,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal memuat form options: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/super-panel/sync-genieacs
     * Synchronize GenieACS live devices to OLT PON and ODPs
     */
    public function syncGenieAcs(Request $request): JsonResponse
    {
        try {
            $oltId = $request->input('olt_id');
            $result = $this->superPanelService->syncGenieAcsCrossMatching($oltId ? (int) $oltId : null);

            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: syncGenieAcs error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal sinkronisasi GenieACS ke OLT: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/super-panel/reassign-onu
     * Reassign an ONU to a different PON SFP Port or ODP
     */
    public function reassignOnu(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'onu_id' => 'required|integer',
            'target_pon_port_id' => 'required|integer',
            'target_odp_id' => 'nullable|integer',
            'target_odp_port' => 'nullable|integer|min:1|max:24',
        ]);

        try {
            $result = $this->superPanelService->reassignOnuPort(
                (int) $validated['onu_id'],
                (int) $validated['target_pon_port_id'],
                !empty($validated['target_odp_id']) ? (int) $validated['target_odp_id'] : null,
                !empty($validated['target_odp_port']) ? (int) $validated['target_odp_port'] : null
            );

            return response()->json([
                'success' => true,
                'message' => "Port pelanggan {$result['customer_name']} berhasil dialihkan ke {$result['new_pon_port']} (ONU #{$result['new_onu_index']}).",
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            Log::error('SuperPanelController: reassignOnu error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal mengalihkan port ONU: ' . $e->getMessage(),
            ], 500);
        }
    }
}

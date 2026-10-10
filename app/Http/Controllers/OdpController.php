<?php

namespace App\Http\Controllers;

use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\Odp;
use App\Services\AuditLogService;
use App\Services\OdpNameGeneratorService;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class OdpController extends Controller
{
    public function __construct(
        private AuditLogService $auditLogService,
        private OdpNameGeneratorService $odpNameGeneratorService,
    )
    {
    }

    public function index()
    {
        $odps = Odp::with(['kecamatan:id,name,code', 'desa:id,name,code', 'dusun:id,name,code'])
            ->withCount(['customers'])
            ->orderBy('nama')
            ->get();
        return view('odp.index', compact('odps'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'nullable|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'kecamatan_id' => 'nullable|integer|exists:master_wilayah_kecamatans,id',
            'desa_id' => 'required|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'required|integer|exists:master_wilayah_dusuns,id',
            'alamat_detail' => 'required|string|max:1000',
        ]);
        $this->assertOdpWilayahConsistency($validated, true);
        $validated['rasio_distribusi'] = $validated['rasio_distribusi'] ?? '1:8';
        if ($request->hasFile('foto')) {
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }
        $this->createOdpWithGeneratedName($validated);
        return redirect()->route('odp.index')->with('success', 'ODP berhasil ditambahkan.');
    }

    public function edit(Odp $odp)
    {
        return view('odp.edit', compact('odp'));
    }

    public function update(Request $request, Odp $odp)
    {
        $oldName = $odp->nama;
        $oldKecamatanId = (int) $odp->kecamatan_id;
        $oldDesaId = (int) $odp->desa_id;
        $oldDusunId = (int) $odp->dusun_id;

        $validated = $request->validate([
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'required|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'kecamatan_id' => 'nullable|integer|exists:master_wilayah_kecamatans,id',
            'desa_id' => 'nullable|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'nullable|integer|exists:master_wilayah_dusuns,id',
            'alamat_detail' => 'nullable|string|max:1000',
        ]);
        $this->assertOdpWilayahConsistency($validated, false, $odp);
        if ($request->hasFile('foto')) {
            if ($odp->foto) Storage::disk('public')->delete($odp->foto);
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }

        $newKecamatanId = array_key_exists('kecamatan_id', $validated) ? (int) $validated['kecamatan_id'] : $oldKecamatanId;
        $newDesaId = array_key_exists('desa_id', $validated) ? (int) $validated['desa_id'] : $oldDesaId;
        $newDusunId = array_key_exists('dusun_id', $validated) ? (int) $validated['dusun_id'] : $oldDusunId;

        $scopeChanged = $oldKecamatanId !== $newKecamatanId
            || $oldDesaId !== $newDesaId
            || $oldDusunId !== $newDusunId;

        if ($scopeChanged) {
            $validated['nama'] = $this->generateUniqueNameWithRetry($newKecamatanId, $newDesaId, $newDusunId, $odp->id);
        }

        $odp->update($validated);

        if ($oldName !== $odp->nama) {
            \App\Models\Customer::where('odp', $oldName)->update(['odp' => $odp->nama]);
        }
        return redirect()->route('odp.index')->with('success', 'ODP berhasil diupdate.');
    }

    public function show(Odp $odp)
    {
        $odp->load('customers');
        return view('odp.show', compact('odp'));
    }

    // API Methods for React
    public function apiIndex()
    {
        $odps = Odp::with(['kecamatan:id,name,code', 'desa:id,name,code', 'dusun:id,name,code'])
            ->withCount(['customers'])
            ->orderBy('nama')
            ->get();
        return response()->json(['data' => $odps]);
    }

    public function apiStore(Request $request)
    {
        $validated = $request->validate([
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'nullable|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'kecamatan_id' => 'nullable|integer|exists:master_wilayah_kecamatans,id',
            'desa_id' => 'required|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'required|integer|exists:master_wilayah_dusuns,id',
            'alamat_detail' => 'required|string|max:1000',
        ]);
        $this->assertOdpWilayahConsistency($validated, true);
        $validated['rasio_distribusi'] = $validated['rasio_distribusi'] ?? '1:8';
        
        if ($request->hasFile('foto')) {
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }

        $odp = $this->createOdpWithGeneratedName($validated);
        return response()->json([
            'data' => $odp,
            'generated_name' => true,
            'message' => 'ODP berhasil ditambahkan',
        ], 201);
    }

    public function apiShow(Odp $odp)
    {
        $odp->load(['customers' => function ($query) {
            $query->orderBy('name');
        }, 'kecamatan:id,name,code', 'desa:id,name,code', 'dusun:id,name,code']);
        $odp->loadCount('customers');
        return response()->json(['data' => $odp]);
    }

    public function apiUpdate(Request $request, Odp $odp)
    {
        $oldName = $odp->nama;
        $oldKecamatanId = (int) $odp->kecamatan_id;
        $oldDesaId = (int) $odp->desa_id;
        $oldDusunId = (int) $odp->dusun_id;

        $validated = $request->validate([
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'required|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'kecamatan_id' => 'nullable|integer|exists:master_wilayah_kecamatans,id',
            'desa_id' => 'nullable|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'nullable|integer|exists:master_wilayah_dusuns,id',
            'alamat_detail' => 'nullable|string|max:1000',
        ]);
        $this->assertOdpWilayahConsistency($validated, false, $odp);
        
        if ($request->hasFile('foto')) {
            if ($odp->foto) Storage::disk('public')->delete($odp->foto);
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }

        $newKecamatanId = array_key_exists('kecamatan_id', $validated) ? (int) $validated['kecamatan_id'] : $oldKecamatanId;
        $newDesaId = array_key_exists('desa_id', $validated) ? (int) $validated['desa_id'] : $oldDesaId;
        $newDusunId = array_key_exists('dusun_id', $validated) ? (int) $validated['dusun_id'] : $oldDusunId;

        $scopeChanged = $oldKecamatanId !== $newKecamatanId
            || $oldDesaId !== $newDesaId
            || $oldDusunId !== $newDusunId;

        if ($scopeChanged) {
            $validated['nama'] = $this->generateUniqueNameWithRetry($newKecamatanId, $newDesaId, $newDusunId, $odp->id);
        }

        $odp->update($validated);

        if ($oldName !== $odp->nama) {
            \App\Models\Customer::where('odp', $oldName)->update(['odp' => $odp->nama]);
        }

        return response()->json([
            'data' => $odp,
            'generated_name' => true,
            'message' => 'ODP berhasil diupdate',
        ]);
    }

    private function createOdpWithGeneratedName(array $validated): Odp
    {
        $attempts = 0;

        do {
            $attempts++;
            $validated['nama'] = $this->generateUniqueNameWithRetry(
                (int) $validated['kecamatan_id'],
                (int) $validated['desa_id'],
                (int) $validated['dusun_id']
            );

            try {
                return Odp::create($validated);
            } catch (QueryException $queryException) {
                if (!$this->isDuplicateNameError($queryException) || $attempts >= 5) {
                    throw $queryException;
                }
            }
        } while ($attempts < 5);

        throw ValidationException::withMessages([
            'nama' => 'Gagal menghasilkan nama ODP unik. Silakan coba lagi.',
        ]);
    }

    private function generateUniqueNameWithRetry(int $kecamatanId, int $desaId, int $dusunId, ?int $excludeOdpId = null): string
    {
        return $this->odpNameGeneratorService->generate($kecamatanId, $desaId, $dusunId, $excludeOdpId);
    }

    private function isDuplicateNameError(QueryException $queryException): bool
    {
        $sqlState = (string) $queryException->getCode();
        $errorInfo = $queryException->errorInfo ?? [];
        $driverCode = (string) ($errorInfo[1] ?? '');
        $message = strtolower($queryException->getMessage());

        return $sqlState === '23000'
            && ($driverCode === '1062' || str_contains($message, 'duplicate') || str_contains($message, 'unique'));
    }

    private function assertOdpWilayahConsistency(array &$validated, bool $isCreate, ?Odp $existing = null): void
    {
        if (!isset($validated['kecamatan_id']) || empty($validated['kecamatan_id'])) {
            $validated['kecamatan_id'] = null;
        }

        $finalDesaId = array_key_exists('desa_id', $validated) ? $validated['desa_id'] : ($existing?->desa_id);
        $finalDusunId = array_key_exists('dusun_id', $validated) ? $validated['dusun_id'] : ($existing?->dusun_id);
        $finalAddress = array_key_exists('alamat_detail', $validated) ? trim((string) $validated['alamat_detail']) : trim((string) ($existing?->alamat_detail ?? ''));
        $finalLat = array_key_exists('latitude', $validated) ? $validated['latitude'] : ($existing?->latitude);
        $finalLng = array_key_exists('longitude', $validated) ? $validated['longitude'] : ($existing?->longitude);
        $hasExistingWilayah = $existing && !empty($existing->desa_id) && !empty($existing->dusun_id);
        $isCompleting = array_key_exists('desa_id', $validated)
            || array_key_exists('dusun_id', $validated)
            || array_key_exists('alamat_detail', $validated)
            || array_key_exists('latitude', $validated)
            || array_key_exists('longitude', $validated);

        if ($isCreate || $hasExistingWilayah || $isCompleting) {
            if (empty($finalDesaId) || empty($finalDusunId) || $finalAddress === '' || $finalLat === null || $finalLng === null) {
                throw ValidationException::withMessages([
                    'desa_id' => 'ODP wajib memiliki desa, dusun, alamat detail, dan titik peta.',
                ]);
            }
        }

        if (empty($finalDesaId) || empty($finalDusunId)) {
            return;
        }

        $desa = MasterWilayahDesa::query()->find((int) $finalDesaId);
        $dusun = MasterWilayahDusun::query()->find((int) $finalDusunId);

        if (!$desa || !$dusun || (int) $dusun->desa_id !== (int) $desa->id) {
            throw ValidationException::withMessages([
                'dusun_id' => 'Dusun harus berada di desa yang dipilih.',
            ]);
        }

        if (!empty($validated['kecamatan_id']) && (int) $desa->kecamatan_id !== (int) $validated['kecamatan_id']) {
            throw ValidationException::withMessages([
                'kecamatan_id' => 'Kecamatan tidak sesuai dengan desa yang dipilih.',
            ]);
        }

        $validated['kecamatan_id'] = (int) $desa->kecamatan_id;
        if (array_key_exists('alamat_detail', $validated)) {
            $validated['alamat_detail'] = $finalAddress;
        }
    }

    public function apiCustomers(Odp $odp)
    {
        $customers = \App\Models\Customer::where(function ($query) use ($odp) {
                $query->where('odp_id', $odp->id)
                    ->orWhere('odp', $odp->nama);
            })
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $customers]);
    }

    public function apiAttachCustomer(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
        ]);

        $customer = \App\Models\Customer::findOrFail($validated['customer_id']);
        $oldOdp = $customer->odp;
        $oldOdpId = $customer->odp_id;
        $customer->odp_id = $odp->id;
        $customer->odp = $odp->nama;
        $customer->save();

        $this->auditLogService->log('odp.customer_assigned', $customer, [
            'old_odp' => $oldOdp,
            'old_odp_id' => $oldOdpId,
            'new_odp' => $odp->nama,
            'new_odp_id' => $odp->id,
        ], auth()->id());

        return response()->json([
            'message' => 'Pelanggan berhasil ditambahkan ke ODP',
            'data' => $customer,
        ]);
    }

    public function apiDetachCustomer(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
        ]);

        $customer = \App\Models\Customer::findOrFail($validated['customer_id']);
        if ((int) $customer->odp_id === (int) $odp->id || $customer->odp === $odp->nama) {
            $oldOdp = $customer->odp;
            $oldOdpId = $customer->odp_id;
            $customer->odp_id = null;
            $customer->odp = null;
            $customer->save();

            $this->auditLogService->log('odp.customer_unassigned', $customer, [
                'old_odp' => $oldOdp,
                'old_odp_id' => $oldOdpId,
                'new_odp' => null,
                'new_odp_id' => null,
            ], auth()->id());
        }

        return response()->json([
            'message' => 'Pelanggan berhasil dihapus dari ODP',
            'data' => $customer,
        ]);
    }

    public function apiDestroy(Odp $odp)
    {
        if ($odp->foto) {
            Storage::disk('public')->delete($odp->foto);
        }

        \App\Models\Customer::where('odp_id', $odp->id)->update(['odp_id' => null, 'odp' => null]);
        \App\Models\Customer::where('odp', $odp->nama)->whereNull('odp_id')->update(['odp' => null]);

        $odp->delete();
        return response()->json(['message' => 'ODP berhasil dihapus']);
    }

    /**
     * Get visual port breakdown for ODP box (1..N) with customer mapping & optical RX
     */
    public function apiPortsSummary(Odp $odp)
    {
        try {
            $odp->load([
                'kecamatan:id,name,code',
                'desa:id,name,code',
                'dusun:id,name,code',
                'olt:id,name',
                'ponPort:id,name,pon_index',
            ]);
        } catch (\Throwable $e) {
            try {
                $odp->load(['kecamatan', 'desa', 'dusun']);
            } catch (\Throwable $e2) {
                // Ignore fallback load error
            }
        }
        
        $capacity = $odp->port_capacity;
        $customers = \App\Models\Customer::query()
            ->where(function ($q) use ($odp) {
                $q->where('odp_id', $odp->id)
                  ->orWhere('odp', $odp->nama);
            })
            ->with(['package:id,name,price'])
            ->get();

        // Customer indexed by port number
        $customerByPort = [];
        $unallocatedCustomers = [];

        foreach ($customers as $c) {
            $portNum = (int) ($c->odp_port_number ?? 0);
            if ($portNum >= 1 && $portNum <= $capacity) {
                $customerByPort[$portNum] = $c;
            } else {
                $unallocatedCustomers[] = $c;
            }
        }

        // Fill unallocated into first available ports if any
        $ports = [];
        for ($p = 1; $p <= $capacity; $p++) {
            $cust = $customerByPort[$p] ?? null;

            $portStatus = 'available';
            if ($cust) {
                $portStatus = !empty($cust->is_service_isolated) ? 'isolated' : 'occupied';
            }

            $ports[] = [
                'port_number' => $p,
                'status' => $portStatus,
                'customer' => $cust ? [
                    'id' => $cust->id,
                    'name' => $cust->name,
                    'phone' => $cust->phone,
                    'pppoe_username' => $cust->pppoe_username,
                    'address' => $cust->address,
                    'package_name' => $cust->package?->name ?? $cust->package_type ?? '-',
                    'dropcore_cable_length_meters' => $cust->dropcore_cable_length_meters,
                    'is_service_isolated' => (bool) $cust->is_service_isolated,
                    'home_router_type' => $cust->home_router_type,
                    'home_router_host' => $cust->home_router_host,
                    'olt_onu_id' => $cust->olt_onu_id,
                ] : null,
            ];
        }

        $occupiedCount = count(array_filter($ports, fn($port) => $port['status'] !== 'available'));
        $availableCount = $capacity - $occupiedCount;

        return response()->json([
            'data' => [
                'odp' => [
                    'id' => $odp->id,
                    'nama' => $odp->nama,
                    'device_type' => $odp->device_type ?? 'odp',
                    'total_ports' => $capacity,
                    'occupied_ports' => $occupiedCount,
                    'available_ports' => $availableCount,
                    'occupancy_percentage' => $capacity > 0 ? round(($occupiedCount / $capacity) * 100, 1) : 0,
                    'rasio_distribusi' => $odp->rasio_distribusi,
                    'rasio_spesial' => $odp->rasio_spesial,
                    'latitude' => $odp->latitude,
                    'longitude' => $odp->longitude,
                    'alamat_detail' => $odp->alamat_detail,
                    'wilayah' => [
                        'kecamatan' => $odp->kecamatan?->name,
                        'desa' => $odp->desa?->name,
                        'dusun' => $odp->dusun?->name,
                    ],
                    'olt' => $odp->olt?->name,
                    'pon_port' => $odp->ponPort?->name,
                    'qr_payload' => url("/odp-scanner?odp_id={$odp->id}"),
                    'qr_code_string' => "ODP:{$odp->id}:{$odp->nama}",
                ],
                'ports' => $ports,
                'unallocated_customers' => collect($unallocatedCustomers)->map(fn($c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'phone' => $c->phone,
                    'pppoe_username' => $c->pppoe_username,
                ]),
            ]
        ]);
    }

    /**
     * Fast Lookup ODP by QR Code content, ODP ID, or Name
     */
    public function apiLookupByCode(Request $request, ?string $code = null)
    {
        $rawCode = trim((string) ($code ?: $request->query('code', '')));
        $searchId = null;
        $searchName = $rawCode;

        // Parse format "ODP:12:NAMA_ODP" or URL containing odp_id=12
        if (preg_match('/ODP:(\d+)/i', $rawCode, $matches)) {
            $searchId = (int) $matches[1];
        } elseif (preg_match('/[?&]odp_id=(\d+)/i', $rawCode, $matches)) {
            $searchId = (int) $matches[1];
        } elseif (is_numeric($rawCode)) {
            $searchId = (int) $rawCode;
        }

        $odp = null;
        if ($searchId) {
            $odp = Odp::find($searchId);
        }

        if (!$odp) {
            $odp = Odp::where('nama', $searchName)
                ->orWhere('nama', 'like', "%{$searchName}%")
                ->first();
        }

        if (!$odp) {
            return response()->json([
                'message' => 'ODP tidak ditemukan untuk kode QR ini.',
            ], 404);
        }

        return $this->apiPortsSummary($odp);
    }

    /**
     * Assign / Plug dropcore cable from customer to a specific ODP port
     */
    public function apiAssignPort(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
            'port_number' => 'required|integer|min:1|max:' . $odp->port_capacity,
            'dropcore_cable_length_meters' => 'nullable|integer|min:1|max:2000',
        ]);

        $portNumber = (int) $validated['port_number'];
        $customerId = (int) $validated['customer_id'];

        // Check if port is already used by another customer on this ODP
        $existingCustomerOnPort = \App\Models\Customer::where('odp_id', $odp->id)
            ->where('odp_port_number', $portNumber)
            ->where('id', '!=', $customerId)
            ->first();

        if ($existingCustomerOnPort) {
            // Free up the old customer port
            $existingCustomerOnPort->odp_port_number = null;
            $existingCustomerOnPort->save();
        }

        $customer = \App\Models\Customer::findOrFail($customerId);
        $oldOdpId = $customer->odp_id;
        $oldPort = $customer->odp_port_number;

        $customer->odp_id = $odp->id;
        $customer->odp = $odp->nama;
        $customer->odp_port_number = $portNumber;
        if (isset($validated['dropcore_cable_length_meters'])) {
            $customer->dropcore_cable_length_meters = $validated['dropcore_cable_length_meters'];
        }
        $customer->save();

        $this->auditLogService->log('odp.port_assigned', $customer, [
            'odp_id' => $odp->id,
            'odp_nama' => $odp->nama,
            'port_number' => $portNumber,
            'old_odp_id' => $oldOdpId,
            'old_port' => $oldPort,
            'dropcore_meters' => $customer->dropcore_cable_length_meters,
        ], auth()->id());

        return response()->json([
            'message' => "Pelanggan {$customer->name} berhasil ditautkan ke Port #{$portNumber} ODP {$odp->nama}.",
            'data' => $customer,
        ]);
    }

    /**
     * Unassign / Unplug cable from an ODP port
     */
    public function apiUnassignPort(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'port_number' => 'required|integer|min:1|max:' . $odp->port_capacity,
        ]);

        $portNumber = (int) $validated['port_number'];

        $customer = \App\Models\Customer::where('odp_id', $odp->id)
            ->where('odp_port_number', $portNumber)
            ->first();

        if ($customer) {
            $customer->odp_id = null;
            $customer->odp = null;
            $customer->odp_port_number = null;
            $customer->save();

            $this->auditLogService->log('odp.port_unassigned', $customer, [
                'odp_id' => $odp->id,
                'odp_nama' => $odp->nama,
                'port_number' => $portNumber,
            ], auth()->id());
        }

        return response()->json([
            'message' => "Port #{$portNumber} ODP {$odp->nama} berhasil dikosongkan.",
        ]);
    }

    /**
     * Swap customer cable between two ports
     */
    public function apiSwapPort(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'from_port' => 'required|integer|min:1|max:' . $odp->port_capacity,
            'to_port' => 'required|integer|min:1|max:' . $odp->port_capacity,
        ]);

        $fromPort = (int) $validated['from_port'];
        $toPort = (int) $validated['to_port'];

        if ($fromPort === $toPort) {
            return response()->json(['message' => 'Port asal dan tujuan sama.'], 422);
        }

        $custFrom = \App\Models\Customer::where('odp_id', $odp->id)->where('odp_port_number', $fromPort)->first();
        $custTo = \App\Models\Customer::where('odp_id', $odp->id)->where('odp_port_number', $toPort)->first();

        if ($custFrom) {
            $custFrom->odp_port_number = $toPort;
            $custFrom->save();
        }

        if ($custTo) {
            $custTo->odp_port_number = $fromPort;
            $custTo->save();
        }

        $this->auditLogService->log('odp.port_swapped', $odp, [
            'odp_id' => $odp->id,
            'from_port' => $fromPort,
            'to_port' => $toPort,
            'customer_from_id' => $custFrom?->id,
            'customer_to_id' => $custTo?->id,
        ], auth()->id());

        return response()->json([
            'message' => "Kabel Port #{$fromPort} dan Port #{$toPort} berhasil dipindahkan/ditukar.",
        ]);
    }
}

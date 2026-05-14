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
}

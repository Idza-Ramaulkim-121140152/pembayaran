<?php

namespace App\Http\Controllers;

use App\Models\CustomerProspect;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CustomerProspectController extends Controller
{
    /**
     * Public endpoint for customer or field technician registration
     */
    public function publicStore(Request $request)
    {
        $validated = $request->validate([
            'nama' => 'required|string|max:255',
            'no_telp' => 'required|string|max:32',
            'nik' => 'nullable|string|max:32',
            'jenis_kelamin' => 'required|string|in:Laki-laki,Perempuan,male,female',
            'kecamatan_id' => 'nullable|integer|exists:master_wilayah_kecamatans,id',
            'desa_id' => 'nullable|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'nullable|integer|exists:master_wilayah_dusuns,id',
            'alamat' => 'nullable|string|max:1000',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'paket' => 'nullable|string|max:100',
            'paket_custom' => 'nullable|string|max:100',
            'catatan' => 'nullable|string|max:1000',
            'foto_depan_rumah' => 'nullable|file|image|max:10240',
            'foto_ktp' => 'nullable|file|image|max:10240',
            'source' => 'nullable|string|in:public,technician,marketing,admin',
        ]);

        $prefix = 'REG-' . date('Ym') . '-';
        $latest = CustomerProspect::where('registration_no', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->first();

        $nextSeq = 1;
        if ($latest) {
            $lastNum = (int) substr($latest->registration_no, strlen($prefix));
            $nextSeq = $lastNum + 1;
        }
        $registrationNo = $prefix . str_pad((string) $nextSeq, 4, '0', STR_PAD_LEFT);

        $slug = Str::slug($validated['nama'] . '-' . time());
        $fotoDepanRumahUrl = null;
        $fotoKtpUrl = null;

        if ($request->hasFile('foto_depan_rumah') && $request->file('foto_depan_rumah')->isValid()) {
            $path = $request->file('foto_depan_rumah')->store('customer-prospects/' . $slug, 'public');
            $fotoDepanRumahUrl = url(Storage::url($path));
        }

        if ($request->hasFile('foto_ktp') && $request->file('foto_ktp')->isValid()) {
            $path = $request->file('foto_ktp')->store('customer-prospects/' . $slug, 'public');
            $fotoKtpUrl = url(Storage::url($path));
        }

        $gender = in_array($validated['jenis_kelamin'], ['Perempuan', 'female']) ? 'Perempuan' : 'Laki-laki';

        $prospect = CustomerProspect::create([
            'registration_no' => $registrationNo,
            'nama' => $validated['nama'],
            'no_telp' => $validated['no_telp'],
            'nik' => $validated['nik'] ?? null,
            'jenis_kelamin' => $gender,
            'kecamatan_id' => $validated['kecamatan_id'] ?? null,
            'desa_id' => $validated['desa_id'] ?? null,
            'dusun_id' => $validated['dusun_id'] ?? null,
            'alamat' => $validated['alamat'] ?? null,
            'latitude' => $validated['latitude'] ?? null,
            'longitude' => $validated['longitude'] ?? null,
            'paket' => $validated['paket'] ?? null,
            'paket_custom' => $validated['paket_custom'] ?? null,
            'foto_depan_rumah' => $fotoDepanRumahUrl,
            'foto_ktp' => $fotoKtpUrl,
            'catatan' => $validated['catatan'] ?? null,
            'source' => $validated['source'] ?? (auth()->check() ? 'technician' : 'public'),
            'registered_by' => auth()->id() ?? null,
            'status' => 'pending',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Pendaftaran calon pelanggan berhasil dikirim. Tim kami akan segera memverifikasi.',
            'registration_no' => $registrationNo,
            'data' => $prospect->load(['kecamatan:id,name', 'desa:id,name', 'dusun:id,name']),
        ]);
    }

    /**
     * Internal endpoint: List and filter customer prospects
     */
    public function index(Request $request)
    {
        $status = $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));

        $query = CustomerProspect::with([
            'kecamatan:id,name',
            'desa:id,name',
            'dusun:id,name',
            'verifiedBy:id,name',
            'registeredBy:id,name',
        ])->latest('id');

        if ($status !== 'all' && in_array($status, ['pending', 'approved', 'rejected', 'installed'])) {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('nama', 'like', "%{$search}%")
                    ->orWhere('no_telp', 'like', "%{$search}%")
                    ->orWhere('registration_no', 'like', "%{$search}%")
                    ->orWhere('alamat', 'like', "%{$search}%")
                    ->orWhere('nik', 'like', "%{$search}%");
            });
        }

        $items = $query->paginate((int) $request->query('per_page', 25));

        $counts = [
            'total' => CustomerProspect::count(),
            'pending' => CustomerProspect::where('status', 'pending')->count(),
            'approved' => CustomerProspect::where('status', 'approved')->count(),
            'rejected' => CustomerProspect::where('status', 'rejected')->count(),
            'installed' => CustomerProspect::where('status', 'installed')->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $items->items(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page' => $items->lastPage(),
                'per_page' => $items->perPage(),
                'total' => $items->total(),
            ],
            'counts' => $counts,
        ]);
    }

    /**
     * Internal endpoint: Update verification status (approve / reject / installed)
     */
    public function updateStatus(Request $request, $id)
    {
        $prospect = CustomerProspect::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|string|in:pending,approved,rejected,installed',
            'rejection_reason' => 'nullable|string|max:255',
        ]);

        $status = $validated['status'];
        $updateData = ['status' => $status];

        if ($status === 'approved') {
            $updateData['verified_at'] = now();
            $updateData['verified_by'] = auth()->id();
            $updateData['rejection_reason'] = null;
        } elseif ($status === 'rejected') {
            $updateData['rejection_reason'] = $validated['rejection_reason'] ?? 'Dibatalkan oleh admin/teknisi';
            $updateData['verified_at'] = now();
            $updateData['verified_by'] = auth()->id();
        } elseif ($status === 'installed') {
            $updateData['installed_at'] = now();
        }

        $prospect->update($updateData);

        return response()->json([
            'success' => true,
            'message' => 'Status pendaftaran berhasil diperbarui menjadi ' . ucfirst($status),
            'data' => $prospect->load(['kecamatan:id,name', 'desa:id,name', 'dusun:id,name', 'verifiedBy:id,name']),
        ]);
    }

    /**
     * Internal endpoint: Get approved recommendations for CustomerRegistrationForm
     */
    public function recommendations()
    {
        $recommendations = CustomerProspect::with([
            'kecamatan:id,name',
            'desa:id,name',
            'dusun:id,name',
        ])
            ->where('status', 'approved')
            ->latest('verified_at')
            ->limit(20)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $recommendations,
            'count' => $recommendations->count(),
        ]);
    }

    /**
     * Delete a prospect to clean up clutter
     */
    public function destroy($id)
    {
        $prospect = CustomerProspect::findOrFail($id);
        $prospect->delete();

        return response()->json([
            'success' => true,
            'message' => 'Data calon pelanggan berhasil dihapus.',
        ]);
    }
}

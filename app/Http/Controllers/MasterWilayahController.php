<?php

namespace App\Http\Controllers;

use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MasterWilayahController extends Controller
{
    public function kecamatanOptions()
    {
        $items = MasterWilayahKecamatan::query()
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        return response()->json(['data' => $items]);
    }

    public function desaOptions(Request $request)
    {
        $validated = $request->validate([
            'kecamatan_id' => ['required', 'integer', 'exists:master_wilayah_kecamatans,id'],
        ]);

        $items = MasterWilayahDesa::query()
            ->where('kecamatan_id', (int) $validated['kecamatan_id'])
            ->orderBy('name')
            ->get(['id', 'kecamatan_id', 'name', 'code']);

        return response()->json(['data' => $items]);
    }

    public function dusunOptions(Request $request)
    {
        $validated = $request->validate([
            'desa_id' => ['required', 'integer', 'exists:master_wilayah_desas,id'],
        ]);

        $items = MasterWilayahDusun::query()
            ->where('desa_id', (int) $validated['desa_id'])
            ->orderBy('name')
            ->get(['id', 'desa_id', 'name', 'code']);

        return response()->json(['data' => $items]);
    }

    public function index()
    {
        $kecamatans = MasterWilayahKecamatan::query()
            ->with([
                'desas' => function ($query) {
                    $query->orderBy('name')->with([
                        'dusuns' => fn ($dusunQuery) => $dusunQuery->orderBy('name'),
                    ]);
                },
            ])
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $kecamatans]);
    }

    public function storeKecamatan(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'size:3', 'alpha_num', 'unique:master_wilayah_kecamatans,code'],
        ]);

        $kecamatan = MasterWilayahKecamatan::create([
            'name' => trim($validated['name']),
            'code' => strtoupper($validated['code'] ?? $this->generateDefaultCode($validated['name'])),
        ]);

        return response()->json([
            'message' => 'Kecamatan berhasil ditambahkan.',
            'data' => $kecamatan,
        ], 201);
    }

    public function updateKecamatan(Request $request, MasterWilayahKecamatan $kecamatan)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => [
                'required',
                'string',
                'size:3',
                'alpha_num',
                Rule::unique('master_wilayah_kecamatans', 'code')->ignore($kecamatan->id),
            ],
        ]);

        $kecamatan->update([
            'name' => trim($validated['name']),
            'code' => strtoupper($validated['code']),
        ]);

        return response()->json([
            'message' => 'Kecamatan berhasil diperbarui.',
            'data' => $kecamatan,
        ]);
    }

    public function destroyKecamatan(MasterWilayahKecamatan $kecamatan)
    {
        $kecamatan->delete();

        return response()->json(['message' => 'Kecamatan berhasil dihapus.']);
    }

    public function storeDesa(Request $request)
    {
        $validated = $request->validate([
            'kecamatan_id' => ['required', 'integer', 'exists:master_wilayah_kecamatans,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'size:3', 'alpha_num'],
        ]);

        $existingCodeRule = Rule::unique('master_wilayah_desas', 'code')
            ->where(fn ($query) => $query->where('kecamatan_id', (int) $validated['kecamatan_id']));
        if (!empty($validated['code'])) {
            $request->validate(['code' => [$existingCodeRule]]);
        }

        $desa = MasterWilayahDesa::create([
            'kecamatan_id' => (int) $validated['kecamatan_id'],
            'name' => trim($validated['name']),
            'code' => strtoupper($validated['code'] ?? $this->generateDefaultCode($validated['name'])),
        ]);

        return response()->json([
            'message' => 'Desa berhasil ditambahkan.',
            'data' => $desa,
        ], 201);
    }

    public function updateDesa(Request $request, MasterWilayahDesa $desa)
    {
        $validated = $request->validate([
            'kecamatan_id' => ['required', 'integer', 'exists:master_wilayah_kecamatans,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'size:3', 'alpha_num'],
        ]);

        $request->validate([
            'code' => [
                Rule::unique('master_wilayah_desas', 'code')
                    ->where(fn ($query) => $query->where('kecamatan_id', (int) $validated['kecamatan_id']))
                    ->ignore($desa->id),
            ],
        ]);

        $desa->update([
            'kecamatan_id' => (int) $validated['kecamatan_id'],
            'name' => trim($validated['name']),
            'code' => strtoupper($validated['code']),
        ]);

        return response()->json([
            'message' => 'Desa berhasil diperbarui.',
            'data' => $desa,
        ]);
    }

    public function destroyDesa(MasterWilayahDesa $desa)
    {
        $desa->delete();

        return response()->json(['message' => 'Desa berhasil dihapus.']);
    }

    public function storeDusun(Request $request)
    {
        $validated = $request->validate([
            'desa_id' => ['required', 'integer', 'exists:master_wilayah_desas,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'size:3', 'alpha_num'],
        ]);

        $existingCodeRule = Rule::unique('master_wilayah_dusuns', 'code')
            ->where(fn ($query) => $query->where('desa_id', (int) $validated['desa_id']));
        if (!empty($validated['code'])) {
            $request->validate(['code' => [$existingCodeRule]]);
        }

        $dusun = MasterWilayahDusun::create([
            'desa_id' => (int) $validated['desa_id'],
            'name' => trim($validated['name']),
            'code' => strtoupper($validated['code'] ?? $this->generateDefaultCode($validated['name'])),
        ]);

        return response()->json([
            'message' => 'Dusun berhasil ditambahkan.',
            'data' => $dusun,
        ], 201);
    }

    public function updateDusun(Request $request, MasterWilayahDusun $dusun)
    {
        $validated = $request->validate([
            'desa_id' => ['required', 'integer', 'exists:master_wilayah_desas,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'size:3', 'alpha_num'],
        ]);

        $request->validate([
            'code' => [
                Rule::unique('master_wilayah_dusuns', 'code')
                    ->where(fn ($query) => $query->where('desa_id', (int) $validated['desa_id']))
                    ->ignore($dusun->id),
            ],
        ]);

        $dusun->update([
            'desa_id' => (int) $validated['desa_id'],
            'name' => trim($validated['name']),
            'code' => strtoupper($validated['code']),
        ]);

        return response()->json([
            'message' => 'Dusun berhasil diperbarui.',
            'data' => $dusun,
        ]);
    }

    public function destroyDusun(MasterWilayahDusun $dusun)
    {
        $dusun->delete();

        return response()->json(['message' => 'Dusun berhasil dihapus.']);
    }

    private function generateDefaultCode(string $name): string
    {
        $normalized = strtoupper(preg_replace('/[^A-Z0-9]/', '', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name));
        $normalized = $normalized ?: 'XXX';

        return str_pad(substr($normalized, 0, 3), 3, 'X');
    }
}

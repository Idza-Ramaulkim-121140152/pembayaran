<?php

namespace App\Http\Controllers;

use App\Models\MasterMikrotik;
use App\Services\MikroTikService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MasterMikrotikController extends Controller
{
    public function index()
    {
        $data = MasterMikrotik::query()
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get()
            ->map(function (MasterMikrotik $item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'host' => $item->host,
                    'port' => $item->port,
                    'username' => $item->username,
                    'is_active' => (bool) $item->is_active,
                    'alert_recipients' => $item->alert_recipients,
                    'last_status' => $item->last_status,
                    'last_checked_at' => $item->last_checked_at,
                    'last_alerted_at' => $item->last_alerted_at,
                    'has_password' => !empty($item->password_encrypted),
                    'password_masked' => !empty($item->password_encrypted) ? '********' : null,
                    'created_at' => $item->created_at,
                    'updated_at' => $item->updated_at,
                ];
            })
            ->values();

        return response()->json([
            'data' => $data,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'host' => 'required|string|max:255',
            'port' => 'required|integer|min:1|max:65535',
            'username' => 'required|string|max:100',
            'password' => 'required|string|max:255',
            'alert_recipients' => 'nullable|string|max:2000',
            'is_active' => 'nullable|boolean',
        ]);

        DB::beginTransaction();

        try {
            if (!empty($validated['is_active'])) {
                MasterMikrotik::query()->update(['is_active' => false]);
            }

            $item = MasterMikrotik::create([
                'name' => trim($validated['name']),
                'host' => trim($validated['host']),
                'port' => (int) $validated['port'],
                'username' => trim($validated['username']),
                'password_encrypted' => $validated['password'],
                'alert_recipients' => $this->normalizeRecipients($validated['alert_recipients'] ?? null),
                'is_active' => (bool) ($validated['is_active'] ?? false),
                'created_by' => auth()->id(),
                'updated_by' => auth()->id(),
            ]);

            DB::commit();

            return response()->json([
                'message' => 'Master MikroTik berhasil ditambahkan.',
                'data' => [
                    'id' => $item->id,
                ],
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Gagal menambah master MikroTik: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function update(Request $request, MasterMikrotik $masterMikrotik)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'host' => 'required|string|max:255',
            'port' => 'required|integer|min:1|max:65535',
            'username' => 'required|string|max:100',
            'password' => 'nullable|string|max:255',
            'alert_recipients' => 'nullable|string|max:2000',
            'is_active' => 'nullable|boolean',
        ]);

        DB::beginTransaction();

        try {
            if (!empty($validated['is_active'])) {
                MasterMikrotik::query()
                    ->where('id', '!=', $masterMikrotik->id)
                    ->update(['is_active' => false]);
            }

            $updatePayload = [
                'name' => trim($validated['name']),
                'host' => trim($validated['host']),
                'port' => (int) $validated['port'],
                'username' => trim($validated['username']),
                'alert_recipients' => $this->normalizeRecipients($validated['alert_recipients'] ?? null),
                'is_active' => (bool) ($validated['is_active'] ?? $masterMikrotik->is_active),
                'updated_by' => auth()->id(),
            ];

            if (!empty($validated['password'])) {
                $updatePayload['password_encrypted'] = $validated['password'];
            }

            $masterMikrotik->update($updatePayload);

            DB::commit();

            return response()->json([
                'message' => 'Master MikroTik berhasil diperbarui.',
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Gagal memperbarui master MikroTik: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(MasterMikrotik $masterMikrotik)
    {
        if ($masterMikrotik->is_active && MasterMikrotik::query()->count() > 1) {
            return response()->json([
                'message' => 'Router aktif tidak bisa dihapus sebelum memilih router aktif lain.',
            ], 422);
        }

        $masterMikrotik->delete();

        return response()->json([
            'message' => 'Master MikroTik berhasil dihapus.',
        ]);
    }

    public function activate(MasterMikrotik $masterMikrotik)
    {
        DB::transaction(function () use ($masterMikrotik) {
            MasterMikrotik::query()->update(['is_active' => false]);
            $masterMikrotik->update([
                'is_active' => true,
                'updated_by' => auth()->id(),
            ]);
        });

        return response()->json([
            'message' => 'Router aktif berhasil diperbarui.',
        ]);
    }

    public function testConnection(MasterMikrotik $masterMikrotik)
    {
        try {
            $mikrotik = new MikroTikService(
                $masterMikrotik->host,
                $masterMikrotik->username,
                $masterMikrotik->password_encrypted,
                $masterMikrotik->port,
                5
            );

            $identity = $mikrotik->getIdentity();
            $resources = $mikrotik->getSystemResources();

            return response()->json([
                'success' => true,
                'message' => 'Koneksi berhasil.',
                'data' => [
                    'identity' => $identity,
                    'version' => $resources['version'] ?? null,
                    'platform' => $resources['platform'] ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Koneksi gagal: ' . $e->getMessage(),
            ], 422);
        }
    }

    private function normalizeRecipients(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $parts = preg_split('/[\s,;]+/', trim($value)) ?: [];
        $clean = collect($parts)
            ->map(fn ($item) => trim((string) $item))
            ->filter(fn ($item) => $item !== '')
            ->unique()
            ->values()
            ->all();

        return count($clean) > 0 ? implode(',', $clean) : null;
    }
}

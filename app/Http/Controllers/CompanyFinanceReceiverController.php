<?php

namespace App\Http\Controllers;

use App\Models\CompanyFinanceReceiver;
use App\Models\User;
use App\Services\CompanyFinanceReceiverService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class CompanyFinanceReceiverController extends Controller
{
    public function __construct(private CompanyFinanceReceiverService $companyFinanceReceiverService)
    {
    }

    private function ensureReady(): void
    {
        abort_unless(Schema::hasTable('company_finance_receivers'), 503, 'Master akun keuangan perusahaan belum siap. Jalankan migrasi terlebih dahulu.');
    }

    public function index()
    {
        $this->ensureReady();

        $rows = CompanyFinanceReceiver::query()
            ->with('user:id,name,email,role')
            ->orderByDesc('is_active')
            ->orderBy('user_id')
            ->get()
            ->map(function (CompanyFinanceReceiver $mapping) {
                $user = $mapping->user;

                return [
                    'id' => $mapping->id,
                    'user_id' => $mapping->user_id,
                    'is_active' => (bool) $mapping->is_active,
                    'user' => $user ? [
                        'id' => $user->id,
                        'name' => $user->name,
                        'email' => $user->email,
                        'role' => $user->role,
                        'is_company_finance_receiver' => (bool) $mapping->is_active,
                    ] : null,
                ];
            })
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $existing = CompanyFinanceReceiver::query()
            ->where('user_id', $validated['user_id'])
            ->first();

        if ($existing?->is_active) {
            return response()->json([
                'message' => 'User ini sudah terdaftar sebagai akun keuangan perusahaan aktif.',
            ], 422);
        }

        if ($existing) {
            $existing->is_active = true;
            $existing->save();
            $mapping = $existing;
        } else {
            $mapping = CompanyFinanceReceiver::query()->create([
                'user_id' => $validated['user_id'],
                'is_active' => true,
            ]);
        }

        $mapping->load('user:id,name,email,role');

        return response()->json([
            'message' => 'Akun keuangan perusahaan berhasil ditambahkan.',
            'data' => [
                'id' => $mapping->id,
                'user_id' => $mapping->user_id,
                'is_active' => (bool) $mapping->is_active,
                'user' => $mapping->user ? [
                    'id' => $mapping->user->id,
                    'name' => $mapping->user->name,
                    'email' => $mapping->user->email,
                    'role' => $mapping->user->role,
                    'is_company_finance_receiver' => true,
                ] : null,
            ],
        ], $existing ? 200 : 201);
    }

    public function destroy(User $user)
    {
        $this->ensureReady();

        $mapping = CompanyFinanceReceiver::query()
            ->where('user_id', $user->id)
            ->where('is_active', true)
            ->first();

        if (!$mapping) {
            throw new RuntimeException('User ini belum terdaftar sebagai akun keuangan perusahaan aktif.');
        }

        $mapping->is_active = false;
        $mapping->save();

        return response()->json([
            'message' => 'Akun keuangan perusahaan berhasil dinonaktifkan.',
        ]);
    }
}

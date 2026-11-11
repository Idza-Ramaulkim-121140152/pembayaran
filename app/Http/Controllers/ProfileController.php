<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Models\PayrollMember;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Illuminate\Support\Facades\Schema;
use Illuminate\View\View;

class ProfileController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): View
    {
        return view('profile.edit', [
            'user' => $request->user(),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $before = $request->user()->only(['name', 'email']);
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        $this->auditLogService->log('profile.updated', $request->user(), [
            'before' => $before,
            'after' => $request->user()->only(['name', 'email']),
        ], $request->user()->id);

        return Redirect::route('profile.edit')->with('status', 'profile-updated');
    }

    /**
     * Update authenticated employee's bank account and phone details for payroll.
     */
    public function updateBank(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nama_bank' => 'nullable|string|max:100',
            'nomor_rekening' => 'nullable|string|max:100',
            'atas_nama_rekening' => 'nullable|string|max:150',
            'telepon' => 'nullable|string|max:30',
        ]);

        $user = $request->user();
        $member = $user->payrollMember;

        if (!$member) {
            if (!($user->is_employee || in_array($user->role, ['superadmin', 'admin', 'teknisi', 'finance'], true))) {
                return response()->json([
                    'message' => 'Akun Anda belum terhubung dengan data payroll pegawai.',
                ], 422);
            }

            $member = PayrollMember::create([
                'nama' => $user->name,
                'telepon' => !empty($validated['telepon']) ? trim($validated['telepon']) : $user->phone,
                'tipe_gaji' => 'bulanan',
                'gaji_pokok' => 0,
                'tunjangan' => 0,
                'tanggal_gajian' => 1,
                'is_active' => true,
            ]);
            $user->forceFill(['payroll_member_id' => $member->id])->save();
        }

        $before = $member->only(['nama_bank', 'nomor_rekening', 'atas_nama_rekening', 'telepon']);
        $updates = [
            'nama_bank' => isset($validated['nama_bank']) ? (trim((string) $validated['nama_bank']) ?: null) : $member->nama_bank,
            'nomor_rekening' => isset($validated['nomor_rekening']) ? (trim((string) $validated['nomor_rekening']) ?: null) : $member->nomor_rekening,
        ];

        if (Schema::hasColumn('payroll_members', 'atas_nama_rekening')) {
            $updates['atas_nama_rekening'] = isset($validated['atas_nama_rekening'])
                ? (trim((string) $validated['atas_nama_rekening']) ?: null)
                : $member->atas_nama_rekening;
        }

        if (array_key_exists('telepon', $validated)) {
            $phone = trim((string) ($validated['telepon'] ?? '')) ?: null;
            $updates['telepon'] = $phone;
            if ($phone && empty($user->phone)) {
                $user->forceFill(['phone' => $phone])->save();
            }
        }

        $member->update($updates);

        $this->auditLogService->log('profile.bank_updated', $member, [
            'before' => $before,
            'after' => $member->fresh()->only(['nama_bank', 'nomor_rekening', 'atas_nama_rekening', 'telepon']),
        ], $user->id);

        return response()->json([
            'message' => 'Informasi rekening bank pegawai berhasil disimpan.',
            'payroll_member' => $member->fresh(),
        ]);
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validateWithBag('userDeletion', [
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        $this->auditLogService->log('profile.deleted', $user, [
            'name' => $user->name,
            'email' => $user->email,
        ], $user->id);

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }
}

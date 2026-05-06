<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserManagementController extends Controller
{
    /**
     * List all users
     */
    public function index()
    {
        $select = ['id', 'name', 'email', 'role', 'created_at'];
        $hasEmployeeFields = Schema::hasColumn('users', 'is_employee') && Schema::hasColumn('users', 'payroll_member_id');
        if (Schema::hasColumn('users', 'can_confirm_payments')) {
            $select[] = 'can_confirm_payments';
        }
        if (Schema::hasColumn('users', 'can_edit_mutations')) {
            $select[] = 'can_edit_mutations';
        }
        if ($hasEmployeeFields) {
            $select[] = 'is_employee';
            $select[] = 'payroll_member_id';
        }

        $usersQuery = User::select($select)
            ->orderBy('role')
            ->orderBy('name');
        if ($hasEmployeeFields) {
            $usersQuery->with('payrollMember:id,nama');
        }

        $users = $usersQuery->get();

        if (!Schema::hasColumn('users', 'can_confirm_payments')) {
            $users = $users->map(function ($user) {
                $user->can_confirm_payments = false;
                return $user;
            });
        }

        if (!Schema::hasColumn('users', 'can_edit_mutations')) {
            $users = $users->map(function ($user) {
                $user->can_edit_mutations = false;
                return $user;
            });
        }

        if (!$hasEmployeeFields) {
            $users = $users->map(function ($user) {
                $user->is_employee = false;
                $user->payroll_member_id = null;
                $user->payroll_member_name = null;
                return $user;
            });
        } else {
            $users = $users->map(function ($user) {
                $user->payroll_member_name = $user->payrollMember?->nama;
                return $user;
            });
        }

        return response()->json(['data' => $users]);
    }

    /**
     * Create a new user
     */
    public function store(Request $request)
    {
        $hasEmployeeFields = Schema::hasColumn('users', 'is_employee') && Schema::hasColumn('users', 'payroll_member_id');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => ['required', Rule::in(User::ROLES)],
            'can_confirm_payments' => 'nullable|boolean',
            'can_edit_mutations' => 'nullable|boolean',
            'is_employee' => $hasEmployeeFields ? 'nullable|boolean' : 'nullable',
            'payroll_member_id' => $hasEmployeeFields ? 'nullable|integer|exists:payroll_members,id' : 'nullable',
        ]);

        // Only superadmin can create superadmin accounts
        if ($validated['role'] === User::ROLE_SUPERADMIN && !auth()->user()->isSuperAdmin()) {
            return response()->json(['error' => 'Hanya superadmin yang dapat membuat akun superadmin.'], 403);
        }

        $isEmployee = $hasEmployeeFields ? (bool) ($validated['is_employee'] ?? false) : false;
        $payrollMemberId = $hasEmployeeFields ? ($validated['payroll_member_id'] ?? null) : null;

        if ($hasEmployeeFields && $isEmployee && empty($payrollMemberId)) {
            return response()->json(['message' => 'Pilih teknisi payroll jika akun ditandai sebagai karyawan.'], 422);
        }

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'can_confirm_payments' => (bool) ($validated['can_confirm_payments'] ?? false),
            'can_edit_mutations' => (bool) ($validated['can_edit_mutations'] ?? false),
            'is_employee' => $isEmployee,
            'payroll_member_id' => $isEmployee ? $payrollMemberId : null,
        ]);

        $user->loadMissing('payrollMember:id,nama');
        return response()->json([
            'message' => 'Akun berhasil dibuat.',
            'data' => [
                ...$user->only('id', 'name', 'email', 'role', 'can_confirm_payments', 'can_edit_mutations', 'is_employee', 'payroll_member_id', 'created_at'),
                'payroll_member_name' => $user->payrollMember?->nama,
            ],
        ], 201);
    }

    /**
     * Update a user
     */
    public function update(Request $request, User $user)
    {
        // Cannot edit own role
        if ($user->id === auth()->id() && $request->has('role') && $request->role !== auth()->user()->role) {
            return response()->json(['error' => 'Tidak dapat mengubah role sendiri.'], 403);
        }

        // Only superadmin can change to/from superadmin role
        if (!auth()->user()->isSuperAdmin()) {
            if ($user->role === User::ROLE_SUPERADMIN) {
                return response()->json(['error' => 'Hanya superadmin yang dapat mengedit akun superadmin.'], 403);
            }
            if ($request->role === User::ROLE_SUPERADMIN) {
                return response()->json(['error' => 'Hanya superadmin yang dapat memberikan role superadmin.'], 403);
            }
        }

        $hasEmployeeFields = Schema::hasColumn('users', 'is_employee') && Schema::hasColumn('users', 'payroll_member_id');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
            'role' => ['required', Rule::in(User::ROLES)],
            'can_confirm_payments' => 'nullable|boolean',
            'can_edit_mutations' => 'nullable|boolean',
            'is_employee' => $hasEmployeeFields ? 'nullable|boolean' : 'nullable',
            'payroll_member_id' => $hasEmployeeFields ? 'nullable|integer|exists:payroll_members,id' : 'nullable',
        ]);

        $isEmployee = $hasEmployeeFields ? (bool) ($validated['is_employee'] ?? false) : false;
        $payrollMemberId = $hasEmployeeFields ? ($validated['payroll_member_id'] ?? null) : null;
        if ($hasEmployeeFields && $isEmployee && empty($payrollMemberId)) {
            return response()->json(['message' => 'Pilih teknisi payroll jika akun ditandai sebagai karyawan.'], 422);
        }

        $user->name = $validated['name'];
        $user->email = $validated['email'];
        $user->role = $validated['role'];
        $user->can_confirm_payments = (bool) ($validated['can_confirm_payments'] ?? false);
        $user->can_edit_mutations = (bool) ($validated['can_edit_mutations'] ?? false);
        if ($hasEmployeeFields) {
            $user->is_employee = $isEmployee;
            $user->payroll_member_id = $isEmployee ? $payrollMemberId : null;
        }

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        $user->save();
        $user->loadMissing('payrollMember:id,nama');

        return response()->json([
            'message' => 'Akun berhasil diperbarui.',
            'data' => [
                ...$user->only('id', 'name', 'email', 'role', 'can_confirm_payments', 'can_edit_mutations', 'is_employee', 'payroll_member_id', 'created_at'),
                'payroll_member_name' => $user->payrollMember?->nama,
            ],
        ]);
    }

    /**
     * Delete a user
     */
    public function destroy(User $user)
    {
        // Cannot delete self
        if ($user->id === auth()->id()) {
            return response()->json(['error' => 'Tidak dapat menghapus akun sendiri.'], 403);
        }

        // Only superadmin can delete superadmin
        if ($user->role === User::ROLE_SUPERADMIN && !auth()->user()->isSuperAdmin()) {
            return response()->json(['error' => 'Hanya superadmin yang dapat menghapus akun superadmin.'], 403);
        }

        $user->delete();

        return response()->json(['message' => 'Akun berhasil dihapus.']);
    }
}

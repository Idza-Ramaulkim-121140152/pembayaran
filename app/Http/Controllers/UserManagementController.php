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
        if (Schema::hasColumn('users', 'can_confirm_payments')) {
            $select[] = 'can_confirm_payments';
        }
        if (Schema::hasColumn('users', 'can_edit_mutations')) {
            $select[] = 'can_edit_mutations';
        }

        $users = User::select($select)
            ->orderBy('role')
            ->orderBy('name')
            ->get();

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

        return response()->json(['data' => $users]);
    }

    /**
     * Create a new user
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => ['required', Rule::in(User::ROLES)],
            'can_confirm_payments' => 'nullable|boolean',
            'can_edit_mutations' => 'nullable|boolean',
        ]);

        // Only superadmin can create superadmin accounts
        if ($validated['role'] === User::ROLE_SUPERADMIN && !auth()->user()->isSuperAdmin()) {
            return response()->json(['error' => 'Hanya superadmin yang dapat membuat akun superadmin.'], 403);
        }

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'can_confirm_payments' => (bool) ($validated['can_confirm_payments'] ?? false),
            'can_edit_mutations' => (bool) ($validated['can_edit_mutations'] ?? false),
        ]);

        return response()->json([
            'message' => 'Akun berhasil dibuat.',
            'data' => $user->only('id', 'name', 'email', 'role', 'can_confirm_payments', 'can_edit_mutations', 'created_at'),
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

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
            'role' => ['required', Rule::in(User::ROLES)],
            'can_confirm_payments' => 'nullable|boolean',
            'can_edit_mutations' => 'nullable|boolean',
        ]);

        $user->name = $validated['name'];
        $user->email = $validated['email'];
        $user->role = $validated['role'];
        $user->can_confirm_payments = (bool) ($validated['can_confirm_payments'] ?? false);
        $user->can_edit_mutations = (bool) ($validated['can_edit_mutations'] ?? false);

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        $user->save();

        return response()->json([
            'message' => 'Akun berhasil diperbarui.',
            'data' => $user->only('id', 'name', 'email', 'role', 'can_confirm_payments', 'can_edit_mutations', 'created_at'),
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

<?php

namespace App\Http\Controllers;

use App\Models\AccessGroup;
use App\Models\PermissionAuditLog;
use App\Models\PermissionKey;
use App\Models\RolePermissionRule;
use App\Models\User;
use App\Models\UserPermissionRule;
use App\Services\AccessPolicyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AccessControlController extends Controller
{
    public function __construct(private AccessPolicyService $accessPolicyService)
    {
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'data' => [
                'user_id' => $user?->id,
                'role' => $user?->role,
                'capabilities' => $this->accessPolicyService->capabilities($user),
                'shadow_mode' => (bool) config('access_control.shadow_mode', true),
                'enforce_mode' => (bool) config('access_control.enforce_mode', false),
            ],
        ]);
    }

    public function permissions()
    {
        $permissions = PermissionKey::query()->orderBy('key')->get();

        return response()->json(['data' => $permissions]);
    }

    public function menuMap()
    {
        $rows = collect(config('access_permissions.menu_map', []))
            ->values()
            ->map(function (array $row) {
                return [
                    'menu_key' => $row['menu_key'] ?? null,
                    'label' => $row['label'] ?? null,
                    'permission_keys' => array_values($row['permission_keys'] ?? []),
                    'navbar_section' => $row['navbar_section'] ?? 'main',
                    'default_visible' => (bool) ($row['default_visible'] ?? true),
                ];
            })
            ->filter(fn (array $row) => !empty($row['menu_key']) && !empty($row['permission_keys']))
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function groups(Request $request)
    {
        $query = AccessGroup::query()
            ->withCount('members')
            ->with(['members:id,name,email,role'])
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        return response()->json(['data' => $query->paginate((int) $request->input('per_page', 20))]);
    }

    public function storeGroup(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'slug' => 'nullable|string|max:120|unique:access_groups,slug',
            'description' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
        ]);

        $group = AccessGroup::create([
            'name' => $validated['name'],
            'slug' => $validated['slug'] ?? Str::slug($validated['name']),
            'description' => $validated['description'] ?? null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ]);

        $this->logAudit('group.created', AccessGroup::class, $group->id, null, null, null, ['payload' => $group->toArray()]);

        return response()->json(['message' => 'Grup berhasil dibuat.', 'data' => $group], 201);
    }

    public function updateGroup(Request $request, AccessGroup $accessGroup)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'slug' => 'nullable|string|max:120|unique:access_groups,slug,' . $accessGroup->id,
            'description' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
        ]);

        $before = $accessGroup->toArray();

        $accessGroup->fill([
            'name' => $validated['name'],
            'slug' => $validated['slug'] ?? Str::slug($validated['name']),
            'description' => $validated['description'] ?? null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ])->save();

        $this->logAudit('group.updated', AccessGroup::class, $accessGroup->id, null, null, null, [
            'before' => $before,
            'after' => $accessGroup->toArray(),
        ]);

        return response()->json(['message' => 'Grup berhasil diperbarui.', 'data' => $accessGroup]);
    }

    public function destroyGroup(AccessGroup $accessGroup)
    {
        $groupId = $accessGroup->id;
        $snapshot = $accessGroup->toArray();
        $memberIds = $accessGroup->members()->pluck('users.id')->all();

        DB::transaction(function () use ($accessGroup) {
            $accessGroup->members()->detach();
            $accessGroup->permissionRules()->delete();
            $accessGroup->delete();
        });

        $this->accessPolicyService->forgetGroupCache((int) $groupId);
        foreach ($memberIds as $memberId) {
            $this->accessPolicyService->forgetUserCache((int) $memberId);
        }

        $this->logAudit('group.deleted', AccessGroup::class, $groupId, null, null, null, ['before' => $snapshot]);

        return response()->json(['message' => 'Grup berhasil dihapus.']);
    }

    public function upsertGroupMembers(Request $request, AccessGroup $accessGroup)
    {
        $validated = $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $beforeMemberIds = $accessGroup->members()->pluck('users.id')->all();
        $accessGroup->members()->sync($validated['user_ids']);
        $afterMemberIds = $accessGroup->members()->pluck('users.id')->all();

        $this->accessPolicyService->forgetGroupCache((int) $accessGroup->id);
        foreach (array_unique(array_merge($beforeMemberIds, $afterMemberIds)) as $memberId) {
            $this->accessPolicyService->forgetUserCache((int) $memberId);
        }

        $this->logAudit('group.members_synced', AccessGroup::class, $accessGroup->id, null, null, null, [
            'user_ids' => $validated['user_ids'],
        ]);

        return response()->json([
            'message' => 'Anggota grup berhasil diperbarui.',
            'data' => $accessGroup->load('members:id,name,email,role'),
        ]);
    }

    public function roleRules(string $role)
    {
        abort_unless(in_array($role, User::ROLES, true), 404);

        $rules = RolePermissionRule::query()
            ->join('permission_keys as pk', 'pk.id', '=', 'role_permission_rules.permission_key_id')
            ->where('role_permission_rules.role', $role)
            ->orderBy('pk.key')
            ->get([
                'role_permission_rules.id',
                'role_permission_rules.effect',
                'pk.id as permission_key_id',
                'pk.key',
                'pk.label',
            ]);

        return response()->json(['data' => $rules]);
    }

    public function upsertRoleRules(Request $request, string $role)
    {
        abort_unless(in_array($role, User::ROLES, true), 404);

        $validated = $request->validate([
            'rules' => 'required|array|min:1',
            'rules.*.permission_key_id' => 'required|integer|exists:permission_keys,id',
            'rules.*.effect' => 'required|in:allow,deny,inherited',
        ]);

        DB::transaction(function () use ($validated, $role) {
            foreach ($validated['rules'] as $rule) {
                $model = RolePermissionRule::query()->firstOrNew([
                    'role' => $role,
                    'permission_key_id' => (int) $rule['permission_key_id'],
                ]);

                $oldEffect = $model->exists ? $model->effect : 'inherited';
                $newEffect = $rule['effect'];
                $model->effect = $newEffect;
                $model->save();

                $permKey = PermissionKey::query()->find($rule['permission_key_id'])?->key;
                $this->logAudit('role_rule.upserted', RolePermissionRule::class, $model->id, $permKey, $oldEffect, $newEffect);
            }
        });

        $this->accessPolicyService->forgetRoleCache($role);
        User::query()->where('role', $role)->pluck('id')->each(function ($userId) {
            $this->accessPolicyService->forgetUserCache((int) $userId);
        });

        return response()->json(['message' => 'Role rules berhasil diperbarui.']);
    }

    public function groupRules(AccessGroup $accessGroup)
    {
        $rules = $accessGroup->permissionRules()
            ->join('permission_keys as pk', 'pk.id', '=', 'group_permission_rules.permission_key_id')
            ->orderBy('pk.key')
            ->get([
                'group_permission_rules.id',
                'group_permission_rules.effect',
                'pk.id as permission_key_id',
                'pk.key',
                'pk.label',
            ]);

        return response()->json(['data' => $rules]);
    }

    public function upsertGroupRules(Request $request, AccessGroup $accessGroup)
    {
        $validated = $request->validate([
            'rules' => 'required|array|min:1',
            'rules.*.permission_key_id' => 'required|integer|exists:permission_keys,id',
            'rules.*.effect' => 'required|in:allow,deny,inherited',
        ]);

        DB::transaction(function () use ($validated, $accessGroup) {
            foreach ($validated['rules'] as $rule) {
                $model = $accessGroup->permissionRules()->firstOrNew([
                    'permission_key_id' => (int) $rule['permission_key_id'],
                ]);

                $oldEffect = $model->exists ? $model->effect : 'inherited';
                $newEffect = $rule['effect'];
                $model->effect = $newEffect;
                $model->save();

                $permKey = PermissionKey::query()->find($rule['permission_key_id'])?->key;
                $this->logAudit('group_rule.upserted', get_class($accessGroup), $accessGroup->id, $permKey, $oldEffect, $newEffect);
            }
        });

        $this->accessPolicyService->forgetGroupCache((int) $accessGroup->id);
        $accessGroup->members()->pluck('users.id')->each(function ($userId) {
            $this->accessPolicyService->forgetUserCache((int) $userId);
        });

        return response()->json(['message' => 'Group rules berhasil diperbarui.']);
    }

    public function userRules(User $user)
    {
        $rules = UserPermissionRule::query()
            ->join('permission_keys as pk', 'pk.id', '=', 'user_permission_rules.permission_key_id')
            ->where('user_permission_rules.user_id', $user->id)
            ->orderBy('pk.key')
            ->get([
                'user_permission_rules.id',
                'user_permission_rules.effect',
                'pk.id as permission_key_id',
                'pk.key',
                'pk.label',
            ]);

        return response()->json(['data' => $rules]);
    }

    public function upsertUserRules(Request $request, User $user)
    {
        $validated = $request->validate([
            'rules' => 'required|array|min:1',
            'rules.*.permission_key_id' => 'required|integer|exists:permission_keys,id',
            'rules.*.effect' => 'required|in:allow,deny,inherited',
        ]);

        DB::transaction(function () use ($validated, $user) {
            foreach ($validated['rules'] as $rule) {
                $model = UserPermissionRule::query()->firstOrNew([
                    'user_id' => $user->id,
                    'permission_key_id' => (int) $rule['permission_key_id'],
                ]);

                $oldEffect = $model->exists ? $model->effect : 'inherited';
                $newEffect = $rule['effect'];
                $model->effect = $newEffect;
                $model->save();

                $permKey = PermissionKey::query()->find($rule['permission_key_id'])?->key;
                $this->logAudit('user_rule.upserted', User::class, $user->id, $permKey, $oldEffect, $newEffect);
            }
        });

        $this->accessPolicyService->forgetUserCache((int) $user->id);

        return response()->json(['message' => 'User rules berhasil diperbarui.']);
    }

    public function userEffective(User $user)
    {
        $permissionKeys = PermissionKey::query()
            ->where('is_active', true)
            ->orderBy('key')
            ->pluck('key')
            ->all();
        $rows = [];
        foreach ($permissionKeys as $key) {
            $effective = $this->accessPolicyService->evaluateEffective($user, $key);
            $allowed = (bool) ($effective['allowed'] ?? false);
            $runtimeAllowed = $this->accessPolicyService->has($user, $key);
            $rows[] = [
                'permission_key' => $key,
                'allowed' => $allowed,
                'source' => $effective['source'] ?? null,
                'effect' => $effective['effect'] ?? null,
                'runtime_allowed' => (bool) $runtimeAllowed,
            ];
        }

        return response()->json([
            'data' => [
                'user' => $user->only(['id', 'name', 'email', 'role']),
                'effective_permissions' => $rows,
            ],
        ]);
    }

    public function effectivePreview(Request $request)
    {
        $validated = $request->validate([
            'target_type' => 'required|in:role,group,user',
            'target' => 'required',
        ]);

        $targetType = $validated['target_type'];
        $target = (string) $validated['target'];
        $permissionRows = PermissionKey::query()
            ->where('is_active', true)
            ->orderBy('key')
            ->get(['id', 'key', 'label']);

        $effectiveRows = [];

        if ($targetType === 'role') {
            abort_unless(in_array($target, User::ROLES, true), 404);

            foreach ($permissionRows as $permission) {
                $effective = $this->accessPolicyService->evaluateRoleEffective($target, $permission->key);
                $effectiveRows[] = [
                    'permission_key' => $permission->key,
                    'permission_label' => $permission->label,
                    'allowed' => (bool) ($effective['allowed'] ?? false),
                    'source' => $effective['source'] ?? null,
                    'effect' => $effective['effect'] ?? 'inherited',
                    'raw_effect' => $effective['effect'] ?? 'inherited',
                    'runtime_allowed' => (bool) ($effective['allowed'] ?? false),
                ];
            }
        } elseif ($targetType === 'group') {
            $group = AccessGroup::query()->findOrFail((int) $target);

            foreach ($permissionRows as $permission) {
                $effective = $this->accessPolicyService->evaluateGroupEffective($group, $permission->key);
                $effectiveRows[] = [
                    'permission_key' => $permission->key,
                    'permission_label' => $permission->label,
                    'allowed' => (bool) ($effective['allowed'] ?? false),
                    'source' => $effective['source'] ?? null,
                    'effect' => $effective['effect'] ?? 'inherited',
                    'raw_effect' => $effective['effect'] ?? 'inherited',
                    'runtime_allowed' => (bool) ($effective['allowed'] ?? false),
                ];
            }
        } else {
            $user = User::query()->findOrFail((int) $target);

            foreach ($permissionRows as $permission) {
                $effective = $this->accessPolicyService->evaluateEffective($user, $permission->key);
                $runtimeAllowed = $this->accessPolicyService->has($user, $permission->key);
                $effectiveRows[] = [
                    'permission_key' => $permission->key,
                    'permission_label' => $permission->label,
                    'allowed' => (bool) ($effective['allowed'] ?? false),
                    'source' => $effective['source'] ?? null,
                    'effect' => $effective['effect'] ?? 'inherited',
                    'raw_effect' => $effective['effect'] ?? 'inherited',
                    'runtime_allowed' => (bool) $runtimeAllowed,
                ];
            }
        }

        return response()->json([
            'data' => [
                'target_type' => $targetType,
                'target' => $target,
                'effective_permissions' => $effectiveRows,
            ],
        ]);
    }

    public function auditLogs(Request $request)
    {
        $query = PermissionAuditLog::query()->with('actor:id,name,email')->orderByDesc('id');

        if ($request->filled('action')) {
            $query->where('action', $request->input('action'));
        }

        return response()->json([
            'data' => $query->paginate((int) $request->input('per_page', 30)),
        ]);
    }

    private function logAudit(
        string $action,
        ?string $subjectType,
        ?int $subjectId,
        ?string $permissionKey,
        ?string $oldEffect,
        ?string $newEffect,
        array $meta = []
    ): void {
        PermissionAuditLog::create([
            'actor_user_id' => auth()->id(),
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'permission_key' => $permissionKey,
            'old_effect' => $oldEffect,
            'new_effect' => $newEffect,
            'meta' => $meta,
            'created_at' => now(),
        ]);
    }
}

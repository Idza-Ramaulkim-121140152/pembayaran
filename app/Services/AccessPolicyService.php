<?php

namespace App\Services;

use App\Models\PermissionAuditLog;
use App\Models\PermissionKey;
use App\Models\RolePermissionRule;
use App\Models\AccessGroup;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AccessPolicyService
{
    public function forgetUserCache(int $userId): void
    {
        Cache::forget("access_policy_maps_{$userId}");
    }

    public function forgetRoleCache(string $role): void
    {
        Cache::forget("access_policy_role_map_{$role}");
    }

    public function forgetGroupCache(int $groupId): void
    {
        Cache::forget("access_policy_group_map_{$groupId}");
    }

    public function has(?User $user, string $permissionKey): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        $legacyDecision = $this->legacyDecision($user, $permissionKey);
        $policyDecision = $this->policyDecision($user, $permissionKey);

        $shadow = (bool) config('access_control.shadow_mode', true);
        $enforce = (bool) config('access_control.enforce_mode', false);

        if ($shadow && $legacyDecision !== $policyDecision) {
            $this->logShadowMismatch($user, $permissionKey, $legacyDecision, $policyDecision);
        }

        return $enforce ? $policyDecision : $legacyDecision;
    }

    public function capabilities(?User $user): array
    {
        $keys = $this->allPermissionKeys();

        if (!$user) {
            return collect($keys)->mapWithKeys(fn ($key) => [$key => false])->all();
        }

        if ($user->isSuperAdmin()) {
            return collect($keys)->mapWithKeys(fn ($key) => [$key => true])->all();
        }

        $caps = [];
        foreach ($keys as $key) {
            $caps[$key] = $this->has($user, $key);
        }

        return $caps;
    }

    public function evaluateEffective(?User $user, string $permissionKey): array
    {
        if (!$user) {
            return ['allowed' => false, 'source' => 'guest', 'effect' => 'deny'];
        }

        if ($user->isSuperAdmin()) {
            return ['allowed' => true, 'source' => 'superadmin_bypass', 'effect' => 'allow'];
        }

        $maps = $this->decisionMaps($user);

        $userEffect = $maps['user'][$permissionKey] ?? 'inherited';
        if ($userEffect !== 'inherited') {
            return ['allowed' => $userEffect === 'allow', 'source' => 'user', 'effect' => $userEffect];
        }

        $groupEffects = $maps['groups'][$permissionKey] ?? [];
        if (in_array('deny', $groupEffects, true)) {
            return ['allowed' => false, 'source' => 'group', 'effect' => 'deny'];
        }
        if (in_array('allow', $groupEffects, true)) {
            return ['allowed' => true, 'source' => 'group', 'effect' => 'allow'];
        }

        $roleEffect = $maps['role'][$permissionKey] ?? 'inherited';
        if ($roleEffect !== 'inherited') {
            return ['allowed' => $roleEffect === 'allow', 'source' => 'role', 'effect' => $roleEffect];
        }

        return [
            'allowed' => $this->legacyDecision($user, $permissionKey),
            'source' => 'legacy_fallback',
            'effect' => 'inherited',
        ];
    }

    public function evaluateRoleEffective(string $role, string $permissionKey): array
    {
        if ($role === User::ROLE_SUPERADMIN) {
            return ['allowed' => true, 'source' => 'superadmin_role', 'effect' => 'allow'];
        }

        $roleRule = $this->roleDecisionMap($role)[$permissionKey] ?? 'inherited';
        if ($roleRule !== 'inherited') {
            return [
                'allowed' => $roleRule === 'allow',
                'source' => 'role',
                'effect' => $roleRule,
            ];
        }

        return [
            'allowed' => $this->legacyDecisionForRole($role, $permissionKey),
            'source' => 'role_baseline',
            'effect' => 'inherited',
        ];
    }

    public function evaluateGroupEffective(?AccessGroup $group, string $permissionKey): array
    {
        if (!$group || !$group->is_active) {
            return [
                'allowed' => false,
                'source' => 'group_baseline',
                'effect' => 'inherited',
            ];
        }

        $groupEffects = $this->groupDecisionMap((int) $group->id)[$permissionKey] ?? [];
        if (in_array('deny', $groupEffects, true)) {
            return ['allowed' => false, 'source' => 'group', 'effect' => 'deny'];
        }
        if (in_array('allow', $groupEffects, true)) {
            return ['allowed' => true, 'source' => 'group', 'effect' => 'allow'];
        }

        return [
            'allowed' => false,
            'source' => 'group_baseline',
            'effect' => 'inherited',
        ];
    }

    private function policyDecision(User $user, string $permissionKey): bool
    {
        if (!$this->acTablesReady()) {
            return $this->legacyDecision($user, $permissionKey);
        }

        $effective = $this->evaluateEffective($user, $permissionKey);

        return (bool) $effective['allowed'];
    }

    private function legacyDecision(User $user, string $permissionKey): bool
    {
        $baseline = config('access_permissions.baseline_roles', []);
        $allowed = $baseline[$user->role] ?? [];

        if ($allowed === ['*']) {
            return true;
        }

        return in_array($permissionKey, $allowed, true);
    }

    public function legacyDecisionForRole(string $role, string $permissionKey): bool
    {
        $baseline = config('access_permissions.baseline_roles', []);
        $allowed = $baseline[$role] ?? [];

        if ($allowed === ['*']) {
            return true;
        }

        return in_array($permissionKey, $allowed, true);
    }

    private function allPermissionKeys(): array
    {
        if ($this->acTablesReady()) {
            return PermissionKey::query()->where('is_active', true)->orderBy('key')->pluck('key')->all();
        }

        return collect(config('access_permissions.permissions', []))->pluck('key')->values()->all();
    }

    private function decisionMaps(User $user): array
    {
        $ttl = (int) config('access_control.cache_ttl_seconds', 60);

        return Cache::remember("access_policy_maps_{$user->id}", $ttl, function () use ($user) {
            $userRules = DB::table('user_permission_rules as upr')
                ->join('permission_keys as pk', 'pk.id', '=', 'upr.permission_key_id')
                ->where('upr.user_id', $user->id)
                ->pluck('upr.effect', 'pk.key')
                ->all();

            $roleRules = RolePermissionRule::query()
                ->join('permission_keys as pk', 'pk.id', '=', 'role_permission_rules.permission_key_id')
                ->where('role', $user->role)
                ->pluck('role_permission_rules.effect', 'pk.key')
                ->all();

            $groupRulesRows = DB::table('group_user_memberships as gum')
                ->join('access_groups as ag', 'ag.id', '=', 'gum.access_group_id')
                ->join('group_permission_rules as gpr', 'gpr.access_group_id', '=', 'ag.id')
                ->join('permission_keys as pk', 'pk.id', '=', 'gpr.permission_key_id')
                ->where('gum.user_id', $user->id)
                ->where('ag.is_active', true)
                ->select('pk.key', 'gpr.effect')
                ->get();

            $groupRules = [];
            foreach ($groupRulesRows as $row) {
                $groupRules[$row->key] ??= [];
                $groupRules[$row->key][] = $row->effect;
            }

            return [
                'user' => $userRules,
                'role' => $roleRules,
                'groups' => $groupRules,
            ];
        });
    }

    private function roleDecisionMap(string $role): array
    {
        if (!$this->acTablesReady()) {
            return [];
        }

        $ttl = (int) config('access_control.cache_ttl_seconds', 60);

        return Cache::remember("access_policy_role_map_{$role}", $ttl, function () use ($role) {
            return RolePermissionRule::query()
                ->join('permission_keys as pk', 'pk.id', '=', 'role_permission_rules.permission_key_id')
                ->where('role_permission_rules.role', $role)
                ->pluck('role_permission_rules.effect', 'pk.key')
                ->all();
        });
    }

    private function groupDecisionMap(int $groupId): array
    {
        if (!$this->acTablesReady()) {
            return [];
        }

        $ttl = (int) config('access_control.cache_ttl_seconds', 60);

        return Cache::remember("access_policy_group_map_{$groupId}", $ttl, function () use ($groupId) {
            $rows = DB::table('group_permission_rules as gpr')
                ->join('permission_keys as pk', 'pk.id', '=', 'gpr.permission_key_id')
                ->where('gpr.access_group_id', $groupId)
                ->select('pk.key', 'gpr.effect')
                ->get();

            $groupRules = [];
            foreach ($rows as $row) {
                $groupRules[$row->key] ??= [];
                $groupRules[$row->key][] = $row->effect;
            }

            return $groupRules;
        });
    }

    private function logShadowMismatch(User $user, string $permissionKey, bool $legacyDecision, bool $policyDecision): void
    {
        if (!$this->acTablesReady()) {
            return;
        }

        PermissionAuditLog::create([
            'actor_user_id' => $user->id,
            'action' => 'shadow_mismatch',
            'subject_type' => User::class,
            'subject_id' => $user->id,
            'permission_key' => $permissionKey,
            'old_effect' => $legacyDecision ? 'allow' : 'deny',
            'new_effect' => $policyDecision ? 'allow' : 'deny',
            'meta' => [
                'role' => $user->role,
                'enforce_mode' => (bool) config('access_control.enforce_mode', false),
            ],
            'created_at' => now(),
        ]);
    }

    private function acTablesReady(): bool
    {
        return Schema::hasTable('permission_keys')
            && Schema::hasTable('role_permission_rules')
            && Schema::hasTable('access_groups')
            && Schema::hasTable('group_permission_rules')
            && Schema::hasTable('user_permission_rules')
            && Schema::hasTable('group_user_memberships');
    }
}

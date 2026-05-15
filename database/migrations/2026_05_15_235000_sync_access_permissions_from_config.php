<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('permission_keys') || !Schema::hasTable('role_permission_rules')) {
            return;
        }

        $permissions = collect(config('access_permissions.permissions', []))
            ->filter(fn (array $row) => !empty($row['key']))
            ->values();

        foreach ($permissions as $row) {
            DB::table('permission_keys')->updateOrInsert(
                ['key' => $row['key']],
                [
                    'label' => $row['label'] ?? $row['key'],
                    'description' => $row['description'] ?? null,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }

        $keyIdMap = DB::table('permission_keys')->pluck('id', 'key');
        $baselineRoles = (array) config('access_permissions.baseline_roles', []);

        foreach ($baselineRoles as $role => $allowedKeys) {
            $allowedKeys = (array) $allowedKeys;

            foreach ($keyIdMap as $key => $permissionId) {
                $effect = in_array('*', $allowedKeys, true) || in_array($key, $allowedKeys, true)
                    ? 'allow'
                    : 'inherited';

                DB::table('role_permission_rules')->updateOrInsert(
                    [
                        'role' => $role,
                        'permission_key_id' => $permissionId,
                    ],
                    [
                        'effect' => $effect,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );
            }
        }
    }

    public function down(): void
    {
        // no-op: baseline sync migration intentionally keeps data additive/idempotent
    }
};

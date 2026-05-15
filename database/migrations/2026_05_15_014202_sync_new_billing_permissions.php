<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('permission_keys') || !Schema::hasTable('role_permission_rules')) {
            return;
        }

        $permissions = collect(config('access_permissions.permissions', []))
            ->filter(fn ($row) => !empty($row['key']))
            ->values();

        foreach ($permissions as $row) {
            DB::table('permission_keys')->updateOrInsert(
                ['key' => $row['key']],
                [
                    'label' => $row['label'] ?? $row['key'],
                    'description' => $row['description'] ?? null,
                    'is_active' => true,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }

        $keyIdMap = DB::table('permission_keys')->pluck('id', 'key');
        $baselineRoles = (array) config('access_permissions.baseline_roles', []);

        foreach ($baselineRoles as $role => $allowedKeys) {
            foreach ($keyIdMap as $key => $permissionId) {
                $effect = in_array('*', (array) $allowedKeys, true) || in_array($key, (array) $allowedKeys, true)
                    ? 'allow'
                    : 'inherited';

                DB::table('role_permission_rules')->updateOrInsert(
                    [
                        'role' => $role,
                        'permission_key_id' => $permissionId,
                    ],
                    [
                        'effect' => $effect,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('permission_keys') || !Schema::hasTable('role_permission_rules')) {
            return;
        }

        $keys = [
            'billing.dunning.view',
            'billing.dunning.manage',
            'billing.payment_capture.manage',
            'billing.payment_capture.review',
        ];

        $permissionIds = DB::table('permission_keys')
            ->whereIn('key', $keys)
            ->pluck('id')
            ->all();

        if (!empty($permissionIds)) {
            DB::table('role_permission_rules')
                ->whereIn('permission_key_id', $permissionIds)
                ->delete();

            DB::table('permission_keys')
                ->whereIn('id', $permissionIds)
                ->delete();
        }
    }
};

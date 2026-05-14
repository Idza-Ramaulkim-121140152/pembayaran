<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permission_keys', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('label');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('access_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('role_permission_rules', function (Blueprint $table) {
            $table->id();
            $table->string('role', 50);
            $table->foreignId('permission_key_id')->constrained('permission_keys')->cascadeOnDelete();
            $table->enum('effect', ['allow', 'deny', 'inherited'])->default('inherited');
            $table->timestamps();
            $table->unique(['role', 'permission_key_id']);
            $table->index(['role', 'effect']);
        });

        Schema::create('group_permission_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('access_group_id')->constrained('access_groups')->cascadeOnDelete();
            $table->foreignId('permission_key_id')->constrained('permission_keys')->cascadeOnDelete();
            $table->enum('effect', ['allow', 'deny', 'inherited'])->default('inherited');
            $table->timestamps();
            $table->unique(['access_group_id', 'permission_key_id']);
            $table->index(['access_group_id', 'effect']);
        });

        Schema::create('user_permission_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('permission_key_id')->constrained('permission_keys')->cascadeOnDelete();
            $table->enum('effect', ['allow', 'deny', 'inherited'])->default('inherited');
            $table->timestamps();
            $table->unique(['user_id', 'permission_key_id']);
            $table->index(['user_id', 'effect']);
        });

        Schema::create('group_user_memberships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('access_group_id')->constrained('access_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['access_group_id', 'user_id']);
        });

        Schema::create('permission_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 100);
            $table->string('subject_type', 100)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('permission_key')->nullable();
            $table->enum('old_effect', ['allow', 'deny', 'inherited'])->nullable();
            $table->enum('new_effect', ['allow', 'deny', 'inherited'])->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['action', 'created_at']);
        });

        $this->seedPermissionsAndBaseline();
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_audit_logs');
        Schema::dropIfExists('group_user_memberships');
        Schema::dropIfExists('user_permission_rules');
        Schema::dropIfExists('group_permission_rules');
        Schema::dropIfExists('role_permission_rules');
        Schema::dropIfExists('access_groups');
        Schema::dropIfExists('permission_keys');
    }

    private function seedPermissionsAndBaseline(): void
    {
        $permissionRows = config('access_permissions.permissions', []);
        $baseline = config('access_permissions.baseline_roles', []);

        foreach ($permissionRows as $row) {
            DB::table('permission_keys')->insert([
                'key' => $row['key'],
                'label' => $row['label'] ?? $row['key'],
                'description' => $row['description'] ?? null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $keyIdMap = DB::table('permission_keys')->pluck('id', 'key');

        foreach ($baseline as $role => $allowedKeys) {
            if ($allowedKeys === ['*']) {
                foreach ($keyIdMap as $id) {
                    DB::table('role_permission_rules')->insert([
                        'role' => $role,
                        'permission_key_id' => $id,
                        'effect' => 'allow',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                continue;
            }

            foreach ($keyIdMap as $key => $id) {
                $effect = in_array($key, $allowedKeys, true) ? 'allow' : 'inherited';
                DB::table('role_permission_rules')->insert([
                    'role' => $role,
                    'permission_key_id' => $id,
                    'effect' => $effect,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }
};

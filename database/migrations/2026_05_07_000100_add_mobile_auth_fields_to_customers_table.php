<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const DEFAULT_PASSWORD = '12345678';

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('mobile_password')->nullable()->after('home_router_password');
            $table->boolean('mobile_force_password_change')->default(true)->after('mobile_password');
            $table->timestamp('mobile_password_changed_at')->nullable()->after('mobile_force_password_change');
            $table->timestamp('mobile_password_reset_at')->nullable()->after('mobile_password_changed_at');
            $table->foreignId('mobile_password_reset_by_user_id')
                ->nullable()
                ->after('mobile_password_reset_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->json('mobile_password_reset_meta')->nullable()->after('mobile_password_reset_by_user_id');
        });

        DB::table('customers')
            ->where('is_active', true)
            ->update([
                'mobile_password' => Hash::make(self::DEFAULT_PASSWORD),
                'mobile_force_password_change' => true,
                'mobile_password_changed_at' => null,
                'mobile_password_reset_at' => now(),
                'mobile_password_reset_meta' => json_encode([
                    'reason' => 'bootstrap_default_password',
                ]),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('mobile_password_reset_by_user_id');
            $table->dropColumn([
                'mobile_password',
                'mobile_force_password_change',
                'mobile_password_changed_at',
                'mobile_password_reset_at',
                'mobile_password_reset_meta',
            ]);
        });
    }
};

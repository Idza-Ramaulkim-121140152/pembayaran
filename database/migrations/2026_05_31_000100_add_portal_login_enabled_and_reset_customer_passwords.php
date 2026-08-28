<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const DEFAULT_PASSWORD = 'user123';

    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('portal_login_enabled')->default(true)->after('mobile_password_reset_meta');
        });

        DB::table('customers')->update([
            'mobile_password' => Hash::make(self::DEFAULT_PASSWORD),
            'mobile_force_password_change' => true,
            'mobile_password_changed_at' => null,
            'mobile_password_reset_at' => now(),
            'mobile_password_reset_meta' => json_encode([
                'reason' => 'stage1_reset_default_user123',
            ]),
            'portal_login_enabled' => true,
        ]);
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('portal_login_enabled');
        });
    }
};

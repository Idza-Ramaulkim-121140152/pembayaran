<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('packages') && !Schema::hasColumn('packages', 'show_in_public_registration')) {
            Schema::table('packages', function (Blueprint $table) {
                $table->boolean('show_in_public_registration')->default(true)->after('is_active');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('packages') && Schema::hasColumn('packages', 'show_in_public_registration')) {
            Schema::table('packages', function (Blueprint $table) {
                $table->dropColumn('show_in_public_registration');
            });
        }
    }
};

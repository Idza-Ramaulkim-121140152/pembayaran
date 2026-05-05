<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('kecamatan_id')
                ->nullable()
                ->after('area_code')
                ->constrained('master_wilayah_kecamatans')
                ->nullOnDelete();
            $table->foreignId('desa_id')
                ->nullable()
                ->after('kecamatan_id')
                ->constrained('master_wilayah_desas')
                ->nullOnDelete();
            $table->foreignId('dusun_id')
                ->nullable()
                ->after('desa_id')
                ->constrained('master_wilayah_dusuns')
                ->nullOnDelete();
            $table->boolean('enable_home_router')->default(false)->after('home_router_monitoring_enabled');
            $table->boolean('enable_installation_team')->default(false)->after('enable_home_router');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dusun_id');
            $table->dropConstrainedForeignId('desa_id');
            $table->dropConstrainedForeignId('kecamatan_id');
            $table->dropColumn(['enable_home_router', 'enable_installation_team']);
        });
    }
};

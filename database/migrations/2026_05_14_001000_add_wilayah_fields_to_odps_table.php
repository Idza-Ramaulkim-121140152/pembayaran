<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('odps', function (Blueprint $table) {
            if (!Schema::hasColumn('odps', 'kecamatan_id')) {
                $table->foreignId('kecamatan_id')
                    ->nullable()
                    ->after('longitude')
                    ->constrained('master_wilayah_kecamatans')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('odps', 'desa_id')) {
                $table->foreignId('desa_id')
                    ->nullable()
                    ->after('kecamatan_id')
                    ->constrained('master_wilayah_desas')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('odps', 'dusun_id')) {
                $table->foreignId('dusun_id')
                    ->nullable()
                    ->after('desa_id')
                    ->constrained('master_wilayah_dusuns')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('odps', 'alamat_detail')) {
                $table->text('alamat_detail')->nullable()->after('dusun_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('odps', function (Blueprint $table) {
            if (Schema::hasColumn('odps', 'alamat_detail')) {
                $table->dropColumn('alamat_detail');
            }
            if (Schema::hasColumn('odps', 'dusun_id')) {
                $table->dropConstrainedForeignId('dusun_id');
            }
            if (Schema::hasColumn('odps', 'desa_id')) {
                $table->dropConstrainedForeignId('desa_id');
            }
            if (Schema::hasColumn('odps', 'kecamatan_id')) {
                $table->dropConstrainedForeignId('kecamatan_id');
            }
        });
    }
};


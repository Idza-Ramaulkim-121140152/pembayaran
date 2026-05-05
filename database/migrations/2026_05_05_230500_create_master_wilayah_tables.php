<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('master_wilayah_kecamatans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code', 3)->unique();
            $table->timestamps();
        });

        Schema::create('master_wilayah_desas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kecamatan_id')
                ->constrained('master_wilayah_kecamatans')
                ->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 3);
            $table->timestamps();
            $table->unique(['kecamatan_id', 'name']);
            $table->unique(['kecamatan_id', 'code']);
        });

        Schema::create('master_wilayah_dusuns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('desa_id')
                ->constrained('master_wilayah_desas')
                ->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 3);
            $table->timestamps();
            $table->unique(['desa_id', 'name']);
            $table->unique(['desa_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('master_wilayah_dusuns');
        Schema::dropIfExists('master_wilayah_desas');
        Schema::dropIfExists('master_wilayah_kecamatans');
    }
};

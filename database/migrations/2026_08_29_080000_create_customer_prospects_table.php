<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_prospects', function (Blueprint $table) {
            $table->id();
            $table->string('registration_no', 32)->unique();
            $table->string('nama');
            $table->string('no_telp', 32);
            $table->string('nik', 32)->nullable();
            $table->string('jenis_kelamin', 20)->default('Laki-laki');
            $table->foreignId('kecamatan_id')->nullable()->constrained('master_wilayah_kecamatans')->nullOnDelete();
            $table->foreignId('desa_id')->nullable()->constrained('master_wilayah_desas')->nullOnDelete();
            $table->foreignId('dusun_id')->nullable()->constrained('master_wilayah_dusuns')->nullOnDelete();
            $table->text('alamat')->nullable();
            $table->decimal('latitude', 10, 8)->nullable();
            $table->decimal('longitude', 11, 8)->nullable();
            $table->string('paket')->nullable();
            $table->string('paket_custom')->nullable();
            $table->string('foto_depan_rumah')->nullable();
            $table->string('foto_ktp')->nullable();
            $table->text('catatan')->nullable();
            $table->string('source', 32)->default('public'); // public, technician, marketing, admin
            $table->foreignId('registered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 32)->default('pending'); // pending, approved, rejected, installed
            $table->string('rejection_reason')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('installed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_prospects');
    }
};

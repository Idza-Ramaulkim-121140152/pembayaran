<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Anggota/teknisi
        Schema::create('payroll_members', function (Blueprint $table) {
            $table->id();
            $table->string('nama');
            $table->string('telepon')->nullable();
            $table->timestamps();
        });

        // Proyek
        Schema::create('payroll_projects', function (Blueprint $table) {
            $table->id();
            $table->date('tanggal');
            $table->decimal('total', 12, 0)->default(0);
            $table->enum('status', ['unpaid', 'paid'])->default('unpaid');
            $table->timestamp('paid_at')->nullable();
            $table->text('catatan')->nullable();
            $table->timestamps();
        });

        // Pivot: anggota di proyek (dengan bagian masing-masing)
        Schema::create('payroll_project_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_member_id')->constrained()->cascadeOnDelete();
            $table->decimal('bagian', 12, 0)->default(0); // share per member
            $table->timestamps();
        });

        // Detail item proyek (pemasangan, kabel, kustom)
        Schema::create('payroll_project_details', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_project_id')->constrained()->cascadeOnDelete();
            $table->enum('tipe', ['pemasangan', 'kabel', 'kustom']);
            $table->string('deskripsi')->nullable(); // for kustom type
            $table->decimal('jumlah', 10, 2)->default(0); // qty or meters
            $table->decimal('harga_satuan', 12, 0)->default(0); // price per unit
            $table->decimal('subtotal', 12, 0)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_project_details');
        Schema::dropIfExists('payroll_project_members');
        Schema::dropIfExists('payroll_projects');
        Schema::dropIfExists('payroll_members');
    }
};

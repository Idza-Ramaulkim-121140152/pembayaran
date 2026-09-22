<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_members', function (Blueprint ) {
            if (!Schema::hasColumn('payroll_members', 'tipe_gaji')) {
                ->enum('tipe_gaji', ['bulanan', 'proyek', 'campuran'])->default('bulanan')->after('telepon');
            }
            if (!Schema::hasColumn('payroll_members', 'gaji_pokok')) {
                ->decimal('gaji_pokok', 12, 0)->default(0)->after('tipe_gaji');
            }
            if (!Schema::hasColumn('payroll_members', 'tunjangan')) {
                ->decimal('tunjangan', 12, 0)->default(0)->after('gaji_pokok');
            }
            if (!Schema::hasColumn('payroll_members', 'tanggal_gajian')) {
                ->unsignedTinyInteger('tanggal_gajian')->nullable()->default(1)->after('tunjangan');
            }
            if (!Schema::hasColumn('payroll_members', 'nama_bank')) {
                ->string('nama_bank')->nullable()->after('tanggal_gajian');
            }
            if (!Schema::hasColumn('payroll_members', 'nomor_rekening')) {
                ->string('nomor_rekening')->nullable()->after('nama_bank');
            }
            if (!Schema::hasColumn('payroll_members', 'is_active')) {
                ->boolean('is_active')->default(true)->after('nomor_rekening');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payroll_members', function (Blueprint ) {
            ->dropColumn([
                'tipe_gaji',
                'gaji_pokok',
                'tunjangan',
                'tanggal_gajian',
                'nama_bank',
                'nomor_rekening',
                'is_active',
            ]);
        });
    }
};\n
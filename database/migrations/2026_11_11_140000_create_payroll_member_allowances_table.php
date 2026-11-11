<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('payroll_member_allowances')) {
            Schema::create('payroll_member_allowances', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payroll_member_id')->constrained('payroll_members')->onDelete('cascade');
                $table->string('nama', 120);
                $table->string('jenis', 20)->default('bulanan'); // bulanan | harian
                $table->decimal('nominal', 12, 0)->default(0);
                $table->timestamps();
            });
        }

        if (Schema::hasTable('payroll_members') && Schema::hasColumn('payroll_members', 'tunjangan')) {
            $members = DB::table('payroll_members')
                ->where('tunjangan', '>', 0)
                ->get(['id', 'tunjangan']);

            $now = now();
            foreach ($members as $member) {
                $hasAny = DB::table('payroll_member_allowances')
                    ->where('payroll_member_id', $member->id)
                    ->exists();
                if (!$hasAny) {
                    DB::table('payroll_member_allowances')->insert([
                        'payroll_member_id' => $member->id,
                        'nama' => 'Tunjangan Bulanan',
                        'jenis' => 'bulanan',
                        'nominal' => $member->tunjangan,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        if (Schema::hasTable('payroll_member_payments') && !Schema::hasColumn('payroll_member_payments', 'allowance_breakdown')) {
            Schema::table('payroll_member_payments', function (Blueprint $table) {
                $table->json('allowance_breakdown')->nullable()->after('attendance_summary');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payroll_member_payments') && Schema::hasColumn('payroll_member_payments', 'allowance_breakdown')) {
            Schema::table('payroll_member_payments', function (Blueprint $table) {
                $table->dropColumn('allowance_breakdown');
            });
        }

        Schema::dropIfExists('payroll_member_allowances');
    }
};

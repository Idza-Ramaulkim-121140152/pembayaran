<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_employee')->default(false)->after('can_edit_mutations');
            $table->foreignId('payroll_member_id')
                ->nullable()
                ->after('is_employee')
                ->constrained('payroll_members')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payroll_member_id');
            $table->dropColumn('is_employee');
        });
    }
};


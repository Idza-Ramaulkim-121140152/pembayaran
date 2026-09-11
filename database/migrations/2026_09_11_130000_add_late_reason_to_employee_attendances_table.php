<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('employee_attendances') && !Schema::hasColumn('employee_attendances', 'late_reason')) {
            Schema::table('employee_attendances', function (Blueprint $table) {
                $table->string('late_reason', 255)->nullable()->after('clock_in_late_minutes');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('employee_attendances') && Schema::hasColumn('employee_attendances', 'late_reason')) {
            Schema::table('employee_attendances', function (Blueprint $table) {
                $table->dropColumn('late_reason');
            });
        }
    }
};

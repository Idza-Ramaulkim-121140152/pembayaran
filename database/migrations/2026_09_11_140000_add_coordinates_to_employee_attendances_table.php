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
        Schema::table('employee_attendances', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_attendances', 'clock_in_latitude')) {
                $table->decimal('clock_in_latitude', 10, 8)->nullable()->after('late_reason');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_in_longitude')) {
                $table->decimal('clock_in_longitude', 11, 8)->nullable()->after('clock_in_latitude');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_out_latitude')) {
                $table->decimal('clock_out_latitude', 10, 8)->nullable()->after('clock_out_photo');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_out_longitude')) {
                $table->decimal('clock_out_longitude', 11, 8)->nullable()->after('clock_out_latitude');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employee_attendances', function (Blueprint $table) {
            $columnsToDrop = [];
            if (Schema::hasColumn('employee_attendances', 'clock_in_latitude')) {
                $columnsToDrop[] = 'clock_in_latitude';
            }
            if (Schema::hasColumn('employee_attendances', 'clock_in_longitude')) {
                $columnsToDrop[] = 'clock_in_longitude';
            }
            if (Schema::hasColumn('employee_attendances', 'clock_out_latitude')) {
                $columnsToDrop[] = 'clock_out_latitude';
            }
            if (Schema::hasColumn('employee_attendances', 'clock_out_longitude')) {
                $columnsToDrop[] = 'clock_out_longitude';
            }
            if (!empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }
};

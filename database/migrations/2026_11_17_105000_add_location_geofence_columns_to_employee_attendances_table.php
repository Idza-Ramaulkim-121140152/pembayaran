<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('employee_attendances')) {
            return;
        }

        Schema::table('employee_attendances', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_attendances', 'clock_in_distance_meters')) {
                $table->decimal('clock_in_distance_meters', 10, 2)->nullable()->after('clock_in_longitude');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_in_outside_location')) {
                $table->boolean('clock_in_outside_location')->default(false)->after('clock_in_distance_meters');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_in_outside_reason')) {
                $table->string('clock_in_outside_reason', 255)->nullable()->after('clock_in_outside_location');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_out_distance_meters')) {
                $table->decimal('clock_out_distance_meters', 10, 2)->nullable()->after('clock_out_longitude');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_out_outside_location')) {
                $table->boolean('clock_out_outside_location')->default(false)->after('clock_out_distance_meters');
            }
            if (!Schema::hasColumn('employee_attendances', 'clock_out_outside_reason')) {
                $table->string('clock_out_outside_reason', 255)->nullable()->after('clock_out_outside_location');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('employee_attendances')) {
            return;
        }

        Schema::table('employee_attendances', function (Blueprint $table) {
            foreach ([
                'clock_in_distance_meters',
                'clock_in_outside_location',
                'clock_in_outside_reason',
                'clock_out_distance_meters',
                'clock_out_outside_location',
                'clock_out_outside_reason',
            ] as $column) {
                if (Schema::hasColumn('employee_attendances', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('acs_device_parameters')) {
            // Deduplicate keeping highest id
            DB::statement("
                DELETE p1 FROM acs_device_parameters p1
                INNER JOIN acs_device_parameters p2 
                WHERE p1.id < p2.id 
                  AND p1.acs_device_id = p2.acs_device_id 
                  AND p1.name = p2.name
            ");

            Schema::table('acs_device_parameters', function (Blueprint $table) {
                // Ensure foreign key has standalone index first so composite index is not locked
                $table->index('acs_device_id');
                // Add unique constraint for upsert
                $table->unique(['acs_device_id', 'name'], 'acs_device_param_unique');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('acs_device_parameters')) {
            Schema::table('acs_device_parameters', function (Blueprint $table) {
                try {
                    $table->dropUnique('acs_device_param_unique');
                } catch (\Throwable) {}
            });
        }
    }
};

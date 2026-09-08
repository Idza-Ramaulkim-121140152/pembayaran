<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $ratioPortMap = [
            '1:2' => 2,
            '1:4' => 4,
            '1:8' => 8,
            '1:16' => 16,
            '1:32' => 32,
        ];

        foreach ($ratioPortMap as $ratio => $ports) {
            DB::table('odps')
                ->where('device_type', 'odp')
                ->where('rasio_distribusi', $ratio)
                ->update(['total_ports' => $ports]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};

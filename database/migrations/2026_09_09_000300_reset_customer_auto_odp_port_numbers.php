<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Reset artificial auto-assigned odp_port_number so ports start clean (kosong)
     * and customers must be explicitly mapped to ports.
     */
    public function up(): void
    {
        DB::table('customers')->update(['odp_port_number' => null]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};

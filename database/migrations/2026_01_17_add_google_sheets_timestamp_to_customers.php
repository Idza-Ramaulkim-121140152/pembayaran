<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Add google_sheets_timestamp column to track verified customers
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('google_sheets_timestamp')->nullable()->unique()->after('longitude');
            $table->index('google_sheets_timestamp');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['google_sheets_timestamp']);
            $table->dropColumn('google_sheets_timestamp');
        });
    }
};

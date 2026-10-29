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
        if (Schema::hasTable('area_outage_incidents') && !Schema::hasColumn('area_outage_incidents', 'ai_diagnostic')) {
            Schema::table('area_outage_incidents', function (Blueprint $table) {
                $table->json('ai_diagnostic')->nullable()->after('incident_notes');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('area_outage_incidents') && Schema::hasColumn('area_outage_incidents', 'ai_diagnostic')) {
            Schema::table('area_outage_incidents', function (Blueprint $table) {
                $table->dropColumn('ai_diagnostic');
            });
        }
    }
};

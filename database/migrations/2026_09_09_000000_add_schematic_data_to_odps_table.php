<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('odps', function (Blueprint $table) {
            if (!Schema::hasColumn('odps', 'schematic_data')) {
                $table->json('schematic_data')->nullable()->after('distribution_line');
            }
        });
    }

    public function down(): void
    {
        Schema::table('odps', function (Blueprint $table) {
            if (Schema::hasColumn('odps', 'schematic_data')) {
                $table->dropColumn('schematic_data');
            }
        });
    }
};

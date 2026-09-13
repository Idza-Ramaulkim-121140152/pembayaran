<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('olt_pon_ports')) {
            Schema::table('olt_pon_ports', function (Blueprint $table) {
                $table->decimal('tx_power_dbm', 6, 2)->nullable()->default(0.00)->change();
                $table->decimal('temperature', 6, 2)->nullable()->default(0.00)->change();
                $table->decimal('voltage', 6, 2)->nullable()->default(0.00)->change();
                $table->decimal('current_ma', 6, 2)->nullable()->default(0.00)->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('olt_pon_ports')) {
            Schema::table('olt_pon_ports', function (Blueprint $table) {
                $table->decimal('tx_power_dbm', 6, 2)->default(4.50)->change();
                $table->decimal('temperature', 6, 2)->default(42.50)->change();
                $table->decimal('voltage', 6, 2)->default(3.30)->change();
                $table->decimal('current_ma', 6, 2)->default(15.20)->change();
            });
        }
    }
};

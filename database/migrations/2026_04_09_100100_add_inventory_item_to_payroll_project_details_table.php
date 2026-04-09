<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_project_details', function (Blueprint $table) {
            $table->foreignId('inventory_item_id')
                ->nullable()
                ->after('deskripsi')
                ->constrained('inventory_items')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payroll_project_details', function (Blueprint $table) {
            $table->dropConstrainedForeignId('inventory_item_id');
        });
    }
};

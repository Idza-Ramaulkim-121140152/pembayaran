<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->foreignId('pengeluaran_id')->nullable()->after('notes')->constrained('pengeluarans')->nullOnDelete();
            $table->string('transaction_group_key', 100)->nullable()->after('pengeluaran_id');
            $table->index('transaction_group_key');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pengeluaran_id');
            $table->dropIndex(['transaction_group_key']);
            $table->dropColumn('transaction_group_key');
        });
    }
};

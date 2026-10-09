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
        Schema::table('invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('invoices', 'qris_payment_time')) {
                $table->dateTime('qris_payment_time')->nullable()->after('paid_at');
            }
            if (!Schema::hasColumn('invoices', 'qris_sender')) {
                $table->string('qris_sender', 100)->nullable()->after('qris_payment_time');
            }
            if (!Schema::hasColumn('invoices', 'qris_transaction_number')) {
                $table->string('qris_transaction_number', 150)->nullable()->after('qris_sender');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $columns = [];
            if (Schema::hasColumn('invoices', 'qris_payment_time')) {
                $columns[] = 'qris_payment_time';
            }
            if (Schema::hasColumn('invoices', 'qris_sender')) {
                $columns[] = 'qris_sender';
            }
            if (Schema::hasColumn('invoices', 'qris_transaction_number')) {
                $columns[] = 'qris_transaction_number';
            }
            if (!empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};

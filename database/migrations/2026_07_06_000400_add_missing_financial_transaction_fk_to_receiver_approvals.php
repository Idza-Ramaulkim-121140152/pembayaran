<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        if (!Schema::hasTable('payment_receiver_approval_requests') || !Schema::hasColumn('payment_receiver_approval_requests', 'financial_transaction_id')) {
            return;
        }

        $existingConstraint = DB::table('information_schema.REFERENTIAL_CONSTRAINTS')
            ->whereRaw('CONSTRAINT_SCHEMA = DATABASE()')
            ->where('TABLE_NAME', 'payment_receiver_approval_requests')
            ->where('CONSTRAINT_NAME', 'prar_ftx_fk')
            ->exists();

        if ($existingConstraint) {
            return;
        }

        Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
            $table->foreign('financial_transaction_id', 'prar_ftx_fk')
                ->references('id')
                ->on('financial_transactions')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (!in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        if (!Schema::hasTable('payment_receiver_approval_requests')) {
            return;
        }

        $existingConstraint = DB::table('information_schema.REFERENTIAL_CONSTRAINTS')
            ->whereRaw('CONSTRAINT_SCHEMA = DATABASE()')
            ->where('TABLE_NAME', 'payment_receiver_approval_requests')
            ->where('CONSTRAINT_NAME', 'prar_ftx_fk')
            ->exists();

        if (! $existingConstraint) {
            return;
        }

        Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
            $table->dropForeign('prar_ftx_fk');
        });
    }
};

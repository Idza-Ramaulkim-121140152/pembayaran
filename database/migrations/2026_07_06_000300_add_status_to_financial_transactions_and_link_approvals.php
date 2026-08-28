<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('financial_transactions') && !Schema::hasColumn('financial_transactions', 'status')) {
            Schema::table('financial_transactions', function (Blueprint $table) {
                $afterColumn = Schema::hasColumn('financial_transactions', 'meta')
                    ? 'meta'
                    : 'updated_by';

                $table->string('status', 30)->default('confirmed')->after($afterColumn);
                $table->index(['status', 'transaction_date'], 'financial_transactions_status_date_index');
            });

            DB::table('financial_transactions')
                ->whereNull('status')
                ->update(['status' => 'confirmed']);
        }

        if (Schema::hasTable('payment_receiver_approval_requests') && !Schema::hasColumn('payment_receiver_approval_requests', 'financial_transaction_id')) {
            Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
                $afterColumn = Schema::hasColumn('payment_receiver_approval_requests', 'invoice_id')
                    ? 'invoice_id'
                    : 'receiver_user_id';

                $table->foreignId('financial_transaction_id')
                    ->nullable()
                    ->after($afterColumn);

            });

            Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
                $table->foreign('financial_transaction_id', 'prar_ftx_fk')
                    ->references('id')
                    ->on('financial_transactions')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payment_receiver_approval_requests') && Schema::hasColumn('payment_receiver_approval_requests', 'financial_transaction_id')) {
            Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
                $table->dropForeign('prar_ftx_fk');
                $table->dropColumn('financial_transaction_id');
            });
        }

        if (Schema::hasTable('financial_transactions') && Schema::hasColumn('financial_transactions', 'status')) {
            Schema::table('financial_transactions', function (Blueprint $table) {
                $table->dropIndex('financial_transactions_status_date_index');
                $table->dropColumn('status');
            });
        }
    }
};

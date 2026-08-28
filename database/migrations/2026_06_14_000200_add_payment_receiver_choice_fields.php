<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'can_choose_payment_receiver')) {
            $afterColumn = Schema::hasColumn('users', 'can_choose_payment_mutation')
                ? 'can_choose_payment_mutation'
                : (Schema::hasColumn('users', 'can_edit_mutations') ? 'can_edit_mutations' : 'role');

            Schema::table('users', function (Blueprint $table) use ($afterColumn) {
                $table->boolean('can_choose_payment_receiver')->default(false)->after($afterColumn);
            });
        }

        if (Schema::hasTable('invoices') && !Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
            $afterColumn = Schema::hasColumn('invoices', 'include_in_mutation')
                ? 'include_in_mutation'
                : (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id') ? 'received_via_payment_receipt_option_id' : 'paid_at');

            Schema::table('invoices', function (Blueprint $table) use ($afterColumn) {
                $table->foreignId('payment_receiver_user_id')
                    ->nullable()
                    ->after($afterColumn)
                    ->constrained('users')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('invoices') && Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->dropConstrainedForeignId('payment_receiver_user_id');
            });
        }

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'can_choose_payment_receiver')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('can_choose_payment_receiver');
            });
        }
    }
};

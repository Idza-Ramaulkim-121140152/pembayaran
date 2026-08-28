<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'can_choose_payment_mutation')) {
            $afterColumn = Schema::hasColumn('users', 'can_edit_mutations')
                ? 'can_edit_mutations'
                : (Schema::hasColumn('users', 'can_confirm_payments') ? 'can_confirm_payments' : 'role');

            Schema::table('users', function (Blueprint $table) use ($afterColumn) {
                $table->boolean('can_choose_payment_mutation')->default(false)->after($afterColumn);
            });
        }

        if (Schema::hasTable('invoices') && !Schema::hasColumn('invoices', 'include_in_mutation')) {
            $afterColumn = Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id')
                ? 'received_via_payment_receipt_option_id'
                : (Schema::hasColumn('invoices', 'paid_at') ? 'paid_at' : 'status');

            Schema::table('invoices', function (Blueprint $table) use ($afterColumn) {
                $table->boolean('include_in_mutation')->default(true)->after($afterColumn);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('invoices') && Schema::hasColumn('invoices', 'include_in_mutation')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->dropColumn('include_in_mutation');
            });
        }

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'can_choose_payment_mutation')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('can_choose_payment_mutation');
            });
        }
    }
};

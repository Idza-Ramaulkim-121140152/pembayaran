<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('borrower_loan_payments')) {
            return;
        }

        Schema::table('borrower_loan_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('borrower_loan_payments', 'action_group_key')) {
                $table->string('action_group_key', 64)->nullable()->after('payment_date');
                $table->index('action_group_key', 'borrower_loan_payments_action_group_idx');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('borrower_loan_payments')) {
            return;
        }

        Schema::table('borrower_loan_payments', function (Blueprint $table) {
            if (Schema::hasColumn('borrower_loan_payments', 'action_group_key')) {
                $table->dropIndex('borrower_loan_payments_action_group_idx');
                $table->dropColumn('action_group_key');
            }
        });
    }
};

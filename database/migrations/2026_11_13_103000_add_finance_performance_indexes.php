<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('financial_transactions')) {
            try {
                Schema::table('financial_transactions', function (Blueprint $table) {
                    $table->index(['status', 'type', 'transaction_date'], 'ft_status_type_date_idx');
                });
            } catch (\Throwable) {
                // Index already exists
            }
        }

        if (Schema::hasTable('borrower_loans')) {
            try {
                Schema::table('borrower_loans', function (Blueprint $table) {
                    $table->index('status', 'bl_status_idx');
                });
            } catch (\Throwable) {
                // Index already exists
            }

            try {
                Schema::table('borrower_loans', function (Blueprint $table) {
                    $table->index('occurred_at', 'bl_occurred_at_idx');
                });
            } catch (\Throwable) {
                // Index already exists
            }
        }

        if (Schema::hasTable('borrower_loan_payments')) {
            try {
                Schema::table('borrower_loan_payments', function (Blueprint $table) {
                    $table->index('payment_date', 'blp_payment_date_idx');
                });
            } catch (\Throwable) {
                // Index already exists
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('financial_transactions')) {
            try {
                Schema::table('financial_transactions', function (Blueprint $table) {
                    $table->dropIndex('ft_status_type_date_idx');
                });
            } catch (\Throwable) {
            }
        }

        if (Schema::hasTable('borrower_loans')) {
            try {
                Schema::table('borrower_loans', function (Blueprint $table) {
                    $table->dropIndex('bl_status_idx');
                });
            } catch (\Throwable) {
            }

            try {
                Schema::table('borrower_loans', function (Blueprint $table) {
                    $table->dropIndex('bl_occurred_at_idx');
                });
            } catch (\Throwable) {
            }
        }

        if (Schema::hasTable('borrower_loan_payments')) {
            try {
                Schema::table('borrower_loan_payments', function (Blueprint $table) {
                    $table->dropIndex('blp_payment_date_idx');
                });
            } catch (\Throwable) {
            }
        }
    }
};

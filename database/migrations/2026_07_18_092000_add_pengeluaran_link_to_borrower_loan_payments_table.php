<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('borrower_loan_payments') || Schema::hasColumn('borrower_loan_payments', 'pengeluaran_id')) {
            return;
        }

        Schema::table('borrower_loan_payments', function (Blueprint $table) {
            $table->foreignId('pengeluaran_id')
                ->nullable()
                ->after('financial_transaction_id')
                ->constrained('pengeluarans')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('borrower_loan_payments') || !Schema::hasColumn('borrower_loan_payments', 'pengeluaran_id')) {
            return;
        }

        Schema::table('borrower_loan_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pengeluaran_id');
        });
    }
};

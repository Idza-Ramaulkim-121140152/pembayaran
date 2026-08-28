<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengeluarans', function (Blueprint $table) {
            if (!Schema::hasColumn('pengeluarans', 'payment_source')) {
                $table->string('payment_source', 50)->default('company_cash')->after('expense_category_id');
            }

            if (!Schema::hasColumn('pengeluarans', 'borrower_id')) {
                $table->foreignId('borrower_id')->nullable()->after('payment_source')->constrained('borrowers')->nullOnDelete();
            }

            if (!Schema::hasColumn('pengeluarans', 'borrower_loan_settlement_amount')) {
                $table->unsignedBigInteger('borrower_loan_settlement_amount')->default(0)->after('borrower_id');
            }

            if (!Schema::hasColumn('pengeluarans', 'borrower_loan_settlement_action_group_key')) {
                $table->string('borrower_loan_settlement_action_group_key')->nullable()->after('borrower_loan_settlement_amount');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pengeluarans', function (Blueprint $table) {
            if (Schema::hasColumn('pengeluarans', 'borrower_id')) {
                $table->dropConstrainedForeignId('borrower_id');
            }

            foreach ([
                'borrower_loan_settlement_action_group_key',
                'borrower_loan_settlement_amount',
                'payment_source',
            ] as $column) {
                if (Schema::hasColumn('pengeluarans', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

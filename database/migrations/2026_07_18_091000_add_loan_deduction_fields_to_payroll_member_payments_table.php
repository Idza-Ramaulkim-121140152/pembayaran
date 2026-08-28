<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_member_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('payroll_member_payments', 'loan_handling')) {
                $table->string('loan_handling', 50)->default('cash')->after('catatan');
            }

            if (!Schema::hasColumn('payroll_member_payments', 'gross_nominal')) {
                $table->decimal('gross_nominal', 12, 0)->default(0)->after('loan_handling');
            }

            if (!Schema::hasColumn('payroll_member_payments', 'loan_deduction_amount')) {
                $table->decimal('loan_deduction_amount', 12, 0)->default(0)->after('gross_nominal');
            }

            if (!Schema::hasColumn('payroll_member_payments', 'cash_paid_amount')) {
                $table->decimal('cash_paid_amount', 12, 0)->default(0)->after('loan_deduction_amount');
            }

            if (!Schema::hasColumn('payroll_member_payments', 'borrower_id')) {
                $table->foreignId('borrower_id')->nullable()->after('cash_paid_amount')->constrained('borrowers')->nullOnDelete();
            }

            if (!Schema::hasColumn('payroll_member_payments', 'borrower_loan_settlement_action_group_key')) {
                $table->string('borrower_loan_settlement_action_group_key')->nullable()->after('borrower_id');
            }
        });

        DB::table('payroll_member_payments')
            ->where('gross_nominal', 0)
            ->update([
                'gross_nominal' => DB::raw('nominal'),
                'cash_paid_amount' => DB::raw('nominal'),
            ]);
    }

    public function down(): void
    {
        Schema::table('payroll_member_payments', function (Blueprint $table) {
            if (Schema::hasColumn('payroll_member_payments', 'borrower_id')) {
                $table->dropConstrainedForeignId('borrower_id');
            }

            foreach ([
                'borrower_loan_settlement_action_group_key',
                'cash_paid_amount',
                'loan_deduction_amount',
                'gross_nominal',
                'loan_handling',
            ] as $column) {
                if (Schema::hasColumn('payroll_member_payments', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

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
            if (!Schema::hasColumn('invoices', 'qris_unique_code')) {
                $table->unsignedSmallInteger('qris_unique_code')->nullable()->after('amount');
            }
            if (!Schema::hasColumn('invoices', 'qris_expected_amount')) {
                $table->decimal('qris_expected_amount', 12, 2)->nullable()->index()->after('qris_unique_code');
            }
            if (!Schema::hasColumn('invoices', 'qris_expired_at')) {
                $table->dateTime('qris_expired_at')->nullable()->after('qris_expected_amount');
            }
            if (!Schema::hasColumn('invoices', 'qris_dynamic_payload')) {
                $table->text('qris_dynamic_payload')->nullable()->after('qris_expired_at');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('invoices', 'qris_unique_code')) $cols[] = 'qris_unique_code';
            if (Schema::hasColumn('invoices', 'qris_expected_amount')) $cols[] = 'qris_expected_amount';
            if (Schema::hasColumn('invoices', 'qris_expired_at')) $cols[] = 'qris_expired_at';
            if (Schema::hasColumn('invoices', 'qris_dynamic_payload')) $cols[] = 'qris_dynamic_payload';
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};

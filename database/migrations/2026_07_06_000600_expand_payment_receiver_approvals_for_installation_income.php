<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('payment_receiver_approval_requests')) {
            return;
        }

        Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
            if (Schema::hasColumn('payment_receiver_approval_requests', 'invoice_id')) {
                $table->foreignId('invoice_id')->nullable()->change();
            }

            if (!Schema::hasColumn('payment_receiver_approval_requests', 'customer_id')) {
                $table->foreignId('customer_id')->nullable()->after('invoice_id')->constrained('customers')->nullOnDelete();
            }

            if (!Schema::hasColumn('payment_receiver_approval_requests', 'source_type')) {
                $table->string('source_type', 100)->nullable()->after('customer_id');
            }

            if (!Schema::hasColumn('payment_receiver_approval_requests', 'source_id')) {
                $table->unsignedBigInteger('source_id')->nullable()->after('source_type');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('payment_receiver_approval_requests')) {
            return;
        }

        Schema::table('payment_receiver_approval_requests', function (Blueprint $table) {
            if (Schema::hasColumn('payment_receiver_approval_requests', 'source_id')) {
                $table->dropColumn('source_id');
            }

            if (Schema::hasColumn('payment_receiver_approval_requests', 'source_type')) {
                $table->dropColumn('source_type');
            }

            if (Schema::hasColumn('payment_receiver_approval_requests', 'customer_id')) {
                $table->dropConstrainedForeignId('customer_id');
            }
        });
    }
};

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
        Schema::table('customers', function (Blueprint $table) {
            $table->index('pppoe_username');
            $table->index('phone');
            $table->index('due_date');
            $table->index('is_active');
            $table->index('odp');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->index('status');
            $table->index('paid_at');
            $table->index('invoice_link');
        });

        Schema::table('complaints', function (Blueprint $table) {
            $table->index('status');
            $table->index('category');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['pppoe_username']);
            $table->dropIndex(['phone']);
            $table->dropIndex(['due_date']);
            $table->dropIndex(['is_active']);
            $table->dropIndex(['odp']);
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['paid_at']);
            $table->dropIndex(['invoice_link']);
        });

        Schema::table('complaints', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['category']);
        });
    }
};

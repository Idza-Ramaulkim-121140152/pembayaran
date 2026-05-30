<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customers') || Schema::hasColumn('customers', 'billing_auto_disabled')) {
            return;
        }

        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('billing_auto_disabled')
                ->default(false)
                ->after('is_active')
                ->index();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('customers') || !Schema::hasColumn('customers', 'billing_auto_disabled')) {
            return;
        }

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('billing_auto_disabled');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('monthly_budget_items', function (Blueprint $table) {
            $table->decimal('system_recommended_amount', 15, 2)->default(0)->after('target_amount');
            $table->decimal('final_active_amount', 15, 2)->default(0)->after('system_recommended_amount');
            $table->boolean('is_overridden')->default(false)->after('final_active_amount');
            $table->string('source', 32)->nullable()->after('is_overridden');
        });
    }

    public function down(): void
    {
        Schema::table('monthly_budget_items', function (Blueprint $table) {
            $table->dropColumn([
                'system_recommended_amount',
                'final_active_amount',
                'is_overridden',
                'source',
            ]);
        });
    }
};

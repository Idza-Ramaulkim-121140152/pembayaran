<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'is_service_isolated')) {
                $table->boolean('is_service_isolated')->default(false)->after('mikrotik_profile');
            }

            if (!Schema::hasColumn('customers', 'service_isolated_at')) {
                $table->timestamp('service_isolated_at')->nullable()->after('is_service_isolated');
            }

            if (!Schema::hasColumn('customers', 'service_isolated_by')) {
                $table->foreignId('service_isolated_by')->nullable()->after('service_isolated_at')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('customers', 'isolation_restore_profile')) {
                $table->string('isolation_restore_profile')->nullable()->after('service_isolated_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'service_isolated_by')) {
                $table->dropConstrainedForeignId('service_isolated_by');
            }

            if (Schema::hasColumn('customers', 'isolation_restore_profile')) {
                $table->dropColumn('isolation_restore_profile');
            }

            if (Schema::hasColumn('customers', 'service_isolated_at')) {
                $table->dropColumn('service_isolated_at');
            }

            if (Schema::hasColumn('customers', 'is_service_isolated')) {
                $table->dropColumn('is_service_isolated');
            }
        });
    }
};

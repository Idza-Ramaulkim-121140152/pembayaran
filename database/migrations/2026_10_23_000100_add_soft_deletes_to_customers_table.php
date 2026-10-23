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
            if (!Schema::hasColumn('customers', 'deleted_at')) {
                $table->softDeletes();
            }
            if (!Schema::hasColumn('customers', 'deleted_by_user_id')) {
                $table->foreignId('deleted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('customers', 'delete_reason')) {
                $table->text('delete_reason')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'deleted_by_user_id')) {
                $table->dropConstrainedForeignId('deleted_by_user_id');
            }
            if (Schema::hasColumn('customers', 'delete_reason')) {
                $table->dropColumn('delete_reason');
            }
            if (Schema::hasColumn('customers', 'deleted_at')) {
                $table->dropSoftDeletes();
            }
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('odp_id')->nullable()->after('odp')->constrained('odps')->nullOnDelete();
            $table->foreignId('package_id')->nullable()->after('package_type')->constrained('packages')->nullOnDelete();
            $table->index('odp_id');
            $table->index('package_id');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['odp_id']);
            $table->dropIndex(['package_id']);
            $table->dropConstrainedForeignId('odp_id');
            $table->dropConstrainedForeignId('package_id');
        });
    }
};

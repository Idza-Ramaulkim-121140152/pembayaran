<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('odps', function (Blueprint $table) {
            if (!Schema::hasColumn('odps', 'device_type')) {
                $table->enum('device_type', ['odp', 'odc'])->default('odp')->after('nama');
            }
            if (!Schema::hasColumn('odps', 'parent_type')) {
                $table->string('parent_type', 20)->default('pon')->after('pon_port_id'); // 'pon', 'odc', 'odp'
            }
            if (!Schema::hasColumn('odps', 'parent_id')) {
                $table->unsignedBigInteger('parent_id')->nullable()->after('parent_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('odps', function (Blueprint $table) {
            if (Schema::hasColumn('odps', 'device_type')) {
                $table->dropColumn('device_type');
            }
            if (Schema::hasColumn('odps', 'parent_type')) {
                $table->dropColumn('parent_type');
            }
            if (Schema::hasColumn('odps', 'parent_id')) {
                $table->dropColumn('parent_id');
            }
        });
    }
};

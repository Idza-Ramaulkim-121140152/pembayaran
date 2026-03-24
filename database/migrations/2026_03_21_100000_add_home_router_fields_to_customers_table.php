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
            $table->string('home_router_type')->nullable()->after('mikrotik_profile');
            $table->string('home_router_host')->nullable()->after('home_router_type');
            $table->unsignedInteger('home_router_port')->nullable()->after('home_router_host');
            $table->string('home_router_username')->nullable()->after('home_router_port');
            $table->text('home_router_password')->nullable()->after('home_router_username');
            $table->string('home_router_wan_interface')->nullable()->after('home_router_password');
            $table->boolean('home_router_monitoring_enabled')->default(false)->after('home_router_wan_interface');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'home_router_type',
                'home_router_host',
                'home_router_port',
                'home_router_username',
                'home_router_password',
                'home_router_wan_interface',
                'home_router_monitoring_enabled',
            ]);
        });
    }
};

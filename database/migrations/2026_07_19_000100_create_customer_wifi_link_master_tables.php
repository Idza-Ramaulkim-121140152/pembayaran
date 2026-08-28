<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customer_wifi_setting_links')) {
            Schema::create('customer_wifi_setting_links', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->text('url');
                $table->text('description')->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('customer_wifi_allowed_public_ips')) {
            Schema::create('customer_wifi_allowed_public_ips', function (Blueprint $table) {
                $table->id();
                $table->string('ip_address', 45)->unique();
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_wifi_allowed_public_ips');
        Schema::dropIfExists('customer_wifi_setting_links');
    }
};

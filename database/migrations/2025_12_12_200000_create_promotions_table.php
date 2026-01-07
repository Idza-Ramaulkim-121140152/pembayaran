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
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('image')->nullable(); // brosur image
            $table->string('banner_image')->nullable(); // hero banner
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->timestamps();
        });

        // Table for packages/pricing
        Schema::create('packages', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // Bronze, Gold, Platinum
            $table->string('speed'); // 10Mbps, 20Mbps, 30Mbps
            $table->decimal('price', 12, 0);
            $table->string('device_count')->nullable(); // 2-3 Perangkat
            $table->text('features')->nullable(); // JSON features
            $table->boolean('is_popular')->default(false);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // Company settings
        Schema::create('site_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('promotions');
        Schema::dropIfExists('packages');
        Schema::dropIfExists('site_settings');
    }
};

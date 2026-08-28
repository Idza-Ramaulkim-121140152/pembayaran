<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installation_pricings', function (Blueprint $table) {
            $table->id();
            $table->decimal('cable_price_per_meter', 15, 2)->default(1200);
            $table->decimal('connector_unit_price', 15, 2)->default(8000);
            $table->unsignedInteger('connector_quantity_default')->default(2);
            $table->decimal('router_unit_price', 15, 2)->default(225000);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index('created_at', 'inst_pricing_created_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('installation_pricings');
    }
};

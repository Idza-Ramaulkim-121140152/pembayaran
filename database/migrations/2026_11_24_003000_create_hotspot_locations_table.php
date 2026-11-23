<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('hotspot_locations')) {
            Schema::create('hotspot_locations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->nullable()->unique()->constrained('customers')->nullOnDelete();
                $table->string('label', 150)->nullable();
                $table->decimal('latitude', 10, 8);
                $table->decimal('longitude', 11, 8);
                $table->boolean('is_active')->default(true)->index();
                $table->string('notes', 255)->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hotspot_locations');
    }
};

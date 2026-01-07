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
        Schema::create('network_notices', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('message');
            $table->enum('type', ['gangguan', 'maintenance'])->default('gangguan');
            $table->enum('severity', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->boolean('is_mass')->default(false); // Gangguan massal
            $table->string('affected_area')->nullable(); // Area yang terdampak
            $table->string('affected_odp')->nullable(); // ODP yang terdampak (comma separated)
            $table->datetime('start_time')->nullable(); // Waktu mulai gangguan/maintenance
            $table->datetime('end_time')->nullable(); // Estimasi selesai
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('network_notices');
    }
};

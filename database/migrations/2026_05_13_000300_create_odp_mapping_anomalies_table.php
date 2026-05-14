<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('odp_mapping_anomalies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('legacy_odp_name')->nullable();
            $table->string('anomaly_type', 60)->index();
            $table->text('notes')->nullable();
            $table->boolean('resolved')->default(false);
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->index(['resolved', 'anomaly_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('odp_mapping_anomalies');
    }
};

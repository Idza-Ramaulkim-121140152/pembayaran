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
        Schema::create('dashboard_prediction_snapshots', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 100)->default('prediction_bundle');
            $table->dateTime('period_start')->nullable();
            $table->dateTime('period_end')->nullable();
            $table->json('payload_json')->nullable();
            $table->json('model_meta_json')->nullable();
            $table->dateTime('generated_at')->nullable();
            $table->dateTime('expires_at')->nullable();
            $table->enum('status', ['ready', 'failed', 'stale'])->default('ready');
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['scope', 'status', 'generated_at'], 'dashboard_prediction_scope_status_generated_idx');
            $table->index(['scope', 'expires_at'], 'dashboard_prediction_scope_expire_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dashboard_prediction_snapshots');
    }
};


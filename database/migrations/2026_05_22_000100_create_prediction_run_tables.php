<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prediction_runs', function (Blueprint $table) {
            $table->id();
            $table->date('run_date');
            $table->unsignedTinyInteger('horizon_days')->default(7);
            $table->string('status', 20)->default('ready');
            $table->string('model_version', 191)->nullable();
            $table->timestamp('model_trained_at')->nullable();
            $table->foreignId('snapshot_id')->nullable()->constrained('dashboard_prediction_snapshots')->nullOnDelete();
            $table->timestamp('evaluated_at')->nullable();
            $table->timestamps();

            $table->unique(['run_date', 'horizon_days'], 'prediction_runs_run_date_horizon_unique');
            $table->index(['status', 'run_date'], 'prediction_runs_status_run_date_idx');
        });

        Schema::create('prediction_run_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prediction_run_id')->constrained('prediction_runs')->cascadeOnDelete();
            $table->date('target_date');
            $table->string('domain', 50)->default('revenue_daily');
            $table->decimal('predicted_value', 18, 2)->default(0);
            $table->decimal('actual_value', 18, 2)->nullable();
            $table->timestamps();

            $table->unique(['prediction_run_id', 'target_date', 'domain'], 'prediction_run_items_unique_target_domain');
            $table->index(['domain', 'target_date'], 'prediction_run_items_domain_target_idx');
        });

        Schema::create('prediction_run_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prediction_run_id')->constrained('prediction_runs')->cascadeOnDelete();
            $table->string('metric', 50)->default('mape_7d');
            $table->decimal('metric_value', 10, 4)->nullable();
            $table->unsignedInteger('sample_size')->default(0);
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->string('retrain_status', 20)->default('pending');
            $table->timestamp('retrained_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['prediction_run_id', 'metric'], 'prediction_run_eval_run_metric_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prediction_run_evaluations');
        Schema::dropIfExists('prediction_run_items');
        Schema::dropIfExists('prediction_runs');
    }
};


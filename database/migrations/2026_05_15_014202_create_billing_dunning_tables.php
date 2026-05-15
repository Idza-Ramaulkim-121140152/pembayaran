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
        Schema::create('billing_dunning_configs', function (Blueprint $table) {
            $table->id();
            $table->boolean('is_active')->default(true);
            $table->string('timezone', 64)->default('Asia/Jakarta');
            $table->time('send_time')->default('08:00:00');
            $table->unsignedTinyInteger('max_retry')->default(2);
            $table->text('template_h_minus_7')->nullable();
            $table->text('template_h_minus_3')->nullable();
            $table->text('template_h_minus_1')->nullable();
            $table->text('template_h_plus_1')->nullable();
            $table->text('template_h_plus_3')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });

        Schema::create('billing_dunning_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->enum('wave', ['h_minus_7', 'h_minus_3', 'h_minus_1', 'h_plus_1', 'h_plus_3']);
            $table->date('scheduled_date');
            $table->enum('status', ['pending', 'sent', 'failed', 'skipped'])->default('pending');
            $table->unsignedTinyInteger('attempt_count')->default(0);
            $table->text('message')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique(['invoice_id', 'wave', 'scheduled_date'], 'billing_dunning_logs_unique_wave');
            $table->index(['wave', 'status', 'scheduled_date'], 'billing_dunning_logs_wave_status_date_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('billing_dunning_logs');
        Schema::dropIfExists('billing_dunning_configs');
    }
};

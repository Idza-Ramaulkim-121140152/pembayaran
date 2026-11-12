<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('qris_settlements')) {
            Schema::create('qris_settlements', function (Blueprint $table) {
                $table->id();
                $table->date('cycle_date')->index();
                $table->timestamp('settled_at')->index();
                $table->decimal('amount', 14, 2);
                $table->string('source', 30)->default('webhook')->index(); // webhook, manual
                $table->string('settlement_type', 30)->default('manual')->index(); // manual, auto
                $table->string('device_name', 100)->nullable();
                $table->string('raw_title', 255)->nullable();
                $table->text('raw_text')->nullable();
                $table->string('reference_code', 120)->nullable()->index();
                $table->string('fingerprint', 64)->nullable()->unique();
                $table->foreignId('qris_webhook_log_id')->nullable()->constrained('qris_webhook_logs')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('notes')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('qris_daily_reconciliations')) {
            Schema::create('qris_daily_reconciliations', function (Blueprint $table) {
                $table->id();
                $table->date('cycle_date')->unique();
                $table->timestamp('period_start');
                $table->timestamp('period_end');
                $table->decimal('system_qris_gross_amount', 14, 2)->default(0);
                $table->unsignedInteger('system_qris_count')->default(0);
                $table->decimal('expected_mdr_fee', 14, 2)->default(0);
                $table->decimal('expected_payout_fee', 14, 2)->default(0);
                $table->decimal('expected_net_amount', 14, 2)->default(0);
                $table->decimal('settled_amount', 14, 2)->default(0);
                $table->unsignedInteger('settlement_count')->default(0);
                $table->decimal('discrepancy_amount', 14, 2)->default(0);
                $table->string('status', 32)->default('pending')->index(); // no_activity, pending, matched, mismatch
                $table->timestamp('last_evaluated_at')->nullable();
                $table->timestamp('alert_sent_at')->nullable();
                $table->decimal('last_alert_discrepancy', 14, 2)->nullable();
                $table->unsignedInteger('alert_count')->default(0);
                $table->text('notes')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('qris_settlements');
        Schema::dropIfExists('qris_daily_reconciliations');
    }
};

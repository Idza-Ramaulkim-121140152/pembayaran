<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_network_notice_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('network_notice_id')->constrained('network_notices')->cascadeOnDelete();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('dismissed_at')->nullable();
            $table->timestamps();
            $table->unique(['customer_id', 'network_notice_id'], 'customer_notice_unique');
        });

        Schema::create('system_health_checks', function (Blueprint $table) {
            $table->id();
            $table->string('check_key')->unique();
            $table->string('label');
            $table->enum('status', ['healthy', 'degraded', 'down', 'unknown'])->default('unknown');
            $table->text('message')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('checked_at')->nullable();
            $table->timestamp('last_alerted_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'checked_at']);
        });

        Schema::create('scheduler_heartbeats', function (Blueprint $table) {
            $table->id();
            $table->string('command')->unique();
            $table->enum('status', ['healthy', 'degraded', 'down', 'unknown'])->default('unknown');
            $table->text('message')->nullable();
            $table->timestamp('last_started_at')->nullable();
            $table->timestamp('last_finished_at')->nullable();
            $table->unsignedInteger('last_duration_ms')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE network_incidents MODIFY status ENUM('open','acknowledged','escalated','mitigated','resolved') NOT NULL DEFAULT 'open'");
            DB::statement("ALTER TABLE incident_events MODIFY event_type ENUM('opened','resolved','manual_update','notice_published','acknowledged','escalated','mitigated','postmortem_added') NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("UPDATE network_incidents SET status = 'open' WHERE status IN ('acknowledged','escalated','mitigated')");
            DB::statement("DELETE FROM incident_events WHERE event_type IN ('acknowledged','escalated','mitigated','postmortem_added')");
            DB::statement("ALTER TABLE network_incidents MODIFY status ENUM('open','resolved') NOT NULL DEFAULT 'open'");
            DB::statement("ALTER TABLE incident_events MODIFY event_type ENUM('opened','resolved','manual_update','notice_published') NOT NULL");
        }

        Schema::dropIfExists('scheduler_heartbeats');
        Schema::dropIfExists('system_health_checks');
        Schema::dropIfExists('customer_network_notice_reads');
    }
};

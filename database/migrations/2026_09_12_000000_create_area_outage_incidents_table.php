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
        if (!Schema::hasTable('area_outage_incidents')) {
            Schema::create('area_outage_incidents', function (Blueprint $table) {
                $table->id();
                $table->string('token', 64)->unique();
                $table->string('area_code', 30)->index();
                $table->unsignedInteger('total_customers')->default(0);
                $table->unsignedInteger('active_customers_count')->default(0);
                $table->unsignedInteger('inactive_customers_count')->default(0);
                $table->longText('inactive_customers_data')->nullable(); // JSON
                $table->string('status', 30)->default('detected')->index(); // detected, marked_notice, notified_customers, resolved
                $table->string('incident_type', 50)->nullable(); // pemadaman_listrik, maintenance_jaringan
                $table->text('incident_notes')->nullable();
                $table->foreignId('network_notice_id')->nullable()->constrained('network_notices')->onDelete('set null');
                $table->text('alert_message_sent')->nullable();
                $table->string('target_group_id', 100)->nullable();
                $table->dateTime('alerted_at')->index();
                $table->dateTime('action_taken_at')->nullable();
                $table->foreignId('action_taken_by')->nullable()->constrained('users')->onDelete('set null');
                $table->dateTime('resolved_at')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('area_outage_incidents');
    }
};

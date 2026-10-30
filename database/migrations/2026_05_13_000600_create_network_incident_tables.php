<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('network_incidents', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->enum('severity', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->enum('status', ['open', 'resolved'])->default('open');
            $table->timestamp('started_at');
            $table->timestamp('resolved_at')->nullable();
            $table->enum('detected_by', ['auto', 'manual'])->default('auto');
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['status', 'severity']);
        });

        Schema::create('network_incident_odps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('network_incident_id')->constrained('network_incidents')->cascadeOnDelete();
            $table->foreignId('odp_id')->constrained('odps')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['network_incident_id', 'odp_id']);
        });

        Schema::create('incident_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('network_incident_id')->constrained('network_incidents')->cascadeOnDelete();
            $table->enum('event_type', ['opened', 'resolved', 'manual_update', 'notice_published']);
            $table->text('message')->nullable();
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('odp_health_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('odp_id')->constrained('odps')->cascadeOnDelete();
            $table->unsignedInteger('customer_count')->default(0);
            $table->unsignedInteger('online_count')->default(0);
            $table->unsignedInteger('offline_count')->default(0);
            $table->decimal('offline_ratio', 5, 2)->default(0);
            $table->timestamp('checked_at');
            $table->timestamps();
            $table->index(['odp_id', 'checked_at']);
        });

        Schema::table('network_notices', function (Blueprint $table) {
            $table->foreignId('network_incident_id')->nullable()->after('id')->constrained('network_incidents')->nullOnDelete();
            $table->index('network_incident_id');
        });
    }

    public function down(): void
    {
        Schema::table('network_notices', function (Blueprint $table) {
            $table->dropIndex(['network_incident_id']);
            $table->dropConstrainedForeignId('network_incident_id');
        });

        Schema::dropIfExists('odp_health_snapshots');
        Schema::dropIfExists('incident_events');
        Schema::dropIfExists('network_incident_odps');
        Schema::dropIfExists('network_incidents');
    }
};

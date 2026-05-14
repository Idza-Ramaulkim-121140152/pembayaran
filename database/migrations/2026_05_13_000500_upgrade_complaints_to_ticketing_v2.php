<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaint_cause_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('sla_policies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('priority', ['low', 'medium', 'high']);
            $table->foreignId('cause_category_id')->nullable()->constrained('complaint_cause_categories')->nullOnDelete();
            $table->unsignedInteger('first_response_minutes')->default(120);
            $table->unsignedInteger('resolution_minutes')->default(1440);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['priority', 'is_active']);
        });

        Schema::table('complaints', function (Blueprint $table) {
            $table->string('ticket_number')->nullable()->unique()->after('id');
            $table->timestamp('opened_at')->nullable()->after('created_at');
            $table->timestamp('first_response_at')->nullable()->after('opened_at');
            $table->timestamp('closed_at')->nullable()->after('resolved_at');
            $table->timestamp('sla_first_response_due_at')->nullable()->after('closed_at');
            $table->timestamp('sla_resolution_due_at')->nullable()->after('sla_first_response_due_at');
            $table->foreignId('root_cause_id')->nullable()->after('category')->constrained('complaint_cause_categories')->nullOnDelete();
            $table->foreignId('assigned_to')->nullable()->after('handled_by')->constrained('users')->nullOnDelete();
            $table->timestamp('last_activity_at')->nullable()->after('assigned_to');
        });

        Schema::create('complaint_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->enum('event_type', ['status_changed', 'comment', 'assignment_changed', 'sla_breached', 'root_cause_changed', 'reply']);
            $table->text('message')->nullable();
            $table->boolean('is_internal')->default(true);
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['complaint_id', 'event_type']);
        });

        DB::table('complaint_cause_categories')->insert([
            ['name' => 'ODP Down', 'slug' => 'odp-down', 'description' => 'Gangguan ODP/downstream massal', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Fiber Putus', 'slug' => 'fiber-putus', 'description' => 'Gangguan fisik kabel fiber', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Power', 'slug' => 'power', 'description' => 'Gangguan listrik/perangkat power', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Router Rumah', 'slug' => 'router-rumah', 'description' => 'Gangguan CPE/router sisi pelanggan', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Pembayaran', 'slug' => 'pembayaran', 'description' => 'Kendala administratif pembayaran', 'created_at' => now(), 'updated_at' => now()],
        ]);

        DB::table('sla_policies')->insert([
            ['name' => 'Default High', 'priority' => 'high', 'cause_category_id' => null, 'first_response_minutes' => 60, 'resolution_minutes' => 480, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Default Medium', 'priority' => 'medium', 'cause_category_id' => null, 'first_response_minutes' => 120, 'resolution_minutes' => 1440, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Default Low', 'priority' => 'low', 'cause_category_id' => null, 'first_response_minutes' => 240, 'resolution_minutes' => 2880, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_events');

        Schema::table('complaints', function (Blueprint $table) {
            $table->dropConstrainedForeignId('root_cause_id');
            $table->dropConstrainedForeignId('assigned_to');
            $table->dropColumn([
                'ticket_number',
                'opened_at',
                'first_response_at',
                'closed_at',
                'sla_first_response_due_at',
                'sla_resolution_due_at',
                'last_activity_at',
            ]);
        });

        Schema::dropIfExists('sla_policies');
        Schema::dropIfExists('complaint_cause_categories');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('installation_leads')) {
            Schema::create('installation_leads', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('phone')->nullable();
                $table->text('address')->nullable();
                $table->string('lead_source')->nullable();
                $table->decimal('latitude', 10, 8)->nullable();
                $table->decimal('longitude', 11, 8)->nullable();
                $table->enum('status', ['new', 'survey_scheduled', 'surveyed', 'work_order_created', 'closed'])->default('new');
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('installation_surveys')) {
            Schema::create('installation_surveys', function (Blueprint $table) {
                $table->id();
                $table->foreignId('lead_id')->constrained('installation_leads')->cascadeOnDelete();
                $table->foreignId('scheduled_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('scheduled_at')->nullable();
                $table->foreignId('recommended_odp_id')->nullable()->constrained('odps')->nullOnDelete();
                $table->text('result')->nullable();
                $table->text('notes')->nullable();
                $table->json('photos')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('installation_work_orders')) {
            Schema::create('installation_work_orders', function (Blueprint $table) {
                $table->id();
                $table->foreignId('lead_id')->nullable()->constrained('installation_leads')->nullOnDelete();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('odp_id')->nullable()->constrained('odps')->nullOnDelete();
                $table->timestamp('scheduled_at')->nullable();
                $table->enum('status', ['new', 'scheduled', 'in_progress', 'waiting_activation', 'completed', 'cancelled'])->default('new');
                $table->timestamp('completed_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->index(['status', 'scheduled_at']);
            });
        }

        if (!Schema::hasTable('installation_events')) {
            Schema::create('installation_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('installation_work_order_id')->constrained('installation_work_orders')->cascadeOnDelete();
                $table->string('event_type', 80);
                $table->text('message')->nullable();
                $table->json('meta')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('installation_checklists')) {
            Schema::create('installation_checklists', function (Blueprint $table) {
                $table->id();
                $table->foreignId('installation_work_order_id')->constrained('installation_work_orders')->cascadeOnDelete();
                $table->string('step_key', 80);
                $table->string('label');
                $table->boolean('is_required')->default(true);
                $table->boolean('is_completed')->default(false);
                $table->timestamp('completed_at')->nullable();
                $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
                $table->unique(['installation_work_order_id', 'step_key']);
            });
        }

        if (!Schema::hasTable('installation_documents')) {
            Schema::create('installation_documents', function (Blueprint $table) {
                $table->id();
                $table->foreignId('installation_work_order_id')->constrained('installation_work_orders')->cascadeOnDelete();
                $table->string('doc_type', 80);
                $table->string('file_path')->nullable();
                $table->text('notes')->nullable();
                $table->json('meta')->nullable();
                $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('installation_documents');
        Schema::dropIfExists('installation_checklists');
        Schema::dropIfExists('installation_events');
        Schema::dropIfExists('installation_work_orders');
        Schema::dropIfExists('installation_surveys');
        Schema::dropIfExists('installation_leads');
    }
};

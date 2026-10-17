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
        if (!Schema::hasTable('technician_jobs')) {
            Schema::create('technician_jobs', function (Blueprint $table) {
                $table->id();
                $table->string('job_number', 50)->unique();
                $table->string('type', 40); // gangguan_pelanggan, gangguan_massal, pemasangan_baru, lainnya
                $table->string('title');
                $table->text('description')->nullable();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->string('scope_type', 30)->nullable(); // single, mass_customers, wilayah, odp
                $table->string('wilayah_type', 30)->nullable(); // desa, dusun, kecamatan
                $table->unsignedBigInteger('wilayah_id')->nullable();
                $table->foreignId('odp_id')->nullable()->constrained('odps')->nullOnDelete();
                $table->string('status', 30)->default('active'); // active, completed, cancelled
                $table->string('priority', 20)->default('normal'); // low, normal, high, urgent
                $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
                $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('completed_at')->nullable();
                $table->string('completion_proof_url', 500)->nullable();
                $table->text('completion_notes')->nullable();
                $table->timestamp('scheduled_notify_at')->nullable();
                $table->timestamp('notified_at')->nullable();
                $table->timestamp('last_reminder_at')->nullable();
                $table->timestamps();

                $table->index(['status', 'created_at']);
                $table->index(['type', 'status']);
                $table->index('scheduled_notify_at');
            });
        }

        if (!Schema::hasTable('technician_job_assignments')) {
            Schema::create('technician_job_assignments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('job_id')->constrained('technician_jobs')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['job_id', 'user_id']);
            });
        }

        if (!Schema::hasTable('technician_job_customers')) {
            Schema::create('technician_job_customers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('job_id')->constrained('technician_jobs')->cascadeOnDelete();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['job_id', 'customer_id']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('technician_job_customers');
        Schema::dropIfExists('technician_job_assignments');
        Schema::dropIfExists('technician_jobs');
    }
};

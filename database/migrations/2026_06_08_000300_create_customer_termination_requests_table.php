<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_termination_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('finalized_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('document_number')->unique();
            $table->string('public_token', 80)->unique();
            $table->enum('status', ['draft', 'notified', 'final_verified', 'completed', 'cancelled'])->default('draft')->index();
            $table->date('planned_termination_date')->nullable();
            $table->text('reason')->nullable();
            $table->text('device_notes')->nullable();
            $table->text('return_instructions')->nullable();
            $table->string('pdf_path')->nullable();
            $table->string('pdf_hash', 128)->nullable();
            $table->json('customer_data')->nullable();
            $table->json('device_data')->nullable();
            $table->json('signature_meta')->nullable();
            $table->string('whatsapp_status')->nullable();
            $table->text('whatsapp_error')->nullable();
            $table->timestamp('whatsapp_sent_at')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('final_verified_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index(['completed_at', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_termination_requests');
    }
};

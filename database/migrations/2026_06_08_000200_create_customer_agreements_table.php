<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('agreement_number')->unique();
            $table->string('public_token', 80)->unique();
            $table->string('pdf_path')->nullable();
            $table->string('pdf_hash', 128)->nullable();
            $table->enum('status', ['generated', 'sent', 'failed'])->default('generated')->index();
            $table->json('customer_data')->nullable();
            $table->json('device_data')->nullable();
            $table->json('attachment_paths')->nullable();
            $table->json('signature_meta')->nullable();
            $table->string('whatsapp_status')->nullable();
            $table->text('whatsapp_error')->nullable();
            $table->timestamp('whatsapp_sent_at')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_agreements');
    }
};

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
        Schema::create('billing_payment_captures', function (Blueprint $table) {
            $table->id();
            $table->string('source', 50);
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->decimal('amount', 15, 2);
            $table->date('paid_date');
            $table->string('reference_code', 120)->nullable();
            $table->string('fingerprint', 191)->unique();
            $table->enum('match_status', ['pending', 'matched', 'needs_review', 'unmatched', 'approved', 'rejected'])->default('pending');
            $table->decimal('match_confidence', 5, 2)->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['source', 'paid_date']);
            $table->index(['match_status', 'paid_date']);
        });

        Schema::create('billing_payment_match_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('capture_id')->constrained('billing_payment_captures')->cascadeOnDelete();
            $table->foreignId('candidate_invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->decimal('score', 5, 2)->default(0);
            $table->string('reason', 255)->nullable();
            $table->enum('status', ['candidate', 'approved', 'rejected'])->default('candidate');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['capture_id', 'status']);
            $table->index(['candidate_invoice_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('billing_payment_match_reviews');
        Schema::dropIfExists('billing_payment_captures');
    }
};

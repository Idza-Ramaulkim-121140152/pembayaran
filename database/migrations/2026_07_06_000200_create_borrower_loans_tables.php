<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('borrower_loans')) {
            Schema::create('borrower_loans', function (Blueprint $table) {
                $table->id();
                $table->foreignId('borrower_id')->constrained('borrowers')->cascadeOnDelete();
                $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
                $table->foreignId('confirmed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('target_receiver_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('actual_receiver_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedBigInteger('amount')->default(0);
                $table->unsignedBigInteger('settled_amount')->default(0);
                $table->string('status', 50)->default('outstanding');
                $table->string('source', 100)->default('payment_receiver_mismatch');
                $table->timestamp('occurred_at')->nullable();
                $table->text('notes')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();

                $table->index(['borrower_id', 'status']);
                $table->index(['invoice_id', 'status']);
            });
        }

        if (!Schema::hasTable('borrower_loan_payments')) {
            Schema::create('borrower_loan_payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('borrower_loan_id')->constrained('borrower_loans')->cascadeOnDelete();
                $table->unsignedBigInteger('amount')->default(0);
                $table->date('payment_date');
                $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('financial_transaction_id')->nullable()->constrained('financial_transactions')->nullOnDelete();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('payment_receiver_approval_requests')) {
            Schema::create('payment_receiver_approval_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
                $table->foreignId('requested_by_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('receiver_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('borrower_id')->constrained('borrowers')->cascadeOnDelete();
                $table->unsignedBigInteger('amount')->default(0);
                $table->string('status', 50)->default('pending');
                $table->timestamp('decision_at')->nullable();
                $table->text('decision_note')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();

                $table->index(['receiver_user_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payment_receiver_approval_requests')) {
            Schema::drop('payment_receiver_approval_requests');
        }

        if (Schema::hasTable('borrower_loan_payments')) {
            Schema::drop('borrower_loan_payments');
        }

        if (Schema::hasTable('borrower_loans')) {
            Schema::drop('borrower_loans');
        }
    }
};

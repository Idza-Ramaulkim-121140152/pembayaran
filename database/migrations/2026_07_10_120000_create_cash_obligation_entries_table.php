<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_obligation_entries', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->unsignedBigInteger('amount');
            $table->date('due_date');
            $table->string('category', 50)->default('lainnya');
            $table->string('priority', 20)->default('medium');
            $table->string('status', 20)->default('pending');
            $table->text('notes')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['due_date', 'status']);
            $table->index(['category', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_obligation_entries');
    }
};

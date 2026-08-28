<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('monthly_budgets', function (Blueprint $table) {
            $table->id();
            $table->date('month')->unique();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('monthly_budget_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('monthly_budget_id')->constrained('monthly_budgets')->cascadeOnDelete();
            $table->string('category_key', 64);
            $table->decimal('target_amount', 15, 2)->default(0);
            $table->timestamps();

            $table->unique(['monthly_budget_id', 'category_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_budget_items');
        Schema::dropIfExists('monthly_budgets');
    }
};

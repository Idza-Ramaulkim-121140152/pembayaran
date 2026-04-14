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
        if (!Schema::hasTable('financial_planning_targets')) {
            Schema::create('financial_planning_targets', function (Blueprint $table) {
                $table->id();
                $table->enum('type', ['mandatory_expense', 'purchase_target']);
                $table->string('name', 120);
                $table->text('description')->nullable();
                $table->decimal('amount', 15, 2);

                $table->date('target_date')->nullable();
                $table->date('start_date')->nullable();
                $table->date('end_date')->nullable();

                $table->boolean('is_recurring_monthly')->default(false);
                $table->date('recurrence_until')->nullable();
                $table->boolean('recurrence_forever')->default(false);

                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('priority')->default(100);
                $table->json('meta')->nullable();

                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['type', 'is_active']);
                $table->index(['target_date']);
                $table->index(['start_date', 'end_date']);
                $table->index(['is_recurring_monthly', 'recurrence_until']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('financial_planning_targets');
    }
};

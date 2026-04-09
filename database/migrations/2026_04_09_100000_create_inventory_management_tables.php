<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_item_types', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->text('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_type_id')->constrained('inventory_item_types')->restrictOnDelete();
            $table->string('name');
            $table->string('unit', 50)->default('pcs');
            $table->decimal('default_length', 12, 2)->nullable();
            $table->string('length_unit', 50)->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['inventory_item_type_id', 'name']);
        });

        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->enum('movement_type', ['in', 'out']);
            $table->string('source', 50);
            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->decimal('total_amount', 15, 2)->nullable();
            $table->date('transaction_date');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->nullableMorphs('reference');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['inventory_item_id', 'transaction_date']);
            $table->index(['source', 'transaction_date']);
        });

        Schema::create('inventory_debts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->foreignId('inventory_movement_id')->constrained('inventory_movements')->cascadeOnDelete();
            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->decimal('original_amount', 15, 2)->nullable();
            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->enum('status', ['unpaid', 'partial', 'paid'])->default('unpaid');
            $table->date('due_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('inventory_debt_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_debt_id')->constrained('inventory_debts')->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->date('payment_date');
            $table->text('notes')->nullable();
            $table->foreignId('pengeluaran_id')->nullable()->constrained('pengeluarans')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_debt_payments');
        Schema::dropIfExists('inventory_debts');
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('inventory_items');
        Schema::dropIfExists('inventory_item_types');
    }
};

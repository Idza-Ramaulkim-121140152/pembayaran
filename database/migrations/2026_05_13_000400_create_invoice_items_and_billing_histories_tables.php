<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->enum('item_type', ['package', 'addon', 'discount', 'prorate', 'adjustment']);
            $table->string('description');
            $table->decimal('quantity', 12, 2)->default(1);
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->decimal('amount', 15, 2)->default(0);
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['invoice_id', 'item_type']);
        });

        Schema::create('customer_billing_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained('customers')->cascadeOnDelete();
            $table->enum('billing_cycle', ['monthly'])->default('monthly');
            $table->unsignedTinyInteger('billing_day')->nullable();
            $table->enum('prorate_policy', ['daily', 'half_month', 'none'])->default('daily');
            $table->json('addon_bundle')->nullable();
            $table->timestamps();
        });

        Schema::create('package_price_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('package_id')->constrained('packages')->cascadeOnDelete();
            $table->decimal('old_price', 15, 2)->nullable();
            $table->decimal('new_price', 15, 2);
            $table->date('effective_from');
            $table->text('reason')->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['package_id', 'effective_from']);
        });

        Schema::create('customer_package_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('old_package_id')->nullable()->constrained('packages')->nullOnDelete();
            $table->foreignId('new_package_id')->nullable()->constrained('packages')->nullOnDelete();
            $table->string('old_package_label')->nullable();
            $table->string('new_package_label')->nullable();
            $table->date('effective_from');
            $table->text('reason')->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['customer_id', 'effective_from']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_package_histories');
        Schema::dropIfExists('package_price_histories');
        Schema::dropIfExists('customer_billing_profiles');
        Schema::dropIfExists('invoice_items');
    }
};

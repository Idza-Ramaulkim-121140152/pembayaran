<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_installation_cost_snapshots', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('installation_pricing_id')->nullable();
            $table->date('installation_date')->nullable();
            $table->decimal('cable_used_meter', 15, 2)->default(0);
            $table->decimal('cable_price_per_meter', 15, 2)->default(0);
            $table->unsignedInteger('connector_quantity')->default(2);
            $table->decimal('connector_unit_price', 15, 2)->default(0);
            $table->boolean('router_used')->default(false);
            $table->decimal('router_unit_price', 15, 2)->default(0);
            $table->decimal('labor_fee', 15, 2)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->string('source', 64)->default('verification');
            $table->boolean('is_estimated')->default(false);
            $table->text('estimation_notes')->nullable();
            $table->json('meta')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->foreign('customer_id', 'cust_install_cost_customer_fk')
                ->references('id')
                ->on('customers')
                ->cascadeOnDelete();
            $table->foreign('installation_pricing_id', 'cust_install_cost_pricing_fk')
                ->references('id')
                ->on('installation_pricings')
                ->nullOnDelete();
            $table->foreign('created_by', 'cust_install_cost_created_by_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
            $table->foreign('updated_by', 'cust_install_cost_updated_by_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
            $table->unique('customer_id', 'cust_install_cost_customer_uidx');
            $table->index(['installation_date', 'is_estimated'], 'cust_install_cost_date_est_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_installation_cost_snapshots');
    }
};

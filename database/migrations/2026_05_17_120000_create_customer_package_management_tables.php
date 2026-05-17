<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_package_management_ignores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('status_code', 64);
            $table->text('reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->unique(['customer_id', 'status_code'], 'cpmi_customer_status_unique');
            $table->index('status_code');
            $table->index('expires_at');
        });

        Schema::create('customer_package_mapping_unresolveds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('pppoe_username', 128)->nullable();
            $table->string('mikrotik_profile', 255);
            $table->string('status', 32)->default('open');
            $table->text('reason')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index('mikrotik_profile');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_package_mapping_unresolveds');
        Schema::dropIfExists('customer_package_management_ignores');
    }
};


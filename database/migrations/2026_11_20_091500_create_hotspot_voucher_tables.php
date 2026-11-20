<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('hotspot_voucher_packages')) {
            Schema::create('hotspot_voucher_packages', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->string('code', 60)->unique();
                $table->decimal('price', 12, 2);
                $table->unsignedInteger('duration_minutes')->default(1440); // default 24 jam
                $table->unsignedTinyInteger('max_devices')->default(1);
                $table->string('rate_limit', 60)->nullable(); // opsional, misal 3M/3M
                $table->string('mikrotik_profile_name', 100)->nullable();
                $table->string('hotspot_server', 80)->default('hotspot1');
                $table->string('description', 255)->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('hotspot_voucher_orders')) {
            Schema::create('hotspot_voucher_orders', function (Blueprint $table) {
                $table->id();
                $table->string('order_code', 40)->unique();
                $table->foreignId('package_id')->constrained('hotspot_voucher_packages')->cascadeOnDelete();
                $table->string('customer_phone', 30)->index();
                $table->string('customer_name', 120)->nullable();
                $table->decimal('base_amount', 12, 2);
                $table->unsignedInteger('qris_unique_code')->nullable();
                $table->decimal('qris_expected_amount', 12, 2)->nullable()->index();
                $table->text('qris_dynamic_payload')->nullable();
                $table->dateTime('qris_expired_at')->nullable()->index();
                $table->string('status', 30)->default('pending')->index(); // pending, paid, expired, cancelled
                $table->dateTime('paid_at')->nullable();
                $table->string('voucher_code', 32)->nullable()->unique();
                $table->string('voucher_status', 30)->default('pending')->index(); // pending, unused, active, expired
                $table->dateTime('first_login_at')->nullable();
                $table->dateTime('expires_at')->nullable();
                $table->dateTime('mikrotik_synced_at')->nullable();
                $table->dateTime('whatsapp_sent_at')->nullable();
                $table->string('qris_sender', 120)->nullable();
                $table->string('qris_transaction_number', 120)->nullable();
                $table->string('login_url', 255)->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hotspot_voucher_orders');
        Schema::dropIfExists('hotspot_voucher_packages');
    }
};

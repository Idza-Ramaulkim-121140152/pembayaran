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
        if (!Schema::hasTable('qris_webhook_logs')) {
            Schema::create('qris_webhook_logs', function (Blueprint $table) {
                $table->id();
                $table->string('device_name', 100)->nullable()->index();
                $table->string('raw_title', 255)->nullable();
                $table->text('raw_text')->nullable();
                $table->decimal('extracted_amount', 12, 2)->nullable()->index();
                $table->string('status', 50)->default('received')->index(); // settled, duplicate_ignored, unmatched, invalid_secret
                $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('qris_webhook_logs');
    }
};

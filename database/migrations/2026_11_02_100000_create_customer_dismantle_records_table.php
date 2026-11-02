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
        if (!Schema::hasTable('customer_dismantle_records')) {
            Schema::create('customer_dismantle_records', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->string('status', 30)->default('siap_dicopot')->index(); // siap_dicopot, proses, sudah_dicopot, batal_bayar
                $table->foreignId('technician_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('technician_name')->nullable();
                $table->json('retrieved_items')->nullable(); // ['ont', 'adaptor', 'dropcore', 'patchcord']
                $table->string('dismantle_proof_photo')->nullable();
                $table->text('notes')->nullable();
                $table->timestamp('retrieved_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['customer_id', 'status']);
                $table->index('retrieved_at');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customer_dismantle_records');
    }
};

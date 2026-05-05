<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('billing_auto_invoice_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('segment', 20);
            $table->string('state', 20)->default('queued');
            $table->string('phase', 30)->default('queued');
            $table->json('customer_ids');
            $table->string('search_context', 100)->nullable();
            $table->json('summary')->nullable();
            $table->json('results')->nullable();
            $table->json('invalid_services')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['state', 'created_at']);
            $table->index(['requested_by_user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_auto_invoice_jobs');
    }
};


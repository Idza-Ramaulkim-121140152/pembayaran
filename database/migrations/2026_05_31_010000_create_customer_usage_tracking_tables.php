<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_usage_totals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->date('period_start_date');
            $table->unsignedBigInteger('download_bytes')->default(0);
            $table->unsignedBigInteger('upload_bytes')->default(0);
            $table->unsignedBigInteger('total_bytes')->default(0);
            $table->timestamp('last_snapshot_at')->nullable();
            $table->timestamps();

            $table->unique('customer_id');
            $table->index('period_start_date');
        });

        Schema::create('customer_usage_checkpoints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('session_key')->nullable();
            $table->unsignedBigInteger('last_bytes_in')->default(0);
            $table->unsignedBigInteger('last_bytes_out')->default(0);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique('customer_id');
            $table->index('session_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_usage_checkpoints');
        Schema::dropIfExists('customer_usage_totals');
    }
};

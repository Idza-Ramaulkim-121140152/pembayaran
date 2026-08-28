<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('borrowers')) {
            Schema::create('borrowers', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('phone', 50)->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('mapped_user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('payment_receiver_user_mappings')) {
            Schema::create('payment_receiver_user_mappings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('receiver_user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['user_id', 'receiver_user_id'], 'payment_receiver_user_unique');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payment_receiver_user_mappings')) {
            Schema::drop('payment_receiver_user_mappings');
        }

        if (Schema::hasTable('borrowers')) {
            Schema::drop('borrowers');
        }
    }
};

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
        Schema::create('payroll_member_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_member_id')->constrained()->cascadeOnDelete();
            $table->decimal('nominal', 12, 0);
            $table->text('catatan')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payroll_member_payments');
    }
};

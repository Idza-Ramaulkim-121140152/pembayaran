<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('event_type', 120)->index();
            $table->nullableMorphs('subject');
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_audit_logs');
    }
};

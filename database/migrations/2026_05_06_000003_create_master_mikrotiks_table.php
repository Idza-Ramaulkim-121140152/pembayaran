<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('master_mikrotiks', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('host');
            $table->unsignedInteger('port')->default(8728);
            $table->string('username');
            $table->text('password_encrypted');
            $table->boolean('is_active')->default(false)->index();
            $table->text('alert_recipients')->nullable();
            $table->enum('last_status', ['unknown', 'up', 'down'])->default('unknown');
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamp('last_alerted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['host', 'port']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('master_mikrotiks');
    }
};

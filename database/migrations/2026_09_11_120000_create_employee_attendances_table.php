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
        if (!Schema::hasTable('employee_attendances')) {
            Schema::create('employee_attendances', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->date('date')->index();
                $table->dateTime('clock_in_at')->nullable();
                $table->string('clock_in_photo')->nullable();
                $table->string('clock_in_status', 30)->default('on_time'); // 'on_time', 'late'
                $table->unsignedInteger('clock_in_late_minutes')->default(0);
                $table->text('clock_in_notes')->nullable();

                $table->dateTime('clock_out_at')->nullable();
                $table->string('clock_out_photo')->nullable();
                $table->text('clock_out_notes')->nullable();

                $table->unsignedInteger('work_duration_minutes')->nullable();
                $table->string('status', 30)->default('present'); // 'present', 'late', 'leave', 'sick', 'alpha'
                $table->float('smile_score_in')->nullable();
                $table->float('smile_score_out')->nullable();

                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'date'], 'emp_att_user_date_unique');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('employee_attendances');
    }
};

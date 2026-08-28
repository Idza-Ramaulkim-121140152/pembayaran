<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_reports', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('notes')->nullable();
            $table->date('starts_at')->nullable();
            $table->date('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('project_report_wilayah_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_report_id')->constrained('project_reports')->cascadeOnDelete();
            $table->string('wilayah_level', 20);
            $table->unsignedBigInteger('wilayah_id');
            $table->string('label_snapshot')->nullable();
            $table->timestamps();

            $table->unique(['project_report_id', 'wilayah_level', 'wilayah_id'], 'project_report_wilayah_unique');
        });

        Schema::create('project_report_customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_report_id')->constrained('project_reports')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['project_report_id', 'customer_id']);
        });

        Schema::create('project_report_payroll_projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_report_id')->constrained('project_reports')->cascadeOnDelete();
            $table->foreignId('payroll_project_id')->constrained('payroll_projects')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['project_report_id', 'payroll_project_id'], 'project_report_payroll_unique');
        });

        Schema::create('project_report_manual_expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_report_id')->constrained('project_reports')->cascadeOnDelete();
            $table->string('name');
            $table->string('category')->nullable();
            $table->decimal('quantity', 12, 2)->default(0);
            $table->string('unit', 50)->nullable();
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_report_manual_expenses');
        Schema::dropIfExists('project_report_payroll_projects');
        Schema::dropIfExists('project_report_customers');
        Schema::dropIfExists('project_report_wilayah_mappings');
        Schema::dropIfExists('project_reports');
    }
};

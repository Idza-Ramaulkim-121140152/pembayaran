<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('reconciliation_issues')) {
            Schema::create('reconciliation_issues', function (Blueprint $table) {
                $table->id();
                $table->string('issue_type', 80);
                $table->string('fingerprint', 191);
                $table->string('status', 20)->default('open');
                $table->string('severity', 20)->default('medium');
                $table->string('title');
                $table->text('description')->nullable();
                $table->string('primary_entity_type')->nullable();
                $table->unsignedBigInteger('primary_entity_id')->nullable();
                $table->timestamp('detected_at')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->timestamp('ignored_at')->nullable();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->string('resolution_action', 80)->nullable();
                $table->text('resolution_notes')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();

                $table->unique('fingerprint', 'recon_issues_fingerprint_uidx');
                $table->index(['status', 'severity'], 'recon_issues_status_severity_idx');
                $table->index(['issue_type', 'status'], 'recon_issues_type_status_idx');
                $table->index(['primary_entity_type', 'primary_entity_id'], 'recon_issues_entity_idx');
            });
        }

        $this->ensureIndexes();
    }

    public function down(): void
    {
        Schema::dropIfExists('reconciliation_issues');
    }

    private function ensureIndexes(): void
    {
        if (!Schema::hasTable('reconciliation_issues')) {
            return;
        }

        Schema::table('reconciliation_issues', function (Blueprint $table) {
            if (!Schema::hasIndex('reconciliation_issues', ['fingerprint'], 'unique')) {
                $table->unique('fingerprint', 'recon_issues_fingerprint_uidx');
            }

            if (!Schema::hasIndex('reconciliation_issues', ['status', 'severity'])) {
                $table->index(['status', 'severity'], 'recon_issues_status_severity_idx');
            }

            if (!Schema::hasIndex('reconciliation_issues', ['issue_type', 'status'])) {
                $table->index(['issue_type', 'status'], 'recon_issues_type_status_idx');
            }

            if (!Schema::hasIndex('reconciliation_issues', ['primary_entity_type', 'primary_entity_id'])) {
                $table->index(['primary_entity_type', 'primary_entity_id'], 'recon_issues_entity_idx');
            }
        });
    }
};

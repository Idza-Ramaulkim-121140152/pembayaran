<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('document_token', 80)->nullable()->unique()->after('invoice_link');
            $table->string('pdf_path')->nullable()->after('document_token');
            $table->string('pdf_hash', 128)->nullable()->after('pdf_path');
            $table->json('signature_meta')->nullable()->after('pdf_hash');
            $table->timestamp('document_generated_at')->nullable()->after('signature_meta');
            $table->string('whatsapp_status')->nullable()->after('document_generated_at');
            $table->text('whatsapp_error')->nullable()->after('whatsapp_status');
            $table->timestamp('whatsapp_sent_at')->nullable()->after('whatsapp_error');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropUnique(['document_token']);
            $table->dropColumn([
                'document_token',
                'pdf_path',
                'pdf_hash',
                'signature_meta',
                'document_generated_at',
                'whatsapp_status',
                'whatsapp_error',
                'whatsapp_sent_at',
            ]);
        });
    }
};

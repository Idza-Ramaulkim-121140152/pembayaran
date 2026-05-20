<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('invoices') || !Schema::hasColumn('invoices', 'bukti_pembayaran')) {
            return;
        }

        DB::table('invoices')
            ->whereNotNull('bukti_pembayaran')
            ->whereRaw("LOWER(TRIM(bukti_pembayaran)) IN ('', '0', '1', 'false', 'null')")
            ->update([
                'bukti_pembayaran' => null,
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Irreversible cleanup: nilai bukti_pembayaran invalid yang di-null-kan tidak dipulihkan.
    }
};

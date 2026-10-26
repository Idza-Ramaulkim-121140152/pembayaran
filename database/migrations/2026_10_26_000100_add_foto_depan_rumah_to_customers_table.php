<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'foto_depan_rumah')) {
                $table->text('foto_depan_rumah')->nullable()->after('address');
            }
        });

        // Backfill data foto_depan_rumah dari CustomerAgreement jika tersedia
        try {
            $agreements = DB::table('customer_agreements')
                ->whereNotNull('customer_data')
                ->select('customer_id', 'customer_data')
                ->get();

            foreach ($agreements as $agr) {
                $data = json_decode($agr->customer_data, true);
                $photoLinks = $data['photo_links'] ?? [];
                foreach ($photoLinks as $link) {
                    $label = strtolower(trim((string) ($link['label'] ?? '')));
                    $key = strtolower(trim((string) ($link['key'] ?? '')));
                    if ((str_contains($label, 'depan') || str_contains($key, 'front')) && !empty($link['url'])) {
                        DB::table('customers')
                            ->where('id', $agr->customer_id)
                            ->whereNull('foto_depan_rumah')
                            ->update(['foto_depan_rumah' => $link['url']]);
                        break;
                    }
                }
            }
        } catch (\Throwable) {}

        // Backfill data foto_depan_rumah dari CustomerProspect jika tersedia
        try {
            $prospects = DB::table('customer_prospects')
                ->whereNotNull('foto_depan_rumah')
                ->where('foto_depan_rumah', '!=', '')
                ->select('no_telp', 'nama', 'registration_no', 'foto_depan_rumah')
                ->get();

            foreach ($prospects as $prospect) {
                DB::table('customers')
                    ->where(function ($q) use ($prospect) {
                        $q->where('phone', $prospect->no_telp)
                          ->orWhere('name', $prospect->nama);
                    })
                    ->whereNull('foto_depan_rumah')
                    ->update(['foto_depan_rumah' => $prospect->foto_depan_rumah]);
            }
        } catch (\Throwable) {}
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'foto_depan_rumah')) {
                $table->dropColumn('foto_depan_rumah');
            }
        });
    }
};

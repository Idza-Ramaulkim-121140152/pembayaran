<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Unify KALTAMCJA (kode baru) dan CJA (kode lama) menjadi 1 kode area: CJA
        DB::table('customers')
            ->where('area_code', 'KALTAMCJA')
            ->update(['area_code' => 'CJA']);
    }

    public function down(): void
    {
        // Tidak perlu revert
    }
};

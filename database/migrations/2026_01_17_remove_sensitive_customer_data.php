<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * SECURITY UPDATE: Menghapus data sensitif pelanggan (NIK dan foto)
     * untuk meningkatkan keamanan dan compliance UU PDP
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            // Drop NIK column
            $table->dropColumn('nik');
            
            // Drop foto columns
            $table->dropColumn([
                'photo_front',
                'photo_modem',
                'photo_ktp',
                'photo_opm'
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('nik', 32)->nullable();
            $table->string('photo_front')->nullable();
            $table->string('photo_modem')->nullable();
            $table->string('photo_ktp')->nullable();
            $table->string('photo_opm')->nullable();
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('photo_ktp');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->dropColumn('maps');
        });
    }
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude']);
            $table->string('maps')->nullable()->after('photo_ktp');
        });
    }
};

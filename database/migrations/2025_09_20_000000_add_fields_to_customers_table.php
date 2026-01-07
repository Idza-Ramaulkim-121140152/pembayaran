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
        Schema::table('customers', function (Blueprint $table) {
            $table->date('activation_date')->nullable()->after('name');
            $table->string('nik')->nullable()->after('activation_date');
            $table->string('gender', 10)->nullable()->after('nik');
            $table->text('address')->nullable()->after('gender');
            $table->string('package_type')->nullable()->after('address');
            $table->string('custom_package')->nullable()->after('package_type');
            $table->string('photo_front')->nullable()->after('custom_package');
            $table->string('photo_modem')->nullable()->after('photo_front');
            $table->string('pppoe_username')->nullable()->after('photo_modem');
            $table->string('odp')->nullable()->after('pppoe_username');
            $table->string('installation_fee')->nullable()->after('odp');
            $table->string('photo_opm')->nullable()->after('installation_fee');
            $table->string('photo_ktp')->nullable()->after('photo_opm');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'activation_date', 'nik', 'gender', 'address', 'package_type', 'custom_package',
                'photo_front', 'photo_modem', 'pppoe_username', 'odp', 'installation_fee',
                'photo_opm', 'photo_ktp'
            ]);
        });
    }
};

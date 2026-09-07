<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 1. Master OLTs Table
        if (!Schema::hasTable('master_olts')) {
            Schema::create('master_olts', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('brand')->default('ZTE'); // ZTE, Huawei, VSOL, HSGQ, BDCOM, Generic
                $table->string('model')->nullable();
                $table->string('host')->default('10.10.10.1');
                $table->integer('snmp_port')->default(161);
                $table->string('snmp_community')->default('public');
                $table->string('snmp_version')->default('2c'); // 1, 2c, 3
                $table->integer('total_pon_ports')->default(8);
                $table->boolean('is_active')->default(true);
                $table->boolean('simulation_mode')->default(true); // true = simulated telemetry if OLT is unreachable
                $table->decimal('latitude', 10, 8)->nullable();
                $table->decimal('longitude', 11, 8)->nullable();
                $table->string('location_address')->nullable();
                $table->text('description')->nullable();
                $table->string('last_status')->default('online'); // online, degraded, offline, unreachable
                $table->timestamp('last_checked_at')->nullable();
                $table->json('telemetry_data')->nullable(); // CPU, RAM, Temp, Fan, Power voltage
                $table->timestamps();
            });
        }

        // 2. OLT PON Ports Table
        if (!Schema::hasTable('olt_pon_ports')) {
            Schema::create('olt_pon_ports', function (Blueprint $table) {
                $table->id();
                $table->foreignId('olt_id')->constrained('master_olts')->cascadeOnDelete();
                $table->integer('pon_index'); // 1..16
                $table->string('pon_identifier')->nullable(); // e.g. gpon-olt_1/1/1
                $table->string('name')->nullable(); // e.g. PON 1 (Jalur Barat)
                $table->string('admin_status')->default('up'); // up, down
                $table->string('oper_status')->default('up'); // up, down
                $table->decimal('tx_power_dbm', 6, 2)->default(4.50); // e.g. +4.50 dBm
                $table->decimal('temperature', 6, 2)->default(42.50); // Celcius
                $table->decimal('voltage', 6, 2)->default(3.30); // Volt
                $table->decimal('current_ma', 6, 2)->default(15.20); // mA
                $table->integer('total_registered_onu')->default(0);
                $table->integer('online_onu_count')->default(0);
                $table->integer('offline_onu_count')->default(0);
                $table->integer('max_onu_capacity')->default(64); // 64 or 128
                $table->text('description')->nullable();
                $table->timestamps();
            });
        }

        // 3. OLT ONUs (Optical Network Units / Customer ONTs) Table
        if (!Schema::hasTable('olt_onus')) {
            Schema::create('olt_onus', function (Blueprint $table) {
                $table->id();
                $table->foreignId('olt_id')->constrained('master_olts')->cascadeOnDelete();
                $table->foreignId('pon_port_id')->constrained('olt_pon_ports')->cascadeOnDelete();
                $table->integer('onu_index'); // 1..128
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->string('serial_number')->nullable()->index(); // e.g. ZTEGC1234567, HWTC...
                $table->string('mac_address')->nullable();
                $table->string('model')->nullable();
                $table->decimal('optical_rx_dbm', 6, 2)->default(-19.50); // received at ONT
                $table->decimal('optical_tx_dbm', 6, 2)->default(2.10); // transmitted by ONT
                $table->integer('distance_meter')->default(1200); // meters from OLT
                $table->string('status')->default('online'); // online, offline, los, dying_gasp
                $table->timestamp('last_online_at')->nullable();
                $table->timestamp('last_offline_at')->nullable();
                $table->string('offline_reason')->nullable();
                $table->timestamps();
            });
        }

        // 4. Update ODPs table with OLT, PON port, and distribution line info
        Schema::table('odps', function (Blueprint $table) {
            if (!Schema::hasColumn('odps', 'olt_id')) {
                $table->foreignId('olt_id')->nullable()->after('foto')->constrained('master_olts')->nullOnDelete();
            }
            if (!Schema::hasColumn('odps', 'pon_port_id')) {
                $table->foreignId('pon_port_id')->nullable()->after('olt_id')->constrained('olt_pon_ports')->nullOnDelete();
            }
            if (!Schema::hasColumn('odps', 'feeder_cable_info')) {
                $table->string('feeder_cable_info')->nullable()->after('pon_port_id'); // e.g. Core 1 / Tube Biru
            }
            if (!Schema::hasColumn('odps', 'distribution_line')) {
                $table->string('distribution_line')->nullable()->after('feeder_cable_info'); // e.g. Jalur Utama Ring 1
            }
            if (!Schema::hasColumn('odps', 'total_ports')) {
                $table->integer('total_ports')->default(8)->after('distribution_line'); // 8, 16, 24
            }
        });

        // 5. Update Customers table with OLT, PON, ODP Port mapping
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'olt_id')) {
                $table->foreignId('olt_id')->nullable()->after('odp_id')->constrained('master_olts')->nullOnDelete();
            }
            if (!Schema::hasColumn('customers', 'pon_port_id')) {
                $table->foreignId('pon_port_id')->nullable()->after('olt_id')->constrained('olt_pon_ports')->nullOnDelete();
            }
            if (!Schema::hasColumn('customers', 'olt_onu_id')) {
                $table->foreignId('olt_onu_id')->nullable()->after('pon_port_id')->constrained('olt_onus')->nullOnDelete();
            }
            if (!Schema::hasColumn('customers', 'odp_port_number')) {
                $table->integer('odp_port_number')->nullable()->after('olt_onu_id'); // 1..16
            }
            if (!Schema::hasColumn('customers', 'dropcore_cable_length_meters')) {
                $table->integer('dropcore_cable_length_meters')->nullable()->after('odp_port_number'); // meters
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'dropcore_cable_length_meters')) {
                $table->dropColumn('dropcore_cable_length_meters');
            }
            if (Schema::hasColumn('customers', 'odp_port_number')) {
                $table->dropColumn('odp_port_number');
            }
            if (Schema::hasColumn('customers', 'olt_onu_id')) {
                $table->dropForeign(['olt_onu_id']);
                $table->dropColumn('olt_onu_id');
            }
            if (Schema::hasColumn('customers', 'pon_port_id')) {
                $table->dropForeign(['pon_port_id']);
                $table->dropColumn('pon_port_id');
            }
            if (Schema::hasColumn('customers', 'olt_id')) {
                $table->dropForeign(['olt_id']);
                $table->dropColumn('olt_id');
            }
        });

        Schema::table('odps', function (Blueprint $table) {
            if (Schema::hasColumn('odps', 'total_ports')) {
                $table->dropColumn('total_ports');
            }
            if (Schema::hasColumn('odps', 'distribution_line')) {
                $table->dropColumn('distribution_line');
            }
            if (Schema::hasColumn('odps', 'feeder_cable_info')) {
                $table->dropColumn('feeder_cable_info');
            }
            if (Schema::hasColumn('odps', 'pon_port_id')) {
                $table->dropForeign(['pon_port_id']);
                $table->dropColumn('pon_port_id');
            }
            if (Schema::hasColumn('odps', 'olt_id')) {
                $table->dropForeign(['olt_id']);
                $table->dropColumn('olt_id');
            }
        });

        Schema::dropIfExists('olt_onus');
        Schema::dropIfExists('olt_pon_ports');
        Schema::dropIfExists('master_olts');
    }
};

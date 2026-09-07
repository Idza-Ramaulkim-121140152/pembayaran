<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 1. ACS Devices Table
        if (!Schema::hasTable('acs_devices')) {
            Schema::create('acs_devices', function (Blueprint $table) {
                $table->id();
                $table->string('device_id')->unique(); // e.g. VSOL-V2801RGW-12345B46415B3D00A or OUI-ProductClass-SerialNumber
                $table->string('manufacturer')->nullable(); // VSOL, ZTE, Huawei, FiberHome, etc.
                $table->string('oui')->nullable();
                $table->string('product_class')->nullable();
                $table->string('serial_number')->index()->nullable();
                $table->string('hardware_version')->nullable();
                $table->string('software_version')->nullable();
                $table->string('spec_version')->nullable(); // e.g. 1.0, 1.1, 1.2
                $table->string('provisioning_code')->nullable();

                // Telemetry & Hardware Stats
                $table->string('pon_mode')->nullable()->default('EPON'); // EPON, GPON, XPON
                $table->decimal('optical_rx_power', 6, 2)->nullable(); // in dBm, e.g. -22.50
                $table->decimal('optical_tx_power', 6, 2)->nullable(); // in dBm, e.g. +2.30
                $table->decimal('temperature', 5, 2)->nullable(); // in °C, e.g. 48.00
                $table->string('device_uptime')->nullable(); // Human readable or raw seconds
                $table->integer('device_uptime_seconds')->nullable();
                $table->string('ppp_uptime')->nullable();
                $table->integer('ppp_uptime_seconds')->nullable();

                // Network & PPPoE Credentials
                $table->string('pppoe_username')->index()->nullable();
                $table->string('pppoe_password')->nullable();
                $table->string('pppoe_ip')->nullable();
                $table->string('wan_ip')->nullable();
                $table->string('wan_mac')->nullable();
                $table->string('lan_mac')->nullable();
                $table->string('ip_address')->nullable(); // Inform source HTTP IP

                // Wireless / WiFi Telemetry
                $table->string('wifi_ssid')->nullable();
                $table->string('wifi_password')->nullable();
                $table->string('wifi_security_mode')->nullable();
                $table->boolean('wifi_enabled')->default(true);
                $table->string('wifi_ssid_5g')->nullable();
                $table->string('wifi_password_5g')->nullable();
                $table->boolean('wifi_enabled_5g')->default(false);
                $table->integer('wifi_clients_count')->default(0);

                // Connection Request (Wake Up / Summon)
                $table->string('connection_request_url')->nullable();
                $table->string('connection_request_user')->nullable();
                $table->string('connection_request_pass')->nullable();

                // System & Customer Link
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->string('matched_via')->nullable()->default('tr069'); // tr069, mikrotik_ip, mikrotik_mac, manual
                $table->boolean('is_online')->default(true);
                $table->timestamp('last_inform_at')->nullable();
                $table->timestamp('registered_at')->nullable();
                $table->json('vendor_raw_summary')->nullable(); // quick snapshot of custom parameters
                $table->timestamps();
            });
        }

        // 2. ACS Device Parameters Table (Deep KV parameter tree)
        if (!Schema::hasTable('acs_device_parameters')) {
            Schema::create('acs_device_parameters', function (Blueprint $table) {
                $table->id();
                $table->foreignId('acs_device_id')->constrained('acs_devices')->cascadeOnDelete();
                $table->string('name', 255)->index(); // TR-069 path
                $table->longText('value')->nullable();
                $table->string('type', 50)->default('xsd:string');
                $table->boolean('writable')->default(false);
                $table->timestamps();

                $table->index(['acs_device_id', 'name']);
            });
        }

        // 3. ACS Connected Hosts / WiFi Clients Table
        if (!Schema::hasTable('acs_connected_hosts')) {
            Schema::create('acs_connected_hosts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('acs_device_id')->constrained('acs_devices')->cascadeOnDelete();
                $table->string('mac_address')->index();
                $table->string('ip_address')->nullable();
                $table->string('hostname')->nullable();
                $table->string('interface_type')->default('Wi-Fi 2.4GHz'); // Wi-Fi 2.4GHz, Wi-Fi 5GHz, Ethernet
                $table->integer('rssi')->nullable(); // Signal strength dBm
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_seen_at')->nullable();
                $table->timestamps();

                $table->unique(['acs_device_id', 'mac_address']);
            });
        }

        // 4. ACS Tasks Queue Table (RPC Commands)
        if (!Schema::hasTable('acs_tasks')) {
            Schema::create('acs_tasks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('acs_device_id')->constrained('acs_devices')->cascadeOnDelete();
                $table->string('name'); // setParameterValues, getParameterValues, reboot, factoryReset, refreshObject
                $table->json('payload')->nullable(); // parameter list or command arguments
                $table->string('status')->default('pending')->index(); // pending, sent, completed, failed, canceled
                $table->integer('retries')->default(0);
                $table->text('error_message')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
            });
        }

        // 5. ACS Sessions Table
        if (!Schema::hasTable('acs_sessions')) {
            Schema::create('acs_sessions', function (Blueprint $table) {
                $table->string('session_id', 128)->primary();
                $table->foreignId('acs_device_id')->nullable()->constrained('acs_devices')->cascadeOnDelete();
                $table->string('state')->default('inform_received'); // inform_received, rpc_sent, closed
                $table->foreignId('current_task_id')->nullable()->constrained('acs_tasks')->nullOnDelete();
                $table->timestamp('last_activity_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
            });
        }

        // 6. ACS Logs Table (For CWMP audit & debugging)
        if (!Schema::hasTable('acs_logs')) {
            Schema::create('acs_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('acs_device_id')->nullable()->constrained('acs_devices')->nullOnDelete();
                $table->string('direction', 10)->default('in'); // in (CPE->ACS), out (ACS->CPE)
                $table->string('event_type')->nullable(); // Inform, SetParameterValues, etc.
                $table->longText('xml_content')->nullable();
                $table->string('ip_address')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('acs_logs');
        Schema::dropIfExists('acs_sessions');
        Schema::dropIfExists('acs_tasks');
        Schema::dropIfExists('acs_connected_hosts');
        Schema::dropIfExists('acs_device_parameters');
        Schema::dropIfExists('acs_devices');
    }
};

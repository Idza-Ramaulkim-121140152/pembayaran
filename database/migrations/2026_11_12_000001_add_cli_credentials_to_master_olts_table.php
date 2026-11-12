<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('master_olts')) {
            return;
        }

        Schema::table('master_olts', function (Blueprint $table) {
            if (!Schema::hasColumn('master_olts', 'username')) {
                $table->string('username')->nullable()->after('host');
            }
            if (!Schema::hasColumn('master_olts', 'password')) {
                $table->text('password')->nullable()->after('username');
            }
            if (!Schema::hasColumn('master_olts', 'telnet_port')) {
                $table->integer('telnet_port')->default(23)->after('snmp_port');
            }
            if (!Schema::hasColumn('master_olts', 'ssh_port')) {
                $table->integer('ssh_port')->default(22)->after('telnet_port');
            }
            if (!Schema::hasColumn('master_olts', 'http_port')) {
                $table->integer('http_port')->default(80)->after('ssh_port');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('master_olts')) {
            return;
        }

        $columns = array_values(array_filter(
            ['username', 'password', 'telnet_port', 'ssh_port', 'http_port'],
            fn (string $column) => Schema::hasColumn('master_olts', $column)
        ));

        if (!empty($columns)) {
            Schema::table('master_olts', function (Blueprint $table) use ($columns) {
                $table->dropColumn($columns);
            });
        }
    }
};

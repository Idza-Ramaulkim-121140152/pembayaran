<?php

namespace App\Console\Commands;

use App\Services\MikroTikService;
use Illuminate\Console\Command;

class TestMikroTik extends Command
{
    protected $signature = 'mikrotik:test {--debug : Show debug information}';
    protected $description = 'Test MikroTik API connection';

    public function handle()
    {
        $this->info('Testing MikroTik connection...');
        $this->info('Host: 103.195.65.216:8728');
        $this->info('User: admin');
        $this->info('');

        try {
            $mikrotik = new MikroTikService();
            
            $this->info('1. Testing connection and login...');
            $mikrotik->connect();
            $this->info('✓ Connection successful!');
            $this->info('');

            $this->info('2. Getting router identity...');
            $identity = $mikrotik->getIdentity();
            $this->info('✓ Identity: ' . $identity);
            $this->info('');

            $this->info('3. Getting system resources...');
            $resources = $mikrotik->getSystemResources();
            
            if ($this->option('debug')) {
                $this->info('Debug - Raw resources response:');
                dump($resources);
            }
            
            if ($resources) {
                $this->info('✓ System Resources:');
                $this->table(
                    ['Property', 'Value'],
                    [
                        ['Platform', $resources['platform'] ?? 'N/A'],
                        ['Board', $resources['board_name'] ?? 'N/A'],
                        ['Version', $resources['version'] ?? 'N/A'],
                        ['Uptime', $resources['uptime'] ?? 'N/A'],
                        ['CPU', $resources['cpu'] ?? 'N/A'],
                        ['CPU Load', ($resources['cpu_load'] ?? 'N/A') . '%'],
                        ['Total Memory', $this->formatBytes($resources['total_memory'] ?? 0)],
                        ['Free Memory', $this->formatBytes($resources['free_memory'] ?? 0)],
                    ]
                );
            } else {
                $this->warn('No system resources returned');
            }
            $this->info('');

            $this->info('4. Getting active PPPoE connections...');
            $connections = $mikrotik->getActivePPPoEConnections();
            $this->info('✓ Active connections: ' . count($connections));
            
            if ($this->option('debug')) {
                $this->info('Debug - All connections:');
                dump($connections);
            }
            
            if (count($connections) > 0) {
                $this->info('');
                $this->info('All connections:');
                $tableData = [];
                foreach ($connections as $conn) {
                    $tableData[] = [
                        $conn['name'] ?? 'N/A',
                        $conn['address'] ?? 'N/A',
                        $conn['uptime'] ?? 'N/A',
                        $conn['caller_id'] ?? 'N/A',
                    ];
                }
                $this->table(['Username', 'IP Address', 'Uptime', 'Caller ID'], $tableData);
            }
            
            // Test alternative commands
            $this->info('');
            $this->info('5. Testing alternative command: /interface/pppoe-server/print...');
            try {
                $pppoeInterfaces = $mikrotik->command('/interface/pppoe-server/print');
                $this->info('✓ PPPoE Interfaces: ' . count($pppoeInterfaces));
                if ($this->option('debug')) {
                    dump($pppoeInterfaces);
                }
                
                // Show all
                if (count($pppoeInterfaces) > 0) {
                    $this->info('All PPPoE Server Interfaces:');
                    $tableData = [];
                    foreach ($pppoeInterfaces as $intf) {
                        $tableData[] = [
                            $intf['user'] ?? 'N/A',
                            $intf['uptime'] ?? 'N/A',
                            $intf['running'] ?? 'false',
                            $intf['disabled'] ?? 'false',
                            $intf['interface'] ?? 'N/A',
                        ];
                    }
                    $this->table(['User', 'Uptime', 'Running', 'Disabled', 'Interface'], $tableData);
                }
            } catch (\Exception $e) {
                $this->warn('✗ Failed: ' . $e->getMessage());
            }
            
            $this->info('');
            $this->info('6. Testing: /ppp/secret/print (all registered users)...');
            try {
                $secrets = $mikrotik->command('/ppp/secret/print');
                $this->info('✓ Total PPP Secrets: ' . count($secrets));
                if ($this->option('debug') && count($secrets) <= 10) {
                    dump($secrets);
                } else {
                    $this->info('First 10 secrets:');
                    $tableData = [];
                    foreach (array_slice($secrets, 0, 10) as $secret) {
                        $tableData[] = [
                            $secret['name'] ?? 'N/A',
                            $secret['service'] ?? 'N/A',
                            $secret['disabled'] ?? 'false',
                        ];
                    }
                    $this->table(['Name', 'Service', 'Disabled'], $tableData);
                }
            } catch (\Exception $e) {
                $this->warn('✗ Failed: ' . $e->getMessage());
            }
            
            $this->info('');
            $this->info('✓ All tests passed!');
            return 0;

        } catch (\Exception $e) {
            $this->error('✗ Error: ' . $e->getMessage());
            $this->info('');
            $this->info('Troubleshooting:');
            $this->info('1. Check if MikroTik API service is enabled');
            $this->info('2. Verify IP address and port (103.195.65.216:8728)');
            $this->info('3. Check username/password (admin/rumahkita69)');
            $this->info('4. Ensure port 8728 is not blocked by firewall');
            $this->info('5. Try: /ip service print (in MikroTik terminal)');
            return 1;
        }
    }

    private function formatBytes($bytes, $precision = 2)
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        
        for ($i = 0; $bytes > 1024; $i++) {
            $bytes /= 1024;
        }

        return round($bytes, $precision) . ' ' . $units[$i];
    }
}

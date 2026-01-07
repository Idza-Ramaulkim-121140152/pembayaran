<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Services\MikroTikService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Exception;

class MonitoringController extends Controller
{
    private $mikrotik;

    public function __construct()
    {
        $this->mikrotik = new MikroTikService();
    }

    /**
     * Display monitoring dashboard
     */
    public function index()
    {
        try {
            // Get data with cache (5 minutes)
            $cacheKey = 'monitoring_data';
            $data = Cache::remember($cacheKey, 300, function () {
                return $this->getMonitoringData();
            });

            return view('monitoring.index', $data);
        } catch (Exception $e) {
            return view('monitoring.index', [
                'error' => $e->getMessage(),
                'serverInfo' => null,
                'activeConnections' => [],
                'summary' => null,
            ]);
        }
    }

    /**
     * Get monitoring data
     */
    private function getMonitoringData()
    {
        $serverInfo = null;
        $customerData = [];
        $errorMessage = null;

        try {
            // Get server information with new instance
            $mikrotikResources = new MikroTikService();
            $resources = $mikrotikResources->getSystemResources();
            $identity = $mikrotikResources->getIdentity();
            
            if ($resources) {
                // Calculate memory usage percentage
                $totalMemory = $resources['total_memory'] ?? 0;
                $freeMemory = $resources['free_memory'] ?? 0;
                $usedMemory = $totalMemory - $freeMemory;
                $memoryPercentage = $totalMemory > 0 ? round(($usedMemory / $totalMemory) * 100, 2) : 0;

                // Calculate HDD usage percentage
                $totalHdd = $resources['total_hdd_space'] ?? 0;
                $freeHdd = $resources['free_hdd_space'] ?? 0;
                $usedHdd = $totalHdd - $freeHdd;
                $hddPercentage = $totalHdd > 0 ? round(($usedHdd / $totalHdd) * 100, 2) : 0;

                $serverInfo = [
                    'identity' => $identity,
                    'platform' => $resources['platform'],
                    'board_name' => $resources['board_name'],
                    'version' => $resources['version'],
                    'uptime' => $resources['uptime'],
                    'cpu' => $resources['cpu'],
                    'cpu_count' => $resources['cpu_count'],
                    'cpu_load' => $resources['cpu_load'],
                    'total_memory' => $this->formatBytes($totalMemory),
                    'used_memory' => $this->formatBytes($usedMemory),
                    'free_memory' => $this->formatBytes($freeMemory),
                    'memory_percentage' => $memoryPercentage,
                    'total_hdd' => $this->formatBytes($totalHdd),
                    'used_hdd' => $this->formatBytes($usedHdd),
                    'free_hdd' => $this->formatBytes($freeHdd),
                    'hdd_percentage' => $hddPercentage,
                ];
            }
        } catch (Exception $e) {
            $errorMessage = "Server info error: " . $e->getMessage();
            \Log::error($errorMessage);
        }

        $activeConnections = [];
        try {
            // Get active PPPoE connections from MikroTik
            $mikrotikPPP = new MikroTikService();
            $activeConnections = $mikrotikPPP->getActivePPPoEConnections();
        } catch (Exception $e) {
            $errorMessage = ($errorMessage ? $errorMessage . " | " : "") . "PPPoE connections error: " . $e->getMessage();
            \Log::error("Failed to get PPPoE connections: " . $e->getMessage());
        }

        // Get customers from database and match with MikroTik
        $customerData = $this->getCustomersWithConnectionStatus($activeConnections);

        // Generate summary
        $summary = $this->generateSummary($customerData, $activeConnections);

        return [
            'error' => $errorMessage,
            'serverInfo' => $serverInfo,
            'customers' => $customerData,
            'summary' => $summary,
        ];
    }

    /**
     * Get server information
     */
    private function getServerInfo()
    {
        try {
            $resources = $this->mikrotik->getSystemResources();
            $identity = $this->mikrotik->getIdentity();

            if ($resources) {
                // Calculate memory usage percentage
                $totalMemory = $resources['total_memory'] ?? 0;
                $freeMemory = $resources['free_memory'] ?? 0;
                $usedMemory = $totalMemory - $freeMemory;
                $memoryPercentage = $totalMemory > 0 ? round(($usedMemory / $totalMemory) * 100, 2) : 0;

                // Calculate HDD usage percentage
                $totalHdd = $resources['total_hdd_space'] ?? 0;
                $freeHdd = $resources['free_hdd_space'] ?? 0;
                $usedHdd = $totalHdd - $freeHdd;
                $hddPercentage = $totalHdd > 0 ? round(($usedHdd / $totalHdd) * 100, 2) : 0;

                return [
                    'identity' => $identity,
                    'platform' => $resources['platform'],
                    'board_name' => $resources['board_name'],
                    'version' => $resources['version'],
                    'uptime' => $resources['uptime'],
                    'cpu' => $resources['cpu'],
                    'cpu_count' => $resources['cpu_count'],
                    'cpu_load' => $resources['cpu_load'],
                    'total_memory' => $this->formatBytes($totalMemory),
                    'used_memory' => $this->formatBytes($usedMemory),
                    'free_memory' => $this->formatBytes($freeMemory),
                    'memory_percentage' => $memoryPercentage,
                    'total_hdd' => $this->formatBytes($totalHdd),
                    'used_hdd' => $this->formatBytes($usedHdd),
                    'free_hdd' => $this->formatBytes($freeHdd),
                    'hdd_percentage' => $hddPercentage,
                ];
            }

            return null;
        } catch (Exception $e) {
            // Log error but don't throw - return null to show connection failed
            \Log::error('MikroTik Server Info Error: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Get customers from database and match with MikroTik connections
     */
    private function getCustomersWithConnectionStatus($activeConnections)
    {
        // Create lookup array for active connections (pppoe_username => connection data)
        $connectionMap = [];
        foreach ($activeConnections as $connection) {
            $connectionMap[$connection['name']] = $connection;
        }

        // Get all active customers from database
        $customers = Customer::where('is_active', true)
            ->whereNotNull('pppoe_username')
            ->get();

        $result = [];
        foreach ($customers as $customer) {
            $isOnline = isset($connectionMap[$customer->pppoe_username]);
            $connection = $isOnline ? $connectionMap[$customer->pppoe_username] : null;

            $result[] = [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'customer_phone' => $customer->phone,
                'customer_address' => $customer->address,
                'package_type' => $customer->package_type,
                'is_active' => $customer->is_active,
                'is_online' => $isOnline,
                // Data from MikroTik (if online)
                'ip_address' => $isOnline ? ($connection['address'] ?? 'N/A') : '-',
                'caller_id' => $isOnline ? ($connection['caller_id'] ?? 'N/A') : '-',
                'uptime' => $isOnline ? ($connection['uptime'] ?? 'N/A') : '-',
                'service' => $isOnline ? ($connection['service'] ?? 'pppoe') : '-',
            ];
        }

        return $result;
    }

    /**
     * Match active connections with database (OLD METHOD - DEPRECATED)
     */
    private function matchConnectionsWithDatabase($connections)
    {
        $matched = [];

        foreach ($connections as $connection) {
            $username = $connection['name'];
            
            // Find customer in database by pppoe_username
            $customer = Customer::where('pppoe_username', $username)->first();

            $matched[] = [
                'pppoe_username' => $username,
                'service' => $connection['service'],
                'caller_id' => $connection['caller_id'],
                'address' => $connection['address'],
                'uptime' => $connection['uptime'],
                'in_database' => $customer ? true : false,
                'customer_name' => $customer ? $customer->name : '-',
                'customer_phone' => $customer ? $customer->phone : '-',
                'customer_address' => $customer ? $customer->address : '-',
                'package_type' => $customer ? $customer->package_type : '-',
                'is_active' => $customer ? $customer->is_active : false,
                'customer_id' => $customer ? $customer->id : null,
            ];
        }

        return $matched;
    }

    /**
     * Generate summary statistics
     */
    private function generateSummary($customerData, $activeConnections)
    {
        $totalCustomers = count($customerData);
        $onlineCustomers = collect($customerData)->where('is_online', true)->count();
        $offlineCustomers = $totalCustomers - $onlineCustomers;
        
        // Total koneksi dari MikroTik
        $totalMikroTikConnections = count($activeConnections);
        
        // Koneksi MikroTik yang ada di database
        $mikrotikUsernames = collect($activeConnections)->pluck('name')->toArray();
        $matchedConnections = Customer::whereIn('pppoe_username', $mikrotikUsernames)->count();
        
        // Koneksi MikroTik yang tidak ada di database
        $unmatchedConnections = $totalMikroTikConnections - $matchedConnections;
        
        // Total customers di database
        $totalCustomersDb = Customer::count();
        $activeCustomersDb = Customer::where('is_active', true)->count();
        $inactiveCustomersDb = Customer::where('is_active', false)->count();

        return [
            // Database perspective (main data source)
            'total_customers' => $totalCustomers, // Customer aktif dengan pppoe_username
            'online_customers' => $onlineCustomers, // Customer online di MikroTik
            'offline_customers' => $offlineCustomers, // Customer tidak terkoneksi ke MikroTik
            'online_percentage' => $totalCustomers > 0 ? round(($onlineCustomers / $totalCustomers) * 100, 2) : 0,
            
            // MikroTik perspective
            'total_mikrotik_connections' => $totalMikroTikConnections,
            'matched_connections' => $matchedConnections,
            'unmatched_connections' => $unmatchedConnections,
            
            // Database stats
            'total_customers_db' => $totalCustomersDb,
            'active_customers_db' => $activeCustomersDb,
            'inactive_customers_db' => $inactiveCustomersDb,
        ];
    }

    /**
     * Format bytes to human readable
     */
    private function formatBytes($bytes, $precision = 2)
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        
        for ($i = 0; $bytes > 1024; $i++) {
            $bytes /= 1024;
        }

        return round($bytes, $precision) . ' ' . $units[$i];
    }

    /**
     * Refresh monitoring data (clear cache)
     */
    public function refresh()
    {
        Cache::forget('monitoring_data');
        return redirect()->route('monitoring.index')->with('success', 'Data monitoring berhasil diperbarui');
    }

    /**
     * API endpoint for AJAX refresh
     */
    public function getData()
    {
        try {
            $data = $this->getMonitoringData();
            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get detailed connection info
     */
    public function connectionDetails($username)
    {
        try {
            $connections = $this->mikrotik->getActivePPPoEConnections();
            $connection = collect($connections)->firstWhere('name', $username);

            if (!$connection) {
                return response()->json([
                    'success' => false,
                    'error' => 'Connection not found',
                ], 404);
            }

            $customer = Customer::where('pppoe_username', $username)->first();

            return response()->json([
                'success' => true,
                'connection' => $connection,
                'customer' => $customer,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}

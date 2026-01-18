<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Odp;
use App\Services\MikroTikService;
use Illuminate\Http\Request;

class MonitoringMapsController extends Controller
{
    public function getMapData()
    {
        try {
            // Get customers with coordinates
            $customers = Customer::whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->where('is_active', true)
                ->select([
                    'id',
                    'name',
                    'address',
                    'phone',
                    'pppoe_username',
                    'package_type',
                    'odp',
                    'latitude',
                    'longitude'
                ])
                ->get();

            // Get ODPs with coordinates and customer count
            $odps = Odp::whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->withCount('customers')
                ->get();

            // Check online status from MikroTik
            $mikrotik = new MikroTikService();
            try {
                $mikrotik->connect();
                $activeUsers = $mikrotik->getActivePPPoEConnections();
                $mikrotik->disconnect();

                // Map active users by username
                $activeUsernames = [];
                $activeUsersData = [];
                foreach ($activeUsers as $user) {
                    $username = $user['name'] ?? '';
                    $activeUsernames[] = $username;
                    $activeUsersData[$username] = [
                        'ip' => $user['address'] ?? null,
                        'uptime' => $user['uptime'] ?? null,
                    ];
                }

                // Add online status and IP to customers
                $customers = $customers->map(function ($customer) use ($activeUsernames, $activeUsersData) {
                    $isOnline = in_array($customer->pppoe_username, $activeUsernames);
                    $customer->is_online = $isOnline;
                    
                    if ($isOnline && isset($activeUsersData[$customer->pppoe_username])) {
                        $customer->ip_address = $activeUsersData[$customer->pppoe_username]['ip'];
                        $customer->uptime = $activeUsersData[$customer->pppoe_username]['uptime'];
                    } else {
                        $customer->ip_address = null;
                        $customer->uptime = null;
                    }

                    return $customer;
                });
            } catch (\Exception $e) {
                // If MikroTik connection fails, set all as offline
                \Log::warning('MikroTik connection failed in MonitoringMaps: ' . $e->getMessage());
                $customers = $customers->map(function ($customer) {
                    $customer->is_online = false;
                    $customer->ip_address = null;
                    $customer->uptime = null;
                    return $customer;
                });
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'customers' => $customers,
                    'odps' => $odps
                ]
            ]);
        } catch (\Exception $e) {
            \Log::error('MonitoringMaps error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan saat memuat data peta'
            ], 500);
        }
    }
}

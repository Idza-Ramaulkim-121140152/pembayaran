<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Odp;
use App\Services\MikroTikService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class MonitoringMapsController extends Controller
{
    public function getMapData()
    {
        try {
            // Get customers with coordinates
            $customers = Customer::whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->select([
                    'id',
                    'name',
                    'address',
                    'phone',
                    'pppoe_username',
                    'package_type',
                    'odp',
                    'due_date',
                    'latitude',
                    'longitude'
                ])
                ->get();

            // Get ODPs with coordinates and customer count
            $odps = Odp::whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->withCount('customers')
                ->get();

            $isolatedUsernameMap = [];
            $today = Carbon::today()->startOfDay();

            // Check online and isolated status from MikroTik
            $mikrotik = new MikroTikService();
            try {
                $activeUsers = $mikrotik->getActivePPPoEConnections();
                $isolatedSecrets = $mikrotik->getIsolatedSecrets();

                // Map active users by username
                $activeUsernames = [];
                $activeUsersData = [];
                foreach ($activeUsers as $user) {
                    $username = strtolower(trim((string) ($user['name'] ?? '')));
                    if ($username === '') {
                        continue;
                    }
                    $activeUsernames[] = $username;
                    $activeUsersData[$username] = [
                        'ip' => $user['address'] ?? null,
                        'uptime' => $user['uptime'] ?? null,
                    ];
                }

                foreach ($isolatedSecrets as $secret) {
                    $username = strtolower(trim((string) ($secret['name'] ?? '')));
                    if ($username !== '') {
                        $isolatedUsernameMap[$username] = true;
                    }
                }

                // Add service status and online status to customers
                $customers = $customers->map(function ($customer) use ($activeUsernames, $activeUsersData) {
                    $normalizedUsername = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                    $isOnline = in_array($normalizedUsername, $activeUsernames);
                    $customer->is_online = $isOnline;
                    
                    if ($isOnline && isset($activeUsersData[$normalizedUsername])) {
                        $customer->ip_address = $activeUsersData[$normalizedUsername]['ip'];
                        $customer->uptime = $activeUsersData[$normalizedUsername]['uptime'];
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

            // Apply customer service activity rule
            $customers = $customers
                ->map(function ($customer) use ($today, $isolatedUsernameMap) {
                    $normalizedUsername = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                    $isOverdue = $customer->due_date
                        ? Carbon::parse($customer->due_date)->startOfDay()->lt($today)
                        : false;
                    $isIsolated = $normalizedUsername !== '' && isset($isolatedUsernameMap[$normalizedUsername]);
                    $isServiceInactive = $isOverdue || $isIsolated;

                    $customer->is_service_overdue = $isOverdue;
                    $customer->is_service_isolated = $isIsolated;
                    $customer->is_service_active = !$isServiceInactive;

                    return $customer;
                })
                ->filter(function ($customer) {
                    return (bool) ($customer->is_service_active ?? false);
                })
                ->values();

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

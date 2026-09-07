<?php

namespace App\Http\Controllers\Acs;

use App\Http\Controllers\Controller;
use App\Models\AcsConnectedHost;
use App\Models\AcsDevice;
use App\Models\AcsDeviceParameter;
use App\Models\AcsTask;
use App\Models\Customer;
use App\Models\Package;
use App\Services\Acs\AcsTaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AcsDashboardController extends Controller
{
    public function __construct(
        protected AcsTaskService $taskService
    ) {
    }

    /**
     * Get summary list of all devices in Native ACS
     */
    public function devices(Request $request): JsonResponse
    {
        $query = AcsDevice::query()->with([
            'customer.package:id,name,speed,price,device_count',
            'connectedHosts',
        ]);

        // Search filter
        if ($request->filled('search')) {
            $s = trim((string) $request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('device_id', 'like', "%{$s}%")
                    ->orWhere('serial_number', 'like', "%{$s}%")
                    ->orWhere('pppoe_username', 'like', "%{$s}%")
                    ->orWhere('ip_address', 'like', "%{$s}%")
                    ->orWhere('wan_ip', 'like', "%{$s}%")
                    ->orWhere('wifi_ssid', 'like', "%{$s}%")
                    ->orWhereHas('customer', function ($cq) use ($s) {
                        $cq->where('name', 'like', "%{$s}%")
                            ->orWhere('phone', 'like', "%{$s}%");
                    });
            });
        }

        // Status filter
        if ($request->filled('status')) {
            $status = $request->query('status');
            if ($status === 'online') {
                $query->where('last_inform_at', '>=', now()->subMinutes(15));
            } elseif ($status === 'offline') {
                $query->where(function ($q) {
                    $q->whereNull('last_inform_at')
                        ->orWhere('last_inform_at', '<', now()->subMinutes(15));
                });
            } elseif ($status === 'unassigned') {
                $query->whereNull('customer_id');
            } elseif ($status === 'critical_rx') {
                $query->where('optical_rx_power', '<', -27.0);
            }
        }

        $devices = $query->orderByDesc('last_inform_at')->get();

        // Compute real-time stats
        $totalDevs = AcsDevice::count();
        $onlineDevs = AcsDevice::where('last_inform_at', '>=', now()->subMinutes(15))->count();
        $offlineDevs = $totalDevs - $onlineDevs;
        $unassignedDevs = AcsDevice::whereNull('customer_id')->count();
        $criticalRxCount = AcsDevice::where('optical_rx_power', '<', -27.0)->count();
        $warningRxCount = AcsDevice::whereBetween('optical_rx_power', [-27.0, -24.0])->count();
        $totalConnectedClients = AcsDevice::where('last_inform_at', '>=', now()->subMinutes(15))->sum('wifi_clients_count');

        $packages = Package::query()->get(['id', 'name', 'speed', 'price', 'device_count']);

        $formattedList = $devices->map(function (AcsDevice $d) {
            $isOnline = $d->last_inform_at && $d->last_inform_at->greaterThanOrEqualTo(now()->subMinutes(15));
            $cust = $d->customer;
            $pkg = $cust?->package;
            $maxDevs = $pkg && $pkg->device_count > 0 ? (int) $pkg->device_count : null;
            $clients = (int) $d->wifi_clients_count;

            $capStatus = 'no_limit';
            $capLabel = 'Tanpa Batas';
            $capDiff = 0;

            if ($maxDevs) {
                if ($clients <= $maxDevs) {
                    $capStatus = 'safe';
                    $capLabel = "Aman ({$clients}/{$maxDevs})";
                } elseif ($clients === $maxDevs + 1) {
                    $capStatus = 'warning';
                    $capLabel = "Siaga (+1) ({$clients}/{$maxDevs})";
                    $capDiff = 1;
                } else {
                    $capStatus = 'critical';
                    $over = $clients - $maxDevs;
                    $capLabel = "Kritis (+{$over}) ({$clients}/{$maxDevs})";
                    $capDiff = $over;
                }
            }

            return [
                'id' => $d->id,
                'device_id' => $d->device_id,
                'engine' => 'native_laravel_acs',
                'is_online' => $isOnline,
                'last_inform_at' => $d->last_inform_at?->toIso8601String(),
                'registered_at' => $d->registered_at?->toIso8601String(),
                'manufacturer' => $d->manufacturer,
                'product_class' => $d->product_class,
                'serial_number' => $d->serial_number,
                'pon_mode' => $d->pon_mode,
                'optical_rx_power' => $d->optical_rx_power,
                'optical_tx_power' => $d->optical_tx_power,
                'rx_status' => $d->rx_quality,
                'temperature' => $d->temperature,
                'device_uptime' => $d->device_uptime,
                'ppp_uptime' => $d->ppp_uptime,
                'pppoe_username' => $d->pppoe_username,
                'ip_address' => $d->wan_ip ?: $d->ip_address,
                'wan_mac' => $d->wan_mac,
                'lan_mac' => $d->lan_mac,
                'ssid' => $d->wifi_ssid,
                'wifi_password' => $d->wifi_password,
                'wifi_clients_count' => $clients,
                'matched_via' => $d->matched_via,
                'has_genieacs' => true,
                'is_unassigned' => empty($d->customer_id),
                'capacity_status' => $capStatus,
                'capacity_label' => $capLabel,
                'capacity_diff' => $capDiff,
                'max_devices' => $maxDevs,
                'customer' => $cust ? [
                    'id' => $cust->id,
                    'name' => $cust->name,
                    'phone' => $cust->phone,
                    'address' => $cust->address,
                    'pppoe_username' => $cust->pppoe_username,
                    'package_name' => $pkg?->name ?? ($cust->package_type ?: '-'),
                    'package_speed' => $pkg?->speed,
                    'package_price' => $pkg?->price,
                    'package_max_devices' => $maxDevs,
                    'is_active' => (bool) $cust->is_active,
                ] : null,
            ];
        });

        return response()->json([
            'status' => 'success',
            'stats' => [
                'engine' => 'Native Laravel TR-069 ACS',
                'total_devices' => $totalDevs,
                'online_devices' => $onlineDevs,
                'offline_devices' => $offlineDevs,
                'unassigned_devices' => $unassignedDevs,
                'critical_rx_count' => $criticalRxCount,
                'warning_rx_count' => $warningRxCount,
                'total_connected_clients' => $totalConnectedClients,
            ],
            'packages' => $packages,
            'devices' => $formattedList,
        ]);
    }

    /**
     * Get single device detailed telemetry & parameters
     */
    public function show(int $id): JsonResponse
    {
        $device = AcsDevice::query()->with([
            'customer.package',
            'connectedHosts' => fn($q) => $q->orderByDesc('last_seen_at'),
            'tasks' => fn($q) => $q->latest()->limit(10),
        ])->findOrFail($id);

        $params = AcsDeviceParameter::query()
            ->where('acs_device_id', $device->id)
            ->pluck('value', 'name')
            ->toArray();

        return response()->json([
            'status' => 'success',
            'device' => $device,
            'parameters' => $params,
            'connected_hosts' => $device->connectedHosts,
            'recent_tasks' => $device->tasks,
        ]);
    }

    /**
     * Update WiFi Credentials on Device
     */
    public function updateWifi(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'ssid' => 'required|string|min:1|max:32',
            'password' => 'required|string|min:8|max:64',
        ]);

        $device = AcsDevice::findOrFail($id);

        $task = $this->taskService->queueChangeWifi($device, $request->ssid, $request->password, true);

        return response()->json([
            'status' => 'success',
            'message' => 'Perintah ganti SSID & Password WiFi berhasil diantrekan ke router (Wake up request terkirim).',
            'task_id' => $task->id,
        ]);
    }

    /**
     * Reboot Device
     */
    public function reboot(int $id): JsonResponse
    {
        $device = AcsDevice::findOrFail($id);

        $task = $this->taskService->queueReboot($device, true);

        return response()->json([
            'status' => 'success',
            'message' => 'Perintah reboot router berhasil diantrekan (Wake up request terkirim).',
            'task_id' => $task->id,
        ]);
    }

    /**
     * Refresh / Query Parameters
     */
    public function refresh(int $id): JsonResponse
    {
        $device = AcsDevice::findOrFail($id);

        $task = $this->taskService->queueGetParameters($device, [], true);

        return response()->json([
            'status' => 'success',
            'message' => 'Perintah sinkronisasi parameter dikirim ke router.',
            'task_id' => $task->id,
        ]);
    }

    /**
     * Manually assign Customer to Device
     */
    public function assignCustomer(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'customer_id' => 'required|exists:customers,id',
        ]);

        $device = AcsDevice::findOrFail($id);
        $customer = Customer::findOrFail($request->customer_id);

        $device->customer_id = $customer->id;
        $device->matched_via = 'manual';
        if (empty($device->pppoe_username) && !empty($customer->pppoe_username)) {
            $device->pppoe_username = $customer->pppoe_username;
        }
        $device->save();

        return response()->json([
            'status' => 'success',
            'message' => "Router berhasil ditautkan ke pelanggan {$customer->name}.",
            'device' => $device,
        ]);
    }
}

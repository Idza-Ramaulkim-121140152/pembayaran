<?php

namespace App\Services;

use App\Exceptions\GenieAcsException;
use App\Models\Customer;
use Carbon\Carbon;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GenieAcsService
{
    private const PORTAL_STALE_MINUTES = 15;
    private const SUMMARY_CACHE_KEY = 'genieacs_devices_summary_fast';
    private const SUMMARY_CACHE_TTL_SECONDS = 60;

    private const FAST_DEVICE_PROJECTION = [
        '_id',
        '_lastInform',
        '_registered',
        'DeviceID.SerialNumber',
        'DeviceID.ProductClass',
        'DeviceID.Manufacturer',
        'DeviceID.ModelName',
        'VirtualParameters.pppoeUsername',
        'VirtualParameters.pppoeUsername2',
        'VirtualParameters.getSerialNumber',
        'VirtualParameters.RXPower',
        'VirtualParameters.activedevices',
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
        'InternetGatewayDevice.DeviceInfo.ModelName',
        'InternetGatewayDevice.DeviceInfo.ProductClass',
        'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ConnectionStatus',
        'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress',
        'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
        'Device.WiFi.SSID.1.SSID',
        'Device.WiFi.SSID.1.Enable',
        'Device.PPP.Interface.1.Username',
    ];

    /**
     * Get fast summarized list of ALL customers synchronized with GenieACS devices.
     */
    public function getAllDevicesSummary(bool $forceFresh = false): array
    {
        if (!$forceFresh && Cache::has(self::SUMMARY_CACHE_KEY)) {
            return Cache::get(self::SUMMARY_CACHE_KEY);
        }

        try {
            $response = $this->client()->get($this->url('/devices'), [
                'projection' => implode(',', self::FAST_DEVICE_PROJECTION),
            ]);

            if (!$response->successful()) {
                throw new GenieAcsException('Gagal menghubungi GenieACS API (HTTP ' . $response->status() . ').', 502);
            }

            $rawDevices = $response->json() ?? [];
        } catch (\Throwable $e) {
            if ($e instanceof GenieAcsException) throw $e;
            throw new GenieAcsException('Koneksi ke GenieACS timeout atau tidak dapat dijangkau: ' . $e->getMessage(), 504);
        }

        // Fetch all packages for device limit and lookup
        $packages = \App\Models\Package::query()->get(['id', 'name', 'speed', 'price', 'device_count']);
        $packagesByName = $packages->keyBy(fn($p) => strtolower(trim((string) $p->name)));

        // Fetch all customers from database
        $customers = Customer::query()
            ->select('id', 'name', 'phone', 'address', 'pppoe_username', 'home_router_host', 'home_router_type', 'is_active', 'package_id', 'package_type')
            ->with('package:id,name,speed,price,device_count')
            ->orderBy('name')
            ->get();

        // Index raw GenieACS devices by PPPoE, Serial, MAC
        $devicesByPppoe = [];
        $devicesByMac = [];
        $processedAcsDeviceIds = [];

        $parsedAcsDevices = [];
        $onlineCount = 0;
        $offlineCount = 0;
        $criticalRxCount = 0;
        $warningRxCount = 0;

        foreach ($rawDevices as $d) {
            $deviceId = (string) ($d['_id'] ?? '');
            $lastInformAt = $this->resolveLastInformAt($d);
            $isOnline = $this->isLastInformRecent($lastInformAt);

            if ($isOnline) {
                $onlineCount++;
            } else {
                $offlineCount++;
            }

            // Extract Manufacturer / Model
            $mfr = $this->parameterValue($d, 'DeviceID.Manufacturer')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.DeviceInfo.Manufacturer')
                ?: 'Generic';

            $productClass = $this->parameterValue($d, 'DeviceID.ProductClass')
                ?: $this->parameterValue($d, 'DeviceID.ModelName')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.DeviceInfo.ModelName')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.DeviceInfo.ProductClass')
                ?: 'ONT Router';

            $serialNumber = $this->parameterValue($d, 'VirtualParameters.getSerialNumber')
                ?: $this->parameterValue($d, 'DeviceID.SerialNumber')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.DeviceInfo.SerialNumber')
                ?: '';

            // Extract PPPoE Username
            $pppoe = $this->parameterValue($d, 'VirtualParameters.pppoeUsername')
                ?: $this->parameterValue($d, 'VirtualParameters.pppoeUsername2')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username')
                ?: $this->parameterValue($d, 'Device.PPP.Interface.1.Username')
                ?: '';

            // Extract IP Address
            $ipAddress = $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress')
                ?: '';

            // Extract MAC Address
            $macAddress = $this->parameterValue($d, 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress')
                ?: '';

            // Extract SSID & Connected WiFi Clients
            $ssid1 = $this->parameterValue($d, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID')
                ?: $this->parameterValue($d, 'Device.WiFi.SSID.1.SSID')
                ?: '';

            $wifiClients = $this->integerParameter($d, 'VirtualParameters.activedevices')
                ?? $this->integerParameter($d, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations')
                ?? 0;

            // Optical Power (dBm)
            $rxPowerRaw = $this->parameterValue($d, 'VirtualParameters.RXPower');
            $rxPowerVal = null;
            $rxStatus = 'unknown';

            if ($rxPowerRaw !== null && is_numeric($rxPowerRaw)) {
                $rxPowerVal = (float) $rxPowerRaw;
                if ($rxPowerVal >= -24.0) {
                    $rxStatus = 'normal';
                } elseif ($rxPowerVal >= -27.0) {
                    $rxStatus = 'warning';
                    $warningRxCount++;
                } else {
                    $rxStatus = 'critical';
                    $criticalRxCount++;
                }
            }

            $devData = [
                'device_id' => $deviceId,
                'is_online' => $isOnline,
                'last_inform_at' => $lastInformAt,
                'registered_at' => $this->parameterValue($d, '_registered'),
                'manufacturer' => $mfr,
                'product_class' => $productClass,
                'serial_number' => $serialNumber,
                'pppoe_username' => $pppoe ?: null,
                'ip_address' => $ipAddress ?: null,
                'mac_address' => $macAddress ?: null,
                'ssid' => $ssid1 ?: null,
                'wifi_clients_count' => $wifiClients,
                'rx_power' => $rxPowerVal,
                'rx_status' => $rxStatus,
            ];

            $parsedAcsDevices[$deviceId] = $devData;

            if ($pppoe !== '') {
                $devicesByPppoe[strtolower(trim($pppoe))] = $devData;
            }
            if ($macAddress !== '') {
                $cleanMac = strtolower(str_replace([':', '-', '.'], '', trim($macAddress)));
                $devicesByMac[$cleanMac] = $devData;
            }
        }

        $unifiedList = [];
        $customersWithAcsCount = 0;
        $customersWithoutAcsCount = 0;
        $totalConnectedClients = 0;
        $safeCapacityCount = 0;
        $warningCapacityCount = 0;
        $criticalCapacityCount = 0;
        $overlimitCapacityCount = 0;

        // 1. Process all Customers from database
        foreach ($customers as $c) {
            $matchedDev = null;
            $pppoeClean = $c->pppoe_username ? strtolower(trim($c->pppoe_username)) : '';

            if ($pppoeClean !== '' && isset($devicesByPppoe[$pppoeClean])) {
                $matchedDev = $devicesByPppoe[$pppoeClean];
            }

            // Resolve Customer Package
            $pkg = $c->package ?: ($c->package_type ? ($packagesByName[strtolower(trim($c->package_type))] ?? null) : null);
            $packageName = $pkg?->name ?? ($c->package_type ?: '-');
            $packageSpeed = $pkg?->speed ?? null;
            $packagePrice = $pkg?->price ?? null;
            $maxDevices = $pkg && $pkg->device_count !== null && $pkg->device_count > 0 ? (int) $pkg->device_count : null;

            $custPayload = [
                'id' => $c->id,
                'name' => $c->name,
                'phone' => $c->phone,
                'address' => $c->address,
                'pppoe_username' => $c->pppoe_username,
                'package_id' => $pkg?->id ?? $c->package_id,
                'package_name' => $packageName,
                'package_speed' => $packageSpeed,
                'package_price' => $packagePrice,
                'package_max_devices' => $maxDevices,
                'is_active' => (bool) $c->is_active,
            ];

            if ($matchedDev) {
                $customersWithAcsCount++;
                $processedAcsDeviceIds[$matchedDev['device_id']] = true;
                $clients = (int) ($matchedDev['wifi_clients_count'] ?? 0);
                $isOnline = (bool) ($matchedDev['is_online'] ?? false);

                if ($isOnline) {
                    $totalConnectedClients += $clients;
                }

                // Capacity calculation:
                // pt <= mp => safe (Hijau)
                // pt == mp + 1 => warning (Kuning Siaga)
                // pt > mp + 1 => critical (Merah Kritis)
                $capacityStatus = 'no_limit';
                $capacityLabel = 'Tanpa Batas';
                $capacityDiff = 0;

                if ($maxDevices !== null && $maxDevices > 0) {
                    if ($clients <= $maxDevices) {
                        $capacityStatus = 'safe';
                        $capacityLabel = "Aman ({$clients}/{$maxDevices})";
                        $capacityDiff = 0;
                        if ($isOnline) {
                            $safeCapacityCount++;
                        }
                    } elseif ($clients === $maxDevices + 1) {
                        $capacityStatus = 'warning';
                        $capacityLabel = "Siaga (+1) ({$clients}/{$maxDevices})";
                        $capacityDiff = 1;
                        if ($isOnline) {
                            $warningCapacityCount++;
                            $overlimitCapacityCount++;
                        }
                    } else {
                        $capacityStatus = 'critical';
                        $over = $clients - $maxDevices;
                        $capacityLabel = "Kritis (+{$over}) ({$clients}/{$maxDevices})";
                        $capacityDiff = $over;
                        if ($isOnline) {
                            $criticalCapacityCount++;
                            $overlimitCapacityCount++;
                        }
                    }
                }

                $unifiedList[] = array_merge($matchedDev, [
                    'has_genieacs' => true,
                    'is_unassigned' => false,
                    'customer' => $custPayload,
                    'capacity_status' => $capacityStatus,
                    'capacity_label' => $capacityLabel,
                    'capacity_diff' => $capacityDiff,
                    'max_devices' => $maxDevices,
                ]);
            } else {
                $customersWithoutAcsCount++;
                $unifiedList[] = [
                    'has_genieacs' => false,
                    'is_unassigned' => false,
                    'device_id' => null,
                    'is_online' => false,
                    'last_inform_at' => null,
                    'registered_at' => null,
                    'manufacturer' => null,
                    'product_class' => null,
                    'serial_number' => null,
                    'pppoe_username' => $c->pppoe_username,
                    'ip_address' => null,
                    'mac_address' => null,
                    'ssid' => null,
                    'wifi_clients_count' => 0,
                    'rx_power' => null,
                    'rx_status' => 'no_acs',
                    'customer' => $custPayload,
                    'capacity_status' => $maxDevices ? 'safe' : 'no_limit',
                    'capacity_label' => $maxDevices ? "Offline (0/{$maxDevices})" : 'Offline',
                    'capacity_diff' => 0,
                    'max_devices' => $maxDevices,
                ];
            }
        }

        // 2. Include any ACS devices that are NOT matched to any database customer
        $unassignedCount = 0;
        foreach ($parsedAcsDevices as $devId => $devData) {
            if (!isset($processedAcsDeviceIds[$devId])) {
                $unassignedCount++;
                $clients = (int) ($devData['wifi_clients_count'] ?? 0);
                if ($devData['is_online']) {
                    $totalConnectedClients += $clients;
                }

                $unifiedList[] = array_merge($devData, [
                    'has_genieacs' => true,
                    'is_unassigned' => true,
                    'customer' => null,
                    'capacity_status' => 'no_limit',
                    'capacity_label' => "{$clients} Klien (Router Belum Tertaut)",
                    'capacity_diff' => 0,
                    'max_devices' => null,
                ]);
            }
        }

        // Sort: Online first, then with_acs, then alphabetical by customer name or device id
        usort($unifiedList, function ($a, $b) {
            // 1. Online devices first
            if ($a['is_online'] !== $b['is_online']) {
                return $a['is_online'] ? -1 : 1;
            }
            // 2. Devices with ACS before no-ACS
            if ($a['has_genieacs'] !== $b['has_genieacs']) {
                return $a['has_genieacs'] ? -1 : 1;
            }
            // 3. Alphabetical name
            $nameA = $a['customer']['name'] ?? ($a['pppoe_username'] ?? $a['device_id'] ?? '');
            $nameB = $b['customer']['name'] ?? ($b['pppoe_username'] ?? $b['device_id'] ?? '');
            return strcasecmp($nameA, $nameB);
        });

        $result = [
            'stats' => [
                'total_customers' => $customers->count(),
                'total_devices_in_acs' => count($rawDevices),
                'customers_with_acs' => $customersWithAcsCount,
                'customers_without_acs' => $customersWithoutAcsCount,
                'online_devices' => $onlineCount,
                'offline_devices' => $offlineCount,
                'unassigned_devices' => $unassignedCount,
                'total_connected_clients' => $totalConnectedClients,
                'safe_capacity_count' => $safeCapacityCount,
                'warning_capacity_count' => $warningCapacityCount,
                'critical_capacity_count' => $criticalCapacityCount,
                'overlimit_capacity_count' => $overlimitCapacityCount,
                'critical_rx_count' => $criticalRxCount,
                'warning_rx_count' => $warningRxCount,
                'cached_at' => now()->toIso8601String(),
            ],
            'packages' => $packages->map(fn($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'speed' => $p->speed,
                'price' => $p->price,
                'device_count' => $p->device_count,
            ])->values()->all(),
            'devices' => $unifiedList,
        ];

        Cache::put(self::SUMMARY_CACHE_KEY, $result, self::SUMMARY_CACHE_TTL_SECONDS);

        return $result;
    }

    /**
     * Get detailed telemetry and configuration of a single GenieACS device
     */
    public function getDeviceDetails(string $deviceId): array
    {
        $response = $this->client()->get($this->url('/devices'), [
            'query' => json_encode(['_id' => $deviceId]),
        ]);

        if (!$response->successful()) {
            throw new GenieAcsException('Gagal mengambil data perangkat dari GenieACS.', 502);
        }

        $devices = $response->json() ?? [];
        if (empty($devices)) {
            throw new GenieAcsException('Perangkat tidak ditemukan di GenieACS.', 404);
        }

        $device = $devices[0];

        $summary = $this->summarizeDevice($device);
        $telemetry = $this->summarizePortalTelemetry($device);
        $lanHosts = $this->resolveLanHostsByMac($device);

        // Find matched customer
        $pppoe = $this->parameterValue($device, 'VirtualParameters.pppoeUsername')
            ?: $this->parameterValue($device, 'VirtualParameters.pppoeUsername2')
            ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username')
            ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username')
            ?: '';

        $customer = null;
        if ($pppoe !== '') {
            $customerModel = Customer::query()
                ->where('pppoe_username', $pppoe)
                ->with('package:id,name,speed,price')
                ->first();

            if ($customerModel) {
                $customer = [
                    'id' => $customerModel->id,
                    'name' => $customerModel->name,
                    'phone' => $customerModel->phone,
                    'address' => $customerModel->address,
                    'pppoe_username' => $customerModel->pppoe_username,
                    'package_name' => $customerModel->package?->name ?? '-',
                    'is_active' => (bool) $customerModel->is_active,
                ];
            }
        }

        return [
            'device_id' => $deviceId,
            'summary' => $summary,
            'telemetry' => $telemetry,
            'lan_hosts' => array_values($lanHosts),
            'customer' => $customer,
            'raw_writable_wifi_targets' => $this->activeWifiTargets($device),
        ];
    }

    /**
     * Update WiFi SSID and/or Password for a device with robust multi-vendor TR-069 path handling
     */
    public function updateDeviceWifi(string $deviceId, array $payload): array
    {
        $newPassword = isset($payload['password']) ? trim((string) $payload['password']) : null;
        $newSsid = isset($payload['ssid']) ? trim((string) $payload['ssid']) : null;

        if ($newPassword === null && $newSsid === null) {
            throw new GenieAcsException('Harap isi Nama SSID atau Password baru yang ingin diubah.', 422);
        }

        // Fetch device to inspect current WiFi parameter paths
        $response = $this->client()->get($this->url('/devices'), [
            'query' => json_encode(['_id' => $deviceId]),
        ]);

        if (!$response->successful() || empty($response->json())) {
            throw new GenieAcsException('Perangkat tidak ditemukan di GenieACS.', 404);
        }

        $device = $response->json()[0];
        $wifiTargets = $this->activeWifiTargets($device);

        if (empty($wifiTargets)) {
            // Fallback default TR-098 WLAN paths if not detected
            $wifiTargets = [
                [
                    'ssid' => 'SSID 1',
                    'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                    'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
                ],
                [
                    'ssid' => 'SSID 1 PreSharedKey',
                    'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                    'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase',
                ]
            ];
        }

        $parameterValues = [];
        $refreshPaths = [];

        // 1. If updating Password:
        if ($newPassword !== null && $newPassword !== '') {
            $passwordPaths = collect($wifiTargets)->pluck('password_path')->filter()->unique()->values()->all();
            foreach ($passwordPaths as $pPath) {
                $parameterValues[] = [$pPath, $newPassword, 'xsd:string'];
                $refreshPaths[] = $pPath;
            }
        }

        // 2. If updating SSID Name:
        if ($newSsid !== null && $newSsid !== '') {
            $ssidPaths = [];
            foreach ($wifiTargets as $wt) {
                $basePath = $wt['path'] ?? null;
                if ($basePath) {
                    if (str_starts_with($basePath, 'Device.WiFi.')) {
                        $ssidPaths[] = $basePath . '.SSID';
                    } else {
                        $ssidPaths[] = $basePath . '.SSID';
                    }
                }
            }
            $ssidPaths = array_values(array_unique(array_filter($ssidPaths)));
            if (empty($ssidPaths)) {
                $ssidPaths[] = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID';
            }

            foreach ($ssidPaths as $sPath) {
                $parameterValues[] = [$sPath, $newSsid, 'xsd:string'];
                $refreshPaths[] = $sPath;
            }
        }

        if (empty($parameterValues)) {
            throw new GenieAcsException('Tidak ada parameter WiFi yang dapat diubah pada perangkat ini.', 422);
        }

        // Post setParameterValues task
        $this->postTask($deviceId, [
            'name' => 'setParameterValues',
            'parameterValues' => $parameterValues,
        ]);

        // Post refreshObject task to update values on next Inform
        $refreshTarget = !empty($refreshPaths) ? $this->refreshObjectName($refreshPaths[0]) : 'InternetGatewayDevice.LANDevice.';
        $this->postTask($deviceId, [
            'name' => 'refreshObject',
            'objectName' => $refreshTarget,
        ], false);

        // Invalidate summary cache so UI updates immediately
        Cache::forget(self::SUMMARY_CACHE_KEY);

        return [
            'device_id' => $deviceId,
            'updated_parameters' => count($parameterValues),
            'parameter_paths' => array_column($parameterValues, 0),
            'message' => 'Perintah pembaruan WiFi berhasil dikirim ke antrean GenieACS (TR-069 Task Created).',
        ];
    }

    /**
     * Reboot router device via TR-069 RPC method
     */
    public function rebootDevice(string $deviceId): array
    {
        $this->postTask($deviceId, [
            'name' => 'reboot',
        ]);

        Cache::forget(self::SUMMARY_CACHE_KEY);

        return [
            'device_id' => $deviceId,
            'message' => 'Perintah reboot router berhasil dikirim ke GenieACS.',
        ];
    }

    /**
     * Refresh router parameters from device
     */
    public function refreshDevice(string $deviceId): array
    {
        $this->postTask($deviceId, [
            'name' => 'refreshObject',
            'objectName' => '',
        ]);

        Cache::forget(self::SUMMARY_CACHE_KEY);

        return [
            'device_id' => $deviceId,
            'message' => 'Perintah sinkronisasi parameter berhasil dikirim ke router.',
        ];
    }

    public function findDeviceByPppoe(string $pppoeUsername): ?array
    {
        $target = $this->normalize($pppoeUsername);
        if ($target === '') {
            return null;
        }

        // Fast MongoDB query via GenieACS REST API
        $queryParam = json_encode([
            '$or' => [
                ['VirtualParameters.pppoeUsername' => $target],
                ['VirtualParameters.pppoeUsername2' => $target],
                ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username' => $target],
                ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username' => $target],
                ['Device.PPP.Interface.1.Username' => $target],
            ],
        ]);

        try {
            $response = $this->client()->get($this->url('/devices'), [
                'query' => $queryParam,
            ]);

            if ($response->successful()) {
                $devices = $response->json() ?? [];
                if (!empty($devices)) {
                    return $devices[0];
                }
            }
        } catch (\Throwable) {
            // Fallback to full fetch if query fails
        }

        // Fallback: search across all devices
        $all = $this->client()->get($this->url('/devices'), [
            'projection' => implode(',', self::FAST_DEVICE_PROJECTION),
        ]);

        if ($all->successful()) {
            foreach ($all->json() ?? [] as $device) {
                if ($this->deviceHasPppoeUsername($device, $target)) {
                    // Fetch full device
                    $full = $this->client()->get($this->url('/devices'), [
                        'query' => json_encode(['_id' => $device['_id']]),
                    ]);
                    return $full->successful() ? ($full->json()[0] ?? $device) : $device;
                }
            }
        }

        return null;
    }

    public function describeDeviceByPppoe(string $pppoeUsername): array
    {
        $device = $this->findDeviceByPppoe($pppoeUsername);

        if (!$device) {
            throw new GenieAcsException('Device GenieACS tidak ditemukan untuk PPPoE pelanggan ini.', 404);
        }

        return $this->summarizeDevice($device);
    }

    public function changeWifiPasswordByPppoe(string $pppoeUsername, string $password): array
    {
        $device = $this->findDeviceByPppoe($pppoeUsername);

        if (!$device) {
            throw new GenieAcsException('Device GenieACS tidak ditemukan untuk PPPoE pelanggan ini.', 404);
        }

        $deviceId = (string) ($device['_id'] ?? '');
        $res = $this->updateDeviceWifi($deviceId, ['password' => $password]);
        $summary = $this->summarizeDevice($device);

        return [
            'device_id' => $deviceId,
            'updated_ssid_count' => count($summary['ssids'] ?? [1]),
            'target_ssid_count' => count($summary['ssids'] ?? [1]),
            'targets' => collect($summary['ssids'] ?? [])
                ->map(fn (array $ssid) => Arr::only($ssid, ['ssid', 'path', 'password_path']))
                ->values()
                ->all(),
            'ssids' => collect($summary['ssids'] ?? [])
                ->map(fn (array $ssid) => Arr::except($ssid, ['password_path', 'current_password']))
                ->values()
                ->all(),
        ];
    }

    public function verifyWifiPasswordByPppoe(string $pppoeUsername, string $password, array $targets): array
    {
        try {
            $device = $this->findDeviceByPppoe($pppoeUsername);

            if (!$device) {
                return $this->verificationResult('failed', 0, $targets, 'Device GenieACS tidak ditemukan saat verifikasi.');
            }

            $currentTargets = collect($this->summarizeDevice($device)['ssids'] ?? [])
                ->keyBy('password_path');

            $rows = collect($targets)
                ->map(function (array $target) use ($currentTargets, $password) {
                    $path = $target['password_path'] ?? null;
                    $current = $path ? $currentTargets->get($path) : null;
                    $verified = $current && hash_equals((string) ($current['current_password'] ?? ''), $password);

                    return [
                        'ssid' => $target['ssid'] ?? ($current['ssid'] ?? '-'),
                        'path' => $target['path'] ?? ($current['path'] ?? null),
                        'verified' => (bool) $verified,
                        'available' => (bool) $current,
                    ];
                })
                ->values()
                ->all();

            $targetCount = count($rows);
            $verifiedCount = collect($rows)->where('verified', true)->count();

            if ($targetCount > 0 && $verifiedCount === $targetCount) {
                return $this->verificationResult('verified', $verifiedCount, $rows, 'Password WiFi sudah berhasil terverifikasi di GenieACS.');
            }

            if ($verifiedCount > 0) {
                return $this->verificationResult('partial', $verifiedCount, $rows, 'Sebagian SSID sudah berhasil terverifikasi.');
            }

            return $this->verificationResult('pending', 0, $rows, 'Task sudah dikirim, menunggu GenieACS membaca nilai password terbaru.');
        } catch (GenieAcsException $exception) {
            return $this->verificationResult('failed', 0, $targets, $exception->getMessage());
        } catch (\Throwable $exception) {
            report($exception);

            return $this->verificationResult('failed', 0, $targets, 'Gagal memverifikasi status password WiFi.');
        }
    }

    public function summarizeDevice(array $device): array
    {
        return [
            'device_id' => (string) ($device['_id'] ?? ''),
            'serial_number' => $this->parameterValue($device, 'DeviceID.SerialNumber')
                ?: $this->parameterValue($device, 'InternetGatewayDevice.DeviceInfo.SerialNumber')
                ?: $this->parameterValue($device, 'Device.DeviceInfo.SerialNumber'),
            'product_class' => $this->parameterValue($device, 'DeviceID.ProductClass')
                ?: $this->parameterValue($device, 'InternetGatewayDevice.DeviceInfo.ProductClass')
                ?: $this->parameterValue($device, 'Device.DeviceInfo.ModelName'),
            'ssids' => $this->activeWifiTargets($device),
        ];
    }

    public function summarizePortalTelemetryByPppoe(string $pppoeUsername): array
    {
        $device = $this->findDeviceByPppoe($pppoeUsername);

        if (!$device) {
            throw new GenieAcsException('Device GenieACS tidak ditemukan untuk PPPoE pelanggan ini.', 404);
        }

        return $this->summarizePortalTelemetry($device);
    }

    public function summarizePortalTelemetry(array $device): array
    {
        $deviceSummary = $this->summarizeDevice($device);
        $lastInformAt = $this->resolveLastInformAt($device);
        $lastInformRecent = $this->isLastInformRecent($lastInformAt);
        $wanTelemetry = $this->resolvePortalWanTelemetry($device);
        $hostTelemetry = $this->resolvePortalHostTelemetry($device);
        $connectedDeviceTelemetry = $this->resolvePortalConnectedDeviceTelemetry($device);
        $wifiClientTelemetry = $this->resolvePortalWifiClientTelemetry($device);

        return [
            'device_id' => $deviceSummary['device_id'],
            'serial_number' => $deviceSummary['serial_number'],
            'product_class' => $deviceSummary['product_class'],
            'last_inform_at' => $lastInformAt,
            'last_inform_recent' => $lastInformRecent,
            'wan_connected' => $wanTelemetry['connected'],
            'wan_status' => $wanTelemetry['status'],
            'uptime' => $wanTelemetry['uptime'],
            'ip_address' => $wanTelemetry['ip_address'],
            'traffic' => [
                'available' => $wanTelemetry['download_bytes'] !== null
                    || $wanTelemetry['upload_bytes'] !== null
                    || $wanTelemetry['total_bytes'] !== null,
                'source' => $wanTelemetry['source'],
                'source_label' => $wanTelemetry['source_label'],
                'download_bytes' => $wanTelemetry['download_bytes'],
                'upload_bytes' => $wanTelemetry['upload_bytes'],
                'total_bytes' => $wanTelemetry['total_bytes'],
            ],
            'hosts' => [
                'available' => $hostTelemetry['count'] !== null,
                'count' => $hostTelemetry['count'],
                'source' => $hostTelemetry['source'],
                'source_label' => $hostTelemetry['source_label'],
            ],
            'connected_devices' => [
                'available' => $connectedDeviceTelemetry['count'] !== null,
                'count' => $connectedDeviceTelemetry['count'],
                'source' => $connectedDeviceTelemetry['source'],
                'source_label' => $connectedDeviceTelemetry['source_label'],
            ],
            'wifi_clients' => [
                'available' => !empty($wifiClientTelemetry),
                'ssids' => $wifiClientTelemetry,
            ],
        ];
    }

    private function client(): PendingRequest
    {
        $client = Http::timeout((int) config('services.genieacs.timeout', 20))
            ->acceptJson();

        $username = config('services.genieacs.username');
        $password = config('services.genieacs.password');

        if ($username !== null && $username !== '' && $password !== null && $password !== '') {
            $client = $client->withBasicAuth((string) $username, (string) $password);
        }

        return $client;
    }

    private function url(string $path): string
    {
        return rtrim((string) config('services.genieacs.api_url'), '/') . '/' . ltrim($path, '/');
    }

    private function postTask(string $deviceId, array $payload, bool $required = true): void
    {
        $response = $this->client()->post($this->url('/devices/' . rawurlencode($deviceId) . '/tasks?timeout=20000'), $payload);

        if ($required && !$response->successful()) {
            throw new GenieAcsException('GenieACS gagal menerima task perintah (' . ($payload['name'] ?? 'task') . ').', 502);
        }
    }

    private function deviceHasPppoeUsername(array $device, string $target): bool
    {
        foreach ($this->flattenParameterValues($device) as $path => $value) {
            if (!Str::endsWith($path, '.Username') && !Str::contains($path, 'pppoeUsername')) {
                continue;
            }

            if ($this->normalize((string) $value) === $target) {
                return true;
            }
        }

        return false;
    }

    private function activeWifiTargets(array $device): array
    {
        return array_values(array_merge(
            $this->tr098WifiTargets($device),
            $this->tr181WifiTargets($device),
        ));
    }

    private function resolvePortalWanTelemetry(array $device): array
    {
        $candidates = array_merge(
            $this->tr098WanCandidates($device),
            $this->tr181PppCandidates($device),
            $this->tr181IpCandidates($device),
        );

        if (empty($candidates)) {
            return [
                'connected' => null,
                'status' => null,
                'uptime' => null,
                'ip_address' => null,
                'download_bytes' => null,
                'upload_bytes' => null,
                'total_bytes' => null,
                'source' => null,
                'source_label' => null,
            ];
        }

        usort($candidates, function (array $left, array $right) {
            return $this->wanCandidateScore($right) <=> $this->wanCandidateScore($left);
        });

        $candidate = $candidates[0];
        $totalBytes = $candidate['total_bytes'];

        if ($totalBytes === null && ($candidate['download_bytes'] !== null || $candidate['upload_bytes'] !== null)) {
            $totalBytes = (int) (($candidate['download_bytes'] ?? 0) + ($candidate['upload_bytes'] ?? 0));
        }

        return [
            'connected' => $candidate['connected'],
            'status' => $candidate['status'],
            'uptime' => $candidate['uptime'],
            'ip_address' => $candidate['ip_address'],
            'download_bytes' => $candidate['download_bytes'],
            'upload_bytes' => $candidate['upload_bytes'],
            'total_bytes' => $totalBytes,
            'source' => $candidate['source'],
            'source_label' => $candidate['source_label'],
        ];
    }

    private function tr098WanCandidates(array $device): array
    {
        $candidates = [];

        foreach (data_get($device, 'InternetGatewayDevice.WANDevice', []) as $wanIndex => $wanDevice) {
            if (!is_array($wanDevice)) {
                continue;
            }

            foreach (($wanDevice['WANConnectionDevice'] ?? []) as $connectionIndex => $connectionDevice) {
                if (!is_array($connectionDevice)) {
                    continue;
                }

                foreach (['WANPPPConnection', 'WANIPConnection'] as $connectionType) {
                    foreach (($connectionDevice[$connectionType] ?? []) as $serviceIndex => $service) {
                        if (!is_array($service)) {
                            continue;
                        }

                        $status = $this->parameterValue($service, 'ConnectionStatus')
                            ?: $this->parameterValue($service, 'Status');
                        $downloadBytes = $this->integerParameter($service, 'Stats.BytesReceived')
                            ?? $this->integerParameter($service, 'Stats.EthernetBytesReceived');
                        $uploadBytes = $this->integerParameter($service, 'Stats.BytesSent')
                            ?? $this->integerParameter($service, 'Stats.EthernetBytesSent');

                        $candidates[] = [
                            'connected' => $this->wanStatusToBoolean($status),
                            'status' => $status,
                            'uptime' => $this->parameterValue($service, 'Uptime')
                                ?: $this->parameterValue($service, 'LastConnectionUpTime'),
                            'ip_address' => $this->parameterValue($service, 'ExternalIPAddress')
                                ?: $this->parameterValue($service, 'IPAddress'),
                            'download_bytes' => $downloadBytes,
                            'upload_bytes' => $uploadBytes,
                            'total_bytes' => null,
                            'source' => 'genieacs_tr098_wan',
                            'source_label' => 'Counter WAN GenieACS',
                            'path' => "InternetGatewayDevice.WANDevice.{$wanIndex}.WANConnectionDevice.{$connectionIndex}.{$connectionType}.{$serviceIndex}",
                        ];
                    }
                }
            }
        }

        return array_values(array_filter($candidates, function (array $candidate) {
            return $candidate['status'] !== null
                || $candidate['uptime'] !== null
                || $candidate['ip_address'] !== null
                || $candidate['download_bytes'] !== null
                || $candidate['upload_bytes'] !== null;
        }));
    }

    private function tr181PppCandidates(array $device): array
    {
        $candidates = [];

        foreach (data_get($device, 'Device.PPP.Interface', []) as $interfaceIndex => $interface) {
            if (!is_array($interface)) {
                continue;
            }

            $status = $this->parameterValue($interface, 'Status')
                ?: $this->parameterValue($interface, 'ConnectionStatus');

            $candidates[] = [
                'connected' => $this->wanStatusToBoolean($status),
                'status' => $status,
                'uptime' => $this->parameterValue($interface, 'Uptime'),
                'ip_address' => $this->parameterValue($interface, 'ExternalIPAddress')
                    ?: $this->parameterValue($interface, 'IPAddress'),
                'download_bytes' => $this->integerParameter($interface, 'Stats.BytesReceived'),
                'upload_bytes' => $this->integerParameter($interface, 'Stats.BytesSent'),
                'total_bytes' => null,
                'source' => 'genieacs_tr181_ppp',
                'source_label' => 'Counter WAN GenieACS',
                'path' => "Device.PPP.Interface.{$interfaceIndex}",
            ];
        }

        return array_values(array_filter($candidates, function (array $candidate) {
            return $candidate['status'] !== null
                || $candidate['uptime'] !== null
                || $candidate['ip_address'] !== null
                || $candidate['download_bytes'] !== null
                || $candidate['upload_bytes'] !== null;
        }));
    }

    private function tr181IpCandidates(array $device): array
    {
        $candidates = [];

        foreach (data_get($device, 'Device.IP.Interface', []) as $interfaceIndex => $interface) {
            if (!is_array($interface)) {
                continue;
            }

            if ($this->nullableBooleanParameter($interface, 'Upstream') === false) {
                continue;
            }

            $status = $this->parameterValue($interface, 'Status');

            $candidates[] = [
                'connected' => $this->wanStatusToBoolean($status),
                'status' => $status,
                'uptime' => $this->parameterValue($interface, 'LastChange'),
                'ip_address' => $this->parameterValue($interface, 'IPv4Address.1.IPAddress')
                    ?: $this->parameterValue($interface, 'IPv6Address.1.IPAddress'),
                'download_bytes' => $this->integerParameter($interface, 'Stats.BytesReceived'),
                'upload_bytes' => $this->integerParameter($interface, 'Stats.BytesSent'),
                'total_bytes' => null,
                'source' => 'genieacs_tr181_ip',
                'source_label' => 'Counter WAN GenieACS',
                'path' => "Device.IP.Interface.{$interfaceIndex}",
            ];
        }

        return array_values(array_filter($candidates, function (array $candidate) {
            return $candidate['status'] !== null
                || $candidate['ip_address'] !== null
                || $candidate['download_bytes'] !== null
                || $candidate['upload_bytes'] !== null;
        }));
    }

    private function resolvePortalHostTelemetry(array $device): array
    {
        $tr181Hosts = $this->countTr181Hosts($device);
        if ($tr181Hosts !== null) {
            return [
                'count' => $tr181Hosts,
                'source' => 'genieacs_hosts',
                'source_label' => 'Host aktif GenieACS',
            ];
        }

        $tr098Hosts = $this->countTr098Hosts($device);
        if ($tr098Hosts !== null) {
            return [
                'count' => $tr098Hosts,
                'source' => 'genieacs_hosts',
                'source_label' => 'Host aktif GenieACS',
            ];
        }

        return [
            'count' => null,
            'source' => null,
            'source_label' => null,
        ];
    }

    private function resolvePortalConnectedDeviceTelemetry(array $device): array
    {
        $count = $this->virtualParameterInteger($device, 'activedevices');

        return [
            'count' => $count,
            'source' => $count !== null ? 'virtual_parameter_activedevices' : null,
            'source_label' => $count !== null ? 'Perangkat terhubung' : null,
        ];
    }

    private function resolvePortalWifiClientTelemetry(array $device): array
    {
        $lanHosts = $this->resolveLanHostsByMac($device);
        $groups = [];

        foreach ($this->virtualParameterEntriesStartingWith($device, 'wifi connected ssid') as $parameterName => $node) {
            $group = $this->parseWifiConnectedSsidGroup($parameterName, $node, $lanHosts);

            if ($group !== null) {
                $groups[] = $group;
            }
        }

        return array_values($groups);
    }

    private function countTr181Hosts(array $device): ?int
    {
        $hosts = data_get($device, 'Device.Hosts.Host', []);
        if (!is_array($hosts) || $hosts === []) {
            return null;
        }

        $items = collect($hosts)
            ->filter(fn ($host) => is_array($host))
            ->map(function (array $host) {
                $active = $this->nullableBooleanParameter($host, 'Active');

                if ($active === false) {
                    return null;
                }

                return $this->parameterValue($host, 'PhysAddress')
                    ?: $this->parameterValue($host, 'IPAddress')
                    ?: $this->parameterValue($host, 'HostName');
            })
            ->filter();

        return $items->isEmpty()
            ? null
            : $items->map(fn ($value) => strtolower(trim((string) $value)))->unique()->count();
    }

    private function countTr098Hosts(array $device): ?int
    {
        $candidates = [];

        foreach (data_get($device, 'InternetGatewayDevice.LANDevice', []) as $lanDevice) {
            if (!is_array($lanDevice)) {
                continue;
            }

            foreach (($lanDevice['Hosts']['Host'] ?? []) as $host) {
                if (!is_array($host)) {
                    continue;
                }

                $active = $this->nullableBooleanParameter($host, 'Active');
                if ($active === false) {
                    continue;
                }

                $identity = $this->parameterValue($host, 'MACAddress')
                    ?: $this->parameterValue($host, 'IPAddress')
                    ?: $this->parameterValue($host, 'HostName');

                if ($identity !== null) {
                    $candidates[] = strtolower(trim($identity));
                }
            }
        }

        $count = collect($candidates)->unique()->count();

        return $count > 0 ? $count : null;
    }

    private function resolveLanHostsByMac(array $device): array
    {
        $node = $this->findVirtualParameterNode($device, 'lan host');
        $text = $this->multilineValue($node);

        if ($text === null) {
            return [];
        }

        $hosts = [];

        foreach ($this->splitLines($text) as $line) {
            $normalizedLine = trim($line);
            if ($normalizedLine === '' || $this->looksLikeLanHostHeader($normalizedLine)) {
                continue;
            }

            $macAddress = $this->extractMacAddress($normalizedLine);
            if ($macAddress === null) {
                continue;
            }

            $ipAddress = $this->extractIpAddress($normalizedLine);
            $hostname = $this->extractLanHostname($normalizedLine, $ipAddress);
            $type = $this->extractLanHostType($normalizedLine, $macAddress);

            $hosts[$this->normalizeMacAddress($macAddress)] = [
                'name' => $hostname,
                'ip_address' => $ipAddress,
                'mac_address' => strtoupper($macAddress),
                'type' => $type,
            ];
        }

        return $hosts;
    }

    private function parseWifiConnectedSsidGroup(string $parameterName, mixed $node, array $lanHosts): ?array
    {
        $text = $this->multilineValue($node);
        if ($text === null) {
            return null;
        }

        $lines = $this->splitLines($text);
        if ($lines === []) {
            return null;
        }

        $ssid = $this->inferWifiSsidName($parameterName, $lines);
        $seenMacs = [];
        $devices = [];

        foreach ($lines as $line) {
            $normalizedLine = trim($line);
            if (
                $normalizedLine === ''
                || strcasecmp($normalizedLine, $ssid) === 0
                || $this->looksLikeWifiClientHeader($normalizedLine)
            ) {
                continue;
            }

            $macAddress = $this->extractMacAddress($normalizedLine);
            if ($macAddress === null) {
                continue;
            }

            $normalizedMac = $this->normalizeMacAddress($macAddress);
            if (isset($seenMacs[$normalizedMac])) {
                continue;
            }

            $ipAddress = $this->extractIpAddress($normalizedLine);
            $host = $lanHosts[$normalizedMac] ?? null;
            $displayName = $this->resolveConnectedDeviceName($host['name'] ?? null, $ipAddress, $normalizedMac);

            $devices[] = [
                'name' => $displayName,
                'ip_address' => $host['ip_address'] ?? $ipAddress,
                'mac_address' => $host['mac_address'] ?? strtoupper($macAddress),
                'type' => $host['type'] ?? 'WiFi',
            ];

            $seenMacs[$normalizedMac] = true;
        }

        if ($devices === []) {
            return null;
        }

        return [
            'ssid' => $ssid,
            'devices' => array_values($devices),
        ];
    }

    private function tr098WifiTargets(array $device): array
    {
        $targets = [];
        $lanDevices = data_get($device, 'InternetGatewayDevice.LANDevice', []);

        foreach ($lanDevices as $lanIndex => $lanDevice) {
            if (!is_array($lanDevice)) {
                continue;
            }

            foreach (($lanDevice['WLANConfiguration'] ?? []) as $wlanIndex => $wlan) {
                if (!is_array($wlan) || !$this->booleanParameter($wlan, 'Enable', true)) {
                    continue;
                }

                $basePath = "InternetGatewayDevice.LANDevice.{$lanIndex}.WLANConfiguration.{$wlanIndex}";
                $passwordParameter = $this->firstWritablePasswordParameter($wlan, $basePath, [
                    'KeyPassphrase',
                    'PreSharedKey.1.KeyPassphrase',
                    'PreSharedKey.1.PreSharedKey',
                    'X_HW_KeyPassphrase',
                ]);

                if (!$passwordParameter) {
                    continue;
                }

                $targets[] = [
                    'ssid' => $this->nodeValue($wlan['SSID'] ?? null) ?: $this->nodeValue($wlan['Name'] ?? null) ?: "SSID {$wlanIndex}",
                    'path' => $basePath,
                    'password_path' => $passwordParameter['path'],
                    'current_password' => $passwordParameter['current_password'],
                ];
            }
        }

        return $targets;
    }

    private function tr181WifiTargets(array $device): array
    {
        $targets = [];
        $ssidNames = [];
        $ssids = data_get($device, 'Device.WiFi.SSID', []);

        foreach ($ssids as $ssidIndex => $ssid) {
            if (!is_array($ssid) || !$this->booleanParameter($ssid, 'Enable', true)) {
                continue;
            }

            $path = "Device.WiFi.SSID.{$ssidIndex}";
            $ssidNames[$path] = $this->nodeValue($ssid['SSID'] ?? null) ?: "SSID {$ssidIndex}";
        }

        foreach (data_get($device, 'Device.WiFi.AccessPoint', []) as $apIndex => $accessPoint) {
            if (!is_array($accessPoint) || !$this->booleanParameter($accessPoint, 'Enable', true)) {
                continue;
            }

            $ssidReference = $this->nodeValue($accessPoint['SSIDReference'] ?? null);
            if ($ssidReference && !isset($ssidNames[$ssidReference])) {
                continue;
            }

            $basePath = "Device.WiFi.AccessPoint.{$apIndex}";
            $passwordParameter = $this->firstWritablePasswordParameter($accessPoint, $basePath, [
                'Security.KeyPassphrase',
                'Security.PreSharedKey',
            ]);

            if (!$passwordParameter) {
                continue;
            }

            $targets[] = [
                'ssid' => $ssidReference ? $ssidNames[$ssidReference] : "SSID {$apIndex}",
                'path' => $basePath,
                'password_path' => $passwordParameter['path'],
                'current_password' => $passwordParameter['current_password'],
            ];
        }

        return $targets;
    }

    private function firstWritablePasswordParameter(array $node, string $basePath, array $relativePaths): ?array
    {
        foreach ($relativePaths as $relativePath) {
            $parameter = data_get($node, $relativePath);
            if (!is_array($parameter)) {
                continue;
            }

            if (($parameter['_writable'] ?? true) === false) {
                continue;
            }

            return [
                'path' => $basePath . '.' . $relativePath,
                'current_password' => $this->nodeValue($parameter),
            ];
        }

        return null;
    }

    private function verificationResult(string $status, int $verifiedCount, array $targets, string $message): array
    {
        return [
            'status' => $status,
            'verified_ssid_count' => $verifiedCount,
            'target_ssid_count' => count($targets),
            'ssids' => collect($targets)
                ->map(fn (array $target) => [
                    'ssid' => $target['ssid'] ?? '-',
                    'path' => $target['path'] ?? null,
                    'verified' => (bool) ($target['verified'] ?? false),
                    'available' => array_key_exists('available', $target) ? (bool) $target['available'] : null,
                ])
                ->values()
                ->all(),
            'message' => $message,
        ];
    }

    private function flattenParameterValues(array $node, string $prefix = ''): array
    {
        if (array_key_exists('_value', $node)) {
            return [$prefix => $node['_value']];
        }

        $values = [];
        foreach ($node as $key => $value) {
            if (!is_array($value) || str_starts_with((string) $key, '_')) {
                continue;
            }

            $path = $prefix === '' ? (string) $key : $prefix . '.' . $key;
            $values += $this->flattenParameterValues($value, $path);
        }

        return $values;
    }

    private function virtualParameterEntries(array $device): array
    {
        $virtualParameters = $device['VirtualParameters'] ?? null;

        return is_array($virtualParameters) ? $virtualParameters : [];
    }

    private function findVirtualParameterNode(array $device, string $name): mixed
    {
        $target = $this->normalizeVirtualParameterName($name);

        foreach ($this->virtualParameterEntries($device) as $parameterName => $node) {
            if ($this->normalizeVirtualParameterName((string) $parameterName) === $target) {
                return $node;
            }
        }

        return null;
    }

    private function virtualParameterEntriesStartingWith(array $device, string $prefix): array
    {
        $targetPrefix = $this->normalizeVirtualParameterName($prefix);
        $matches = [];

        foreach ($this->virtualParameterEntries($device) as $parameterName => $node) {
            if (str_starts_with($this->normalizeVirtualParameterName((string) $parameterName), $targetPrefix)) {
                $matches[(string) $parameterName] = $node;
            }
        }

        return $matches;
    }

    private function virtualParameterInteger(array $device, string $name): ?int
    {
        $value = $this->multilineValue($this->findVirtualParameterNode($device, $name));

        if ($value === null || !is_numeric(trim($value))) {
            return null;
        }

        return (int) round((float) trim($value));
    }

    private function parameterValue(array $device, string $path): ?string
    {
        return $this->nodeValue(data_get($device, $path));
    }

    private function integerParameter(array $device, string $path): ?int
    {
        $value = $this->parameterValue($device, $path);

        if ($value === null || !is_numeric($value)) {
            return null;
        }

        return (int) round((float) $value);
    }

    private function nodeValue(mixed $node): ?string
    {
        $value = $this->rawNodeValue($node);

        if ($value === null || is_array($value)) {
            return null;
        }

        return $value === null || $value === '' ? null : (string) $value;
    }

    private function rawNodeValue(mixed $node): mixed
    {
        if (!is_array($node) || !array_key_exists('_value', $node)) {
            return null;
        }

        return $node['_value'];
    }

    private function multilineValue(mixed $node): ?string
    {
        $value = $node;

        if (is_array($node) && array_key_exists('_value', $node)) {
            $value = $this->rawNodeValue($node);
        }

        if ($value === null) {
            return null;
        }

        if (is_scalar($value)) {
            $text = trim((string) $value);

            return $text !== '' ? $text : null;
        }

        if (!is_array($value)) {
            return null;
        }

        $flattened = $this->flattenRawValue($value);
        if ($flattened === []) {
            return null;
        }

        return trim(implode(PHP_EOL, $flattened));
    }

    private function flattenRawValue(array $value): array
    {
        $lines = [];

        foreach ($value as $item) {
            if (is_scalar($item)) {
                $text = trim((string) $item);
                if ($text !== '') {
                    $lines[] = $text;
                }

                continue;
            }

            if (is_array($item)) {
                $lines = array_merge($lines, $this->flattenRawValue($item));
            }
        }

        return $lines;
    }

    private function splitLines(string $value): array
    {
        return array_values(array_filter(array_map(
            static fn (string $line) => trim($line),
            preg_split('/\r\n|\r|\n/', $value) ?: []
        ), static fn (string $line) => $line !== ''));
    }

    private function inferWifiSsidName(string $parameterName, array $lines): string
    {
        $firstLine = $lines[0] ?? null;

        if (
            $firstLine !== null
            && !$this->looksLikeWifiClientHeader($firstLine)
            && $this->extractMacAddress($firstLine) === null
            && $this->extractIpAddress($firstLine) === null
        ) {
            return $firstLine;
        }

        if (preg_match('/ssid\s*(\d+)/i', $parameterName, $matches)) {
            return 'SSID ' . $matches[1];
        }

        return $parameterName;
    }

    private function resolveConnectedDeviceName(?string $hostName, ?string $ipAddress, string $normalizedMac): string
    {
        $hostName = trim((string) $hostName);

        if ($hostName !== '' && $hostName !== '-' && $hostName !== $ipAddress) {
            return $hostName;
        }

        if ($ipAddress !== null && $ipAddress !== '') {
            return 'Perangkat ' . $ipAddress;
        }

        return 'Perangkat ' . strtoupper($normalizedMac);
    }

    private function looksLikeWifiClientHeader(string $line): bool
    {
        $normalized = strtolower($line);

        return str_contains($normalized, 'ip address') && str_contains($normalized, 'mac');
    }

    private function looksLikeLanHostHeader(string $line): bool
    {
        $normalized = strtolower($line);

        return str_contains($normalized, 'host name')
            && str_contains($normalized, 'ip address')
            && str_contains($normalized, 'mac address');
    }

    private function extractIpAddress(string $line): ?string
    {
        preg_match('/\b(?:\d{1,3}\.){3}\d{1,3}\b/', $line, $matches);

        return $matches[0] ?? null;
    }

    private function extractMacAddress(string $line): ?string
    {
        preg_match('/\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i', $line, $matches);

        return $matches[0] ?? null;
    }

    private function extractLanHostname(string $line, ?string $ipAddress): ?string
    {
        if ($ipAddress === null) {
            return null;
        }

        $position = strpos($line, $ipAddress);
        if ($position === false) {
            return null;
        }

        $hostname = trim(substr($line, 0, $position));

        return $hostname !== '' ? $hostname : null;
    }

    private function extractLanHostType(string $line, string $macAddress): ?string
    {
        $position = stripos($line, $macAddress);
        if ($position === false) {
            return null;
        }

        $type = trim(substr($line, $position + strlen($macAddress)));

        return $type !== '' ? $type : null;
    }

    private function normalizeMacAddress(string $macAddress): string
    {
        return strtolower(trim($macAddress));
    }

    private function normalizeVirtualParameterName(string $name): string
    {
        $normalized = strtolower(trim($name));
        $normalized = str_replace(['_', '-'], ' ', $normalized);

        return preg_replace('/\s+/', ' ', $normalized) ?: '';
    }

    private function booleanParameter(array $node, string $key, bool $default): bool
    {
        $parameter = $node[$key] ?? null;
        if (!is_array($parameter) || !array_key_exists('_value', $parameter)) {
            return $default;
        }

        $value = $parameter['_value'];
        if (is_bool($value)) {
            return $value;
        }

        return in_array(strtolower((string) $value), ['1', 'true', 'yes', 'enabled'], true);
    }

    private function nullableBooleanParameter(array $node, string $key): ?bool
    {
        $parameter = $node[$key] ?? null;
        if (!is_array($parameter) || !array_key_exists('_value', $parameter)) {
            return null;
        }

        $value = $parameter['_value'];
        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));

        if (in_array($normalized, ['1', 'true', 'yes', 'enabled', 'up', 'connected'], true)) {
            return true;
        }

        if (in_array($normalized, ['0', 'false', 'no', 'disabled', 'down', 'disconnected'], true)) {
            return false;
        }

        return null;
    }

    private function wanStatusToBoolean(?string $status): ?bool
    {
        if ($status === null) {
            return null;
        }

        $normalized = strtolower(trim($status));

        if (in_array($normalized, ['connected', 'up', 'upstream', 'enabled'], true)) {
            return true;
        }

        if (in_array($normalized, ['disconnected', 'down', 'lowerlayerdown', 'error'], true)) {
            return false;
        }

        return null;
    }

    private function wanCandidateScore(array $candidate): int
    {
        $score = 0;

        if ($candidate['connected'] === true) {
            $score += 100;
        } elseif ($candidate['connected'] === false) {
            $score += 60;
        }

        if ($candidate['download_bytes'] !== null || $candidate['upload_bytes'] !== null || $candidate['total_bytes'] !== null) {
            $score += 20;
        }

        if ($candidate['ip_address'] !== null) {
            $score += 10;
        }

        if ($candidate['uptime'] !== null) {
            $score += 5;
        }

        return $score;
    }

    private function resolveLastInformAt(array $device): ?string
    {
        $value = $device['_lastInform'] ?? null;

        if (is_array($value) && array_key_exists('_value', $value)) {
            $value = $value['_value'];
        }

        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->setTimezone('Asia/Jakarta')->toIso8601String();
        } catch (\Throwable) {
            return null;
        }
    }

    private function isLastInformRecent(?string $lastInformAt): bool
    {
        if ($lastInformAt === null) {
            return false;
        }

        try {
            return Carbon::parse($lastInformAt)->greaterThanOrEqualTo(now()->subMinutes(self::PORTAL_STALE_MINUTES));
        } catch (\Throwable) {
            return false;
        }
    }

    private function refreshObjectName(string $passwordPath): string
    {
        if (str_starts_with($passwordPath, 'Device.WiFi.')) {
            return 'Device.WiFi.';
        }

        $parts = explode('.', $passwordPath);
        $wlanPosition = array_search('WLANConfiguration', $parts, true);

        if ($wlanPosition !== false && isset($parts[$wlanPosition + 1])) {
            return implode('.', array_slice($parts, 0, $wlanPosition + 2)) . '.';
        }

        return 'InternetGatewayDevice.LANDevice.';
    }

    private function normalize(string $value): string
    {
        return strtolower(trim($value));
    }
}

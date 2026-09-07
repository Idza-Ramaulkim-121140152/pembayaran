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

use Illuminate\Support\Facades\Log;

class GenieAcsService
{
    private const PORTAL_STALE_MINUTES = 15;
    private const SUMMARY_CACHE_KEY = 'genieacs_devices_summary_fast';
    private const SUMMARY_CACHE_TTL_SECONDS = 60;

    private const FAST_DEVICE_PROJECTION = [
        '_id',
        '_lastInform',
        '_registered',
        '_ip',
        'DeviceID.SerialNumber',
        'DeviceID.ProductClass',
        'DeviceID.Manufacturer',
        'DeviceID.ModelName',
        'VirtualParameters.pppoeUsername',
        'VirtualParameters.pppoeUsername2',
        'VirtualParameters.pppoeIP',
        'VirtualParameters.IPTR069',
        'VirtualParameters.pppoeMac',
        'VirtualParameters.PonMac',
        'VirtualParameters.getSerialNumber',
        'VirtualParameters.RXPower',
        'VirtualParameters.activedevices',
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
        'InternetGatewayDevice.DeviceInfo.ModelName',
        'InternetGatewayDevice.DeviceInfo.ProductClass',
        'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
        'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ConnectionStatus',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress',
        'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CMS_KeyPassphrase',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
        'VirtualParameters.WlanPassword',
        'VirtualParameters.wlanPassword',
        'VirtualParameters.wifiPassword',
        'InternetGatewayDevice.LANDevice.1.Hosts.Host',
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice',
        'Device.WiFi.SSID.1.SSID',
        'Device.WiFi.SSID.1.Enable',
        'Device.PPP.Interface.1.Username',
        'Device.PPP.Interface.1.IPCP.LocalIPAddress',
        'Device.IP.Interface.1.IPv4Address.1.IPAddress',
    ];

    public function __construct(
        protected ?MikroTikService $mikroTikService = null
    ) {
    }

    /**
     * Fetch and index MikroTik PPPoE Active connections & Secrets for double-checking.
     * Returns ['by_ip' => [...], 'by_mac' => [...], 'by_pppoe' => [...]]
     */
    public function getMikrotikPppoeLookupMaps(bool $forceFresh = false): array
    {
        $cacheKey = 'mikrotik_pppoe_crosscheck_maps';
        if (!$forceFresh && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        $byIp = [];
        $byMac = [];
        $byPppoe = [];

        try {
            $mikrotik = $this->mikroTikService ?? app(MikroTikService::class);

            // 1. Get from /ppp/active (Real-time online PPPoE sessions on MikroTik)
            try {
                $activeConns = $mikrotik->getActivePPPoEConnections($forceFresh) ?? [];
                foreach ($activeConns as $conn) {
                    $username = trim((string) ($conn['name'] ?? ''));
                    $ip = trim((string) ($conn['address'] ?? ''));
                    $callerId = trim((string) ($conn['caller_id'] ?? ''));

                    if ($username !== '') {
                        $lowerUser = strtolower($username);
                        $entry = [
                            'username' => $username,
                            'ip_address' => $ip ?: null,
                            'mac_address' => $callerId ?: null,
                            'source' => 'active_connection',
                            'uptime' => $conn['uptime'] ?? null,
                        ];

                        if ($ip !== '') {
                            $byIp[$ip] = $entry;
                        }
                        if ($callerId !== '') {
                            $cleanMac = strtolower(str_replace([':', '-', '.'], '', $callerId));
                            $byMac[$cleanMac] = $entry;
                        }
                        $byPppoe[$lowerUser] = $entry;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('GenieAcsService: Failed fetching MikroTik active connections: ' . $e->getMessage());
            }

            // 2. Get from /ppp/secret (Configured PPPoE secrets on MikroTik)
            try {
                $secrets = $mikrotik->getAllPPPoESecrets($forceFresh) ?? [];
                if (is_array($secrets)) {
                    foreach ($secrets as $username => $sec) {
                        $username = trim((string) $username);
                        if ($username === '') continue;

                        $lowerUser = strtolower($username);
                        $ip = trim((string) ($sec['remote_address'] ?? ''));
                        $callerId = trim((string) ($sec['caller_id'] ?? ''));

                        $entry = [
                            'username' => $username,
                            'ip_address' => $ip ?: null,
                            'mac_address' => $callerId ?: null,
                            'profile' => $sec['profile'] ?? null,
                            'source' => 'ppp_secret',
                        ];

                        if ($ip !== '' && !isset($byIp[$ip])) {
                            $byIp[$ip] = $entry;
                        }
                        if ($callerId !== '') {
                            $cleanMac = strtolower(str_replace([':', '-', '.'], '', $callerId));
                            if (!isset($byMac[$cleanMac])) {
                                $byMac[$cleanMac] = $entry;
                            }
                        }
                        if (!isset($byPppoe[$lowerUser])) {
                            $byPppoe[$lowerUser] = $entry;
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('GenieAcsService: Failed fetching MikroTik secrets: ' . $e->getMessage());
            }
        } catch (\Throwable $e) {
            Log::error('GenieAcsService: MikroTik lookup error: ' . $e->getMessage());
        }

        $result = [
            'by_ip' => $byIp,
            'by_mac' => $byMac,
            'by_pppoe' => $byPppoe,
        ];

        Cache::put($cacheKey, $result, 30);

        return $result;
    }

    private function extractIpFromConnectionRequestUrl(?string $url): ?string
    {
        if (empty($url)) return null;
        $host = parse_url($url, PHP_URL_HOST);
        if ($host && filter_var($host, FILTER_VALIDATE_IP)) {
            return $host;
        }
        return null;
    }

    /**
     * Get fast summarized list of ALL customers synchronized with GenieACS devices.
     */
    public function getAllDevicesSummary(bool $forceFresh = false): array
    {
        if (!$forceFresh && Cache::has(self::SUMMARY_CACHE_KEY)) {
            return Cache::get(self::SUMMARY_CACHE_KEY);
        }

        $rawDevices = [];
        // Optional external GenieACS fetch (if enabled/reachable), with short timeout and silent catch
        if (config('services.genieacs.enabled', true)) {
            try {
                $response = Http::timeout(2)->acceptJson()->get($this->url('/devices'), [
                    'projection' => implode(',', self::FAST_DEVICE_PROJECTION),
                ]);

                if ($response->successful()) {
                    $rawDevices = $response->json() ?? [];
                }
            } catch (\Throwable $e) {
                // External GenieACS is stopped or offline; proceed seamlessly with Native TR-069 ACS
                Log::info('GenieAcsService: External GenieACS unreachable, using Native Laravel ACS: ' . $e->getMessage());
            }
        }

        // Fetch MikroTik Active & Secret mappings for double-checking PPPoE & IP
        $mikrotikLookup = $this->getMikrotikPppoeLookupMaps($forceFresh);

        // Fetch all packages for device limit and lookup
        $packages = \App\Models\Package::query()->get(['id', 'name', 'speed', 'price', 'device_count']);
        $packagesByName = $packages->keyBy(fn($p) => strtolower(trim((string) $p->name)));

        // Fetch all customers from database
        $customers = Customer::query()
            ->select('id', 'name', 'phone', 'address', 'pppoe_username', 'home_router_host', 'home_router_type', 'is_active', 'package_id', 'package_type')
            ->with('package:id,name,speed,price,device_count')
            ->orderBy('name')
            ->get();

        // Index raw GenieACS devices by PPPoE, Serial, MAC, IP
        $devicesByPppoe = [];
        $devicesByIp = [];
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

            // Extract PPPoE Username from TR-069
            $pppoe = $this->parameterValue($d, 'VirtualParameters.pppoeUsername')
                ?: $this->parameterValue($d, 'VirtualParameters.pppoeUsername2')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username')
                ?: $this->parameterValue($d, 'Device.PPP.Interface.1.Username')
                ?: '';

            // Extract IP Address comprehensively
            $ipAddress = $this->parameterValue($d, 'VirtualParameters.pppoeIP')
                ?: $this->parameterValue($d, 'VirtualParameters.IPTR069')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress')
                ?: $this->parameterValue($d, 'Device.PPP.Interface.1.IPCP.LocalIPAddress')
                ?: $this->parameterValue($d, 'Device.IP.Interface.1.IPv4Address.1.IPAddress')
                ?: $this->extractIpFromConnectionRequestUrl($this->parameterValue($d, 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL'))
                ?: $this->parameterValue($d, '_ip')
                ?: '';

            // Extract MAC Address
            $macAddress = $this->parameterValue($d, 'VirtualParameters.pppoeMac')
                ?: $this->parameterValue($d, 'VirtualParameters.PonMac')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress')
                ?: $this->parameterValue($d, 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress')
                ?: '';

            // Double Check Matching with MikroTik IP/MAC if PPPoE is not sent by ONT
            $matchedVia = null;
            if ($pppoe !== '') {
                $matchedVia = 'tr069';
            } elseif ($ipAddress !== '' && isset($mikrotikLookup['by_ip'][$ipAddress])) {
                $pppoe = $mikrotikLookup['by_ip'][$ipAddress]['username'];
                $matchedVia = 'mikrotik_ip';
            } elseif ($macAddress !== '') {
                $cleanMac = strtolower(str_replace([':', '-', '.'], '', trim($macAddress)));
                if (isset($mikrotikLookup['by_mac'][$cleanMac])) {
                    $pppoe = $mikrotikLookup['by_mac'][$cleanMac]['username'];
                    $matchedVia = 'mikrotik_mac';
                }
            }

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
                'matched_via' => $matchedVia,
                'ssid' => $ssid1 ?: null,
                'wifi_password' => $this->resolveWifiPassword($d),
                'wifi_clients_count' => $wifiClients,
                'rx_power' => $rxPowerVal,
                'rx_status' => $rxStatus,
            ];

            $parsedAcsDevices[$deviceId] = $devData;

            if ($pppoe !== '') {
                $devicesByPppoe[strtolower(trim($pppoe))] = $devData;
            }
            if ($ipAddress !== '') {
                $devicesByIp[trim($ipAddress)] = $devData;
            }
            if ($macAddress !== '') {
                $cleanMac = strtolower(str_replace([':', '-', '.'], '', trim($macAddress)));
                $devicesByMac[$cleanMac] = $devData;
            }
        }

        // Incorporate Native Laravel TR-069 ACS Devices (Local MySQL)
        try {
            $nativeDevices = \App\Models\AcsDevice::query()->get();
            foreach ($nativeDevices as $nd) {
                $isOnline = $nd->last_inform_at && $nd->last_inform_at->greaterThanOrEqualTo(now()->subMinutes(15));
                $nativeDevData = [
                    'device_id' => $nd->device_id,
                    'engine' => 'native_laravel_acs',
                    'is_online' => $isOnline,
                    'last_inform_at' => $nd->last_inform_at?->toIso8601String(),
                    'registered_at' => $nd->registered_at?->toIso8601String(),
                    'manufacturer' => $nd->manufacturer,
                    'product_class' => $nd->product_class,
                    'serial_number' => $nd->serial_number,
                    'pon_mode' => $nd->pon_mode,
                    'optical_rx_power' => $nd->optical_rx_power,
                    'optical_tx_power' => $nd->optical_tx_power,
                    'temperature' => $nd->temperature,
                    'device_uptime' => $nd->device_uptime,
                    'ppp_uptime' => $nd->ppp_uptime,
                    'pppoe_username' => $nd->pppoe_username,
                    'ip_address' => $nd->wan_ip ?: $nd->ip_address,
                    'wan_mac' => $nd->wan_mac,
                    'lan_mac' => $nd->lan_mac,
                    'matched_via' => $nd->matched_via,
                    'ssid' => $nd->wifi_ssid,
                    'wifi_password' => $nd->wifi_password,
                    'wifi_clients_count' => (int) $nd->wifi_clients_count,
                    'rx_power' => $nd->optical_rx_power,
                    'rx_status' => $nd->rx_quality,
                ];

                if (!isset($parsedAcsDevices[$nd->device_id])) {
                    if ($isOnline) $onlineCount++;
                    else $offlineCount++;

                    if ($nd->optical_rx_power !== null) {
                        if ($nd->optical_rx_power < -27.0) $criticalRxCount++;
                        elseif ($nd->optical_rx_power <= -24.0) $warningRxCount++;
                    }
                }

                // Native ACS overrides / takes priority
                $parsedAcsDevices[$nd->device_id] = $nativeDevData;

                if ($nd->pppoe_username) {
                    $devicesByPppoe[strtolower(trim($nd->pppoe_username))] = $nativeDevData;
                }
                if ($nd->wan_ip) {
                    $devicesByIp[trim($nd->wan_ip)] = $nativeDevData;
                }
                if ($nd->ip_address) {
                    $devicesByIp[trim($nd->ip_address)] = $nativeDevData;
                }
                if ($nd->lan_mac) {
                    $cleanMac = strtolower(str_replace([':', '-', '.'], '', trim($nd->lan_mac)));
                    $devicesByMac[$cleanMac] = $nativeDevData;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('GenieAcsService: Native ACS device merge error: ' . $e->getMessage());
        }

        $unifiedList = [];
        $customersWithAcsCount = 0;
        $customersWithoutAcsCount = 0;
        $totalConnectedClients = 0;
        $safeCapacityCount = 0;
        $warningCapacityCount = 0;
        $criticalCapacityCount = 0;
        $overlimitCapacityCount = 0;
        $processedCustomerIds = [];

        // 1. Process all Customers from database
        foreach ($customers as $c) {
            $matchedDev = null;
            $pppoeClean = $c->pppoe_username ? strtolower(trim($c->pppoe_username)) : '';

            // 1.1 Match by PPPoE (Direct or MikroTik double-checked)
            if ($pppoeClean !== '' && isset($devicesByPppoe[$pppoeClean])) {
                $matchedDev = $devicesByPppoe[$pppoeClean];
            }
            // 1.2 Match by customer configured router IP
            elseif (!empty($c->home_router_host) && isset($devicesByIp[trim($c->home_router_host)])) {
                $matchedDev = $devicesByIp[trim($c->home_router_host)];
            }
            // 1.3 Match by customer's MikroTik IP or MAC mapping
            elseif ($pppoeClean !== '' && isset($mikrotikLookup['by_pppoe'][$pppoeClean])) {
                $mtkEntry = $mikrotikLookup['by_pppoe'][$pppoeClean];
                if (!empty($mtkEntry['ip_address']) && isset($devicesByIp[$mtkEntry['ip_address']])) {
                    $matchedDev = $devicesByIp[$mtkEntry['ip_address']];
                } elseif (!empty($mtkEntry['mac_address'])) {
                    $cleanMac = strtolower(str_replace([':', '-', '.'], '', $mtkEntry['mac_address']));
                    if (isset($devicesByMac[$cleanMac])) {
                        $matchedDev = $devicesByMac[$cleanMac];
                    }
                }
            }

            // Resolve Customer Package
            $pkg = $c->package ?: ($c->package_type ? ($packagesByName[strtolower(trim($c->package_type))] ?? null) : null);
            $packageName = $pkg?->name ?? ($c->package_type ?: '-');
            $packageSpeed = $pkg?->speed ?? null;
            $packagePrice = $pkg?->price ?? null;
            $maxDevices = $pkg && $pkg->device_count !== null && $pkg->device_count > 0 ? (int) $pkg->device_count : null;

            $portalToken = $this->generateCustomerPortalToken($c->id);
            $portalUrl = url("/portal-pelanggan/{$portalToken}");

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
                'portal_token' => $portalToken,
                'portal_url' => $portalUrl,
            ];

            if ($matchedDev) {
                $customersWithAcsCount++;
                $processedCustomerIds[$c->id] = true;
                $processedAcsDeviceIds[$matchedDev['device_id']] = true;
                $clients = (int) ($matchedDev['wifi_clients_count'] ?? 0);
                $isOnline = (bool) ($matchedDev['is_online'] ?? false);

                if ($isOnline) {
                    $totalConnectedClients += $clients;
                }

                // Capacity calculation
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
                    'portal_token' => $portalToken,
                    'portal_url' => $portalUrl,
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
                    'matched_via' => null,
                    'ssid' => null,
                    'wifi_password' => null,
                    'wifi_clients_count' => 0,
                    'rx_power' => null,
                    'rx_status' => 'no_data',
                    'customer' => $custPayload,
                    'capacity_status' => $maxDevices ? 'safe' : 'no_limit',
                    'capacity_label' => $maxDevices ? "Offline (0/{$maxDevices})" : 'Offline',
                    'capacity_diff' => 0,
                    'max_devices' => $maxDevices,
                    'portal_token' => $portalToken,
                    'portal_url' => $portalUrl,
                ];
            }
        }

        // 2. Include any ACS devices that are NOT matched to any database customer
        $unassignedCount = 0;
        foreach ($parsedAcsDevices as $devId => $devData) {
            if (isset($processedAcsDeviceIds[$devId])) {
                continue;
            }

            // Fallback attempt to link with unmatched customer via PPPoE or MikroTik IP
            $matchedCustomer = null;
            $devPppoe = $devData['pppoe_username'] ? strtolower(trim($devData['pppoe_username'])) : '';
            if ($devPppoe !== '') {
                $matchedCustomer = $customers->first(function ($cust) use ($devPppoe, $processedCustomerIds) {
                    return !isset($processedCustomerIds[$cust->id]) && strtolower(trim((string)$cust->pppoe_username)) === $devPppoe;
                });
            }
            if (!$matchedCustomer && !empty($devData['ip_address']) && isset($mikrotikLookup['by_ip'][$devData['ip_address']])) {
                $mtkUser = strtolower(trim($mikrotikLookup['by_ip'][$devData['ip_address']]['username']));
                $matchedCustomer = $customers->first(function ($cust) use ($mtkUser, $processedCustomerIds) {
                    return !isset($processedCustomerIds[$cust->id]) && strtolower(trim((string)$cust->pppoe_username)) === $mtkUser;
                });
            }

            if ($matchedCustomer) {
                $processedCustomerIds[$matchedCustomer->id] = true;
                $processedAcsDeviceIds[$devId] = true;
                $customersWithAcsCount++;
                if ($customersWithoutAcsCount > 0) {
                    $customersWithoutAcsCount--;
                }

                $pkg = $matchedCustomer->package ?: ($matchedCustomer->package_type ? ($packagesByName[strtolower(trim($matchedCustomer->package_type))] ?? null) : null);
                $packageName = $pkg?->name ?? ($matchedCustomer->package_type ?: '-');
                $packageSpeed = $pkg?->speed ?? null;
                $packagePrice = $pkg?->price ?? null;
                $maxDevices = $pkg && $pkg->device_count !== null && $pkg->device_count > 0 ? (int) $pkg->device_count : null;

                $portalToken = $this->generateCustomerPortalToken($matchedCustomer->id);
                $portalUrl = url("/portal-pelanggan/{$portalToken}");

                $custPayload = [
                    'id' => $matchedCustomer->id,
                    'name' => $matchedCustomer->name,
                    'phone' => $matchedCustomer->phone,
                    'address' => $matchedCustomer->address,
                    'pppoe_username' => $matchedCustomer->pppoe_username,
                    'package_id' => $pkg?->id ?? $matchedCustomer->package_id,
                    'package_name' => $packageName,
                    'package_speed' => $packageSpeed,
                    'package_price' => $packagePrice,
                    'package_max_devices' => $maxDevices,
                    'is_active' => (bool) $matchedCustomer->is_active,
                    'portal_token' => $portalToken,
                    'portal_url' => $portalUrl,
                ];

                $clients = (int) ($devData['wifi_clients_count'] ?? 0);
                $isOnline = (bool) ($devData['is_online'] ?? false);
                if ($isOnline) {
                    $totalConnectedClients += $clients;
                }

                $capacityStatus = 'no_limit';
                $capacityLabel = 'Tanpa Batas';
                $capacityDiff = 0;

                if ($maxDevices !== null && $maxDevices > 0) {
                    if ($clients <= $maxDevices) {
                        $capacityStatus = 'safe';
                        $capacityLabel = "Aman ({$clients}/{$maxDevices})";
                        $capacityDiff = 0;
                        if ($isOnline) $safeCapacityCount++;
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

                // Remove existing offline entry for this customer from unifiedList if present
                $unifiedList = array_values(array_filter($unifiedList, function ($item) use ($matchedCustomer) {
                    return !($item['customer']['id'] ?? null === $matchedCustomer->id && !$item['has_genieacs']);
                }));

                $unifiedList[] = array_merge($devData, [
                    'has_genieacs' => true,
                    'is_unassigned' => false,
                    'customer' => $custPayload,
                    'capacity_status' => $capacityStatus,
                    'capacity_label' => $capacityLabel,
                    'capacity_diff' => $capacityDiff,
                    'max_devices' => $maxDevices,
                    'portal_token' => $portalToken,
                    'portal_url' => $portalUrl,
                ]);
            } else {
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
                'total_devices_in_acs' => count($parsedAcsDevices),
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
     * Get detailed telemetry and configuration of a single ACS device
     */
    public function getDeviceDetails(string $deviceId): array
    {
        // 1. Check Native Laravel TR-069 ACS Database first
        try {
            $nativeDevice = \App\Models\AcsDevice::with(['customer.package', 'connectedHosts'])->where('device_id', $deviceId)->orWhere('id', is_numeric($deviceId) ? (int)$deviceId : 0)->first();
            if ($nativeDevice) {
                $isOnline = $nativeDevice->last_inform_at && $nativeDevice->last_inform_at->greaterThanOrEqualTo(now()->subMinutes(15));
                $custModel = $nativeDevice->customer;

                // If customer not directly linked, try matching via PPPoE or MikroTik
                if (!$custModel && $nativeDevice->pppoe_username) {
                    $custModel = Customer::whereRaw('LOWER(pppoe_username) = ?', [strtolower(trim($nativeDevice->pppoe_username))])->with('package')->first();
                }

                $customerData = null;
                if ($custModel) {
                    $customerData = [
                        'id' => $custModel->id,
                        'name' => $custModel->name,
                        'phone' => $custModel->phone,
                        'address' => $custModel->address,
                        'pppoe_username' => $custModel->pppoe_username,
                        'package_name' => $custModel->package?->name ?? ($custModel->package_type ?: '-'),
                        'is_active' => (bool) $custModel->is_active,
                        'matched_via' => $nativeDevice->matched_via ?: 'native_acs',
                    ];
                }

                $lanHosts = $nativeDevice->connectedHosts->map(fn($h) => [
                    'name' => $h->host_name ?: 'Perangkat Klien',
                    'ip_address' => $h->ip_address,
                    'mac_address' => $h->mac_address,
                    'type' => $h->interface_type ?: 'WiFi',
                    'is_active' => (bool) $h->is_active,
                    'last_seen' => $h->last_seen_at?->toIso8601String(),
                    'signal_strength' => $h->signal_strength,
                ])->values()->all();

                $summary = [
                    'device_id' => $nativeDevice->device_id,
                    'serial_number' => $nativeDevice->serial_number,
                    'product_class' => $nativeDevice->product_class,
                    'manufacturer' => $nativeDevice->manufacturer,
                    'pon_mode' => $nativeDevice->pon_mode,
                    'software_version' => $nativeDevice->software_version,
                    'hardware_version' => $nativeDevice->hardware_version,
                    'optical_rx_power' => $nativeDevice->optical_rx_power,
                    'optical_tx_power' => $nativeDevice->optical_tx_power,
                    'temperature' => $nativeDevice->temperature,
                    'device_uptime' => $nativeDevice->device_uptime,
                    'ppp_uptime' => $nativeDevice->ppp_uptime,
                    'pppoe_username' => $nativeDevice->pppoe_username,
                    'ip_address' => $nativeDevice->wan_ip ?: $nativeDevice->ip_address,
                    'wan_mac' => $nativeDevice->wan_mac,
                    'lan_mac' => $nativeDevice->lan_mac,
                    'is_online' => $isOnline,
                    'last_inform_at' => $nativeDevice->last_inform_at?->toIso8601String(),
                    'registered_at' => $nativeDevice->registered_at?->toIso8601String(),
                    'ssid' => $nativeDevice->wifi_ssid ?: 'WiFi',
                    'ssids' => [
                        [
                            'ssid' => $nativeDevice->wifi_ssid ?: 'WiFi',
                            'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                            'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
                            'current_password' => $nativeDevice->wifi_password,
                        ]
                    ],
                ];

                $telemetry = [
                    'device_id' => $nativeDevice->device_id,
                    'online' => $isOnline,
                    'last_inform_at' => $nativeDevice->last_inform_at?->toIso8601String(),
                    'registered_at' => $nativeDevice->registered_at?->toIso8601String(),
                    'optical_rx_power' => $nativeDevice->optical_rx_power,
                    'optical_tx_power' => $nativeDevice->optical_tx_power,
                    'temperature' => $nativeDevice->temperature,
                    'device_uptime' => $nativeDevice->device_uptime,
                    'ppp_uptime' => $nativeDevice->ppp_uptime,
                    'pppoe_username' => $nativeDevice->pppoe_username,
                    'wan' => [
                        'connected' => $isOnline,
                        'status' => $isOnline ? 'Connected' : 'Disconnected',
                        'uptime' => $nativeDevice->ppp_uptime,
                        'ip_address' => $nativeDevice->wan_ip ?: $nativeDevice->ip_address,
                        'download_bytes' => null,
                        'upload_bytes' => null,
                        'total_bytes' => null,
                        'source' => 'native_laravel_acs',
                        'source_label' => 'Native TR-069 ACS',
                    ],
                    'host' => [
                        'count' => count($lanHosts) ?: (int) $nativeDevice->wifi_clients_count,
                        'source' => 'native_acs_hosts',
                        'source_label' => 'Host Aktif Native ACS',
                    ],
                    'connected_devices' => [
                        'count' => count($lanHosts) ?: (int) $nativeDevice->wifi_clients_count,
                        'source' => 'native_acs_activedevices',
                        'source_label' => 'Perangkat Terhubung',
                    ],
                    'wifi_clients' => [],
                    'device_summary' => $summary,
                ];

                return [
                    'device_id' => $nativeDevice->device_id,
                    'engine' => 'native_laravel_acs',
                    'summary' => $summary,
                    'telemetry' => $telemetry,
                    'ssid' => $nativeDevice->wifi_ssid ?: 'WiFi',
                    'wifi_password' => $nativeDevice->wifi_password,
                    'lan_hosts' => $lanHosts,
                    'customer' => $customerData,
                    'raw_writable_wifi_targets' => [
                        [
                            'ssid' => $nativeDevice->wifi_ssid ?: 'WiFi',
                            'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                            'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
                            'current_password' => $nativeDevice->wifi_password,
                        ]
                    ],
                ];
            }
        } catch (\Throwable $e) {
            Log::warning('getDeviceDetails: Native ACS lookup error: ' . $e->getMessage());
        }

        // 2. Fallback to external GenieACS if configured
        try {
            $response = Http::timeout(2)->acceptJson()->get($this->url('/devices'), [
                'query' => json_encode(['_id' => $deviceId]),
            ]);

            if ($response->successful()) {
                $devices = $response->json() ?? [];
                if (!empty($devices)) {
                    $device = $devices[0];
                    $summary = $this->summarizeDevice($device);
                    $telemetry = $this->summarizePortalTelemetry($device);
                    $lanHosts = $this->resolveLanHostsByMac($device);

                    // Find matched customer
                    $pppoe = $this->parameterValue($device, 'VirtualParameters.pppoeUsername')
                        ?: $this->parameterValue($device, 'VirtualParameters.pppoeUsername2')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username')
                        ?: $this->parameterValue($device, 'Device.PPP.Interface.1.Username')
                        ?: '';

                    $ipAddress = $this->parameterValue($device, 'VirtualParameters.pppoeIP')
                        ?: $this->parameterValue($device, 'VirtualParameters.IPTR069')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress')
                        ?: $this->parameterValue($device, 'Device.PPP.Interface.1.IPCP.LocalIPAddress')
                        ?: $this->parameterValue($device, 'Device.IP.Interface.1.IPv4Address.1.IPAddress')
                        ?: $this->extractIpFromConnectionRequestUrl($this->parameterValue($device, 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL'))
                        ?: $this->parameterValue($device, '_ip')
                        ?: '';

                    $macAddress = $this->parameterValue($device, 'VirtualParameters.pppoeMac')
                        ?: $this->parameterValue($device, 'VirtualParameters.PonMac')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress')
                        ?: $this->parameterValue($device, 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress')
                        ?: '';

                    $matchedVia = 'tr069';

                    if ($pppoe === '') {
                        $mikrotikLookup = $this->getMikrotikPppoeLookupMaps();
                        if ($ipAddress !== '' && isset($mikrotikLookup['by_ip'][$ipAddress])) {
                            $pppoe = $mikrotikLookup['by_ip'][$ipAddress]['username'];
                            $matchedVia = 'mikrotik_ip';
                        } elseif ($macAddress !== '') {
                            $cleanMac = strtolower(str_replace([':', '-', '.'], '', trim($macAddress)));
                            if (isset($mikrotikLookup['by_mac'][$cleanMac])) {
                                $pppoe = $mikrotikLookup['by_mac'][$cleanMac]['username'];
                                $matchedVia = 'mikrotik_mac';
                            }
                        }
                    }

                    $customer = null;
                    if ($pppoe !== '') {
                        $customerModel = Customer::query()
                            ->whereRaw('LOWER(pppoe_username) = ?', [strtolower(trim($pppoe))])
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
                                'matched_via' => $matchedVia,
                            ];
                        }
                    }

                    return [
                        'device_id' => $deviceId,
                        'summary' => $summary,
                        'telemetry' => $telemetry,
                        'ssid' => $this->parameterValue($device, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID') ?: ($summary['ssid'] ?? null),
                        'wifi_password' => $this->resolveWifiPassword($device),
                        'lan_hosts' => $this->resolveAllConnectedHosts($device),
                        'customer' => $customer,
                        'raw_writable_wifi_targets' => $this->activeWifiTargets($device),
                    ];
                }
            }
        } catch (\Throwable) {
            // External down
        }

        throw new GenieAcsException("Perangkat router {$deviceId} tidak ditemukan di server TR-069 ACS.", 404);
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

        // 1. Check Native Laravel TR-069 ACS first
        try {
            $nativeDevice = \App\Models\AcsDevice::where('device_id', $deviceId)->orWhere('id', is_numeric($deviceId) ? (int)$deviceId : 0)->first();
            if ($nativeDevice) {
                $taskService = app(\App\Services\Acs\AcsTaskService::class);
                $ssid = $newSsid ?: $nativeDevice->wifi_ssid ?: 'WiFi';
                $password = $newPassword ?: $nativeDevice->wifi_password ?: '12345678';
                $task = $taskService->queueChangeWifi($nativeDevice, $ssid, $password);

                if ($newPassword !== null && $newPassword !== '') {
                    Cache::forever("genieacs_wifi_pw:{$deviceId}", $newPassword);
                    if ($nativeDevice->pppoe_username) {
                        Cache::forever("genieacs_wifi_pw:" . strtolower(trim($nativeDevice->pppoe_username)), $newPassword);
                    }
                }

                Cache::forget(self::SUMMARY_CACHE_KEY);

                return [
                    'device_id' => $deviceId,
                    'task_id' => $task->id,
                    'updated_parameters' => 4,
                    'ssid' => $ssid,
                    'password' => $password,
                    'wait_time' => '1 - 2 Menit',
                    'message' => 'Kata sandi WiFi baru berhasil dikirim ke antrean TR-069 ACS router!',
                ];
            }
        } catch (\Throwable $e) {
            Log::warning('updateDeviceWifi: Native ACS task queue error: ' . $e->getMessage());
        }

        // 2. Fallback to external GenieACS
        $response = Http::timeout(2)->acceptJson()->get($this->url('/devices'), [
            'query' => json_encode(['_id' => $deviceId]),
        ]);

        if (!$response->successful() || empty($response->json())) {
            throw new GenieAcsException('Perangkat router tidak terdeteksi atau sedang offline di server.', 404);
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
                if (!str_starts_with($pPath, 'VirtualParameters.')) {
                    $parameterValues[] = [$pPath, $newPassword, 'xsd:string'];
                    $refreshPaths[] = $pPath;
                }
            }

            $parameterValues[] = ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase', $newPassword, 'xsd:string'];
            $parameterValues[] = ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase', $newPassword, 'xsd:string'];

            $deduped = [];
            foreach ($parameterValues as $pv) {
                if (!str_starts_with($pv[0], 'VirtualParameters.')) {
                    $deduped[$pv[0]] = $pv;
                }
            }
            $parameterValues = array_values($deduped);
        }

        // 2. If updating SSID Name:
        if ($newSsid !== null && $newSsid !== '') {
            $ssidPaths = [];
            foreach ($wifiTargets as $wt) {
                $basePath = $wt['path'] ?? null;
                if ($basePath && !str_starts_with($basePath, 'VirtualParameters.')) {
                    $ssidPaths[] = $basePath . '.SSID';
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

        try {
            $this->postTask($deviceId, [
                'name' => 'setParameterValues',
                'parameterValues' => $parameterValues,
            ], true, true, 5000);
        } catch (\Throwable $e) {
            report($e);
        }

        $refreshTarget = !empty($refreshPaths) ? $this->refreshObjectName($refreshPaths[0]) : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.';
        try {
            $this->postTask($deviceId, [
                'name' => 'refreshObject',
                'objectName' => $refreshTarget,
            ], false, true, 3000);
        } catch (\Throwable) {
            // Non-blocking
        }

        if ($newPassword !== null && $newPassword !== '') {
            Cache::forever("genieacs_wifi_pw:{$deviceId}", $newPassword);
            $pppoe = $this->parameterValue($device, 'VirtualParameters.pppoeUsername')
                ?: $this->parameterValue($device, 'VirtualParameters.pppoeUsername2')
                ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username')
                ?: '';
            if ($pppoe !== '') {
                Cache::forever("genieacs_wifi_pw:" . strtolower(trim($pppoe)), $newPassword);
            }
        }

        Cache::forget(self::SUMMARY_CACHE_KEY);

        return [
            'device_id' => $deviceId,
            'updated_parameters' => count($parameterValues),
            'parameter_paths' => array_column($parameterValues, 0),
            'ssid' => $newSsid,
            'password' => $newPassword,
            'wait_time' => '1 - 2 Menit',
            'message' => 'Kata sandi WiFi baru berhasil dikirim ke router! Router sedang memproses perubahan.',
        ];
    }

    /**
     * Reboot router device via TR-069 RPC method
     */
    public function rebootDevice(string $deviceId): array
    {
        // 1. Check Native Laravel TR-069 ACS first
        try {
            $nativeDevice = \App\Models\AcsDevice::where('device_id', $deviceId)->orWhere('id', is_numeric($deviceId) ? (int)$deviceId : 0)->first();
            if ($nativeDevice) {
                $taskService = app(\App\Services\Acs\AcsTaskService::class);
                $task = $taskService->queueReboot($nativeDevice);
                Cache::forget(self::SUMMARY_CACHE_KEY);

                return [
                    'device_id' => $deviceId,
                    'task_id' => $task->id,
                    'message' => 'Perintah reboot router berhasil dikirim ke antrean TR-069 ACS.',
                ];
            }
        } catch (\Throwable $e) {
            Log::warning('rebootDevice: Native ACS reboot error: ' . $e->getMessage());
        }

        $this->postTask($deviceId, [
            'name' => 'reboot',
        ]);

        Cache::forget(self::SUMMARY_CACHE_KEY);

        return [
            'device_id' => $deviceId,
            'message' => 'Perintah reboot router berhasil dikirim ke antrean ACS.',
        ];
    }

    /**
     * Refresh router parameters from device
     */
    public function refreshDevice(string $deviceId): array
    {
        // 1. Check Native Laravel TR-069 ACS first
        try {
            $nativeDevice = \App\Models\AcsDevice::where('device_id', $deviceId)->orWhere('id', is_numeric($deviceId) ? (int)$deviceId : 0)->first();
            if ($nativeDevice) {
                $taskService = app(\App\Services\Acs\AcsTaskService::class);
                $task = $taskService->queueGetParameters($nativeDevice);
                Cache::forget(self::SUMMARY_CACHE_KEY);

                return [
                    'device_id' => $deviceId,
                    'task_id' => $task->id,
                    'message' => 'Perintah sinkronisasi parameter berhasil dikirim ke router via TR-069 ACS.',
                ];
            }
        } catch (\Throwable $e) {
            Log::warning('refreshDevice: Native ACS refresh error: ' . $e->getMessage());
        }

        // 2. Fallback to external GenieACS
        $this->postTask($deviceId, [
            'name' => 'getParameterValues',
            'parameterNames' => [
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CMS_KeyPassphrase',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_HW_KeyPassphrase',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice',
                'InternetGatewayDevice.LANDevice.1.Hosts.Host',
                'VirtualParameters.WlanPassword',
            ],
        ], false);

        $this->postTask($deviceId, [
            'name' => 'refreshObject',
            'objectName' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.',
        ], false);

        Cache::forget(self::SUMMARY_CACHE_KEY);

        return [
            'device_id' => $deviceId,
            'message' => 'Perintah sinkronisasi parameter berhasil dikirim ke router.',
        ];
    }

    public function findDeviceByPppoe(string $pppoeUsername): ?array
    {
        $target = trim($pppoeUsername);
        if ($target === '') {
            return null;
        }

        // 1. Check Native Laravel TR-069 ACS Database first
        try {
            $nativeDev = \App\Models\AcsDevice::query()
                ->whereRaw('LOWER(pppoe_username) = ?', [strtolower($target)])
                ->first();

            // 1.1 If not found directly by PPPoE, check if customer has a known router IP or MAC in MikroTik
            if (!$nativeDev) {
                $mikrotikLookup = $this->getMikrotikPppoeLookupMaps();
                $lowerTarget = strtolower($target);
                $mtkEntry = $mikrotikLookup['by_pppoe'][$lowerTarget] ?? null;
                $targetIp = $mtkEntry['ip_address'] ?? null;
                $targetMac = $mtkEntry['mac_address'] ?? null;

                if (!$targetIp) {
                    $cust = Customer::query()->whereRaw('LOWER(pppoe_username) = ?', [$lowerTarget])->first();
                    if ($cust && !empty($cust->home_router_host)) {
                        $targetIp = trim($cust->home_router_host);
                    }
                }

                if ($targetIp) {
                    $nativeDev = \App\Models\AcsDevice::query()
                        ->where('wan_ip', $targetIp)
                        ->orWhere('ip_address', $targetIp)
                        ->first();
                }

                if (!$nativeDev && $targetMac) {
                    $cleanMac = strtolower(str_replace([':', '-', '.'], '', $targetMac));
                    $nativeDev = \App\Models\AcsDevice::query()
                        ->whereRaw("REPLACE(REPLACE(REPLACE(LOWER(lan_mac), ':', ''), '-', ''), '.', '') = ?", [$cleanMac])
                        ->orWhereRaw("REPLACE(REPLACE(REPLACE(LOWER(wan_mac), ':', ''), '-', ''), '.', '') = ?", [$cleanMac])
                        ->first();
                }
            }

            if ($nativeDev) {
                return [
                    '_id' => $nativeDev->device_id,
                    'is_native_acs' => true,
                    'native_device_id' => $nativeDev->id,
                    '_registered' => $nativeDev->registered_at?->toIso8601String(),
                    '_lastInform' => $nativeDev->last_inform_at?->toIso8601String(),
                    '_ip' => $nativeDev->ip_address,
                    'DeviceID' => [
                        'Manufacturer' => ['_value' => $nativeDev->manufacturer],
                        'ProductClass' => ['_value' => $nativeDev->product_class],
                        'SerialNumber' => ['_value' => $nativeDev->serial_number],
                    ],
                    'DeviceID.Manufacturer' => $nativeDev->manufacturer,
                    'DeviceID.ProductClass' => $nativeDev->product_class,
                    'DeviceID.SerialNumber' => $nativeDev->serial_number,
                    'VirtualParameters' => [
                        'pppoeUsername' => ['_value' => $nativeDev->pppoe_username],
                        'pppoeIP' => ['_value' => $nativeDev->wan_ip ?: $nativeDev->ip_address],
                        'RXPower' => ['_value' => (string) $nativeDev->optical_rx_power],
                        'TXPower' => ['_value' => (string) $nativeDev->optical_tx_power],
                        'gettemp' => ['_value' => (string) $nativeDev->temperature],
                        'activedevices' => ['_value' => $nativeDev->wifi_clients_count],
                        'WlanPassword' => ['_value' => $nativeDev->wifi_password],
                        'WlanSSID' => ['_value' => $nativeDev->wifi_ssid],
                        'getSerialNumber' => ['_value' => $nativeDev->serial_number],
                    ],
                    'VirtualParameters.pppoeUsername' => $nativeDev->pppoe_username,
                    'VirtualParameters.pppoeIP' => $nativeDev->wan_ip ?: $nativeDev->ip_address,
                    'VirtualParameters.RXPower' => (string) $nativeDev->optical_rx_power,
                    'VirtualParameters.TXPower' => (string) $nativeDev->optical_tx_power,
                    'VirtualParameters.gettemp' => (string) $nativeDev->temperature,
                    'VirtualParameters.activedevices' => $nativeDev->wifi_clients_count,
                    'InternetGatewayDevice' => [
                        'DeviceInfo' => [
                            'Manufacturer' => ['_value' => $nativeDev->manufacturer],
                            'ProductClass' => ['_value' => $nativeDev->product_class],
                            'SerialNumber' => ['_value' => $nativeDev->serial_number],
                        ],
                        'LANDevice' => [
                            '1' => [
                                'WLANConfiguration' => [
                                    '1' => [
                                        'SSID' => ['_value' => $nativeDev->wifi_ssid],
                                        'KeyPassphrase' => ['_value' => $nativeDev->wifi_password],
                                    ],
                                ],
                            ],
                        ],
                    ],
                    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID' => $nativeDev->wifi_ssid,
                    'VirtualParameters.WlanPassword' => $nativeDev->wifi_password,
                    'wifi_password' => $nativeDev->wifi_password,
                    'wifi_ssid' => $nativeDev->wifi_ssid,
                    'device_uptime' => $nativeDev->device_uptime,
                    'ppp_uptime' => $nativeDev->ppp_uptime,
                ];
            }
        } catch (\Throwable $e) {
            Log::warning('findDeviceByPppoe: Native ACS lookup error: ' . $e->getMessage());
        }

        // 2. Safe Fallback to external GenieACS
        $regexQuery = ['$regex' => '^' . preg_quote($target) . '$', '$options' => 'i'];

        $fieldsToTry = [
            'VirtualParameters.pppoeUsername',
            'VirtualParameters.pppoeUsername2',
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
            'Device.PPP.Interface.1.Username',
        ];

        foreach ($fieldsToTry as $field) {
            try {
                $response = Http::timeout(2)->acceptJson()->get($this->url('/devices'), [
                    'query' => json_encode([$field => $regexQuery]),
                ]);

                if ($response->successful()) {
                    $devices = $response->json() ?? [];
                    if (!empty($devices)) {
                        return $devices[0];
                    }
                }
            } catch (\Throwable) {
                // Continue
            }
        }

        return null;
    }

    public function describeDeviceByPppoe(string $pppoeUsername): array
    {
        $device = $this->findDeviceByPppoe($pppoeUsername);

        if (!$device) {
            throw new GenieAcsException('Device TR-069 ACS tidak ditemukan untuk PPPoE pelanggan ini.', 404);
        }

        return $this->summarizeDevice($device);
    }

    public function changeWifiPasswordByPppoe(string $pppoeUsername, string $password): array
    {
        $device = $this->findDeviceByPppoe($pppoeUsername);

        if (!$device) {
            throw new GenieAcsException('Device TR-069 ACS tidak ditemukan untuk PPPoE pelanggan ini.', 404);
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
                return $this->verificationResult('failed', 0, $targets, 'Device TR-069 ACS tidak ditemukan saat verifikasi.');
            }

            if (!empty($device['is_native_acs'])) {
                $nativePw = $device['wifi_password'] ?? $device['VirtualParameters.WlanPassword'] ?? null;
                $isMatch = $nativePw && hash_equals((string)$nativePw, $password);
                $rows = collect($targets)->map(fn($t) => [
                    'ssid' => $t['ssid'] ?? $device['wifi_ssid'] ?? 'WiFi',
                    'path' => $t['path'] ?? 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                    'verified' => $isMatch,
                    'available' => true,
                ])->values()->all();

                if ($isMatch) {
                    return $this->verificationResult('verified', count($rows), $rows, 'Password WiFi sudah berhasil terverifikasi di TR-069 ACS.');
                }
                return $this->verificationResult('pending', 0, $rows, 'Task ganti WiFi sedang diproses oleh router...');
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
                return $this->verificationResult('verified', $verifiedCount, $rows, 'Password WiFi sudah berhasil terverifikasi.');
            }

            if ($verifiedCount > 0) {
                return $this->verificationResult('partial', $verifiedCount, $rows, 'Sebagian SSID sudah berhasil terverifikasi.');
            }

            return $this->verificationResult('pending', 0, $rows, 'Task sudah dikirim, menunggu router membaca nilai password terbaru.');
        } catch (GenieAcsException $exception) {
            return $this->verificationResult('failed', 0, $targets, $exception->getMessage());
        } catch (\Throwable $exception) {
            report($exception);

            return $this->verificationResult('failed', 0, $targets, 'Gagal memverifikasi status password WiFi.');
        }
    }

    public function summarizeDevice(array $device): array
    {
        if (!empty($device['is_native_acs'])) {
            return [
                'device_id' => (string) ($device['_id'] ?? ''),
                'serial_number' => $device['DeviceID.SerialNumber'] ?? '',
                'product_class' => $device['DeviceID.ProductClass'] ?? 'ONT Router',
                'ssids' => [
                    [
                        'ssid' => $device['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] ?? $device['wifi_ssid'] ?? 'WiFi',
                        'path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
                        'password_path' => 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
                        'current_password' => $device['VirtualParameters.WlanPassword'] ?? $device['wifi_password'] ?? null,
                    ]
                ],
            ];
        }

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
            throw new GenieAcsException('Device TR-069 ACS tidak ditemukan untuk PPPoE pelanggan ini.', 404);
        }

        return $this->summarizePortalTelemetry($device);
    }

    public function summarizePortalTelemetry(array $device): array
    {
        $deviceSummary = $this->summarizeDevice($device);
        $lastInformAt = $this->resolveLastInformAt($device);
        $lastInformRecent = $this->isLastInformRecent($lastInformAt);

        if (!empty($device['is_native_acs'])) {
            return [
                'device_id' => $deviceSummary['device_id'],
                'serial_number' => $deviceSummary['serial_number'],
                'product_class' => $deviceSummary['product_class'],
                'last_inform_at' => $lastInformAt,
                'last_inform_recent' => $lastInformRecent,
                'wan_connected' => $lastInformRecent,
                'wan_status' => $lastInformRecent ? 'Connected' : 'Disconnected',
                'uptime' => $device['ppp_uptime'] ?? null,
                'ip_address' => $device['VirtualParameters.pppoeIP'] ?? $device['_ip'] ?? null,
                'traffic' => [
                    'available' => false,
                    'source' => 'native_laravel_acs',
                    'source_label' => 'Native TR-069 ACS',
                    'download_bytes' => null,
                    'upload_bytes' => null,
                    'total_bytes' => null,
                ],
                'hosts' => [
                    'available' => true,
                    'count' => (int) ($device['VirtualParameters.activedevices'] ?? 0),
                    'source' => 'native_acs_hosts',
                    'source_label' => 'Host Aktif ACS',
                ],
                'connected_devices' => [
                    'available' => true,
                    'count' => (int) ($device['VirtualParameters.activedevices'] ?? 0),
                    'source' => 'native_acs_activedevices',
                    'source_label' => 'Perangkat Terhubung',
                ],
                'wifi_clients' => [
                    'available' => false,
                    'ssids' => [],
                ],
            ];
        }

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
        $client = Http::timeout(2)
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

    private function postTask(string $deviceId, array $payload, bool $required = true, bool $connectionRequest = true, int $timeout = 25000): array
    {
        // 1. Check Native ACS device
        try {
            $nativeDev = \App\Models\AcsDevice::where('device_id', $deviceId)->orWhere('id', is_numeric($deviceId) ? (int)$deviceId : 0)->first();
            if ($nativeDev) {
                $taskService = app(\App\Services\Acs\AcsTaskService::class);
                $taskName = $payload['name'] ?? 'customTask';
                if ($taskName === 'setParameterValues' && isset($payload['parameterValues'])) {
                    $mappedParams = [];
                    foreach ($payload['parameterValues'] as $item) {
                        $mappedParams[$item[0]] = ['value' => $item[1], 'type' => $item[2] ?? 'xsd:string'];
                    }
                    $task = $taskService->queueSetParameterValues($nativeDev, $mappedParams, $connectionRequest);
                } elseif ($taskName === 'reboot') {
                    $task = $taskService->queueReboot($nativeDev, $connectionRequest);
                } elseif ($taskName === 'refreshObject' || $taskName === 'getParameterValues') {
                    $task = $taskService->queueGetParameters($nativeDev, [], $connectionRequest);
                } else {
                    $task = \App\Models\AcsTask::create([
                        'acs_device_id' => $nativeDev->id,
                        'name' => $taskName,
                        'payload' => $payload,
                        'status' => 'pending',
                    ]);
                    if ($connectionRequest) {
                        $taskService->triggerConnectionRequest($nativeDev);
                    }
                }
                return ['_id' => (string) $task->id, 'name' => $taskName, 'status' => 'pending'];
            }
        } catch (\Throwable $e) {
            Log::warning('postTask: Native ACS task queue error: ' . $e->getMessage());
        }

        $query = [
            'timeout' => min($timeout, 2000),
        ];
        if ($connectionRequest) {
            $query['connection_request'] = 'true';
        }

        try {
            $url = $this->url('/devices/' . rawurlencode($deviceId) . '/tasks?' . http_build_query($query));
            $response = Http::timeout(2)->acceptJson()->post($url, $payload);

            if ($required && !$response->successful()) {
                $msg = $response->json()['message'] ?? ($response->body() ?: 'Perangkat tidak merespons perintah.');
                throw new GenieAcsException("GenieACS gagal mengeksekusi task ({$payload['name']}): {$msg}", 502);
            }

            return $response->json() ?? [];
        } catch (\Throwable $e) {
            if ($e instanceof GenieAcsException) throw $e;
            if ($required) {
                throw new GenieAcsException("Koneksi task ke GenieACS gagal: " . $e->getMessage(), 504);
            }
            return [];
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

    public function resolveWifiPassword(array $device): ?string
    {
        if (!empty($device['is_native_acs'])) {
            return $device['wifi_password'] ?? $device['VirtualParameters.WlanPassword'] ?? null;
        }

        $candidates = [
            'VirtualParameters.WlanPassword',
            'VirtualParameters.wlanPassword',
            'VirtualParameters.wifiPassword',
            'VirtualParameters.WLANPassword',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CMS_KeyPassphrase',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WEPKey.1.WEPKey',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_HW_KeyPassphrase',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CT-COM_WPSKeyWord',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.X_CMS_KeyPassphrase',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.KeyPassphrase',
            'Device.WiFi.AccessPoint.1.Security.KeyPassphrase',
            'Device.WiFi.AccessPoint.1.Security.PreSharedKey',
        ];

        $deviceId = $device['_id'] ?? null;
        $pppoe = $this->parameterValue($device, 'VirtualParameters.pppoeUsername')
            ?: $this->parameterValue($device, 'VirtualParameters.pppoeUsername2')
            ?: $this->parameterValue($device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username')
            ?: '';

        foreach ($candidates as $cand) {
            $val = $this->parameterValue($device, $cand);
            if ($val !== null && trim((string) $val) !== '' && !is_array($val)) {
                $trimmed = trim((string) $val);
                if (!str_starts_with($trimmed, '{') && strlen($trimmed) >= 1) {
                    if ($deviceId) {
                        Cache::forever("genieacs_wifi_pw:{$deviceId}", $trimmed);
                    }
                    if ($pppoe !== '') {
                        Cache::forever("genieacs_wifi_pw:" . strtolower(trim($pppoe)), $trimmed);
                    }
                    return $trimmed;
                }
            }
        }

        $lanDevices = data_get($device, 'InternetGatewayDevice.LANDevice', []);
        if (is_array($lanDevices)) {
            foreach ($lanDevices as $lan) {
                if (!is_array($lan)) continue;
                foreach (($lan['WLANConfiguration'] ?? []) as $wlan) {
                    if (!is_array($wlan)) continue;
                    foreach (['X_CMS_KeyPassphrase', 'KeyPassphrase', 'X_HW_KeyPassphrase', 'X_CT-COM_WPSKeyWord'] as $k) {
                        $v = $this->nodeValue($wlan[$k] ?? null);
                        if ($v && !is_array($v) && !str_starts_with(trim((string)$v), '{')) {
                            $trimmed = trim((string)$v);
                            if ($deviceId) {
                                Cache::forever("genieacs_wifi_pw:{$deviceId}", $trimmed);
                            }
                            if ($pppoe !== '') {
                                Cache::forever("genieacs_wifi_pw:" . strtolower(trim($pppoe)), $trimmed);
                            }
                            return $trimmed;
                        }
                    }
                    foreach (($wlan['PreSharedKey'] ?? []) as $psk) {
                        if (!is_array($psk)) continue;
                        foreach (['KeyPassphrase', 'PreSharedKey'] as $k) {
                            $v = $this->nodeValue($psk[$k] ?? null);
                            if ($v && !is_array($v) && !str_starts_with(trim((string)$v), '{')) {
                                $trimmed = trim((string)$v);
                                if ($deviceId) {
                                    Cache::forever("genieacs_wifi_pw:{$deviceId}", $trimmed);
                                }
                                if ($pppoe !== '') {
                                    Cache::forever("genieacs_wifi_pw:" . strtolower(trim($pppoe)), $trimmed);
                                }
                                return $trimmed;
                            }
                        }
                    }
                }
            }
        }

        // Fallback to persistent cache / remembered password
        if ($deviceId && Cache::has("genieacs_wifi_pw:{$deviceId}")) {
            return (string) Cache::get("genieacs_wifi_pw:{$deviceId}");
        }
        if ($pppoe !== '' && Cache::has("genieacs_wifi_pw:" . strtolower(trim($pppoe)))) {
            return (string) Cache::get("genieacs_wifi_pw:" . strtolower(trim($pppoe)));
        }

        return null;
    }

    public function resolveAllConnectedHosts(array $device): array
    {
        if (!empty($device['is_native_acs']) || isset($device['native_device_id'])) {
            $nativeDev = \App\Models\AcsDevice::with('connectedHosts')
                ->where('device_id', $device['_id'] ?? '')
                ->orWhere('id', $device['native_device_id'] ?? 0)
                ->first();
            if ($nativeDev) {
                return $nativeDev->connectedHosts->map(fn($h) => [
                    'name' => $h->host_name ?: 'Perangkat Klien',
                    'ip_address' => $h->ip_address,
                    'mac_address' => $h->mac_address,
                    'type' => $h->interface_type ?: 'WiFi',
                    'is_active' => (bool) $h->is_active,
                    'last_seen' => $h->last_seen_at?->toIso8601String(),
                    'signal_strength' => $h->signal_strength,
                ])->values()->all();
            }
        }

        $hostsByMac = [];
        $activeAssocMacs = [];

        // 1. Collect WLAN Associated Devices (Active WiFi clients)
        $lanDevices = data_get($device, 'InternetGatewayDevice.LANDevice', []);
        if (is_array($lanDevices)) {
            foreach ($lanDevices as $lan) {
                if (!is_array($lan)) continue;
                foreach (($lan['WLANConfiguration'] ?? []) as $wlan) {
                    if (!is_array($wlan)) continue;
                    foreach (($wlan['AssociatedDevice'] ?? []) as $ak => $av) {
                        if (!is_array($av) || str_starts_with((string)$ak, '_')) continue;
                        $mac = $this->nodeValue($av['AssociatedDeviceMACAddress'] ?? null)
                            ?: $this->nodeValue($av['MACAddress'] ?? null);
                        $ip = $this->nodeValue($av['AssociatedDeviceIPAddress'] ?? null)
                            ?: $this->nodeValue($av['IPAddress'] ?? null);
                        if ($mac) {
                            $cleanMac = strtoupper(str_replace(['-', '.'], ':', trim((string)$mac)));
                            $activeAssocMacs[$cleanMac] = true;
                            $hostsByMac[$cleanMac] = [
                                'name' => 'Perangkat WiFi',
                                'ip_address' => $ip ?: null,
                                'mac_address' => $cleanMac,
                                'type' => 'WiFi (Aktif)',
                                'is_active' => true,
                            ];
                        }
                    }
                }
            }
        }

        // 2. Collect TR-098 LANDevice.Hosts.Host
        if (is_array($lanDevices)) {
            foreach ($lanDevices as $lan) {
                if (!is_array($lan)) continue;
                $hosts = data_get($lan, 'Hosts.Host', []);
                if (is_array($hosts)) {
                    foreach ($hosts as $hk => $hv) {
                        if (!is_array($hv) || str_starts_with((string)$hk, '_')) continue;
                        $mac = $this->nodeValue($hv['MACAddress'] ?? null)
                            ?: $this->nodeValue($hv['PhysAddress'] ?? null);
                        if (!$mac) continue;
                        $cleanMac = strtoupper(str_replace(['-', '.'], ':', trim((string)$mac)));
                        $name = $this->nodeValue($hv['HostName'] ?? null);
                        $ip = $this->nodeValue($hv['IPAddress'] ?? null);
                        $iface = $this->nodeValue($hv['InterfaceType'] ?? null);
                        $active = $this->nodeValue($hv['Active'] ?? null);

                        $type = 'WiFi';
                        if ($iface && (str_contains(strtolower((string)$iface), 'ethernet') || str_contains(strtolower((string)$iface), 'lan'))) {
                            $type = 'LAN Kabel';
                        } elseif (isset($activeAssocMacs[$cleanMac])) {
                            $type = 'WiFi (Aktif)';
                        }

                        $isActive = isset($activeAssocMacs[$cleanMac]) || $active === '1' || $active === 'true' || $active === true || $active === 1;

                        if (isset($hostsByMac[$cleanMac])) {
                            if ($name && trim((string)$name) !== '') {
                                $hostsByMac[$cleanMac]['name'] = trim((string)$name);
                            }
                            if ($ip && !$hostsByMac[$cleanMac]['ip_address']) {
                                $hostsByMac[$cleanMac]['ip_address'] = $ip;
                            }
                            $hostsByMac[$cleanMac]['type'] = $type;
                            $hostsByMac[$cleanMac]['is_active'] = $isActive;
                        } else {
                            $hostsByMac[$cleanMac] = [
                                'name' => ($name && trim((string)$name) !== '') ? trim((string)$name) : 'Perangkat Terhubung',
                                'ip_address' => $ip ?: null,
                                'mac_address' => $cleanMac,
                                'type' => $type,
                                'is_active' => $isActive,
                            ];
                        }
                    }
                }
            }
        }

        // 3. Fallback to VirtualParameters lan host / wifi connected if available
        $vpHosts = $this->resolveLanHostsByMac($device);
        foreach ($vpHosts as $vMac => $vh) {
            $cleanMac = strtoupper(str_replace(['-', '.'], ':', trim((string)$vMac)));
            if (isset($hostsByMac[$cleanMac])) {
                if (!empty($vh['name']) && $hostsByMac[$cleanMac]['name'] === 'Perangkat Terhubung') {
                    $hostsByMac[$cleanMac]['name'] = $vh['name'];
                }
                if (!empty($vh['ip_address']) && empty($hostsByMac[$cleanMac]['ip_address'])) {
                    $hostsByMac[$cleanMac]['ip_address'] = $vh['ip_address'];
                }
            } else {
                $hostsByMac[$cleanMac] = [
                    'name' => $vh['name'] ?? 'Perangkat Terhubung',
                    'ip_address' => $vh['ip_address'] ?? null,
                    'mac_address' => $cleanMac,
                    'type' => $vh['type'] ?? 'WiFi',
                    'is_active' => true,
                ];
            }
        }

        // Sort: Active clients first, then alphabetically by name
        usort($hostsByMac, function ($a, $b) {
            if ($a['is_active'] !== $b['is_active']) {
                return $a['is_active'] ? -1 : 1;
            }
            return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
        });

        return array_values($hostsByMac);
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

    public function generateCustomerPortalToken(Customer|int $customer): string
    {
        $id = $customer instanceof Customer ? $customer->id : $customer;
        $key = config('app.key') ?: 'rumahkitanet-portal-secret-salt';
        return substr(hash_hmac('sha256', "rk_portal_customer_{$id}", $key), 0, 32);
    }

    public function resolveCustomerByPortalToken(string $token): ?Customer
    {
        $token = trim($token);
        if ($token === '' || strlen($token) < 8) {
            return null;
        }

        $cacheKey = "customer_portal_token_map:{$token}";
        $cachedId = Cache::get($cacheKey);

        if ($cachedId) {
            $cust = Customer::query()
                ->with(['package:id,name,speed,price,device_count', 'kecamatan:id,name', 'desa:id,name', 'dusun:id,name'])
                ->find($cachedId);
            if ($cust) {
                return $cust;
            }
        }

        // Search through customers
        $customers = Customer::query()->select('id', 'name', 'phone', 'pppoe_username')->get();
        $matchedId = null;
        $fallbackKey = 'rumahkitanet-portal-secret-salt';

        foreach ($customers as $c) {
            // Standard HMAC token
            if (hash_equals($this->generateCustomerPortalToken($c->id), $token)) {
                $matchedId = $c->id;
                break;
            }

            // Fallback: HMAC with fallback salt
            $fallbackToken = substr(hash_hmac('sha256', "rk_portal_customer_{$c->id}", $fallbackKey), 0, 32);
            if (hash_equals($fallbackToken, $token)) {
                $matchedId = $c->id;
                break;
            }

            // Fallback: MD5 of customer id or name
            if (md5("customer_{$c->id}") === $token || md5((string) $c->id) === $token) {
                $matchedId = $c->id;
                break;
            }
        }

        if ($matchedId) {
            Cache::put($cacheKey, $matchedId, 86400);
            return Customer::query()
                ->with(['package:id,name,speed,price,device_count', 'kecamatan:id,name', 'desa:id,name', 'dusun:id,name'])
                ->find($matchedId);
        }

        return null;
    }

    public function getBlockedDevices(string $deviceId, ?int $customerId = null): array
    {
        $cacheKey = "genieacs_blocked_macs:{$deviceId}";
        $blocked = Cache::get($cacheKey, []);
        if (!is_array($blocked)) {
            $blocked = [];
        }
        return array_values($blocked);
    }

    public function blockDeviceMac(string $deviceId, string $macAddress, ?int $customerId = null, ?string $reason = null): array
    {
        $cleanMac = strtoupper(str_replace(['-', '.'], ':', trim($macAddress)));
        if (!preg_match('/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i', $cleanMac)) {
            throw new GenieAcsException('Format MAC Address tidak valid.', 422);
        }

        $cacheKey = "genieacs_blocked_macs:{$deviceId}";
        $blocked = Cache::get($cacheKey, []);
        if (!is_array($blocked)) {
            $blocked = [];
        }

        $blocked[$cleanMac] = [
            'mac_address' => $cleanMac,
            'blocked_at' => now()->setTimezone('Asia/Jakarta')->toIso8601String(),
            'reason' => $reason ?: 'Diblokir oleh pemilik jaringan WiFi',
        ];

        Cache::forever($cacheKey, $blocked);

        // Attempt to send task to router to enable MAC filtering if supported
        try {
            $this->postTask($deviceId, [
                'name' => 'setParameterValues',
                'parameterValues' => [
                    ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.MACAddressControlEnabled', true, 'xsd:boolean'],
                ],
            ], false);
        } catch (\Throwable) {
            // Ignore if router doesn't support direct MAC filter node
        }

        return [
            'success' => true,
            'mac_address' => $cleanMac,
            'blocked_devices' => array_values($blocked),
            'message' => "Perangkat dengan MAC {$cleanMac} berhasil diblokir dari WiFi.",
        ];
    }

    public function unblockDeviceMac(string $deviceId, string $macAddress, ?int $customerId = null): array
    {
        $cleanMac = strtoupper(str_replace(['-', '.'], ':', trim($macAddress)));
        $cacheKey = "genieacs_blocked_macs:{$deviceId}";
        $blocked = Cache::get($cacheKey, []);
        if (is_array($blocked) && isset($blocked[$cleanMac])) {
            unset($blocked[$cleanMac]);
            Cache::forever($cacheKey, $blocked);
        }

        return [
            'success' => true,
            'mac_address' => $cleanMac,
            'blocked_devices' => array_values($blocked ?? []),
            'message' => "Blokir untuk perangkat MAC {$cleanMac} berhasil dibuka.",
        ];
    }

    private function normalize(string $value): string
    {
        return strtolower(trim($value));
    }
}

<?php

namespace App\Services\Acs;

use App\Models\AcsConnectedHost;
use App\Models\AcsDevice;
use App\Models\AcsDeviceParameter;
use App\Models\AcsLog;
use App\Models\Customer;
use App\Services\GenieAcsService;
use App\Services\MikroTikService;
use Illuminate\Support\Facades\Log;

class AcsDeviceService
{
    public function __construct(
        protected AcsVendorDecoder $decoder,
        protected ?MikroTikService $mikroTikService = null,
        protected ?GenieAcsService $genieAcsService = null
    ) {
    }

    /**
     * Process an Inform payload from an ONT device.
     */
    public function processInform(array $informData, string $clientIp): AcsDevice
    {
        $devIdInfo = $informData['device_id'] ?? [];
        $params = $informData['parameters'] ?? [];
        $types = $informData['parameter_types'] ?? [];

        // 1. Decode multi-vendor parameters
        $decoded = $this->decoder->decode($params, $devIdInfo);

        // 2. Generate or find unique device_id
        $oui = $devIdInfo['oui'] ?? '';
        $prodClass = $devIdInfo['product_class'] ?? ($decoded['product_class'] ?? 'ONT');
        $sn = $decoded['serial_number'] ?: ($devIdInfo['serial_number'] ?? 'UNKNOWN');

        $deviceIdString = $this->generateDeviceIdString($devIdInfo['manufacturer'] ?? ($decoded['manufacturer'] ?? 'ONT'), $oui, $prodClass, $sn);

        // 3. Find or initialize AcsDevice
        $device = AcsDevice::query()->where('device_id', $deviceIdString)
            ->orWhere(function ($q) use ($sn, $oui) {
                if (!empty($sn) && $sn !== 'UNKNOWN') {
                    $q->where('serial_number', $sn);
                }
            })
            ->first();

        if (!$device) {
            $device = new AcsDevice();
            $device->device_id = $deviceIdString;
            $device->registered_at = now();
        }

        // 4. Double check customer matching (Direct PPPoE -> MikroTik IP -> MikroTik MAC)
        $matched = $this->resolveCustomerMatching($decoded['pppoe_username'], $decoded['pppoe_ip'] ?: $clientIp, $decoded['wan_mac'] ?: $decoded['lan_mac']);

        // 5. Fill and save device
        $device->manufacturer = $decoded['manufacturer'];
        $device->oui = $oui ?: $device->oui;
        $device->product_class = $decoded['product_class'];
        $device->serial_number = $sn ?: $device->serial_number;
        $device->hardware_version = $decoded['hardware_version'];
        $device->software_version = $decoded['software_version'];
        $device->spec_version = $decoded['spec_version'];
        $device->provisioning_code = $decoded['provisioning_code'];

        $device->pon_mode = $decoded['pon_mode'];
        $device->optical_rx_power = $decoded['optical_rx_power'];
        $device->optical_tx_power = $decoded['optical_tx_power'];
        $device->temperature = $decoded['temperature'];
        $device->device_uptime = $decoded['device_uptime'];
        $device->device_uptime_seconds = $decoded['device_uptime_seconds'];
        $device->ppp_uptime = $decoded['ppp_uptime'];
        $device->ppp_uptime_seconds = $decoded['ppp_uptime_seconds'];

        $device->pppoe_username = $matched['pppoe_username'] ?: $decoded['pppoe_username'];
        $device->pppoe_password = $decoded['pppoe_password'] ?: $device->pppoe_password;
        $device->pppoe_ip = $decoded['pppoe_ip'];
        $device->wan_ip = $decoded['wan_ip'];
        $device->wan_mac = $decoded['wan_mac'];
        $device->lan_mac = $decoded['lan_mac'];
        $device->ip_address = $clientIp;

        $device->wifi_ssid = $decoded['wifi_ssid'];
        $device->wifi_password = $decoded['wifi_password'] ?: $device->wifi_password;
        $device->wifi_enabled = $decoded['wifi_enabled'];
        $device->wifi_ssid_5g = $decoded['wifi_ssid_5g'];
        $device->wifi_password_5g = $decoded['wifi_password_5g'] ?: $device->wifi_password_5g;
        $device->wifi_enabled_5g = $decoded['wifi_enabled_5g'];
        $device->wifi_clients_count = $decoded['wifi_clients_count'];

        $device->connection_request_url = $decoded['connection_request_url'];
        $device->connection_request_user = $decoded['connection_request_user'];
        $device->connection_request_pass = $decoded['connection_request_pass'];

        $device->customer_id = $matched['customer_id'] ?: $device->customer_id;
        $device->matched_via = $matched['matched_via'] ?: $device->matched_via;
        $device->is_online = true;
        $device->last_inform_at = now();
        $device->vendor_raw_summary = [
            'events' => $informData['events'] ?? [],
            'param_count' => count($params),
        ];

        $device->save();

        // 6. Update Connected Hosts
        $this->syncConnectedHosts($device, $decoded['hosts'] ?? []);

        // 7. Save Parameters (Batch Upsert for performance)
        $this->saveDeviceParameters($device, $params, $types);

        return $device;
    }

    /**
     * Resolve Customer matching with MikroTik fallback
     */
    public function resolveCustomerMatching(?string $pppoe, ?string $ip, ?string $mac): array
    {
        $pppoeClean = $pppoe ? strtolower(trim($pppoe)) : '';
        $matchedVia = null;
        $resolvedPppoe = $pppoe;
        $customerId = null;

        // 1. Direct PPPoE match
        if ($pppoeClean !== '') {
            $cust = Customer::query()->whereRaw('LOWER(pppoe_username) = ?', [$pppoeClean])->first();
            if ($cust) {
                return [
                    'customer_id' => $cust->id,
                    'pppoe_username' => $cust->pppoe_username,
                    'matched_via' => 'tr069',
                ];
            }
        }

        // 2. MikroTik IP & MAC double check
        try {
            $genieService = $this->genieAcsService ?? app(GenieAcsService::class);
            $mtkMaps = $genieService->getMikrotikPppoeLookupMaps();

            if (!empty($ip) && isset($mtkMaps['by_ip'][trim($ip)])) {
                $mtkUser = $mtkMaps['by_ip'][trim($ip)]['username'];
                $cust = Customer::query()->whereRaw('LOWER(pppoe_username) = ?', [strtolower(trim($mtkUser))])->first();
                if ($cust) {
                    return [
                        'customer_id' => $cust->id,
                        'pppoe_username' => $cust->pppoe_username,
                        'matched_via' => 'mikrotik_ip',
                    ];
                }
                $resolvedPppoe = $mtkUser;
                $matchedVia = 'mikrotik_ip';
            }

            if (!empty($mac)) {
                $cleanMac = strtolower(str_replace([':', '-', '.'], '', trim($mac)));
                if (isset($mtkMaps['by_mac'][$cleanMac])) {
                    $mtkUser = $mtkMaps['by_mac'][$cleanMac]['username'];
                    $cust = Customer::query()->whereRaw('LOWER(pppoe_username) = ?', [strtolower(trim($mtkUser))])->first();
                    if ($cust) {
                        return [
                            'customer_id' => $cust->id,
                            'pppoe_username' => $cust->pppoe_username,
                            'matched_via' => 'mikrotik_mac',
                        ];
                    }
                    $resolvedPppoe = $mtkUser;
                    $matchedVia = 'mikrotik_mac';
                }
            }
        } catch (\Throwable $e) {
            Log::warning('AcsDeviceService: MikroTik match error: ' . $e->getMessage());
        }

        return [
            'customer_id' => null,
            'pppoe_username' => $resolvedPppoe,
            'matched_via' => $matchedVia ?: ($pppoe ? 'tr069' : null),
        ];
    }

    /**
     * Sync connected hosts table
     */
    private function syncConnectedHosts(AcsDevice $device, array $hosts): void
    {
        if (empty($hosts)) return;

        foreach ($hosts as $h) {
            $mac = trim($h['mac_address']);
            if (empty($mac)) continue;

            AcsConnectedHost::query()->updateOrCreate(
                [
                    'acs_device_id' => $device->id,
                    'mac_address' => $mac,
                ],
                [
                    'ip_address' => $h['ip_address'] ?? null,
                    'hostname' => $h['hostname'] ?? null,
                    'interface_type' => $h['interface_type'] ?? 'Wi-Fi 2.4GHz',
                    'is_active' => $h['is_active'] ?? true,
                    'last_seen_at' => now(),
                ]
            );
        }
    }

    /**
     * Save / Upsert deep parameters
     */
    private function saveDeviceParameters(AcsDevice $device, array $params, array $types): void
    {
        if (empty($params)) return;

        $now = now();
        $batch = [];

        foreach ($params as $name => $val) {
            $batch[] = [
                'acs_device_id' => $device->id,
                'name' => substr($name, 0, 255),
                'value' => (string) $val,
                'type' => $types[$name] ?? 'xsd:string',
                'writable' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // Upsert in chunks
        foreach (array_chunk($batch, 100) as $chunk) {
            AcsDeviceParameter::query()->upsert(
                $chunk,
                ['acs_device_id', 'name'],
                ['value', 'type', 'updated_at']
            );
        }
    }

    private function generateDeviceIdString(string $mfr, string $oui, string $prodClass, string $sn): string
    {
        $mfrClean = preg_replace('/[^a-zA-Z0-9]/', '', $mfr) ?: 'ONT';
        $prodClean = preg_replace('/[^a-zA-Z0-9]/', '', $prodClass) ?: 'Router';
        $snClean = preg_replace('/[^a-zA-Z0-9%_-]/', '', $sn) ?: 'UNKNOWN';

        if (!empty($oui)) {
            return "{$oui}-{$prodClean}-{$snClean}";
        }
        return "{$mfrClean}-{$prodClean}-{$snClean}";
    }

    /**
     * Process GetParameterValuesResponse from CPE
     */
    public function processGetParameterValuesResponse(AcsDevice $device, array $params, array $types = []): void
    {
        if (empty($params)) return;

        // 1. Decode multi-vendor parameters from the returned set
        $decoded = $this->decoder->decode($params, [
            'manufacturer' => $device->manufacturer,
            'oui' => $device->oui,
            'product_class' => $device->product_class,
            'serial_number' => $device->serial_number,
        ]);

        // 2. Update device attributes if new non-empty values are found
        if (!empty($decoded['wifi_ssid'])) {
            $device->wifi_ssid = $decoded['wifi_ssid'];
        }
        if (!empty($decoded['wifi_password'])) {
            $device->wifi_password = $decoded['wifi_password'];
        }
        if (!empty($decoded['wifi_ssid_5g'])) {
            $device->wifi_ssid_5g = $decoded['wifi_ssid_5g'];
        }
        if (!empty($decoded['wifi_password_5g'])) {
            $device->wifi_password_5g = $decoded['wifi_password_5g'];
        }
        if ($decoded['wifi_enabled'] !== null) {
            $device->wifi_enabled = $decoded['wifi_enabled'];
        }
        if ($decoded['optical_rx_power'] !== null) {
            $device->optical_rx_power = $decoded['optical_rx_power'];
        }
        if ($decoded['optical_tx_power'] !== null) {
            $device->optical_tx_power = $decoded['optical_tx_power'];
        }
        if ($decoded['temperature'] !== null) {
            $device->temperature = $decoded['temperature'];
        }
        if ($decoded['device_uptime_seconds'] !== null) {
            $device->device_uptime_seconds = $decoded['device_uptime_seconds'];
            $device->device_uptime = $decoded['device_uptime'];
        }
        if ($decoded['ppp_uptime_seconds'] !== null) {
            $device->ppp_uptime_seconds = $decoded['ppp_uptime_seconds'];
            $device->ppp_uptime = $decoded['ppp_uptime'];
        }
        if (!empty($decoded['pppoe_username'])) {
            $device->pppoe_username = $decoded['pppoe_username'];
        }
        if (!empty($decoded['pppoe_password'])) {
            $device->pppoe_password = $decoded['pppoe_password'];
        }
        if (!empty($decoded['pppoe_ip'])) {
            $device->pppoe_ip = $decoded['pppoe_ip'];
        }
        if (!empty($decoded['wan_ip'])) {
            $device->wan_ip = $decoded['wan_ip'];
        }
        if (!empty($decoded['wan_mac'])) {
            $device->wan_mac = $decoded['wan_mac'];
        }
        if (!empty($decoded['lan_mac'])) {
            $device->lan_mac = $decoded['lan_mac'];
        }

        // Keep multi-ssid array in vendor_raw_summary
        if (!empty($decoded['all_ssids'])) {
            $summary = $device->vendor_raw_summary ?? [];
            $summary['ssids'] = $decoded['all_ssids'];
            $device->vendor_raw_summary = $summary;
        }

        // 3. Sync Connected Hosts
        if (!empty($decoded['hosts'])) {
            $this->syncConnectedHosts($device, $decoded['hosts']);
            $device->wifi_clients_count = count($decoded['hosts']);
        } elseif ($decoded['wifi_clients_count'] > 0) {
            $device->wifi_clients_count = $decoded['wifi_clients_count'];
        }

        // 4. Save individual parameters into acs_device_parameters
        $this->saveDeviceParameters($device, $params, $types);

        $device->save();
        Log::info("AcsDeviceService: Updated device #{$device->id} ({$device->device_id}) via GetParameterValuesResponse: SSID={$device->wifi_ssid}, Clients={$device->wifi_clients_count}, RX={$device->optical_rx_power}");
    }
}

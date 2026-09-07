<?php

namespace App\Services\Acs;

use Illuminate\Support\Str;

class AcsVendorDecoder
{
    /**
     * Decode full telemetry and configuration from parameter map
     */
    public function decode(array $params, array $deviceIdInfo = []): array
    {
        $manufacturer = $this->firstNonEmpty([
            $deviceIdInfo['manufacturer'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.Manufacturer'] ?? null,
            $params['Device.DeviceInfo.Manufacturer'] ?? null,
            'Generic',
        ]);

        $productClass = $this->firstNonEmpty([
            $deviceIdInfo['product_class'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.ProductClass'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.ModelName'] ?? null,
            $params['Device.DeviceInfo.ProductClass'] ?? null,
            $params['Device.DeviceInfo.ModelName'] ?? null,
            'ONT Router',
        ]);

        $serialNumber = $this->firstNonEmpty([
            $params['VirtualParameters.getSerialNumber'] ?? null,
            $deviceIdInfo['serial_number'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.SerialNumber'] ?? null,
            $params['Device.DeviceInfo.SerialNumber'] ?? null,
            '',
        ]);

        $oui = $deviceIdInfo['oui'] ?? ($params['InternetGatewayDevice.DeviceInfo.ManufacturerOUI'] ?? '');

        // Hardware & Software
        $hwVersion = $this->firstNonEmpty([
            $params['InternetGatewayDevice.DeviceInfo.HardwareVersion'] ?? null,
            $params['Device.DeviceInfo.HardwareVersion'] ?? null,
        ]);

        $swVersion = $this->firstNonEmpty([
            $params['InternetGatewayDevice.DeviceInfo.SoftwareVersion'] ?? null,
            $params['Device.DeviceInfo.SoftwareVersion'] ?? null,
        ]);

        $specVersion = $this->firstNonEmpty([
            $params['InternetGatewayDevice.DeviceInfo.SpecVersion'] ?? null,
            $params['Device.DeviceInfo.SpecVersion'] ?? null,
        ]);

        $provCode = $this->firstNonEmpty([
            $params['InternetGatewayDevice.DeviceInfo.ProvisioningCode'] ?? null,
            $params['Device.DeviceInfo.ProvisioningCode'] ?? null,
        ]);

        // PON Mode
        $ponMode = $this->detectPonMode($params, $productClass);

        // Optical RX & TX Power (dBm)
        $opticalRx = $this->extractOpticalRx($params);
        $opticalTx = $this->extractOpticalTx($params);

        // Temperature (°C)
        $temperature = $this->extractTemperature($params);

        // Uptime (Device & PPP)
        $deviceUptimeSec = $this->extractDeviceUptime($params);
        $pppUptimeSec = $this->extractPppUptime($params);

        // PPPoE Username & Password
        $pppoeUser = $this->firstNonEmpty([
            $params['VirtualParameters.pppoeUsername'] ?? null,
            $params['VirtualParameters.pppoeUsername2'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username'] ?? null,
            $params['InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.Username'] ?? null,
            $params['Device.PPP.Interface.1.Username'] ?? null,
        ]);

        $pppoePass = $this->firstNonEmpty([
            $params['VirtualParameters.pppoePassword'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Password'] ?? null,
            $params['Device.PPP.Interface.1.Password'] ?? null,
        ]);

        // WAN IP / PPPoE IP
        $wanIp = $this->firstNonEmpty([
            $params['VirtualParameters.pppoeIP'] ?? null,
            $params['VirtualParameters.IPTR069'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress'] ?? null,
            $params['InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress'] ?? null,
            $params['Device.PPP.Interface.1.IPCP.LocalIPAddress'] ?? null,
            $params['Device.IP.Interface.1.IPv4Address.1.IPAddress'] ?? null,
        ]);

        // MAC Addresses
        $wanMac = $this->firstNonEmpty([
            $params['VirtualParameters.pppoeMac'] ?? null,
            $params['VirtualParameters.PonMac'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress'] ?? null,
        ]);

        $lanMac = $this->firstNonEmpty([
            $params['InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress'] ?? null,
            $params['Device.Ethernet.Interface.1.MACAddress'] ?? null,
        ]);

        // WiFi 2.4GHz
        $wifiSsid = $this->firstNonEmpty([
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] ?? null,
            $params['Device.WiFi.SSID.1.SSID'] ?? null,
        ]);

        $wifiPass = $this->firstNonEmpty([
            $params['VirtualParameters.WlanPassword'] ?? null,
            $params['VirtualParameters.wlanPassword'] ?? null,
            $params['VirtualParameters.wifiPassword'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CMS_KeyPassphrase'] ?? null,
            $params['Device.WiFi.AccessPoint.1.Security.KeyPassphrase'] ?? null,
        ]);

        $wifiEnabled = $this->toBool($params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable'] ?? ($params['Device.WiFi.SSID.1.Enable'] ?? true));

        // WiFi 5GHz
        $wifiSsid5g = $this->firstNonEmpty([
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID'] ?? null,
            $params['Device.WiFi.SSID.2.SSID'] ?? null,
        ]);

        $wifiPass5g = $this->firstNonEmpty([
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase'] ?? null,
            $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase'] ?? null,
            $wifiPass, // Fallback to 2.4G key if shared
        ]);

        $wifiEnabled5g = !empty($wifiSsid5g) && $this->toBool($params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable'] ?? ($params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable'] ?? true));

        // Connected WiFi Clients count
        $wifiClients = $this->extractWifiClientsCount($params);

        // Connection Request URL & Credentials
        $connReqUrl = $this->firstNonEmpty([
            $params['InternetGatewayDevice.ManagementServer.ConnectionRequestURL'] ?? null,
            $params['Device.ManagementServer.ConnectionRequestURL'] ?? null,
        ]);

        $connReqUser = $this->firstNonEmpty([
            $params['InternetGatewayDevice.ManagementServer.ConnectionRequestUsername'] ?? null,
            $params['Device.ManagementServer.ConnectionRequestUsername'] ?? null,
        ]);

        $connReqPass = $this->firstNonEmpty([
            $params['InternetGatewayDevice.ManagementServer.ConnectionRequestPassword'] ?? null,
            $params['Device.ManagementServer.ConnectionRequestPassword'] ?? null,
        ]);

        // Connected Hosts Table
        $hosts = $this->extractConnectedHosts($params);

        return [
            'manufacturer' => $manufacturer,
            'oui' => $oui,
            'product_class' => $productClass,
            'serial_number' => $serialNumber,
            'hardware_version' => $hwVersion,
            'software_version' => $swVersion,
            'spec_version' => $specVersion,
            'provisioning_code' => $provCode,
            'pon_mode' => $ponMode,
            'optical_rx_power' => $opticalRx,
            'optical_tx_power' => $opticalTx,
            'temperature' => $temperature,
            'device_uptime_seconds' => $deviceUptimeSec,
            'device_uptime' => $deviceUptimeSec !== null ? $this->secondsToHuman($deviceUptimeSec) : null,
            'ppp_uptime_seconds' => $pppUptimeSec,
            'ppp_uptime' => $pppUptimeSec !== null ? $this->secondsToHuman($pppUptimeSec) : null,
            'pppoe_username' => $pppoeUser,
            'pppoe_password' => $pppoePass,
            'pppoe_ip' => $wanIp,
            'wan_ip' => $wanIp,
            'wan_mac' => $wanMac,
            'lan_mac' => $lanMac,
            'wifi_ssid' => $wifiSsid,
            'wifi_password' => $wifiPass,
            'wifi_enabled' => $wifiEnabled,
            'wifi_ssid_5g' => $wifiSsid5g,
            'wifi_password_5g' => $wifiPass5g,
            'wifi_enabled_5g' => $wifiEnabled5g,
            'wifi_clients_count' => $wifiClients,
            'connection_request_url' => $connReqUrl,
            'connection_request_user' => $connReqUser,
            'connection_request_pass' => $connReqPass,
            'hosts' => $hosts,
        ];
    }

    private function detectPonMode(array $params, string $productClass): string
    {
        if (isset($params['VirtualParameters.getponmode']) && !empty($params['VirtualParameters.getponmode'])) {
            return strtoupper(trim($params['VirtualParameters.getponmode']));
        }

        foreach ($params as $k => $v) {
            if (str_contains($k, 'WANEponInterfaceConfig')) return 'EPON';
            if (str_contains($k, 'WANGponInterfaceConfig')) return 'GPON';
        }

        if (stripos($productClass, 'GPON') !== false) return 'GPON';
        if (stripos($productClass, 'EPON') !== false) return 'EPON';
        if (stripos($productClass, 'XPON') !== false) return 'XPON';

        return 'EPON';
    }

    private function extractOpticalRx(array $params): ?float
    {
        $rxCandidates = [
            $params['VirtualParameters.RXPower'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RxPower'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANGponInterfaceConfig.RXPower'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANGponInterfaceConfig.RxPower'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_CT-COM_OpticalInfo.RxPower'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_ZTE-COM_OpticalInfo.RxPower'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_HW_OpticalParameter.RxPower'] ?? null,
            $params['InternetGatewayDevice.X_ITU_G988_Optics.RxPower'] ?? null,
            $params['InternetGatewayDevice.X_BROADCOM_COM_PonOptics.RxPower'] ?? null,
            $params['Device.Optical.Interface.1.RxPower'] ?? null,
        ];

        foreach ($rxCandidates as $raw) {
            if ($raw === null || trim((string)$raw) === '' || trim((string)$raw) === 'N/A') continue;
            $val = $this->cleanOpticalValue($raw);
            if ($val !== null) return $val;
        }

        return null;
    }

    private function extractOpticalTx(array $params): ?float
    {
        $txCandidates = [
            $params['VirtualParameters.TXPower'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.TxPower'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANGponInterfaceConfig.TXPower'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_CT-COM_OpticalInfo.TxPower'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_ZTE-COM_OpticalInfo.TxPower'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_HW_OpticalParameter.TxPower'] ?? null,
            $params['Device.Optical.Interface.1.TxPower'] ?? null,
        ];

        foreach ($txCandidates as $raw) {
            if ($raw === null || trim((string)$raw) === '' || trim((string)$raw) === 'N/A') continue;
            $val = $this->cleanOpticalValue($raw);
            if ($val !== null) return $val;
        }

        return null;
    }

    private function cleanOpticalValue(mixed $raw): ?float
    {
        if (is_numeric($raw)) {
            $num = (float) $raw;
            // Handle integer milli-dBm (e.g. -2450 => -24.50)
            if ($num < -100 || $num > 100) {
                $num = $num / 100.0;
            }
            return round($num, 2);
        }

        $str = trim((string)$raw);
        // Clean out 'dBm', 'dbm', 'uW'
        if (preg_match('/([-+]?[0-9]+(?:\.[0-9]+)?)/', $str, $m)) {
            $num = (float) $m[1];
            if ($num < -100 || $num > 100) {
                $num = $num / 100.0;
            }
            return round($num, 2);
        }

        return null;
    }

    private function extractTemperature(array $params): ?float
    {
        $tempCandidates = [
            $params['VirtualParameters.gettemp'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.Temperature'] ?? null,
            $params['InternetGatewayDevice.DeviceInfo.X_CT-COM_Temperature'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.TransceiverTemperature'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANGponInterfaceConfig.TransceiverTemperature'] ?? null,
            $params['Device.DeviceInfo.TemperatureStatus.TemperatureSensor.1.Value'] ?? null,
        ];

        foreach ($tempCandidates as $raw) {
            if ($raw === null || trim((string)$raw) === '') continue;
            if (preg_match('/([0-9]+(?:\.[0-9]+)?)/', (string)$raw, $m)) {
                $val = (float) $m[1];
                if ($val > 200) $val = $val / 10.0;
                return round($val, 1);
            }
        }

        return null;
    }

    private function extractDeviceUptime(array $params): ?int
    {
        $uptimeCandidates = [
            $params['InternetGatewayDevice.DeviceInfo.UpTime'] ?? null,
            $params['Device.DeviceInfo.UpTime'] ?? null,
            $params['VirtualParameters.getdeviceuptime'] ?? null,
        ];

        foreach ($uptimeCandidates as $raw) {
            if ($raw === null) continue;
            if (is_numeric($raw)) return (int) $raw;

            // Handle format like '3d 09:04:23'
            if (preg_match('/(?:(\d+)d\s*)?(\d+):(\d+):(\d+)/', (string)$raw, $m)) {
                $days = !empty($m[1]) ? (int) $m[1] : 0;
                $hours = (int) $m[2];
                $mins = (int) $m[3];
                $secs = (int) $m[4];
                return ($days * 86400) + ($hours * 3600) + ($mins * 60) + $secs;
            }
        }

        return null;
    }

    private function extractPppUptime(array $params): ?int
    {
        $candidates = [
            $params['VirtualParameters.getpppuptime'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Uptime'] ?? null,
            $params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Uptime'] ?? null,
        ];

        foreach ($candidates as $raw) {
            if ($raw === null) continue;
            if (is_numeric($raw)) return (int) $raw;

            if (preg_match('/(?:(\d+)d\s*)?(\d+):(\d+):(\d+)/', (string)$raw, $m)) {
                $days = !empty($m[1]) ? (int) $m[1] : 0;
                $hours = (int) $m[2];
                $mins = (int) $m[3];
                $secs = (int) $m[4];
                return ($days * 86400) + ($hours * 3600) + ($mins * 60) + $secs;
            }
        }

        return null;
    }

    private function extractWifiClientsCount(array $params): int
    {
        if (isset($params['VirtualParameters.activedevices']) && is_numeric($params['VirtualParameters.activedevices'])) {
            return (int) $params['VirtualParameters.activedevices'];
        }

        if (isset($params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations']) && is_numeric($params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'])) {
            return (int) $params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'];
        }

        // Count from AssociatedDevice table
        $assocCount = 0;
        foreach ($params as $k => $v) {
            if (str_contains($k, 'AssociatedDevice.') && (str_contains($k, 'AssociatedDeviceMACAddress') || str_contains($k, 'MACAddress')) && !empty($v)) {
                $assocCount++;
            }
        }
        if ($assocCount > 0) return $assocCount;

        // Count active hosts from LAN Hosts table
        $activeHosts = 0;
        foreach ($params as $k => $v) {
            if (preg_match('/InternetGatewayDevice\.LANDevice\.1\.Hosts\.Host\.\d+\.Active$/', $k) && $this->toBool($v)) {
                $activeHosts++;
            }
        }

        return $activeHosts;
    }

    private function extractConnectedHosts(array $params): array
    {
        $hosts = [];

        // 1. Scan InternetGatewayDevice.LANDevice.1.Hosts.Host.*
        foreach ($params as $k => $v) {
            if (preg_match('/InternetGatewayDevice\.LANDevice\.1\.Hosts\.Host\.(\d+)\.(MACAddress|IPAddress|HostName|Active|InterfaceType)/', $k, $m)) {
                $idx = $m[1];
                $prop = $m[2];

                if (!isset($hosts[$idx])) {
                    $hosts[$idx] = [
                        'mac_address' => '',
                        'ip_address' => null,
                        'hostname' => null,
                        'interface_type' => 'Wi-Fi 2.4GHz',
                        'is_active' => true,
                    ];
                }

                if ($prop === 'MACAddress') $hosts[$idx]['mac_address'] = trim($v);
                if ($prop === 'IPAddress') $hosts[$idx]['ip_address'] = trim($v);
                if ($prop === 'HostName') $hosts[$idx]['hostname'] = trim($v);
                if ($prop === 'Active') $hosts[$idx]['is_active'] = $this->toBool($v);
                if ($prop === 'InterfaceType') {
                    $hosts[$idx]['interface_type'] = stripos($v, '802.11') !== false || stripos($v, 'Wi-Fi') !== false ? 'Wi-Fi' : 'Ethernet';
                }
            }
        }

        // 2. Scan WLAN Associated Devices
        foreach ($params as $k => $v) {
            if (preg_match('/WLANConfiguration\.(\d+)\.AssociatedDevice\.(\d+)\.(AssociatedDeviceMACAddress|MACAddress)/', $k, $m)) {
                $wlanIdx = $m[1];
                $assocIdx = $m[2];
                $mac = trim($v);
                if (!empty($mac)) {
                    $cleanMac = strtolower($mac);
                    $existing = false;
                    foreach ($hosts as $h) {
                        if (strtolower($h['mac_address']) === $cleanMac) {
                            $existing = true;
                            break;
                        }
                    }
                    if (!$existing) {
                        $hosts[] = [
                            'mac_address' => $mac,
                            'ip_address' => null,
                            'hostname' => null,
                            'interface_type' => ($wlanIdx == 5 || $wlanIdx == 2) ? 'Wi-Fi 5GHz' : 'Wi-Fi 2.4GHz',
                            'is_active' => true,
                        ];
                    }
                }
            }
        }

        // Filter valid MACs
        return array_values(array_filter($hosts, fn($h) => !empty($h['mac_address']) && strlen($h['mac_address']) >= 10));
    }

    private function secondsToHuman(int $seconds): string
    {
        $days = floor($seconds / 86400);
        $hours = floor(($seconds % 86400) / 3600);
        $minutes = floor(($seconds % 3600) / 60);
        $secs = $seconds % 60;

        $parts = [];
        if ($days > 0) $parts[] = "{$days}d";
        $parts[] = sprintf('%02d:%02d:%02d', $hours, $minutes, $secs);

        return implode(' ', $parts);
    }

    private function firstNonEmpty(array $items): ?string
    {
        foreach ($items as $item) {
            if ($item !== null && trim((string)$item) !== '') {
                return trim((string)$item);
            }
        }
        return null;
    }

    private function toBool(mixed $val): bool
    {
        if (is_bool($val)) return $val;
        $str = strtolower(trim((string)$val));
        return in_array($str, ['1', 'true', 'yes', 'on', 'up']);
    }
}

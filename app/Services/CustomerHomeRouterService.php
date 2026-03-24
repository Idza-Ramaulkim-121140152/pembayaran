<?php

namespace App\Services;

use App\Models\Customer;

class CustomerHomeRouterService
{
    private const DEFAULT_PORT = 8728;
    private const DEFAULT_WEB_PORT = 80;
    private const DEFAULT_TIMEOUT = 3;
    private const DEFAULT_WEB_USERNAME = 'admin';
    private const DEFAULT_WEB_PASSWORD = 'rumahkita69';

    public function getSnapshot(Customer $customer, array $connectionContext = []): array
    {
        $configuration = $this->buildConfiguration($customer, $connectionContext);

        $snapshot = [
            'enabled' => $configuration['enabled'],
            'configured' => $configuration['configured'],
            'reachable' => false,
            'type' => $configuration['type'],
            'type_label' => $configuration['type_label'],
            'identity' => null,
            'version' => null,
            'host' => $configuration['host'],
            'host_source' => $configuration['host_source'],
            'host_source_label' => $configuration['host_source_label'],
            'wan_interface' => $configuration['wan_interface'],
            'wan_uptime' => null,
            'management_mode' => $configuration['management_mode'],
            'status_label' => $configuration['enabled']
                ? ($configuration['configured'] ? 'Menunggu Koneksi Router' : 'Konfigurasi Belum Lengkap')
                : 'Monitoring Belum Aktif',
            'note' => $configuration['note'],
            'traffic' => [
                'available' => false,
                'source' => null,
                'source_label' => null,
                'download_bytes' => null,
                'upload_bytes' => null,
                'total_bytes' => null,
                'note' => null,
            ],
            'devices' => [
                'available' => false,
                'count' => null,
                'source' => null,
                'source_label' => null,
                'note' => null,
            ],
        ];

        if (!$configuration['enabled'] || !$configuration['configured']) {
            return $snapshot;
        }

        if ($configuration['management_mode'] === 'web') {
            return app(CustomerWebRouterService::class)->getSnapshot($configuration);
        }

        try {
            $mikrotik = new MikroTikService(
                $configuration['host'],
                $configuration['username'],
                $configuration['password'],
                $configuration['port'],
                self::DEFAULT_TIMEOUT
            );

            $resources = $mikrotik->getSystemResources();
            $identity = $mikrotik->getIdentity();
            $interfaces = $mikrotik->getInterfaces(true);
            $pppoeClients = $mikrotik->getPPPoEClientInterfaces();
            $dhcpClients = $mikrotik->getDhcpClients();

            $wanContext = $this->resolveWanContext(
                $configuration['wan_interface'],
                $interfaces,
                $pppoeClients,
                $dhcpClients
            );

            $deviceSummary = $this->resolveDeviceSummary(
                $mikrotik,
                $wanContext['interface_name']
            );

            return array_merge($snapshot, [
                'reachable' => true,
                'identity' => $identity !== 'Unknown' ? $identity : null,
                'version' => $resources['version'] ?? null,
                'wan_interface' => $wanContext['interface_name'],
                'wan_uptime' => $wanContext['uptime'],
                'note' => $this->buildAvailabilityNote($wanContext['interface_name'], $deviceSummary['available']),
                'traffic' => $this->resolveTrafficSummary($wanContext['interface_name'], $interfaces),
                'devices' => $deviceSummary,
            ]);
        } catch (\Throwable $e) {
            \Log::warning('Failed to fetch direct customer router data', [
                'customer_id' => $customer->id,
                'router_host' => $configuration['host'],
                'router_type' => $configuration['type'],
                'error' => $e->getMessage(),
            ]);

            $snapshot['note'] = 'Monitoring router rumah aktif, tetapi router belum bisa dijangkau dari server saat ini.';
            $snapshot['status_label'] = 'Router Belum Terjangkau';

            return $snapshot;
        }
    }

    private function buildConfiguration(Customer $customer, array $connectionContext): array
    {
        $explicitType = strtolower(trim((string) ($customer->home_router_type ?? '')));
        $explicitHost = trim((string) ($customer->home_router_host ?? ''));
        $derivedHost = $this->resolvePppoeDerivedHost($connectionContext);
        $host = $explicitHost !== '' ? $explicitHost : $derivedHost;
        $hostSource = $explicitHost !== '' ? 'configured_host' : ($derivedHost !== null ? 'pppoe_remote_address' : null);
        $hostSourceLabel = $explicitHost !== '' ? 'Host manajemen tersimpan' : ($derivedHost !== null ? 'IP dari PPPoE pusat' : null);
        $enabled = (bool) $customer->home_router_monitoring_enabled || $derivedHost !== null;
        $type = $explicitType !== '' ? $explicitType : ($derivedHost !== null ? 'auto_web_router' : '');
        $username = trim((string) ($customer->home_router_username ?? ''));
        $password = trim((string) ($customer->home_router_password ?? ''));
        $wanInterface = trim((string) ($customer->home_router_wan_interface ?? ''));
        $managementMode = $this->managementModeForType($type);
        $typeLabel = $this->typeLabel($type);

        if ($managementMode === 'web') {
            if ($username === '') {
                $username = self::DEFAULT_WEB_USERNAME;
            }

            if ($password === '') {
                $password = self::DEFAULT_WEB_PASSWORD;
            }
        }

        $configured = $host !== null && $host !== '' && (
            $managementMode === 'web'
                ? true
                : ($username !== '' && $password !== '')
        );

        $note = 'Monitoring router rumah belum diaktifkan.';

        if ($enabled && !$configured) {
            $note = 'Monitoring router rumah aktif, tetapi konfigurasi router belum lengkap.';
        } elseif ($enabled && $configured) {
            if ($hostSource === 'pppoe_remote_address') {
                $note = "Portal akan mencoba router rumah lewat IP PPPoE {$host} yang didapat dari MikroTik pusat.";
            } else {
                $note = $managementMode === 'api'
                    ? 'Data tambahan dapat diambil langsung dari router rumah pelanggan.'
                    : "Portal akan mencoba menjangkau panel admin {$typeLabel} secara langsung.";
            }
        }

        return [
            'enabled' => $enabled,
            'configured' => $configured,
            'type' => $type ?: 'auto_web_router',
            'type_label' => $typeLabel,
            'host' => $host !== '' ? $host : null,
            'host_source' => $hostSource,
            'host_source_label' => $hostSourceLabel,
            'port' => $customer->home_router_port ?: $this->defaultPortForType($type),
            'username' => $username !== '' ? $username : null,
            'password' => $password !== '' ? $password : null,
            'wan_interface' => $wanInterface !== '' ? $wanInterface : null,
            'management_mode' => $managementMode,
            'note' => $note,
        ];
    }

    private function resolveWanContext(?string $configuredWanInterface, array $interfaces, array $pppoeClients, array $dhcpClients): array
    {
        $availableInterfaces = collect($interfaces)->keyBy(function ($item) {
            return strtolower((string) ($item['name'] ?? ''));
        });

        if ($configuredWanInterface) {
            $configuredKey = strtolower($configuredWanInterface);

            if ($availableInterfaces->has($configuredKey)) {
                $matchedInterface = $availableInterfaces->get($configuredKey);

                return [
                    'interface_name' => $matchedInterface['name'],
                    'uptime' => null,
                ];
            }
        }

        $runningPppoeClient = collect($pppoeClients)
            ->first(function ($item) {
                return ($item['running'] ?? false) && !($item['disabled'] ?? false);
            });

        if ($runningPppoeClient) {
            return [
                'interface_name' => $runningPppoeClient['name'] ?? null,
                'uptime' => $runningPppoeClient['uptime'] ?? null,
            ];
        }

        $boundDhcpClient = collect($dhcpClients)
            ->first(function ($item) {
                return strtolower((string) ($item['status'] ?? '')) === 'bound' && !($item['disabled'] ?? false);
            });

        if ($boundDhcpClient) {
            return [
                'interface_name' => $boundDhcpClient['interface'] ?? null,
                'uptime' => null,
            ];
        }

        $defaultEther = collect($interfaces)
            ->first(function ($item) {
                return strtolower((string) ($item['default_name'] ?? '')) === 'ether1'
                    && !($item['disabled'] ?? false);
            });

        return [
            'interface_name' => $defaultEther['name'] ?? $configuredWanInterface,
            'uptime' => null,
        ];
    }

    private function resolveTrafficSummary(?string $wanInterface, array $interfaces): array
    {
        if (!$wanInterface) {
            return [
                'available' => false,
                'source' => null,
                'source_label' => null,
                'download_bytes' => null,
                'upload_bytes' => null,
                'total_bytes' => null,
                'note' => 'Interface WAN router rumah belum terdeteksi.',
            ];
        }

        $interface = collect($interfaces)->first(function ($item) use ($wanInterface) {
            return strtolower((string) ($item['name'] ?? '')) === strtolower($wanInterface);
        });

        $downloadBytes = $interface['rx_bytes'] ?? null;
        $uploadBytes = $interface['tx_bytes'] ?? null;
        $totalBytes = $interface['total_bytes'] ?? null;
        $available = $downloadBytes !== null || $uploadBytes !== null || $totalBytes !== null;

        return [
            'available' => $available,
            'source' => $available ? 'home_router_wan' : null,
            'source_label' => $available ? 'Interface WAN router rumah' : null,
            'download_bytes' => $downloadBytes,
            'upload_bytes' => $uploadBytes,
            'total_bytes' => $totalBytes,
            'note' => $available
                ? 'Counter diambil langsung dari interface WAN router rumah pelanggan.'
                : 'Router rumah terhubung, tetapi counter traffic WAN belum tersedia.',
        ];
    }

    private function resolveDeviceSummary(MikroTikService $mikrotik, ?string $wanInterface): array
    {
        try {
            $leases = collect($mikrotik->getDhcpLeases())
                ->filter(function ($item) {
                    return strtolower((string) ($item['status'] ?? '')) === 'bound'
                        && !($item['disabled'] ?? false)
                        && !($item['blocked'] ?? false);
                });

            $leaseCount = $this->countUniqueValues($leases->map(function ($item) {
                return $item['active_mac_address'] ?? $item['mac_address'] ?? $item['address'] ?? null;
            })->all());

            if ($leaseCount > 0) {
                return [
                    'available' => true,
                    'count' => $leaseCount,
                    'source' => 'dhcp_lease',
                    'source_label' => 'Lease DHCP aktif',
                    'note' => 'Jumlah perangkat dihitung dari lease DHCP yang sedang bound di router rumah.',
                ];
            }
        } catch (\Throwable $e) {
            \Log::debug('Failed to derive customer router device count from DHCP leases', [
                'error' => $e->getMessage(),
            ]);
        }

        try {
            $bridgeHosts = collect($mikrotik->getBridgeHosts())
                ->filter(function ($item) use ($wanInterface) {
                    $interface = strtolower((string) ($item['interface'] ?? $item['on_interface'] ?? ''));

                    return !($item['local'] ?? false)
                        && ($wanInterface === null || $interface !== strtolower($wanInterface));
                });

            $bridgeHostCount = $this->countUniqueValues($bridgeHosts->pluck('mac_address')->all());

            if ($bridgeHostCount > 0) {
                return [
                    'available' => true,
                    'count' => $bridgeHostCount,
                    'source' => 'bridge_host',
                    'source_label' => 'Bridge host aktif',
                    'note' => 'Jumlah perangkat dihitung dari bridge host yang terlihat langsung di router rumah.',
                ];
            }
        } catch (\Throwable $e) {
            \Log::debug('Failed to derive customer router device count from bridge hosts', [
                'error' => $e->getMessage(),
            ]);
        }

        try {
            $arpEntries = collect($mikrotik->getArpEntries())
                ->filter(function ($item) use ($wanInterface) {
                    $interface = strtolower((string) ($item['interface'] ?? ''));

                    return ($item['complete'] ?? false)
                        && !($item['disabled'] ?? false)
                        && ($wanInterface === null || $interface !== strtolower($wanInterface));
                });

            $arpCount = $this->countUniqueValues($arpEntries->pluck('mac_address')->all());

            if ($arpCount > 0) {
                return [
                    'available' => true,
                    'count' => $arpCount,
                    'source' => 'arp',
                    'source_label' => 'ARP aktif',
                    'note' => 'Jumlah perangkat dihitung dari entri ARP aktif di router rumah.',
                ];
            }
        } catch (\Throwable $e) {
            \Log::debug('Failed to derive customer router device count from ARP entries', [
                'error' => $e->getMessage(),
            ]);
        }

        return [
            'available' => false,
            'count' => null,
            'source' => null,
            'source_label' => null,
            'note' => 'Router rumah sudah dicoba, tetapi jumlah perangkat belum bisa dihitung dari konfigurasi saat ini.',
        ];
    }

    private function countUniqueValues(array $values): int
    {
        return collect($values)
            ->filter(function ($value) {
                return $value !== null && trim((string) $value) !== '';
            })
            ->map(function ($value) {
                return strtolower(trim((string) $value));
            })
            ->unique()
            ->count();
    }

    private function buildAvailabilityNote(?string $wanInterface, bool $hasDeviceCount): string
    {
        if ($wanInterface && $hasDeviceCount) {
            return "Data tambahan diambil langsung dari router rumah pelanggan melalui interface {$wanInterface}.";
        }

        if ($wanInterface) {
            return "Router rumah berhasil dihubungi melalui interface {$wanInterface}.";
        }

        return 'Router rumah berhasil dihubungi, tetapi interface WAN belum terdeteksi otomatis.';
    }

    private function defaultPortForType(string $type): int
    {
        return $this->managementModeForType($type) === 'api'
            ? self::DEFAULT_PORT
            : self::DEFAULT_WEB_PORT;
    }

    private function managementModeForType(string $type): string
    {
        return $type === 'mikrotik' ? 'api' : 'web';
    }

    private function typeLabel(string $type): string
    {
        return match ($type) {
            'auto_web_router' => 'Router Rumah via PPPoE',
            'vsol_v2801rgw' => 'VSOL V2801RGW',
            'global_gl01' => 'Global GL-01',
            'mikrotik' => 'MikroTik',
            default => 'Router Rumah',
        };
    }

    private function resolvePppoeDerivedHost(array $connectionContext): ?string
    {
        $candidates = [
            $connectionContext['session']['ip_address'] ?? null,
            $connectionContext['ip_address'] ?? null,
            $connectionContext['secret']['remote_address'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            $value = trim((string) $candidate);

            if ($value !== '' && filter_var($value, FILTER_VALIDATE_IP)) {
                return $value;
            }
        }

        return null;
    }
}

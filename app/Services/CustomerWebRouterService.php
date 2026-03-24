<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class CustomerWebRouterService
{
    private const DEFAULT_TIMEOUT = 3;
    private const VSOL_STATUS_PATHS = [
        '/status.asp',
        '/status/status.asp',
        '/state.asp',
        '/status.cgi',
        '/index.asp',
        '/index.html',
        '/',
    ];

    public function getSnapshot(array $configuration): array
    {
        $type = $configuration['type'] ?? 'generic_web_router';
        $typeLabel = $this->typeLabel($type);
        $probe = $this->probePanel($configuration);
        $modelSpecific = $this->resolveModelSpecificSnapshot($configuration, $probe);

        $traffic = $modelSpecific['traffic'] ?? [
            'available' => false,
            'source' => null,
            'source_label' => null,
            'download_bytes' => null,
            'upload_bytes' => null,
            'total_bytes' => null,
            'note' => null,
        ];

        $devices = $modelSpecific['devices'] ?? [
            'available' => false,
            'count' => null,
            'source' => null,
            'source_label' => null,
            'note' => null,
        ];

        return [
            'enabled' => true,
            'configured' => true,
            'reachable' => $probe['reachable'],
            'type' => $type,
            'type_label' => $typeLabel,
            'identity' => $modelSpecific['identity'] ?? ($probe['identity'] ?? $typeLabel),
            'version' => $modelSpecific['version'] ?? null,
            'host' => $configuration['host'] ?? null,
            'host_source' => $configuration['host_source'] ?? null,
            'host_source_label' => $configuration['host_source_label'] ?? null,
            'wan_interface' => $modelSpecific['wan_interface'] ?? null,
            'wan_uptime' => $modelSpecific['wan_uptime'] ?? null,
            'management_mode' => 'web',
            'status_label' => $probe['reachable'] ? 'Panel Router Terjangkau' : 'Panel Router Belum Terjangkau',
            'note' => $probe['reachable']
                ? ($modelSpecific['note'] ?? $this->buildReachableNote($type))
                : 'Portal belum bisa menjangkau panel admin router rumah saat ini.',
            'traffic' => [
                'available' => (bool) ($traffic['available'] ?? false),
                'source' => $traffic['source'] ?? null,
                'source_label' => $traffic['source_label'] ?? null,
                'download_bytes' => $traffic['download_bytes'] ?? null,
                'upload_bytes' => $traffic['upload_bytes'] ?? null,
                'total_bytes' => $traffic['total_bytes'] ?? null,
                'note' => $traffic['note'] ?? ($probe['reachable']
                    ? 'Panel web router sudah terjangkau, tetapi counter traffic model ini belum punya parser yang stabil di portal.'
                    : 'Counter traffic akan tersedia setelah panel router rumah bisa dijangkau dan struktur halaman statusnya tervalidasi.'),
            ],
            'devices' => [
                'available' => (bool) ($devices['available'] ?? false),
                'count' => $devices['count'] ?? null,
                'source' => $devices['source'] ?? null,
                'source_label' => $devices['source_label'] ?? null,
                'note' => $devices['note'] ?? ($probe['reachable']
                    ? 'Panel web router sudah terjangkau, tetapi parser jumlah perangkat untuk model ini masih membutuhkan sampel halaman status.'
                    : 'Jumlah perangkat akan tersedia setelah panel router rumah bisa dijangkau dan halaman device list tervalidasi.'),
            ],
        ];
    }

    private function resolveModelSpecificSnapshot(array $configuration, array $probe): array
    {
        $type = (string) ($configuration['type'] ?? '');

        if (($probe['reachable'] ?? false) !== true) {
            return [];
        }

        if ($type === 'vsol_v2801rgw') {
            return $this->buildVsolSnapshot($configuration, $probe);
        }

        return [];
    }

    private function buildVsolSnapshot(array $configuration, array $probe): array
    {
        $documents = $this->collectPanelDocuments($configuration, $probe);

        $version = $this->parseFirstMatch($documents, [
            '/(?:Software|Firmware)\s*(?:Version)?\s*[:=]\s*([A-Za-z0-9._\/-]+)/i',
            '/\b(V?\d+\.\d+(?:\.\d+){0,3}[A-Za-z0-9._-]*)\b/i',
        ]);

        $wanUptime = $this->parseFirstMatch($documents, [
            '/(?:WAN|PPPoE|Internet)\s*(?:Connection\s*)?(?:Uptime|Up\s*Time)\s*[:=]\s*([A-Za-z0-9: .-]{3,48})/i',
            '/\b(\d+\s*(?:days?|hari)\s*\d{1,2}:\d{2}:\d{2})\b/i',
            '/\b(\d{1,3}:\d{2}:\d{2})\b/',
        ]);

        $wanInterface = $this->parseFirstMatch($documents, [
            '/(?:WAN|Internet)\s*(?:Interface|Port)\s*[:=]\s*([A-Za-z0-9._\/-]{2,40})/i',
            '/(?:PPPoE|PON)\s*(?:Interface|Port)\s*[:=]\s*([A-Za-z0-9._\/-]{2,40})/i',
        ]);

        $downloadBytes = $this->parseBytesMetric($documents, [
            '/(?:RX|Down(?:load)?)\s*(?:Bytes?|Octets?)\s*[:=]\s*([0-9][0-9.,\s]*(?:[KMGTP]?B)?)/i',
            '/(?:Received|Receive)\s*(?:Data|Bytes?)\s*[:=]\s*([0-9][0-9.,\s]*(?:[KMGTP]?B)?)/i',
        ]);

        $uploadBytes = $this->parseBytesMetric($documents, [
            '/(?:TX|Up(?:load)?)\s*(?:Bytes?|Octets?)\s*[:=]\s*([0-9][0-9.,\s]*(?:[KMGTP]?B)?)/i',
            '/(?:Sent|Send)\s*(?:Data|Bytes?)\s*[:=]\s*([0-9][0-9.,\s]*(?:[KMGTP]?B)?)/i',
        ]);

        $totalBytes = $this->parseBytesMetric($documents, [
            '/(?:Total|Sum)\s*(?:Bytes?|Traffic|Data)\s*[:=]\s*([0-9][0-9.,\s]*(?:[KMGTP]?B)?)/i',
        ]);

        if ($totalBytes === null && ($downloadBytes !== null || $uploadBytes !== null)) {
            $totalBytes = (int) (($downloadBytes ?? 0) + ($uploadBytes ?? 0));
        }

        $deviceCount = $this->parseDeviceCount($documents);

        $hasAnyParsedMetric = $wanUptime !== null
            || $wanInterface !== null
            || $downloadBytes !== null
            || $uploadBytes !== null
            || $deviceCount !== null;

        return [
            'identity' => 'VSOL V2801RGW',
            'version' => $version,
            'wan_interface' => $wanInterface,
            'wan_uptime' => $wanUptime,
            'note' => $hasAnyParsedMetric
                ? 'Panel web VSOL V2801RGW terjangkau dan parser model-specific berhasil membaca sebagian metrik status WAN.'
                : 'Panel web VSOL V2801RGW terjangkau. Parser model-specific sudah aktif, namun metrik WAN belum ditemukan pada halaman status yang bisa diakses.',
            'traffic' => [
                'available' => $totalBytes !== null || $downloadBytes !== null || $uploadBytes !== null,
                'source' => ($totalBytes !== null || $downloadBytes !== null || $uploadBytes !== null) ? 'vsol_web_status' : null,
                'source_label' => ($totalBytes !== null || $downloadBytes !== null || $uploadBytes !== null) ? 'Status page VSOL V2801RGW' : null,
                'download_bytes' => $downloadBytes,
                'upload_bytes' => $uploadBytes,
                'total_bytes' => $totalBytes,
                'note' => ($totalBytes !== null || $downloadBytes !== null || $uploadBytes !== null)
                    ? 'Counter traffic dibaca dari panel web VSOL (model-specific parser).'
                    : 'Parser VSOL aktif, tetapi counter traffic belum ditemukan pada respon panel saat ini.',
            ],
            'devices' => [
                'available' => $deviceCount !== null,
                'count' => $deviceCount,
                'source' => $deviceCount !== null ? 'vsol_web_device_summary' : null,
                'source_label' => $deviceCount !== null ? 'Ringkasan klien panel VSOL' : null,
                'note' => $deviceCount !== null
                    ? 'Jumlah perangkat diambil dari ringkasan client/device pada panel web VSOL.'
                    : 'Parser VSOL aktif, tetapi jumlah perangkat belum ditemukan pada halaman yang tersedia.',
            ],
        ];
    }

    private function probePanel(array $configuration): array
    {
        $urls = $this->candidateUrls($configuration);
        $username = (string) ($configuration['username'] ?? '');
        $password = (string) ($configuration['password'] ?? '');

        foreach ($urls as $url) {
            try {
                $response = Http::timeout(self::DEFAULT_TIMEOUT)
                    ->withoutVerifying()
                    ->withOptions(['allow_redirects' => false])
                    ->get($url);

                if ($this->isReachableStatus($response->status())) {
                    return [
                        'reachable' => true,
                        'base_url' => $url,
                        'identity' => $this->detectIdentity($response->body(), $configuration['type'] ?? null),
                        'body' => $response->body(),
                    ];
                }

                if ($response->status() === 401 && $username !== '' && $password !== '') {
                    $authenticated = Http::timeout(self::DEFAULT_TIMEOUT)
                        ->withoutVerifying()
                        ->withOptions(['allow_redirects' => false])
                        ->withBasicAuth($username, $password)
                        ->get($url);

                    if ($this->isReachableStatus($authenticated->status())) {
                        return [
                            'reachable' => true,
                            'base_url' => $url,
                            'identity' => $this->detectIdentity($authenticated->body(), $configuration['type'] ?? null),
                            'body' => $authenticated->body(),
                        ];
                    }
                }
            } catch (\Throwable $e) {
                \Log::debug('Failed to probe customer web router panel', [
                    'url' => $url,
                    'type' => $configuration['type'] ?? null,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [
            'reachable' => false,
            'identity' => null,
            'base_url' => null,
            'body' => null,
        ];
    }

    private function collectPanelDocuments(array $configuration, array $probe): array
    {
        $documents = [];
        $seedBody = $probe['body'] ?? null;

        if (is_string($seedBody) && trim($seedBody) !== '') {
            $documents[] = $seedBody;
        }

        $baseUrl = (string) ($probe['base_url'] ?? '');
        $username = (string) ($configuration['username'] ?? '');
        $password = (string) ($configuration['password'] ?? '');

        if ($baseUrl === '') {
            return $documents;
        }

        $origin = $this->extractOrigin($baseUrl);

        if ($origin === null) {
            return $documents;
        }

        foreach (self::VSOL_STATUS_PATHS as $path) {
            $url = rtrim($origin, '/') . $path;

            try {
                $response = Http::timeout(self::DEFAULT_TIMEOUT)
                    ->withoutVerifying()
                    ->withOptions(['allow_redirects' => false])
                    ->get($url);

                if (!$this->isReachableStatus($response->status()) && $response->status() === 401 && $username !== '' && $password !== '') {
                    $response = Http::timeout(self::DEFAULT_TIMEOUT)
                        ->withoutVerifying()
                        ->withOptions(['allow_redirects' => false])
                        ->withBasicAuth($username, $password)
                        ->get($url);
                }

                if ($this->isReachableStatus($response->status())) {
                    $body = $response->body();

                    if (is_string($body) && trim($body) !== '') {
                        $documents[] = $body;
                    }
                }
            } catch (\Throwable $e) {
                \Log::debug('Failed to fetch VSOL status document', [
                    'url' => $url,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return array_values(array_unique($documents));
    }

    private function extractOrigin(string $url): ?string
    {
        $parts = parse_url($url);

        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        $origin = $parts['scheme'] . '://' . $parts['host'];

        if (!empty($parts['port'])) {
            $origin .= ':' . $parts['port'];
        }

        return $origin;
    }

    private function parseFirstMatch(array $documents, array $patterns): ?string
    {
        foreach ($documents as $document) {
            foreach ($patterns as $pattern) {
                if (preg_match($pattern, $document, $matches) === 1) {
                    $value = trim((string) ($matches[1] ?? ''));

                    if ($value !== '') {
                        return $value;
                    }
                }
            }
        }

        return null;
    }

    private function parseBytesMetric(array $documents, array $patterns): ?int
    {
        $value = $this->parseFirstMatch($documents, $patterns);

        if ($value === null) {
            return null;
        }

        return $this->toBytes($value);
    }

    private function parseDeviceCount(array $documents): ?int
    {
        $patterns = [
            '/(?:Online\s*)?(?:Device|Client|Host|User)\s*(?:Count|Num(?:ber)?)\s*[:=]\s*(\d{1,4})/i',
            '/(?:WLAN|Wi-?Fi)\s*(?:Client|Station)\s*(?:Count|Num(?:ber)?)\s*[:=]\s*(\d{1,4})/i',
            '/(?:LAN|DHCP)\s*(?:Client|Host)\s*(?:Count|Num(?:ber)?)\s*[:=]\s*(\d{1,4})/i',
        ];

        $raw = $this->parseFirstMatch($documents, $patterns);

        if ($raw === null) {
            return null;
        }

        $value = (int) $raw;

        return $value >= 0 ? $value : null;
    }

    private function toBytes(string $value): ?int
    {
        $normalized = trim($value);

        if ($normalized === '') {
            return null;
        }

        if (preg_match('/^([0-9][0-9.,\s]*)\s*([KMGTP]?B)?$/i', $normalized, $matches) === 1) {
            $numberRaw = str_replace([',', ' '], '', $matches[1]);
            $number = (float) $numberRaw;
            $unit = strtoupper((string) ($matches[2] ?? 'B'));

            $multiplier = match ($unit) {
                'KB' => 1024,
                'MB' => 1024 ** 2,
                'GB' => 1024 ** 3,
                'TB' => 1024 ** 4,
                'PB' => 1024 ** 5,
                default => 1,
            };

            return (int) round($number * $multiplier);
        }

        if (preg_match('/^\d+$/', $normalized) === 1) {
            return (int) $normalized;
        }

        return null;
    }

    private function candidateUrls(array $configuration): array
    {
        $host = trim((string) ($configuration['host'] ?? ''));
        $port = (int) ($configuration['port'] ?? 80);

        if ($host === '') {
            return [];
        }

        if (preg_match('#^https?://#i', $host)) {
            return [rtrim($host, '/') . '/'];
        }

        $httpUrl = $port === 80 ? "http://{$host}/" : "http://{$host}:{$port}/";
        $httpsUrl = $port === 443 ? "https://{$host}/" : "https://{$host}:{$port}/";

        return in_array($port, [443, 8443], true)
            ? [$httpsUrl, $httpUrl]
            : [$httpUrl, $httpsUrl];
    }

    private function isReachableStatus(int $status): bool
    {
        return in_array($status, [200, 301, 302, 303, 307, 308, 401, 403], true);
    }

    private function detectIdentity(string $body, ?string $type): string
    {
        $label = $this->typeLabel($type);

        if (stripos($body, 'V2801RGW') !== false) {
            return 'VSOL V2801RGW';
        }

        if (stripos($body, 'GL-01') !== false) {
            return 'Global GL-01';
        }

        return $label;
    }

    private function typeLabel(?string $type): string
    {
        return match ($type) {
            'auto_web_router' => 'Router Rumah via PPPoE',
            'vsol_v2801rgw' => 'VSOL V2801RGW',
            'global_gl01' => 'Global GL-01',
            default => 'Router Web Rumah',
        };
    }

    private function buildReachableNote(string $type): string
    {
        return match ($type) {
            'auto_web_router' => 'Portal mencoba menjangkau router rumah langsung lewat IP PPPoE yang diberikan MikroTik pusat.',
            'vsol_v2801rgw' => 'Panel web VSOL V2801RGW berhasil dijangkau. Datasheet resmi VSOL menyebut model ini mendukung WEB/TELNET/OAM/OMCI/TR069, jadi portal sudah siap untuk parser status model-specific berikutnya.',
            'global_gl01' => 'Panel web Global GL-01 berhasil dijangkau. Model ini sementara diperlakukan sebagai router web generik sampai struktur halaman statusnya tervalidasi.',
            default => 'Panel web router rumah berhasil dijangkau.',
        };
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\AcsDevice;
use App\Models\Customer;
use App\Services\MikroTikService;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class OntProxyController extends Controller
{
    public function __construct(
        protected MikroTikService $mikroTikService
    ) {
    }

    /**
     * Dashboard page for Remote ONT Gateway
     */
    public function index(Request $request)
    {
        $forceFresh = $request->has('refresh');
        $devices = $this->getMergedDevices($forceFresh);

        return view('remote_ont.index', [
            'devices' => $devices,
            'totalOnline' => count(array_filter($devices, fn($d) => $d['is_online'])),
            'totalDevices' => count($devices),
        ]);
    }

    /**
     * API to fetch devices for live search/filter
     */
    public function apiList(Request $request): JsonResponse
    {
        $forceFresh = $request->has('refresh');
        $allDevices = $this->getMergedDevices($forceFresh);
        $totalOnline = count(array_filter($allDevices, fn($d) => $d['is_online']));
        $totalDevices = count($allDevices);

        $devices = $allDevices;

        $search = strtolower(trim((string) $request->input('search', '')));
        if ($search !== '') {
            $devices = array_filter($devices, function ($d) use ($search) {
                return str_contains(strtolower($d['username']), $search)
                    || str_contains(strtolower($d['customer_name']), $search)
                    || str_contains(strtolower($d['remote_ip']), $search)
                    || str_contains(strtolower($d['caller_id']), $search);
            });
            $devices = array_values($devices);
        }

        $onlineOnly = $request->boolean('online_only');
        if ($onlineOnly) {
            $devices = array_values(array_filter($devices, fn($d) => $d['is_online']));
        }

        return response()->json([
            'success' => true,
            'data' => $devices,
            'count' => count($devices),
            'total_online' => $totalOnline,
            'total_devices' => $totalDevices,
        ]);
    }

    /**
     * AJAX endpoint to test connectivity (TCP socket ping)
     */
    public function checkPing(Request $request): JsonResponse
    {
        $ip = trim((string) $request->input('ip', ''));
        $port = (int) $request->input('port', 80);

        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return response()->json([
                'success' => false,
                'online' => false,
                'message' => 'Format IP tidak valid',
            ], 422);
        }

        $startTime = microtime(true);
        $fp = @fsockopen($ip, $port, $errno, $errstr, 2.5);
        $latencyMs = round((microtime(true) - $startTime) * 1000, 1);

        if ($fp) {
            fclose($fp);
            return response()->json([
                'success' => true,
                'online' => true,
                'latency_ms' => $latencyMs,
                'message' => "Port {$port} terhubung aktif ({$latencyMs} ms)",
            ]);
        }

        return response()->json([
            'success' => true,
            'online' => false,
            'latency_ms' => null,
            'message' => "Tidak ada respon di port {$port} ({$errstr})",
        ]);
    }

    /**
     * Reverse Proxy Handler for ONT Web Interface
     */
    public function proxy(Request $request, string $ip, ?string $path = null): Response
    {
        // 1. Validate IP security (must be IPv4)
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            abort(400, 'Invalid IP address');
        }

        $port = (int) $request->query('__port', session("ont_port_{$ip}", 80));
        if ($port <= 0 || $port > 65535) {
            $port = 80;
        }
        session()->put("ont_port_{$ip}", $port);

        $path = $path ? ltrim($path, '/') : '';
        
        // Build target URL
        $targetUrl = "http://{$ip}:{$port}/{$path}";
        
        // Filter out proxy-specific query parameters
        $queryParams = $request->query();
        unset($queryParams['__port']);
        if (!empty($queryParams)) {
            $targetUrl .= '?' . http_build_query($queryParams);
        }

        // Initialize cURL session
        $ch = curl_init($targetUrl);
        $method = $request->method();

        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        // Forward headers
        $forwardHeaders = [];
        $incomingHeaders = $request->header();

        foreach ($incomingHeaders as $name => $values) {
            $lowerName = strtolower($name);
            if (in_array($lowerName, ['host', 'accept-encoding', 'content-length'])) {
                continue;
            }
            foreach ($values as $val) {
                $forwardHeaders[] = "{$name}: {$val}";
            }
        }

        $forwardHeaders[] = "Host: {$ip}:{$port}";
        $forwardHeaders[] = "Accept-Encoding: identity";

        curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);

        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            $body = $request->getContent();
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $rawResponse = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

        curl_close($ch);

        if ($rawResponse === false) {
            return response("<h3>Gagal Menghubungi ONT ({$ip}:{$port})</h3><p>Penyebab: {$curlError}</p><p>Pastikan ONT dalam keadaan menyala dan terhubung ke jaringan.</p>", 502, [
                'Content-Type' => 'text/html; charset=utf-8',
            ]);
        }

        $headerText = substr($rawResponse, 0, $headerSize);
        $body = substr($rawResponse, $headerSize);

        $responseHeaders = $this->parseHeaders($headerText);
        $gatewayBase = url("/ont-gateway/{$ip}");

        // 1. Rewrite 301 / 302 Redirect Location
        if (isset($responseHeaders['location'])) {
            $loc = $responseHeaders['location'];
            if (str_starts_with($loc, '/')) {
                $responseHeaders['location'] = "{$gatewayBase}{$loc}";
            } elseif (str_starts_with($loc, "http://{$ip}")) {
                $parsedLoc = parse_url($loc);
                $newPath = ($parsedLoc['path'] ?? '/') . (isset($parsedLoc['query']) ? '?' . $parsedLoc['query'] : '');
                $responseHeaders['location'] = "{$gatewayBase}{$newPath}";
            }
        }

        // 2. Rewrite Set-Cookie Path
        if (isset($responseHeaders['set-cookie'])) {
            $cookies = is_array($responseHeaders['set-cookie']) ? $responseHeaders['set-cookie'] : [$responseHeaders['set-cookie']];
            $rewrittenCookies = [];
            foreach ($cookies as $c) {
                $rewrittenCookies[] = preg_replace('/Path=[^;]+/i', "Path=/ont-gateway/{$ip}", $c);
            }
            $responseHeaders['set-cookie'] = $rewrittenCookies;
        }

        // 3. Process Body based on Content-Type
        if (str_contains($contentType, 'text/html') || empty($contentType)) {
            $body = $this->rewriteHtml($body, $gatewayBase, $ip);
        } elseif (str_contains($contentType, 'text/css')) {
            $body = $this->rewriteCss($body, $gatewayBase);
        }

        unset($responseHeaders['transfer-encoding'], $responseHeaders['content-length']);
        $responseHeaders['content-length'] = strlen($body);

        return response($body, $httpCode ?: 200, $responseHeaders);
    }

    private function rewriteHtml(string $html, string $gatewayBase, string $ip): string
    {
        $interceptor = <<<HTML
<script>
(function() {
    var gatewayPrefix = '{$gatewayBase}';
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.charAt(0) === '/' && url.indexOf(gatewayPrefix) !== 0) {
            url = gatewayPrefix + url;
        }
        var args = Array.prototype.slice.call(arguments);
        args[1] = url;
        return origOpen.apply(this, args);
    };

    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            if (typeof input === 'string' && input.charAt(0) === '/' && input.indexOf(gatewayPrefix) !== 0) {
                input = gatewayPrefix + input;
            } else if (input && typeof input.url === 'string' && input.url.charAt(0) === '/' && input.url.indexOf(gatewayPrefix) !== 0) {
                input = new Request(gatewayPrefix + input.url, input);
            }
            return origFetch.call(this, input, init);
        };
    }
})();
</script>
<base href="{$gatewayBase}/">
HTML;

        if (stripos($html, '<head>') !== false) {
            $html = preg_replace('/<head>/i', "<head>\n{$interceptor}", $html, 1);
        } else {
            $html = $interceptor . "\n" . $html;
        }

        $html = preg_replace_callback('/(href|src|action)=([\'"])\/([^\'"]*)\2/i', function ($matches) use ($gatewayBase) {
            $attr = $matches[1];
            $quote = $matches[2];
            $target = $matches[3];

            if (str_starts_with($target, 'ont-gateway/')) {
                return "{$attr}={$quote}/{$target}{$quote}";
            }

            return "{$attr}={$quote}{$gatewayBase}/{$target}{$quote}";
        }, $html);

        return $html;
    }

    private function rewriteCss(string $css, string $gatewayBase): string
    {
        return preg_replace_callback('/url\(\s*([\'"]?)\/([^\'"]+)\1\s*\)/i', function ($matches) use ($gatewayBase) {
            $quote = $matches[1];
            $target = $matches[2];
            return "url({$quote}{$gatewayBase}/{$target}{$quote})";
        }, $css);
    }

    private function parseHeaders(string $headerText): array
    {
        $headers = [];
        $lines = explode("\r\n", $headerText);

        foreach ($lines as $line) {
            if (str_contains($line, ':')) {
                [$key, $value] = explode(':', $line, 2);
                $key = strtolower(trim($key));
                $value = trim($value);

                if (isset($headers[$key])) {
                    if (!is_array($headers[$key])) {
                        $headers[$key] = [$headers[$key]];
                    }
                    $headers[$key][] = $value;
                } else {
                    $headers[$key] = $value;
                }
            }
        }

        return $headers;
    }

    private function getMergedDevices(bool $forceFresh = false): array
    {
        $cacheKey = 'remote_ont_merged_devices_list';
        if (!$forceFresh && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        $activeMap = [];
        try {
            $actives = $this->mikroTikService->getActivePPPoEConnections($forceFresh) ?? [];
            foreach ($actives as $act) {
                $name = strtolower(trim((string) ($act['name'] ?? '')));
                if ($name !== '') {
                    $activeMap[$name] = $act;
                }
            }
        } catch (Exception $e) {
            Log::warning('OntProxyController: Failed to get active PPPoE: ' . $e->getMessage());
        }

        $secretsMap = [];
        try {
            $secrets = $this->mikroTikService->getAllPPPoESecrets($forceFresh) ?? [];
            foreach ($secrets as $sec) {
                $name = strtolower(trim((string) ($sec['name'] ?? '')));
                if ($name !== '') {
                    $secretsMap[$name] = $sec;
                }
            }
        } catch (Exception $e) {
            Log::warning('OntProxyController: Failed to get PPPoE secrets: ' . $e->getMessage());
        }

        // Map customers from DB by username
        $customersByUsername = [];
        try {
            $customers = Customer::query()->select('id', 'name', 'username', 'phone', 'address')->get();
            foreach ($customers as $c) {
                $u = strtolower(trim((string) $c->username));
                if ($u !== '') {
                    $customersByUsername[$u] = $c;
                }
            }
        } catch (Exception $e) {}

        $allNames = array_unique(array_merge(array_keys($activeMap), array_keys($secretsMap)));
        $devices = [];

        foreach ($allNames as $u) {
            $active = $activeMap[$u] ?? null;
            $secret = $secretsMap[$u] ?? null;
            $customer = $customersByUsername[$u] ?? null;

            $isOnline = $active !== null;
            $remoteIp = $active['address'] ?? ($secret['remote_address'] ?? '');
            $callerId = $active['caller_id'] ?? ($secret['caller_id'] ?? '');
            $profile = $secret['profile'] ?? '';
            $uptime = $active['uptime'] ?? '-';
            $service = $active['service'] ?? ($secret['service'] ?? 'pppoe');
            $originalName = $active['name'] ?? ($secret['name'] ?? $u);

            if (empty($remoteIp) || $remoteIp === '0.0.0.0') {
                continue;
            }

            $devices[] = [
                'username' => $originalName,
                'customer_name' => $customer?->name ?: $originalName,
                'customer_id' => $customer?->id,
                'customer_phone' => $customer?->phone,
                'customer_address' => $customer?->address,
                'remote_ip' => $remoteIp,
                'caller_id' => $callerId,
                'profile' => $profile,
                'uptime' => $uptime,
                'is_online' => $isOnline,
                'service' => $service,
            ];
        }

        // If MikroTik returned no devices (e.g. MikroTik API unreachable or in local development)
        if (empty($devices)) {
            try {
                $acsDevices = AcsDevice::with('customer')->get();
                foreach ($acsDevices as $acs) {
                    $ip = $acs->ip_address ?: $acs->pppoe_ip;
                    if (empty($ip) || $ip === '0.0.0.0') {
                        continue;
                    }
                    $u = $acs->pppoe_username ?: ($acs->customer?->username ?: $acs->device_id);
                    $devices[] = [
                        'username' => $u,
                        'customer_name' => $acs->customer?->name ?: $u,
                        'customer_id' => $acs->customer_id,
                        'customer_phone' => $acs->customer?->phone,
                        'customer_address' => $acs->customer?->address,
                        'remote_ip' => $ip,
                        'caller_id' => $acs->wan_mac ?: ($acs->serial_number ?: ''),
                        'profile' => 'TR-069 ACS',
                        'uptime' => $acs->device_uptime ?: '-',
                        'is_online' => (bool) $acs->is_online,
                        'service' => 'tr069/pppoe',
                    ];
                }
            } catch (Exception $e) {
                Log::warning('OntProxyController: Failed fallback to AcsDevice: ' . $e->getMessage());
            }
        }

        usort($devices, function ($a, $b) {
            if ($a['is_online'] !== $b['is_online']) {
                return $b['is_online'] <=> $a['is_online'];
            }
            return strcasecmp($a['username'], $b['username']);
        });

        Cache::put($cacheKey, $devices, 30);

        return $devices;
    }
}
<?php

namespace App\Http\Controllers;

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
     * Fallback Proxy for ONT Assets / Endpoints requested at the root path
     */
    public function fallbackProxy(Request $request, ?string $path = null): Response
    {
        $ontIp = null;

        // 1. Extract from Referer header
        $referer = (string) $request->header('referer', '');
        if (preg_match('#/ont-gateway/(\d+\.\d+\.\d+\.\d+)#', $referer, $matches)) {
            $ontIp = $matches[1];
        }

        // 2. Fallback to active session
        if (!$ontIp) {
            $ontIp = session('active_ont_ip');
        }

        // 3. Fallback to active cookie
        if (!$ontIp) {
            $ontIp = $request->cookie('active_ont_gateway_ip');
        }

        if (!$ontIp || !filter_var($ontIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            abort(404, 'ONT Gateway context not found');
        }

        $fullPath = $path ?? $request->path();
        return $this->proxy($request, $ontIp, $fullPath);
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

        // Save active ONT session context
        session()->put('active_ont_ip', $ip);
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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
        curl_setopt($ch, CURLOPT_TCP_NODELAY, true);

        // Forward headers with embedded device compatibility
        $forwardHeaders = [];
        $incomingHeaders = $request->header();

        $hostHeader = ($port === 80) ? $ip : "{$ip}:{$port}";
        $originUrl = "http://{$ip}" . ($port === 80 ? '' : ":{$port}");

        foreach ($incomingHeaders as $name => $values) {
            $lowerName = strtolower($name);
            
            // Skip headers that break embedded ONT servers or leak external domain
            if (in_array($lowerName, [
                'host', 'accept-encoding', 'content-length', 'origin', 'referer',
                'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
                'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user',
            ])) {
                continue;
            }

            // Filter out Laravel cookies so we don't overflow the ONT embedded buffer (Boa MAX_HEADER_LENGTH)
            if ($lowerName === 'cookie') {
                $ontCookies = [];
                foreach ($values as $cookieStr) {
                    $parts = explode(';', $cookieStr);
                    foreach ($parts as $part) {
                        $part = trim($part);
                        if (empty($part)) continue;
                        [$cName] = explode('=', $part, 2);
                        $cName = trim($cName);
                        if (!in_array($cName, ['XSRF-TOKEN', 'ada-loker-lampung-session', 'laravel_session', 'active_ont_gateway_ip'])) {
                            $ontCookies[] = $part;
                        }
                    }
                }
                if (!empty($ontCookies)) {
                    $forwardHeaders[] = 'Cookie: ' . implode('; ', $ontCookies);
                }
                continue;
            }

            foreach ($values as $val) {
                $forwardHeaders[] = "{$name}: {$val}";
            }
        }

        $forwardHeaders[] = "Host: {$hostHeader}";
        $forwardHeaders[] = "Origin: {$originUrl}";
        $forwardHeaders[] = "Referer: {$originUrl}/index.html";
        $forwardHeaders[] = "Accept-Encoding: identity";
        $forwardHeaders[] = "Expect:"; // Suppress Expect: 100-continue which causes 502 on embedded web servers

        curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);

        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            $body = $request->getContent();
            if (empty($body) && !empty($request->all())) {
                $body = http_build_query($request->all());
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $rawResponse = curl_exec($ch);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

        curl_close($ch);

        if ($rawResponse === false) {
            Log::error("OntProxyController: cURL failed for {$method} {$targetUrl} - error: {$curlError} (errno: {$curlErrno})");
            return response("<h3>Gagal Menghubungi ONT ({$ip}:{$port})</h3><p>Penyebab: {$curlError} (errno: {$curlErrno})</p><p>Endpoint: {$method} {$targetUrl}</p>", 502, [
                'Content-Type' => 'text/html; charset=utf-8',
            ]);
        }

        $headerText = substr($rawResponse, 0, $headerSize);
        $body = substr($rawResponse, $headerSize);

        $responseHeaders = $this->parseHeaders($headerText);
        $gatewayBase = url("/ont-gateway/{$ip}");

        // 1. Rewrite 301 / 302 Redirect Location
        if (isset($responseHeaders['location'])) {
            $loc = is_array($responseHeaders['location']) ? end($responseHeaders['location']) : $responseHeaders['location'];
            $loc = trim($loc);
            if (str_starts_with($loc, '/')) {
                $responseHeaders['location'] = "{$gatewayBase}{$loc}";
            } elseif (str_starts_with($loc, "http://{$ip}") || str_starts_with($loc, "https://{$ip}")) {
                $parsedLoc = parse_url($loc);
                $newPath = ($parsedLoc['path'] ?? '/') . (isset($parsedLoc['query']) ? '?' . $parsedLoc['query'] : '');
                $responseHeaders['location'] = "{$gatewayBase}{$newPath}";
            } elseif (!str_starts_with($loc, 'http://') && !str_starts_with($loc, 'https://')) {
                $responseHeaders['location'] = "{$gatewayBase}/{$loc}";
            }
        }

        // 2. Rewrite Set-Cookie Path to root Path=/ so all ONT requests (gateway & fallback) send cookies
        if (isset($responseHeaders['set-cookie'])) {
            $cookies = is_array($responseHeaders['set-cookie']) ? $responseHeaders['set-cookie'] : [$responseHeaders['set-cookie']];
            $rewrittenCookies = [];
            foreach ($cookies as $c) {
                if (preg_match('/Path=[^;]+/i', $c)) {
                    $rewrittenCookies[] = preg_replace('/Path=[^;]+/i', 'Path=/', $c);
                } else {
                    $rewrittenCookies[] = $c . '; Path=/';
                }
            }
            $responseHeaders['set-cookie'] = $rewrittenCookies;
        }

        // 3. Detect Content-Type & File Extension to route properly
        $pathOnly = parse_url($path, PHP_URL_PATH) ?? '';
        $extension = strtolower(pathinfo($pathOnly, PATHINFO_EXTENSION));

        $isJs = in_array($extension, ['js', 'mjs']) || str_contains($contentType, 'javascript') || str_contains($contentType, 'ecmascript');
        $isCss = $extension === 'css' || str_contains($contentType, 'text/css');
        $isBinary = in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'bin']);
        
        $isHtml = !$isJs && !$isCss && !$isBinary && (
            in_array($extension, ['html', 'htm', 'asp', 'gch', 'php', 'cgi', '']) ||
            $path === '' ||
            str_contains($contentType, 'text/html') ||
            (empty($contentType) && (stripos($body, '<!DOCTYPE') !== false || stripos($body, '<html') !== false || stripos($body, '<head') !== false || stripos($body, '<body') !== false))
        );

        if ($isHtml) {
            $responseHeaders['content-type'] = 'text/html; charset=utf-8';
            $body = $this->rewriteHtml($body, $gatewayBase, $ip);
        } elseif ($isJs) {
            $responseHeaders['content-type'] = 'application/javascript; charset=utf-8';
            $body = $this->rewriteJs($body, $gatewayBase);
        } elseif ($isCss) {
            $responseHeaders['content-type'] = 'text/css; charset=utf-8';
            $body = $this->rewriteCss($body, $gatewayBase);
        } elseif ($extension === 'ico' && empty($contentType)) {
            $responseHeaders['content-type'] = 'image/x-icon';
        } elseif ($extension === 'png' && empty($contentType)) {
            $responseHeaders['content-type'] = 'image/png';
        } elseif (in_array($extension, ['jpg', 'jpeg']) && empty($contentType)) {
            $responseHeaders['content-type'] = 'image/jpeg';
        } elseif ($extension === 'svg' && empty($contentType)) {
            $responseHeaders['content-type'] = 'image/svg+xml';
        }

        unset($responseHeaders['transfer-encoding'], $responseHeaders['content-length']);
        $responseHeaders['content-length'] = strlen($body);

        $response = response($body, $httpCode ?: 200, $responseHeaders);
        $response->withCookie(cookie('active_ont_gateway_ip', $ip, 60, '/', null, false, false));

        return $response;
    }

    private function rewriteHtml(string $html, string $gatewayBase, string $ip): string
    {
        $interceptor = <<<HTML
<script>
(function() {
    var gatewayPrefix = '{$gatewayBase}';
    window.__webpack_public_path__ = gatewayPrefix + '/';

    function prefixUrl(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.indexOf('data:') === 0 || url.indexOf('javascript:') === 0 || url.indexOf('#') === 0) {
            return url;
        }
        if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('//') === 0) {
            return url;
        }
        if (url.charAt(0) === '/' && url.indexOf(gatewayPrefix) !== 0) {
            return gatewayPrefix + url;
        }
        return url;
    }

    // 1. Intercept XMLHttpRequest
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        var args = Array.prototype.slice.call(arguments);
        args[1] = prefixUrl(url);
        return origOpen.apply(this, args);
    };

    // 2. Intercept fetch
    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            if (typeof input === 'string') {
                input = prefixUrl(input);
            } else if (input && typeof input.url === 'string') {
                var newUrl = prefixUrl(input.url);
                if (newUrl !== input.url) {
                    input = new Request(newUrl, input);
                }
            }
            return origFetch.call(this, input, init);
        };
    }

    // 3. Intercept HTMLScriptElement.src (catches Webpack dynamic chunk script loading)
    var scriptSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    if (scriptSrcDesc && scriptSrcDesc.set) {
        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
            set: function(val) {
                return scriptSrcDesc.set.call(this, prefixUrl(val));
            },
            get: function() {
                return scriptSrcDesc.get.call(this);
            }
        });
    }

    // 4. Intercept HTMLLinkElement.href (catches dynamic CSS loading)
    var linkHrefDesc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
    if (linkHrefDesc && linkHrefDesc.set) {
        Object.defineProperty(HTMLLinkElement.prototype, 'href', {
            set: function(val) {
                return linkHrefDesc.set.call(this, prefixUrl(val));
            },
            get: function() {
                return linkHrefDesc.get.call(this);
            }
        });
    }

    // 5. Intercept HTMLImageElement.src
    var imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imgDesc && imgDesc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            set: function(val) {
                return imgDesc.set.call(this, prefixUrl(val));
            },
            get: function() {
                return imgDesc.get.call(this);
            }
        });
    }

    // 6. Intercept Element.setAttribute (catches script/link/form attributes)
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, val) {
        if ((name === 'src' || name === 'href' || name === 'action') && typeof val === 'string') {
            val = prefixUrl(val);
        }
        return origSetAttr.call(this, name, val);
    };

    // 7. Intercept History API (catches SPA hash & history navigation)
    var origPush = history.pushState;
    history.pushState = function(state, title, url) {
        return origPush.call(this, state, title, prefixUrl(url));
    };
    var origReplace = history.replaceState;
    history.replaceState = function(state, title, url) {
        return origReplace.call(this, state, title, prefixUrl(url));
    };
})();
</script>
<base href="{$gatewayBase}/">
HTML;

        if (stripos($html, '<head>') !== false) {
            $html = preg_replace('/<head>/i', "<head>\n{$interceptor}", $html, 1);
        } elseif (stripos($html, '<head ') !== false) {
            $html = preg_replace('/(<head[^>]*>)/i', "$1\n{$interceptor}", $html, 1);
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

    private function rewriteJs(string $js, string $gatewayBase): string
    {
        // 1. Rewrite Webpack publicPath assignments, e.g. __webpack_require__.p = "/" or a.p = "/" or n.p = "/"
        $js = preg_replace('/([\w\$]\.p\s*=\s*)["\']\/["\']/', '$1"' . $gatewayBase . '/"', $js);

        // 2. Rewrite common root relative chunk paths if hardcoded in JS
        $js = preg_replace('/(["\'])\/(js|css|img|images|fonts|boaform|cgi-bin)\//', '$1' . $gatewayBase . '/$2/', $js);

        return $js;
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
                $customers = Customer::whereNotNull('home_router_host')
                    ->orWhereNotNull('pppoe_username')
                    ->get();
                foreach ($customers as $c) {
                    $ip = $c->home_router_host;
                    if (empty($ip) || $ip === '0.0.0.0') {
                        continue;
                    }
                    $devices[] = [
                        'username' => $c->pppoe_username ?: $c->name,
                        'customer_name' => $c->name,
                        'customer_id' => $c->id,
                        'customer_phone' => $c->phone,
                        'customer_address' => $c->address,
                        'remote_ip' => $ip,
                        'caller_id' => '',
                        'profile' => 'Pelanggan DB',
                        'uptime' => '-',
                        'is_online' => (bool) $c->is_active,
                        'service' => 'pppoe',
                    ];
                }
            } catch (Exception $e) {
                Log::warning('OntProxyController: Failed fallback to customers: ' . $e->getMessage());
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
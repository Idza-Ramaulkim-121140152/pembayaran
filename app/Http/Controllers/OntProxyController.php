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
        curl_setopt($ch, CURLOPT_ENCODING, ''); // Auto decode gzip/deflate from embedded server
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

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
        $forwardHeaders[] = "Referer: {$originUrl}/" . ($path ?: 'index.html');
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
        $portSuffix = ($port !== 80) ? "?__port={$port}" : '';

        // 1. Rewrite 301 / 302 Redirect Location
        if (isset($responseHeaders['location'])) {
            $loc = is_array($responseHeaders['location']) ? end($responseHeaders['location']) : $responseHeaders['location'];
            $loc = trim($loc);
            $sep = str_contains($loc, '?') ? '&' : '?';
            $portAppend = ($port !== 80) ? "{$sep}__port={$port}" : '';
            if (str_starts_with($loc, '/')) {
                $responseHeaders['location'] = "{$gatewayBase}{$loc}{$portAppend}";
            } elseif (str_starts_with($loc, "http://{$ip}") || str_starts_with($loc, "https://{$ip}")) {
                $parsedLoc = parse_url($loc);
                $newPath = ($parsedLoc['path'] ?? '/') . (isset($parsedLoc['query']) ? '?' . $parsedLoc['query'] : '');
                $sep = str_contains($newPath, '?') ? '&' : '?';
                $portAppend = ($port !== 80) ? "{$sep}__port={$port}" : '';
                $responseHeaders['location'] = "{$gatewayBase}{$newPath}{$portAppend}";
            } elseif (!str_starts_with($loc, 'http://') && !str_starts_with($loc, 'https://')) {
                $responseHeaders['location'] = "{$gatewayBase}/{$loc}{$portAppend}";
            }
        }

        // 2. Rewrite Set-Cookie Path to root Path=/ and remove Domain/SameSite restrictions
        $rewrittenCookies = [];
        if (isset($responseHeaders['set-cookie'])) {
            $cookies = is_array($responseHeaders['set-cookie']) ? $responseHeaders['set-cookie'] : [$responseHeaders['set-cookie']];
            foreach ($cookies as $c) {
                $c = preg_replace('/Domain=[^;]+;?\s*/i', '', $c);
                $c = preg_replace('/SameSite=[^;]+;?\s*/i', '', $c);
                if (preg_match('/Path=[^;]+/i', $c)) {
                    $c = preg_replace('/Path=[^;]+/i', 'Path=/', $c);
                } else {
                    $c = rtrim($c, '; ') . '; Path=/';
                }
                $rewrittenCookies[] = $c;
            }
        }

        // 3. Detect Content-Type & File Extension to route properly
        $pathOnly = parse_url($path, PHP_URL_PATH) ?? '';
        $extension = strtolower(pathinfo($pathOnly, PATHINFO_EXTENSION));

        $binaryMap = [
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'ico' => 'image/x-icon',
            'svg' => 'image/svg+xml',
            'bmp' => 'image/bmp',
            'webp' => 'image/webp',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'eot' => 'application/vnd.ms-fontobject',
            'otf' => 'font/otf',
        ];

        $isBinary = isset($binaryMap[$extension]);
        if (!$isBinary) {
            if (str_starts_with($body, "\x89PNG\r\n\x1a\n")) {
                $isBinary = true;
                $extension = 'png';
            } elseif (str_starts_with($body, "\xFF\xD8\xFF")) {
                $isBinary = true;
                $extension = 'jpg';
            } elseif (str_starts_with($body, "GIF87a") || str_starts_with($body, "GIF89a")) {
                $isBinary = true;
                $extension = 'gif';
            } elseif (str_contains($contentType, 'image/') || str_contains($contentType, 'font/')) {
                $isBinary = true;
            }
        }

        $isJs = !$isBinary && (in_array($extension, ['js', 'mjs']) || str_contains($contentType, 'javascript') || str_contains($contentType, 'ecmascript'));
        $isCss = !$isBinary && ($extension === 'css' || str_contains($contentType, 'text/css'));
        
        $isHtml = !$isJs && !$isCss && !$isBinary && (
            in_array($extension, ['html', 'htm', 'asp', 'gch', 'php', 'cgi', '']) ||
            $path === '' ||
            str_contains($contentType, 'text/html') ||
            (empty($contentType) && (stripos($body, '<!DOCTYPE') !== false || stripos($body, '<html') !== false || stripos($body, '<head') !== false || stripos($body, '<body') !== false))
        );

        if ($isBinary) {
            $responseHeaders['content-type'] = $binaryMap[$extension] ?? ($contentType ?: 'application/octet-stream');
            // Do NOT touch binary body!
        } elseif ($isHtml) {
            $responseHeaders['content-type'] = 'text/html; charset=utf-8';
            $body = $this->rewriteHtml($body, $gatewayBase, $ip, $port);
        } elseif ($isJs) {
            $responseHeaders['content-type'] = 'application/javascript; charset=utf-8';
            $body = $this->rewriteJs($body, $gatewayBase);
        } elseif ($isCss) {
            $responseHeaders['content-type'] = 'text/css; charset=utf-8';
            $body = $this->rewriteCss($body, $gatewayBase);
        }

        unset(
            $responseHeaders['set-cookie'],
            $responseHeaders['transfer-encoding'],
            $responseHeaders['content-length'],
            $responseHeaders['content-encoding'],
            $responseHeaders['x-frame-options'],
            $responseHeaders['content-security-policy'],
            $responseHeaders['content-security-policy-report-only']
        );
        $responseHeaders['content-length'] = strlen($body);

        $response = response($body, $httpCode ?: 200, $responseHeaders);
        foreach ($rewrittenCookies as $c) {
            $response->headers->set('Set-Cookie', $c, false);
        }
        $response->withCookie(cookie('active_ont_gateway_ip', $ip, 60, '/', null, false, false));

        return $response;
    }

    private function rewriteHtml(string $html, string $gatewayBase, string $ip, int $port = 80): string
    {
        $portSuffix = ($port !== 80) ? "?__port={$port}" : '';
        $interceptor = <<<HTML
<script>
(function() {
    var gatewayPrefix = '{$gatewayBase}';
    window.__webpack_public_path__ = gatewayPrefix + '/';

    function prefixUrl(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0 || url.indexOf('javascript:') === 0 || url.indexOf('#') === 0) {
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

    // 3. Intercept HTMLScriptElement.src
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

    // 4. Intercept HTMLLinkElement.href
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

    // 6. Intercept Element.setAttribute
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, val) {
        if ((name === 'src' || name === 'href' || name === 'action') && typeof val === 'string') {
            val = prefixUrl(val);
        }
        return origSetAttr.call(this, name, val);
    };

    // 7. Intercept History API
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

        // Rewrite both root-relative and relative href, src, action
        $html = preg_replace_callback('/(href|src|action)=([\'"])(?!https?:\/\/|\/\/|data:|blob:|javascript:|#)(?:\/)?([^\'"]*)\2/i', function ($matches) use ($gatewayBase) {
            $attr = $matches[1];
            $quote = $matches[2];
            $target = ltrim($matches[3], '/');

            if (str_starts_with($target, 'ont-gateway/')) {
                return "{$attr}={$quote}/{$target}{$quote}";
            }

            return "{$attr}={$quote}{$gatewayBase}/{$target}{$quote}";
        }, $html);

        // Rewrite inline background: url(...)
        $html = preg_replace_callback('/url\(\s*([\'"]?)(?!https?:\/\/|\/\/|data:)(?:\/)?([^\'"]+)\1\s*\)/i', function ($matches) use ($gatewayBase) {
            $quote = $matches[1];
            $target = ltrim($matches[2], '/');
            if (str_starts_with($target, 'ont-gateway/')) {
                return "url({$quote}/{$target}{$quote})";
            }
            return "url({$quote}{$gatewayBase}/{$target}{$quote})";
        }, $html);

        // Rewrite script navigation: window.location = "/..."
        $html = preg_replace('/(window\.location(?:\.href)?\s*=\s*[\'"])\/([^\'"]+[\'"])/i', '$1' . $gatewayBase . '/$2', $html);
        $html = preg_replace('/(location\.(?:replace|assign)\(\s*[\'"])\/([^\'"]+[\'"])/i', '$1' . $gatewayBase . '/$2', $html);

        return $html;
    }

    private function rewriteJs(string $js, string $gatewayBase): string
    {
        // 1. Rewrite Webpack publicPath assignments, e.g. __webpack_require__.p = "/" or a.p = "/" or n.p = "/"
        $js = preg_replace('/([\w\$]\.p\s*=\s*)["\']\/["\']/', '$1"' . $gatewayBase . '/"', $js);

        // 2. Rewrite common root relative chunk paths if hardcoded in JS
        $js = preg_replace('/(["\'])\/(js|css|img|images|image|pic|media|fonts|static|assets|res|resource|theme|skin|boaform|cgi-bin|cgi)\//', '$1' . $gatewayBase . '/$2/', $js);

        // 3. Rewrite window.location navigation in JS
        $js = preg_replace('/(window\.location(?:\.href)?\s*=\s*[\'"])\/([^\'"]+[\'"])/i', '$1' . $gatewayBase . '/$2', $js);
        $js = preg_replace('/(location\.(?:replace|assign)\(\s*[\'"])\/([^\'"]+[\'"])/i', '$1' . $gatewayBase . '/$2', $js);

        return $js;
    }

    private function rewriteCss(string $css, string $gatewayBase): string
    {
        return preg_replace_callback('/url\(\s*([\'"]?)(?!https?:\/\/|\/\/|data:)(?:\/)?([^\'"]+)\1\s*\)/i', function ($matches) use ($gatewayBase) {
            $quote = $matches[1];
            $target = ltrim($matches[2], '/');
            if (str_starts_with($target, 'ont-gateway/')) {
                return "url({$quote}/{$target}{$quote})";
            }
            return "url({$quote}{$gatewayBase}/{$target}{$quote})";
        }, $css);
    }

    public static function resolveVendorFromMac(?string $mac): array
    {
        if (empty($mac)) {
            return [
                'vendor' => 'ONT Standar',
                'default_logins' => [
                    ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                    ['user' => 'user', 'pass' => 'user', 'desc' => 'User default'],
                ],
            ];
        }

        $cleanMac = strtoupper(str_replace([':', '-', '.'], '', $mac));
        $oui = substr($cleanMac, 0, 6);

        $vendors = [
            // ZTE
            'F8E71E' => 'ZTE', '708BCD' => 'ZTE', 'DC028E' => 'ZTE', '001E73' => 'ZTE',
            '48705C' => 'ZTE', '807934' => 'ZTE', '6C8B2F' => 'ZTE', 'CC5D8E' => 'ZTE',
            '342852' => 'ZTE', '647002' => 'ZTE', 'A0C589' => 'ZTE', '086083' => 'ZTE',
            '284153' => 'ZTE', 'B0C4E7' => 'ZTE', 'A89C62' => 'ZTE', 'E0191D' => 'ZTE',
            
            // Huawei
            '487D2E' => 'Huawei', 'ACE215' => 'Huawei', 'F89AC4' => 'Huawei', '001882' => 'Huawei',
            '00259E' => 'Huawei', '00464B' => 'Huawei', '04F938' => 'Huawei', '105172' => 'Huawei',
            '2008ED' => 'Huawei', '286ED4' => 'Huawei', '4C5499' => 'Huawei', '5439DF' => 'Huawei',
            '707B53' => 'Huawei', '84A8E4' => 'Huawei', 'D46AA8' => 'Huawei', 'E02861' => 'Huawei',

            // Fiberhome
            '000B86' => 'Fiberhome', '80F62E' => 'Fiberhome', '0014D1' => 'Fiberhome',
            '10005A' => 'Fiberhome', '28C68E' => 'Fiberhome', '985332' => 'Fiberhome',

            // VSOL / Realtek / Cortina
            'E067B3' => 'VSOL', '488AD2' => 'VSOL', '00E04C' => 'VSOL / Realtek',
            '000732' => 'VSOL', '78F5FD' => 'VSOL', '001F6B' => 'VSOL',

            // C-Data
            'BC5451' => 'C-Data', 'C4B983' => 'C-Data', '70AF6A' => 'C-Data',

            // TP-Link
            '50D4F7' => 'TP-Link', '6032B1' => 'TP-Link', '984827' => 'TP-Link',
            'B04E26' => 'TP-Link', 'C006C3' => 'TP-Link', 'E848B8' => 'TP-Link',

            // Totolink
            'D83214' => 'Totolink', '00E020' => 'Totolink',
        ];

        $vendorName = $vendors[$oui] ?? null;

        if (!$vendorName) {
            if (str_starts_with($cleanMac, 'F8') || str_starts_with($cleanMac, '70') || str_starts_with($cleanMac, 'DC')) {
                $vendorName = 'ZTE / OEM';
            } elseif (str_starts_with($cleanMac, 'E0') || str_starts_with($cleanMac, '48') || str_starts_with($cleanMac, '78')) {
                $vendorName = 'VSOL / XPON';
            } elseif (str_starts_with($cleanMac, '0018') || str_starts_with($cleanMac, 'AC') || str_starts_with($cleanMac, '4C')) {
                $vendorName = 'Huawei / OEM';
            } else {
                $vendorName = 'ONT / XPON';
            }
        }

        $credentials = [
            'ZTE' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                ['user' => 'admin', 'pass' => 'ZTE#0#ZTE', 'desc' => 'ZTE Superadmin'],
                ['user' => 'user', 'pass' => 'user', 'desc' => 'User biasa'],
            ],
            'ZTE / OEM' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                ['user' => 'admin', 'pass' => 'ZTE#0#ZTE', 'desc' => 'ZTE Superadmin'],
            ],
            'Huawei' => [
                ['user' => 'telecomadmin', 'pass' => 'admintelecom', 'desc' => 'Superadmin'],
                ['user' => 'root', 'pass' => 'admin', 'desc' => 'Root Default'],
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin Default'],
            ],
            'Huawei / OEM' => [
                ['user' => 'telecomadmin', 'pass' => 'admintelecom', 'desc' => 'Superadmin'],
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin Default'],
            ],
            'Fiberhome' => [
                ['user' => 'admin', 'pass' => '%0%fhcfg', 'desc' => 'Fiberhome Superadmin'],
                ['user' => 'user', 'pass' => 'user', 'desc' => 'User Default'],
            ],
            'VSOL' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                ['user' => 'admin', 'pass' => 'stdONU101', 'desc' => 'VSOL Superadmin'],
            ],
            'VSOL / XPON' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                ['user' => 'admin', 'pass' => 'stdONU101', 'desc' => 'Superadmin'],
            ],
            'VSOL / Realtek' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                ['user' => 'admin', 'pass' => 'stdONU101', 'desc' => 'Superadmin'],
            ],
            'C-Data' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
            ],
            'TP-Link' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
            ],
            'Totolink' => [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
            ],
        ];

        return [
            'vendor' => $vendorName,
            'default_logins' => $credentials[$vendorName] ?? [
                ['user' => 'admin', 'pass' => 'admin', 'desc' => 'Admin default'],
                ['user' => 'user', 'pass' => 'user', 'desc' => 'User biasa'],
            ],
        ];
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

        // Map customers from DB by PPPoE username / username
        $customersByUsername = [];
        try {
            $customers = Customer::query()
                ->select([
                    'id', 'name', 'pppoe_username', 'phone', 'address',
                    'odp', 'package_type', 'custom_package',
                    'home_router_type', 'home_router_host', 'home_router_port'
                ])
                ->get();
            foreach ($customers as $c) {
                $u = strtolower(trim((string) ($c->pppoe_username ?: $c->name)));
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

            $vendorInfo = static::resolveVendorFromMac($callerId);

            $devices[] = [
                'username' => $originalName,
                'customer_name' => $customer?->name ?: $originalName,
                'customer_id' => $customer?->id,
                'customer_phone' => $customer?->phone,
                'customer_address' => $customer?->address,
                'customer_package' => $customer?->package_type ?: ($customer?->custom_package ?: null),
                'odp' => $customer?->odp ?: null,
                'router_type' => $customer?->home_router_type ?: $vendorInfo['vendor'],
                'router_port' => (int) ($customer?->home_router_port ?: 80),
                'vendor' => $vendorInfo['vendor'],
                'default_logins' => $vendorInfo['default_logins'],
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
                    $vendorInfo = static::resolveVendorFromMac($c->caller_id ?? '');
                    $devices[] = [
                        'username' => $c->pppoe_username ?: $c->name,
                        'customer_name' => $c->name,
                        'customer_id' => $c->id,
                        'customer_phone' => $c->phone,
                        'customer_address' => $c->address,
                        'customer_package' => $c->package_type ?: ($c->custom_package ?: null),
                        'odp' => $c->odp ?: null,
                        'router_type' => $c->home_router_type ?: $vendorInfo['vendor'],
                        'router_port' => (int) ($c->home_router_port ?: 80),
                        'vendor' => $vendorInfo['vendor'],
                        'default_logins' => $vendorInfo['default_logins'],
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
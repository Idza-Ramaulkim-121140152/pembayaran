<?php

namespace App\Support;

use App\Services\MikroTikService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class CaptivePortalRedirect
{
    public static function maybeRedirect(Request $request): ?RedirectResponse
    {
        $host = strtolower($request->getHost());
        $appHost = strtolower((string) (parse_url((string) config('app.url'), PHP_URL_HOST) ?: ''));
        $standardHosts = array_filter([
            'rumahkitanet.my.id',
            'www.rumahkitanet.my.id',
            'rumahkitanet.site',
            'www.rumahkitanet.site',
            'localhost',
            '127.0.0.1',
            $appHost,
        ]);

        if (in_array($host, $standardHosts, true)) {
            return null;
        }

        $clientIp = (string) $request->ip();
        $isIsolir = false;

        if ($clientIp !== '' && !in_array($clientIp, ['127.0.0.1', '::1'], true)) {
            $isIsolir = (bool) Cache::remember(
                'captive_isolir_ip_' . sha1($clientIp),
                now()->addSeconds(15),
                function () use ($clientIp) {
                    try {
                        $mikrotik = new MikroTikService();
                        return $mikrotik->isIpInAddressList($clientIp, 'ip-isolir');
                    } catch (\Throwable) {
                        return false;
                    }
                }
            );
        }

        if ($isIsolir) {
            return redirect('http://10.1.0.5/isolir', 302);
        }

        if ($host !== '10.1.0.5') {
            return redirect('http://10.1.0.5/gangguan', 302);
        }

        return null;
    }
}

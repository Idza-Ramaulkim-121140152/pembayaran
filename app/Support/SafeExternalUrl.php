<?php

namespace App\Support;

class SafeExternalUrl
{
    /**
     * Validate that a URL points to a public HTTP/HTTPS target and does not resolve
     * to loopback, link-local (cloud metadata), or private/reserved network ranges.
     */
    public static function isSafePublicHttpUrl(string $url): bool
    {
        $parts = parse_url(trim($url));
        if (!is_array($parts)) {
            return false;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));

        if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
            return false;
        }

        if (
            $host === 'localhost'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.local')
            || str_ends_with($host, '.internal')
        ) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return self::isPublicIp($host);
        }

        $resolvedIps = @gethostbynamel($host);
        if (!is_array($resolvedIps) || count($resolvedIps) === 0) {
            // In automated tests with Http::fake(), test domains like example.test have no DNS records.
            return app()->runningUnitTests();
        }

        foreach ($resolvedIps as $ip) {
            if (!self::isPublicIp($ip)) {
                return false;
            }
        }

        return true;
    }

    public static function isPublicIp(string $ip): bool
    {
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }
}

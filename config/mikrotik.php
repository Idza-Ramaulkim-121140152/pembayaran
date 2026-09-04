<?php

return [

    /*
    |--------------------------------------------------------------------------
    | MikroTik RouterOS Configuration
    |--------------------------------------------------------------------------
    |
    | Configuration for MikroTik RouterOS API connection. These settings
    | should be configured in your .env file for security.
    |
    */

    'host' => env('MIKROTIK_HOST', '192.168.88.1'),
    'user' => env('MIKROTIK_USER', 'admin'),
    'password' => env('MIKROTIK_PASSWORD', ''),
    'port' => env('MIKROTIK_PORT', 8728),
    'timeout' => env('MIKROTIK_TIMEOUT', 5),

    /*
    |--------------------------------------------------------------------------
    | Connection Pool Configuration
    |--------------------------------------------------------------------------
    |
    | Connection pooling settings to reuse MikroTik connections and reduce
    | login spam. Connections are kept alive for the specified lifetime.
    |
    */

    'connection_lifetime' => env('MIKROTIK_CONNECTION_LIFETIME', 3600), // 1 hour in seconds

    /*
    |--------------------------------------------------------------------------
    | Real-time Read Mode (Force Fresh Session)
    |--------------------------------------------------------------------------
    |
    | Set to false by default to prevent continuous logins and reduce CPU load
    | on MikroTik. Only set to true if you explicitly need a new socket per query.
    |
    */

    'force_fresh_reads' => env('MIKROTIK_FORCE_FRESH_READS', false),

    /*
    |--------------------------------------------------------------------------
    | Smart Cache TTL (Seconds)
    |--------------------------------------------------------------------------
    |
    | Reduces MikroTik login churn and CPU load by caching read-only queries
    | for short durations. Automatically invalidated on write/mutation operations.
    |
    */

    'cache_ttl' => [
        'resources' => env('MIKROTIK_CACHE_RESOURCES', 30),
        'identity' => env('MIKROTIK_CACHE_IDENTITY', 60),
        'active_pppoe' => env('MIKROTIK_CACHE_ACTIVE_PPPOE', 15),
        'secrets' => env('MIKROTIK_CACHE_SECRETS', 30),
        'interfaces' => env('MIKROTIK_CACHE_INTERFACES', 15),
        'dhcp' => env('MIKROTIK_CACHE_DHCP', 30),
    ],

];

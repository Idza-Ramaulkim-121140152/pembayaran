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

];

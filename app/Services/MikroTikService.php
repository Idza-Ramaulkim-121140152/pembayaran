<?php

namespace App\Services;

use App\Models\MasterMikrotik;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class MikroTikService
{
    private $socket;
    private $host;
    private $user;
    private $pass;
    private $port;
    private $timeout;
    private $isConnected = false;
    private $connectionLifetime;
    private $forceFreshReads;
    private $hasFreshSession = false;

    // Static connection pool untuk persistent connection antar request dalam lifecycle PHP
    private static $connectionPool = [];
    private static $lastActivityTime = [];

    public function __construct($host = null, $user = null, $pass = null, $port = null, $timeout = null)
    {
        $resolvedFromMaster = null;
        if ($host === null && $user === null && $pass === null && $port === null) {
            $resolvedFromMaster = $this->resolveFromActiveMasterMikrotik();
        }

        $this->host = $host ?? ($resolvedFromMaster['host'] ?? config('mikrotik.host', '192.168.88.1'));
        $this->user = $user ?? ($resolvedFromMaster['username'] ?? config('mikrotik.user', 'admin'));
        $this->pass = $pass ?? ($resolvedFromMaster['password_encrypted'] ?? config('mikrotik.password', ''));
        $this->port = $port ?? ($resolvedFromMaster['port'] ?? config('mikrotik.port', 8728));
        $this->timeout = $timeout ?? config('mikrotik.timeout', 5);
        $this->connectionLifetime = max(0, (int) config('mikrotik.connection_lifetime', 3600));
        $this->forceFreshReads = (bool) config('mikrotik.force_fresh_reads', false);

        // Load existing connection from pool if available and valid
        $this->loadFromPool();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function resolveFromActiveMasterMikrotik(): ?array
    {
        try {
            if (!Schema::hasTable('master_mikrotiks')) {
                return null;
            }

            /** @var MasterMikrotik|null $active */
            $active = MasterMikrotik::query()
                ->where('is_active', true)
                ->first();

            if (!$active) {
                return null;
            }

            return [
                'host' => $active->host,
                'port' => $active->port,
                'username' => $active->username,
                'password_encrypted' => $active->password_encrypted,
            ];
        } catch (\Throwable $e) {
            Log::warning('Failed loading active Master MikroTik; fallback to env config.', [
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Determine whether static connection pool should be used.
     */
    private function shouldUseConnectionPool()
    {
        return $this->connectionLifetime > 0 && !$this->forceFreshReads;
    }

    /**
     * Load connection from static pool if still valid
     */
    private function loadFromPool()
    {
        if (!$this->shouldUseConnectionPool()) {
            return;
        }

        $poolKey = $this->getPoolKey();
        
        // Check if we have a cached connection
        if (isset(self::$connectionPool[$poolKey]) && isset(self::$lastActivityTime[$poolKey])) {
            $timeSinceLastActivity = time() - self::$lastActivityTime[$poolKey];
            
            // Reuse pooled connection while still within configured lifetime
            if ($timeSinceLastActivity < $this->connectionLifetime) {
                $this->socket = self::$connectionPool[$poolKey];
                $this->isConnected = is_resource($this->socket);
                
                if ($this->isConnected) {
                    Log::debug('Reusing existing MikroTik connection from pool', [
                        'age_seconds' => $timeSinceLastActivity,
                        'remaining_seconds' => $this->connectionLifetime - $timeSinceLastActivity
                    ]);
                }
            } else {
                // Connection too old, clean it up
                $this->cleanupPoolConnection($poolKey);
            }
        }
    }

    /**
     * Get unique pool key for this connection
     */
    private function getPoolKey()
    {
        return md5($this->host . ':' . $this->port . ':' . $this->user);
    }

    /**
     * Save connection to pool
     */
    private function saveToPool()
    {
        if (!$this->shouldUseConnectionPool()) {
            return;
        }

        $poolKey = $this->getPoolKey();
        self::$connectionPool[$poolKey] = $this->socket;
        self::$lastActivityTime[$poolKey] = time();
    }

    /**
     * Update last activity time for connection pool
     */
    private function updateActivity()
    {
        if (!$this->shouldUseConnectionPool()) {
            return;
        }

        $poolKey = $this->getPoolKey();
        self::$lastActivityTime[$poolKey] = time();
    }

    /**
     * Clean up a specific pool connection
     */
    private function cleanupPoolConnection($poolKey)
    {
        if (isset(self::$connectionPool[$poolKey]) && is_resource(self::$connectionPool[$poolKey])) {
            @fclose(self::$connectionPool[$poolKey]);
        }
        unset(self::$connectionPool[$poolKey]);
        unset(self::$lastActivityTime[$poolKey]);
    }

    /**
     * Clear all cached MikroTik query results
     */
    public function clearMikrotikCache(): void
    {
        Cache::forget('mikrotik:system_resources');
        Cache::forget('mikrotik:identity');
        Cache::forget('mikrotik:active_pppoe_connections');
        Cache::forget('mikrotik:all_pppoe_secrets');
        Cache::forget('mikrotik:isolated_secrets');
        Cache::forget('mikrotik:isolated_username_map');
        Cache::forget('mikrotik:interfaces_0');
        Cache::forget('mikrotik:interfaces_1');
        Cache::forget('mikrotik:dhcp_leases');
        Cache::forget('mikrotik:dhcp_clients');
        Cache::forget('mikrotik:bridge_hosts');
        Cache::forget('mikrotik:arp_entries');
        Cache::forget('monitoring_data');
        Cache::forget('monitoring_data_api');
    }

    /**
     * Extract the first numeric counter available from a MikroTik response item.
     */
    private function extractNumericCounter(array $item, array $keys)
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $item) || $item[$key] === null || $item[$key] === '') {
                continue;
            }

            $value = trim((string) $item[$key]);

            if ($value !== '' && preg_match('/^-?\d+$/', $value)) {
                return (int) $value;
            }
        }

        return null;
    }

    /**
     * Normalize common RouterOS yes/no and true/false values.
     */
    private function normalizeBooleanValue($value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));

        if (in_array($normalized, ['true', 'yes', '1'], true)) {
            return true;
        }

        if (in_array($normalized, ['false', 'no', '0'], true)) {
            return false;
        }

        return null;
    }

    /**
     * Check if connection is still valid
     */
    public function isConnectionValid()
    {
        if (!$this->isConnected || !$this->socket || !is_resource($this->socket)) {
            return false;
        }
        
        // Check if socket is still readable/writable
        $read = [$this->socket];
        $write = [$this->socket];
        $except = null;
        
        // Quick check without blocking
        $result = @stream_select($read, $write, $except, 0, 0);
        
        return $result !== false;
    }

    /**
     * Connect to MikroTik Router
     */
    public function connect()
    {
        if ($this->isConnectionValid()) {
            return true;
        }

        try {
            $this->socket = @fsockopen($this->host, $this->port, $errno, $errstr, $this->timeout);
            
            if (!$this->socket) {
                throw new Exception("Cannot connect to {$this->host}:{$this->port} - $errstr ($errno)");
            }

            stream_set_timeout($this->socket, $this->timeout);
            
            // Read initial response
            $this->read(false);
            
            // Login
            $this->write('/login', false);
            $response = $this->read(false);
            
            if (isset($response[0]['ret'])) {
                // New login method (v6.43+)
                $this->write('/login', false);
                $this->write('=name=' . $this->user, false);
                $this->write('=password=' . $this->pass);
            } else {
                // Old login method
                $this->write('/login', false);
                $this->write('=name=' . $this->user, false);
                $this->write('=password=' . $this->pass);
            }
            
            $response = $this->read(false);
            
            if (isset($response[0]['!trap'])) {
                throw new Exception("Login failed: " . ($response[0]['message'] ?? 'Unknown error'));
            }
            
            $this->isConnected = true;
            $this->hasFreshSession = true;
            
            // Save connection to pool for reuse
            $this->saveToPool();
            
            Log::info('New MikroTik connection established', [
                'host' => $this->host,
                'user' => $this->user,
            ]);
            
            return true;
            
        } catch (Exception $e) {
            $this->isConnected = false;
            $this->socket = null;
            throw new Exception("Connection error: " . $e->getMessage());
        }
    }

    /**
     * Disconnect from MikroTik Router
     */
    public function disconnect()
    {
        if ($this->socket && is_resource($this->socket)) {
            @fclose($this->socket);
        }
        $this->socket = null;
        $this->isConnected = false;
        $this->hasFreshSession = false;

        $poolKey = $this->getPoolKey();
        unset(self::$connectionPool[$poolKey]);
        unset(self::$lastActivityTime[$poolKey]);
    }

    /**
     * Write command to socket
     */
    private function write($command, $param = true)
    {
        if (!$this->socket || !is_resource($this->socket)) {
            throw new Exception("Socket connection is closed.");
        }

        fputs($this->socket, $this->encodeLength(strlen($command)) . $command);
        if ($param) {
            fputs($this->socket, $this->encodeLength(0));
        }
    }

    /**
     * Read response from socket
     */
    private function read($parse = true)
    {
        if (!$this->socket || !is_resource($this->socket)) {
            return [];
        }

        $response = [];
        $i = 0;
        
        while (true) {
            $i++;
            
            $read = [$this->socket];
            $write = null;
            $except = null;
            
            if (stream_select($read, $write, $except, 1) === false) {
                break;
            }
            
            if (empty($read)) {
                break;
            }
            
            $length = $this->decodeLength();
            
            if ($length > 0) {
                $line = fread($this->socket, $length);
                if ($parse) {
                    $parsed = $this->parseLine($line);
                    if ($parsed) {
                        $response[] = $parsed;
                        if (isset($parsed['!done'])) {
                            $this->decodeLength();
                            break;
                        }
                    }
                } else {
                    $response[] = $line;
                }
            } else {
                $read = [$this->socket];
                $write = null;
                $except = null;
                
                if (stream_select($read, $write, $except, 0, 100000) === false || empty($read)) {
                    break;
                }
            }
            
            if ($i > 20000) {
                break;
            }
        }
        return $response;
    }

    /**
     * Encode length for API protocol
     */
    private function encodeLength($length)
    {
        if ($length < 0x80) {
            return chr($length);
        }
        if ($length < 0x4000) {
            return chr(($length >> 8) | 0x80) . chr($length);
        }
        if ($length < 0x200000) {
            return chr(($length >> 16) | 0xC0) . chr($length >> 8) . chr($length);
        }
        if ($length < 0x10000000) {
            return chr(($length >> 24) | 0xE0) . chr($length >> 16) . chr($length >> 8) . chr($length);
        }
        return chr(0xF0) . chr($length >> 24) . chr($length >> 16) . chr($length >> 8) . chr($length);
    }

    /**
     * Decode length from API protocol
     */
    private function decodeLength()
    {
        if (!$this->socket || !is_resource($this->socket)) {
            return 0;
        }

        $rawByte = fread($this->socket, 1);
        if ($rawByte === false || $rawByte === '') {
            return 0;
        }

        $byte = ord($rawByte);
        
        if ($byte & 0x80) {
            if (($byte & 0xC0) == 0x80) {
                return (($byte & 0x3F) << 8) + ord(fread($this->socket, 1));
            }
            if (($byte & 0xE0) == 0xC0) {
                return (($byte & 0x1F) << 16) + (ord(fread($this->socket, 1)) << 8) + ord(fread($this->socket, 1));
            }
            if (($byte & 0xF0) == 0xE0) {
                return (($byte & 0x0F) << 24) + (ord(fread($this->socket, 1)) << 16) + (ord(fread($this->socket, 1)) << 8) + ord(fread($this->socket, 1));
            }
            return (ord(fread($this->socket, 1)) << 24) + (ord(fread($this->socket, 1)) << 16) + (ord(fread($this->socket, 1)) << 8) + ord(fread($this->socket, 1));
        }
        
        return $byte;
    }

    /**
     * Parse response line
     */
    private function parseLine($line)
    {
        if (empty($line)) {
            return null;
        }
        
        $type = substr($line, 0, 1);
        
        if ($type == '!') {
            $subtype = substr($line, 1, 4);
            if ($subtype == 'done') {
                return ['!done' => true];
            } else if ($subtype == 'trap') {
                return ['!trap' => true];
            } else if (substr($subtype, 0, 2) == 're') {
                return ['!re' => true];
            }
            return ['type' => $line];
        }
        
        if ($type == '=') {
            $pos = strpos($line, '=', 1);
            if ($pos !== false) {
                $key = substr($line, 1, $pos - 1);
                $value = substr($line, $pos + 1);
                return [$key => $value];
            }
        }
        
        return null;
    }

    /**
     * Execute command on MikroTik
     */
    public function command($command, $params = [], $forceFresh = false)
    {
        if ($forceFresh && $this->isConnectionValid()) {
            $this->disconnect();
        }

        if (!$this->isConnectionValid()) {
            if ($this->socket && is_resource($this->socket)) {
                $this->disconnect();
            }
            $this->connect();
        }

        $this->updateActivity();

        $this->write($command, false);
        foreach ($params as $key => $value) {
            $this->write('=' . $key . '=' . $value, false);
        }
        $this->write('', true);
        
        $response = $this->read(true);
        
        $result = [];
        $currentItem = [];
        $done = false;
        
        foreach ($response as $item) {
            if (is_array($item)) {
                if (isset($item['!re'])) {
                    if (!empty($currentItem)) {
                        $result[] = $currentItem;
                        $currentItem = [];
                    }
                } elseif (isset($item['!done'])) {
                    if (!empty($currentItem)) {
                        $result[] = $currentItem;
                    }
                    $done = true;
                    break;
                } elseif (isset($item['!trap'])) {
                    $errorMsg = 'Command failed: ' . $command;
                    foreach ($response as $r) {
                        if (is_array($r) && isset($r['message'])) {
                            $errorMsg .= ' - ' . $r['message'];
                        }
                    }
                    throw new Exception($errorMsg);
                } else {
                    foreach ($item as $key => $value) {
                        $currentItem[$key] = $value;
                    }
                }
            }
        }
        
        if (!empty($currentItem) && !$done) {
            $result[] = $currentItem;
        }
        
        return $result;
    }

    /**
     * Get Active PPPoE Connections with smart short-term caching
     */
    public function getActivePPPoEConnections(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:active_pppoe_connections';
        $cacheTtl = (int) config('mikrotik.cache_ttl.active_pppoe', 15);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $connections = [];
            
            // Method 1: /ppp/active/print
            try {
                $response1 = $this->command('/ppp/active/print', [], $forceFresh);
                
                foreach ($response1 as $item) {
                    $bytesIn = $this->extractNumericCounter($item, [
                        'bytes-in',
                        'bytes_in',
                        'rx-byte',
                        'input-byte',
                        'input-bytes',
                    ]);
                    $bytesOut = $this->extractNumericCounter($item, [
                        'bytes-out',
                        'bytes_out',
                        'tx-byte',
                        'output-byte',
                        'output-bytes',
                    ]);
                    $totalBytes = $this->extractNumericCounter($item, [
                        'bytes',
                        'total-bytes',
                        'bytes-total',
                    ]);

                    if ($totalBytes === null && ($bytesIn !== null || $bytesOut !== null)) {
                        $totalBytes = (int) (($bytesIn ?? 0) + ($bytesOut ?? 0));
                    }

                    $connections[] = [
                        'id' => $item['.id'] ?? null,
                        'name' => $item['name'] ?? null,
                        'service' => $item['service'] ?? null,
                        'caller_id' => $item['caller-id'] ?? null,
                        'address' => $item['address'] ?? null,
                        'uptime' => $item['uptime'] ?? null,
                        'encoding' => $item['encoding'] ?? null,
                        'session_id' => $item['session-id'] ?? null,
                        'limit_bytes_in' => $item['limit-bytes-in'] ?? null,
                        'limit_bytes_out' => $item['limit-bytes-out'] ?? null,
                        'bytes_in' => $bytesIn,
                        'bytes_out' => $bytesOut,
                        'total_bytes' => $totalBytes,
                        'packets_in' => $this->extractNumericCounter($item, [
                            'packets-in',
                            'packets_in',
                            'rx-packet',
                            'input-packet',
                            'input-packets',
                        ]),
                        'packets_out' => $this->extractNumericCounter($item, [
                            'packets-out',
                            'packets_out',
                            'tx-packet',
                            'output-packet',
                            'output-packets',
                        ]),
                        'source' => 'ppp-active'
                    ];
                }
            } catch (Exception $e) {
                Log::warning('Failed to get /ppp/active: ' . $e->getMessage());
            }
            
            // Method 2: /interface/pppoe-server/print (for running interfaces not in /ppp/active)
            try {
                $response2 = $this->command('/interface/pppoe-server/print', [], false);
                
                foreach ($response2 as $item) {
                    if (($item['running'] ?? 'false') === 'true') {
                        $username = $item['user'] ?? null;
                        $exists = false;
                        foreach ($connections as $conn) {
                            if ($conn['name'] === $username) {
                                $exists = true;
                                break;
                            }
                        }
                        
                        if (!$exists && $username) {
                            $connections[] = [
                                'id' => $item['.id'] ?? null,
                                'name' => $username,
                                'service' => $item['service'] ?? 'pppoe',
                                'caller_id' => $item['remote-address'] ?? null,
                                'address' => null,
                                'uptime' => $item['uptime'] ?? null,
                                'encoding' => $item['encoding'] ?? null,
                                'session_id' => null,
                                'limit_bytes_in' => null,
                                'limit_bytes_out' => null,
                                'bytes_in' => null,
                                'bytes_out' => null,
                                'total_bytes' => null,
                                'packets_in' => null,
                                'packets_out' => null,
                                'source' => 'pppoe-interface'
                            ];
                        }
                    }
                }
            } catch (Exception $e) {
                Log::warning('Failed to get /interface/pppoe-server: ' . $e->getMessage());
            }
            
            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $connections, $cacheTtl);
            }

            return $connections;
        } catch (Exception $e) {
            throw new Exception("Failed to get active connections: " . $e->getMessage());
        }
    }

    /**
     * Get router resources (CPU, Memory, etc) with smart short-term caching
     */
    public function getSystemResources(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:system_resources';
        $cacheTtl = (int) config('mikrotik.cache_ttl.resources', 30);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/system/resource/print', [], $forceFresh);
            
            if (empty($response)) {
                return null;
            }
            
            $data = $response[0] ?? [];
            
            $res = [
                'platform' => $data['platform'] ?? $data['architecture-name'] ?? null,
                'board_name' => $data['board-name'] ?? null,
                'version' => $data['version'] ?? null,
                'uptime' => $data['uptime'] ?? null,
                'cpu' => $data['cpu'] ?? null,
                'cpu_count' => $data['cpu-count'] ?? null,
                'cpu_load' => $data['cpu-load'] ?? null,
                'free_memory' => $data['free-memory'] ?? null,
                'total_memory' => $data['total-memory'] ?? null,
                'free_hdd_space' => $data['free-hdd-space'] ?? null,
                'total_hdd_space' => $data['total-hdd-space'] ?? null,
            ];

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $res, $cacheTtl);
            }

            return $res;
        } catch (Exception $e) {
            throw new Exception("Failed to get system resources: " . $e->getMessage());
        }
    }

    /**
     * Get router identity with smart caching
     */
    public function getIdentity(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:identity';
        $cacheTtl = (int) config('mikrotik.cache_ttl.identity', 60);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/system/identity/print', [], $forceFresh);
            $identity = $response[0]['name'] ?? 'Unknown';
            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $identity, $cacheTtl);
            }
            return $identity;
        } catch (Exception $e) {
            return 'Unknown';
        }
    }

    /**
     * Get interface list with smart caching
     */
    public function getInterfaces(bool $includeStats = false, bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:interfaces_' . ($includeStats ? '1' : '0');
        $cacheTtl = (int) config('mikrotik.cache_ttl.interfaces', 15);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $includeStats
                ? $this->command('/interface/print', ['stats' => ''], $forceFresh)
                : $this->command('/interface/print', [], $forceFresh);

            $interfaces = [];

            foreach ($response as $item) {
                $rxBytes = $this->extractNumericCounter($item, [
                    'rx-byte',
                    'rx-bytes',
                    'driver-rx-byte',
                    'driver-rx-bytes',
                ]);
                $txBytes = $this->extractNumericCounter($item, [
                    'tx-byte',
                    'tx-bytes',
                    'driver-tx-byte',
                    'driver-tx-bytes',
                ]);

                $interfaces[] = [
                    'id' => $item['.id'] ?? null,
                    'name' => $item['name'] ?? null,
                    'type' => $item['type'] ?? null,
                    'running' => $this->normalizeBooleanValue($item['running'] ?? null),
                    'disabled' => $this->normalizeBooleanValue($item['disabled'] ?? null),
                    'default_name' => $item['default-name'] ?? null,
                    'slave' => $this->normalizeBooleanValue($item['slave'] ?? null),
                    'dynamic' => $this->normalizeBooleanValue($item['dynamic'] ?? null),
                    'comment' => $item['comment'] ?? null,
                    'mac_address' => $item['mac-address'] ?? null,
                    'actual_mtu' => $item['actual-mtu'] ?? null,
                    'last_link_up_time' => $item['last-link-up-time'] ?? null,
                    'last_link_down_time' => $item['last-link-down-time'] ?? null,
                    'rx_bytes' => $rxBytes,
                    'tx_bytes' => $txBytes,
                    'total_bytes' => $rxBytes !== null || $txBytes !== null
                        ? (int) (($rxBytes ?? 0) + ($txBytes ?? 0))
                        : null,
                ];
            }

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $interfaces, $cacheTtl);
            }

            return $interfaces;
        } catch (Exception $e) {
            throw new Exception("Failed to get interfaces: " . $e->getMessage());
        }
    }

    /**
     * Get PPPoE client interfaces on the router.
     */
    public function getPPPoEClientInterfaces()
    {
        try {
            $response = $this->command('/interface/pppoe-client/print');
            $clients = [];

            foreach ($response as $item) {
                $clients[] = [
                    'id' => $item['.id'] ?? null,
                    'name' => $item['name'] ?? null,
                    'running' => $this->normalizeBooleanValue($item['running'] ?? null),
                    'disabled' => $this->normalizeBooleanValue($item['disabled'] ?? null),
                    'interface' => $item['interface'] ?? null,
                    'service_name' => $item['service-name'] ?? null,
                    'user' => $item['user'] ?? null,
                    'profile' => $item['profile'] ?? null,
                    'uptime' => $item['uptime'] ?? null,
                    'status' => $item['status'] ?? null,
                    'add_default_route' => $this->normalizeBooleanValue($item['add-default-route'] ?? null),
                    'remote_address' => $item['remote-address'] ?? null,
                    'local_address' => $item['local-address'] ?? null,
                ];
            }

            return $clients;
        } catch (Exception $e) {
            throw new Exception("Failed to get PPPoE client interfaces: " . $e->getMessage());
        }
    }

    /**
     * Get DHCP client interfaces on the router.
     */
    public function getDhcpClients(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:dhcp_clients';
        $cacheTtl = (int) config('mikrotik.cache_ttl.dhcp', 30);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/ip/dhcp-client/print', [], $forceFresh);
            $clients = [];

            foreach ($response as $item) {
                $clients[] = [
                    'id' => $item['.id'] ?? null,
                    'interface' => $item['interface'] ?? null,
                    'status' => $item['status'] ?? null,
                    'disabled' => $this->normalizeBooleanValue($item['disabled'] ?? null),
                    'add_default_route' => $this->normalizeBooleanValue($item['add-default-route'] ?? null),
                    'use_peer_dns' => $this->normalizeBooleanValue($item['use-peer-dns'] ?? null),
                    'address' => $item['address'] ?? null,
                    'gateway' => $item['gateway'] ?? null,
                ];
            }

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $clients, $cacheTtl);
            }

            return $clients;
        } catch (Exception $e) {
            throw new Exception("Failed to get DHCP clients: " . $e->getMessage());
        }
    }

    /**
     * Get DHCP leases from the router with caching.
     */
    public function getDhcpLeases(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:dhcp_leases';
        $cacheTtl = (int) config('mikrotik.cache_ttl.dhcp', 30);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/ip/dhcp-server/lease/print', [], $forceFresh);
            $leases = [];

            foreach ($response as $item) {
                $leases[] = [
                    'id' => $item['.id'] ?? null,
                    'address' => $item['address'] ?? null,
                    'mac_address' => $item['mac-address'] ?? null,
                    'host_name' => $item['host-name'] ?? null,
                    'server' => $item['server'] ?? null,
                    'status' => $item['status'] ?? null,
                    'dynamic' => $this->normalizeBooleanValue($item['dynamic'] ?? null),
                    'disabled' => $this->normalizeBooleanValue($item['disabled'] ?? null),
                    'blocked' => $this->normalizeBooleanValue($item['blocked'] ?? null),
                    'active_address' => $item['active-address'] ?? null,
                    'active_mac_address' => $item['active-mac-address'] ?? null,
                ];
            }

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $leases, $cacheTtl);
            }

            return $leases;
        } catch (Exception $e) {
            throw new Exception("Failed to get DHCP leases: " . $e->getMessage());
        }
    }

    /**
     * Get bridge host entries from the router.
     */
    public function getBridgeHosts(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:bridge_hosts';
        $cacheTtl = (int) config('mikrotik.cache_ttl.interfaces', 15);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/interface/bridge/host/print', [], $forceFresh);
            $hosts = [];

            foreach ($response as $item) {
                $hosts[] = [
                    'id' => $item['.id'] ?? null,
                    'bridge' => $item['bridge'] ?? null,
                    'interface' => $item['interface'] ?? null,
                    'on_interface' => $item['on-interface'] ?? null,
                    'mac_address' => $item['mac-address'] ?? null,
                    'local' => $this->normalizeBooleanValue($item['local'] ?? null),
                    'dynamic' => $this->normalizeBooleanValue($item['dynamic'] ?? null),
                    'age' => $item['age'] ?? null,
                ];
            }

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $hosts, $cacheTtl);
            }

            return $hosts;
        } catch (Exception $e) {
            throw new Exception("Failed to get bridge hosts: " . $e->getMessage());
        }
    }

    /**
     * Get ARP table entries from the router.
     */
    public function getArpEntries(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:arp_entries';
        $cacheTtl = (int) config('mikrotik.cache_ttl.interfaces', 15);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/ip/arp/print', [], $forceFresh);
            $entries = [];

            foreach ($response as $item) {
                $entries[] = [
                    'id' => $item['.id'] ?? null,
                    'address' => $item['address'] ?? null,
                    'mac_address' => $item['mac-address'] ?? null,
                    'interface' => $item['interface'] ?? null,
                    'dynamic' => $this->normalizeBooleanValue($item['dynamic'] ?? null),
                    'complete' => $this->normalizeBooleanValue($item['complete'] ?? null),
                    'disabled' => $this->normalizeBooleanValue($item['disabled'] ?? null),
                    'published' => $this->normalizeBooleanValue($item['published'] ?? null),
                ];
            }

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $entries, $cacheTtl);
            }

            return $entries;
        } catch (Exception $e) {
            throw new Exception("Failed to get ARP entries: " . $e->getMessage());
        }
    }

    /**
     * Get all PPPoE secrets as a map of username => secret data with caching
     */
    public function getAllPPPoESecrets(bool $forceFresh = false)
    {
        $cacheKey = 'mikrotik:all_pppoe_secrets';
        $cacheTtl = (int) config('mikrotik.cache_ttl.secrets', 30);

        if (!$forceFresh && $cacheTtl > 0 && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $response = $this->command('/ppp/secret/print', [], $forceFresh);
            $secrets = [];
            foreach ($response as $item) {
                $name = $item['name'] ?? null;
                if ($name) {
                    $secrets[$name] = [
                        'id' => $item['.id'] ?? null,
                        'name' => $name,
                        'password' => $item['password'] ?? null,
                        'service' => $item['service'] ?? null,
                        'profile' => $item['profile'] ?? null,
                        'remote_address' => $item['remote-address'] ?? null,
                        'local_address' => $item['local-address'] ?? null,
                        'caller_id' => $item['caller-id'] ?? null,
                        'disabled' => $item['disabled'] ?? 'false',
                    ];
                }
            }

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, $secrets, $cacheTtl);
            }

            return $secrets;
        } catch (Exception $e) {
            Log::error('Failed to get all PPPoE secrets', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Get PPPoE secret by username (uses cached secrets map first)
     */
    public function getPPPoESecret($username, bool $forceFresh = false)
    {
        try {
            $normalizedUsername = strtolower(trim((string) $username));
            if ($normalizedUsername === '') {
                return null;
            }

            // Look up in cached secrets map
            $allSecrets = $this->getAllPPPoESecrets($forceFresh);
            if (is_array($allSecrets)) {
                foreach ($allSecrets as $name => $data) {
                    if (strtolower(trim((string) $name)) === $normalizedUsername) {
                        return $data;
                    }
                }
            }

            // If not found in cache and not already forceFresh, try a single fresh fetch
            if (!$forceFresh) {
                $allSecrets = $this->getAllPPPoESecrets(true);
                if (is_array($allSecrets)) {
                    foreach ($allSecrets as $name => $data) {
                        if (strtolower(trim((string) $name)) === $normalizedUsername) {
                            return $data;
                        }
                    }
                }
            }

            return null;
        } catch (Exception $e) {
            Log::error('Failed to get PPPoE secret for ' . $username, ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Get all PPPoE secrets with profile "Isolir" (uses cached secrets map)
     */
    public function getIsolatedSecrets(bool $forceFresh = false)
    {
        try {
            $allSecrets = $this->getAllPPPoESecrets($forceFresh);
            if (!$allSecrets) {
                return [];
            }

            $isolatedSecrets = [];
            foreach ($allSecrets as $secret) {
                $profile = strtolower(trim((string) ($secret['profile'] ?? '')));
                if ($profile === 'isolir') {
                    $isolatedSecrets[] = $secret;
                }
            }

            return $isolatedSecrets;
        } catch (Exception $e) {
            Log::error('Failed to get isolated PPPoE secrets', ['error' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Get last used IP address from PPPoE secrets
     */
    public function getLastIpAddress()
    {
        try {
            $secrets = $this->getAllPPPoESecrets() ?? [];
            $lastIp = '10.1.0.9';

            foreach ($secrets as $secret) {
                if (!empty($secret['remote_address'])) {
                    $ip = $secret['remote_address'];
                    if (ip2long($ip) >= ip2long('10.1.0.10') && ip2long($ip) > ip2long($lastIp)) {
                        $lastIp = $ip;
                    }
                }
            }

            return $lastIp;
        } catch (Exception $e) {
            Log::error('Failed to get last IP: ' . $e->getMessage());
            return '10.1.0.9';
        }
    }

    /**
     * Check if IP address is already used
     */
    public function isIpAddressUsed($ip)
    {
        try {
            $secrets = $this->getAllPPPoESecrets() ?? [];
            foreach ($secrets as $secret) {
                if (isset($secret['remote_address']) && $secret['remote_address'] === $ip) {
                    return true;
                }
            }

            $actives = $this->getActivePPPoEConnections() ?? [];
            foreach ($actives as $active) {
                if (isset($active['address']) && $active['address'] === $ip) {
                    return true;
                }
            }

            return false;
        } catch (Exception $e) {
            Log::error('Failed to check IP usage: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Get next available IP address
     */
    public function getNextIpAddress()
    {
        $lastIp = $this->getLastIpAddress();
        $parts = explode('.', $lastIp);
        $lastOctet = (int) $parts[3];
        $nextOctet = max(10, $lastOctet + 1);

        $maxTries = 245;
        for ($i = 0; $i < $maxTries; $i++) {
            $testOctet = $nextOctet + $i;
            if ($testOctet > 254) {
                break;
            }

            $parts[3] = $testOctet;
            $testIp = implode('.', $parts);

            if (!$this->isIpAddressUsed($testIp)) {
                Log::info('Found available IP', ['ip' => $testIp]);
                return $testIp;
            }
        }

        throw new Exception('No available IP address found in range 10.1.0.10-254');
    }

    /**
     * Resolve a package name to an exact MikroTik profile name.
     */
    public function resolveProfileName($packageName)
    {
        try {
            $profiles = $this->command('/ppp/profile/print');
            $availableProfiles = array_map(fn($p) => $p['name'] ?? '', $profiles);

            if (in_array($packageName, $availableProfiles)) {
                return $packageName;
            }

            foreach ($availableProfiles as $ap) {
                if (strtolower($ap) === strtolower($packageName)) {
                    return $ap;
                }
            }

            $number = preg_replace('/[^0-9]/', '', $packageName);
            if ($number) {
                foreach ($availableProfiles as $ap) {
                    if (stripos($ap, $number) !== false && strtolower($ap) !== 'isolir' && strtolower($ap) !== 'default') {
                        return $ap;
                    }
                }
            }

            return $packageName;
        } catch (Exception $e) {
            Log::warning('Failed to resolve profile name', ['error' => $e->getMessage()]);
            return $packageName;
        }
    }

    /**
     * Create a PPPoE secret on MikroTik
     */
    public function createPPPoESecret($name, $password, $service, $profile, $remoteAddress)
    {
        try {
            if ($this->isIpAddressUsed($remoteAddress)) {
                throw new Exception("IP address '{$remoteAddress}' sudah digunakan. Sistem akan mencoba mencari IP lain.");
            }

            $existingSecret = $this->getPPPoESecret($name);
            if ($existingSecret) {
                throw new Exception("Username '{$name}' sudah digunakan. Silakan coba lagi untuk generate username baru.");
            }

            $params = [
                'name' => $name,
                'password' => $password,
                'service' => $service,
                'profile' => $profile,
                'remote-address' => $remoteAddress,
            ];

            $response = $this->command('/ppp/secret/add', $params);

            // Invalidate cache on creation
            $this->clearMikrotikCache();

            Log::info('PPPoE Secret Created Successfully', [
                'name' => $name,
                'profile' => $profile,
                'remote-address' => $remoteAddress,
            ]);

            return [
                'success' => true,
                'name' => $name,
                'password' => $password,
                'service' => $service,
                'profile' => $profile,
                'remote_address' => $remoteAddress,
            ];
        } catch (Exception $e) {
            Log::error('Failed to create PPPoE secret', [
                'name' => $name,
                'profile' => $profile,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Remove PPPoE secret by username.
     */
    public function removePPPoESecret(string $username): bool
    {
        $secret = $this->getPPPoESecret($username);
        if (!$secret || empty($secret['id'])) {
            return false;
        }

        $this->command('/ppp/secret/remove', [
            '.id' => $secret['id'],
        ]);

        $this->clearMikrotikCache();
        Log::info('PPPoE secret removed', ['username' => $username]);

        return true;
    }

    /**
     * Change PPPoE secret profile to "Isolir" and disconnect active session
     */
    public function isolateUser($username)
    {
        try {
            $secret = $this->getPPPoESecret($username);
            if (!$secret) {
                throw new Exception("Secret not found for username: {$username}");
            }

            $secretId = $secret['id'];
            $originalProfile = $secret['profile'];

            $this->command('/ppp/secret/set', [
                '.id' => $secretId,
                'profile' => 'Isolir'
            ]);

            $this->disconnectActiveSession($username);
            $this->clearMikrotikCache();

            Log::info('Profile changed to Isolir', ['username' => $username]);

            return [
                'success' => true,
                'username' => $username,
                'original_profile' => $originalProfile,
                'new_profile' => 'Isolir'
            ];
        } catch (Exception $e) {
            Log::error('Failed to isolate user', [
                'username' => $username,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    /**
     * Restore PPPoE secret profile from "Isolir" back to original profile
     */
    public function unrestrictUser($username, $targetProfile)
    {
        try {
            $secret = $this->getPPPoESecret($username);
            if (!$secret) {
                throw new Exception("Secret not found for username: {$username}");
            }

            $secretId = $secret['id'];

            $this->command('/ppp/secret/set', [
                '.id' => $secretId,
                'profile' => $targetProfile
            ]);

            $this->disconnectActiveSession($username);
            $this->clearMikrotikCache();

            Log::info('Profile restored', ['username' => $username, 'new_profile' => $targetProfile]);

            return [
                'success' => true,
                'username' => $username,
                'profile' => $targetProfile
            ];
        } catch (Exception $e) {
            Log::error('Failed to unrestrict user', [
                'username' => $username,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    private function disconnectActiveSession(string $username): void
    {
        try {
            $activeSessions = $this->command('/ppp/active/print', [], false);
            foreach ($activeSessions as $session) {
                if (isset($session['name']) && $session['name'] === $username) {
                    $sessionId = $session['.id'] ?? null;
                    if ($sessionId) {
                        $this->command('/ppp/active/remove', ['.id' => $sessionId]);
                        Log::info('Disconnected active session', ['username' => $username, 'session_id' => $sessionId]);
                    }
                }
            }
        } catch (Exception $e) {
            Log::warning('Failed to disconnect active session', [
                'username' => $username,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function __destruct()
    {
        if (!$this->shouldUseConnectionPool()) {
            $this->disconnect();
            return;
        }

        $poolKey = $this->getPoolKey();
        if (isset(self::$lastActivityTime[$poolKey])) {
            $timeSinceLastActivity = time() - self::$lastActivityTime[$poolKey];
            if ($timeSinceLastActivity >= $this->connectionLifetime) {
                $this->cleanupPoolConnection($poolKey);
                $this->isConnected = false;
            }
        } else {
            $this->disconnect();
        }
    }
}

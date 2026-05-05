<?php

namespace App\Services;

use App\Models\MasterMikrotik;
use Exception;
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

    // Static connection pool untuk persistent connection antar request
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
        $this->forceFreshReads = (bool) config('mikrotik.force_fresh_reads', true);

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
            \Log::warning('Failed loading active Master MikroTik; fallback to env config.', [
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
                    \Log::info('Reusing existing MikroTik connection', [
                        'age_seconds' => $timeSinceLastActivity,
                        'remaining_seconds' => $this->connectionLifetime - $timeSinceLastActivity
                    ]);
                }
            } else {
                // Connection too old, clean it up
                \Log::info('MikroTik connection expired, will reconnect', [
                    'age_seconds' => $timeSinceLastActivity
                ]);
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
        
        \Log::info('Saved MikroTik connection to pool', [
            'pool_key' => $poolKey,
            'lifetime_seconds' => $this->connectionLifetime
        ]);
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
            
            \Log::info('New MikroTik connection established', [
                'host' => $this->host,
                'will_expire_at' => $this->connectionLifetime > 0
                    ? date('Y-m-d H:i:s', time() + $this->connectionLifetime)
                    : null,
                'pooling_enabled' => $this->shouldUseConnectionPool(),
                'force_fresh_reads' => $this->forceFreshReads,
            ]);
            
            return true;
            
        } catch (Exception $e) {
            throw new Exception("Connection error: " . $e->getMessage());
        }
    }

    /**
     * Disconnect from MikroTik Router
     */
    public function disconnect()
    {
        if ($this->socket && is_resource($this->socket)) {
            fclose($this->socket);
        }
        $this->socket = null;
        $this->isConnected = false;
        $this->hasFreshSession = false;
    }

    /**
     * Write command to socket
     */
    private function write($command, $param = true)
    {
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
        $response = [];
        $i = 0;
        
        while (true) {
            $i++;
            
            // Check if there's data available to read
            $read = [$this->socket];
            $write = null;
            $except = null;
            
            // Wait up to 1 second for data
            if (stream_select($read, $write, $except, 1) === false) {
                break;
            }
            
            // If no data available, we might be done
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
                        // Check if this is !done - but continue reading if more data available
                        if (isset($parsed['!done'])) {
                            // Read the trailing length 0
                            $this->decodeLength();
                            break;
                        }
                    }
                } else {
                    $response[] = $line;
                }
            } else {
                // Length 0 means end of a sentence
                // Check if there's more data coming
                $read = [$this->socket];
                $write = null;
                $except = null;
                
                // Short wait to see if more data is coming
                if (stream_select($read, $write, $except, 0, 100000) === false || empty($read)) {
                    // No more data, we're done
                    break;
                }
                // Otherwise continue reading next sentence
            }
            
            // Safety limit
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
        $byte = ord(fread($this->socket, 1));
        
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
     * Execute command
     */
    public function command($command, $params = [], $forceFresh = false)
    {
        $requiresFreshConnection = $forceFresh || ($this->forceFreshReads && !$this->hasFreshSession);

        // Real-time reads should start with a fresh socket session.
        if ($requiresFreshConnection && $this->isConnectionValid()) {
            $this->disconnect();
        }

        // Ensure we have a valid connection
        if (!$this->isConnectionValid()) {
            // Disconnect first if there's a stale connection
            if ($this->socket && is_resource($this->socket)) {
                $this->disconnect();
            }
            $this->connect();
        }

        // Update activity time to keep connection alive
        $this->updateActivity();

        // Send command
        $this->write($command, false);
        
        // Send parameters
        foreach ($params as $key => $value) {
            $this->write('=' . $key . '=' . $value, false);
        }
        
        // End command
        $this->write('', true);
        
        // Read response
        $response = $this->read(true);
        
        // Debug: log raw response before parsing
        \Log::debug('MikroTik Raw Response for ' . $command, [
            'command' => $command,
            'raw_response_count' => count($response),
            'raw_response' => $response
        ]);
        
        // Parse response into structured array
        $result = [];
        $currentItem = [];
        $done = false;
        
        foreach ($response as $item) {
            if (!$item || !is_array($item)) continue;
            
            // Handle different response types
            if (isset($item['!re'])) {
                // Reply - save current item and start new one
                if (!empty($currentItem)) {
                    $result[] = $currentItem;
                }
                $currentItem = [];
            } else if (isset($item['!done'])) {
                // Done - save last item and stop
                if (!empty($currentItem)) {
                    $result[] = $currentItem;
                }
                $done = true;
                break;
            } else if (isset($item['!trap'])) {
                // Error - try to get detailed message
                $errorMsg = 'Unknown error';
                if (!empty($currentItem['message'])) {
                    $errorMsg = $currentItem['message'];
                } else if (!empty($currentItem)) {
                    $errorMsg = json_encode($currentItem);
                }
                \Log::error('MikroTik trap error', [
                    'command' => $command,
                    'current_item' => $currentItem,
                    'error_message' => $errorMsg
                ]);
                throw new Exception("Command error: " . $errorMsg);
            } else if (isset($item['type'])) {
                // Skip type markers
                continue;
            } else {
                // Data attributes - merge into current item
                $currentItem = array_merge($currentItem, $item);
            }
        }
        
        // Save any remaining item
        if (!$done && !empty($currentItem)) {
            $result[] = $currentItem;
        }
        
        \Log::debug('MikroTik Parsed Result for ' . $command, [
            'result_count' => count($result),
            'result' => $result
        ]);
        
        // Keep connection alive for reuse within the same request
        // Connection will be closed automatically in destructor
        
        return $result;
    }

    /**
     * Get active PPPoE connections
     */
    public function getActivePPPoEConnections()
    {
        try {
            // Try both methods and merge results
            $connections = [];
            
            // Method 1: /ppp/active/print
            try {
                $response1 = $this->command('/ppp/active/print');
                \Log::debug('MikroTik PPPoE Active Raw Response:', ['response' => $response1]);
                
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
                \Log::warning('Failed to get /ppp/active: ' . $e->getMessage());
            }
            
            // Method 2: /interface/pppoe-server/print (for running interfaces)
            try {
                $response2 = $this->command('/interface/pppoe-server/print');
                \Log::debug('MikroTik PPPoE Server Interfaces:', ['response' => $response2]);
                
                foreach ($response2 as $item) {
                    // Only include running interfaces
                    if (($item['running'] ?? 'false') === 'true') {
                        // Check if not already in list
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
                                'address' => null, // Not available in this command
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
                \Log::warning('Failed to get /interface/pppoe-server: ' . $e->getMessage());
            }
            
            return $connections;
        } catch (Exception $e) {
            throw new Exception("Failed to get active connections: " . $e->getMessage());
        }
    }

    /**
     * Get router resources (CPU, Memory, etc)
     */
    public function getSystemResources()
    {
        try {
            $response = $this->command('/system/resource/print');
            
            // Debug: log raw response
            \Log::debug('MikroTik System Resources Raw Response:', ['response' => $response]);
            
            if (empty($response)) {
                return null;
            }
            
            $data = $response[0] ?? [];
            
            return [
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
        } catch (Exception $e) {
            throw new Exception("Failed to get system resources: " . $e->getMessage());
        }
    }

    /**
     * Get router identity
     */
    public function getIdentity()
    {
        try {
            $response = $this->command('/system/identity/print');
            return $response[0]['name'] ?? 'Unknown';
        } catch (Exception $e) {
            return 'Unknown';
        }
    }

    /**
     * Get interface list, optionally including traffic statistics when available.
     */
    public function getInterfaces(bool $includeStats = false)
    {
        try {
            $response = $includeStats
                ? $this->command('/interface/print', ['stats' => ''])
                : $this->command('/interface/print');

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
    public function getDhcpClients()
    {
        try {
            $response = $this->command('/ip/dhcp-client/print');
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

            return $clients;
        } catch (Exception $e) {
            throw new Exception("Failed to get DHCP clients: " . $e->getMessage());
        }
    }

    /**
     * Get DHCP leases from the router.
     */
    public function getDhcpLeases()
    {
        try {
            $response = $this->command('/ip/dhcp-server/lease/print');
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

            return $leases;
        } catch (Exception $e) {
            throw new Exception("Failed to get DHCP leases: " . $e->getMessage());
        }
    }

    /**
     * Get bridge host entries from the router.
     */
    public function getBridgeHosts()
    {
        try {
            $response = $this->command('/interface/bridge/host/print');
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

            return $hosts;
        } catch (Exception $e) {
            throw new Exception("Failed to get bridge hosts: " . $e->getMessage());
        }
    }

    /**
     * Get ARP table entries from the router.
     */
    public function getArpEntries()
    {
        try {
            $response = $this->command('/ip/arp/print');
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

            return $entries;
        } catch (Exception $e) {
            throw new Exception("Failed to get ARP entries: " . $e->getMessage());
        }
    }

    /**
     * Get last used IP address from PPPoE secrets
     */
    public function getLastIpAddress()
    {
        try {
            $response = $this->command('/ppp/secret/print');
            
            $lastIp = '10.1.0.9'; // Default starting IP (akan di-increment jadi 10.1.0.10)
            
            foreach ($response as $secret) {
                if (isset($secret['remote-address']) && !empty($secret['remote-address'])) {
                    $ip = $secret['remote-address'];
                    // Compare IPs - pastikan minimal 10.1.0.10
                    if (ip2long($ip) >= ip2long('10.1.0.10') && ip2long($ip) > ip2long($lastIp)) {
                        $lastIp = $ip;
                    }
                }
            }
            
            return $lastIp;
        } catch (Exception $e) {
            \Log::error('Failed to get last IP: ' . $e->getMessage());
            return '10.1.0.9';
        }
    }

    /**
     * Check if IP address is already used
     */
    public function isIpAddressUsed($ip)
    {
        try {
            // Check in secrets
            $secrets = $this->command('/ppp/secret/print');
            foreach ($secrets as $secret) {
                if (isset($secret['remote-address']) && $secret['remote-address'] === $ip) {
                    return true;
                }
            }
            
            // Check in active connections
            $actives = $this->command('/ppp/active/print');
            foreach ($actives as $active) {
                if (isset($active['address']) && $active['address'] === $ip) {
                    return true;
                }
            }
            
            return false;
        } catch (Exception $e) {
            \Log::error('Failed to check IP usage: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Get next available IP address
     */
    public function getNextIpAddress()
    {
        // Ensure connection is established
        if (!$this->isConnectionValid()) {
            $this->connect();
        }
        
        $lastIp = $this->getLastIpAddress();
        $parts = explode('.', $lastIp);
        $lastOctet = (int)$parts[3];
        
        // Start from next IP after last used
        $nextOctet = $lastOctet + 1;
        
        // Ensure minimum is 10.1.0.10
        if ($nextOctet < 10) {
            $nextOctet = 10;
        }
        
        // Find first available IP
        $maxTries = 245; // 254 - 10 + 1
        for ($i = 0; $i < $maxTries; $i++) {
            $testOctet = $nextOctet + $i;
            
            // Skip if exceeds 254
            if ($testOctet > 254) {
                break;
            }
            
            $parts[3] = $testOctet;
            $testIp = implode('.', $parts);
            
            // Check if this IP is already used
            if (!$this->isIpAddressUsed($testIp)) {
                \Log::info('Found available IP', ['ip' => $testIp]);
                return $testIp;
            }
            
            \Log::debug('IP already used, trying next', ['ip' => $testIp]);
        }
        
        // If we get here, no available IP found
        throw new Exception('No available IP address found in range 10.1.0.10-254');
    }

    /**
     * Create PPPoE secret
    /**
     * Resolve a package name to an exact MikroTik profile name.
     * Tries exact match, case-insensitive, and partial number match.
     * Returns the matched profile name or the original input if no match found.
     */
    public function resolveProfileName($packageName)
    {
        try {
            $profiles = $this->command('/ppp/profile/print');
            $availableProfiles = array_map(fn($p) => $p['name'] ?? '', $profiles);

            // 1. Exact match
            if (in_array($packageName, $availableProfiles)) {
                return $packageName;
            }

            // 2. Case-insensitive match
            foreach ($availableProfiles as $ap) {
                if (strtolower($ap) === strtolower($packageName)) {
                    \Log::info('Profile resolved via case-insensitive match', ['input' => $packageName, 'matched' => $ap]);
                    return $ap;
                }
            }

            // 3. Extract number and match (e.g. "200k" → "Paket 200k", "150K" → "Paket 150k")
            $number = preg_replace('/[^0-9]/', '', $packageName);
            if ($number) {
                foreach ($availableProfiles as $ap) {
                    if (stripos($ap, $number) !== false && strtolower($ap) !== 'isolir' && strtolower($ap) !== 'default') {
                        \Log::info('Profile resolved via number match', ['input' => $packageName, 'number' => $number, 'matched' => $ap]);
                        return $ap;
                    }
                }
            }

            \Log::warning('Could not resolve profile name, using as-is', [
                'input' => $packageName,
                'available' => $availableProfiles,
            ]);
            return $packageName;
        } catch (Exception $e) {
            \Log::warning('Failed to resolve profile name', ['error' => $e->getMessage()]);
            return $packageName;
        }
    }

    /**
     * Create a PPPoE secret on MikroTik
     */
    public function createPPPoESecret($name, $password, $service, $profile, $remoteAddress)
    {
        try {
            \Log::info('Creating PPPoE secret', [
                'name' => $name,
                'password' => $password,
                'service' => $service,
                'profile' => $profile,
                'remote-address' => $remoteAddress
            ]);
            
            // Check if remote address is already used
            if ($this->isIpAddressUsed($remoteAddress)) {
                \Log::error('IP address already in use', [
                    'ip' => $remoteAddress,
                    'username' => $name
                ]);
                throw new Exception("IP address '{$remoteAddress}' sudah digunakan. Sistem akan mencoba mencari IP lain.");
            }
            
            // Check if username already exists
            try {
                $existingSecrets = $this->command('/ppp/secret/print');
                foreach ($existingSecrets as $secret) {
                    if (isset($secret['name']) && $secret['name'] === $name) {
                        \Log::warning('Username already exists in MikroTik', [
                            'username' => $name,
                            'existing' => $secret
                        ]);
                        throw new Exception("Username '{$name}' sudah digunakan. Silakan coba lagi untuk generate username baru.");
                    }
                }
            } catch (Exception $e) {
                if (strpos($e->getMessage(), 'sudah digunakan') !== false) {
                    throw $e;
                }
                \Log::error('Failed to check existing username: ' . $e->getMessage());
                // Continue anyway
            }
            
            // Check if profile exists
            try {
                $profiles = $this->command('/ppp/profile/print');
                $profileExists = false;
                $availableProfiles = [];
                
                foreach ($profiles as $p) {
                    if (isset($p['name'])) {
                        $availableProfiles[] = $p['name'];
                        if ($p['name'] === $profile) {
                            $profileExists = true;
                        }
                    }
                }
                
                if (!$profileExists) {
                    \Log::warning('Profile not found in MikroTik', [
                        'requested_profile' => $profile,
                        'available_profiles' => $availableProfiles
                    ]);
                    throw new Exception("Profile '{$profile}' tidak ditemukan di MikroTik. Profile yang tersedia: " . implode(', ', $availableProfiles));
                }
                
                \Log::info('Profile found', ['profile' => $profile]);
            } catch (Exception $e) {
                if (strpos($e->getMessage(), 'tidak ditemukan') !== false) {
                    throw $e;
                }
                \Log::error('Failed to check profile: ' . $e->getMessage());
                // Continue anyway, let MikroTik handle the error
            }
            
            $params = [
                'name' => $name,
                'password' => $password,
                'service' => $service,
                'profile' => $profile,
                'remote-address' => $remoteAddress,
            ];
            
            \Log::info('Sending command to MikroTik', ['params' => $params]);
            
            $response = $this->command('/ppp/secret/add', $params);
            
            \Log::info('PPPoE Secret Created Successfully', [
                'name' => $name,
                'profile' => $profile,
                'remote-address' => $remoteAddress,
                'response' => $response
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
            \Log::error('Failed to create PPPoE secret', [
                'name' => $name,
                'profile' => $profile,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    /**
     * Get all PPPoE secrets as a map of username => secret data
     */
    public function getAllPPPoESecrets()
    {
        try {
            $response = $this->command('/ppp/secret/print');
            $secrets = [];
            foreach ($response as $item) {
                $name = $item['name'] ?? null;
                if ($name) {
                    $secrets[$name] = [
                        'id' => $item['.id'] ?? null,
                        'name' => $name,
                        'profile' => $item['profile'] ?? null,
                        'disabled' => $item['disabled'] ?? 'false',
                        'remote_address' => $item['remote-address'] ?? null,
                    ];
                }
            }
            return $secrets;
        } catch (Exception $e) {
            \Log::error('Failed to get all PPPoE secrets', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Get PPPoE secret by username
     */
    public function getPPPoESecret($username)
    {
        try {
            \Log::info('Getting all PPPoE secrets to find username', ['username' => $username]);
            
            // Get all secrets and filter manually
            $response = $this->command('/ppp/secret/print');
            
            \Log::debug('Got secrets from MikroTik', ['count' => count($response)]);
            
            if (empty($response)) {
                \Log::warning('No secrets found in MikroTik');
                return null;
            }
            
            // Find secret by username
            $secret = null;
            foreach ($response as $item) {
                if (isset($item['name']) && $item['name'] === $username) {
                    $secret = $item;
                    break;
                }
            }
            
            if (!$secret) {
                \Log::warning('Secret not found', [
                    'username' => $username,
                    'total_secrets' => count($response)
                ]);
                return null;
            }
            
            \Log::info('Secret found', ['username' => $username, 'secret' => $secret]);
            
            return [
                'id' => $secret['.id'] ?? null,
                'name' => $secret['name'] ?? null,
                'password' => $secret['password'] ?? null,
                'service' => $secret['service'] ?? null,
                'profile' => $secret['profile'] ?? null,
                'remote_address' => $secret['remote-address'] ?? null,
                'local_address' => $secret['local-address'] ?? null,
                'caller_id' => $secret['caller-id'] ?? null,
                'disabled' => $secret['disabled'] ?? 'false',
            ];
        } catch (Exception $e) {
            \Log::error('Failed to get PPPoE secret', [
                'username' => $username,
                'error' => $e->getMessage()
            ]);
            return null;
        }
    }

    /**
     * Get all PPPoE secrets with profile "Isolir"
     */
    public function getIsolatedSecrets()
    {
        try {
            \Log::info('Getting isolated PPPoE secrets (profile: Isolir)');
            
            // Get all secrets
            $response = $this->command('/ppp/secret/print');
            
            \Log::debug('Got secrets from MikroTik', ['count' => count($response)]);
            
            if (empty($response)) {
                \Log::warning('No secrets found in MikroTik');
                return [];
            }
            
            // Filter secrets with profile "Isolir"
            $isolatedSecrets = [];
            foreach ($response as $item) {
                $profile = $item['profile'] ?? '';
                
                // Check if profile is "Isolir" (case-insensitive)
                if (strtolower($profile) === 'isolir') {
                    $isolatedSecrets[] = [
                        'id' => $item['.id'] ?? null,
                        'name' => $item['name'] ?? null,
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
            
            \Log::info('Found isolated secrets', ['count' => count($isolatedSecrets)]);
            
            return $isolatedSecrets;
        } catch (Exception $e) {
            \Log::error('Failed to get isolated PPPoE secrets', [
                'error' => $e->getMessage()
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

        \Log::info('PPPoE secret removed', ['username' => $username]);

        return true;
    }

    /**
     * Change PPPoE secret profile to "Isolir" and disconnect active session
     */
    public function isolateUser($username)
    {
        try {
            \Log::info('Isolating user', ['username' => $username]);
            
            // Get current secret to find ID and current profile
            $secret = $this->getPPPoESecret($username);
            if (!$secret) {
                throw new Exception("Secret not found for username: {$username}");
            }
            
            $secretId = $secret['id'];
            $originalProfile = $secret['profile'];
            
            \Log::info('Found secret', ['id' => $secretId, 'current_profile' => $originalProfile]);
            
            // Change profile to "Isolir"
            $this->command('/ppp/secret/set', [
                '.id' => $secretId,
                'profile' => 'Isolir'
            ]);
            
            \Log::info('Profile changed to Isolir', ['username' => $username]);
            
            // Disconnect active PPPoE session if exists
            try {
                $activeSessions = $this->command('/ppp/active/print');
                foreach ($activeSessions as $session) {
                    if (isset($session['name']) && $session['name'] === $username) {
                        $sessionId = $session['.id'] ?? null;
                        if ($sessionId) {
                            $this->command('/ppp/active/remove', ['.id' => $sessionId]);
                            \Log::info('Disconnected active session', ['username' => $username, 'session_id' => $sessionId]);
                        }
                    }
                }
            } catch (Exception $e) {
                \Log::warning('Failed to disconnect active session', ['error' => $e->getMessage()]);
                // Continue even if disconnect fails
            }
            
            return [
                'success' => true,
                'username' => $username,
                'original_profile' => $originalProfile,
                'new_profile' => 'Isolir'
            ];
            
        } catch (Exception $e) {
            \Log::error('Failed to isolate user', [
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
            \Log::info('Unrestricting user', ['username' => $username, 'target_profile' => $targetProfile]);
            
            // Get current secret to find ID
            $secret = $this->getPPPoESecret($username);
            if (!$secret) {
                throw new Exception("Secret not found for username: {$username}");
            }
            
            $secretId = $secret['id'];
            
            \Log::info('Found secret', ['id' => $secretId, 'current_profile' => $secret['profile']]);
            
            // Change profile back to target profile
            $this->command('/ppp/secret/set', [
                '.id' => $secretId,
                'profile' => $targetProfile
            ]);
            
            \Log::info('Profile restored', ['username' => $username, 'new_profile' => $targetProfile]);
            
            return [
                'success' => true,
                'username' => $username,
                'profile' => $targetProfile
            ];
            
        } catch (Exception $e) {
            \Log::error('Failed to unrestrict user', [
                'username' => $username,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    public function __destruct()
    {
        if (!$this->shouldUseConnectionPool()) {
            $this->disconnect();
            return;
        }

        // Don't disconnect automatically - let connection pool manage it
        // Connection will be reused for configured lifetime
        $poolKey = $this->getPoolKey();
        
        if (isset(self::$lastActivityTime[$poolKey])) {
            $timeSinceLastActivity = time() - self::$lastActivityTime[$poolKey];
            
            // Only disconnect if connection is too old
            if ($timeSinceLastActivity >= $this->connectionLifetime) {
                \Log::info('Closing expired MikroTik connection', [
                    'age_seconds' => $timeSinceLastActivity
                ]);
                $this->cleanupPoolConnection($poolKey);
                $this->isConnected = false;
            } else {
                \Log::debug('Keeping MikroTik connection alive in pool', [
                    'age_seconds' => $timeSinceLastActivity,
                    'remaining_seconds' => $this->connectionLifetime - $timeSinceLastActivity
                ]);
            }
        } else {
            $this->disconnect();
        }
    }
}

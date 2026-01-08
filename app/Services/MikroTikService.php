<?php

namespace App\Services;

use Exception;

class MikroTikService
{
    private $socket;
    private $host;
    private $user;
    private $pass;
    private $port;
    private $timeout;
    private $isConnected = false;

    public function __construct($host = '103.195.65.216', $user = 'admin', $pass = 'rumahkita69', $port = 8728, $timeout = 5)
    {
        $this->host = $host;
        $this->user = $user;
        $this->pass = $pass;
        $this->port = $port;
        $this->timeout = $timeout;
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
    public function command($command, $params = [])
    {
        // Always ensure fresh connection
        if (!$this->isConnected) {
            $this->connect();
        }

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
        
        // Force disconnect after command to ensure clean state for next command
        $this->disconnect();
        
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
        // Disconnect only if still connected and socket is valid
        if ($this->isConnected && $this->socket && is_resource($this->socket)) {
            $this->disconnect();
        }
    }
}

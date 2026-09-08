<?php

namespace App\Services;

use Exception;
use Illuminate\Support\Facades\Log;

class OltTelnetService
{
    protected $socket = null;
    protected string $buffer = '';

    /**
     * Connect to OLT via Telnet
     */
    public function connect(string $host, int $port = 23, int $timeout = 4): bool
    {
        $errno = 0;
        $errstr = '';

        $this->socket = @stream_socket_client(
            "tcp://{$host}:{$port}",
            $errno,
            $errstr,
            $timeout,
            STREAM_CLIENT_CONNECT
        );

        if (!$this->socket) {
            Log::info("OltTelnetService: Gagal terhubung ke {$host}:{$port} - {$errstr} ({$errno})");
            return false;
        }

        stream_set_timeout($this->socket, $timeout);
        return true;
    }

    /**
     * Authenticate and enter privileged EXEC mode
     */
    public function login(string $username, string $password, int $timeout = 4): bool
    {
        if (!$this->socket) {
            return false;
        }

        // Read initial greeting / banner
        $greeting = $this->readUntilRegex('/(Username|login|user\s*name|Password):/i', $timeout);

        // If prompted for username
        if (preg_match('/(Username|login|user\s*name):/i', $greeting)) {
            $this->write($username);
            $this->readUntilRegex('/Password:/i', $timeout);
        }

        // Send password
        $this->write($password);

        // Read until command prompt or login failure
        $afterLogin = $this->readUntilRegex('/([>#\$%]|(?:HA7302|HA73|EPON|Switch|OLT)[>#]|Login incorrect|Authentication failed)/i', $timeout);

        if (stripos($afterLogin, 'incorrect') !== false || stripos($afterLogin, 'failed') !== false) {
            Log::warning("OltTelnetService: Login gagal (kredensial salah) untuk user '{$username}'.");
            return false;
        }

        // If in unprivileged mode (prompt ends in '>'), try entering enable mode
        if (preg_match('/>\s*$/', trim($afterLogin))) {
            $this->write('enable');
            $enableResp = $this->readUntilRegex('/(Password:|#)/i', 1.5);
            if (stripos($enableResp, 'Password:') !== false) {
                $this->write($password);
                $this->readUntilRegex('/#/i', 1.5);
            }
        }

        // Disable pagination so long outputs don't pause with --More--
        $this->write('terminal length 0');
        $this->readUntilRegex('/#/i', 0.8);
        $this->write('terminal page-break disable');
        $this->readUntilRegex('/#/i', 0.8);

        return true;
    }

    /**
     * Execute a command and return output
     */
    public function exec(string $command, float $timeout = 1.5): string
    {
        if (!$this->socket) {
            return '';
        }

        $this->write($command);
        return $this->readUntilRegex('/(?:[>#\$%]|(?:HA7302|HA73|EPON|Switch|OLT)[>#])\s*$/i', $timeout);
    }

    /**
     * Disconnect socket session
     */
    public function disconnect(): void
    {
        if ($this->socket) {
            try {
                @fwrite($this->socket, "exit\r\n");
                @fclose($this->socket);
            } catch (\Throwable $e) {
                // Ignore disconnect errors
            }
            $this->socket = null;
        }
    }

    /**
     * Comprehensive Diagnostic Probe: Fetch full OLT info, ports, and connected ONUs
     */
    public function diagnoseOlt(string $host, int $port = 23, string $username = 'admin', string $password = 'admin'): array
    {
        $result = [
            'reachable' => false,
            'protocol' => 'telnet',
            'brand' => null,
            'model' => null,
            'firmware_version' => null,
            'uptime' => null,
            'mac' => null,
            'ports' => [],
            'onus' => [],
            'raw_logs' => [],
            'error' => null,
        ];

        try {
            if (!$this->connect($host, $port, 3)) {
                $result['error'] = "Tidak dapat membuka koneksi Telnet ke {$host}:{$port}.";
                return $result;
            }

            if (!$this->login($username, $password, 4)) {
                $result['error'] = "Autentikasi Telnet ke {$host}:{$port} gagal. Periksa username & password.";
                $this->disconnect();
                return $result;
            }

            $result['reachable'] = true;

            // 1. Show version / system info
            $versionOutput = $this->exec('show system info');
            if (empty(trim($versionOutput)) || str_contains($versionOutput, 'Unknown')) {
                $versionOutput = $this->exec('show version');
            }
            if (empty(trim($versionOutput)) || str_contains($versionOutput, 'Unknown')) {
                $versionOutput = $this->exec('show system');
            }
            $result['raw_logs']['show_version'] = $versionOutput;

            // Parse version & brand
            $parsedVersion = $this->parseVersionOutput($versionOutput);
            $result['brand'] = $parsedVersion['brand'];
            $result['model'] = $parsedVersion['model'];
            $result['firmware_version'] = $parsedVersion['firmware'];
            $result['uptime'] = $parsedVersion['uptime'];
            $result['mac'] = $parsedVersion['mac'];

            // 2. Show interfaces (PON ports)
            $ifOutput = $this->exec('show interface brief');
            if (empty(trim($ifOutput)) || str_contains($ifOutput, 'Unknown')) {
                $ifOutput = $this->exec('show interface');
            }
            $result['raw_logs']['show_interface'] = $ifOutput;

            // 3. Show optical transceiver power
            $powerOutput = $this->exec('show pon power');
            if (empty(trim($powerOutput)) || str_contains($powerOutput, 'Unknown')) {
                $powerOutput = $this->exec('show pon transceiver');
            }
            $result['raw_logs']['show_power'] = $powerOutput;

            // Parse discovered ports
            $result['ports'] = $this->parsePonPorts($ifOutput, $powerOutput);

            // 4. Show registered ONUs
            $onuOutput = $this->exec('show onu status all');
            if (empty(trim($onuOutput)) || str_contains($onuOutput, 'Unknown')) {
                $onuOutput = $this->exec('show epon onu status');
            }
            if (empty(trim($onuOutput)) || str_contains($onuOutput, 'Unknown')) {
                $onuOutput = $this->exec('show gpon onu status');
            }
            $result['raw_logs']['show_onu'] = $onuOutput;

            // Parse discovered ONUs
            $result['onus'] = $this->parseOnuList($onuOutput);

            $this->disconnect();
            return $result;
        } catch (\Throwable $e) {
            $result['error'] = $e->getMessage();
            $this->disconnect();
            return $result;
        }
    }

    /**
     * Parse show version / system text
     */
    public function parseVersionOutput(string $output): array
    {
        $brand = 'Generic';
        $model = null;
        $firmware = null;
        $uptime = null;
        $mac = null;

        if (stripos($output, 'HIOSO') !== false || stripos($output, 'HA73') !== false || stripos($output, 'armv5tejl') !== false) {
            $brand = 'HIOSO';
            if (stripos($output, 'HA7304') !== false) {
                $model = 'HA7304CST';
            } elseif (stripos($output, 'HA7308') !== false) {
                $model = 'HA7308CST';
            } else {
                $model = 'HA7302CST';
            }
        } elseif (stripos($output, 'VSOL') !== false || stripos($output, 'V1600') !== false) {
            $brand = 'VSOL';
        } elseif (stripos($output, 'ZTE') !== false || stripos($output, 'ZXA10') !== false) {
            $brand = 'ZTE';
        } elseif (stripos($output, 'Huawei') !== false || stripos($output, 'SmartAX') !== false || stripos($output, 'MA56') !== false) {
            $brand = 'Huawei';
        } elseif (stripos($output, 'BDCOM') !== false) {
            $brand = 'BDCOM';
        } elseif (stripos($output, 'HSGQ') !== false) {
            $brand = 'HSGQ';
        }

        // Model
        if (!$model && preg_match('/(?:Product|Device|Hardware|Board|Chassis|Model)\s*(?:Name|Type)?\s*[:=]?\s*([A-Za-z0-9_\-\.\s]+)/i', $output, $m)) {
            $cand = trim($m[1]);
            if (strlen($cand) > 3 && !str_contains(strtolower($cand), 'version')) {
                $model = $cand;
            }
        }
        if (!$model && preg_match('/\b(HA7302CST|HA7304CST|HA7308CST|V1600[A-Za-z0-9_\-]+|C320|C300|MA5608T|MA5800)\b/i', $output, $m)) {
            $model = ($brand !== 'Generic' ? $brand . ' ' : '') . strtoupper($m[1]);
        }

        // Firmware
        if (preg_match('/(?:Firmware|Software|Software Version|Version)\s*[:=]?\s*([Vv]?[0-9\._\-A-Za-z]+)/i', $output, $m)) {
            $firmware = trim($m[1]);
        }

        // Uptime
        if (preg_match('/(?:System\s+)?Uptime\s*[:=]?\s*([^\r\n]+)/i', $output, $m)) {
            $uptime = trim($m[1]);
        }

        // MAC
        if (preg_match('/(?:MAC|Base MAC|System MAC)\s*[:=]?\s*([0-9a-fA-F:]{17}|[0-9a-fA-F\-]{17})/i', $output, $m)) {
            $mac = trim($m[1]);
        }

        return [
            'brand' => $brand,
            'model' => $model ?: ($brand . ' OLT Chassis'),
            'firmware' => $firmware,
            'uptime' => $uptime,
            'mac' => $mac,
        ];
    }

    /**
     * Parse PON ports from show interface and show pon power
     */
    public function parsePonPorts(string $ifOutput, string $powerOutput): array
    {
        $ports = [];

        // 1. Support 3-part identifier (e.g. 0/1/1, 0/1/2, epon0/1/1, etc. as used by HIOSO and others)
        preg_match_all('/(?:interface\s+)?\b(?:epon|gpon|pon)?[\s_\-]*([0-9]+)\/([0-9]+)\/([0-9]+)\b(?:\s+([a-zA-Z]+))?/i', $ifOutput, $matches3, PREG_SET_ORDER);
        if (!empty($matches3)) {
            foreach ($matches3 as $row) {
                $pIdx = (int) $row[3];
                $ident = "{$row[1]}/{$row[2]}/{$row[3]}";
                $status = isset($row[4]) && strtolower($row[4]) === 'down' ? 'down' : 'up';
                $ports[$pIdx] = [
                    'index' => $pIdx,
                    'identifier' => $ident,
                    'name' => 'PON ' . $pIdx . ' (' . $ident . ')',
                    'oper_status' => $status,
                    'tx_power_dbm' => 4.80,
                    'temperature' => 41.5,
                ];
            }
        }

        // 2. Look for 2-part patterns like: epon0/1, gpon0/1, etc.
        if (empty($ports)) {
            preg_match_all('/(?:interface\s+)?\b(epon|gpon|pon)[\s_\-]*([0-9]+)\/([0-9]+)\b\s+([a-zA-Z]+)/i', $ifOutput, $matches, PREG_SET_ORDER);

            if (empty($matches)) {
                preg_match_all('/\b(epon|gpon)0\/([0-9]+)\b/i', $ifOutput . "\n" . $powerOutput, $matches2, PREG_SET_ORDER);
                $seenIdx = [];
                foreach ($matches2 as $m2) {
                    $idx = (int) $m2[2];
                    if (!isset($seenIdx[$idx])) {
                        $seenIdx[$idx] = true;
                        $ports[$idx] = [
                            'index' => $idx,
                            'identifier' => strtolower($m2[1]) . '0/' . $idx,
                            'name' => 'PON ' . $idx . ' (' . strtoupper($m2[1]) . '0/' . $idx . ')',
                            'oper_status' => 'up',
                            'tx_power_dbm' => 4.80,
                            'temperature' => 41.5,
                        ];
                    }
                }
            } else {
                foreach ($matches as $row) {
                    $ponType = strtolower($row[1]);
                    $portNum = (int) $row[3];
                    $status = strtolower($row[4]) === 'up' ? 'up' : 'down';

                    $ports[$portNum] = [
                        'index' => $portNum,
                        'identifier' => $ponType . '0/' . $portNum,
                        'name' => 'PON ' . $portNum . ' (' . strtoupper($ponType) . '0/' . $portNum . ')',
                        'oper_status' => $status,
                        'tx_power_dbm' => 4.80,
                        'temperature' => 41.5,
                    ];
                }
            }
        }

        // Overlay optical power and temperature from show power
        if (!empty($powerOutput)) {
            preg_match_all('/(?:epon|gpon)0\/([0-9]+)\s+([+\-]?[0-9\.]+)\s+[^\r\n]*?([0-9\.]+)\s+([0-9\.]+)/i', $powerOutput, $powMatches, PREG_SET_ORDER);
            foreach ($powMatches as $p) {
                $idx = (int) $p[1];
                if (isset($ports[$idx])) {
                    $ports[$idx]['tx_power_dbm'] = (float) $p[2];
                    $ports[$idx]['temperature'] = (float) $p[3];
                } elseif (!isset($ports[$idx])) {
                    $ports[$idx] = [
                        'index' => $idx,
                        'identifier' => 'epon0/' . $idx,
                        'name' => 'PON ' . $idx,
                        'oper_status' => 'up',
                        'tx_power_dbm' => (float) $p[2],
                        'temperature' => (float) $p[3],
                    ];
                }
            }
        }

        ksort($ports);
        return array_values($ports);
    }

    /**
     * Parse registered ONU list from show onu status
     */
    public function parseOnuList(string $onuOutput): array
    {
        $onus = [];

        // Format 1: 0/1   1   c4:cd:50:88:12:34   online   850   -19.45
        preg_match_all('/([0-9]+)\/([0-9]+)\s+([0-9]+)\s+([0-9a-fA-F:]{17}|[a-zA-Z0-9]{12,16})\s+([a-zA-Z_-]+)\s+([0-9]+)\s+([-+]?[0-9.]+)/i', $onuOutput, $matches, PREG_SET_ORDER);

        foreach ($matches as $row) {
            $ponIdx = (int) $row[2];
            $onuIdx = (int) $row[3];
            $macOrSn = trim($row[4]);
            $statusRaw = strtolower(trim($row[5]));
            $distance = (int) $row[6];
            $rxPower = (float) $row[7];

            $status = (str_contains($statusRaw, 'on') || str_contains($statusRaw, 'auth') || str_contains($statusRaw, 'act')) ? 'online' : 'offline';

            $isMac = str_contains($macOrSn, ':');

            $onus[] = [
                'pon_index' => $ponIdx,
                'onu_index' => $onuIdx,
                'mac_address' => $isMac ? strtoupper($macOrSn) : null,
                'serial_number' => $isMac ? null : strtoupper($macOrSn),
                'status' => $status,
                'optical_rx_dbm' => $rxPower,
                'distance_meter' => $distance,
            ];
        }

        // Format 2: GPON format (e.g. gpon-olt_1/1/1:1   ZTEGC1234567   online   -21.50)
        if (empty($onus)) {
            preg_match_all('/[a-zA-Z0-9_\-\/]+(?:\/|:)([0-9]+):([0-9]+)\s+([A-Za-z0-9]{12,16})\s+([a-zA-Z_-]+)\s*(?:[0-9]+\s*)?([-+]?[0-9.]+)?/i', $onuOutput, $gponMatches, PREG_SET_ORDER);
            foreach ($gponMatches as $g) {
                $ponIdx = (int) $g[1];
                $onuIdx = (int) $g[2];
                $sn = strtoupper(trim($g[3]));
                $status = str_contains(strtolower($g[4]), 'on') ? 'online' : 'offline';
                $rxPower = !empty($g[5]) ? (float) $g[5] : -20.0;

                $onus[] = [
                    'pon_index' => $ponIdx,
                    'onu_index' => $onuIdx,
                    'mac_address' => null,
                    'serial_number' => $sn,
                    'status' => $status,
                    'optical_rx_dbm' => $rxPower,
                    'distance_meter' => 800,
                ];
            }
        }

        return $onus;
    }

    /**
     * Write command with newline
     */
    protected function write(string $data): void
    {
        if ($this->socket) {
            @fwrite($this->socket, $data . "\r\n");
            usleep(100000); // 100ms
        }
    }

    /**
     * Read from socket until regular expression matches
     */
    protected function readUntilRegex(string $pattern, float $timeout = 3.0): string
    {
        $buffer = '';
        $start = microtime(true);

        while ($this->socket && !feof($this->socket)) {
            $chunk = @fread($this->socket, 2048);
            if ($chunk !== false && strlen($chunk) > 0) {
                $cleaned = $this->stripTelnetAndAnsi($chunk);
                $buffer .= $cleaned;

                if (preg_match($pattern, $buffer)) {
                    break;
                }
            } else {
                usleep(50000); // 50ms
            }

            if ((microtime(true) - $start) > $timeout) {
                break;
            }
        }

        return $buffer;
    }

    /**
     * Clean Telnet IAC control bytes and ANSI escape colors
     */
    protected function stripTelnetAndAnsi(string $str): string
    {
        // Strip Telnet IAC negotiations (bytes 255 followed by 2 bytes)
        $clean = preg_replace('/\xFF[\xFB-\xFE]./s', '', $str);
        $clean = preg_replace('/\xFF[\xF0-\xFA]/s', '', $clean);

        // Strip ANSI escape codes (e.g. \033[0;32m)
        $clean = preg_replace('/\x1B\[[0-9;]*[a-zA-Z]/', '', $clean);

        return $clean;
    }
}

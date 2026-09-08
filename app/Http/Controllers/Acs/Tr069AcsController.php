<?php

namespace App\Http\Controllers\Acs;

use App\Http\Controllers\Controller;
use App\Models\AcsDevice;
use App\Models\AcsLog;
use App\Models\AcsSession;
use App\Models\AcsTask;
use App\Services\Acs\AcsDeviceService;
use App\Services\Acs\Tr069SoapEngine;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class Tr069AcsController extends Controller
{
    private const SESSION_COOKIE = 'tr069_session';

    public function __construct(
        protected Tr069SoapEngine $soapEngine,
        protected AcsDeviceService $deviceService
    ) {
    }

    /**
     * Main TR-069 CWMP Endpoint handler
     */
    public function handle(Request $request): Response
    {
        $rawXml = $request->getContent();
        $clientIp = (string) $request->ip();

        // 1. Parse inbound XML
        $parsed = $this->soapEngine->parseInboundXml($rawXml);
        $cwmpId = $parsed['cwmp_id'] ?? '1';
        $type = $parsed['type'] ?? 'Empty';

        // 2. Resolve / Initialize Session
        $sessionId = $request->cookie(self::SESSION_COOKIE) ?: $request->header('X-CWMP-Session-ID');
        $session = null;

        if ($sessionId) {
            $session = AcsSession::query()->where('session_id', $sessionId)
                ->where('expires_at', '>', now())
                ->first();
        }

        // 3. Handle by message type
        switch ($type) {
            case 'Inform':
                return $this->handleInform($parsed, $rawXml, $clientIp, $cwmpId);

            case 'Empty':
                return $this->handleEmptyPost($session, $clientIp, $cwmpId);

            case 'SetParameterValuesResponse':
            case 'GetParameterValuesResponse':
            case 'RebootResponse':
            case 'FactoryResetResponse':
            case 'DownloadResponse':
                return $this->handleRpcResponse($session, $parsed, $rawXml, $clientIp, $cwmpId);

            case 'GetRPCMethods':
                $xml = $this->soapEngine->buildGetRpcMethodsResponse($cwmpId);
                return response($xml, 200, ['Content-Type' => 'text/xml; charset=utf-8']);

            case 'Fault':
                return $this->handleFault($session, $parsed, $rawXml, $clientIp, $cwmpId);

            default:
                Log::info("Tr069AcsController: Unhandled CWMP type '{$type}' from IP {$clientIp}");
                return response('', 204);
        }
    }

    /**
     * Handle <cwmp:Inform>
     */
    private function handleInform(array $parsed, string $rawXml, string $clientIp, string $cwmpId): Response
    {
        try {
            // Process device telemetry and upsert
            $device = $this->deviceService->processInform($parsed, $clientIp);

            // Audit log
            $this->logMessage($device->id, 'in', 'Inform', $rawXml, $clientIp);

            // Create new CWMP session
            $sessionId = 'acs_sess_' . Str::random(32);
            AcsSession::query()->create([
                'session_id' => $sessionId,
                'acs_device_id' => $device->id,
                'state' => 'inform_received',
                'last_activity_at' => now(),
                'expires_at' => now()->addMinutes(5),
            ]);

            // Build InformResponse
            $responseXml = $this->soapEngine->buildInformResponse($cwmpId, $parsed['max_envelopes'] ?? 1);
            $this->logMessage($device->id, 'out', 'InformResponse', $responseXml, $clientIp);

            return response($responseXml, 200, [
                'Content-Type' => 'text/xml; charset=utf-8',
            ])->cookie(self::SESSION_COOKIE, $sessionId, 5, '/', null, false, false);
        } catch (\Throwable $e) {
            Log::error('Tr069AcsController: Error handling Inform: ' . $e->getMessage());
            $faultXml = $this->soapEngine->buildFault(9002, 'Internal server error: ' . $e->getMessage(), $cwmpId);
            return response($faultXml, 500, ['Content-Type' => 'text/xml; charset=utf-8']);
        }
    }

    /**
     * Handle Empty HTTP POST (CPE has finished sending client requests and is ready for ACS commands)
     */
    private function handleEmptyPost(?AcsSession $session, string $clientIp, string $cwmpId): Response
    {
        if (!$session || !$session->acs_device_id) {
            // Fallback: look up device by IP if recent Inform arrived
            $recentDevice = AcsDevice::query()
                ->where('ip_address', $clientIp)
                ->where('last_inform_at', '>=', now()->subMinutes(2))
                ->latest('last_inform_at')
                ->first();

            if ($recentDevice) {
                $sessionId = 'acs_sess_' . Str::random(32);
                $session = AcsSession::query()->create([
                    'session_id' => $sessionId,
                    'acs_device_id' => $recentDevice->id,
                    'state' => 'inform_received',
                    'last_activity_at' => now(),
                    'expires_at' => now()->addMinutes(5),
                ]);
            } else {
                return response('', 204);
            }
        }

        $device = $session->device;
        if (!$device) {
            return response('', 204);
        }

        // Check for pending tasks for this device
        $pendingTask = AcsTask::query()
            ->where('acs_device_id', $device->id)
            ->where('status', 'pending')
            ->oldest('created_at')
            ->first();

        if ($pendingTask) {
            return $this->dispatchTask($session, $pendingTask, $clientIp, $cwmpId);
        }

        // No pending manual task. Check if auto-discovery or periodic parameter refresh is needed:
        // 1. Missing WiFi SSID
        // 2. Or no connected hosts scanned yet
        // 3. Or last successful probe was > 10 minutes ago
        $needsDiscovery = empty($device->wifi_ssid) || $device->connectedHosts()->count() === 0;

        if (!$needsDiscovery) {
            $lastSuccess = AcsTask::query()
                ->where('acs_device_id', $device->id)
                ->where('name', 'getParameterValues')
                ->where('status', 'completed')
                ->latest('completed_at')
                ->value('completed_at');

            if (!$lastSuccess || \Carbon\Carbon::parse($lastSuccess)->diffInMinutes(now()) >= 10) {
                $needsDiscovery = true;
            }
        }

        if ($needsDiscovery) {
            $this->queueDiscoveryTasks($device);
            $nextTask = AcsTask::query()
                ->where('acs_device_id', $device->id)
                ->where('status', 'pending')
                ->oldest('created_at')
                ->first();

            if ($nextTask) {
                return $this->dispatchTask($session, $nextTask, $clientIp, $cwmpId);
            }
        }

        // No pending tasks, end session
        $session->update(['state' => 'closed']);
        return response('', 204);
    }

    /**
     * Queue automatic discovery tasks for missing WiFi, Hosts, and WAN parameters
     */
    private function queueDiscoveryTasks(AcsDevice $device): void
    {
        $hasPending = AcsTask::query()
            ->where('acs_device_id', $device->id)
            ->where('status', 'pending')
            ->exists();
        if ($hasPending) return;

        // Task 1: WLAN Configuration (SSID 1, 2, Passwords, Clients)
        AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'getParameterValues',
            'payload' => [
                'parameter_names' => [
                    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.',
                ],
            ],
            'status' => 'pending',
        ]);

        // Task 2: Connected LAN Hosts (Phones, laptops, IPs, MACs, Hostnames)
        AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'getParameterValues',
            'payload' => [
                'parameter_names' => [
                    'InternetGatewayDevice.LANDevice.1.Hosts.',
                ],
            ],
            'status' => 'pending',
        ]);

        // Task 3: WAN / PPPoE Connection & Uptime
        AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'getParameterValues',
            'payload' => [
                'parameter_names' => [
                    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.',
                ],
            ],
            'status' => 'pending',
        ]);
    }

    /**
     * Dispatch an RPC task to the CPE
     */
    private function dispatchTask(AcsSession $session, AcsTask $task, string $clientIp, string $cwmpId): Response
    {
        $task->update([
            'status' => 'sent',
            'sent_at' => now(),
            'retries' => $task->retries + 1,
        ]);

        $session->update([
            'current_task_id' => $task->id,
            'state' => 'rpc_sent',
            'last_activity_at' => now(),
        ]);

        $commandXml = '';

        switch ($task->name) {
            case 'setParameterValues':
                $params = $task->payload['parameters'] ?? [];
                $commandXml = $this->soapEngine->buildSetParameterValues($params, 'Task-' . $task->id, $cwmpId);
                break;

            case 'getParameterValues':
                $paths = $task->payload['parameter_names'] ?? ['InternetGatewayDevice.DeviceInfo.'];
                $commandXml = $this->soapEngine->buildGetParameterValues($paths, $cwmpId);
                break;

            case 'getParameterNames':
                $path = $task->payload['parameter_path'] ?? 'InternetGatewayDevice.';
                $nextLevel = (bool) ($task->payload['next_level'] ?? false);
                $commandXml = $this->soapEngine->buildGetParameterNames($path, $nextLevel, $cwmpId);
                break;

            case 'reboot':
                $cmdKey = $task->payload['command_key'] ?? ('Reboot-' . $task->id);
                $commandXml = $this->soapEngine->buildReboot($cmdKey, $cwmpId);
                break;

            case 'factoryReset':
                $commandXml = $this->soapEngine->buildFactoryReset($cwmpId);
                break;

            default:
                Log::warning("Tr069AcsController: Unknown task name '{$task->name}' for task #{$task->id}");
                return response('', 204);
        }

        $this->logMessage($session->acs_device_id, 'out', $task->name, $commandXml, $clientIp);

        return response($commandXml, 200, [
            'Content-Type' => 'text/xml; charset=utf-8',
        ])->cookie(self::SESSION_COOKIE, $session->session_id, 5, '/', null, false, false);
    }

    /**
     * Handle RPC response from CPE (SetParameterValuesResponse, GetParameterValuesResponse, etc.)
     */
    private function handleRpcResponse(?AcsSession $session, array $parsed, string $rawXml, string $clientIp, string $cwmpId): Response
    {
        if ($session && $session->current_task_id) {
            $task = AcsTask::find($session->current_task_id);
            if ($task) {
                $task->update([
                    'status' => 'completed',
                    'completed_at' => now(),
                ]);
            }
            $this->logMessage($session->acs_device_id, 'in', $parsed['type'], $rawXml, $clientIp);

            // Process returned parameters if GetParameterValuesResponse
            if ($parsed['type'] === 'GetParameterValuesResponse') {
                $params = $parsed['parameters'] ?? [];
                $types = $parsed['parameter_types'] ?? [];
                if (!empty($params) && $session->device) {
                    $this->deviceService->processGetParameterValuesResponse($session->device, $params, $types);
                }
            }

            // Process returned parameter names if GetParameterNamesResponse
            if ($parsed['type'] === 'GetParameterNamesResponse') {
                $names = $parsed['parameter_names'] ?? [];
                if ($task) {
                    $task->update([
                        'result' => [
                            'count' => count($names),
                            'names' => array_keys($names),
                        ],
                    ]);
                }
                Log::info("Tr069AcsController: GetParameterNamesResponse received " . count($names) . " names for device #{$session->acs_device_id}");
            }
        }

        // Check if there is ANOTHER pending task in queue
        if ($session && $session->acs_device_id) {
            $nextTask = AcsTask::query()
                ->where('acs_device_id', $session->acs_device_id)
                ->where('status', 'pending')
                ->oldest('created_at')
                ->first();

            if ($nextTask) {
                return $this->dispatchTask($session, $nextTask, $clientIp, $cwmpId);
            }

            $session->update(['state' => 'closed']);
        }

        return response('', 204);
    }

    /**
     * Handle Fault from CPE
     */
    private function handleFault(?AcsSession $session, array $parsed, string $rawXml, string $clientIp, string $cwmpId): Response
    {
        $fault = $parsed['fault'] ?? ['code' => '9000', 'message' => 'Unknown Fault'];
        Log::warning("Tr069AcsController: Received Fault [{$fault['code']}] {$fault['message']} from IP {$clientIp}");

        if ($session && $session->current_task_id) {
            $task = AcsTask::find($session->current_task_id);
            if ($task) {
                $task->update([
                    'status' => 'failed',
                    'error_message' => "[{$fault['code']}] {$fault['message']}",
                ]);
            }
            $this->logMessage($session->acs_device_id, 'in', 'Fault', $rawXml, $clientIp);
        }

        // Continue to next task if available instead of terminating immediately
        if ($session && $session->acs_device_id) {
            $nextTask = AcsTask::query()
                ->where('acs_device_id', $session->acs_device_id)
                ->where('status', 'pending')
                ->oldest('created_at')
                ->first();

            if ($nextTask) {
                return $this->dispatchTask($session, $nextTask, $clientIp, $cwmpId);
            }

            $session->update(['state' => 'closed']);
        }

        return response('', 204);
    }

    private function logMessage(?int $deviceId, string $direction, string $eventType, ?string $content, string $ip): void
    {
        try {
            // Keep full XML for troubleshooting (up to 100k)
            $trimmed = $content ? substr($content, 0, 100000) : null;
            AcsLog::query()->create([
                'acs_device_id' => $deviceId,
                'direction' => $direction,
                'event_type' => $eventType,
                'xml_content' => $trimmed,
                'ip_address' => $ip,
            ]);
        } catch (\Throwable) {}
    }
}

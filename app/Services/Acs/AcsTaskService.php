<?php

namespace App\Services\Acs;

use App\Models\AcsDevice;
use App\Models\AcsTask;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AcsTaskService
{
    /**
     * Queue a WiFi credentials change task for a device
     */
    public function queueChangeWifi(AcsDevice $device, string $ssid, string $password, bool $triggerWakeup = true): AcsTask
    {
        $parameters = [
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID' => [
                'value' => $ssid,
                'type' => 'xsd:string',
            ],
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase' => [
                'value' => $password,
                'type' => 'xsd:string',
            ],
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase' => [
                'value' => $password,
                'type' => 'xsd:string',
            ],
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CMS_KeyPassphrase' => [
                'value' => $password,
                'type' => 'xsd:string',
            ],
            'Device.WiFi.SSID.1.SSID' => [
                'value' => $ssid,
                'type' => 'xsd:string',
            ],
            'Device.WiFi.AccessPoint.1.Security.KeyPassphrase' => [
                'value' => $password,
                'type' => 'xsd:string',
            ],
        ];

        // Also update 5GHz if device has 5G
        if (!empty($device->wifi_ssid_5g)) {
            $parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] = [
                'value' => $ssid . '_5G',
                'type' => 'xsd:string',
            ];
            $parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase'] = [
                'value' => $password,
                'type' => 'xsd:string',
            ];
            $parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase'] = [
                'value' => $password,
                'type' => 'xsd:string',
            ];
        }

        $task = AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'setParameterValues',
            'payload' => [
                'parameters' => $parameters,
                'wifi_ssid' => $ssid,
                'wifi_password' => $password,
            ],
            'status' => 'pending',
        ]);

        // Optimistically update device model
        $device->wifi_ssid = $ssid;
        $device->wifi_password = $password;
        $device->save();

        if ($triggerWakeup) {
            $this->triggerConnectionRequest($device);
        }

        return $task;
    }

    /**
     * Queue a reboot task for a device
     */
    public function queueReboot(AcsDevice $device, bool $triggerWakeup = true): AcsTask
    {
        $task = AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'reboot',
            'payload' => [
                'command_key' => 'WebAdminReboot-' . time(),
            ],
            'status' => 'pending',
        ]);

        if ($triggerWakeup) {
            $this->triggerConnectionRequest($device);
        }

        return $task;
    }

    /**
     * Queue a factory reset task
     */
    public function queueFactoryReset(AcsDevice $device, bool $triggerWakeup = true): AcsTask
    {
        $task = AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'factoryReset',
            'payload' => [],
            'status' => 'pending',
        ]);

        if ($triggerWakeup) {
            $this->triggerConnectionRequest($device);
        }

        return $task;
    }

    /**
     * Queue a parameter probing / refresh task
     */
    public function queueGetParameters(AcsDevice $device, array $paths = [], bool $triggerWakeup = true): AcsTask
    {
        if (empty($paths)) {
            $paths = [
                'InternetGatewayDevice.DeviceInfo.',
                'InternetGatewayDevice.WANDevice.',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.',
                'InternetGatewayDevice.LANDevice.1.Hosts.',
            ];
        }

        $task = AcsTask::create([
            'acs_device_id' => $device->id,
            'name' => 'getParameterValues',
            'payload' => [
                'parameter_names' => $paths,
            ],
            'status' => 'pending',
        ]);

        if ($triggerWakeup) {
            $this->triggerConnectionRequest($device);
        }

        return $task;
    }

    /**
     * Trigger Connection Request (Summon / Wake Up) on the CPE
     */
    public function triggerConnectionRequest(AcsDevice $device): bool
    {
        $url = $device->connection_request_url;
        if (empty($url)) {
            return false;
        }

        try {
            $client = Http::timeout(3);

            $user = $device->connection_request_user;
            $pass = $device->connection_request_pass;

            if (!empty($user)) {
                $client = $client->withDigestAuth($user, $pass ?: '');
            }

            $response = $client->get($url);

            Log::info("AcsTaskService: Connection Request to {$device->device_id} ({$url}) HTTP " . $response->status());
            return $response->successful() || $response->status() === 204 || $response->status() === 200;
        } catch (\Throwable $e) {
            // Fallback basic auth
            try {
                if (!empty($user)) {
                    $response = Http::timeout(2)->withBasicAuth($user, $pass ?: '')->get($url);
                    return $response->successful() || $response->status() === 204 || $response->status() === 200;
                }
            } catch (\Throwable) {}

            Log::warning("AcsTaskService: Connection Request failed for {$device->device_id} ({$url}): " . $e->getMessage());
            return false;
        }
    }
}

<?php

namespace App\Http\Controllers;

use App\Exceptions\GenieAcsException;
use App\Models\Customer;
use App\Services\AuditLogService;
use App\Services\GenieAcsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class GenieAcsMonitoringController extends Controller
{
    public function __construct(
        private readonly GenieAcsService $genieAcsService,
        private readonly AuditLogService $auditLogService,
    ) {
    }

    /**
     * Get all devices & customers summary with fast projection, filtering, and stats
     */
    public function devices(Request $request)
    {
        try {
            $forceFresh = $request->boolean('fresh') || $request->has('refresh');
            $data = $this->genieAcsService->getAllDevicesSummary($forceFresh);

            $devices = collect($data['devices'] ?? []);
            $search = strtolower(trim((string) $request->input('search', '')));
            $statusFilter = strtolower(trim((string) $request->input('status', 'all')));
            $capacityFilter = strtolower(trim((string) $request->input('capacity', $request->input('capacity_status', 'all'))));
            $packageFilter = strtolower(trim((string) $request->input('package', 'all')));

            // 1. Filter by status
            if ($statusFilter === 'online') {
                $devices = $devices->where('is_online', true);
            } elseif ($statusFilter === 'offline') {
                $devices = $devices->where('has_genieacs', true)->where('is_online', false);
            } elseif ($statusFilter === 'with_acs') {
                $devices = $devices->where('has_genieacs', true)->where('is_unassigned', false);
            } elseif ($statusFilter === 'without_acs') {
                $devices = $devices->where('has_genieacs', false);
            } elseif ($statusFilter === 'unassigned') {
                $devices = $devices->where('is_unassigned', true);
            } elseif ($statusFilter === 'critical_rx') {
                $devices = $devices->where('rx_status', 'critical');
            } elseif ($statusFilter === 'warning_rx') {
                $devices = $devices->where('rx_status', 'warning');
            }

            // 2. Filter by device capacity compliance (Aman / Siaga / Kritis / Overlimit)
            if ($capacityFilter === 'safe') {
                $devices = $devices->where('capacity_status', 'safe');
            } elseif ($capacityFilter === 'warning') {
                $devices = $devices->where('capacity_status', 'warning');
            } elseif ($capacityFilter === 'critical') {
                $devices = $devices->where('capacity_status', 'critical');
            } elseif ($capacityFilter === 'overlimit') {
                $devices = $devices->filter(fn($d) => in_array($d['capacity_status'] ?? '', ['warning', 'critical'], true));
            } elseif ($capacityFilter === 'no_limit') {
                $devices = $devices->where('capacity_status', 'no_limit');
            }

            // 3. Filter by package name or ID
            if ($packageFilter !== '' && $packageFilter !== 'all') {
                $devices = $devices->filter(function ($d) use ($packageFilter) {
                    $pkgId = (string) ($d['customer']['package_id'] ?? '');
                    $pkgName = strtolower((string) ($d['customer']['package_name'] ?? ''));
                    return $pkgId === $packageFilter || str_contains($pkgName, $packageFilter);
                });
            }

            // 4. Filter by search query
            if ($search !== '') {
                $devices = $devices->filter(function ($d) use ($search) {
                    $devId = strtolower((string) ($d['device_id'] ?? ''));
                    $sn = strtolower((string) ($d['serial_number'] ?? ''));
                    $pppoe = strtolower((string) ($d['pppoe_username'] ?? ''));
                    $ip = strtolower((string) ($d['ip_address'] ?? ''));
                    $mac = strtolower((string) ($d['mac_address'] ?? ''));
                    $ssid = strtolower((string) ($d['ssid'] ?? ''));
                    $custName = strtolower((string) ($d['customer']['name'] ?? ''));
                    $custPhone = strtolower((string) ($d['customer']['phone'] ?? ''));
                    $custAddr = strtolower((string) ($d['customer']['address'] ?? ''));
                    $pkgName = strtolower((string) ($d['customer']['package_name'] ?? ''));

                    return str_contains($devId, $search)
                        || str_contains($sn, $search)
                        || str_contains($pppoe, $search)
                        || str_contains($ip, $search)
                        || str_contains($mac, $search)
                        || str_contains($ssid, $search)
                        || str_contains($custName, $search)
                        || str_contains($custPhone, $search)
                        || str_contains($custAddr, $search)
                        || str_contains($pkgName, $search);
                });
            }

            return response()->json([
                'stats' => $data['stats'] ?? [],
                'packages' => $data['packages'] ?? [],
                'devices' => $devices->values()->all(),
                'total_filtered' => $devices->count(),
            ]);
        } catch (GenieAcsException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->status());
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal memuat monitoring perangkat GenieACS: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get detailed telemetry and configuration of a single device
     */
    public function show(string $deviceId)
    {
        try {
            $data = $this->genieAcsService->getDeviceDetails($deviceId);

            return response()->json([
                'data' => $data,
            ]);
        } catch (GenieAcsException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->status());
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal memuat detail perangkat: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update WiFi SSID Name and/or Password on the router device
     */
    public function updateWifi(Request $request, string $deviceId)
    {
        $validated = $request->validate([
            'ssid' => ['nullable', 'string', 'min:1', 'max:32'],
            'password' => ['nullable', 'string', 'min:8', 'max:63'],
        ], [
            'password.min' => 'Password WiFi minimal 8 karakter.',
            'password.max' => 'Password WiFi maksimal 63 karakter.',
            'ssid.max' => 'Nama SSID WiFi maksimal 32 karakter.',
        ]);

        if (empty($validated['ssid']) && empty($validated['password'])) {
            return response()->json([
                'message' => 'Masukkan Nama SSID atau Password baru yang ingin diperbarui.',
            ], 422);
        }

        try {
            $result = $this->genieAcsService->updateDeviceWifi($deviceId, $validated);

            $this->auditLogService->log('genieacs.wifi_updated', null, [
                'device_id' => $deviceId,
                'ssid_changed' => !empty($validated['ssid']),
                'password_changed' => !empty($validated['password']),
                'updated_parameters' => $result['updated_parameters'] ?? 0,
            ], auth()->id());

            return response()->json([
                'message' => 'Perintah pembaruan WiFi berhasil dikirim ke router via GenieACS.',
                'data' => $result,
            ]);
        } catch (GenieAcsException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->status());
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal mengubah konfigurasi WiFi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Reboot router device via TR-069
     */
    public function reboot(string $deviceId)
    {
        try {
            $result = $this->genieAcsService->rebootDevice($deviceId);

            $this->auditLogService->log('genieacs.device_rebooted', null, [
                'device_id' => $deviceId,
            ], auth()->id());

            return response()->json([
                'message' => 'Perintah reboot router berhasil dikirim ke antrean GenieACS.',
                'data' => $result,
            ]);
        } catch (GenieAcsException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->status());
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal mengirim perintah reboot: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Request Inform / Refresh parameters from router
     */
    public function refresh(string $deviceId)
    {
        try {
            $result = $this->genieAcsService->refreshDevice($deviceId);

            return response()->json([
                'message' => 'Perintah sinkronisasi parameter berhasil dikirim ke router.',
                'data' => $result,
            ]);
        } catch (GenieAcsException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->status());
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal mengirim perintah refresh: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Manually assign customer to a GenieACS device
     */
    public function assignCustomer(Request $request, string $deviceId)
    {
        $validated = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
        ]);

        $customer = Customer::query()->find($validated['customer_id']);
        if (!$customer) {
            return response()->json(['message' => 'Pelanggan tidak ditemukan.'], 404);
        }

        // Clear summary cache
        Cache::forget('genieacs_devices_summary_fast');

        $this->auditLogService->log('genieacs.customer_assigned', $customer, [
            'device_id' => $deviceId,
            'customer_id' => $customer->id,
            'pppoe_username' => $customer->pppoe_username,
        ], auth()->id());

        return response()->json([
            'message' => "Perangkat berhasil ditautkan ke pelanggan {$customer->name}.",
        ]);
    }
}

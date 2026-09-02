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

    /**
     * Send customer public portal link via system's WhatsApp Gateway API
     */
    public function sendPortalLinkWhatsApp(Request $request)
    {
        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'portal_token' => ['nullable', 'string'],
            'custom_phone' => ['nullable', 'string'],
        ]);

        $customer = null;
        if (!empty($validated['customer_id'])) {
            $customer = Customer::find($validated['customer_id']);
        } elseif (!empty($validated['portal_token'])) {
            $customer = $this->genieAcsService->resolveCustomerByPortalToken($validated['portal_token']);
        }

        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Data pelanggan tidak ditemukan untuk pengiriman link portal.',
            ], 404);
        }

        $rawPhone = preg_replace('/\D/', '', (string) ($validated['custom_phone'] ?? $customer->phone ?? ''));
        if (str_starts_with($rawPhone, '0')) {
            $cleanPhone = '62' . substr($rawPhone, 1);
        } elseif (str_starts_with($rawPhone, '8')) {
            $cleanPhone = '62' . $rawPhone;
        } else {
            $cleanPhone = $rawPhone;
        }

        if (strlen($cleanPhone) < 9) {
            return response()->json([
                'success' => false,
                'message' => 'Nomor WhatsApp pelanggan belum terdaftar atau format nomor tidak valid.',
            ], 422);
        }

        // Generate token and link
        $token = $this->genieAcsService->generateCustomerPortalToken($customer->id);
        $portalUrl = url("/portal-pelanggan/{$token}");
        $customerName = $customer->name ?? 'Pelanggan';

        $message = "Halo Bapak/Ibu *{$customerName}*,\n\n" .
            "Berikut adalah link *Portal Akses Mandiri WiFi Rumah Kita Net* Anda:\n\n" .
            "🌐 {$portalUrl}\n\n" .
            "Melalui portal ini, Anda dapat:\n" .
            "✅ Melihat & Mengganti Kata Sandi WiFi secara mandiri\n" .
            "✅ Memeriksa daftar perangkat/HP yang sedang terhubung\n" .
            "✅ Memblokir perangkat asing/tidak dikenal\n" .
            "✅ Melihat batas kuota kapasitas & status tagihan bulanan\n" .
            "✅ Membuat tiket aduan kendala jika internet mengalami gangguan\n\n" .
            "_(Tautan khusus ini dapat diakses langsung dari HP Anda tanpa perlu login)_\n\n" .
            "Salam,\n*Rumah Kita Net*";

        $fallbackWaUrl = "https://wa.me/{$cleanPhone}?text=" . rawurlencode($message);

        // Attempt sending via internal WhatsApp Gateway (same pattern as BillingController / PaymentCapture)
        $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://127.0.0.1:3001'), '/');
        
        try {
            $response = \Illuminate\Support\Facades\Http::timeout(30)->post($gatewayUrl . '/send-bulk', [
                'recipients' => [[
                    'phone' => $cleanPhone,
                    'name' => $customerName,
                ]],
                'message' => $message,
                'delay' => 0,
            ]);

            $payload = $response->json();
            $results = is_array($payload['results'] ?? null) ? $payload['results'] : [];
            $isSuccess = false;
            $error = null;

            if (count($results) > 0) {
                $first = $results[0];
                $isSuccess = (bool) ($first['success'] ?? false);
                $error = $isSuccess ? null : (($first['error'] ?? null) ?: 'Nomor ditolak oleh WhatsApp Gateway');
            } else {
                if (!$response->successful()) {
                    // Fallback to /send endpoint
                    $fallbackRes = \Illuminate\Support\Facades\Http::timeout(30)->post($gatewayUrl . '/send', [
                        'phone' => $cleanPhone,
                        'name' => $customerName,
                        'message' => $message,
                    ]);
                    $fallbackPayload = $fallbackRes->json();
                    $isSuccess = $fallbackRes->successful() && ((bool) ($fallbackPayload['success'] ?? false) || (string) ($fallbackPayload['message'] ?? '') === 'Pesan berhasil terkirim');
                    $error = $isSuccess ? null : ($fallbackPayload['error'] ?? $fallbackPayload['message'] ?? 'Gateway rejected message');
                } else {
                    $isSuccess = (bool) ($payload['success'] ?? false);
                    $error = $isSuccess ? null : ($payload['error'] ?? $payload['message'] ?? 'Respon gateway tidak valid');
                }
            }

            if ($isSuccess) {
                \App\Models\NotificationLog::create([
                    'customer_id' => $customer->id,
                    'phone' => $cleanPhone,
                    'message' => mb_substr($message, 0, 2000),
                    'notice_id' => null,
                    'status' => 'sent',
                    'error' => null,
                    'sent_at' => now(),
                ]);

                $this->auditLogService->log('customer_portal.whatsapp_link_sent', $customer, [
                    'customer_id' => $customer->id,
                    'phone' => $cleanPhone,
                    'portal_url' => $portalUrl,
                    'via' => 'whatsapp_gateway',
                ], auth()->id());

                return response()->json([
                    'success' => true,
                    'message' => "Link portal mandiri berhasil dikirimkan ke WhatsApp {$customerName} ({$cleanPhone})!",
                    'phone' => $cleanPhone,
                    'portal_url' => $portalUrl,
                ]);
            }

            \App\Models\NotificationLog::create([
                'customer_id' => $customer->id,
                'phone' => $cleanPhone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => 'failed',
                'error' => $error,
                'sent_at' => now(),
            ]);

            return response()->json([
                'success' => false,
                'message' => "WhatsApp Gateway gagal mengirim: {$error}",
                'fallback_url' => $fallbackWaUrl,
                'phone' => $cleanPhone,
            ], 422);

        } catch (\Throwable $e) {
            \App\Models\NotificationLog::create([
                'customer_id' => $customer->id,
                'phone' => $cleanPhone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => 'failed',
                'error' => 'Gateway error: ' . $e->getMessage(),
                'sent_at' => now(),
            ]);

            return response()->json([
                'success' => false,
                'message' => "WhatsApp Gateway service tidak dapat dihubungi: " . $e->getMessage(),
                'fallback_url' => $fallbackWaUrl,
                'phone' => $cleanPhone,
            ], 503);
        }
    }
}

<?php

namespace App\Http\Controllers;

use App\Exceptions\GenieAcsException;
use App\Models\Customer;
use App\Services\AuditLogService;
use App\Services\GenieAcsService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class CustomerPublicPortalController extends Controller
{
    public function __construct(
        private readonly GenieAcsService $genieAcsService,
        private readonly AuditLogService $auditLogService
    ) {
    }

    /**
     * Get complete public portal data for a customer by portal token (No Login Required)
     */
    public function show(string $token)
    {
        try {
            $customer = $this->genieAcsService->resolveCustomerByPortalToken($token);

            if (!$customer) {
                return response()->json([
                    'message' => 'Tautan akses portal pelanggan tidak valid atau sudah tidak aktif. Pastikan Anda membuka tautan resmi dari admin atau hubungi Customer Service.',
                ], 404);
            }

        $pppoe = trim((string) $customer->pppoe_username);
        $device = null;
        $deviceId = null;
        $isOnline = false;
        $ssid = null;
        $wifiPassword = null;
        $lanHosts = [];
        $blockedDevices = [];
        $rxPower = null;
        $productClass = null;
        $serialNumber = null;
        $lastInformAt = null;

        if ($pppoe !== '') {
            try {
                $device = $this->genieAcsService->findDeviceByPppoe($pppoe);
            } catch (\Throwable) {
                $device = null;
            }
        }

        if ($device) {
            $deviceId = $device['_id'] ?? null;
            $productClass = $device['DeviceID']['ProductClass']['_value']
                ?? $device['InternetGatewayDevice']['DeviceInfo']['ProductClass']['_value']
                ?? 'ONT Router';
            $serialNumber = $device['DeviceID']['SerialNumber']['_value']
                ?? $device['VirtualParameters']['getSerialNumber']['_value']
                ?? $device['InternetGatewayDevice']['DeviceInfo']['SerialNumber']['_value']
                ?? null;

            $lastInform = $device['_lastInform']['_value'] ?? ($device['_lastInform'] ?? null);
            if ($lastInform) {
                try {
                    $lastInformAt = Carbon::parse($lastInform)->setTimezone('Asia/Jakarta')->toIso8601String();
                    $isOnline = Carbon::parse($lastInform)->greaterThanOrEqualTo(now()->subMinutes(15));
                } catch (\Throwable) {
                    $isOnline = false;
                }
            }

            $ssid = $device['InternetGatewayDevice']['LANDevice']['1']['WLANConfiguration']['1']['SSID']['_value']
                ?? $device['VirtualParameters']['WlanSSID']['_value']
                ?? null;

            $wifiPassword = $this->genieAcsService->resolveWifiPassword($device);
            $lanHosts = $this->genieAcsService->resolveAllConnectedHosts($device);

            $rxPower = $device['VirtualParameters']['RXPower']['_value'] ?? null;
            if ($rxPower === 'N/A' || $rxPower === '') {
                $rxPower = null;
            }

            if ($deviceId) {
                $blockedDevices = $this->genieAcsService->getBlockedDevices($deviceId, $customer->id);
            }
        }

        // Capacity calculation
        $pkg = $customer->package;
        $maxDevices = $pkg && $pkg->device_count !== null && $pkg->device_count > 0 ? (int) $pkg->device_count : null;
        
        // Count active clients
        $activeClientsCount = count(array_filter($lanHosts, fn($h) => !empty($h['is_active'])));
        if ($activeClientsCount === 0 && !empty($device['VirtualParameters']['activedevices']['_value'])) {
            $activeClientsCount = (int) $device['VirtualParameters']['activedevices']['_value'];
        }

        $capacityStatus = 'no_limit';
        $capacityLabel = 'Tanpa Batas';
        $capacityDiff = 0;

        if ($maxDevices !== null && $maxDevices > 0) {
            if ($activeClientsCount <= $maxDevices) {
                $capacityStatus = 'safe';
                $capacityLabel = "Kapasitas Aman ({$activeClientsCount}/{$maxDevices})";
                $capacityDiff = 0;
            } elseif ($activeClientsCount === $maxDevices + 1) {
                $capacityStatus = 'warning';
                $capacityLabel = "Kapasitas Siaga (+1) ({$activeClientsCount}/{$maxDevices})";
                $capacityDiff = 1;
            } else {
                $capacityStatus = 'critical';
                $over = $activeClientsCount - $maxDevices;
                $capacityLabel = "Kapasitas Kritis (+{$over}) ({$activeClientsCount}/{$maxDevices})";
                $capacityDiff = $over;
            }
        }

        // Billing & Invoices (Non-sensitive)
        $latestInvoice = $customer->invoices()
            ->latest('id')
            ->first();

        $invoicePayload = null;
        if ($latestInvoice) {
            $invoicePayload = [
                'id' => $latestInvoice->id,
                'invoice_number' => $latestInvoice->invoice_number,
                'status' => strtolower((string) $latestInvoice->status),
                'amount' => (int) $latestInvoice->total_amount,
                'due_date' => $latestInvoice->due_date ? Carbon::parse($latestInvoice->due_date)->format('d F Y') : null,
                'period' => $latestInvoice->period ?? null,
                'payment_url' => $latestInvoice->invoice_link ? url("/invoice/{$latestInvoice->invoice_link}") : null,
                'is_paid' => in_array(strtolower((string) $latestInvoice->status), ['paid', 'lunas'], true),
            ];
        }

        // Disruption / Offline Detection (> 15 minutes)
        $isOfflineOver15Min = false;
        $offlineDurationMinutes = 0;
        $lastActiveFormatted = null;

        if ($lastInformAt) {
            try {
                $lastInformCarbon = Carbon::parse($lastInformAt);
                $offlineDurationMinutes = (int) $lastInformCarbon->diffInMinutes(now());
                $lastActiveFormatted = $lastInformCarbon->setTimezone('Asia/Jakarta')->format('d M Y H:i') . ' WIB';
                if ($offlineDurationMinutes >= 15) {
                    $isOfflineOver15Min = true;
                }
            } catch (\Throwable) {
                $isOfflineOver15Min = !$isOnline;
            }
        } elseif (!$device || !$isOnline) {
            $isOfflineOver15Min = true;
        }

        // Recent complaints from this customer
        $recentComplaints = $customer->complaints()
            ->orderByDesc('created_at')
            ->take(5)
            ->get()
            ->map(fn($c) => [
                'id' => $c->id,
                'ticket_number' => $c->ticket_number,
                'subject' => $c->subject,
                'category' => $c->category,
                'status' => $c->status,
                'status_label' => match($c->status) {
                    'pending' => 'Menunggu Teknisi',
                    'in_progress' => 'Sedang Ditangani',
                    'resolved' => 'Selesai',
                    'closed' => 'Ditutup',
                    default => ucfirst($c->status),
                },
                'created_at' => $c->created_at ? Carbon::parse($c->created_at)->setTimezone('Asia/Jakarta')->format('d M Y H:i') : null,
                'admin_response' => $c->admin_response,
            ]);

        // Customer General Info (Safe - NO NIK, NO KTP, NO house photos)
        $formattedAddress = implode(', ', array_filter([
            $customer->address,
            $customer->dusun?->name ? 'Dsn. ' . $customer->dusun->name : null,
            $customer->desa?->name ? 'Ds. ' . $customer->desa->name : null,
            $customer->kecamatan?->name ? 'Kec. ' . $customer->kecamatan->name : null,
        ]));

        return response()->json([
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone,
                'address' => $formattedAddress ?: ($customer->address ?: 'Alamat Terdaftar'),
                'is_active' => (bool) $customer->is_active,
                'due_date' => $customer->due_date ? 'Tanggal ' . $customer->due_date . ' setiap bulan' : 'Tanggal 20 setiap bulan',
                'due_date_day' => $customer->due_date ?: '20',
            ],
            'package' => [
                'name' => $pkg?->name ?? ($customer->package_type ?: 'Paket Internet Rumah Kita Net'),
                'speed' => $pkg?->speed ?? 'Sesuai Langganan',
                'price' => (int) ($pkg?->price ?? ($customer->custom_package ?? 0)),
                'max_devices' => $maxDevices,
                'active_status' => $customer->is_active ? 'Aktif' : 'Terisolir / Non-Aktif',
            ],
            'capacity' => [
                'status' => $capacityStatus, // 'safe' | 'warning' | 'critical' | 'no_limit'
                'label' => $capacityLabel,
                'diff' => $capacityDiff,
                'connected_count' => $activeClientsCount,
                'max_devices' => $maxDevices,
                'is_compliant' => $capacityStatus === 'safe' || $capacityStatus === 'no_limit',
            ],
            'wifi' => [
                'has_router' => (bool) $device,
                'device_id' => $deviceId,
                'is_online' => $isOnline,
                'last_inform_at' => $lastInformAt,
                'model' => $productClass,
                'serial_number' => $serialNumber,
                'ssid' => $ssid,
                'password' => $wifiPassword, // Will be null if encrypted/not retrieved
                'rx_power' => $rxPower,
                'connected_hosts' => $lanHosts,
                'blocked_devices' => $blockedDevices,
            ],
            'disruption' => [
                'is_disrupted' => $isOfflineOver15Min,
                'offline_duration_minutes' => $offlineDurationMinutes,
                'last_active_at' => $lastActiveFormatted,
                'notice_title' => 'Perangkat Router Tidak Aktif / Terindikasi Gangguan',
                'notice_description' => 'Router Anda terdeteksi tidak aktif lebih dari 15 menit. Jika adaptor router terpasang dan lampu indikator mati atau lampu LOS berkedip merah, Anda dapat langsung membuat tiket aduan gangguan di bawah ini.',
                'recent_complaints' => $recentComplaints,
            ],
            'invoice' => $invoicePayload,
            'cs_contact' => [
                'name' => 'Customer Service Rumah Kita Net',
                'whatsapp' => '6282181512403',
                'phone' => '082181512403',
                'support_message' => "Halo CS Rumah Kita Net, saya ingin menanyakan bantuan mengenai jaringan WiFi/Router saya atas nama: {$customer->name}.",
            ],
        ]);
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Terjadi kendala saat memuat data portal: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update WiFi SSID Name or Password by Customer Portal Token
     */
    public function updateWifi(Request $request, string $token)
    {
        $customer = $this->genieAcsService->resolveCustomerByPortalToken($token);

        if (!$customer) {
            return response()->json([
                'message' => 'Tautan akses portal pelanggan tidak valid.',
            ], 404);
        }

        $validated = $request->validate([
            'ssid' => ['nullable', 'string', 'min:1', 'max:32'],
            'password' => ['nullable', 'string', 'min:8', 'max:63'],
        ], [
            'password.min' => 'Password WiFi baru minimal 8 karakter.',
            'password.max' => 'Password WiFi baru maksimal 63 karakter.',
            'ssid.max' => 'Nama SSID WiFi maksimal 32 karakter.',
        ]);

        if (empty($validated['ssid']) && empty($validated['password'])) {
            return response()->json([
                'message' => 'Masukkan Nama SSID atau Password baru yang ingin diperbarui.',
            ], 422);
        }

        $pppoe = trim((string) $customer->pppoe_username);
        if ($pppoe === '') {
            return response()->json([
                'message' => 'Akun pelanggan belum memiliki router PPPoE yang tertaut.',
            ], 422);
        }

        try {
            $device = $this->genieAcsService->findDeviceByPppoe($pppoe);
            if (!$device) {
                return response()->json([
                    'message' => 'Router pelanggan sedang offline atau belum terdeteksi di server.',
                ], 404);
            }

            $deviceId = $device['_id'];
            $result = $this->genieAcsService->updateDeviceWifi($deviceId, $validated);

            $this->auditLogService->log('customer_portal.wifi_updated', $customer, [
                'customer_id' => $customer->id,
                'device_id' => $deviceId,
                'ssid_changed' => !empty($validated['ssid']),
                'password_changed' => !empty($validated['password']),
            ]);

            return response()->json([
                'message' => 'Kata sandi / SSID WiFi baru berhasil dikirim ke router Anda!',
                'data' => $result,
            ]);
        } catch (GenieAcsException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->status());
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal memperbarui konfigurasi WiFi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Block a device MAC address from the customer's WiFi
     */
    public function blockDevice(Request $request, string $token)
    {
        $customer = $this->genieAcsService->resolveCustomerByPortalToken($token);

        if (!$customer) {
            return response()->json(['message' => 'Tautan akses portal pelanggan tidak valid.'], 404);
        }

        $validated = $request->validate([
            'mac_address' => ['required', 'string', 'regex:/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/'],
            'reason' => ['nullable', 'string', 'max:100'],
        ]);

        $pppoe = trim((string) $customer->pppoe_username);
        $device = $pppoe ? $this->genieAcsService->findDeviceByPppoe($pppoe) : null;

        if (!$device) {
            return response()->json(['message' => 'Router pelanggan tidak ditemukan.'], 404);
        }

        try {
            $result = $this->genieAcsService->blockDeviceMac($device['_id'], $validated['mac_address'], $customer->id, $validated['reason'] ?? null);

            $this->auditLogService->log('customer_portal.device_blocked', $customer, [
                'customer_id' => $customer->id,
                'mac_address' => $validated['mac_address'],
            ]);

            return response()->json([
                'message' => "Perangkat dengan MAC {$validated['mac_address']} berhasil diblokir dari WiFi Anda.",
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Gagal memblokir perangkat: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Unblock a device MAC address from the customer's WiFi
     */
    public function unblockDevice(Request $request, string $token)
    {
        $customer = $this->genieAcsService->resolveCustomerByPortalToken($token);

        if (!$customer) {
            return response()->json(['message' => 'Tautan akses portal pelanggan tidak valid.'], 404);
        }

        $validated = $request->validate([
            'mac_address' => ['required', 'string', 'regex:/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/'],
        ]);

        $pppoe = trim((string) $customer->pppoe_username);
        $device = $pppoe ? $this->genieAcsService->findDeviceByPppoe($pppoe) : null;

        if (!$device) {
            return response()->json(['message' => 'Router pelanggan tidak ditemukan.'], 404);
        }

        try {
            $result = $this->genieAcsService->unblockDeviceMac($device['_id'], $validated['mac_address'], $customer->id);

            $this->auditLogService->log('customer_portal.device_unblocked', $customer, [
                'customer_id' => $customer->id,
                'mac_address' => $validated['mac_address'],
            ]);

            return response()->json([
                'message' => "Perangkat dengan MAC {$validated['mac_address']} berhasil dibuka blokirnya.",
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Gagal membuka blokir perangkat: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Submit a customer complaint / disruption ticket via public portal
     */
    public function storeComplaint(Request $request, string $token)
    {
        $customer = $this->genieAcsService->resolveCustomerByPortalToken($token);

        if (!$customer) {
            return response()->json(['message' => 'Tautan akses portal pelanggan tidak valid.'], 404);
        }

        $validated = $request->validate([
            'category' => ['required', 'string', 'in:los_merah,mati_total,koneksi_lambat,sering_putus,ganti_password,lainnya'],
            'subject' => ['required', 'string', 'min:3', 'max:150'],
            'message' => ['required', 'string', 'min:5', 'max:2000'],
        ], [
            'category.required' => 'Pilih kategori kendala / gangguan.',
            'subject.required' => 'Judul laporan aduan wajib diisi.',
            'message.required' => 'Jelaskan rincian kendala Anda minimal 5 karakter.',
        ]);

        $categoryLabels = [
            'los_merah' => 'Lampu LOS Berkedip Merah',
            'mati_total' => 'Router Mati Total / Tidak Menyala',
            'koneksi_lambat' => 'Koneksi Lambat / Lemot',
            'sering_putus' => 'Koneksi Sering Putus / RTO',
            'ganti_password' => 'Bantuan Pengaturan WiFi',
            'lainnya' => 'Kendala Lainnya',
        ];

        $dbCategory = match($validated['category']) {
            'ganti_password' => 'layanan',
            'lainnya' => 'lainnya',
            default => 'gangguan',
        };

        try {
            $complaint = \App\Models\Complaint::create([
                'customer_id' => $customer->id,
                'subject' => "[{$categoryLabels[$validated['category']]}] " . $validated['subject'],
                'category' => $dbCategory,
                'message' => $validated['message'],
                'status' => 'pending',
                'priority' => in_array($validated['category'], ['los_merah', 'mati_total'], true) ? 'high' : 'medium',
                'opened_at' => now(),
                'last_activity_at' => now(),
            ]);

            $this->auditLogService->log('customer_portal.complaint_created', $customer, [
                'customer_id' => $customer->id,
                'complaint_id' => $complaint->id,
                'ticket_number' => $complaint->ticket_number,
                'category' => $validated['category'],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Laporan aduan berhasil dikirim ke tim teknisi kami!',
                'data' => [
                    'id' => $complaint->id,
                    'ticket_number' => $complaint->ticket_number,
                    'subject' => $complaint->subject,
                    'category' => $complaint->category,
                    'category_label' => $categoryLabels[$validated['category']] ?? $validated['category'],
                    'status' => $complaint->status,
                    'status_label' => 'Menunggu Teknisi',
                    'created_at' => Carbon::parse($complaint->created_at)->setTimezone('Asia/Jakarta')->format('d M Y H:i'),
                ],
            ], 201);
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Gagal membuat laporan aduan: ' . $e->getMessage(),
            ], 500);
        }
    }
}

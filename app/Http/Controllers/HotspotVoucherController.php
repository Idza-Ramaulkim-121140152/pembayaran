<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\HotspotLocation;
use App\Models\HotspotVoucherOrder;
use App\Models\HotspotVoucherPackage;
use App\Services\DynamicQrisService;
use App\Services\HotspotVoucherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class HotspotVoucherController extends Controller
{
    public function __construct(
        protected HotspotVoucherService $voucherService,
        protected DynamicQrisService $qrisService
    ) {
    }

    /**
     * PUBLIC: Daftar paket voucher hotspot aktif untuk halaman self-service.
     */
    public function publicPackages(): JsonResponse
    {
        if (!Schema::hasTable('hotspot_voucher_packages')) {
            return response()->json([
                'packages' => [],
                'qris_ready' => false,
                'hotspot_dns' => config('services.mikrotik.hotspot_dns', 'rumahkita.id'),
            ]);
        }

        $packages = HotspotVoucherPackage::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('price')
            ->orderBy('id')
            ->get()
            ->map(fn (HotspotVoucherPackage $pkg) => [
                'id' => $pkg->id,
                'name' => $pkg->name,
                'code' => $pkg->code,
                'price' => (float) $pkg->price,
                'duration_minutes' => (int) $pkg->duration_minutes,
                'duration_label' => $pkg->duration_label,
                'max_devices' => (int) $pkg->max_devices,
                'rate_limit' => $pkg->rate_limit,
                'description' => $pkg->description,
            ])
            ->values();

        return response()->json([
            'packages' => $packages,
            'qris_ready' => trim($this->qrisService->getStaticPayload()) !== '',
            'hotspot_dns' => 'rumahkita.id',
        ]);
    }

    /**
     * PUBLIC: Buat pesanan voucher hotspot + generate QRIS kode unik.
     */
    public function createPublicOrder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'package_id' => ['required', 'integer', 'exists:hotspot_voucher_packages,id'],
            'customer_phone' => ['required', 'string', 'min:9', 'max:25'],
            'customer_name' => ['nullable', 'string', 'max:120'],
            'mac_address' => ['nullable', 'string', 'max:40'],
            'ip_address' => ['nullable', 'string', 'max:45'],
            'login_url' => ['nullable', 'string', 'max:255'],
        ]);

        $phoneDigits = preg_replace('/\D+/', '', (string) $validated['customer_phone']) ?: '';
        if (strlen($phoneDigits) < 9 || strlen($phoneDigits) > 15) {
            return response()->json([
                'message' => 'Format nomor WhatsApp tidak valid. Masukkan nomor aktif seperti 08xxxxxxxxxx.',
            ], 422);
        }

        $package = HotspotVoucherPackage::query()
            ->where('id', $validated['package_id'])
            ->where('is_active', true)
            ->first();

        if (!$package) {
            return response()->json([
                'message' => 'Paket voucher tidak ditemukan atau sedang nonaktif.',
            ], 404);
        }

        try {
            $order = $this->voucherService->createOrder(
                $package,
                (string) $validated['customer_phone'],
                $validated['customer_name'] ?? null,
                $validated['login_url'] ?? null
            );

            return response()->json([
                'message' => 'Pesanan voucher berhasil dibuat. Silakan selesaikan pembayaran QRIS sesuai nominal kode unik.',
                'order' => $this->voucherService->presentPublicOrder($order),
            ], 201);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage() ?: 'Gagal membuat pesanan voucher.',
            ], 422);
        }
    }

    /**
     * PUBLIC: Polling status pembayaran order voucher (dipanggil tiap 3 detik dari halaman bayar).
     */
    public function publicOrderStatus(string $orderCode): JsonResponse
    {
        $order = HotspotVoucherOrder::query()
            ->with('package')
            ->where('order_code', trim($orderCode))
            ->first();

        if (!$order) {
            return response()->json([
                'message' => 'Pesanan voucher tidak ditemukan.',
            ], 404);
        }

        if (
            $order->status === HotspotVoucherOrder::STATUS_PENDING
            && $order->qris_expired_at
            && $order->qris_expired_at->isPast()
        ) {
            $order->status = HotspotVoucherOrder::STATUS_EXPIRED;
            $order->voucher_status = HotspotVoucherOrder::VOUCHER_EXPIRED;
            $order->save();
        }

        return response()->json([
            'order' => $this->voucherService->presentPublicOrder($order),
        ]);
    }

    /**
     * ADMIN: Dashboard manajemen paket & riwayat pembelian voucher hotspot.
     */
    public function adminDashboard(Request $request): JsonResponse
    {
        $status = trim((string) $request->query('status', ''));
        $packageId = $request->query('package_id');
        $search = trim((string) $request->query('search', ''));
        $dateFrom = trim((string) $request->query('date_from', ''));
        $dateTo = trim((string) $request->query('date_to', ''));
        $limit = min(max((int) $request->query('limit', 100), 10), 300);

        // Auto-mark expired pending orders so status is always fresh
        HotspotVoucherOrder::query()
            ->where('status', HotspotVoucherOrder::STATUS_PENDING)
            ->whereNotNull('qris_expired_at')
            ->where('qris_expired_at', '<', now())
            ->update([
                'status' => HotspotVoucherOrder::STATUS_EXPIRED,
                'voucher_status' => HotspotVoucherOrder::VOUCHER_EXPIRED,
            ]);

        $packages = HotspotVoucherPackage::query()
            ->withCount([
                'orders',
                'orders as paid_orders_count' => fn ($q) => $q->where('status', HotspotVoucherOrder::STATUS_PAID),
            ])
            ->orderBy('sort_order')
            ->orderBy('price')
            ->orderBy('id')
            ->get()
            ->map(fn (HotspotVoucherPackage $pkg) => [
                'id' => $pkg->id,
                'name' => $pkg->name,
                'code' => $pkg->code,
                'mikrotik_profile' => $pkg->mikrotik_profile_name,
                'mikrotik_profile_name' => $pkg->mikrotik_profile_name,
                'hotspot_server' => $pkg->hotspot_server,
                'price' => (float) $pkg->price,
                'duration_minutes' => (int) $pkg->duration_minutes,
                'duration_label' => $pkg->duration_label,
                'max_devices' => (int) $pkg->max_devices,
                'rate_limit' => $pkg->rate_limit,
                'description' => $pkg->description,
                'is_active' => (bool) $pkg->is_active,
                'sort_order' => (int) $pkg->sort_order,
                'orders_count' => (int) ($pkg->orders_count ?? 0),
                'paid_orders_count' => (int) ($pkg->paid_orders_count ?? 0),
            ])
            ->values();

        $ordersQuery = HotspotVoucherOrder::query()
            ->with('package')
            ->when($status !== '' && $status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($packageId && $packageId !== 'all', fn ($q) => $q->where('package_id', (int) $packageId))
            ->when($dateFrom !== '', fn ($q) => $q->whereDate('created_at', '>=', $dateFrom))
            ->when($dateTo !== '', fn ($q) => $q->whereDate('created_at', '<=', $dateTo))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . $search . '%';
                $q->where(function ($sub) use ($like) {
                    $sub->where('order_code', 'like', $like)
                        ->orWhere('voucher_code', 'like', $like)
                        ->orWhere('customer_phone', 'like', $like)
                        ->orWhere('customer_name', 'like', $like);
                });
            })
            ->latest('id');

        $orders = $ordersQuery->limit($limit)->get()->map(fn (HotspotVoucherOrder $o) => [
            'id' => $o->id,
            'order_code' => $o->order_code,
            'package_id' => $o->package_id,
            'package_name' => $o->package?->name,
            'duration_label' => $o->package?->duration_label,
            'max_devices' => (int) ($o->package?->max_devices ?? 1),
            'customer_phone' => $o->customer_phone,
            'customer_name' => $o->customer_name,
            'base_amount' => (float) $o->base_amount,
            'qris_unique_code' => $o->qris_unique_code,
            'qris_expected_amount' => $o->qris_expected_amount ? (float) $o->qris_expected_amount : null,
            'status' => $o->status,
            'voucher_code' => $o->voucher_code,
            'voucher_status' => $o->voucher_status,
            'mikrotik_synced' => $o->mikrotik_synced_at !== null,
            'mikrotik_synced_at' => $o->mikrotik_synced_at?->toIso8601String(),
            'mikrotik_error' => data_get($o->meta, 'mikrotik_error'),
            'whatsapp_sent_at' => $o->whatsapp_sent_at?->toIso8601String(),
            'paid_at' => $o->paid_at?->toIso8601String(),
            'qris_expired_at' => $o->qris_expired_at?->toIso8601String(),
            'settled_via' => data_get($o->meta, 'settled_via', 'qris'),
            'created_at' => $o->created_at?->toIso8601String(),
        ])->values();

        $todayWib = now('Asia/Jakarta')->toDateString();
        $paidBaseQuery = HotspotVoucherOrder::query()->where('status', HotspotVoucherOrder::STATUS_PAID);

        $summary = [
            'total_sold' => (clone $paidBaseQuery)->count(),
            'total_revenue' => (float) (clone $paidBaseQuery)->sum('base_amount'),
            'today_sold' => (clone $paidBaseQuery)->whereDate('paid_at', $todayWib)->count(),
            'today_revenue' => (float) (clone $paidBaseQuery)->whereDate('paid_at', $todayWib)->sum('base_amount'),
            'pending_orders' => HotspotVoucherOrder::query()->where('status', HotspotVoucherOrder::STATUS_PENDING)->count(),
            'failed_sync_orders' => HotspotVoucherOrder::query()
                ->where('status', HotspotVoucherOrder::STATUS_PAID)
                ->whereNull('mikrotik_synced_at')
                ->count(),
            'active_packages' => HotspotVoucherPackage::query()->where('is_active', true)->count(),
        ];

        return response()->json([
            'summary' => $summary,
            'packages' => $packages,
            'orders' => $orders,
            'qris_ready' => trim($this->qrisService->getStaticPayload()) !== '',
        ]);
    }

    /**
     * ADMIN: Tambah paket voucher baru + sync ke MikroTik User Profile.
     */
    public function storePackage(Request $request): JsonResponse
    {
        $data = $this->validatePackageRequest($request);
        $code = Str::slug($data['name']) ?: 'paket-' . Str::lower(Str::random(5));
        $baseCode = $code;
        $counter = 1;
        while (HotspotVoucherPackage::where('code', $code)->exists()) {
            $code = $baseCode . '-' . (++$counter);
        }

        $profileName = 'vc-' . Str::slug($code);

        $package = HotspotVoucherPackage::create([
            'name' => $data['name'],
            'code' => $code,
            'mikrotik_profile_name' => $profileName,
            'hotspot_server' => 'hotspot1',
            'price' => $data['price'],
            'duration_minutes' => $data['duration_minutes'],
            'max_devices' => $data['max_devices'],
            'rate_limit' => $data['rate_limit'],
            'description' => $data['description'],
            'is_active' => $data['is_active'],
            'sort_order' => $data['sort_order'],
        ]);

        $syncResult = $this->voucherService->syncPackageProfileToMikroTik($package);

        return response()->json([
            'message' => 'Paket voucher berhasil ditambahkan.',
            'package' => $package,
            'mikrotik_sync' => $syncResult,
        ], 201);
    }

    /**
     * ADMIN: Update paket voucher + sync ke MikroTik User Profile.
     */
    public function updatePackage(Request $request, HotspotVoucherPackage $package): JsonResponse
    {
        $data = $this->validatePackageRequest($request);

        $package->update([
            'name' => $data['name'],
            'price' => $data['price'],
            'duration_minutes' => $data['duration_minutes'],
            'max_devices' => $data['max_devices'],
            'rate_limit' => $data['rate_limit'],
            'description' => $data['description'],
            'is_active' => $data['is_active'],
            'sort_order' => $data['sort_order'],
        ]);

        $syncResult = $this->voucherService->syncPackageProfileToMikroTik($package);

        return response()->json([
            'message' => 'Paket voucher berhasil diperbarui.',
            'package' => $package->fresh(),
            'mikrotik_sync' => $syncResult,
        ]);
    }

    /**
     * ADMIN: Hapus atau nonaktifkan paket voucher.
     */
    public function destroyPackage(HotspotVoucherPackage $package): JsonResponse
    {
        if ($package->orders()->exists()) {
            $package->update(['is_active' => false]);
            return response()->json([
                'message' => 'Paket sudah memiliki riwayat transaksi sehingga dinonaktifkan (bukan dihapus permanen).',
                'deactivated' => true,
            ]);
        }

        $package->delete();

        return response()->json([
            'message' => 'Paket voucher berhasil dihapus.',
            'deleted' => true,
        ]);
    }

    /**
     * ADMIN: Sinkronisasi ulang profil paket ke MikroTik.
     */
    public function syncPackageProfile(HotspotVoucherPackage $package): JsonResponse
    {
        $result = $this->voucherService->syncPackageProfileToMikroTik($package);

        return response()->json([
            'message' => ($result['success'] ?? false)
                ? "Profil MikroTik '{$package->mikrotik_profile_name}' berhasil disinkronkan."
                : ('Gagal sinkronisasi profil ke MikroTik: ' . ($result['error'] ?? 'Unknown error')),
            'mikrotik_sync' => $result,
        ], ($result['success'] ?? false) ? 200 : 422);
    }

    /**
     * ADMIN: Konfirmasi manual pembayaran pesanan voucher (misal saat MacroDroid timeout).
     */
    public function confirmOrderManual(Request $request, HotspotVoucherOrder $order): JsonResponse
    {
        if ($order->status === HotspotVoucherOrder::STATUS_PAID) {
            return response()->json([
                'message' => 'Pesanan ini sudah berstatus lunas.',
                'order' => $order,
            ]);
        }

        $paidAmount = (float) ($order->qris_expected_amount ?: $order->base_amount);
        $actorName = $request->user()?->name ?: 'Admin';

        $result = $this->voucherService->settleOrder(
            $order,
            $paidAmount,
            ['sender' => $actorName, 'reference_code' => 'MANUAL-' . strtoupper(Str::random(6))],
            "Manual Admin ({$actorName})",
            false
        );

        return response()->json([
            'message' => "Pesanan {$order->order_code} berhasil dikonfirmasi lunas. Kode voucher: {$result['voucher_code']}",
            'result' => $result,
            'order' => $order->fresh('package'),
        ]);
    }

    /**
     * ADMIN: Kirim ulang kode voucher ke WhatsApp pelanggan.
     */
    public function resendOrderWhatsApp(HotspotVoucherOrder $order): JsonResponse
    {
        if ($order->status !== HotspotVoucherOrder::STATUS_PAID) {
            return response()->json([
                'message' => 'Kode voucher hanya dapat dikirim untuk pesanan yang sudah lunas.',
            ], 422);
        }

        $sent = $this->voucherService->sendVoucherWhatsApp($order);

        return response()->json([
            'message' => $sent
                ? "Kode voucher {$order->voucher_code} berhasil dikirim ulang ke {$order->customer_phone}."
                : 'Gagal mengirim pesan WhatsApp. Pastikan WhatsApp Gateway aktif.',
            'whatsapp_sent' => $sent,
        ], $sent ? 200 : 422);
    }

    /**
     * ADMIN: Coba ulang pendaftaran voucher ke MikroTik jika sebelumnya gagal.
     */
    public function retryOrderMikroTik(HotspotVoucherOrder $order): JsonResponse
    {
        if ($order->status !== HotspotVoucherOrder::STATUS_PAID) {
            return response()->json([
                'message' => 'Hanya pesanan yang sudah lunas yang bisa didaftarkan ke MikroTik.',
            ], 422);
        }

        $result = $this->voucherService->syncOrderToMikroTik($order);
        $synced = (bool) ($result['success'] ?? false);

        return response()->json([
            'message' => $synced
                ? "Voucher {$order->voucher_code} berhasil didaftarkan ke MikroTik."
                : ('Gagal mendaftarkan ke MikroTik: ' . ($result['error'] ?? data_get($order->fresh()?->meta, 'mikrotik_error') ?: 'Unknown error')),
            'mikrotik_synced' => $synced,
            'order' => $order->fresh('package'),
        ], $synced ? 200 : 422);
    }

    /**
     * ADMIN: Generate voucher manual (penjualan tunai/counter) + opsional kirim WA.
     */
    public function generateManualVoucher(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'package_id' => ['required', 'integer', 'exists:hotspot_voucher_packages,id'],
            'customer_phone' => ['nullable', 'string', 'max:25'],
            'customer_name' => ['nullable', 'string', 'max:120'],
            'send_whatsapp' => ['nullable', 'boolean'],
        ]);

        $package = HotspotVoucherPackage::findOrFail($validated['package_id']);

        $result = $this->voucherService->createManualVoucher(
            $package,
            (bool) ($validated['send_whatsapp'] ?? true) ? (string) ($validated['customer_phone'] ?? '') : '',
            $validated['customer_name'] ?? null,
            $request->user()?->name ?: 'Admin'
        );

        return response()->json([
            'message' => "Voucher manual {$result['voucher_code']} berhasil dibuat.",
            'result' => $result,
        ], 201);
    }

    /**
     * ADMIN: Ambil template HTML Hotspot MikroTik & script Walled Garden RouterOS v7.
     */
    public function mikrotikTemplate(): JsonResponse
    {
        $baseDir = public_path('mikrotik-hotspot');
        $fileNames = ['login.html', 'status.html', 'alogin.html', 'logout.html', 'error.html'];
        $files = [];

        foreach ($fileNames as $name) {
            $path = $baseDir . DIRECTORY_SEPARATOR . $name;
            $files[] = [
                'name' => $name,
                'exists' => File::exists($path),
                'download_url' => url('mikrotik-hotspot/' . $name),
                'content' => File::exists($path) ? File::get($path) : '',
            ];
        }

        $appUrl = rtrim((string) config('app.url', 'https://rumahkitanet.my.id'), '/');
        $parsedHost = parse_url($appUrl, PHP_URL_HOST) ?: 'rumahkitanet.my.id';

        $walledGardenCli = <<<CLI
# 1. Izinkan halaman pembelian voucher (Ubuntu) diakses SEBELUM login hotspot
/ip hotspot walled-garden
add dst-host={$parsedHost} action=allow comment="Rumah Kita Net - Beli Voucher"
add dst-host=*.{$parsedHost} action=allow comment="Rumah Kita Net - Subdomain"

# 2. WAJIB untuk akses HTTPS (port 443) agar tidak ERR_SSL_PROTOCOL_ERROR sebelum login:
/ip hotspot walled-garden ip
add dst-address=10.1.0.5 action=accept comment="Server Pembayaran Ubuntu (Local)"
add dst-host={$parsedHost} action=accept comment="HTTPS Beli Voucher ({$parsedHost})"

# 3. Split DNS lokal agar klien hotspot langsung akses server 10.1.0.5 (lebih cepat & tanpa Hairpin NAT):
/ip dns static
add name={$parsedHost} address=10.1.0.5 comment="Local DNS Server Pembayaran"

# 3. Pastikan DNS Name pada Server Profile hsprof1 adalah rumahkita.id
#    dan HTML Directory mengarah ke folder "hotspot" (tempat upload file login.html)
/ip hotspot profile set [find name="hsprof1"] dns-name=rumahkita.id html-directory=hotspot
CLI;

        return response()->json([
            'app_host' => $parsedHost,
            'buy_url' => $appUrl . '/hotspot/beli',
            'hotspot_dns' => 'rumahkita.id',
            'walled_garden_cli' => $walledGardenCli,
            'files' => $files,
        ]);
    }

    /**
     * PUBLIC: Daftar titik lokasi WiFi Voucher Hotspot yang tersedia (TANPA nama pelanggan).
     */
    public function publicLocations(): JsonResponse
    {
        if (!Schema::hasTable('hotspot_locations')) {
            return response()->json(['locations' => []]);
        }

        $locations = HotspotLocation::query()
            ->where('is_active', true)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderBy('id')
            ->get()
            ->values()
            ->map(function (HotspotLocation $loc, int $idx) {
                $cleanLabel = trim((string) ($loc->label ?? ''));
                return [
                    'id' => $loc->id,
                    'label' => $cleanLabel !== '' ? $cleanLabel : ('Titik WiFi Hotspot #' . ($idx + 1)),
                    'latitude' => (float) $loc->latitude,
                    'longitude' => (float) $loc->longitude,
                ];
            });

        return response()->json([
            'locations' => $locations,
        ]);
    }

    /**
     * ADMIN: Daftar titik WiFi Hotspot terpasang + daftar titik pelanggan berkoordinat untuk dipilih.
     */
    public function adminLocations(Request $request): JsonResponse
    {
        if (!Schema::hasTable('hotspot_locations')) {
            return response()->json([
                'locations' => [],
                'customers' => [],
            ]);
        }

        $search = trim((string) $request->query('search', ''));

        $locations = HotspotLocation::query()
            ->with(['customer.dusun', 'customer.desa', 'customer.kecamatan'])
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->get()
            ->map(fn (HotspotLocation $loc) => [
                'id' => $loc->id,
                'customer_id' => $loc->customer_id,
                'customer_name' => $loc->customer?->name,
                'customer_wilayah' => $loc->customer?->wilayah_lengkap,
                'label' => $loc->label,
                'latitude' => (float) $loc->latitude,
                'longitude' => (float) $loc->longitude,
                'is_active' => (bool) $loc->is_active,
                'notes' => $loc->notes,
            ])
            ->values();

        $installedCustomerIds = $locations
            ->filter(fn ($l) => $l['customer_id'] !== null && $l['is_active'])
            ->pluck('customer_id')
            ->flip();

        $customers = Customer::query()
            ->with(['dusun', 'desa', 'kecamatan'])
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->where('latitude', '!=', 0)
            ->where('longitude', '!=', 0)
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . $search . '%';
                $q->where(function ($sub) use ($like) {
                    $sub->where('name', 'like', $like)
                        ->orWhere('pppoe_username', 'like', $like)
                        ->orWhere('address', 'like', $like);
                });
            })
            ->orderBy('name')
            ->limit(250)
            ->get()
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'pppoe_username' => $c->pppoe_username,
                'wilayah' => $c->wilayah_lengkap,
                'latitude' => (float) $c->latitude,
                'longitude' => (float) $c->longitude,
                'is_hotspot_installed' => $installedCustomerIds->has($c->id),
            ])
            ->values();

        return response()->json([
            'locations' => $locations,
            'customers' => $customers,
        ]);
    }

    /**
     * ADMIN: Aktifkan / nonaktifkan titik pelanggan sebagai titik WiFi Voucher Hotspot.
     */
    public function toggleCustomerLocation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'enabled' => ['required', 'boolean'],
            'label' => ['nullable', 'string', 'max:150'],
        ]);

        $customer = Customer::with(['dusun', 'desa', 'kecamatan'])->findOrFail($validated['customer_id']);

        if (!$validated['enabled']) {
            HotspotLocation::where('customer_id', $customer->id)->delete();

            return response()->json([
                'message' => 'Titik WiFi Hotspot berhasil dinonaktifkan dari peta publik.',
                'enabled' => false,
            ]);
        }

        if (!$customer->latitude || !$customer->longitude) {
            return response()->json([
                'message' => 'Pelanggan ini belum memiliki koordinat latitude/longitude.',
            ], 422);
        }

        // Default label publik HANYA menggunakan wilayah (TANPA nama pelanggan)
        $wilayah = trim((string) $customer->wilayah_lengkap);
        $defaultPublicLabel = ($wilayah !== '' && $wilayah !== '-')
            ? 'Area ' . $wilayah
            : 'Titik WiFi Hotspot';

        $label = isset($validated['label']) && trim((string) $validated['label']) !== ''
            ? trim((string) $validated['label'])
            : $defaultPublicLabel;

        $location = HotspotLocation::updateOrCreate(
            ['customer_id' => $customer->id],
            [
                'label' => $label,
                'latitude' => (float) $customer->latitude,
                'longitude' => (float) $customer->longitude,
                'is_active' => true,
            ]
        );

        return response()->json([
            'message' => 'Titik WiFi Hotspot berhasil ditampilkan di peta publik (tanpa nama pelanggan).',
            'enabled' => true,
            'location' => $location,
        ]);
    }

    /**
     * ADMIN: Perbarui label publik / status aktif titik WiFi Hotspot.
     */
    public function updateLocation(Request $request, HotspotLocation $location): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['nullable', 'string', 'max:150'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $location->update([
            'label' => array_key_exists('label', $validated) ? (trim((string) $validated['label']) ?: null) : $location->label,
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : $location->is_active,
            'notes' => array_key_exists('notes', $validated) ? (trim((string) $validated['notes']) ?: null) : $location->notes,
        ]);

        return response()->json([
            'message' => 'Titik WiFi Hotspot berhasil diperbarui.',
            'location' => $location->fresh(),
        ]);
    }

    /**
     * ADMIN: Hapus titik WiFi Hotspot.
     */
    public function destroyLocation(HotspotLocation $location): JsonResponse
    {
        $location->delete();

        return response()->json([
            'message' => 'Titik WiFi Hotspot berhasil dihapus.',
        ]);
    }

    protected function validatePackageRequest(Request $request): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'price' => ['required', 'numeric', 'min:500'],
            'duration_minutes' => ['nullable', 'integer', 'min:5', 'max:525600'],
            'duration_value' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'duration_unit' => ['nullable', 'in:minutes,hours,days'],
            'max_devices' => ['required', 'integer', 'min:1', 'max:20'],
            'rate_limit' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
        ]);

        $minutes = (int) ($validated['duration_minutes'] ?? 0);
        if ($minutes <= 0) {
            $val = (int) ($validated['duration_value'] ?? 1);
            $unit = (string) ($validated['duration_unit'] ?? 'hours');
            $minutes = match ($unit) {
                'days' => $val * 1440,
                'hours' => $val * 60,
                default => $val,
            };
        }

        return [
            'name' => trim($validated['name']),
            'price' => round((float) $validated['price'], 2),
            'duration_minutes' => max(5, $minutes),
            'max_devices' => (int) $validated['max_devices'],
            'rate_limit' => isset($validated['rate_limit']) && trim((string) $validated['rate_limit']) !== ''
                ? trim((string) $validated['rate_limit'])
                : null,
            'description' => isset($validated['description']) && trim((string) $validated['description']) !== ''
                ? trim((string) $validated['description'])
                : null,
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
        ];
    }
}

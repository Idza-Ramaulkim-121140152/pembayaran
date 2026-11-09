<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\PaymentMethod;
use App\Services\DynamicQrisService;
use App\Services\MikroTikService;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class CustomerIsolationPortalController extends Controller
{
    public function __construct(
        private readonly DynamicQrisService $dynamicQrisService
    ) {
    }

    /**
     * Memeriksa status isolir dan tagihan pelanggan berdasarkan IP router atau pencarian manual.
     */
    public function check(Request $request): JsonResponse
    {
        try {
            $clientIp = $this->resolveClientIp($request);
            $searchQuery = trim((string) $request->input('search', ''));

            $matchedCustomer = null;
            $matchMethod = null;
            $pppoeUsername = null;

            // 1. Jika ada pencarian manual (No. HP atau ID PPPoE)
            if ($searchQuery !== '') {
                $cleanSearch = preg_replace('/\D/', '', $searchQuery);
                $matchedCustomer = Customer::query()
                    ->where(function ($q) use ($searchQuery, $cleanSearch) {
                        $q->where('pppoe_username', $searchQuery)
                          ->orWhere('name', 'like', "%{$searchQuery}%");
                        if (strlen($cleanSearch) >= 8) {
                            $q->orWhere('phone', 'like', "%{$cleanSearch}%");
                        }
                    })
                    ->first();

                if ($matchedCustomer) {
                    $matchMethod = 'manual_search';
                    $pppoeUsername = $matchedCustomer->pppoe_username;
                }
            }

            // 2. Jika belum ketemu, cocokkan IP address router pelanggan dengan Active PPPoE Connection MikroTik
            if (!$matchedCustomer && $clientIp && !in_array($clientIp, ['127.0.0.1', '::1'], true)) {
                $pppoeUsername = $this->resolvePppoeUsernameByIp($clientIp);

                if ($pppoeUsername) {
                    $matchedCustomer = Customer::where('pppoe_username', $pppoeUsername)->first();
                    $matchMethod = 'mikrotik_active_pppoe';
                }

                // Fallback pencocokan ke database Customer (jika IP tersimpan di data customer)
                if (!$matchedCustomer) {
                    $matchedCustomer = Customer::query()
                        ->where('ip_address', $clientIp)
                        ->orWhere('static_ip', $clientIp)
                        ->first();

                    if ($matchedCustomer) {
                        $matchMethod = 'database_ip';
                        $pppoeUsername = $matchedCustomer->pppoe_username;
                    }
                }
            }

            // 3. Jika pelanggan tidak ditemukan sama sekali
            if (!$matchedCustomer) {
                return response()->json([
                    'success' => true,
                    'matched' => false,
                    'client_ip' => $clientIp,
                    'message' => 'IP router Anda (' . $clientIp . ') belum terpetakan ke sesi PPPoE aktif. Silakan masukkan No. WhatsApp atau ID PPPoE Anda di bawah untuk melihat tagihan & QRIS.',
                ]);
            }

            // 4. Periksa apakah pelanggan benar-benar dalam status isolir atau memiliki tagihan tertunggak
            $isIsolated = (bool) (
                $matchedCustomer->is_service_isolated ||
                strtolower((string) $matchedCustomer->mikrotik_profile) === 'isolir'
            );

            // Periksa juga secret di MikroTik jika di DB belum ter-flag
            if (!$isIsolated && $pppoeUsername) {
                $isIsolated = $this->checkMikrotikSecretIsolated($pppoeUsername);
            }

            // Periksa juga apakah IP pelanggan terdaftar di address-list 'ip-isolir' MikroTik
            if (!$isIsolated && $clientIp) {
                try {
                    $mikrotik = new MikroTikService();
                    if ($mikrotik->isIpInAddressList($clientIp, 'ip-isolir')) {
                        $isIsolated = true;
                    }
                } catch (\Throwable) {
                    // Ignore
                }
            }

            // Ambil semua tagihan yang belum lunas
            $unpaidInvoices = Invoice::where('customer_id', $matchedCustomer->id)
                ->whereIn('status', ['unpaid', 'overdue', 'menunggu konfirmasi'])
                ->orderBy('due_date', 'asc')
                ->get();

            $totalUnpaidAmount = (float) $unpaidInvoices->sum('amount');
            $latestInvoice = $unpaidInvoices->first();

            // Pelanggan dianggap isolir jika ada tagihan overdue atau status isolir aktif
            if (!$isIsolated && $unpaidInvoices->isNotEmpty()) {
                $today = Carbon::today();
                foreach ($unpaidInvoices as $inv) {
                    if ($inv->due_date && Carbon::parse($inv->due_date)->startOfDay()->lt($today)) {
                        $isIsolated = true;
                        break;
                    }
                }
            }

            // 5. Generate Dynamic QRIS & Rincian Pembayaran jika ada tagihan
            $qrisData = null;
            if ($latestInvoice) {
                try {
                    $qrisData = $this->dynamicQrisService->generateForInvoice($latestInvoice);
                } catch (\Throwable $e) {
                    Log::warning('CustomerIsolationPortalController: Failed generating dynamic QRIS: ' . $e->getMessage());
                }
            }

            // Ambil daftar rekening pembayaran bank yang aktif
            $paymentMethods = PaymentMethod::where('is_active', true)
                ->orderBy('sort_order', 'asc')
                ->get([
                    'id', 'type', 'bank_name', 'account_name', 'account_number', 'instructions', 'is_default'
                ]);

            return response()->json([
                'success' => true,
                'matched' => true,
                'match_method' => $matchMethod,
                'client_ip' => $clientIp,
                'is_isolated' => $isIsolated,
                'customer' => [
                    'id' => $matchedCustomer->id,
                    'name' => $matchedCustomer->name,
                    'phone' => $matchedCustomer->phone,
                    'address' => $matchedCustomer->address,
                    'package_type' => $matchedCustomer->package_type,
                    'pppoe_username' => $matchedCustomer->pppoe_username ?: $pppoeUsername,
                    'due_date' => $matchedCustomer->due_date ? Carbon::parse($matchedCustomer->due_date)->format('Y-m-d') : null,
                ],
                'unpaid_count' => $unpaidInvoices->count(),
                'total_unpaid_amount' => $totalUnpaidAmount,
                'invoice' => $latestInvoice ? [
                    'id' => $latestInvoice->id,
                    'invoice_number' => $latestInvoice->invoice_number,
                    'invoice_link' => $latestInvoice->invoice_link,
                    'amount' => (float) $latestInvoice->amount,
                    'due_date' => $latestInvoice->due_date ? Carbon::parse($latestInvoice->due_date)->format('Y-m-d') : null,
                    'status' => $latestInvoice->status,
                    'notes' => $latestInvoice->notes,
                ] : null,
                'qris' => $qrisData,
                'payment_methods' => $paymentMethods,
                'cs_phone' => '6285158025553',
                'portal_url' => url('/portal-pelanggan/' . ($matchedCustomer->portal_token ?? '')),
            ]);

        } catch (Exception $e) {
            Log::error('CustomerIsolationPortalController check error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan sistem saat memeriksa status layanan: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Memeriksa status pembayaran invoice secara real-time dan melakukan unisolir otomatis jika sudah lunas.
     */
    public function checkPaymentStatus(Request $request): JsonResponse
    {
        $invoiceLink = (string) $request->input('invoice_link', '');
        $invoiceId = $request->input('invoice_id');

        if (!$invoiceLink && !$invoiceId) {
            return response()->json([
                'success' => false,
                'message' => 'ID tagihan atau link invoice diperlukan.',
            ], 422);
        }

        $query = Invoice::query()->with('customer');
        if ($invoiceLink) {
            $query->where('invoice_link', $invoiceLink);
        } else {
            $query->where('id', $invoiceId);
        }

        $invoice = $query->first();

        if (!$invoice) {
            return response()->json([
                'success' => false,
                'message' => 'Tagihan tidak ditemukan.',
            ], 404);
        }

        $isPaid = $invoice->status === 'paid';

        if ($isPaid) {
            // Lakukan pemulihan isolir otomatis (unisolir) jika pelanggan masih terisolir
            $customer = $invoice->customer;
            $unisolated = false;

            if ($customer) {
                $targetProfile = ($customer->mikrotik_profile && strtolower($customer->mikrotik_profile) !== 'isolir')
                    ? $customer->mikrotik_profile
                    : 'default';

                $username = trim((string) ($customer->pppoe_username ?: ''));
                if ($username !== '') {
                    try {
                        $mikrotik = new MikroTikService();
                        $mikrotik->unrestrictUser($username, $targetProfile);
                        $unisolated = true;
                    } catch (\Throwable $mEx) {
                        Log::warning("Auto unisolir on checkPaymentStatus failed for {$username}: " . $mEx->getMessage());
                    }
                }

                $customer->update([
                    'is_service_isolated' => false,
                    'mikrotik_profile' => $targetProfile,
                ]);
            }

            return response()->json([
                'success' => true,
                'is_paid' => true,
                'status' => 'paid',
                'unisolated' => $unisolated,
                'message' => '🎉 Pembayaran Anda telah LUNAS! Layanan internet Anda telah aktif kembali. Silakan hubungkan ulang perangkat Wi-Fi Anda.',
            ]);
        }

        return response()->json([
            'success' => true,
            'is_paid' => false,
            'status' => $invoice->status,
            'message' => 'Pembayaran belum terkonfirmasi. Jika Anda sudah transfer atau scan QRIS, sistem otomatis memverifikasi dalam 5-15 detik.',
        ]);
    }

    /**
     * Menyediakan script konfigurasi MikroTik RouterOS lengkap untuk NAT Redirect Isolir dan Gangguan Massal.
     */
    public function getMikrotikRulesScript(): JsonResponse
    {
        $serverIp = '10.1.0.5';
        $serverHttpPort = 80;
        $serverHttpsPort = 443;
        $isolirAddressList = 'ip-isolir';

        $script = <<<MIKROTIK_SCRIPT
# =========================================================================
# SCRIPT FIREWALL MIKROTIK: ISOLIR REDIRECT & GANGGUAN MASSAL
# RouterOS: v7.20.8 (x86 HP ProLiant DL380 G7)
# Router IP: 10.1.0.1  |  Ubuntu Server: 10.1.0.5
# Dynamic Address List: ip-isolir (dari profile PPP isolir)
# =========================================================================

# -------------------------------------------------------------------------
# LANGKAH 1: FIREWALL FILTER (Urutan Sangat Menentukan!)
# -------------------------------------------------------------------------
/ip firewall filter

# 1.1 Izinkan DNS (Port 53 UDP & TCP) agar browser HP pelanggan dapat resolve Captive Portal
add chain=forward protocol=udp dst-port=53 src-address-list="{$isolirAddressList}" \
    action=accept comment="1. ISOLIR: ALLOW DNS UDP" place-before=0

add chain=forward protocol=tcp dst-port=53 src-address-list="{$isolirAddressList}" \
    action=accept comment="2. ISOLIR: ALLOW DNS TCP" place-before=1

# 1.2 Izinkan Akses Penuh ke Server Ubuntu (10.1.0.5) untuk Halaman Pembayaran & QRIS
add chain=forward dst-address={$serverIp} src-address-list="{$isolirAddressList}" \
    action=accept comment="3. ISOLIR: ALLOW WEB SERVER 10.1.0.5" place-before=2

# 1.3 Tolak HTTPS (Port 443) dengan TCP-RESET agar HP langsung memicu Pop-up Captive Portal seketika
add chain=forward protocol=tcp dst-port=443 src-address-list="{$isolirAddressList}" \
    action=reject reject-with=tcp-reset comment="4. ISOLIR: REJECT HTTPS INSTANT RST" place-before=3

# 1.4 Blokir SEMUA sisa internet pelanggan isolir (internet mati, akses portal pembayaran lancar)
add chain=forward src-address-list="{$isolirAddressList}" \
    action=drop comment="5. ISOLIR: DROP ALL OTHER INTERNET" place-before=4


# -------------------------------------------------------------------------
# LANGKAH 2: FIREWALL NAT REDIRECT ISOLIR (Pilih Metode A atau B)
# -------------------------------------------------------------------------

# METODE A: WEB-PROXY 302 REDIRECT (SANGAT DIREKOMENDASIKAN)
# Keunggulan: Otomatis mengubah URL di browser pelanggan menjadi "http://10.1.0.5/isolir"
/ip proxy set enabled=yes port=8080 max-cache-size=none
/ip proxy access
add action=deny redirect-to="{$serverIp}/isolir" src-address-list="{$isolirAddressList}" \
    comment="REDIRECT HTTP ISOLIR KE PORTAL" place-before=0
add action=deny redirect-to="{$serverIp}/gangguan" src-address-list=!"{$isolirAddressList}" dst-host=!{$serverIp} \
    comment="REDIRECT GANGGUAN MASSAL" disabled=yes place-before=1

/ip firewall nat
add chain=dstnat protocol=tcp dst-port=80 src-address-list="{$isolirAddressList}" dst-address=!{$serverIp} \
    action=redirect to-ports=8080 comment="REDIRECT ISOLIR VIA PROXY 8080" place-before=0


# METODE B (ALTERNATIF): DST-NAT LANGSUNG KE 10.1.0.5:80 (Jika tidak memakai Web-Proxy)
# /ip firewall nat add chain=dstnat protocol=tcp dst-port=80 src-address-list="{$isolirAddressList}" dst-address=!{$serverIp} action=dst-nat to-addresses={$serverIp} to-ports={$serverHttpPort} comment="REDIRECT ISOLIR DST-NAT" place-before=0


# -------------------------------------------------------------------------
# LANGKAH 3: GANGGUAN MASSAL OTOMATIS (NETWATCH ROUTEROS V7)
# -------------------------------------------------------------------------

# Rule NAT Gangguan Massal (Otomatis aktif saat upline down, kecuali pelanggan isolir)
/ip firewall nat
add chain=dstnat protocol=tcp dst-port=80 src-address-list=!"{$isolirAddressList}" dst-address=!{$serverIp} \
    action=redirect to-ports=8080 comment="PROXY REDIRECT GANGGUAN MASSAL" disabled=yes place-before=1

# Netwatch RouterOS v7 memantau IP Upline Internet (8.8.8.8)
/tool netwatch
add host=8.8.8.8 type=icmp interval=10s timeout=2s comment="MONITOR UPLINE INTERNET" \
    down-script='/ip firewall nat enable [find comment="PROXY REDIRECT GANGGUAN MASSAL"]; /ip proxy access enable [find comment="REDIRECT GANGGUAN MASSAL"]; :log error "UPLINE INTERNET DOWN: REDIRECT GANGGUAN MASSAL DIAKTIFKAN"' \
    up-script='/ip firewall nat disable [find comment="PROXY REDIRECT GANGGUAN MASSAL"]; /ip proxy access disable [find comment="REDIRECT GANGGUAN MASSAL"]; :log info "UPLINE INTERNET PULIH: REDIRECT GANGGUAN DINONAKTIFKAN"'
MIKROTIK_SCRIPT;

        return response()->json([
            'success' => true,
            'server_ip' => $serverIp,
            'server_port' => $serverHttpPort,
            'isolir_address_list' => $isolirAddressList,
            'script' => $script,
        ]);
    }

    /**
     * Resolusi client IP dari request, menghandle proxy / reverse proxy header.
     */
    private function resolveClientIp(Request $request): string
    {
        $candidate = (string) $request->input('ip', '');
        if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP)) {
            return $candidate;
        }

        $forwarded = $request->header('X-Forwarded-For');
        if ($forwarded) {
            $parts = explode(',', $forwarded);
            $first = trim($parts[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }

        $realIp = $request->header('X-Real-IP');
        if ($realIp && filter_var($realIp, FILTER_VALIDATE_IP)) {
            return $realIp;
        }

        return (string) $request->ip();
    }

    /**
     * Mencari PPPoE username dari MikroTik active connections berdasarkan IP client.
     */
    private function resolvePppoeUsernameByIp(string $ip): ?string
    {
        try {
            $actives = Cache::remember('mikrotik:active_pppoe_by_ip_' . md5($ip), 10, function () use ($ip) {
                $mikrotik = new MikroTikService();
                $all = $mikrotik->getActivePPPoEConnections(false) ?? [];

                foreach ($all as $item) {
                    $itemIp = trim((string) ($item['address'] ?? ''));
                    if ($itemIp === $ip) {
                        return trim((string) ($item['name'] ?? ''));
                    }
                }

                return null;
            });

            return $actives;
        } catch (\Throwable $e) {
            Log::warning('CustomerIsolationPortalController resolvePppoeUsernameByIp error: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Cek apakah secret PPPoE di MikroTik saat ini berprofil 'isolir'.
     */
    private function checkMikrotikSecretIsolated(string $username): bool
    {
        try {
            $mikrotik = new MikroTikService();
            $secret = $mikrotik->getPPPoESecret($username);
            if ($secret && strtolower((string) ($secret['profile'] ?? '')) === 'isolir') {
                return true;
            }
        } catch (\Throwable) {
            // Ignore if MikroTik unreachable
        }

        return false;
    }
}

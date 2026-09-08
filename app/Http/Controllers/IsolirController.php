<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\NotificationLog;
use App\Services\MikroTikService;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class IsolirController extends Controller
{
    /**
     * Get all isolated devices (secrets with profile "isolir" from MikroTik)
     * Enriched with customer details and dismantle notification history.
     */
    public function index(Request $request)
    {
        try {
            $isolatedSecrets = [];
            try {
                $isolatedSecrets = Cache::remember('mikrotik:isolated_secrets_raw', 45, function () {
                    $mikrotik = new MikroTikService();
                    return $mikrotik->getIsolatedSecrets() ?? [];
                });
            } catch (Exception $e) {
                Log::warning('IsolirController: Failed to get isolated secrets from MikroTik: ' . $e->getMessage());
            }

            // Fallback to customers marked isolated if MikroTik returned no secrets
            if (empty($isolatedSecrets)) {
                $isolatedCustomers = Customer::where('is_service_isolated', true)
                    ->orWhere('mikrotik_profile', 'isolir')
                    ->get();
                foreach ($isolatedCustomers as $c) {
                    $u = $c->pppoe_username ?: $c->name;
                    $isolatedSecrets[] = [
                        'name' => $u,
                        'password' => '***',
                        'profile' => 'isolir',
                        'remote_address' => null,
                        'service' => 'pppoe',
                        'disabled' => 'false',
                    ];
                }
            }

            $usernames = collect($isolatedSecrets)
                ->pluck('name')
                ->map(fn ($name) => trim((string) $name))
                ->filter()
                ->values()
                ->all();

            $customersByUsername = Customer::whereIn('pppoe_username', $usernames)
                ->get()
                ->keyBy(fn ($c) => strtolower(trim((string) $c->pppoe_username)));

            // Query notification logs for dismantle notices
            $customerIds = $customersByUsername->pluck('id')->filter()->values()->all();
            $usernamesLower = array_map('strtolower', $usernames);

            $dismantleLogs = NotificationLog::where(function ($q) use ($customerIds, $usernamesLower) {
                if (!empty($customerIds)) {
                    $q->whereIn('customer_id', $customerIds);
                }
                if (!empty($usernamesLower)) {
                    $q->orWhere(function ($sub) use ($usernamesLower) {
                        $sub->where('meta->type', 'pencopotan_alat');
                    });
                }
            })
            ->where(function ($q) {
                $q->where('meta->type', 'pencopotan_alat')
                  ->orWhere('message', 'like', '%pencopotan%')
                  ->orWhere('message', 'like', '%penarikan%');
            })
            ->orderBy('sent_at', 'desc')
            ->get();

            $logsByCustomerId = $dismantleLogs->whereNotNull('customer_id')->groupBy('customer_id');
            $logsByUsername = $dismantleLogs->groupBy(fn ($item) => strtolower(trim((string) ($item->meta['pppoe_username'] ?? ''))));

            // Enrich with customer data and dismantle history
            $enrichedData = [];
            foreach ($isolatedSecrets as $secret) {
                $username = (string) ($secret['name'] ?? '');
                $normalizedUsername = strtolower(trim($username));
                $customer = $customersByUsername->get($normalizedUsername);

                // Match logs
                $matchedLogs = collect();
                if ($customer && isset($logsByCustomerId[$customer->id])) {
                    $matchedLogs = $matchedLogs->merge($logsByCustomerId[$customer->id]);
                }
                if (isset($logsByUsername[$normalizedUsername])) {
                    $matchedLogs = $matchedLogs->merge($logsByUsername[$normalizedUsername]);
                }
                $matchedLogs = $matchedLogs->unique('id')->sortByDesc('sent_at')->values();

                $lastLog = $matchedLogs->first();
                $lastNotice = $lastLog ? [
                    'id' => $lastLog->id,
                    'sent_at' => $lastLog->sent_at?->format('Y-m-d H:i:s'),
                    'sent_at_human' => $lastLog->sent_at ? $lastLog->sent_at->translatedFormat('d M Y H:i') . ' WIB' : '-',
                    'status' => $lastLog->status,
                    'phone' => $lastLog->phone,
                    'sent_by' => $lastLog->meta['sent_by'] ?? 'Admin',
                    'message' => $lastLog->message,
                    'error' => $lastLog->error,
                ] : null;

                $history = $matchedLogs->map(fn ($log) => [
                    'id' => $log->id,
                    'sent_at' => $log->sent_at?->format('Y-m-d H:i:s'),
                    'sent_at_human' => $log->sent_at ? $log->sent_at->translatedFormat('d M Y H:i') . ' WIB' : '-',
                    'status' => $log->status,
                    'phone' => $log->phone,
                    'sent_by' => $log->meta['sent_by'] ?? 'Admin',
                    'message' => $log->message,
                    'error' => $log->error,
                ])->all();

                $enrichedData[] = [
                    'username' => $username,
                    'password' => $secret['password'] ?? '',
                    'profile' => $secret['profile'] ?? '',
                    'remote_address' => $secret['remote_address'] ?? null,
                    'service' => $secret['service'] ?? null,
                    'disabled' => $secret['disabled'] ?? null,
                    'customer' => $customer ? [
                        'id' => $customer->id,
                        'name' => $customer->name,
                        'phone' => $customer->phone,
                        'address' => $customer->address,
                        'package_type' => $customer->package_type,
                        'due_date' => $customer->due_date,
                    ] : null,
                    'last_dismantle_notice' => $lastNotice,
                    'dismantle_history' => $history,
                    'dismantle_count' => count($history),
                ];
            }

            // Return JSON for API
            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => true,
                    'data' => $enrichedData,
                    'count' => count($enrichedData),
                ]);
            }

            // Return view for web (if accessed directly)
            return view('isolir.index', ['isolatedDevices' => $enrichedData]);

        } catch (Exception $e) {
            Log::error('Failed to get isolated devices', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal mengambil data perangkat isolir: ' . $e->getMessage(),
                ], 500);
            }

            return back()->with('error', 'Gagal mengambil data perangkat isolir: ' . $e->getMessage());
        }
    }

    /**
     * Send equipment dismantling WhatsApp notice to customer
     */
    public function sendDismantleNotice(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'phone' => 'nullable|string',
            'custom_message' => 'nullable|string|max:3000',
        ]);

        $username = trim($validated['username']);
        $customer = null;

        if (!empty($validated['customer_id'])) {
            $customer = Customer::find($validated['customer_id']);
        }

        if (!$customer) {
            $customer = Customer::where('pppoe_username', $username)->first();
        }

        $phone = trim((string) ($validated['phone'] ?? ($customer?->phone ?? '')));
        $cleanPhone = preg_replace('/\D/', '', $phone);

        if (empty($cleanPhone) || strlen($cleanPhone) < 9) {
            return response()->json([
                'success' => false,
                'message' => 'Nomor WhatsApp pelanggan tidak valid atau belum diisi.',
            ], 422);
        }

        $customerName = $customer?->name ?: $username;
        $address = $customer?->address ?: '-';
        $package = $customer?->package_type ?: '-';

        // Prepare message
        $message = !empty($validated['custom_message'])
            ? trim($validated['custom_message'])
            : $this->buildDefaultDismantleMessage($customerName, $username, $address, $package);

        // Send via WhatsApp Gateway
        $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
        $status = 'failed';
        $errorMessage = null;
        $gatewayPayload = null;

        try {
            $response = Http::timeout(25)->post($gatewayUrl . '/send', [
                'phone' => $phone,
                'name' => $customerName,
                'message' => $message,
            ]);

            if ($response->successful()) {
                $gatewayPayload = $response->json();
                if (is_array($gatewayPayload) && array_key_exists('success', $gatewayPayload) && !$gatewayPayload['success']) {
                    $status = 'failed';
                    $errorMessage = (string) ($gatewayPayload['error'] ?? $gatewayPayload['message'] ?? 'Gateway menolak pesan');
                } else {
                    $status = 'sent';
                }
            } else {
                $status = 'failed';
                $errorMessage = 'WhatsApp Gateway HTTP ' . $response->status();
            }
        } catch (Exception $e) {
            $status = 'failed';
            $errorMessage = 'Gagal terhubung ke WhatsApp Gateway: ' . $e->getMessage();
            Log::warning('IsolirController: WA send failed: ' . $e->getMessage());
        }

        // Save to NotificationLog
        $currentUser = auth()->user();
        $senderName = $currentUser?->name ?? 'Admin';

        $log = NotificationLog::create([
            'customer_id' => $customer?->id,
            'phone' => $phone,
            'message' => mb_substr($message, 0, 2000),
            'notice_id' => null,
            'status' => $status,
            'error' => $errorMessage,
            'meta' => [
                'type' => 'pencopotan_alat',
                'channel' => 'whatsapp',
                'pppoe_username' => $username,
                'customer_name' => $customerName,
                'sent_by' => $senderName,
                'sent_by_id' => $currentUser?->id,
                'gateway_response' => $gatewayPayload,
            ],
            'sent_at' => now(),
        ]);

        $logData = [
            'id' => $log->id,
            'sent_at' => $log->sent_at->format('Y-m-d H:i:s'),
            'sent_at_human' => $log->sent_at->translatedFormat('d M Y H:i') . ' WIB',
            'status' => $log->status,
            'phone' => $log->phone,
            'sent_by' => $senderName,
            'message' => $log->message,
            'error' => $log->error,
        ];

        if ($status === 'sent') {
            return response()->json([
                'success' => true,
                'message' => "Pemberitahuan pencopotan alat berhasil dikirim ke {$customerName} ({$phone}).",
                'log' => $logData,
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => "Gagal mengirim WhatsApp: {$errorMessage}. Catatan pengiriman tetap disimpan ke riwayat.",
            'log' => $logData,
        ], 502);
    }

    /**
     * Get dismantle notification history for a customer or username
     */
    public function dismantleHistory(Request $request, $identifier): JsonResponse
    {
        $logs = NotificationLog::where(function ($q) use ($identifier) {
            if (is_numeric($identifier)) {
                $q->where('customer_id', (int) $identifier);
            }
            $q->orWhere('meta->pppoe_username', $identifier);
        })
        ->where(function ($q) {
            $q->where('meta->type', 'pencopotan_alat')
              ->orWhere('message', 'like', '%pencopotan%')
              ->orWhere('message', 'like', '%penarikan%');
        })
        ->orderBy('sent_at', 'desc')
        ->get();

        $history = $logs->map(fn ($log) => [
            'id' => $log->id,
            'sent_at' => $log->sent_at?->format('Y-m-d H:i:s'),
            'sent_at_human' => $log->sent_at ? $log->sent_at->translatedFormat('d M Y H:i') . ' WIB' : '-',
            'status' => $log->status,
            'phone' => $log->phone,
            'sent_by' => $log->meta['sent_by'] ?? 'Admin',
            'message' => $log->message,
            'error' => $log->error,
        ]);

        return response()->json([
            'success' => true,
            'data' => $history,
            'count' => count($history),
        ]);
    }

    /**
     * Build default message template for dismantling notice
     */
    public function defaultMessage(Request $request): JsonResponse
    {
        $name = (string) $request->input('name', 'Pelanggan');
        $username = (string) $request->input('username', '-');
        $address = (string) $request->input('address', '-');
        $package = (string) $request->input('package', '-');

        $message = $this->buildDefaultDismantleMessage($name, $username, $address, $package);

        return response()->json([
            'success' => true,
            'message' => $message,
        ]);
    }

    private function buildDefaultDismantleMessage(string $name, string $username, string $address, string $package): string
    {
        return "Halo *{$name}*,\n\n"
            . "Pemberitahuan dari *Rumah Kita Network*.\n\n"
            . "Sehubungan dengan status layanan internet Anda yang saat ini telah terisolir dan belum ada konfirmasi pembayaran tagihan, kami menginformasikan bahwa tim teknisi kami dijadwalkan untuk melakukan *penarikan / pencopotan perangkat* (Modem ONT & adaptor) yang terpasang di lokasi Anda:\n\n"
            . "👤 *Nama Pelanggan:* {$name}\n"
            . "🏠 *Alamat:* {$address}\n"
            . "📦 *Paket Layanan:* {$package}\n"
            . "🔑 *ID / User PPPoE:* {$username}\n\n"
            . "Apabila Anda masih ingin melanjutkan layanan internet atau telah menyelesaikan pembayaran tagihan, mohon segera hubungi admin kami untuk konfirmasi dan pembatalan jadwal pencopotan alat.\n\n"
            . "Terima kasih atas perhatian dan kerjasamanya.\n\n"
            . "_Rumah Kita Network_";
    }
}
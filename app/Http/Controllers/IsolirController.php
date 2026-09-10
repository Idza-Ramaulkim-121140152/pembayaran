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
     * and customers with overdue payments.
     * Enriched with customer details, unpaid invoice stats, and notification history.
     */
    public function index(Request $request)
    {
        try {
            $today = Carbon::today();
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

            $isolatedSecretMap = [];
            foreach ($isolatedSecrets as $sec) {
                $u = strtolower(trim((string)($sec['name'] ?? '')));
                if ($u !== '') {
                    $isolatedSecretMap[$u] = $sec;
                }
            }

            // Query relevant customers: either isolated OR overdue (customer due_date < today or unpaid invoice due_date < today)
            $relevantCustomers = Customer::query()
                ->with([
                    'invoices' => function ($iq) {
                        $iq->whereIn('status', ['unpaid', 'UNPAID', 'overdue', 'OVERDUE', 'menunggu konfirmasi'])
                           ->orderBy('due_date', 'asc');
                    }
                ])
                ->where(function ($q) use ($today, $isolatedSecretMap) {
                    $q->where('is_service_isolated', true)
                      ->orWhere('mikrotik_profile', 'isolir')
                      ->orWhere(function ($sub) use ($today) {
                          $sub->whereNotNull('due_date')
                              ->whereDate('due_date', '<', $today);
                      })
                      ->orWhereHas('invoices', function ($iq) use ($today) {
                          $iq->whereIn('status', ['unpaid', 'UNPAID', 'overdue', 'OVERDUE', 'menunggu konfirmasi'])
                             ->whereNotNull('due_date')
                             ->whereDate('due_date', '<', $today);
                      });

                    if (!empty($isolatedSecretMap)) {
                        $q->orWhereIn('pppoe_username', array_keys($isolatedSecretMap));
                    }
                })
                ->get();

            // Prepare IDs and usernames for notification logs
            $customerIds = $relevantCustomers->pluck('id')->filter()->values()->all();
            $usernamesLower = array_keys($isolatedSecretMap);
            foreach ($relevantCustomers as $c) {
                if ($c->pppoe_username) {
                    $usernamesLower[] = strtolower(trim((string)$c->pppoe_username));
                }
            }
            $usernamesLower = array_values(array_unique(array_filter($usernamesLower)));

            // Query notification logs (dismantle notices, billing warnings, etc.)
            $allLogs = NotificationLog::where(function ($q) use ($customerIds, $usernamesLower) {
                if (!empty($customerIds)) {
                    $q->whereIn('customer_id', $customerIds);
                }
                if (!empty($usernamesLower)) {
                    $q->orWhere(function ($sub) use ($usernamesLower) {
                        $sub->whereIn('meta->pppoe_username', $usernamesLower);
                    });
                }
            })
            ->where(function ($q) {
                $q->whereIn('meta->type', ['pencopotan_alat', 'peringatan_tagihan', 'billing_dunning', 'isolir_notice', 'late_notice'])
                  ->orWhere('message', 'like', '%pencopotan%')
                  ->orWhere('message', 'like', '%penarikan%')
                  ->orWhere('message', 'like', '%isolir%')
                  ->orWhere('message', 'like', '%tagihan%')
                  ->orWhere('message', 'like', '%jatuh tempo%');
            })
            ->orderBy('sent_at', 'desc')
            ->get();

            $logsByCustomerId = $allLogs->whereNotNull('customer_id')->groupBy('customer_id');
            $logsByUsername = $allLogs->groupBy(fn ($item) => strtolower(trim((string) ($item->meta['pppoe_username'] ?? ''))));

            $enrichedData = [];
            $processedUsernames = [];

            // Enrich each DB customer
            foreach ($relevantCustomers as $c) {
                $normUser = strtolower(trim((string)$c->pppoe_username));
                if ($normUser !== '') {
                    $processedUsernames[$normUser] = true;
                }
                $secret = $normUser !== '' ? ($isolatedSecretMap[$normUser] ?? null) : null;

                $isIsolated = (bool)($secret !== null || $c->is_service_isolated || strtolower((string)$c->mikrotik_profile) === 'isolir');

                $isOverdue = false;
                $daysOverdue = 0;

                if ($c->due_date && Carbon::parse($c->due_date)->startOfDay()->lt($today)) {
                    $isOverdue = true;
                    $daysOverdue = max(1, (int)Carbon::parse($c->due_date)->startOfDay()->diffInDays($today));
                }

                $oldestOverdueInv = $c->invoices->where('due_date', '<', $today->toDateString())->sortBy('due_date')->first();
                if ($oldestOverdueInv) {
                    $isOverdue = true;
                    $invDays = max(1, (int)Carbon::parse($oldestOverdueInv->due_date)->startOfDay()->diffInDays($today));
                    $daysOverdue = max($daysOverdue, $invDays);
                }

                $statusType = 'isolir';
                if ($isIsolated && $isOverdue) {
                    $statusType = 'both';
                } elseif ($isIsolated) {
                    $statusType = 'isolir';
                } elseif ($isOverdue) {
                    $statusType = 'overdue';
                }

                // Match logs
                $matchedLogs = collect();
                if (isset($logsByCustomerId[$c->id])) {
                    $matchedLogs = $matchedLogs->merge($logsByCustomerId[$c->id]);
                }
                if ($normUser !== '' && isset($logsByUsername[$normUser])) {
                    $matchedLogs = $matchedLogs->merge($logsByUsername[$normUser]);
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
                    'notice_type' => $lastLog->meta['type'] ?? 'pencopotan_alat',
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
                    'notice_type' => $log->meta['type'] ?? 'pencopotan_alat',
                    'message' => $log->message,
                    'error' => $log->error,
                ])->all();

                $unpaidInvoices = $c->invoices;
                $unpaidCount = $unpaidInvoices->count();
                $unpaidAmount = (float)$unpaidInvoices->sum('amount');
                $latestUnpaid = $unpaidInvoices->sortByDesc('id')->first();

                $username = $c->pppoe_username ?: ($secret['name'] ?? $c->name);

                $enrichedData[] = [
                    'username' => $username,
                    'password' => $secret['password'] ?? '***',
                    'profile' => $secret['profile'] ?? ($c->mikrotik_profile ?: ($isIsolated ? 'isolir' : 'default')),
                    'remote_address' => $secret['remote_address'] ?? null,
                    'service' => $secret['service'] ?? 'pppoe',
                    'disabled' => $secret['disabled'] ?? 'false',
                    'is_isolated' => $isIsolated,
                    'is_overdue' => $isOverdue,
                    'status_type' => $statusType, // 'both' | 'isolir' | 'overdue'
                    'days_overdue' => $daysOverdue,
                    'unpaid_invoices_count' => $unpaidCount,
                    'unpaid_amount' => $unpaidAmount,
                    'latest_invoice' => $latestUnpaid ? [
                        'id' => $latestUnpaid->id,
                        'amount' => (float)$latestUnpaid->amount,
                        'due_date' => $latestUnpaid->due_date?->toDateString(),
                        'status' => $latestUnpaid->status,
                        'invoice_link' => $latestUnpaid->invoice_link,
                    ] : null,
                    'customer' => [
                        'id' => $c->id,
                        'name' => $c->name,
                        'phone' => $c->phone,
                        'address' => $c->address,
                        'package_type' => $c->package_type,
                        'due_date' => $c->due_date?->toDateString(),
                        'is_active' => (bool)$c->is_active,
                    ],
                    'last_dismantle_notice' => $lastNotice,
                    'dismantle_history' => $history,
                    'dismantle_count' => count($history),
                ];
            }

            // Include any MikroTik isolated secrets not matched in DB
            foreach ($isolatedSecrets as $secret) {
                $u = (string)($secret['name'] ?? '');
                $norm = strtolower(trim($u));
                if ($norm === '' || isset($processedUsernames[$norm])) {
                    continue;
                }

                $matchedLogs = collect();
                if (isset($logsByUsername[$norm])) {
                    $matchedLogs = $matchedLogs->merge($logsByUsername[$norm]);
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
                    'notice_type' => $lastLog->meta['type'] ?? 'pencopotan_alat',
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
                    'notice_type' => $log->meta['type'] ?? 'pencopotan_alat',
                    'message' => $log->message,
                    'error' => $log->error,
                ])->all();

                $enrichedData[] = [
                    'username' => $u,
                    'password' => $secret['password'] ?? '***',
                    'profile' => $secret['profile'] ?? 'isolir',
                    'remote_address' => $secret['remote_address'] ?? null,
                    'service' => $secret['service'] ?? 'pppoe',
                    'disabled' => $secret['disabled'] ?? 'false',
                    'is_isolated' => true,
                    'is_overdue' => false,
                    'status_type' => 'isolir',
                    'days_overdue' => 0,
                    'unpaid_invoices_count' => 0,
                    'unpaid_amount' => 0,
                    'latest_invoice' => null,
                    'customer' => null,
                    'last_dismantle_notice' => $lastNotice,
                    'dismantle_history' => $history,
                    'dismantle_count' => count($history),
                ];
            }

            // Sort: both (isolir & overdue) first, then isolir, then overdue; descending by days_overdue
            usort($enrichedData, function ($a, $b) {
                $order = ['both' => 0, 'isolir' => 1, 'overdue' => 2];
                $priorityA = $order[$a['status_type']] ?? 3;
                $priorityB = $order[$b['status_type']] ?? 3;
                if ($priorityA !== $priorityB) {
                    return $priorityA <=> $priorityB;
                }
                return ($b['days_overdue'] ?? 0) <=> ($a['days_overdue'] ?? 0);
            });

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
            Log::error('Failed to get isolated and overdue devices', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal mengambil data perangkat isolir dan telat pembayaran: ' . $e->getMessage(),
                ], 500);
            }

            return back()->with('error', 'Gagal mengambil data perangkat isolir dan telat pembayaran: ' . $e->getMessage());
        }
    }

    /**
     * Send equipment dismantling or overdue payment WhatsApp notice to customer
     */
    public function sendDismantleNotice(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'phone' => 'nullable|string',
            'custom_message' => 'nullable|string|max:3000',
            'notice_type' => 'nullable|string|in:pencopotan_alat,peringatan_tagihan',
            'days_overdue' => 'nullable|integer|min:0',
            'amount' => 'nullable|numeric|min:0',
            'invoice_url' => 'nullable|string|max:500',
        ]);

        $username = trim($validated['username']);
        $noticeType = $validated['notice_type'] ?? 'pencopotan_alat';
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
        $daysOverdue = (int) ($validated['days_overdue'] ?? 0);
        $amount = (float) ($validated['amount'] ?? 0);
        $invoiceUrl = $validated['invoice_url'] ?? null;

        // Prepare message
        if (!empty($validated['custom_message'])) {
            $message = trim($validated['custom_message']);
        } elseif ($noticeType === 'peringatan_tagihan') {
            $message = $this->buildDefaultOverdueMessage($customerName, $username, $address, $package, $daysOverdue, $amount, $invoiceUrl);
        } else {
            $message = $this->buildDefaultDismantleMessage($customerName, $username, $address, $package);
        }

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
                'type' => $noticeType,
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
            'notice_type' => $noticeType,
            'message' => $log->message,
            'error' => $log->error,
        ];

        $typeLabel = $noticeType === 'peringatan_tagihan' ? 'Peringatan tagihan telat' : 'Pemberitahuan pencopotan alat';

        if ($status === 'sent') {
            return response()->json([
                'success' => true,
                'message' => "{$typeLabel} berhasil dikirim ke {$customerName} ({$phone}).",
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
     * Get notification history for a customer or username
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
            $q->whereIn('meta->type', ['pencopotan_alat', 'peringatan_tagihan', 'billing_dunning', 'isolir_notice', 'late_notice'])
              ->orWhere('message', 'like', '%pencopotan%')
              ->orWhere('message', 'like', '%penarikan%')
              ->orWhere('message', 'like', '%isolir%')
              ->orWhere('message', 'like', '%tagihan%')
              ->orWhere('message', 'like', '%jatuh tempo%');
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
            'notice_type' => $log->meta['type'] ?? 'pencopotan_alat',
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
     * Build default message template for dismantling notice or overdue reminder
     */
    public function defaultMessage(Request $request): JsonResponse
    {
        $type = (string) $request->input('type', 'pencopotan_alat');
        $name = (string) $request->input('name', 'Pelanggan');
        $username = (string) $request->input('username', '-');
        $address = (string) $request->input('address', '-');
        $package = (string) $request->input('package', '-');
        $daysOverdue = (int) $request->input('days_overdue', 0);
        $amount = (float) $request->input('amount', 0);
        $invoiceUrl = $request->input('invoice_url');

        if ($type === 'peringatan_tagihan') {
            $message = $this->buildDefaultOverdueMessage($name, $username, $address, $package, $daysOverdue, $amount, $invoiceUrl);
        } else {
            $message = $this->buildDefaultDismantleMessage($name, $username, $address, $package);
        }

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

    private function buildDefaultOverdueMessage(string $name, string $username, string $address, string $package, int $daysOverdue = 0, float $amount = 0, ?string $invoiceUrl = null): string
    {
        $daysText = $daysOverdue > 0 ? " ({$daysOverdue} hari)" : "";
        $amountText = $amount > 0 ? "Rp " . number_format($amount, 0, ',', '.') : "Sesuai rincian tagihan";
        $linkText = $invoiceUrl ? "\n> ⓘ Rincian tagihan & pembayaran:\n{$invoiceUrl}\n" : "";

        return "Halo *{$name}*,\n\n"
            . "Pengingat dari *Rumah Kita Network*.\n\n"
            . "Kami menginformasikan bahwa tagihan layanan internet Anda saat ini telah melewati batas waktu jatuh tempo{$daysText}. Untuk menghindari penghentian atau pembatasan layanan otomatis (isolir), mohon untuk segera melakukan pembayaran:\n\n"
            . "👤 *Nama Pelanggan:* {$name}\n"
            . "🏠 *Alamat:* {$address}\n"
            . "📦 *Paket Layanan:* {$package}\n"
            . "🔑 *ID / User PPPoE:* {$username}\n"
            . "💰 *Total Tagihan:* {$amountText}\n"
            . $linkText . "\n"
            . "Apabila Anda telah melakukan pembayaran, mohon abaikan pesan ini atau kirimkan bukti pembayaran ke admin kami.\n\n"
            . "Terima kasih atas perhatian dan kerjasamanya.\n\n"
            . "_Rumah Kita Network_";
    }
}
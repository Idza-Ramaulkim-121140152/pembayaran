<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\NetworkNotice;
use App\Models\NotificationLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppController extends Controller
{
    /**
     * Base URL for the Node.js WhatsApp Gateway
     */
    protected function gatewayUrl(): string
    {
        return rtrim(env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
    }

    /**
     * GET /api/whatsapp/status
     * Check WhatsApp connection status
     */
    public function status()
    {
        try {
            $response = Http::timeout(5)->get($this->gatewayUrl() . '/status');
            $data = $response->json();

            $connected = $data['ready'] ?? false;
            $phone = $data['phone'] ?? null;
            $hasQR = $data['hasQR'] ?? false;

            if ($connected) {
                $message = "WhatsApp terhubung sebagai {$phone}";
            } elseif ($hasQR) {
                $message = "WhatsApp belum login. Scan QR code untuk menghubungkan.";
            } else {
                $message = $data['error'] ?? "Menunggu WhatsApp Gateway...";
            }

            return response()->json([
                'connected' => $connected,
                'phone_number' => $phone,
                'message' => $message,
                'has_qr' => $hasQR,
            ]);
        } catch (\Exception $e) {
            Log::error('WhatsApp Gateway unreachable: ' . $e->getMessage());
            return response()->json([
                'connected' => false,
                'phone_number' => null,
                'message' => 'WhatsApp Gateway tidak tersedia. Pastikan service sudah berjalan.',
                'has_qr' => false,
            ]);
        }
    }

    /**
     * GET /api/whatsapp/qr
     * Get QR code for WhatsApp login
     */
    public function qr()
    {
        try {
            $response = Http::timeout(10)->get($this->gatewayUrl() . '/qr');
            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat mengambil QR code: ' . $e->getMessage(),
            ], 503);
        }
    }

    /**
     * POST /api/whatsapp/restart
     * Restart WhatsApp client
     */
    public function restart()
    {
        try {
            $response = Http::timeout(10)->post($this->gatewayUrl() . '/restart');
            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal restart WhatsApp: ' . $e->getMessage(),
            ], 503);
        }
    }

    /**
     * POST /api/whatsapp/logout
     * Logout from WhatsApp
     */
    public function logout()
    {
        try {
            $response = Http::timeout(10)->post($this->gatewayUrl() . '/logout');
            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal logout WhatsApp: ' . $e->getMessage(),
            ], 503);
        }
    }

    /**
     * POST /api/whatsapp/send-notification
     * Send notification to customers via WhatsApp
     */
    public function sendNotification(Request $request)
    {
        $request->validate([
            'customer_ids' => 'nullable|array',
            'customer_ids.*' => 'integer|exists:customers,id',
            'notice_id' => 'nullable|integer|exists:network_notices,id',
            'custom_message' => 'nullable|string|max:2000',
        ]);

        // At least one of notice_id or custom_message required
        if (!$request->notice_id && !$request->custom_message) {
            return response()->json([
                'success' => false,
                'message' => 'Pilih informasi gangguan atau tulis pesan kustom.',
            ], 422);
        }

        // Build the message
        $notice = null;
        if ($request->notice_id) {
            $notice = NetworkNotice::find($request->notice_id);
        }

        $message = $request->custom_message ?: $this->formatNoticeMessage($notice);

        // Get target customers
        $query = Customer::where('is_active', true);
        if ($request->customer_ids && count($request->customer_ids) > 0) {
            $query->whereIn('id', $request->customer_ids);
        } elseif ($notice && $notice->affected_odp) {
            // Filter by affected ODP if no specific customers selected
            $odpList = array_map('trim', explode(',', $notice->affected_odp));
            $query->whereIn('odp', $odpList);
        }

        $customers = $query->get();

        if ($customers->isEmpty()) {
            return response()->json([
                'success' => true,
                'message' => 'Tidak ada pelanggan yang perlu dikirim notifikasi.',
                'total_customers' => 0,
                'sent_count' => 0,
                'failed_count' => 0,
                'skipped_count' => 0,
                'results' => [],
            ]);
        }

        // Separate valid vs invalid phone numbers
        $recipients = [];
        $results = [];
        $skippedCount = 0;

        foreach ($customers as $customer) {
            $phone = $customer->phone ?? '';
            $name = $customer->name ?? 'Pelanggan';

            if (!$this->isValidPhone($phone)) {
                $results[] = [
                    'phone' => $phone,
                    'customer_name' => $name,
                    'success' => false,
                    'error' => 'Nomor tidak valid atau 0',
                ];
                $skippedCount++;

                // Log skipped
                $this->logNotification($customer->id, $phone, $message, $notice?->id, 'skipped', 'Nomor tidak valid');
                continue;
            }

            $recipients[] = [
                'phone' => $phone,
                'name' => $name,
                'id' => $customer->id,
            ];
        }

        // Send to WA Gateway
        if (!empty($recipients)) {
            try {
                $response = Http::timeout(300)->post($this->gatewayUrl() . '/send-bulk', [
                    'recipients' => $recipients,
                    'message' => $message,
                    'delay' => 2000,
                ]);

                $gatewayResult = $response->json();

                if (isset($gatewayResult['results']) && is_array($gatewayResult['results'])) {
                    foreach ($gatewayResult['results'] as $r) {
                        $results[] = $r;

                        // Find customer ID from recipients
                        $customerId = null;
                        foreach ($recipients as $recipient) {
                            if ($recipient['name'] === ($r['customer_name'] ?? '')) {
                                $customerId = $recipient['id'];
                                break;
                            }
                        }

                        $this->logNotification(
                            $customerId,
                            $r['phone'] ?? '',
                            $message,
                            $notice?->id,
                            ($r['success'] ?? false) ? 'sent' : 'failed',
                            $r['error'] ?? null
                        );
                    }
                } elseif (isset($gatewayResult['error'])) {
                    // Gateway returned an error for all
                    foreach ($recipients as $recipient) {
                        $results[] = [
                            'phone' => $recipient['phone'],
                            'customer_name' => $recipient['name'],
                            'success' => false,
                            'error' => $gatewayResult['error'],
                        ];
                        $this->logNotification(
                            $recipient['id'],
                            $recipient['phone'],
                            $message,
                            $notice?->id,
                            'failed',
                            $gatewayResult['error']
                        );
                    }
                }
            } catch (\Exception $e) {
                Log::error('WhatsApp send-bulk failed: ' . $e->getMessage());
                foreach ($recipients as $recipient) {
                    $results[] = [
                        'phone' => $recipient['phone'],
                        'customer_name' => $recipient['name'],
                        'success' => false,
                        'error' => 'Gateway tidak tersedia: ' . $e->getMessage(),
                    ];
                    $this->logNotification(
                        $recipient['id'],
                        $recipient['phone'],
                        $message,
                        $notice?->id,
                        'failed',
                        'Gateway error: ' . $e->getMessage()
                    );
                }
            }
        }

        $sentCount = collect($results)->where('success', true)->count();
        $failedCount = collect($results)->where('success', false)
            ->where('error', '!=', 'Nomor tidak valid atau 0')->count();

        return response()->json([
            'success' => true,
            'message' => "Notifikasi berhasil diproses untuk {$customers->count()} pelanggan.",
            'total_customers' => $customers->count(),
            'sent_count' => $sentCount,
            'failed_count' => $failedCount,
            'skipped_count' => $skippedCount,
            'results' => $results,
        ]);
    }

    /**
     * POST /api/whatsapp/send-test
     * Send a test message to a single phone number
     */
    public function sendTest(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'message' => 'required|string|max:2000',
        ]);

        try {
            $response = Http::timeout(30)->post($this->gatewayUrl() . '/send', [
                'phone' => $request->phone,
                'message' => $request->message,
            ]);
            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => 'Gagal mengirim pesan: ' . $e->getMessage(),
            ], 503);
        }
    }

    /**
     * GET /api/whatsapp/logs
     * Get notification send logs
     */
    public function logs(Request $request)
    {
        $query = NotificationLog::with('customer:id,nama,no_telp')
            ->orderBy('created_at', 'desc');

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->date) {
            $query->whereDate('created_at', $request->date);
        }

        $logs = $query->paginate(50);

        return response()->json([
            'success' => true,
            'data' => $logs,
        ]);
    }

    /**
     * Validate phone number
     */
    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0' || $phone === '') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);
        return strlen($cleaned) >= 10 && strlen($cleaned) <= 15;
    }

    /**
     * Format network notice into a WhatsApp message
     */
    private function formatNoticeMessage(NetworkNotice $notice): string
    {
        $severityEmoji = [
            'low' => 'ℹ️',
            'medium' => '⚠️',
            'high' => '🔴',
            'critical' => '🚨',
        ];

        $typeText = [
            'gangguan' => 'GANGGUAN JARINGAN',
            'maintenance' => 'MAINTENANCE TERJADWAL',
        ];

        $emoji = $severityEmoji[$notice->severity] ?? 'ℹ️';
        $type = $typeText[$notice->type] ?? 'PEMBERITAHUAN';

        $message = "{$emoji} *{$type}* {$emoji}\n\n";
        $message .= "*{$notice->title}*\n\n";
        $message .= $notice->message;

        if ($notice->affected_area) {
            $message .= "\n\n📍 *Area Terdampak:* {$notice->affected_area}";
        }

        if ($notice->start_time) {
            $message .= "\n🕐 *Mulai:* " . \Carbon\Carbon::parse($notice->start_time)->format('d/m/Y H:i');
        }

        if ($notice->end_time) {
            $message .= "\n🕐 *Estimasi Selesai:* " . \Carbon\Carbon::parse($notice->end_time)->format('d/m/Y H:i');
        }

        $message .= "\n\nUntuk informasi perkembangan terbaru, silakan cek melalui link berikut:";
        $message .= "\n👉 https://rumahkitanet.site/status-jaringan";
        $message .= "\n\nMohon maaf atas ketidaknyamanan ini.";
        $message .= "\nTerima kasih atas pengertiannya.";
        $message .= "\n\n_Pesan ini dikirim otomatis_";

        return $message;
    }

    /**
     * Log a notification send attempt
     */
    private function logNotification(
        ?int $customerId,
        string $phone,
        string $message,
        ?int $noticeId,
        string $status,
        ?string $error = null
    ): void {
        try {
            NotificationLog::create([
                'customer_id' => $customerId,
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => $noticeId,
                'status' => $status,
                'error' => $error,
                'sent_at' => now(),
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to log notification: ' . $e->getMessage());
        }
    }
}

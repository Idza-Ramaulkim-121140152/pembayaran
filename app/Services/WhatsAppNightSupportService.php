<?php

namespace App\Services;

use App\Models\Complaint;
use App\Models\Customer;
use App\Models\NotificationLog;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppNightSupportService
{
    public const SETTING_ENABLED = 'wa_night_support_enabled';
    public const SETTING_START_HOUR = 'wa_night_support_start_hour'; // default 21 (21:00 WIB)
    public const SETTING_END_HOUR = 'wa_night_support_end_hour';     // default 8  (08:00 WIB)
    public const SETTING_COOLDOWN_MINUTES = 'wa_night_support_cooldown_minutes'; // default 30 menit

    public function __construct(
        protected CustomerResolutionService $customerResolver,
        protected TicketingService $ticketingService
    ) {}

    /**
     * Cek apakah saat ini berada dalam rentang Mode Jaga Malam (21:00 - 08:00 WIB).
     * Selama 08:00 - 21:00 WIB (jam kerja CS manusia), bot wajib 100% diam.
     */
    public function isNightShiftActive(?Carbon $time = null): bool
    {
        $now = $time ?: Carbon::now('Asia/Jakarta');
        $startHour = (int) SiteSetting::get(self::SETTING_START_HOUR, 21);
        $endHour = (int) SiteSetting::get(self::SETTING_END_HOUR, 8);
        $currentHour = (int) $now->hour;

        // Rentang malam: dari startHour (misal 21) sampai lewat tengah malam hingga endHour (misal 8)
        if ($startHour > $endHour) {
            return $currentHour >= $startHour || $currentHour < $endHour;
        }

        return $currentHour >= $startHour && $currentHour < $endHour;
    }

    /**
     * Memproses pesan teks masuk dari WhatsApp Gateway.
     */
    public function handleInboundMessage(array $payload, ?Carbon $mockTime = null): array
    {
        $senderPhone = trim((string) ($payload['sender_phone'] ?? ''));
        $senderLid = trim((string) ($payload['sender_lid'] ?? ''));
        $senderName = trim((string) ($payload['sender_name'] ?? ''));
        $messageText = trim((string) ($payload['message'] ?? ''));
        $messageId = trim((string) ($payload['message_id'] ?? ''));

        if ($senderPhone === '' && $senderLid === '') {
            return [
                'status' => 'ignored_invalid_sender',
                'message' => 'Pengirim tidak valid (tanpa nomor telepon / LID).',
            ];
        }

        if ($messageText === '') {
            return [
                'status' => 'ignored_empty_message',
                'message' => 'Isi pesan kosong.',
            ];
        }

        // 1. Cek saklar fitur
        $enabled = SiteSetting::get(self::SETTING_ENABLED, '1') !== '0';
        if (!$enabled) {
            return [
                'status' => 'ignored_disabled',
                'message' => 'Fitur AI Mode Jaga Malam sedang dinonaktifkan oleh admin.',
            ];
        }

        // 2. Cek jam kerja (Wajib senyap pada 08:00 - 21:00 WIB agar tidak bentrok dengan CS manusia)
        if (!$this->isNightShiftActive($mockTime)) {
            Log::info("WhatsAppNightSupport: Pesan dari {$senderPhone} diabaikan karena saat ini jam kerja CS manusia (08:00 - 21:00 WIB).");
            return [
                'status' => 'ignored_daytime',
                'message' => 'Mode Jaga Malam nonaktif pada jam operasional CS manusia (08:00 - 21:00 WIB). Tidak ada balasan bot.',
            ];
        }

        // 3. Cek anti-spam cooldown per nomor HP
        $cleanPhone = preg_replace('/\D/', '', $senderPhone ?: $senderLid);
        $cooldownKey = "wa_night_cooldown_{$cleanPhone}";
        $cooldownMinutes = max(5, (int) SiteSetting::get(self::SETTING_COOLDOWN_MINUTES, 30));

        if (Cache::has($cooldownKey)) {
            Log::info("WhatsAppNightSupport: Cooldown aktif untuk {$cleanPhone}. Pesan dicatat tanpa membalas ulang spam.");
            return [
                'status' => 'cooldown_active',
                'message' => 'Pesan diterima, bot sedang dalam masa jeda (cooldown) untuk nomor ini agar tidak spam.',
                'cooldown_minutes' => $cooldownMinutes,
            ];
        }

        // 4. Identifikasi Pelanggan via CustomerResolutionService
        $customer = $this->resolveCustomer($senderPhone, $senderLid, $senderName);
        $customerDisplayName = $customer?->name ?: ($senderName ?: 'Pelanggan');

        // 5. Buat Tiket Komplain Formal (Status: Pending)
        $complaint = null;
        $ticketNumber = null;
        if ($customer) {
            $complaint = $this->createComplaintTicket($customer, $messageText, $senderPhone);
            $ticketNumber = $complaint->ticket_number ?? ('TCK-' . $complaint->id);
        }

        // 6. Susun Pesan Respon Ramah & Panduan Mandiri Sementara
        $replyMessage = $this->buildNightResponse(
            $customerDisplayName,
            $messageText,
            $ticketNumber,
            $customer
        );

        // 7. Kirim balasan ke nomor WhatsApp pelanggan
        $targetPhone = $senderPhone ?: $senderLid;
        $sendSuccess = $this->sendWhatsAppReply($targetPhone, $replyMessage);

        // 8. Pasang cooldown setelah berhasil membalas
        Cache::put($cooldownKey, true, now()->addMinutes($cooldownMinutes));

        return [
            'status' => 'replied',
            'customer_id' => $customer?->id,
            'customer_name' => $customerDisplayName,
            'ticket_id' => $complaint?->id,
            'ticket_number' => $ticketNumber,
            'send_success' => $sendSuccess,
            'reply_preview' => mb_substr($replyMessage, 0, 150) . '...',
        ];
    }

    /**
     * Resolusi profil pelanggan berdasarkan nomor telepon, LID, atau display name.
     */
    protected function resolveCustomer(string $phone, string $lid, string $name): ?Customer
    {
        // Cari via nomor telepon
        if ($phone !== '' && !$this->customerResolver->isLid($phone)) {
            $cust = $this->customerResolver->findCustomerByPhone($phone);
            if ($cust) {
                if ($lid !== '') {
                    $this->customerResolver->rememberCustomerLid($cust->id, $lid);
                }
                return $cust;
            }
        }

        // Cari via LID
        if ($lid !== '') {
            $cust = $this->customerResolver->findCustomerByLid($lid);
            if ($cust) return $cust;
        }

        if ($phone !== '' && $this->customerResolver->isLid($phone)) {
            $cust = $this->customerResolver->findCustomerByLid($phone);
            if ($cust) return $cust;
        }

        // Cari via Nama Profile WA jika unik
        if ($name !== '') {
            $cust = $this->customerResolver->findCustomerByName($name);
            if ($cust) return $cust;
        }

        return null;
    }

    /**
     * Otomatis membuat tiket keluhan di database complaints dengan SLA prioritas.
     */
    protected function createComplaintTicket(Customer $customer, string $message, string $phone): Complaint
    {
        $lowerMsg = strtolower($message);
        $isHighPriority = str_contains($lowerMsg, 'los') ||
            str_contains($lowerMsg, 'merah') ||
            str_contains($lowerMsg, 'putus') ||
            str_contains($lowerMsg, 'mati total') ||
            str_contains($lowerMsg, 'modem mati');

        $priority = $isHighPriority ? 'high' : 'medium';
        $now = now();

        /** @var Complaint $complaint */
        $complaint = Complaint::create([
            'customer_id' => $customer->id,
            'subject' => "[Jaga Malam WA] Komplain dari {$customer->name}",
            'message' => $message,
            'category' => 'gangguan',
            'status' => 'pending',
            'priority' => $priority,
            'opened_at' => $now,
            'last_activity_at' => $now,
        ]);

        try {
            // Terapkan aturan SLA
            $this->ticketingService->applySla($complaint);

            // Log event tiket
            $this->ticketingService->logEvent(
                $complaint,
                'comment',
                "Tiket dibuat secara otomatis oleh AI Mode Jaga Malam melalui keluhan WhatsApp ({$phone}). Menunggu tindak lanjut CS mulai pukul 08:00 WIB.",
                true,
                null,
                ['source' => 'whatsapp_night_support', 'priority' => $priority]
            );
        } catch (\Throwable $e) {
            Log::warning("WhatsAppNightSupport: Gagal apply SLA/event: " . $e->getMessage());
        }

        return $complaint;
    }

    /**
     * Membangun teks balasan ramah, profesional, dan memberikan panduan mandiri sementara.
     */
    public function buildNightResponse(
        string $customerName,
        string $messageText,
        ?string $ticketNumber = null,
        ?Customer $customer = null
    ): string {
        $greeting = "Halo Kak *{$customerName}*, salam hangat dari *Rumah Kita Net* 🌙\n\n";

        $offHoursNotice = "Terima kasih telah menghubungi kami. Kami menginformasikan bahwa saat ini layanan Customer Service manusia kami sedang *offline* di luar jam kerja operasional (Jam aktif CS & teknisi kami: *08:00 - 21:00 WIB*).\n\n";

        $ticketInfo = "";
        if ($ticketNumber) {
            $ticketInfo = "✅ *Keluhan Anda telah kami catat dalam antrean tiket prioritas:*\n"
                . "🎫 *No. Tiket:* #{$ticketNumber}\n"
                . "📌 *Status:* Menunggu Konfirmasi Pagi\n\n";
        }

        $troubleshooting = "🛠️ *Langkah Pengecekan Mandiri Sementara:*\n"
            . "1. *Cek Lampu LOS:* Periksa lampu indikator *LOS* pada modem/router. Jika lampu merah menyala atau berkedip, terdapat kendala fisik pada kabel fiber optik.\n"
            . "2. *Cek Fisik Kabel:* Pastikan kabel fiber optik tipis (warna kuning/hitam) tidak tertekuk tajam, tertindih, atau terlepas dari port biru modem.\n"
            . "3. *Restart Modem:* Coba cabut adaptor daya modem selama 15 detik, lalu colokkan kembali untuk memperbarui koneksi sinyal.\n\n";

        $closing = "Jika kendala masih belum teratasi setelah langkah di atas, tim CS & teknisi lapangan kami akan segera menindaklanjuti tiket Anda mulai pukul *08:00 WIB* besok pagi.\n\n"
            . "Mohon maaf atas ketidaknyamanan waktu istirahat Anda. Terima kasih banyak atas kesabaran dan pengertiannya! 🙏✨";

        return $greeting . $offHoursNotice . $ticketInfo . $troubleshooting . $closing;
    }

    /**
     * Mengirim balasan WhatsApp melalui WA gateway.
     */
    protected function sendWhatsAppReply(string $phone, string $message): bool
    {
        $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');

        try {
            $response = Http::timeout(30)->post($gatewayUrl . '/send', [
                'phone' => $phone,
                'message' => $message,
            ]);

            $json = $response->json();
            $success = (bool) ($json['success'] ?? false);

            NotificationLog::create([
                'customer_id' => null,
                'phone' => $phone,
                'message' => $message,
                'notice_id' => null,
                'status' => $success ? 'sent' : 'failed',
                'error' => $success ? null : ($json['error'] ?? 'Gagal kirim via gateway'),
            ]);

            return $success;
        } catch (\Throwable $e) {
            Log::error("WhatsAppNightSupport: Gagal kirim balasan WA ke {$phone}: " . $e->getMessage());
            return false;
        }
    }
}

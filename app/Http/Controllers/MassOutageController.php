<?php

namespace App\Http\Controllers;

use App\Models\NetworkNotice;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MassOutageController extends Controller
{
    /**
     * Mengambil status gangguan jaringan massal secara real-time.
     */
    public function status(Request $request): JsonResponse
    {
        $now = now();

        // 1. Cari notice gangguan massal yang aktif dan sedang berlangsung di database
        $notice = NetworkNotice::active()
            ->ongoing()
            ->where('is_mass', true)
            ->orderBy('severity', 'desc')
            ->orderBy('created_at', 'desc')
            ->first();

        // 2. Jika tidak ada spesifik mass notice, cari notice gangguan aktif apa pun
        if (!$notice) {
            $notice = NetworkNotice::active()
                ->ongoing()
                ->where('type', 'gangguan')
                ->orderBy('severity', 'desc')
                ->orderBy('created_at', 'desc')
                ->first();
        }

        if ($notice) {
            return response()->json([
                'success' => true,
                'has_custom_notice' => true,
                'title' => $notice->title,
                'type' => $notice->type,
                'severity' => $notice->severity,
                'is_mass' => (bool) $notice->is_mass,
                'affected_area' => $notice->affected_area ?: 'Semua Wilayah Pelanggan',
                'affected_odp' => $notice->affected_odp,
                'message' => $notice->message,
                'start_time' => $notice->start_time ? $notice->start_time->setTimezone('Asia/Jakarta')->toIso8601String() : null,
                'start_time_human' => $notice->start_time ? $notice->start_time->setTimezone('Asia/Jakarta')->translatedFormat('d F Y, H:i') . ' WIB' : 'Hari ini',
                'end_time' => $notice->end_time ? $notice->end_time->setTimezone('Asia/Jakarta')->toIso8601String() : null,
                'end_time_human' => $notice->end_time ? $notice->end_time->setTimezone('Asia/Jakarta')->translatedFormat('d F Y, H:i') . ' WIB' : 'Dalam Penanganan Intensif',
                'cs_phone' => '6285158025553',
                'instructions' => [
                    'Mohon TIDAK menekan tombol RESET kecil di belakang modem Wi-Fi Anda agar konfigurasi internet Anda tidak terhapus.',
                    'Koneksi internet Anda akan otomatis kembali normal saat perbaikan jaringan selesai tanpa perlu konfigurasi ulang.',
                    'Jika status sudah dinyatakan pulih namun internet belum tersambung, cukup matikan adaptor modem 30 detik lalu nyalakan kembali.',
                ],
            ]);
        }

        // 3. Fallback jika upline mati mendadak dan admin belum sempat menginput notice manual di dashboard
        return response()->json([
            'success' => true,
            'has_custom_notice' => false,
            'title' => 'Pemberitahuan Gangguan Massal Jaringan Internet',
            'type' => 'gangguan',
            'severity' => 'critical',
            'is_mass' => true,
            'affected_area' => 'Semua Wilayah Pelanggan (Jalur Utama)',
            'affected_odp' => null,
            'message' => "Mohon maaf atas ketidaknyamanan Anda. Saat ini terdeteksi adanya gangguan koneksi internet dari penyedia hulu (Upstream / Upline Provider) atau putusnya jalur utama kabel Fiber Optik menuju server utama.\n\nSeluruh tim teknisi jaringan Rumah Kita Net sedang melakukan koordinasi dan penanganan darurat di lapangan agar layanan dapat segera pulih kembali secepat mungkin.",
            'start_time' => $now->startOfHour()->toIso8601String(),
            'start_time_human' => $now->translatedFormat('d F Y, H:i') . ' WIB',
            'end_time' => null,
            'end_time_human' => 'Dalam Penanganan Intensif Tim Teknisi',
            'cs_phone' => '6285158025553',
            'instructions' => [
                'Mohon TIDAK menekan tombol RESET kecil di belakang modem Wi-Fi Anda agar konfigurasi internet Anda tidak terhapus.',
                'Koneksi internet Anda akan otomatis kembali normal saat perbaikan jaringan selesai tanpa perlu konfigurasi ulang.',
                'Jika status sudah dinyatakan pulih namun internet belum tersambung, cukup matikan adaptor modem 30 detik lalu nyalakan kembali.',
            ],
        ]);
    }
}

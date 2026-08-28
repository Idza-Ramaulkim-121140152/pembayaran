<?php

namespace App\Services;

use App\Models\Customer;
use Carbon\Carbon;

class BillingMessageTemplateService
{
    public const AUTO_LABEL = '[Pesan Ini Dikirim Automatis oleh sistem]';

    public function buildBillingReminderMessage(Customer $customer, string $invoiceUrl, float $amount, ?string $dueDate = null, bool $withAutoLabel = false): string
    {
        $message = "Yth. Bapak/Ibu " . strtoupper((string) $customer->name) . "\n" .
            "Username PPPoE: " . ((string) $customer->pppoe_username ?: '-') . "\n\n" .
            "Terima kasih telah menjadi bagian dari pelanggan prioritas kami.\n" .
            "Layanan internet anda aktif sampai " . ($dueDate ?: '-') . ".\n\n" .
            "Nominal tagihan: Rp " . number_format($amount, 0, ',', '.') . "\n" .
            "> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:\n" .
            $invoiceUrl . "\n\n" .
            "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis.\n\n" .
            "Layanan Call Center 085158025553\n\n" .
            "Salam Hangat,\n" .
            "Tim Layanan Pelanggan Rumah Kita Net";

        return $withAutoLabel ? $this->appendAutoLabel($message) : $message;
    }

    public function buildPaymentConfirmationMessage(Customer $customer, bool $withAutoLabel = true): string
    {
        $activeUntil = '-';
        if (!empty($customer->due_date)) {
            try {
                $activeUntil = Carbon::parse((string) $customer->due_date)->format('d/m/Y');
            } catch (\Throwable $exception) {
                $activeUntil = '-';
            }
        }

        $message = "TERIMA KASIH ATAS PEMBAYARANNYA\n\n" .
            "Pelanggan yang terhormat,\n" .
            "Kami mengucapkan terima kasih karena telah melakukan pembayaran tagihan internet.\n\n" .
            "Pembayaran Anda telah kami terima dan layanan tetap aktif seperti biasa.\n" .
            "Paket aktif sampai: " . $activeUntil . ".\n" .
            "Jika ada pertanyaan atau kendala, jangan ragu untuk menghubungi kami melalui WhatsApp ini.\n\n" .
            "Terima kasih telah mempercayakan koneksi internet Anda kepada Rumah Kita Network.\n" .
            "Semoga layanan kami selalu memenuhi kebutuhan digital Anda.\n\n" .
            "Salam hangat,\n" .
            "Rumah Kita Network, Menjaga Hangatnya Kebersamaan";

        return $withAutoLabel ? $this->appendAutoLabel($message) : $message;
    }

    public function buildIsolationMessage(bool $withAutoLabel = true): string
    {
        $message = "Halo, pelanggan setia Rumah Kita Network 👋\n" .
            "Kami ingin menginformasikan bahwa layanan internet Anda saat ini dinonaktifkan sementara karena belum dilakukan pembayaran tagihan.\n\n" .
            "Untuk mengaktifkan kembali layanan internet Anda, silakan segera lakukan pembayaran melalui metode yang tersedia.\n\n" .
            "✅ Jika Anda sudah melakukan pembayaran, layanan internet akan otomatis aktif kembali dalam waktu maksimal 1 jam setelah pembayaran terverifikasi.\n" .
            "Jika layanan belum aktif setelah 1 jam, silakan hubungi tim support kami.\n\n" .
            "📞 Bantuan & Konfirmasi Pembayaran:\n" .
            "WhatsApp: 085158025553\n" .
            "Jam Operasional: 08:00-17:00 WIB\n\n" .
            "Terima kasih atas perhatian dan kerja samanya.\n" .
            "Salam,\n" .
            "Tim Rumah Kita Network";

        return $withAutoLabel ? $this->appendAutoLabel($message) : $message;
    }

    public function buildVerificationWelcomeMessage(Customer $customer, string $portalUrl, string $defaultPassword = 'user123', bool $withAutoLabel = true): string
    {
        $activeUntil = '-';
        if (!empty($customer->due_date)) {
            try {
                $activeUntil = Carbon::parse((string) $customer->due_date)->format('d/m/Y');
            } catch (\Throwable $exception) {
                $activeUntil = '-';
            }
        }

        $packageName = trim((string) ($customer->package_type ?? ''));
        if ($packageName === '') {
            $packageName = trim((string) ($customer->custom_package ?? ''));
        }
        if ($packageName === '') {
            $packageName = '-';
        }

        $pppoeUsername = trim((string) ($customer->pppoe_username ?? ''));
        if ($pppoeUsername === '') {
            $pppoeUsername = '-';
        }

        $phone = trim((string) ($customer->phone ?? ''));
        if ($phone === '') {
            $phone = '-';
        }

        $message = "Selamat datang di Rumah Kita Network.\n\n" .
            "Akun internet Anda sudah berhasil terdaftar dan layanan sudah aktif.\n\n" .
            "Link akses dashboard pelanggan:\n" .
            $portalUrl . "\n\n" .
            "Informasi login pelanggan:\n" .
            "Username PPPoE: " . $pppoeUsername . "\n" .
            "No. HP: " . $phone . "\n" .
            "Password awal: " . $defaultPassword . "\n\n" .
            "Informasi paket:\n" .
            "Paket aktif: " . $packageName . "\n" .
            "Paket aktif sampai: " . $activeUntil . "\n\n" .
            "Silakan login dan segera ganti password untuk keamanan akun Anda.\n\n" .
            "Salam hangat,\n" .
            "Tim Rumah Kita Network";

        return $withAutoLabel ? $this->appendAutoLabel($message) : $message;
    }

    public function appendAutoLabel(string $message): string
    {
        $trimmed = rtrim($message);
        if (str_ends_with($trimmed, self::AUTO_LABEL)) {
            return $trimmed;
        }

        return $trimmed . "\n\n" . self::AUTO_LABEL;
    }

    public function normalizeLegacyRelativeDayTerms(string $message): string
    {
        $replacements = [
            'H-7' => '7 hari sebelum jatuh tempo',
            'H-5' => 'kurang dari 5 hari menuju jatuh tempo',
            'H-3' => '3 hari sebelum jatuh tempo',
            'H-1' => 'kurang dari 1 hari menuju jatuh tempo',
            'H+1' => 'terlambat 1 hari',
            'H+3' => 'terlambat 3 hari',
            'h-7' => '7 hari sebelum jatuh tempo',
            'h-5' => 'kurang dari 5 hari menuju jatuh tempo',
            'h-3' => '3 hari sebelum jatuh tempo',
            'h-1' => 'kurang dari 1 hari menuju jatuh tempo',
            'h+1' => 'terlambat 1 hari',
            'h+3' => 'terlambat 3 hari',
        ];

        return strtr($message, $replacements);
    }

    public function waveToHumanLabel(string $wave): string
    {
        return match ($wave) {
            'h_minus_7' => '7 hari sebelum jatuh tempo',
            'h_minus_3' => '3 hari sebelum jatuh tempo',
            'h_minus_1' => 'kurang dari 1 hari menuju jatuh tempo',
            'h_plus_1' => 'terlambat 1 hari',
            'h_plus_3' => 'terlambat 3 hari',
            default => strtoupper(str_replace('_', '-', $wave)),
        };
    }
}

<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\SiteSetting;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class DynamicQrisService
{
    public const SETTING_STATIC_PAYLOAD = 'qris_static_payload';
    public const SETTING_WEBHOOK_SECRET = 'qris_webhook_secret';
    public const SETTING_UNIQUE_CODE_MIN = 'qris_unique_code_min'; // default 101
    public const SETTING_UNIQUE_CODE_MAX = 'qris_unique_code_max'; // default 499
    public const SETTING_EXPIRATION_HOURS = 'qris_expiration_hours'; // default 3

    // Default string QRIS Statis GoPay Merchant resmi Rumah Kita Net
    public const DEFAULT_GOPAY_QRIS = '00020101021126610014COM.GO-JEK.WWW01189360091438488266790210G8488266790303UMI51440014ID.CO.QRIS.WWW0215ID10243391315580303UMI5204481453033605802ID5925Rumah Kita Net , KALIANDA6015LAMPUNG SELATAN61053555162070703A016304AD83';

    /**
     * Ambil string QRIS statis yang tersimpan atau default GoPay Rumah Kita Net.
     */
    public function getStaticPayload(): string
    {
        $custom = SiteSetting::get(self::SETTING_STATIC_PAYLOAD);
        if ($custom && trim($custom) !== '') {
            return trim($custom);
        }

        return self::DEFAULT_GOPAY_QRIS;
    }

    /**
     * Hitung Checksum CRC16-CCITT (Polinomial 0x1021, Nilai Awal 0xFFFF).
     * Standar resmi EMVCo & ASPI Bank Indonesia.
     */
    public function calculateCrc16(string $data): string
    {
        $crc = 0xFFFF;
        $length = strlen($data);

        for ($i = 0; $i < $length; $i++) {
            $crc ^= (ord($data[$i]) << 8);
            for ($j = 0; $j < 8; $j++) {
                if ($crc & 0x8000) {
                    $crc = (($crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    $crc = ($crc << 1) & 0xFFFF;
                }
            }
        }

        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }

    /**
     * Mengonversi string QRIS Statis menjadi QRIS Dinamis ber-nominal pas.
     */
    public function convertStaticToDynamic(string $staticPayload, int|float $amount): string
    {
        // 1. Buang 4 karakter CRC lama di belakang
        $raw = substr(trim($staticPayload), 0, -4);

        // 2. Ubah Tag 01 dari '11' (statis) menjadi '12' (dinamis)
        if (str_contains($raw, '010211')) {
            $raw = str_replace('010211', '010212', $raw);
        }

        // 3. Format Tag 54 (Transaction Amount)
        $amtInt = (int) round($amount);
        $amtStr = (string) $amtInt;
        $tag54Len = str_pad((string) strlen($amtStr), 2, '0', STR_PAD_LEFT);
        $tag54 = "54{$tag54Len}{$amtStr}";

        // 4. Jika sudah ada Tag 54 lama, ganti. Jika belum, sisipkan tepat sebelum Tag 58 (5802ID)
        if (preg_match('/54\d{2}\d+/', $raw)) {
            $raw = preg_replace('/54\d{2}\d+/', $tag54, $raw, 1);
        } else {
            $pos58 = strpos($raw, '5802ID');
            if ($pos58 !== false) {
                $raw = substr($raw, 0, $pos58) . $tag54 . substr($raw, $pos58);
            } else {
                // Fallback: sisipkan sebelum 6304
                $pos63 = strrpos($raw, '6304');
                if ($pos63 !== false) {
                    $raw = substr($raw, 0, $pos63) . $tag54 . '6304';
                } else {
                    $raw .= $tag54 . '6304';
                }
            }
        }

        // 5. Pastikan string berakhiran dengan penanda tag CRC '6304'
        if (!str_ends_with($raw, '6304')) {
            $pos63 = strrpos($raw, '6304');
            if ($pos63 !== false) {
                $raw = substr($raw, 0, $pos63 + 4);
            } else {
                $raw .= '6304';
            }
        }

        // 6. Hitung ulang CRC16
        $newCrc = $this->calculateCrc16($raw);

        return $raw . $newCrc;
    }

    /**
     * Generate kode unik nominal agar tidak bentrok dengan transaksi pelanggan lain.
     */
    public function generateUniqueCode(int|float $baseAmount, ?int $excludeInvoiceId = null): int
    {
        $min = (int) SiteSetting::get(self::SETTING_UNIQUE_CODE_MIN, 101);
        $max = (int) SiteSetting::get(self::SETTING_UNIQUE_CODE_MAX, 499);
        $now = now();

        // Cari kode unik yang sedang aktif digunakan pada invoice pending lain
        $activeAmounts = Invoice::query()
            ->where('status', '!=', 'paid')
            ->whereNotNull('qris_expected_amount')
            ->where('qris_expired_at', '>', $now)
            ->when($excludeInvoiceId, fn($q) => $q->where('id', '!=', $excludeInvoiceId))
            ->pluck('qris_expected_amount')
            ->map(fn($amt) => (int) round($amt))
            ->flip();

        for ($i = 0; $i < 50; $i++) {
            $code = random_int($min, $max);
            $target = (int) round($baseAmount) + $code;
            if (!isset($activeAmounts[$target])) {
                return $code;
            }
        }

        return random_int($min, $max);
    }

    /**
     * Mempersiapkan QRIS Dinamis lengkap untuk sebuah Invoice.
     * Kode unik bersifat BAKU (permanen & tidak berubah-ubah) untuk invoice tersebut.
     */
    public function generateForInvoice(Invoice $invoice, bool $forceRegenerate = false): array
    {
        $baseAmount = (int) round((float) $invoice->amount);

        // 1. Jika invoice sudah memiliki kode unik baku dan payload yang sudah siap, selalu gunakan yang sudah ada (baku & permanen)
        if (
            $invoice->qris_unique_code &&
            $invoice->qris_expected_amount &&
            $invoice->qris_dynamic_payload &&
            ((int) round((float) $invoice->qris_expected_amount) - (int) $invoice->qris_unique_code === $baseAmount)
        ) {
            $expectedAmount = (int) round((float) $invoice->qris_expected_amount);
            $uniqueCode = (int) $invoice->qris_unique_code;
            $payload = $invoice->qris_dynamic_payload;

            return [
                'invoice_id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
                'base_amount' => $baseAmount,
                'unique_code' => $uniqueCode,
                'expected_amount' => $expectedAmount,
                'expired_at' => $invoice->qris_expired_at?->toIso8601String() ?? now()->addYears(1)->toIso8601String(),
                'payload' => $payload,
                'qr_data_uri' => $this->renderQrDataUri($payload),
            ];
        }

        // 2. Jika kode unik sudah pernah dibuat sebelumnya, pertahankan kode unik baku tersebut (tidak boleh diacak ulang)
        if ($invoice->qris_unique_code) {
            $uniqueCode = (int) $invoice->qris_unique_code;
        } else {
            // Hanya buat kode unik baru jika invoice benar-benar belum memiliki kode unik
            $uniqueCode = $this->generateUniqueCode($baseAmount, $invoice->id);
        }

        $expectedAmount = $baseAmount + $uniqueCode;
        $expHours = (int) SiteSetting::get(self::SETTING_EXPIRATION_HOURS, 24);
        $expiredAt = now()->addHours($expHours);

        $staticPayload = $this->getStaticPayload();
        $dynamicPayload = $this->convertStaticToDynamic($staticPayload, $expectedAmount);

        // Simpan ke database invoice secara permanen
        $invoice->update([
            'qris_unique_code' => $uniqueCode,
            'qris_expected_amount' => $expectedAmount,
            'qris_expired_at' => $expiredAt,
            'qris_dynamic_payload' => $dynamicPayload,
        ]);

        return [
            'invoice_id' => $invoice->id,
            'invoice_link' => $invoice->invoice_link,
            'base_amount' => $baseAmount,
            'unique_code' => $uniqueCode,
            'expected_amount' => $expectedAmount,
            'expired_at' => $expiredAt->toIso8601String(),
            'payload' => $dynamicPayload,
            'qr_data_uri' => $this->renderQrDataUri($dynamicPayload),
        ];
    }

    /**
     * Render string QRIS menjadi gambar SVG Base64 Data-URI secara native di PHP.
     */
    public function renderQrDataUri(string $payload, int $size = 240): string
    {
        try {
            $renderer = new ImageRenderer(
                new RendererStyle($size, 1),
                new SvgImageBackEnd()
            );
            $writer = new Writer($renderer);
            $svg = $writer->writeString($payload);

            return 'data:image/svg+xml;base64,' . base64_encode($svg);
        } catch (\Throwable $e) {
            Log::warning('DynamicQrisService renderQrDataUri error: ' . $e->getMessage());
            return '';
        }
    }
}

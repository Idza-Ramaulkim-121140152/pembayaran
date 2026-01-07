<?php

namespace Database\Seeders;

use App\Models\PaymentMethod;
use Illuminate\Database\Seeder;

class PaymentMethodSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create default QRIS payment method
        PaymentMethod::firstOrCreate(
            ['type' => 'qris', 'is_default' => true],
            [
                'bank_name' => null,
                'account_name' => null,
                'account_number' => null,
                'qris_image' => null, // Will use /qr.jpg as fallback
                'instructions' => "1. Simpan atau screenshot kode QRIS di atas\n2. Buka aplikasi pembayaran (GoPay, OVO, Dana, LinkAja, dll)\n3. Pilih menu \"Scan QR\" lalu upload gambar QRIS\n4. Masukkan nominal sesuai tagihan\n5. Konfirmasi pembayaran setelah berhasil",
                'is_active' => true,
                'sort_order' => 0,
            ]
        );
    }
}

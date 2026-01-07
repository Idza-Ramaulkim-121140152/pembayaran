<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Promotion;
use App\Models\SiteSetting;

class PromotionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Hapus data lama jika ada
        Promotion::truncate();

        // Tambahkan promo dari brosur yang sudah ada
        $promotions = [
            [
                'title' => 'Promo Spesial Rumah Kita Net',
                'description' => 'Dapatkan penawaran terbaik internet cepat untuk rumah Anda',
                'image' => '/brosur/Brosur-1.png',
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'title' => 'Paket Internet Hemat',
                'description' => 'Internet cepat dengan harga terjangkau',
                'image' => '/brosur/Brosur-2.png',
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'title' => 'Promo Terbaru',
                'description' => 'Penawaran menarik untuk pelanggan baru',
                'image' => '/brosur/Brosur-3.jpg',
                'is_active' => true,
                'sort_order' => 3,
            ],
        ];

        foreach ($promotions as $promo) {
            Promotion::create($promo);
        }

        // Set default site settings
        $settings = [
            'company_name' => 'Rumah Kita Net',
            'tagline' => 'Internet Cepat untuk Keluarga Indonesia',
            'phone' => '081234567890',
            'whatsapp' => '081234567890',
            'email' => 'info@rumahkitanet.com',
            'address' => 'Jl. Contoh No. 123, Kota, Indonesia',
            'instagram' => 'rumahkitanet',
            'facebook' => 'rumahkitanet',
        ];

        foreach ($settings as $key => $value) {
            SiteSetting::set($key, $value);
        }
    }
}

<?php

namespace Database\Seeders;

use App\Models\Package;
use App\Models\SiteSetting;
use Illuminate\Database\Seeder;

class PackageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create default packages based on the brochure
        $packages = [
            [
                'name' => 'Bronze',
                'speed' => '10Mbps',
                'price' => 175000,
                'device_count' => '2-3 Perangkat',
                'features' => ['Unlimited', 'Tanpa FUP', 'Support 24/7'],
                'is_popular' => false,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'name' => 'Gold',
                'speed' => '20Mbps',
                'price' => 200000,
                'device_count' => '3-4 Perangkat',
                'features' => ['Unlimited', 'Tanpa FUP', 'Support 24/7', 'Prioritas'],
                'is_popular' => true,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'name' => 'Platinum',
                'speed' => '30Mbps',
                'price' => 250000,
                'device_count' => '4-5 Perangkat',
                'features' => ['Unlimited', 'Tanpa FUP', 'Support 24/7', 'Prioritas', 'Bonus IP Statik'],
                'is_popular' => false,
                'is_active' => true,
                'sort_order' => 3,
            ],
        ];

        foreach ($packages as $package) {
            Package::updateOrCreate(
                ['name' => $package['name']],
                $package
            );
        }

        // Create default site settings
        $settings = [
            'company_name' => 'Rumah Kita Network',
            'company_tagline' => 'Wifi Rumahan Murah dan Stabil',
            'company_phone' => '085158025553',
            'company_whatsapp' => '085158025553',
            'company_email' => 'info@rumahkitanet.com',
            'company_address' => '',
            'installation_fee' => '250000',
            'installation_promo' => 'GRATIS',
            'promo_text' => 'GRATIS BIAYA PEMASANGAN',
            'promo_period' => 'Berlaku 15 September Sampai 15 Oktober 2025',
            'hero_title' => 'Wifi Rumahan Murah dan Stabil',
            'hero_subtitle' => 'Unlimited Tanpa Batas Kuota atau FUP',
        ];

        foreach ($settings as $key => $value) {
            SiteSetting::set($key, $value);
        }
    }
}

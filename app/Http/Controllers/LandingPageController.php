<?php

namespace App\Http\Controllers;

use App\Models\Promotion;
use App\Models\Package;
use App\Models\SiteSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

use App\Models\MasterWilayahKecamatan;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\Odp;

class LandingPageController extends Controller
{
    /**
     * Get landing page data for public
     */
    public function getData()
    {
        $promotions = Promotion::active()->orderBy('sort_order')->get();
        $packages = Package::active()->get();
        
        $settings = [
            'company_name' => SiteSetting::get('company_name', 'Rumah Kita Network'),
            'company_tagline' => SiteSetting::get('company_tagline', 'Wifi Rumahan Murah dan Stabil'),
            'company_phone' => SiteSetting::get('company_phone', '+6285158025553'),
            'company_whatsapp' => SiteSetting::get('company_whatsapp', '+6285158025553'),
            'company_email' => SiteSetting::get('company_email', ''),
            'company_address' => SiteSetting::get('company_address', ''),
            'installation_fee' => SiteSetting::get('installation_fee', '250000'),
            'installation_promo' => SiteSetting::get('installation_promo', 'GRATIS'),
            'promo_text' => SiteSetting::get('promo_text', 'GRATIS BIAYA PEMASANGAN'),
            'promo_period' => SiteSetting::get('promo_period', ''),
            'hero_title' => SiteSetting::get('hero_title', 'Wifi Rumahan Murah dan Stabil'),
            'hero_subtitle' => SiteSetting::get('hero_subtitle', 'Unlimited Tanpa Batas Kuota atau FUP'),
        ];

        return response()->json([
            'promotions' => $promotions,
            'packages' => $packages,
            'settings' => $settings,
        ]);
    }

    /**
     * Get promo & public marketing data
     */
    public function getPromoData()
    {
        $promotions = Promotion::active()->orderBy('sort_order')->get();
        $packages = Package::active()->orderBy('price')->get()->map(function ($pkg) {
            $speedRaw = (string) $pkg->speed;
            $speedDisplay = str_ends_with(strtolower($speedRaw), 'mbps') ? $speedRaw : "{$speedRaw} Mbps";
            
            $price = (float) $pkg->price;
            $features = [
                'Unlimited Tanpa Kuota (Tanpa Batas FUP)',
                '100% Kabel Fiber Optic Cepat & Stabil',
                'GRATIS Peminjaman Router Wi-Fi',
                'Portal Mandiri Pelanggan (Ganti Sandi dari HP)',
                'Layanan & Bantuan Teknisi Lokal Siap Tanggap',
            ];

            if ($price >= 200000) {
                $features[] = 'Streaming 4K Ultra HD & Game Online Lancar';
            }
            if ($price >= 250000) {
                $features[] = 'Prioritas Bandwidth & Cocok Multi-Perangkat';
            }

            return [
                'id' => $pkg->id,
                'name' => $pkg->name,
                'speed' => $speedDisplay,
                'speed_raw' => $pkg->speed,
                'price' => $price,
                'price_formatted' => 'Rp ' . number_format($price, 0, ',', '.'),
                'max_devices' => $pkg->max_devices ?: ($price <= 177000 ? 4 : ($price <= 200000 ? 6 : 10)),
                'description' => $pkg->description ?: "Paket internet super cepat {$speedDisplay} cocok untuk kebutuhan keluarga dan rumah.",
                'is_popular' => str_contains(strtolower($pkg->name), 'gold') || str_contains(strtolower($pkg->name), '200k') || str_contains(strtolower($pkg->name), '25mbps') || str_contains(strtolower($pkg->name), '20mbps'),
                'features' => $features,
            ];
        });

        // Fetch covered coverage areas (Kecamatan -> Desa -> Dusun)
        $coverageAreas = MasterWilayahKecamatan::with(['desas.dusuns'])->get()->map(function ($kec) {
            return [
                'id' => $kec->id,
                'name' => $kec->name,
                'desas' => $kec->desas->map(function ($desa) {
                    return [
                        'id' => $desa->id,
                        'name' => $desa->name,
                        'dusuns' => $desa->dusuns->map(function ($dusun) {
                            return [
                                'id' => $dusun->id,
                                'name' => $dusun->name,
                            ];
                        }),
                    ];
                }),
            ];
        });

        $totalOdp = Odp::count();

        $settings = [
            'company_name' => SiteSetting::get('company_name', 'Rumah Kita Net'),
            'company_tagline' => SiteSetting::get('company_tagline', 'Internet Fiber Optic Cepat, Murah & Stabil'),
            'company_phone' => SiteSetting::get('company_phone', '085158025553'),
            'company_whatsapp' => SiteSetting::get('company_whatsapp', '6285158025553'),
            'company_email' => SiteSetting::get('company_email', 'cs@rumahkitanet.site'),
            'company_address' => SiteSetting::get('company_address', 'Kalianda, Lampung Selatan'),
            'installation_fee' => SiteSetting::get('installation_fee', '250000'),
            'installation_promo' => SiteSetting::get('installation_promo', 'GRATIS'),
            'promo_text' => SiteSetting::get('promo_text', 'PROMO SPESIAL: GRATIS BIAYA PEMASANGAN!'),
            'promo_period' => SiteSetting::get('promo_period', 'Bulan Ini'),
            'hero_title' => SiteSetting::get('hero_title', 'Internet Fiber Optic Cepat, Murah & Tanpa Batas Kuota'),
            'hero_subtitle' => SiteSetting::get('hero_subtitle', 'Nikmati streaming lancar, kerja & belajar dari rumah tanpa lag dengan jaringan 100% Fiber Optic.'),
        ];

        return response()->json([
            'success' => true,
            'promotions' => $promotions,
            'packages' => $packages,
            'coverage_areas' => $coverageAreas,
            'total_odp' => $totalOdp,
            'settings' => $settings,
        ]);
    }
}

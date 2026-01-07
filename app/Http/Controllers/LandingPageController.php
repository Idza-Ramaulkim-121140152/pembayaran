<?php

namespace App\Http\Controllers;

use App\Models\Promotion;
use App\Models\Package;
use App\Models\SiteSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
}

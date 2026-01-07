<?php

namespace App\Http\Controllers;

use App\Models\Promotion;
use App\Models\Package;
use App\Models\SiteSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PromoController extends Controller
{
    /**
     * Get all promotions for admin
     */
    public function index()
    {
        $promotions = Promotion::orderBy('sort_order')->get();
        return response()->json(['data' => $promotions]);
    }

    /**
     * Store new promotion
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'image' => 'nullable|image|max:5120',
            'banner_image' => 'nullable|image|max:5120',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        if ($request->hasFile('image')) {
            $validated['image'] = $request->file('image')->store('promotions', 'public');
        }

        if ($request->hasFile('banner_image')) {
            $validated['banner_image'] = $request->file('banner_image')->store('promotions', 'public');
        }

        $promotion = Promotion::create($validated);

        return response()->json(['data' => $promotion, 'message' => 'Promo berhasil ditambahkan'], 201);
    }

    /**
     * Update promotion
     */
    public function update(Request $request, Promotion $promotion)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'image' => 'nullable|image|max:5120',
            'banner_image' => 'nullable|image|max:5120',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        if ($request->hasFile('image')) {
            // Delete old image
            if ($promotion->image) {
                Storage::disk('public')->delete($promotion->image);
            }
            $validated['image'] = $request->file('image')->store('promotions', 'public');
        }

        if ($request->hasFile('banner_image')) {
            if ($promotion->banner_image) {
                Storage::disk('public')->delete($promotion->banner_image);
            }
            $validated['banner_image'] = $request->file('banner_image')->store('promotions', 'public');
        }

        $promotion->update($validated);

        return response()->json(['data' => $promotion, 'message' => 'Promo berhasil diperbarui']);
    }

    /**
     * Delete promotion
     */
    public function destroy(Promotion $promotion)
    {
        if ($promotion->image) {
            Storage::disk('public')->delete($promotion->image);
        }
        if ($promotion->banner_image) {
            Storage::disk('public')->delete($promotion->banner_image);
        }

        $promotion->delete();

        return response()->json(['message' => 'Promo berhasil dihapus']);
    }

    /**
     * Toggle promotion active status
     */
    public function toggleActive(Promotion $promotion)
    {
        $promotion->update(['is_active' => !$promotion->is_active]);
        return response()->json(['data' => $promotion]);
    }

    // ============ PACKAGES ============

    /**
     * Get all packages
     */
    public function packages()
    {
        $packages = Package::orderBy('sort_order')->get();
        return response()->json(['data' => $packages]);
    }

    /**
     * Store new package
     */
    public function storePackage(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'speed' => 'required|string|max:50',
            'price' => 'required|numeric',
            'device_count' => 'nullable|string',
            'features' => 'nullable|array',
            'is_popular' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $package = Package::create($validated);

        return response()->json(['data' => $package, 'message' => 'Paket berhasil ditambahkan'], 201);
    }

    /**
     * Update package
     */
    public function updatePackage(Request $request, Package $package)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'speed' => 'required|string|max:50',
            'price' => 'required|numeric',
            'device_count' => 'nullable|string',
            'features' => 'nullable|array',
            'is_popular' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $package->update($validated);

        return response()->json(['data' => $package, 'message' => 'Paket berhasil diperbarui']);
    }

    /**
     * Delete package
     */
    public function destroyPackage(Package $package)
    {
        $package->delete();
        return response()->json(['message' => 'Paket berhasil dihapus']);
    }

    // ============ SETTINGS ============

    /**
     * Get all settings
     */
    public function settings()
    {
        $settings = SiteSetting::all()->pluck('value', 'key');
        return response()->json(['data' => $settings]);
    }

    /**
     * Update settings
     */
    public function updateSettings(Request $request)
    {
        $data = $request->all();
        
        foreach ($data as $key => $value) {
            SiteSetting::set($key, $value);
        }

        return response()->json(['message' => 'Pengaturan berhasil disimpan']);
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Package;
use App\Services\MikroTikService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PackageController extends Controller
{
    /**
     * GET /api/packages
     * List all packages (for admin management)
     */
    public function index()
    {
        $packages = Package::orderBy('sort_order')->orderBy('name')->get();
        return response()->json(['data' => $packages]);
    }

    /**
     * GET /api/packages/active
     * List only active packages (for dropdowns in forms)
     */
    public function active()
    {
        $packages = Package::active()->get();
        return response()->json(['data' => $packages]);
    }

    /**
     * GET /api/public/packages
     * List only active packages configured for public registration
     */
    public function publicPackages()
    {
        $packages = Package::publicRegistration()->get();
        return response()->json(['data' => $packages]);
    }

    /**
     * POST /api/packages/{package}/toggle-public
     * Quick toggle for public registration visibility
     */
    public function togglePublic(Package $package)
    {
        $package->show_in_public_registration = !($package->show_in_public_registration ?? true);
        $package->save();

        return response()->json([
            'success' => true,
            'data' => $package,
            'message' => $package->show_in_public_registration
                ? 'Paket sekarang TAMPIL di formulir pendaftaran publik.'
                : 'Paket DISEMBUNYIKAN dari formulir pendaftaran publik.',
        ]);
    }

    /**
     * POST /api/packages
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'speed' => 'required|string|max:50',
            'mikrotik_profile' => 'nullable|string|max:255',
            'price' => 'required|numeric|min:0',
            'device_count' => 'nullable|string|max:50',
            'features' => 'nullable|array',
            'description' => 'nullable|string|max:500',
            'is_popular' => 'boolean',
            'is_active' => 'boolean',
            'show_in_public_registration' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $package = Package::create($validated);

        return response()->json([
            'data' => $package,
            'message' => 'Paket berhasil ditambahkan',
        ], 201);
    }

    /**
     * PUT /api/packages/{package}
     */
    public function update(Request $request, Package $package)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'speed' => 'required|string|max:50',
            'mikrotik_profile' => 'nullable|string|max:255',
            'price' => 'required|numeric|min:0',
            'device_count' => 'nullable|string|max:50',
            'features' => 'nullable|array',
            'description' => 'nullable|string|max:500',
            'is_popular' => 'boolean',
            'is_active' => 'boolean',
            'show_in_public_registration' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $package->update($validated);

        return response()->json([
            'data' => $package,
            'message' => 'Paket berhasil diperbarui',
        ]);
    }

    /**
     * DELETE /api/packages/{package}
     */
    public function destroy(Package $package)
    {
        $package->delete();
        return response()->json(['message' => 'Paket berhasil dihapus']);
    }

    /**
     * GET /api/mikrotik/profiles
     * Fetch PPPoE profiles directly from MikroTik router
     */
    public function mikrotikProfiles()
    {
        try {
            $mikrotik = new MikroTikService();
            $mikrotik->connect();
            $profiles = $mikrotik->command('/ppp/profile/print');
            $mikrotik->disconnect();

            $result = [];
            foreach ($profiles as $profile) {
                $name = $profile['name'] ?? '';
                // Skip default and isolir profiles
                if (in_array(strtolower($name), ['default', 'default-encryption'])) {
                    continue;
                }
                $result[] = [
                    'name' => $name,
                    'local_address' => $profile['local-address'] ?? '',
                    'remote_address' => $profile['remote-address'] ?? '',
                    'rate_limit' => $profile['rate-limit'] ?? '',
                ];
            }

            return response()->json(['data' => $result]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch MikroTik profiles: ' . $e->getMessage());
            return response()->json([
                'data' => [],
                'error' => 'Gagal mengambil profil dari MikroTik: ' . $e->getMessage(),
            ], 500);
        }
    }
}

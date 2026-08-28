<?php

namespace App\Http\Controllers;

use App\Models\CustomerWifiAllowedPublicIp;
use App\Models\CustomerWifiSettingLink;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class CustomerWifiLinkMasterController extends Controller
{
    private function ensureReady(): void
    {
        abort_unless(
            Schema::hasTable('customer_wifi_setting_links') && Schema::hasTable('customer_wifi_allowed_public_ips'),
            503,
            'Master link WiFi pelanggan belum siap. Jalankan migrasi terlebih dahulu.'
        );
    }

    public function index()
    {
        $this->ensureReady();

        return response()->json([
            'links' => CustomerWifiSettingLink::query()
                ->orderBy('sort_order')
                ->orderBy('title')
                ->get(),
            'allowed_public_ips' => CustomerWifiAllowedPublicIp::query()
                ->orderBy('ip_address')
                ->get(),
            'summary' => [
                'active_link_count' => CustomerWifiSettingLink::query()->where('is_active', true)->count(),
                'active_ip_count' => CustomerWifiAllowedPublicIp::query()->where('is_active', true)->count(),
            ],
        ]);
    }

    public function storeLink(Request $request)
    {
        $this->ensureReady();

        $link = CustomerWifiSettingLink::query()->create($this->validateLink($request));

        return response()->json([
            'message' => 'Link WiFi pelanggan berhasil ditambahkan.',
            'data' => $link,
        ], 201);
    }

    public function updateLink(Request $request, CustomerWifiSettingLink $link)
    {
        $this->ensureReady();

        $link->update($this->validateLink($request));

        return response()->json([
            'message' => 'Link WiFi pelanggan berhasil diperbarui.',
            'data' => $link->fresh(),
        ]);
    }

    public function destroyLink(CustomerWifiSettingLink $link)
    {
        $this->ensureReady();

        $link->delete();

        return response()->json(['message' => 'Link WiFi pelanggan berhasil dihapus.']);
    }

    public function storeIp(Request $request)
    {
        $this->ensureReady();

        $ip = CustomerWifiAllowedPublicIp::query()->create($this->validateIp($request));

        return response()->json([
            'message' => 'IP publik valid berhasil ditambahkan.',
            'data' => $ip,
        ], 201);
    }

    public function updateIp(Request $request, CustomerWifiAllowedPublicIp $ip)
    {
        $this->ensureReady();

        $ip->update($this->validateIp($request, $ip->id));

        return response()->json([
            'message' => 'IP publik valid berhasil diperbarui.',
            'data' => $ip->fresh(),
        ]);
    }

    public function destroyIp(CustomerWifiAllowedPublicIp $ip)
    {
        $this->ensureReady();

        $ip->delete();

        return response()->json(['message' => 'IP publik valid berhasil dihapus.']);
    }

    private function validateLink(Request $request): array
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'url' => ['required', 'url', 'max:2048'],
            'description' => ['nullable', 'string'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return [
            'title' => trim((string) $validated['title']),
            'url' => trim((string) $validated['url']),
            'description' => isset($validated['description']) ? trim((string) $validated['description']) : null,
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ];
    }

    private function validateIp(Request $request, ?int $ignoreId = null): array
    {
        $validated = $request->validate([
            'ip_address' => [
                'required',
                'ip',
                'max:45',
                Rule::unique('customer_wifi_allowed_public_ips', 'ip_address')->ignore($ignoreId),
            ],
            'notes' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return [
            'ip_address' => trim((string) $validated['ip_address']),
            'notes' => isset($validated['notes']) ? trim((string) $validated['notes']) : null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ];
    }
}

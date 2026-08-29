<?php

namespace App\Http\Controllers;

use App\Services\MikroTikService;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Exception;

class IsolirController extends Controller
{
    /**
     * Get all isolated devices (secrets with profile "isolir" from MikroTik)
     */
    public function index(Request $request)
    {
        try {
            $isolatedSecrets = Cache::remember('mikrotik:isolated_secrets_raw', 45, function () {
                $mikrotik = new MikroTikService();
                return $mikrotik->getIsolatedSecrets();
            });

            $usernames = collect($isolatedSecrets)
                ->pluck('name')
                ->map(fn ($name) => trim((string) $name))
                ->filter()
                ->values()
                ->all();

            $customersByUsername = Customer::whereIn('pppoe_username', $usernames)
                ->get()
                ->keyBy(fn ($c) => strtolower(trim((string) $c->pppoe_username)));

            // Enrich with customer data if available
            $enrichedData = [];
            foreach ($isolatedSecrets as $secret) {
                $username = (string) ($secret['name'] ?? '');
                $normalizedUsername = strtolower(trim($username));
                $customer = $customersByUsername->get($normalizedUsername);

                $enrichedData[] = [
                    'username' => $username,
                    'password' => $secret['password'] ?? '',
                    'profile' => $secret['profile'] ?? '',
                    'remote_address' => $secret['remote_address'] ?? null,
                    'service' => $secret['service'] ?? null,
                    'disabled' => $secret['disabled'] ?? null,
                    'customer' => $customer ? [
                        'id' => $customer->id,
                        'name' => $customer->name,
                        'phone' => $customer->phone,
                        'address' => $customer->address,
                        'package_type' => $customer->package_type,
                        'due_date' => $customer->due_date,
                    ] : null,
                ];
            }
            
            // Return JSON for API
            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => true,
                    'data' => $enrichedData,
                    'count' => count($enrichedData)
                ]);
            }
            
            // Return view for web
            return view('isolir.index', ['isolatedDevices' => $enrichedData]);
            
        } catch (Exception $e) {
            \Log::error('Failed to get isolated devices', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            if ($request->wantsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal mengambil data perangkat isolir: ' . $e->getMessage()
                ], 500);
            }
            
            return back()->with('error', 'Gagal mengambil data perangkat isolir: ' . $e->getMessage());
        }
    }
}

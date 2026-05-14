<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerPackageHistory;
use App\Models\Odp;
use App\Models\Package;
use App\Services\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class CustomerController extends Controller
{
    private const DEFAULT_MOBILE_PASSWORD = '12345678';

    public function __construct(private AuditLogService $auditLogService)
    {
    }

    public function list()
    {
        $query = Customer::query();
        $search = request('search');
        if ($search) {
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                  ->orWhere('pppoe_username', 'like', "%$search%")
                  ->orWhere('phone', 'like', "%$search%")
                  ->orWhere('email', 'like', "%$search%");
            });
        }
        
        // Check if this is an API request
        if (request('api') || request()->wantsJson()) {
            $customers = $query->get();
            $isolatedUsernameMap = [];
            $today = Carbon::today()->startOfDay();

            $includeLiveStatus = request()->boolean('include_live_status', true);

            // Sinkronisasi status realtime hanya saat diminta agar list pelanggan bisa tampil lebih cepat.
            if ($includeLiveStatus) {
                try {
                    $mikrotik = new \App\Services\MikroTikService();
                    $mikrotik->connect();
                    $secrets = $mikrotik->getAllPPPoESecrets();
                    $mikrotik->disconnect();

                    if ($secrets !== null) {
                        foreach ($secrets as $secretUsername => $secretData) {
                            $normalizedUsername = strtolower(trim((string) $secretUsername));
                            $profile = strtolower(trim((string) ($secretData['profile'] ?? '')));
                            if ($normalizedUsername !== '' && $profile === 'isolir') {
                                $isolatedUsernameMap[$normalizedUsername] = true;
                            }
                        }

                        foreach ($customers as $customer) {
                            if (!empty($customer->pppoe_username)) {
                                $secret = $secrets[$customer->pppoe_username] ?? null;
                                // Active = secret exists AND disabled=no
                                $isActive = $secret && ($secret['disabled'] ?? 'false') !== 'true';

                                if ($customer->is_active != $isActive) {
                                    $customer->is_active = $isActive;
                                    $customer->saveQuietly();
                                }
                            } else {
                                // No PPPoE username = inactive
                                if ($customer->is_active) {
                                    $customer->is_active = false;
                                    $customer->saveQuietly();
                                }
                            }
                        }
                    }
                } catch (\Exception $e) {
                    \Log::warning('Could not sync is_active from MikroTik', ['error' => $e->getMessage()]);
                    // Fall back to DB values silently
                }
            }

            foreach ($customers as $customer) {
                $normalizedUsername = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                $isOverdue = $customer->due_date
                    ? Carbon::parse($customer->due_date)->startOfDay()->lt($today)
                    : false;
                $isIsolated = $normalizedUsername !== '' && isset($isolatedUsernameMap[$normalizedUsername]);
                $isServiceInactive = $isOverdue || $isIsolated;

                $customer->setAttribute('is_service_overdue', $isOverdue);
                $customer->setAttribute('is_service_isolated', $isIsolated);
                $customer->setAttribute('is_service_inactive', $isServiceInactive);
                $customer->setAttribute('is_service_active', !$isServiceInactive);
            }
            
            return response()->json(['data' => $customers]);
        }
        
        $sort = request('sort');
        if ($sort === 'name_asc') {
            $query->orderBy('name', 'asc');
        } elseif ($sort === 'name_desc') {
            $query->orderBy('name', 'desc');
        } elseif ($sort === 'due_asc') {
            $query->orderBy('due_date', 'asc');
        } elseif ($sort === 'due_desc') {
            $query->orderBy('due_date', 'desc');
        } elseif ($sort === 'pppoe_asc') {
            $query->orderBy('pppoe_username', 'asc');
        } elseif ($sort === 'pppoe_desc') {
            $query->orderBy('pppoe_username', 'desc');
        } elseif ($sort === 'wa_asc') {
            $query->orderBy('phone', 'asc');
        } elseif ($sort === 'wa_desc') {
            $query->orderBy('phone', 'desc');
        }
        $customers = $query->get();
        return view('customers.index', compact('customers'));
    }

    public function activeStatusBulk(Request $request)
    {
        $validated = $request->validate([
            'customer_ids' => ['nullable', 'array'],
            'customer_ids.*' => ['integer'],
        ]);

        $customerIds = collect($validated['customer_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        $query = Customer::query();
        if (!empty($customerIds)) {
            $query->whereIn('id', $customerIds);
        }

        $customers = $query->get(['id', 'pppoe_username', 'due_date', 'is_active']);
        $today = Carbon::today()->startOfDay();
        $statusMap = [];

        try {
            $mikrotik = new \App\Services\MikroTikService();
            $mikrotik->connect();
            $secrets = $mikrotik->getAllPPPoESecrets();
            $mikrotik->disconnect();

            $secrets = is_array($secrets) ? $secrets : [];
            $normalizedSecrets = [];
            foreach ($secrets as $username => $secret) {
                $normalizedUsername = strtolower(trim((string) $username));
                if ($normalizedUsername !== '') {
                    $normalizedSecrets[$normalizedUsername] = $secret;
                }
            }

            foreach ($customers as $customer) {
                $normalizedUsername = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                $secret = $normalizedUsername !== '' ? ($normalizedSecrets[$normalizedUsername] ?? null) : null;

                $isActive = $secret && (($secret['disabled'] ?? 'false') !== 'true');
                $profile = strtolower(trim((string) ($secret['profile'] ?? '')));
                $isIsolated = $normalizedUsername !== '' && $profile === 'isolir';
                $isOverdue = $customer->due_date
                    ? Carbon::parse($customer->due_date)->startOfDay()->lt($today)
                    : false;
                $isServiceInactive = $isOverdue || $isIsolated;

                if ($customer->is_active != $isActive) {
                    $customer->is_active = $isActive;
                    $customer->saveQuietly();
                }

                $statusMap[$customer->id] = [
                    'is_active' => $isActive,
                    'is_service_overdue' => $isOverdue,
                    'is_service_isolated' => $isIsolated,
                    'is_service_inactive' => $isServiceInactive,
                    'is_service_active' => !$isServiceInactive,
                ];
            }

            return response()->json([
                'data' => $statusMap,
                'meta' => ['live' => true],
            ]);
        } catch (\Exception $e) {
            \Log::warning('Could not load active status bulk from MikroTik', ['error' => $e->getMessage()]);

            foreach ($customers as $customer) {
                $isOverdue = $customer->due_date
                    ? Carbon::parse($customer->due_date)->startOfDay()->lt($today)
                    : false;
                $isServiceInactive = $isOverdue;

                $statusMap[$customer->id] = [
                    'is_active' => (bool) $customer->is_active,
                    'is_service_overdue' => $isOverdue,
                    'is_service_isolated' => false,
                    'is_service_inactive' => $isServiceInactive,
                    'is_service_active' => !$isServiceInactive,
                ];
            }

            return response()->json([
                'data' => $statusMap,
                'meta' => [
                    'live' => false,
                    'error' => 'Gagal mengambil status realtime dari MikroTik.',
                ],
            ]);
        }
    }

    public function show(Customer $customer)
    {
        // Get last paid invoice
        $lastPaidInvoice = $customer->invoices()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->orderBy('paid_at', 'desc')
            ->first();
        
        // Calculate active until (due_date + 30 days from last payment, or use due_date)
        $activeUntil = null;
        if ($lastPaidInvoice && $lastPaidInvoice->paid_at) {
            $activeUntil = \Carbon\Carbon::parse($lastPaidInvoice->paid_at)->addDays(30)->format('Y-m-d');
        } elseif ($customer->due_date) {
            $activeUntil = $customer->due_date;
        }
        
        $customerData = $customer->toArray();
        $customerData['last_payment_date'] = $lastPaidInvoice ? \Carbon\Carbon::parse($lastPaidInvoice->paid_at)->format('Y-m-d') : null;
        $customerData['active_until'] = $activeUntil;
        $customerData['home_router_password_configured'] = !empty($customer->getRawOriginal('home_router_password'));
        
        return response()->json(['data' => $customerData]);
    }

    public function edit($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $odps = \App\Models\Odp::orderBy('nama')->get();
        return view('customers.edit', compact('customer', 'odps'));
    }

    public function update(Request $request, $customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $validated = $request->validate($this->customerValidationRules(false));
        $validated = $this->normalizeHomeRouterInput($validated, $customer);
        $validated = $this->syncLegacyReferences($validated, $customer);
        $validated = $this->ensureMobilePasswordDefaults($validated, $customer);

        $customer->update($validated);
        
        if ($request->wantsJson() || $request->is('pelanggan/*')) {
            return response()->json([
                'success' => true,
                'data' => $customer, 
                'message' => 'Customer updated successfully'
            ]);
        }
        return redirect()->route('customers.list')->with('success', 'Data pelanggan berhasil diupdate.');
    }

    public function riwayat($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $invoices = $customer->invoices()->orderByDesc('invoice_date')->get();
        return view('customers.riwayat', compact('customer', 'invoices'));
    }

    public function riwayatApi(Customer $customer)
    {
        $invoices = $customer->invoices()->orderByDesc('invoice_date')->get();
        return response()->json([
            'customer' => $customer,
            'invoices' => $invoices
        ]);
    }

    public function create()
    {
        $odps = \App\Models\Odp::orderBy('nama')->get();
        return view('customers.create', compact('odps'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate($this->customerValidationRules(true));
        $validated = $this->normalizeHomeRouterInput($validated);
        $validated = $this->syncLegacyReferences($validated);

        $validated['is_active'] = $validated['is_active'] ?? true;
        $validated = $this->ensureMobilePasswordDefaults($validated);
        
        // Auto-calculate due_date = activation_date + 30 days
        if (!empty($validated['activation_date']) && empty($validated['due_date'])) {
            $activationDate = \Carbon\Carbon::parse($validated['activation_date']);
            $validated['due_date'] = $activationDate->addDays(30)->format('Y-m-d');
        }
        
        // Create PPPoE secret in MikroTik if not custom package
        $secretInfo = null;
        $packageType = $validated['package_type'] ?? null;
        
        \Log::info('Processing customer activation', [
            'name' => $validated['name'],
            'area_code' => $validated['area_code'],
            'package_type' => $packageType
        ]);
        
        if ($packageType && !in_array(strtolower($packageType), ['custom', 'paket custom'])) {
            try {
                \Log::info('Attempting to create PPPoE secret');
                
                $mikrotik = new \App\Services\MikroTikService();
                
                // Generate username: area_code + first_name + 2 random digits
                $firstName = explode(' ', $validated['name'])[0];
                $firstName = strtolower($firstName);
                $areaCode = strtoupper($validated['area_code']);
                $randomDigits = str_pad(rand(0, 99), 2, '0', STR_PAD_LEFT);
                $username = $areaCode . '-' . $firstName . $randomDigits;
                
                \Log::info('Generated username', ['username' => $username]);
                
                // Get next available IP
                $remoteAddress = $mikrotik->getNextIpAddress();
                \Log::info('Next IP address', ['ip' => $remoteAddress]);
                
                // Resolve MikroTik profile: first check Package table, then fallback to resolveProfileName
                $dbPackage = Package::where('name', $packageType)->first();
                if ($dbPackage && $dbPackage->mikrotik_profile) {
                    $profile = $dbPackage->mikrotik_profile;
                    \Log::info('Profile resolved from packages table', ['package' => $packageType, 'profile' => $profile]);
                } else {
                    $profile = $mikrotik->resolveProfileName($packageType);
                    \Log::info('Profile resolved via MikroTik lookup', ['package' => $packageType, 'profile' => $profile]);
                }
                
                // Create secret
                $secretInfo = $mikrotik->createPPPoESecret(
                    $username,
                    'admin',
                    'pppoe',
                    $profile,
                    $remoteAddress
                );
                
                \Log::info('Secret created successfully', ['secret' => $secretInfo]);
                
                // Update validated data with generated username and resolved profile
                $validated['pppoe_username'] = $username;
                $validated['mikrotik_profile'] = $profile;
                
            } catch (\Exception $e) {
                \Log::error('Failed to create MikroTik secret: ' . $e->getMessage(), [
                    'exception' => $e,
                    'trace' => $e->getTraceAsString()
                ]);
                // Continue with customer creation even if MikroTik fails
                $secretInfo = ['error' => $e->getMessage()];
            }
        } else {
            \Log::info('Skipping secret creation', ['reason' => 'Custom package or no package selected']);
        }
        
        $customer = Customer::create($validated);
        
        \Log::info('Customer created', [
            'id' => $customer->id,
            'has_secret' => !is_null($secretInfo),
            'secret_info' => $secretInfo
        ]);
        
        // Always return JSON for API requests (check Accept header or api prefix)
        if ($request->wantsJson() || $request->is('api/*') || $request->is('pelanggan')) {
            return response()->json([
                'success' => true,
                'data' => $customer, 
                'secret' => $secretInfo,
                'message' => 'Customer created successfully'
            ], 201);
        }
        return redirect()->route('billing.index')->with('success', 'Pelanggan berhasil diaktivasi.');
    }

    public function getSecret($customerId)
    {
        \Log::info('Getting secret for customer', ['id' => $customerId]);
        
        $customer = Customer::find($customerId);
        
        if (!$customer) {
            \Log::error('Customer not found', ['id' => $customerId]);
            return response()->json([
                'success' => false,
                'message' => 'Customer not found'
            ], 404);
        }
        
        if (!$customer->pppoe_username) {
            \Log::warning('Customer has no PPPoE username', ['id' => $customerId]);
            return response()->json([
                'success' => false,
                'message' => 'Customer does not have PPPoE username'
            ], 404);
        }

        try {
            \Log::info('Fetching secret from MikroTik', ['username' => $customer->pppoe_username]);
            
            $mikrotik = new \App\Services\MikroTikService();
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            
            if (!$secret) {
                \Log::warning('Secret not found in MikroTik', ['username' => $customer->pppoe_username]);
                return response()->json([
                    'success' => false,
                    'message' => 'PPPoE secret not found in MikroTik'
                ], 404);
            }
            
            // Check if user is currently connected (active)
            $isConnected = false;
            try {
                $activeConnections = $mikrotik->getActivePPPoEConnections();
                foreach ($activeConnections as $conn) {
                    if (isset($conn['name']) && $conn['name'] === $customer->pppoe_username) {
                        $isConnected = true;
                        break;
                    }
                }
            } catch (\Exception $e) {
                \Log::error('Failed to check active connections', ['error' => $e->getMessage()]);
            }
            
            // Add connection status to secret data
            $secret['is_connected'] = $isConnected;
            
            // Remove sensitive password from log and response
            $safeSecret = $secret;
            unset($safeSecret['password']);
            
            \Log::info('Secret found', [
                'username' => $customer->pppoe_username, 
                'is_connected' => $isConnected,
            ]);
            
            return response()->json([
                'success' => true,
                'data' => $safeSecret,
                'customer' => [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'area_code' => $customer->area_code,
                    'package_type' => $customer->package_type,
                ]
            ]);
        } catch (\Exception $e) {
            \Log::error('Error getting secret', [
                'customer_id' => $customerId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to get secret: ' . $e->getMessage()
            ], 500);
        }
    }

    public function giveCompensation(Request $request, $customerId)
    {
        try {
            $customer = Customer::findOrFail($customerId);
            
            $request->validate([
                'due_date' => 'required|date',
            ]);
            
            $oldDueDate = $customer->due_date;
            $customer->due_date = $request->due_date;
            $customer->save();
            
            \Log::info('Compensation given', [
                'customer_id' => $customerId,
                'customer_name' => $customer->name,
                'old_due_date' => $oldDueDate,
                'new_due_date' => $customer->due_date
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Kompensasi berhasil diberikan',
                'data' => [
                    'old_due_date' => $oldDueDate,
                    'new_due_date' => $customer->due_date,
                    'customer' => $customer
                ]
            ]);
        } catch (\Exception $e) {
            \Log::error('Failed to give compensation', [
                'customer_id' => $customerId,
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'success' => false,
                'message' => 'Gagal memberikan kompensasi: ' . $e->getMessage()
            ], 500);
        }
    }

    public function updateServicePackage(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'package_id' => ['required', 'integer', 'exists:packages,id'],
        ]);

        $package = Package::query()
            ->where('id', $validated['package_id'])
            ->where('is_active', true)
            ->first();

        if (!$package) {
            return $this->servicePackageErrorResponse(
                'Paket tidak ditemukan atau sedang nonaktif.',
                'PACKAGE_NOT_ACTIVE',
                false,
                'contact_admin',
                422
            );
        }

        if (empty($customer->pppoe_username)) {
            return $this->servicePackageErrorResponse(
                'Pelanggan belum memiliki username PPPoE.',
                'PPPOE_USERNAME_MISSING',
                false,
                'open_edit',
                422
            );
        }

        $targetProfile = trim((string) ($package->mikrotik_profile ?: $package->name));
        if ($targetProfile === '') {
            return $this->servicePackageErrorResponse(
                'Profil MikroTik untuk paket ini tidak valid.',
                'MIKROTIK_PROFILE_INVALID',
                false,
                'contact_admin',
                422
            );
        }

        $mikrotik = new \App\Services\MikroTikService();

        try {
            $mikrotik->connect();
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);

            if (!$secret || empty($secret['id'])) {
                return $this->servicePackageErrorResponse(
                    'Secret PPPoE pelanggan tidak ditemukan di MikroTik.',
                    'MIKROTIK_SECRET_NOT_FOUND',
                    false,
                    'check_mikrotik',
                    422
                );
            }

            $profiles = $mikrotik->command('/ppp/profile/print');
            $availableProfiles = [];
            foreach ($profiles as $profile) {
                $name = trim((string) ($profile['name'] ?? ''));
                if ($name !== '') {
                    $availableProfiles[] = $name;
                }
            }

            $resolvedProfile = $this->resolveMikrotikProfileName($targetProfile, $availableProfiles);
            if ($resolvedProfile === null) {
                return $this->servicePackageErrorResponse(
                    'Profile paket tidak ditemukan di MikroTik aktif.',
                    'MIKROTIK_PROFILE_NOT_FOUND',
                    false,
                    'check_mikrotik',
                    422
                );
            }

            $mikrotik->command('/ppp/secret/set', [
                '.id' => $secret['id'],
                'profile' => $resolvedProfile,
            ]);

            DB::transaction(function () use ($customer, $package, $resolvedProfile): void {
                $oldPackageId = $customer->package_id ? (int) $customer->package_id : null;
                $oldPackageLabel = (string) ($customer->package_type ?? '');

                $customer->package_type = $package->name;
                $customer->package_id = $package->id;
                $customer->custom_package = null;
                $customer->mikrotik_profile = $resolvedProfile;
                $customer->save();

                CustomerPackageHistory::create([
                    'customer_id' => $customer->id,
                    'old_package_id' => $oldPackageId,
                    'new_package_id' => $package->id,
                    'old_package_label' => $oldPackageLabel,
                    'new_package_label' => $package->name,
                    'effective_from' => now()->toDateString(),
                    'reason' => 'Update via customer service-package endpoint',
                    'changed_by' => auth()->id(),
                ]);
            });

            return response()->json([
                'message' => 'Paket layanan dan profile MikroTik berhasil diperbarui.',
                'data' => [
                    'customer' => $customer->fresh(),
                    'package' => $package,
                    'mikrotik' => [
                        'success' => true,
                        'profile' => $resolvedProfile,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            \Log::error('Failed to update customer service package', [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'package_id' => $package->id,
                'error' => $e->getMessage(),
            ]);

            return $this->servicePackageErrorResponse(
                'Gagal sinkronisasi profile ke MikroTik. Data pelanggan tidak diubah.',
                'MIKROTIK_SYNC_FAILED',
                true,
                'retry',
                500
            );
        } finally {
            try {
                $mikrotik->disconnect();
            } catch (\Throwable $disconnectError) {
                \Log::warning('Failed to disconnect MikroTik after update service package', [
                    'customer_id' => $customer->id,
                    'error' => $disconnectError->getMessage(),
                ]);
            }
        }
    }

    /**
     * @param array<int, string> $availableProfiles
     */
    private function resolveMikrotikProfileName(string $targetProfile, array $availableProfiles): ?string
    {
        if ($targetProfile === '') {
            return null;
        }

        if (in_array($targetProfile, $availableProfiles, true)) {
            return $targetProfile;
        }

        foreach ($availableProfiles as $profile) {
            if (strtolower($profile) === strtolower($targetProfile)) {
                return $profile;
            }
        }

        return null;
    }

    private function servicePackageErrorResponse(
        string $message,
        string $errorCode,
        bool $retryable,
        string $actionHint,
        int $statusCode
    ) {
        return response()->json([
            'message' => $message,
            'error_code' => $errorCode,
            'retryable' => $retryable,
            'action_hint' => $actionHint,
        ], $statusCode);
    }

    public function exportExcel()
    {
        try {
            $export = new \App\Exports\CustomersExport();
            $spreadsheet = $export->export();
            
            // Generate filename
            $filename = 'Data_Pelanggan_' . date('d-m-Y') . '.xlsx';
            
            // Create writer
            $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
            
            // Clear any output buffers
            if (ob_get_length()) {
                ob_end_clean();
            }
            
            // Set headers
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            header('Content-Disposition: attachment;filename="' . $filename . '"');
            header('Cache-Control: max-age=0');
            
            // Save to php://output
            $writer->save('php://output');
            exit;
            
        } catch (\Exception $e) {
            \Log::error('Failed to export customers', ['error' => $e->getMessage()]);
            
            if (request()->wantsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal export data: ' . $e->getMessage()
                ], 500);
            }
            
            return redirect()->back()->with('error', 'Gagal export data');
        }
    }

    public function destroy($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $customer->delete();
        
        if (request()->wantsJson()) {
            return response()->json(['message' => 'Customer deleted successfully']);
        }
        return redirect()->route('customers.list')->with('success', 'Pelanggan berhasil dihapus.');
    }

    private function customerValidationRules(bool $requireAreaCode): array
    {
        return [
            'name' => 'required|string|max:255',
            'area_code' => ($requireAreaCode ? 'required' : 'nullable') . '|string|max:10',
            'activation_date' => 'nullable|date',
            'due_date' => 'nullable|string|max:10',
            'gender' => 'nullable|in:male,female,Pria,Wanita',
            'address' => 'nullable|string',
            'package_type' => 'nullable|string',
            'custom_package' => 'nullable|string',
            'pppoe_username' => 'nullable|string|max:64',
            'odp' => 'nullable|string|max:64',
            'odp_id' => 'nullable|integer|exists:odps,id',
            'phone' => 'nullable|string|max:20',
            'installation_fee' => 'nullable|numeric',
            'email' => 'nullable|email',
            'package_id' => 'nullable|integer|exists:packages,id',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'is_active' => 'nullable|boolean',
            'home_router_type' => 'nullable|in:mikrotik,vsol_v2801rgw,global_gl01',
            'home_router_host' => 'nullable|string|max:255',
            'home_router_port' => 'nullable|integer|min:1|max:65535',
            'home_router_username' => 'nullable|string|max:255',
            'home_router_password' => 'nullable|string|max:255',
            'home_router_wan_interface' => 'nullable|string|max:64',
            'home_router_monitoring_enabled' => 'nullable|boolean',
        ];
    }

    private function normalizeHomeRouterInput(array $validated, ?Customer $customer = null): array
    {
        $nullableFields = [
            'home_router_type',
            'home_router_host',
            'home_router_port',
            'home_router_username',
            'home_router_wan_interface',
        ];

        foreach ($nullableFields as $field) {
            if (array_key_exists($field, $validated) && $validated[$field] === '') {
                $validated[$field] = null;
            }
        }

        if (isset($validated['home_router_type'])) {
            $validated['home_router_type'] = strtolower((string) $validated['home_router_type']);
        }

        if (($validated['home_router_monitoring_enabled'] ?? false) && empty($validated['home_router_type'])) {
            $validated['home_router_type'] = 'mikrotik';
        }

        if (($validated['home_router_monitoring_enabled'] ?? false) && empty($validated['home_router_port'])) {
            $validated['home_router_port'] = 8728;
        }

        if (array_key_exists('home_router_password', $validated)) {
            if ($validated['home_router_password'] === '' || $validated['home_router_password'] === null) {
                unset($validated['home_router_password']);
            }
        } elseif ($customer && !empty($customer->getRawOriginal('home_router_password'))) {
            unset($validated['home_router_password']);
        }

        return $validated;
    }

    private function ensureMobilePasswordDefaults(array $validated, ?Customer $customer = null): array
    {
        $isActive = (bool) ($validated['is_active'] ?? $customer?->is_active ?? true);

        if (!$isActive) {
            return $validated;
        }

        $hasExistingPassword = !empty($customer?->mobile_password);

        if (!$hasExistingPassword) {
            $validated['mobile_password'] = Hash::make(self::DEFAULT_MOBILE_PASSWORD);
            $validated['mobile_force_password_change'] = true;
            $validated['mobile_password_changed_at'] = null;
            $validated['mobile_password_reset_at'] = now();
            $validated['mobile_password_reset_meta'] = [
                'reason' => $customer ? 'activation_without_mobile_password' : 'new_active_customer',
            ];
        } else {
            $validated['mobile_password'] = $customer->mobile_password;
            $validated['mobile_force_password_change'] = $customer->mobile_force_password_change;
            $validated['mobile_password_changed_at'] = $customer->mobile_password_changed_at;
            $validated['mobile_password_reset_at'] = $customer->mobile_password_reset_at;
            $validated['mobile_password_reset_meta'] = $customer->mobile_password_reset_meta;
            $validated['mobile_password_reset_by_user_id'] = $customer->mobile_password_reset_by_user_id;
        }

        return $validated;
    }

    private function syncLegacyReferences(array $validated, ?Customer $customer = null): array
    {
        if (array_key_exists('odp_id', $validated)) {
            if (!empty($validated['odp_id'])) {
                $odp = Odp::query()->find((int) $validated['odp_id']);
                $validated['odp'] = $odp?->nama;
            } else {
                $validated['odp'] = null;
            }
        } elseif (!empty($validated['odp'])) {
            $odp = Odp::query()->where('nama', $validated['odp'])->first();
            $validated['odp_id'] = $odp?->id;
        } elseif ($customer && array_key_exists('odp', $validated) && empty($validated['odp'])) {
            $validated['odp_id'] = null;
        }

        if (array_key_exists('package_id', $validated)) {
            if (!empty($validated['package_id'])) {
                $package = Package::query()->find((int) $validated['package_id']);
                if ($package) {
                    $validated['package_type'] = $package->name;
                    $validated['custom_package'] = null;
                }
            } elseif (empty($validated['package_type'])) {
                $validated['package_type'] = null;
            }
        } elseif (!empty($validated['package_type'])) {
            $package = Package::query()->whereRaw('LOWER(name) = ?', [strtolower((string) $validated['package_type'])])->first();
            $validated['package_id'] = $package?->id;
        } elseif ($customer && array_key_exists('package_type', $validated) && empty($validated['package_type'])) {
            $validated['package_id'] = null;
        }

        return $validated;
    }
}

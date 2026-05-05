<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\Package;
use App\Models\PayrollProject;
use App\Models\PayrollProjectDetail;
use App\Models\SiteSetting;
use App\Services\FinancialLedgerService;
use App\Services\GoogleSheetsService;
use App\Services\InventoryService;
use App\Services\MikroTikService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Exception;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CustomerVerificationController extends Controller
{
    private const SETTING_DEFAULT_INSTALLATION_LABOR_FEE = 'default_installation_labor_fee_payroll';
    private const SETTING_DEFAULT_INSTALLATION_CABLE_RATE = 'default_installation_cable_rate_payroll';

    protected $sheetsService;
    protected $sheetsError;

    public function __construct()
    {
        try {
            $this->sheetsService = new GoogleSheetsService();
            $this->sheetsError = null;
        } catch (Exception $e) {
            \Log::error('Failed to initialize GoogleSheetsService: ' . $e->getMessage());
            $this->sheetsService = null;
            $this->sheetsError = $e->getMessage();
        }
    }

    /**
     * Get Google Form registration URL
     * 
     * @return \Illuminate\Http\JsonResponse
     */
    public function getFormUrl()
    {
        return response()->json([
            'form_url' => config('google.form_url', 'https://forms.gle/D7e6D1W5nJHsRiBC7')
        ]);
    }

    /**
     * Fetch pending customers from Google Sheets
     * 
     * @return \Illuminate\Http\JsonResponse
     */
    public function fetchPendingCustomers()
    {
        if (!$this->sheetsService) {
            return response()->json([
                'error' => 'Google Sheets integration is not configured',
                'message' => 'Please setup Google Sheets API credentials',
                'details' => $this->sheetsError,
            ], 503);
        }

        try {
            $pendingCustomers = $this->sheetsService->fetchPendingCustomers();
            
            return response()->json([
                'success' => true,
                'data' => $pendingCustomers,
                'count' => count($pendingCustomers)
            ]);
        } catch (Exception $e) {
            \Log::error('Failed to fetch pending customers: ' . $e->getMessage());
            
            return response()->json([
                'error' => 'Failed to fetch customers from Google Sheets',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get customer detail by timestamp for verification
     * 
     * @param string $timestamp (base64 encoded)
     * @return \Illuminate\Http\JsonResponse
     */
    public function getCustomerForVerification($timestamp)
    {
        if (!$this->sheetsService) {
            return response()->json([
                'error' => 'Google Sheets integration is not configured'
            ], 503);
        }

        try {
            // Decode base64 timestamp
            $decodedTimestamp = base64_decode($timestamp);
            
            if (!$decodedTimestamp) {
                return response()->json([
                    'error' => 'Invalid timestamp format'
                ], 400);
            }
            
            $sheetsData = $this->sheetsService->getCustomerByTimestamp($decodedTimestamp);
            
            if (!$sheetsData) {
                return response()->json([
                    'error' => 'Customer not found in Google Sheets'
                ], 404);
            }

            // Convert to customer format with pre-filled data
            $customerData = $this->sheetsService->convertToCustomerData($sheetsData);
            
            // Also include original sheets data for reference (NIK, photos, etc.)
            $response = [
                'success' => true,
                'customer_data' => $customerData,
                'sheets_reference' => [
                    'nik' => $sheetsData['nik'] ?? '',
                    'photo_front_url' => $sheetsData['foto_depan_rumah'] ?? '',
                    'photo_modem_url' => $sheetsData['foto_modem'] ?? '',
                    'photo_ktp_url' => $sheetsData['foto_ktp'] ?? '',
                    'photo_opm_url' => $sheetsData['foto_opm'] ?? '',
                ]
            ];

            return response()->json($response);
        } catch (Exception $e) {
            \Log::error('Failed to get customer for verification: ' . $e->getMessage());
            
            return response()->json([
                'error' => 'Failed to fetch customer data',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Verify and save customer to database
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function verifyCustomer(Request $request)
    {
        $validated = $request->validate($this->verificationValidationRules());
        $validated = $this->normalizeHomeRouterInput($validated);
        $validated = $this->normalizeVerificationToggleInput($validated);
        $secretInfo = null;
        $createdSecretUsername = null;

        if (($validated['enable_installation_team'] ?? false)
            && $this->hasInstallationPayrollInput($validated)
            && empty($validated['installer_member_ids'])) {
            throw ValidationException::withMessages([
                'installer_member_ids' => 'Pilih minimal 1 pelaksana agar detail pemasangan bisa masuk ke payroll.',
            ]);
        }

        try {
            // Check if already verified
            $existingCustomer = Customer::where('google_sheets_timestamp', $validated['google_sheets_timestamp'])->first();
            
            if ($existingCustomer) {
                return response()->json([
                    'error' => 'Customer already verified',
                    'customer' => $existingCustomer
                ], 409);
            }

            [$kecamatan, $desa, $dusun, $areaPrefix] = $this->resolveMasterWilayah($validated);
            $validated['kecamatan_id'] = $kecamatan->id;
            $validated['desa_id'] = $desa->id;
            $validated['dusun_id'] = $dusun->id;
            $validated['area_code'] = $areaPrefix;
            if (empty($validated['address'])) {
                $validated['address'] = $dusun->name . ', ' . $desa->name . ', ' . $kecamatan->name;
            }

            // Auto-calculate due_date if not provided
            if (empty($validated['due_date']) && !empty($validated['activation_date'])) {
                $validated['due_date'] = \Carbon\Carbon::parse($validated['activation_date'])
                    ->addDays(30)
                    ->format('Y-m-d');
            }

            $validated['is_active'] = $validated['is_active'] ?? true;
            $mikrotik = new MikroTikService();
            $serviceLabel = $this->resolveServiceLabelForSecret($validated);
            $profileName = $this->resolveStrictProfileName($mikrotik, $serviceLabel);
            $secretInfo = $this->createSecretWithUsernameRetry($mikrotik, $validated, $areaPrefix, $profileName);
            $createdSecretUsername = $secretInfo['name'] ?? null;
            $validated['pppoe_username'] = $secretInfo['name'] ?? null;
            $validated['pppoe_password'] = $secretInfo['password'] ?? ($validated['pppoe_password'] ?? 'admin');
            $validated['mikrotik_profile'] = $profileName;

            DB::beginTransaction();
            $customer = Customer::create($validated);

            // Auto-post installation fee as income to unified ledger.
            try {
                app(FinancialLedgerService::class)->syncCustomerInstallationIncome($customer, auth()->id());
            } catch (Exception $ledgerException) {
                \Log::warning('Failed to sync installation income on customer verification', [
                    'customer_id' => $customer->id,
                    'error' => $ledgerException->getMessage(),
                ]);
            }

            $payrollProject = null;
            if ($validated['enable_installation_team'] ?? false) {
                $payrollProject = $this->createInstallationPayrollProject($customer, $validated);

                if ($this->shouldRecordInstallationOutflow($validated)) {
                    app(InventoryService::class)->recordInstallationOutgoing(
                        $customer,
                        [
                            'router_item_id' => $validated['installation_router_item_id'] ?? null,
                            'cable_item_id' => $validated['installation_cable_item_id'] ?? null,
                            'cable_used' => $validated['installation_cable_used'] ?? 0,
                            'notes' => $validated['installation_notes'] ?? null,
                            'payroll_project_id' => $payrollProject?->id,
                        ],
                        (int) auth()->id()
                    );
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Customer verified and saved successfully',
                'customer' => $customer,
                'secret' => $secretInfo,
                'payroll_project' => $payrollProject,
            ]);

        } catch (ValidationException $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->cleanupCreatedSecret($createdSecretUsername);

            return response()->json([
                'error' => 'Validation failed',
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        } catch (Exception $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->cleanupCreatedSecret($createdSecretUsername);
            \Log::error('Failed to verify customer: ' . $e->getMessage());

            return response()->json([
                'error' => 'Failed to verify customer',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get all verified customers (for checking duplicates)
     * 
     * @return \Illuminate\Http\JsonResponse
     */
    public function getVerifiedTimestamps()
    {
        $timestamps = Customer::whereNotNull('google_sheets_timestamp')
            ->pluck('google_sheets_timestamp')
            ->toArray();

        return response()->json([
            'success' => true,
            'timestamps' => $timestamps,
            'count' => count($timestamps)
        ]);
    }

    private function verificationValidationRules(): array
    {
        return [
            'google_sheets_timestamp' => 'required|string',
            'name' => 'required|string|max:255',
            'area_code' => 'nullable|string|max:10',
            'phone' => 'required|string|max:20',
            'email' => 'nullable|email',
            'address' => 'nullable|string',
            'gender' => 'nullable|in:male,female',
            'package_type' => 'required|string',
            'custom_package' => 'nullable|string',
            'activation_date' => 'required|date',
            'due_date' => 'nullable|date',
            'pppoe_username' => 'nullable|string|max:64',
            'pppoe_password' => 'nullable|string|max:64',
            'odp' => 'nullable|string|max:64',
            'installation_fee' => 'nullable|numeric',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'is_active' => 'nullable|boolean',
            'kecamatan_id' => 'required|integer|exists:master_wilayah_kecamatans,id',
            'desa_id' => 'required|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'required|integer|exists:master_wilayah_dusuns,id',
            'enable_home_router' => 'nullable|boolean',
            'enable_installation_team' => 'nullable|boolean',
            'home_router_type' => 'nullable|in:mikrotik,vsol_v2801rgw,global_gl01',
            'home_router_host' => 'nullable|string|max:255',
            'home_router_port' => 'nullable|integer|min:1|max:65535',
            'home_router_username' => 'nullable|string|max:255',
            'home_router_password' => 'nullable|string|max:255',
            'home_router_wan_interface' => 'nullable|string|max:64',
            'home_router_monitoring_enabled' => 'nullable|boolean',
            'installer_member_ids' => 'nullable|array',
            'installer_member_ids.*' => 'integer|exists:payroll_members,id',
            'installation_router_item_id' => 'nullable|integer|exists:inventory_items,id',
            'installation_cable_item_id' => 'nullable|integer|exists:inventory_items,id',
            'installation_cable_used' => 'nullable|numeric|min:0',
            'installation_labor_fee' => 'nullable|numeric|min:0',
            'installation_cable_rate' => 'nullable|numeric|min:0',
            'installation_notes' => 'nullable|string|max:500',
        ];
    }

    private function createInstallationPayrollProject(Customer $customer, array $validated): ?PayrollProject
    {
        $memberIds = collect($validated['installer_member_ids'] ?? [])
            ->filter(fn ($id) => (int) $id > 0)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        if ($memberIds->isEmpty()) {
            return null;
        }

        $projectDate = !empty($validated['activation_date'])
            ? \Carbon\Carbon::parse($validated['activation_date'])->toDateString()
            : now()->toDateString();

        $project = PayrollProject::create([
            'tanggal' => $projectDate,
            'catatan' => $this->buildInstallationProjectNotes($customer, $validated['installation_notes'] ?? null),
            'total' => 0,
            'status' => 'unpaid',
        ]);

        foreach ($memberIds as $memberId) {
            $project->members()->attach($memberId, ['bagian' => 0]);
        }

        $laborFee = $this->resolveInstallationLaborFee($validated);

        PayrollProjectDetail::create([
            'payroll_project_id' => $project->id,
            'tipe' => 'pemasangan',
            'deskripsi' => 'Pemasangan pelanggan ' . $customer->name,
            'inventory_item_id' => null,
            'jumlah' => 1,
            'harga_satuan' => $laborFee,
            'subtotal' => $laborFee,
        ]);

        $cableUsed = (float) ($validated['installation_cable_used'] ?? 0);
        if ($cableUsed > 0) {
            $cableRate = $this->resolveInstallationCableRate($validated);
            $cableItemId = !empty($validated['installation_cable_item_id'])
                ? (int) $validated['installation_cable_item_id']
                : null;

            $cableItemName = null;
            if ($cableItemId) {
                $cableItemName = InventoryItem::query()->where('id', $cableItemId)->value('name');
            }

            $cableDescription = 'Pemakaian kabel pelanggan ' . $customer->name;
            if ($cableItemName) {
                $cableDescription = $cableItemName . ' - ' . $cableDescription;
            }

            PayrollProjectDetail::create([
                'payroll_project_id' => $project->id,
                'tipe' => 'kabel',
                'deskripsi' => $cableDescription,
                'inventory_item_id' => null,
                'jumlah' => $cableUsed,
                'harga_satuan' => $cableRate,
                'subtotal' => $cableUsed * $cableRate,
            ]);
        }

        $project->recalculate();

        $project->load(['members', 'details.inventoryItem']);

        return $project;
    }

    private function resolveInstallationLaborFee(array $validated): float
    {
        if (array_key_exists('installation_labor_fee', $validated)
            && $validated['installation_labor_fee'] !== null
            && $validated['installation_labor_fee'] !== '') {
            return (float) $validated['installation_labor_fee'];
        }

        return (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_LABOR_FEE, 0);
    }

    private function resolveInstallationCableRate(array $validated): float
    {
        if (array_key_exists('installation_cable_rate', $validated)
            && $validated['installation_cable_rate'] !== null
            && $validated['installation_cable_rate'] !== '') {
            return (float) $validated['installation_cable_rate'];
        }

        return (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_CABLE_RATE, 0);
    }

    private function hasInstallationPayrollInput(array $validated): bool
    {
        return (float) ($validated['installation_labor_fee'] ?? 0) > 0
            || (float) ($validated['installation_cable_used'] ?? 0) > 0
            || !empty($validated['installation_notes']);
    }

    private function shouldRecordInstallationOutflow(array $validated): bool
    {
        $hasRouter = !empty($validated['installation_router_item_id']);
        $hasCable = !empty($validated['installation_cable_item_id'])
            && (float) ($validated['installation_cable_used'] ?? 0) > 0;

        return $hasRouter || $hasCable;
    }

    private function buildInstallationProjectNotes(Customer $customer, ?string $installationNotes): string
    {
        $base = 'Proyek pemasangan pelanggan ' . $customer->name;

        if (!$installationNotes) {
            return $base;
        }

        return $base . ' | Catatan: ' . $installationNotes;
    }

    private function normalizeHomeRouterInput(array $validated): array
    {
        $nullableFields = [
            'home_router_type',
            'home_router_host',
            'home_router_port',
            'home_router_username',
            'home_router_wan_interface',
            'installation_router_item_id',
            'installation_cable_item_id',
            'installation_cable_used',
            'installation_labor_fee',
            'installation_cable_rate',
            'installation_notes',
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

        if (array_key_exists('home_router_password', $validated) && ($validated['home_router_password'] === '' || $validated['home_router_password'] === null)) {
            unset($validated['home_router_password']);
        }

        return $validated;
    }

    private function normalizeVerificationToggleInput(array $validated): array
    {
        $validated['enable_home_router'] = (bool) ($validated['enable_home_router'] ?? false);
        $validated['enable_installation_team'] = (bool) ($validated['enable_installation_team'] ?? false);

        if (!$validated['enable_home_router']) {
            $validated['home_router_monitoring_enabled'] = false;
            $validated['home_router_type'] = null;
            $validated['home_router_host'] = null;
            $validated['home_router_port'] = null;
            $validated['home_router_username'] = null;
            unset($validated['home_router_password']);
            $validated['home_router_wan_interface'] = null;
        }

        if (!$validated['enable_installation_team']) {
            $validated['installer_member_ids'] = [];
            $validated['installation_router_item_id'] = null;
            $validated['installation_cable_item_id'] = null;
            $validated['installation_cable_used'] = null;
            $validated['installation_labor_fee'] = null;
            $validated['installation_cable_rate'] = null;
            $validated['installation_notes'] = null;
        }

        return $validated;
    }

    private function resolveMasterWilayah(array $validated): array
    {
        $kecamatan = MasterWilayahKecamatan::query()->findOrFail((int) $validated['kecamatan_id']);
        $desa = MasterWilayahDesa::query()->findOrFail((int) $validated['desa_id']);
        $dusun = MasterWilayahDusun::query()->findOrFail((int) $validated['dusun_id']);

        if ((int) $desa->kecamatan_id !== (int) $kecamatan->id) {
            throw ValidationException::withMessages([
                'desa_id' => 'Desa tidak sesuai dengan kecamatan yang dipilih.',
            ]);
        }

        if ((int) $dusun->desa_id !== (int) $desa->id) {
            throw ValidationException::withMessages([
                'dusun_id' => 'Dusun tidak sesuai dengan desa yang dipilih.',
            ]);
        }

        $prefix = strtoupper($kecamatan->code . $desa->code . $dusun->code);

        return [$kecamatan, $desa, $dusun, $prefix];
    }

    private function resolveServiceLabelForSecret(array $validated): string
    {
        $packageType = trim((string) ($validated['package_type'] ?? ''));
        $customPackage = trim((string) ($validated['custom_package'] ?? ''));

        if (in_array(strtolower($packageType), ['custom', 'paket custom'], true)) {
            if ($customPackage === '') {
                throw ValidationException::withMessages([
                    'custom_package' => 'Nama paket custom wajib diisi agar profile MikroTik bisa dipetakan.',
                ]);
            }

            return $customPackage;
        }

        if ($packageType === '') {
            throw ValidationException::withMessages([
                'package_type' => 'Paket pelanggan wajib dipilih.',
            ]);
        }

        return $packageType;
    }

    private function resolveStrictProfileName(MikroTikService $mikrotik, string $serviceLabel): string
    {
        $dbPackage = Package::where('name', $serviceLabel)->first();
        if ($dbPackage && !empty($dbPackage->mikrotik_profile)) {
            return (string) $dbPackage->mikrotik_profile;
        }

        $profiles = $mikrotik->command('/ppp/profile/print');
        $availableProfiles = array_values(array_filter(array_map(
            fn ($profile) => (string) ($profile['name'] ?? ''),
            $profiles
        )));

        if (empty($availableProfiles)) {
            throw new Exception('Tidak ada profile MikroTik yang tersedia.');
        }

        foreach ($availableProfiles as $profileName) {
            if ($profileName === $serviceLabel) {
                return $profileName;
            }
        }

        foreach ($availableProfiles as $profileName) {
            if (strtolower($profileName) === strtolower($serviceLabel)) {
                return $profileName;
            }
        }

        $speedHint = preg_replace('/[^0-9]/', '', $serviceLabel);
        if ($speedHint !== '') {
            foreach ($availableProfiles as $profileName) {
                if (strpos(strtolower($profileName), strtolower($speedHint)) !== false
                    && strtolower($profileName) !== 'isolir') {
                    return $profileName;
                }
            }
        }

        throw ValidationException::withMessages([
            'package_type' => 'Profile MikroTik untuk paket "' . $serviceLabel . '" tidak ditemukan.',
        ]);
    }

    private function createSecretWithUsernameRetry(MikroTikService $mikrotik, array $validated, string $areaPrefix, string $profileName): array
    {
        $baseName = explode(' ', trim((string) ($validated['name'] ?? '')))[0] ?? 'user';
        $sanitizedName = strtolower((string) Str::of($baseName)->replaceMatches('/[^a-zA-Z0-9]/', '')->value());
        $sanitizedName = $sanitizedName !== '' ? $sanitizedName : 'user';

        $password = (string) ($validated['pppoe_password'] ?? 'admin');
        $maxAttempts = 12;
        $lastError = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            $suffix = str_pad((string) random_int(0, 999), 3, '0', STR_PAD_LEFT);
            $username = $areaPrefix . '-' . $sanitizedName . $suffix;

            try {
                $remoteAddress = $mikrotik->getNextIpAddress();
                $secret = $mikrotik->createPPPoESecret(
                    $username,
                    $password,
                    'pppoe',
                    $profileName,
                    $remoteAddress
                );

                return $secret;
            } catch (Exception $e) {
                $lastError = $e;
                $message = strtolower($e->getMessage());
                $isRetryable = str_contains($message, 'sudah digunakan')
                    || str_contains($message, 'already in use')
                    || str_contains($message, 'ip address');

                if (!$isRetryable || $attempt === $maxAttempts) {
                    break;
                }
            }
        }

        throw new Exception('Gagal membuat secret PPPoE: ' . ($lastError?->getMessage() ?? 'unknown error'));
    }

    private function cleanupCreatedSecret(?string $username): void
    {
        if (!$username) {
            return;
        }

        try {
            $mikrotik = new MikroTikService();
            $mikrotik->removePPPoESecret($username);
        } catch (Exception $exception) {
            \Log::warning('Failed to cleanup MikroTik secret after verification failure', [
                'username' => $username,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}

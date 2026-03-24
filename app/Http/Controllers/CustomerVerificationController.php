<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Package;
use App\Services\FinancialLedgerService;
use App\Services\GoogleSheetsService;
use App\Services\MikroTikService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Exception;

class CustomerVerificationController extends Controller
{
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

        DB::beginTransaction();

        try {
            // Check if already verified
            $existingCustomer = Customer::where('google_sheets_timestamp', $validated['google_sheets_timestamp'])->first();
            
            if ($existingCustomer) {
                return response()->json([
                    'error' => 'Customer already verified',
                    'customer' => $existingCustomer
                ], 409);
            }

            // Auto-calculate due_date if not provided
            if (empty($validated['due_date']) && !empty($validated['activation_date'])) {
                $validated['due_date'] = \Carbon\Carbon::parse($validated['activation_date'])
                    ->addDays(30)
                    ->format('Y-m-d');
            }

            $validated['is_active'] = $validated['is_active'] ?? true;

            // Create PPPoE secret in MikroTik if not custom package
            $secretInfo = null;
            $packageType = $validated['package_type'] ?? null;

            if ($packageType && !in_array(strtolower($packageType), ['custom', 'paket custom'])) {
                try {
                    $mikrotik = new MikroTikService();
                    
                    // If username not provided, generate one
                    if (empty($validated['pppoe_username'])) {
                        $firstName = explode(' ', $validated['name'])[0];
                        $firstName = strtolower($firstName);
                        $areaCode = strtoupper($validated['area_code']);
                        $randomDigits = str_pad(rand(0, 99), 2, '0', STR_PAD_LEFT);
                        $validated['pppoe_username'] = $areaCode . '-' . $firstName . $randomDigits;
                    }

                    // Get next available IP with retry
                    $maxRetries = 3;
                    $remoteAddress = null;
                    
                    for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
                        try {
                            $remoteAddress = $mikrotik->getNextIpAddress();
                            \Log::info('Got available IP address', [
                                'ip' => $remoteAddress,
                                'attempt' => $attempt
                            ]);
                            break;
                        } catch (Exception $e) {
                            \Log::warning('Failed to get IP address', [
                                'attempt' => $attempt,
                                'error' => $e->getMessage()
                            ]);
                            
                            if ($attempt === $maxRetries) {
                                throw new Exception('Gagal mendapatkan IP address yang tersedia setelah ' . $maxRetries . ' percobaan: ' . $e->getMessage());
                            }
                            
                            // Wait a bit before retry
                            sleep(1);
                        }
                    }
                    
                    if (!$remoteAddress) {
                        throw new Exception('Tidak dapat menemukan IP address yang tersedia');
                    }
                    
                    // Use password from request or default to 'admin'
                    $password = $validated['pppoe_password'] ?? 'admin';
                    
                    // Resolve MikroTik profile: first check Package table, then fallback to resolveProfileName
                    $dbPackage = Package::where('name', $packageType)->first();
                    if ($dbPackage && $dbPackage->mikrotik_profile) {
                        $profileName = $dbPackage->mikrotik_profile;
                        \Log::info('Profile resolved from packages table', ['package' => $packageType, 'profile' => $profileName]);
                    } else {
                        $profileName = $mikrotik->resolveProfileName($packageType);
                        \Log::info('Profile resolved via MikroTik lookup', ['package' => $packageType, 'profile' => $profileName]);
                    }
                    
                    // Create secret with retry if IP conflict occurs
                    $createRetries = 3;
                    $secretCreated = false;
                    
                    for ($createAttempt = 1; $createAttempt <= $createRetries; $createAttempt++) {
                        try {
                            $secretInfo = $mikrotik->createPPPoESecret(
                                $validated['pppoe_username'],
                                $password,
                                'pppoe',
                                $profileName,
                                $remoteAddress
                            );
                            
                            $secretCreated = true;
                            \Log::info('PPPoE secret created for verified customer', [
                                'username' => $validated['pppoe_username'],
                                'ip' => $remoteAddress,
                                'attempt' => $createAttempt,
                                'secret' => $secretInfo
                            ]);
                            break;
                            
                        } catch (Exception $e) {
                            // If IP is already in use, get a new one and retry
                            if (strpos($e->getMessage(), 'sudah digunakan') !== false && $createAttempt < $createRetries) {
                                \Log::warning('IP conflict detected, getting new IP', [
                                    'old_ip' => $remoteAddress,
                                    'attempt' => $createAttempt,
                                    'error' => $e->getMessage()
                                ]);
                                
                                // Get new IP
                                $remoteAddress = $mikrotik->getNextIpAddress();
                                \Log::info('Retrying with new IP', ['new_ip' => $remoteAddress]);
                                sleep(1);
                                continue;
                            }
                            
                            // If it's another error or last attempt, throw
                            throw $e;
                        }
                    }
                    
                    if (!$secretCreated) {
                        throw new Exception('Gagal membuat PPPoE secret setelah ' . $createRetries . ' percobaan');
                    }

                } catch (Exception $e) {
                    \Log::error('Failed to create MikroTik secret during verification: ' . $e->getMessage());
                    // Continue anyway, admin can create secret manually
                    $secretInfo = ['error' => $e->getMessage()];
                }
            }

            // Create customer (save resolved profile for future isolation restore)
            $validated['mikrotik_profile'] = $profileName ?? $packageType;
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

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Customer verified and saved successfully',
                'customer' => $customer,
                'secret' => $secretInfo
            ]);

        } catch (Exception $e) {
            DB::rollBack();
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
            'area_code' => 'required|string|max:10',
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
            'home_router_type' => 'nullable|in:mikrotik,vsol_v2801rgw,global_gl01',
            'home_router_host' => 'nullable|string|max:255',
            'home_router_port' => 'nullable|integer|min:1|max:65535',
            'home_router_username' => 'nullable|string|max:255',
            'home_router_password' => 'nullable|string|max:255',
            'home_router_wan_interface' => 'nullable|string|max:64',
            'home_router_monitoring_enabled' => 'nullable|boolean',
        ];
    }

    private function normalizeHomeRouterInput(array $validated): array
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

        if (array_key_exists('home_router_password', $validated) && ($validated['home_router_password'] === '' || $validated['home_router_password'] === null)) {
            unset($validated['home_router_password']);
        }

        return $validated;
    }
}

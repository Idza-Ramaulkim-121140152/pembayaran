<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Services\GoogleSheetsService;
use App\Services\MikroTikService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Exception;

class CustomerVerificationController extends Controller
{
    protected $sheetsService;

    public function __construct()
    {
        try {
            $this->sheetsService = new GoogleSheetsService();
        } catch (Exception $e) {
            \Log::error('Failed to initialize GoogleSheetsService: ' . $e->getMessage());
            $this->sheetsService = null;
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
                'message' => 'Please setup Google Sheets API credentials'
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
        $validated = $request->validate([
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
        ]);

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

                    // Get next available IP
                    $remoteAddress = $mikrotik->getNextIpAddress();
                    
                    // Use password from request or default to 'admin'
                    $password = $validated['pppoe_password'] ?? 'admin';
                    
                    // Create secret
                    $secretInfo = $mikrotik->createPPPoESecret(
                        $validated['pppoe_username'],
                        $password,
                        'pppoe',
                        $packageType,
                        $remoteAddress
                    );

                    \Log::info('PPPoE secret created for verified customer', [
                        'username' => $validated['pppoe_username'],
                        'secret' => $secretInfo
                    ]);

                } catch (Exception $e) {
                    \Log::error('Failed to create MikroTik secret during verification: ' . $e->getMessage());
                    // Continue anyway, admin can create secret manually
                    $secretInfo = ['error' => $e->getMessage()];
                }
            }

            // Create customer
            $customer = Customer::create($validated);

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
}

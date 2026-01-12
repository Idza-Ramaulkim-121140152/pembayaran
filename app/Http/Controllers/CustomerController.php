<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
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
            return response()->json(['data' => $query->get()]);
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
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'area_code' => 'nullable|string|max:10',
            'activation_date' => 'nullable|date',
            'due_date' => 'nullable|string|max:10',
            'nik' => 'nullable|string|max:32',
            'gender' => 'nullable|in:male,female,Pria,Wanita',
            'address' => 'nullable|string',
            'package_type' => 'nullable|string',
            'custom_package' => 'nullable|string',
            'pppoe_username' => 'nullable|string|max:64',
            'odp' => 'nullable|string|max:64',
            'phone' => 'nullable|string|max:20',
            'installation_fee' => 'nullable|numeric',
            'email' => 'nullable|email',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'is_active' => 'nullable',
        ]);

        // Handle file upload (optional on edit)
        $fileFields = [
            'photo_front', 'photo_modem', 'photo_opm', 'photo_ktp'
        ];
        foreach ($fileFields as $field) {
            if ($request->hasFile($field)) {
                $validated[$field] = $request->file($field)->store('uploads/customers', 'public');
                // Hapus file lama jika ada
                if ($customer->$field) {
                    Storage::disk('public')->delete($customer->$field);
                }
            }
        }

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
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'area_code' => 'required|string|max:10',
            'activation_date' => 'nullable|date',
            'due_date' => 'nullable|string|max:10',
            'nik' => 'nullable|string|max:32',
            'gender' => 'nullable|in:male,female,Pria,Wanita',
            'address' => 'nullable|string',
            'package_type' => 'nullable|string',
            'custom_package' => 'nullable|string',
            'photo_front' => 'nullable|image|max:5120',
            'photo_modem' => 'nullable|image|max:5120',
            'pppoe_username' => 'nullable|string|max:64',
            'odp' => 'nullable|string|max:64',
            'phone' => 'nullable|string|max:20',
            'installation_fee' => 'nullable|numeric',
            'photo_opm' => 'nullable|image|max:5120',
            'photo_ktp' => 'nullable|image|max:5120',
            'email' => 'nullable|email',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'is_active' => 'nullable',
        ]);

        // Handle file upload (optional for API)
        $fileFields = [
            'photo_front', 'photo_modem', 'photo_opm', 'photo_ktp'
        ];
        foreach ($fileFields as $field) {
            if ($request->hasFile($field)) {
                $validated[$field] = $request->file($field)->store('uploads/customers', 'public');
            }
        }

        $validated['is_active'] = $validated['is_active'] ?? true;
        
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
                
                // Map package type to profile (keep original case from user)
                $profile = $packageType;
                
                // Create secret
                $secretInfo = $mikrotik->createPPPoESecret(
                    $username,
                    'admin',
                    'pppoe',
                    $profile,
                    $remoteAddress
                );
                
                \Log::info('Secret created successfully', ['secret' => $secretInfo]);
                
                // Update validated data with generated username
                $validated['pppoe_username'] = $username;
                
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
            
            \Log::info('Secret found', [
                'username' => $customer->pppoe_username, 
                'is_connected' => $isConnected,
                'secret' => $secret
            ]);
            
            return response()->json([
                'success' => true,
                'data' => $secret,
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

    public function destroy($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $customer->delete();
        
        if (request()->wantsJson()) {
            return response()->json(['message' => 'Customer deleted successfully']);
        }
        return redirect()->route('customers.list')->with('success', 'Pelanggan berhasil dihapus.');
    }
}

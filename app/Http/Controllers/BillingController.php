<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Services\FinancialLedgerService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class BillingController extends Controller
{
    public function __construct(private FinancialLedgerService $ledgerService)
    {
    }

    private function canCurrentUserConfirmPayments(): bool
    {
        return Auth::check() && Auth::user()->canConfirmPayments();
    }

    private function ensureCanConfirmPayments(): void
    {
        if (!$this->canCurrentUserConfirmPayments()) {
            abort(response()->json([
                'message' => 'Anda tidak memiliki izin untuk konfirmasi pembayaran. Hubungi superadmin.',
            ], 403));
        }
    }

    public function confirmPayment($invoiceId)
    {
        $invoice = Invoice::findOrFail($invoiceId);
        $paidAmount = request()->input('paid_amount');
        if ($paidAmount && $paidAmount > 0) {
            $invoice->amount = $paidAmount;
        }

        // Handle upload bukti pembayaran (opsional)
        if (request()->hasFile('bukti_pembayaran')) {
            $file = request()->file('bukti_pembayaran');
            $path = $file->store('bukti_pembayaran', 'public');
            $invoice->bukti_pembayaran = $path;
            $invoice->tolak_info = null; // reset info tolak jika ada upload baru
        }


        // Jika admin (dari dashboard) konfirmasi, bisa kapan saja
        if ($this->canCurrentUserConfirmPayments()) {
            $invoice->status = 'paid';
            $invoice->paid_at = now();
            $invoice->tolak_info = null; // reset info tolak jika sudah dikonfirmasi

            // Update due_date customer
            $customer = $invoice->customer;
            if ($customer && $customer->pppoe_username) {
                // Check if user is isolated in MikroTik
                try {
                    $mikrotik = new \App\Services\MikroTikService();
                    $mikrotik->connect();
                    $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
                    
                    if ($secret && strtolower($secret['profile']) === 'isolir') {
                        // Determine target profile: saved mikrotik_profile > package_type > 'default'
                        $targetProfile = $customer->mikrotik_profile ?: ($customer->package_type ?: 'default');
                        
                        // Validate profile exists
                        try {
                            $profiles = $mikrotik->command('/ppp/profile/print');
                            $availableProfiles = array_map(fn($p) => $p['name'] ?? '', $profiles);
                            
                            if (!in_array($targetProfile, $availableProfiles)) {
                                // Try case-insensitive or partial match
                                $matched = null;
                                foreach ($availableProfiles as $ap) {
                                    if (strtolower($ap) === strtolower($targetProfile)) { $matched = $ap; break; }
                                }
                                if (!$matched) {
                                    $speed = preg_replace('/[^0-9]/', '', $targetProfile);
                                    foreach ($availableProfiles as $ap) {
                                        if ($speed && strpos($ap, $speed) !== false && strtolower($ap) !== 'isolir') { $matched = $ap; break; }
                                    }
                                }
                                if ($matched) $targetProfile = $matched;
                            }
                        } catch (\Exception $profileErr) {
                            \Log::warning('Could not validate profiles', ['error' => $profileErr->getMessage()]);
                        }
                        
                        $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                        $customer->due_date = now()->addDays(30)->format('Y-m-d');
                        $customer->mikrotik_profile = null;
                        
                        \Log::info('User restored from isolation after payment confirmation', [
                            'username' => $customer->pppoe_username,
                            'restored_profile' => $targetProfile,
                            'new_due_date' => $customer->due_date,
                        ]);
                    } else {
                        if ($invoice->due_date) {
                            $oldDue = \Carbon\Carbon::parse($invoice->due_date);
                            $customer->due_date = $oldDue->copy()->addDays(30)->format('Y-m-d');
                        } else {
                            $customer->due_date = now()->addDays(30)->format('Y-m-d');
                        }
                    }
                    
                    $mikrotik->disconnect();
                } catch (\Exception $e) {
                    \Log::error('Failed to check/restore user from isolation', [
                        'username' => $customer->pppoe_username,
                        'error' => $e->getMessage()
                    ]);
                    
                    if ($invoice->due_date) {
                        $oldDue = \Carbon\Carbon::parse($invoice->due_date);
                        $customer->due_date = $oldDue->copy()->addDays(30)->format('Y-m-d');
                    } else {
                        $customer->due_date = now()->addDays(30)->format('Y-m-d');
                    }
                }
                
                $customer->save();
            }
        } else {
            // Jika dari publik (bukan admin), status selalu jadi menunggu konfirmasi (kecuali sudah paid)
            if ($invoice->status !== 'paid') {
                $invoice->status = 'menunggu konfirmasi';
                $invoice->paid_at = null;
            }
        }

        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());

        // Redirect sesuai asal request
        if ($this->canCurrentUserConfirmPayments()) {
            return redirect()->route('billing.index')->with('success', 'Pembayaran dikonfirmasi.');
        }
        $invoice_link = $invoice->invoice_link;
        return redirect()->route('invoice.show', $invoice_link)->with('success', 'Konfirmasi pembayaran berhasil dikirim.');
    }
    // Tampilkan invoice berdasarkan link unik, tanpa login
    public function showInvoice($invoice_link)
    {
    $invoice = \App\Models\Invoice::where('invoice_link', $invoice_link)->with('customer')->firstOrFail();
    $hideNavbar = !\Illuminate\Support\Facades\Auth::check();
    return view('billing.invoice', compact('invoice', 'hideNavbar'));
    }

    public function index()
    {
        $today = Carbon::today();
        $query = Customer::query();
        $search = request('search');
        if ($search) {
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                  ->orWhere('pppoe_username', 'like', "%$search%")
                  ->orWhere('phone', 'like', "%$search%");
            });
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
        }
        $customers = $query->get();

        $late = $customers->filter(function($c) use ($today) {
            return $c->due_date && Carbon::parse($c->due_date)->lt($today);
        });

        $almostLate = $customers->filter(function($c) use ($today) {
            return $c->due_date && Carbon::parse($c->due_date)->gte($today) && Carbon::parse($c->due_date)->lte($today->copy()->addDays(7));
        });

        $others = $customers->filter(function($c) use ($late, $almostLate) {
            return !$late->contains($c) && !$almostLate->contains($c);
        });

        // Ambil invoice bulan ini untuk setiap customer (map by id)
        $currentMonth = $today->format('Y-m');
        $invoicesThisMonth = [];
        foreach ($customers as $customer) {
            $invoice = $customer->invoices()
                ->whereRaw("DATE_FORMAT(invoice_date, '%Y-%m') = ?", [$currentMonth])
                ->latest('invoice_date')->first();
            $invoicesThisMonth[$customer->id] = $invoice;
        }

        return view('billing.index', [
            'late' => $late,
            'almostLate' => $almostLate,
            'others' => $others,
            'invoicesThisMonth' => $invoicesThisMonth,
        ]);
    }

    public function createInvoice($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $amount = request()->input('amount');
        if (!$amount || $amount <= 0) {
            if (request()->wantsJson()) {
                return response()->json(['error' => 'Nominal tagihan harus diisi.'], 422);
            }
            return redirect()->back()->with('error', 'Nominal tagihan harus diisi.');
        }

        $cancelledPreviousInvoices = 0;
        $invoice = null;

        DB::transaction(function () use ($customer, $amount, &$cancelledPreviousInvoices, &$invoice) {
            // Nonaktifkan invoice lama yang masih terbuka agar tidak dobel tagihan
            $cancelledPreviousInvoices = $customer->invoices()
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->update([
                    'status' => 'cancelled',
                    'paid_at' => null,
                    'tolak_info' => null,
                ]);

            $invoice = $customer->invoices()->create([
                'invoice_date' => now(),
                'due_date' => $customer->due_date ?? now()->addDays(7),
                'amount' => $amount,
                'status' => 'unpaid',
                'invoice_link' => uniqid('inv_'),
            ]);
        });

        // TODO: Kirim link invoice ke pelanggan jika perlu

        if (request()->wantsJson()) {
            $link = url('/invoice/'.$invoice->invoice_link);
            $template = "Yth. Bapak/Ibu " . strtoupper($customer->name) . "\n" .
                        "Username PPPoE: " . $customer->pppoe_username . "\n\n" .
                        "Nominal tagihan: Rp " . number_format($invoice->amount, 0, ',', '.') . "\n" .
                        "> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:" . "\n" .
                        $link . "\n\n" .
                        "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis." . "\n\n" .
                        "Layanan Call Center 085158025553" . "\n\n" .
                        "Salam Hangat," . "\n" .
                        "Tim Layanan Pelanggan Rumah Kita Net";

            return response()->json([
                'data' => [
                    'invoice_id' => $invoice->id,
                    'invoice_link' => $link,
                    'template' => $template,
                    'amount' => $invoice->amount,
                    'cancelled_previous_invoices' => (int) $cancelledPreviousInvoices,
                ]
            ]);
        }

        $successMessage = 'Tagihan berhasil dibuat.';
        if ($cancelledPreviousInvoices > 0) {
            $successMessage .= ' ' . $cancelledPreviousInvoices . ' tagihan lama dinonaktifkan.';
        }

        return redirect()->route('billing.index')->with('success', $successMessage);
    }

    public function tolakPembayaran($invoiceId)
    {
        $invoice = Invoice::findOrFail($invoiceId);
        // Hapus file bukti jika ada
        if ($invoice->bukti_pembayaran) {
            Storage::disk('public')->delete($invoice->bukti_pembayaran);
            $invoice->bukti_pembayaran = null;
        }
        $invoice->status = 'unpaid';
        $invoice->paid_at = null;
        $invoice->tolak_info = 'Bukti pembayaran Anda ditolak. Silakan upload ulang bukti pembayaran yang valid.';
        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
        // Jika admin, redirect ke halaman billing.index, jika publik redirect ke invoice
        if (Auth::check() && Auth::user()->role === 'admin') {
            return redirect()->route('billing.index')->with('error', 'Bukti pembayaran ditolak.');
        }
        return redirect()->route('invoice.show', $invoice->invoice_link)->with('error', 'Bukti pembayaran ditolak. Silakan upload ulang bukti pembayaran yang valid.');
    }

    // API Methods for React
    public function apiIndex()
    {
        $today = Carbon::today();
        $currentMonth = $today->format('Y-m');
        $query = Customer::query();
        
        $search = request('search');
        if ($search) {
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                  ->orWhere('pppoe_username', 'like', "%$search%")
                  ->orWhere('phone', 'like', "%$search%");
            });
        }
        
        $customers = $query->with(['invoices' => function($q) use ($currentMonth) {
            $q->whereRaw("DATE_FORMAT(invoice_date, '%Y-%m') = ?", [$currentMonth])
              ->latest('invoice_date');
        }])->get();

        // Get invoices for current month (from eager-loaded data)
        $invoicesThisMonth = [];
        foreach ($customers as $customer) {
            $invoicesThisMonth[$customer->id] = $customer->invoices->first();
        }

        // Categorize customers
        $late = [];
        $almostLate = [];
        $others = [];
        $paid = [];

        foreach ($customers as $customer) {
            $invoice = $invoicesThisMonth[$customer->id] ?? null;
            $item = ['customer' => $customer, 'invoice' => $invoice];
            
            if ($invoice && $invoice->status === 'paid') {
                $paid[] = $item;
                continue;
            }

            if ($customer->due_date && Carbon::parse($customer->due_date)->lt($today)) {
                $late[] = $item;
            } elseif ($customer->due_date && Carbon::parse($customer->due_date)->gte($today) && Carbon::parse($customer->due_date)->lte($today->copy()->addDays(7))) {
                $almostLate[] = $item;
            } else {
                $others[] = $item;
            }
        }

        // Get bulk isolation status for late customers only
        $isolationStatus = $this->getBulkIsolationStatus($late);

        return response()->json([
            'data' => [
                'late' => $late,
                'almostLate' => $almostLate,
                'others' => $others,
                'paid' => $paid,
                'isolationStatus' => $isolationStatus,
            ]
        ]);
    }

    private function getBulkIsolationStatus($lateCustomers)
    {
        try {
            $mikrotik = new \App\Services\MikroTikService();
            
            // Get all isolated secrets in ONE MikroTik call
            $isolatedSecrets = $mikrotik->getIsolatedSecrets();
            
            // Create map of isolated usernames
            $isolatedUsernames = [];
            foreach ($isolatedSecrets as $secret) {
                $isolatedUsernames[$secret['name']] = $secret['profile'];
            }
            
            // Build isolation status map by customer ID
            $statusMap = [];
            foreach ($lateCustomers as $item) {
                $customer = $item['customer'];
                $username = $customer->pppoe_username;
                $statusMap[$customer->id] = [
                    'isolated' => isset($isolatedUsernames[$username]),
                    'profile' => $isolatedUsernames[$username] ?? null,
                ];
            }
            
            return $statusMap;
        } catch (\Exception $e) {
            \Log::error('Failed to get bulk isolation status: ' . $e->getMessage());
            return [];
        }
    }

    public function showInvoiceApi($invoice_link)
    {
        $invoice = \App\Models\Invoice::where('invoice_link', $invoice_link)->with('customer')->firstOrFail();
        return response()->json(['data' => $invoice]);
    }

    public function confirmPaymentApi($invoiceId)
    {
        $this->ensureCanConfirmPayments();

        $invoice = Invoice::findOrFail($invoiceId);
        $paidAmount = request()->input('paid_amount');
        
        if ($paidAmount && $paidAmount > 0) {
            $invoice->amount = $paidAmount;
        }

        $invoice->status = 'paid';
        $invoice->paid_at = now();
        $invoice->tolak_info = null;

        // Update due_date customer
        $customer = $invoice->customer;
        if ($customer && $customer->pppoe_username) {
            // Check if user is isolated in MikroTik
            try {
                $mikrotik = new \App\Services\MikroTikService();
                $mikrotik->connect();
                $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
                
                if ($secret && strtolower($secret['profile']) === 'isolir') {
                    // Determine target profile: saved mikrotik_profile > package_type > 'default'
                    $targetProfile = $customer->mikrotik_profile ?: ($customer->package_type ?: 'default');
                    
                    // Validate profile exists in MikroTik
                    try {
                        $profiles = $mikrotik->command('/ppp/profile/print');
                        $availableProfiles = array_map(fn($p) => $p['name'] ?? '', $profiles);
                        
                        if (!in_array($targetProfile, $availableProfiles)) {
                            \Log::warning('Target profile not found in MikroTik, attempting case-insensitive match', [
                                'target' => $targetProfile,
                                'available' => $availableProfiles
                            ]);
                            
                            // Try case-insensitive match
                            $matched = null;
                            foreach ($availableProfiles as $ap) {
                                if (strtolower($ap) === strtolower($targetProfile)) {
                                    $matched = $ap;
                                    break;
                                }
                            }
                            
                            if ($matched) {
                                $targetProfile = $matched;
                            } else {
                                // Try partial match (e.g. "10 Mbps" matches "10M")
                                $speed = preg_replace('/[^0-9]/', '', $targetProfile);
                                foreach ($availableProfiles as $ap) {
                                    if ($speed && strpos($ap, $speed) !== false && strtolower($ap) !== 'isolir') {
                                        $matched = $ap;
                                        break;
                                    }
                                }
                                if ($matched) {
                                    $targetProfile = $matched;
                                    \Log::info('Used partial speed match for profile', ['original' => $customer->mikrotik_profile ?: $customer->package_type, 'matched' => $matched]);
                                } else {
                                    \Log::error('No matching profile found', ['target' => $targetProfile, 'available' => $availableProfiles]);
                                }
                            }
                        }
                    } catch (\Exception $profileErr) {
                        \Log::warning('Could not validate profiles, using target as-is', ['error' => $profileErr->getMessage()]);
                    }
                    
                    $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                    
                    // Due date = confirmation date (today) + 30 days
                    $customer->due_date = now()->addDays(30)->format('Y-m-d');
                    // Clear saved profile since restored
                    $customer->mikrotik_profile = null;
                    
                    \Log::info('User restored from isolation after payment', [
                        'username' => $customer->pppoe_username,
                        'restored_profile' => $targetProfile,
                        'new_due_date' => $customer->due_date,
                        'confirmed_at' => now()->format('Y-m-d H:i:s')
                    ]);
                } else {
                    // User is NOT isolated, due date = old due date + 30 days
                    if ($invoice->due_date) {
                        $oldDue = \Carbon\Carbon::parse($invoice->due_date);
                        $customer->due_date = $oldDue->copy()->addDays(30)->format('Y-m-d');
                    } else {
                        $customer->due_date = now()->addDays(30)->format('Y-m-d');
                    }
                }
                
                $mikrotik->disconnect();
            } catch (\Exception $e) {
                \Log::error('Failed to check/restore user from isolation', [
                    'username' => $customer->pppoe_username,
                    'error' => $e->getMessage()
                ]);
                
                // Fallback: use old due date + 30 days
                if ($invoice->due_date) {
                    $oldDue = \Carbon\Carbon::parse($invoice->due_date);
                    $customer->due_date = $oldDue->copy()->addDays(30)->format('Y-m-d');
                } else {
                    $customer->due_date = now()->addDays(30)->format('Y-m-d');
                }
            }
            
            $customer->save();
        }

        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());

        return response()->json(['message' => 'Pembayaran berhasil dikonfirmasi', 'data' => $invoice]);
    }

    public function updateInvoiceAmountApi(Request $request, $invoiceId)
    {
        if (!Auth::check()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
        ]);

        $invoice = Invoice::findOrFail($invoiceId);
        $invoice->amount = $validated['amount'];
        $invoice->save();

        if ($invoice->status === 'paid') {
            $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
        }

        return response()->json([
            'message' => 'Nominal invoice berhasil diperbarui.',
            'data' => $invoice,
        ]);
    }

    public function isolateCustomer($customerId)
    {
        try {
            $customer = Customer::findOrFail($customerId);
            
            if (!$customer->pppoe_username) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer tidak memiliki username PPPoE'
                ], 400);
            }
            
            $mikrotik = new \App\Services\MikroTikService();
            
            // Get current profile BEFORE isolating so we can restore later
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            
            if (!$secret) {
                return response()->json([
                    'success' => false,
                    'message' => 'Username PPPoE tidak ditemukan di MikroTik: ' . $customer->pppoe_username
                ], 404);
            }
            
            $currentProfile = $secret['profile'];
            
            // Already isolated
            if (strtolower($currentProfile) === 'isolir') {
                return response()->json([
                    'success' => false,
                    'message' => 'Pelanggan sudah dalam status isolir'
                ], 422);
            }
            
            // Save original MikroTik profile to customer record
            $customer->mikrotik_profile = $currentProfile;
            $customer->save();
            
            \Log::info('Saving original MikroTik profile before isolation', [
                'customer_id' => $customer->id,
                'username' => $customer->pppoe_username,
                'original_profile' => $currentProfile,
            ]);
            
            // Now isolate
            $result = $mikrotik->isolateUser($customer->pppoe_username);
            
            return response()->json([
                'success' => true,
                'message' => 'Pelanggan ' . $customer->name . ' berhasil diisolir',
                'data' => array_merge($result, [
                    'saved_profile' => $currentProfile,
                    'customer_name' => $customer->name,
                ])
            ]);
            
        } catch (\Exception $e) {
            \Log::error('Failed to isolate customer', [
                'customer_id' => $customerId,
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'success' => false,
                'message' => 'Gagal melakukan isolir: ' . $e->getMessage()
            ], 500);
        }
    }

    public function checkIsolationStatus($customerId)
    {
        try {
            $customer = Customer::findOrFail($customerId);
            
            if (!$customer->pppoe_username) {
                return response()->json([
                    'isolated' => false,
                    'profile' => null
                ]);
            }
            
            $mikrotik = new \App\Services\MikroTikService();
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            
            if (!$secret) {
                return response()->json([
                    'isolated' => false,
                    'profile' => null
                ]);
            }
            
            $isIsolated = strtolower($secret['profile']) === 'isolir';
            
            return response()->json([
                'isolated' => $isIsolated,
                'profile' => $secret['profile']
            ]);
            
        } catch (\Exception $e) {
            \Log::error('Failed to check isolation status', [
                'customer_id' => $customerId,
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'isolated' => false,
                'profile' => null,
                'error' => $e->getMessage()
            ]);
        }
    }

    public function rejectPaymentApi($invoiceId)
    {
        $this->ensureCanConfirmPayments();

        $invoice = Invoice::findOrFail($invoiceId);
        $reason = request()->input('reason') ?: 'Bukti pembayaran Anda ditolak. Silakan upload ulang bukti pembayaran yang valid.';
        
        if ($invoice->bukti_pembayaran) {
            Storage::disk('public')->delete($invoice->bukti_pembayaran);
            $invoice->bukti_pembayaran = null;
        }
        
        $invoice->status = 'unpaid';
        $invoice->paid_at = null;
        $invoice->tolak_info = $reason;
        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());

        return response()->json(['message' => 'Pembayaran ditolak', 'data' => $invoice]);
    }
}

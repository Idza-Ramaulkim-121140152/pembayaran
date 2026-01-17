<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class BillingController extends Controller
{
    public function confirmPayment($invoiceId)
    {
        $invoice = \App\Models\Invoice::findOrFail($invoiceId);
        
        // Validate paid_amount if provided
        $paidAmount = request()->input('paid_amount');
        if ($paidAmount !== null) {
            if (!is_numeric($paidAmount) || $paidAmount <= 0 || $paidAmount > 999999999) {
                if (request()->wantsJson()) {
                    return response()->json(['error' => 'Nominal pembayaran tidak valid.'], 422);
                }
                return redirect()->back()->with('error', 'Nominal pembayaran tidak valid.');
            }
            $invoice->amount = $paidAmount;
        }

        // Handle upload bukti pembayaran (opsional)
        if (request()->hasFile('bukti_pembayaran')) {
            $file = request()->file('bukti_pembayaran');
            
            // Validate file type and size
            if (!in_array($file->getClientOriginalExtension(), ['jpg', 'jpeg', 'png', 'pdf'])) {
                if (request()->wantsJson()) {
                    return response()->json(['error' => 'Format file tidak valid. Hanya JPG, PNG, dan PDF yang diperbolehkan.'], 422);
                }
                return redirect()->back()->with('error', 'Format file tidak valid.');
            }
            
            // Max 5MB
            if ($file->getSize() > 5 * 1024 * 1024) {
                if (request()->wantsJson()) {
                    return response()->json(['error' => 'Ukuran file terlalu besar. Maksimal 5MB.'], 422);
                }
                return redirect()->back()->with('error', 'Ukuran file terlalu besar.');
            }
            
            $path = $file->store('bukti_pembayaran', 'public');
            $invoice->bukti_pembayaran = $path;
            $invoice->tolak_info = null; // reset info tolak jika ada upload baru
        }


        // Jika admin (dari dashboard) konfirmasi, bisa kapan saja
        if (Auth::check() && Auth::user()->role === 'admin') {
            $invoice->status = 'paid';
            $invoice->paid_at = now();
            $invoice->tolak_info = null; // reset info tolak jika sudah dikonfirmasi

            // Update due_date customer: due_date lama + 30 hari
            $customer = $invoice->customer;
            if ($customer && $invoice->due_date) {
                $oldDue = \Carbon\Carbon::parse($invoice->due_date);
                $customer->due_date = $oldDue->copy()->addDays(30);
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

        // Redirect sesuai asal request
        if (Auth::check() && Auth::user()->role === 'admin') {
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
            // Sanitize search input to prevent SQL injection
            $search = str_replace(['%', '_'], ['\\%', '\\_'], $search);
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('pppoe_username', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
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
        
        // Validate amount input
        $validated = request()->validate([
            'amount' => 'required|numeric|min:1|max:999999999',
        ]);
        
        $amount = $validated['amount'];
        
        $invoice = $customer->invoices()->create([
            'invoice_date' => now(),
            'due_date' => $customer->due_date ?? now()->addDays(7),
            'amount' => $amount,
            'status' => 'unpaid',
            'invoice_link' => 'inv_' . \Illuminate\Support\Str::random(32),
        ]);

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
                ]
            ]);
        }

        return redirect()->route('billing.index')->with('success', 'Tagihan berhasil dibuat.');
    }

    public function tolakPembayaran($invoiceId)
    {
        $invoice = \App\Models\Invoice::findOrFail($invoiceId);
        // Hapus file bukti jika ada
        if ($invoice->bukti_pembayaran) {
            Storage::disk('public')->delete($invoice->bukti_pembayaran);
            $invoice->bukti_pembayaran = null;
        }
        $invoice->status = 'unpaid';
        $invoice->paid_at = null;
        $invoice->tolak_info = 'Bukti pembayaran Anda ditolak. Silakan upload ulang bukti pembayaran yang valid.';
        $invoice->save();
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
        $query = Customer::query();
        
        $search = request('search');
        if ($search) {
            // Sanitize search input to prevent SQL injection
            $search = str_replace(['%', '_'], ['\\%', '\\_'], $search);
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('pppoe_username', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }
        
        $customers = $query->get();
        $currentMonth = $today->format('Y-m');

        // Get invoices for current month
        $invoicesThisMonth = [];
        foreach ($customers as $customer) {
            $invoice = $customer->invoices()
                ->whereRaw("DATE_FORMAT(invoice_date, '%Y-%m') = ?", [$currentMonth])
                ->latest('invoice_date')->first();
            $invoicesThisMonth[$customer->id] = $invoice;
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
        // Only admins can confirm payments via API
        if (!auth()->check() || auth()->user()->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only admins can confirm payments.'
            ], 403);
        }
        
        $invoice = \App\Models\Invoice::findOrFail($invoiceId);
        
        // Validate paid_amount if provided
        $paidAmount = request()->input('paid_amount');
        if ($paidAmount !== null) {
            if (!is_numeric($paidAmount) || $paidAmount <= 0 || $paidAmount > 999999999) {
                return response()->json([
                    'success' => false,
                    'message' => 'Nominal pembayaran tidak valid.'
                ], 422);
            }
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
                $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
                
                if ($secret && strtolower($secret['profile']) === 'isolir') {
                    // User is isolated, restore to original package profile
                    $targetProfile = $customer->package_type ?: 'default';
                    $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                    
                    // Due date = today + 30 days (for isolated users)
                    $customer->due_date = now()->addDays(30)->format('Y-m-d');
                    
                    \Log::info('User unrestricted after payment', [
                        'username' => $customer->pppoe_username,
                        'new_due_date' => $customer->due_date
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
            } catch (\Exception $e) {
                \Log::error('Failed to check/unrestrict user', [
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

        return response()->json(['message' => 'Pembayaran berhasil dikonfirmasi', 'data' => $invoice]);
    }

    public function isolateCustomer($customerId)
    {
        // Only admins can isolate customers
        if (!auth()->check() || auth()->user()->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only admins can isolate customers.'
            ], 403);
        }
        
        try {
            $customer = Customer::findOrFail($customerId);
            
            if (!$customer->pppoe_username) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer tidak memiliki username PPPoE'
                ], 400);
            }
            
            $mikrotik = new \App\Services\MikroTikService();
            $result = $mikrotik->isolateUser($customer->pppoe_username);
            
            return response()->json([
                'success' => true,
                'message' => 'User berhasil diisolir',
                'data' => $result
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
        // Only admins can reject payments
        if (!auth()->check() || auth()->user()->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only admins can reject payments.'
            ], 403);
        }
        
        $invoice = \App\Models\Invoice::findOrFail($invoiceId);
        $reason = request()->input('reason') ?: 'Bukti pembayaran Anda ditolak. Silakan upload ulang bukti pembayaran yang valid.';
        
        if ($invoice->bukti_pembayaran) {
            Storage::disk('public')->delete($invoice->bukti_pembayaran);
            $invoice->bukti_pembayaran = null;
        }
        
        $invoice->status = 'unpaid';
        $invoice->paid_at = null;
        $invoice->tolak_info = $reason;
        $invoice->save();

        return response()->json(['message' => 'Pembayaran ditolak', 'data' => $invoice]);
    }
}

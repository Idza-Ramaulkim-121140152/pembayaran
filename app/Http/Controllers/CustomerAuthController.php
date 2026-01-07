<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;

class CustomerAuthController extends Controller
{
    /**
     * Login pelanggan dengan nomor telepon atau username PPPoE
     */
    public function login(Request $request)
    {
        $request->validate([
            'identifier' => 'required|string',
        ]);

        $identifier = $request->identifier;

        // Cari customer berdasarkan nomor telepon atau username PPPoE
        $customer = Customer::where('phone', $identifier)
            ->orWhere('pppoe_username', $identifier)
            ->first();

        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Nomor telepon atau Username PPPoE tidak ditemukan'
            ], 401);
        }

        // Simpan session pelanggan
        Session::put('customer_id', $customer->id);
        Session::put('customer_logged_in', true);

        return response()->json([
            'success' => true,
            'message' => 'Login berhasil',
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
            ]
        ]);
    }

    /**
     * Logout pelanggan
     */
    public function logout(Request $request)
    {
        Session::forget('customer_id');
        Session::forget('customer_logged_in');

        return response()->json([
            'success' => true,
            'message' => 'Logout berhasil'
        ]);
    }

    /**
     * Cek status login pelanggan
     */
    public function check(Request $request)
    {
        $customerId = Session::get('customer_id');
        
        if (!$customerId) {
            return response()->json([
                'logged_in' => false
            ]);
        }

        $customer = Customer::find($customerId);
        
        if (!$customer) {
            Session::forget('customer_id');
            Session::forget('customer_logged_in');
            return response()->json([
                'logged_in' => false
            ]);
        }

        return response()->json([
            'logged_in' => true,
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->nama,
            ]
        ]);
    }

    /**
     * Get customer dashboard data
     */
    public function dashboard(Request $request)
    {
        $customerId = Session::get('customer_id');
        
        if (!$customerId) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized'
            ], 401);
        }

        $customer = Customer::with(['odp'])->find($customerId);
        
        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Customer not found'
            ], 404);
        }

        // Get invoice history
        $invoices = $customer->invoices()
            ->orderBy('created_at', 'desc')
            ->take(12)
            ->get();

        // Get complaints
        $complaints = $customer->complaints()
            ->orderBy('created_at', 'desc')
            ->take(10)
            ->get();

        return response()->json([
            'success' => true,
            'customer' => [
                'id' => $customer->id,
                'nama' => $customer->nama,
                'alamat' => $customer->alamat,
                'no_telp' => $customer->no_telp,
                'user_pppoe' => $customer->user_pppoe,
                'paket' => $customer->paket,
                'harga' => $customer->harga,
                'tanggal_jatuh_tempo' => $customer->tanggal_jatuh_tempo,
                'is_active' => $customer->is_active,
                'odp' => $customer->odp ? $customer->odp->nama : null,
            ],
            'invoices' => $invoices,
            'complaints' => $complaints,
        ]);
    }

    /**
     * Submit aduan/keluhan
     */
    public function submitComplaint(Request $request)
    {
        $customerId = Session::get('customer_id');
        
        if (!$customerId) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized'
            ], 401);
        }

        $request->validate([
            'subject' => 'required|string|max:255',
            'message' => 'required|string',
            'category' => 'required|in:gangguan,pembayaran,layanan,lainnya',
        ]);

        $complaint = \App\Models\Complaint::create([
            'customer_id' => $customerId,
            'subject' => $request->subject,
            'message' => $request->message,
            'category' => $request->category,
            'status' => 'pending',
            'priority' => 'medium',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Aduan berhasil dikirim',
            'complaint' => $complaint,
        ], 201);
    }
}

<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\PaymentMethod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PaymentMethodController extends Controller
{
    public function index()
    {
        $methods = PaymentMethod::orderBy('sort_order')->orderBy('created_at')->get();
        return response()->json($methods);
    }

    public function activeList()
    {
        $methods = PaymentMethod::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get();
        return response()->json($methods);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:qris,bank_transfer',
            'bank_name' => 'required_if:type,bank_transfer|nullable|string|max:100',
            'account_name' => 'required_if:type,bank_transfer|nullable|string|max:255',
            'account_number' => 'required_if:type,bank_transfer|nullable|string|max:50',
            'qris_image' => 'nullable|image|max:2048',
            'instructions' => 'nullable|string',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
        ]);

        if ($request->hasFile('qris_image')) {
            $validated['qris_image'] = $request->file('qris_image')->store('payment-methods', 'public');
        }

        // If setting as default, unset other defaults
        if ($request->is_default) {
            PaymentMethod::where('is_default', true)->update(['is_default' => false]);
        }

        $method = PaymentMethod::create($validated);

        return response()->json([
            'message' => 'Metode pembayaran berhasil ditambahkan',
            'data' => $method
        ], 201);
    }

    public function update(Request $request, PaymentMethod $paymentMethod)
    {
        // Prevent editing default QRIS if it's the only one
        if ($paymentMethod->type === 'qris' && $paymentMethod->is_default) {
            // Only allow updating qris_image and instructions
            $validated = $request->validate([
                'qris_image' => 'nullable|image|max:2048',
                'instructions' => 'nullable|string',
                'is_active' => 'boolean',
            ]);
        } else {
            $validated = $request->validate([
                'type' => 'required|in:qris,bank_transfer',
                'bank_name' => 'required_if:type,bank_transfer|nullable|string|max:100',
                'account_name' => 'required_if:type,bank_transfer|nullable|string|max:255',
                'account_number' => 'required_if:type,bank_transfer|nullable|string|max:50',
                'qris_image' => 'nullable|image|max:2048',
                'instructions' => 'nullable|string',
                'is_active' => 'boolean',
                'is_default' => 'boolean',
            ]);
        }

        if ($request->hasFile('qris_image')) {
            // Delete old image
            if ($paymentMethod->qris_image) {
                Storage::disk('public')->delete($paymentMethod->qris_image);
            }
            $validated['qris_image'] = $request->file('qris_image')->store('payment-methods', 'public');
        }

        // If setting as default, unset other defaults
        if ($request->is_default) {
            PaymentMethod::where('id', '!=', $paymentMethod->id)
                ->where('is_default', true)
                ->update(['is_default' => false]);
        }

        $paymentMethod->update($validated);

        return response()->json([
            'message' => 'Metode pembayaran berhasil diperbarui',
            'data' => $paymentMethod
        ]);
    }

    public function destroy(PaymentMethod $paymentMethod)
    {
        // Prevent deleting default QRIS
        if ($paymentMethod->type === 'qris' && $paymentMethod->is_default) {
            return response()->json([
                'message' => 'Metode QRIS utama tidak dapat dihapus'
            ], 403);
        }

        if ($paymentMethod->qris_image) {
            Storage::disk('public')->delete($paymentMethod->qris_image);
        }

        $paymentMethod->delete();

        return response()->json([
            'message' => 'Metode pembayaran berhasil dihapus'
        ]);
    }

    public function toggleActive(PaymentMethod $paymentMethod)
    {
        $paymentMethod->update(['is_active' => !$paymentMethod->is_active]);

        return response()->json([
            'message' => $paymentMethod->is_active ? 'Metode pembayaran diaktifkan' : 'Metode pembayaran dinonaktifkan',
            'data' => $paymentMethod
        ]);
    }

    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'orders' => 'required|array',
            'orders.*.id' => 'required|exists:payment_methods,id',
            'orders.*.sort_order' => 'required|integer',
        ]);

        foreach ($validated['orders'] as $order) {
            PaymentMethod::where('id', $order['id'])->update(['sort_order' => $order['sort_order']]);
        }

        return response()->json(['message' => 'Urutan berhasil diperbarui']);
    }
}

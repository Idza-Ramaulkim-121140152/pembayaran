<?php

namespace App\Http\Controllers;

use App\Models\PaymentReceiptOption;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class PaymentReceiptOptionController extends Controller
{
    private function isTableReady(): bool
    {
        return Schema::hasTable('payment_receipt_options');
    }

    public function index()
    {
        if (!$this->isTableReady()) {
            return response()->json([]);
        }

        $options = PaymentReceiptOption::orderBy('sort_order')
            ->orderBy('created_at')
            ->get();

        return response()->json($options);
    }

    public function activeList()
    {
        if (!$this->isTableReady()) {
            return response()->json([]);
        }

        $options = PaymentReceiptOption::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get();

        return response()->json($options);
    }

    public function store(Request $request)
    {
        if (!$this->isTableReady()) {
            return response()->json([
                'message' => 'Fitur belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:payment_receipt_options,name',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if (!empty($validated['is_default'])) {
            PaymentReceiptOption::where('is_default', true)->update(['is_default' => false]);
        }

        $option = PaymentReceiptOption::create($validated);

        return response()->json([
            'message' => 'Opsi penerimaan pembayaran berhasil ditambahkan',
            'data' => $option,
        ], 201);
    }

    public function update(Request $request, PaymentReceiptOption $paymentReceiptOption)
    {
        if (!$this->isTableReady()) {
            return response()->json([
                'message' => 'Fitur belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('payment_receipt_options', 'name')->ignore($paymentReceiptOption->id),
            ],
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if (!empty($validated['is_default'])) {
            PaymentReceiptOption::where('id', '!=', $paymentReceiptOption->id)
                ->where('is_default', true)
                ->update(['is_default' => false]);
        }

        $paymentReceiptOption->update($validated);

        return response()->json([
            'message' => 'Opsi penerimaan pembayaran berhasil diperbarui',
            'data' => $paymentReceiptOption,
        ]);
    }

    public function destroy(PaymentReceiptOption $paymentReceiptOption)
    {
        if (!$this->isTableReady()) {
            return response()->json([
                'message' => 'Fitur belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $wasDefault = (bool) $paymentReceiptOption->is_default;
        $paymentReceiptOption->delete();

        if ($wasDefault && !PaymentReceiptOption::where('is_default', true)->exists()) {
            $fallback = PaymentReceiptOption::where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('created_at')
                ->first();

            if ($fallback) {
                $fallback->update(['is_default' => true]);
            }
        }

        return response()->json([
            'message' => 'Opsi penerimaan pembayaran berhasil dihapus',
        ]);
    }

    public function toggleActive(PaymentReceiptOption $paymentReceiptOption)
    {
        if (!$this->isTableReady()) {
            return response()->json([
                'message' => 'Fitur belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $nextState = !$paymentReceiptOption->is_active;

        if ($paymentReceiptOption->is_default && !$nextState) {
            return response()->json([
                'message' => 'Opsi penerimaan utama tidak dapat dinonaktifkan.',
            ], 422);
        }

        $paymentReceiptOption->update(['is_active' => $nextState]);

        return response()->json([
            'message' => $paymentReceiptOption->is_active
                ? 'Opsi penerimaan pembayaran diaktifkan'
                : 'Opsi penerimaan pembayaran dinonaktifkan',
            'data' => $paymentReceiptOption,
        ]);
    }
}

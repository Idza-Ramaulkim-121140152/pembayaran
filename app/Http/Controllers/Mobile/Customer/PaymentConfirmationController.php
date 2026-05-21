<?php

namespace App\Http\Controllers\Mobile\Customer;

use App\Http\Controllers\Concerns\PaymentProofGuard;
use App\Models\Invoice;
use Illuminate\Http\Request;

class PaymentConfirmationController extends BaseMobileCustomerController
{
    use PaymentProofGuard;

    public function store(Request $request)
    {
        $customer = $this->customer($request);

        $this->ensurePaymentProofUploadWithinPostLimit($request);
        $this->warnIfPaymentProofPayloadInvalid($request, null, 'mobile');
        $this->ensurePaymentProofUploadIsValid($request);
        $this->ensureNonFilePaymentProofPayloadRejected($request);

        $validated = $request->validate([
            'invoice_id' => 'required|integer|exists:invoices,id',
            'paid_amount' => 'nullable|numeric|min:1',
            'bukti_pembayaran' => 'nullable|file|mimes:' . $this->paymentProofMimeList() . '|max:2048',
        ]);

        $invoice = Invoice::query()
            ->where('id', $validated['invoice_id'])
            ->where('customer_id', $customer->id)
            ->first();

        if (!$invoice) {
            return response()->json([
                'message' => 'Invoice tidak ditemukan.',
            ], 404);
        }

        if (strtolower((string) $invoice->status) === 'paid') {
            return response()->json([
                'message' => 'Invoice sudah lunas.',
            ], 422);
        }

        if (strtolower((string) $invoice->status) === 'cancelled') {
            return response()->json([
                'message' => 'Invoice sudah dibatalkan.',
            ], 422);
        }

        if (!empty($validated['paid_amount'])) {
            $invoice->amount = $validated['paid_amount'];
        }

        if ($request->hasFile('bukti_pembayaran')) {
            $path = $request->file('bukti_pembayaran')->store('bukti_pembayaran', 'public');
            $invoice->bukti_pembayaran = $path;
            $invoice->tolak_info = null;
        }

        if (strtolower((string) $invoice->status) !== 'paid') {
            $invoice->status = 'menunggu konfirmasi';
            $invoice->paid_at = null;
        }

        $invoice->save();
        $this->appendPaymentProofAttributes($invoice);

        return response()->json([
            'message' => 'Konfirmasi pembayaran berhasil dikirim.',
            'data' => $invoice,
        ]);
    }
}

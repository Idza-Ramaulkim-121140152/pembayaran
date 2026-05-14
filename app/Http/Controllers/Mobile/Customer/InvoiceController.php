<?php

namespace App\Http\Controllers\Mobile\Customer;

use App\Models\Invoice;
use Illuminate\Http\Request;

class InvoiceController extends BaseMobileCustomerController
{
    public function index(Request $request)
    {
        $customer = $this->customer($request);
        $limit = max(1, min((int) $request->query('limit', 20), 100));

        $invoices = Invoice::query()
            ->where('customer_id', $customer->id)
            ->with('items')
            ->orderByDesc('invoice_date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $invoices,
        ]);
    }

    public function show(Request $request, Invoice $invoice)
    {
        $customer = $this->customer($request);

        if ((int) $invoice->customer_id !== (int) $customer->id) {
            return response()->json([
                'message' => 'Invoice tidak ditemukan.',
            ], 404);
        }

        $invoice->loadMissing('customer:id,name,phone,address,pppoe_username,package_type', 'items');

        return response()->json([
            'data' => $invoice,
            'breakdown' => [
                'total' => (float) $invoice->amount,
                'items_count' => $invoice->items->count(),
            ],
        ]);
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Services\AuditLogService;
use App\Services\BillingItemService;
use App\Services\FeatureService;
use Illuminate\Http\Request;

class InvoiceItemController extends Controller
{
    public function __construct(
        private FeatureService $featureService,
        private BillingItemService $billingItemService,
        private AuditLogService $auditLogService,
    ) {
    }

    public function show(Invoice $invoice)
    {
        $invoice->load([
            'customer:id,name,pppoe_username,phone,package_type,package_id',
            'items',
        ]);

        return response()->json([
            'data' => $invoice,
            'breakdown' => [
                'total' => (float) $invoice->amount,
                'items_count' => $invoice->items->count(),
            ],
        ]);
    }

    public function store(Request $request, Invoice $invoice)
    {
        if (!$this->featureService->enabled('billing_items_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = $request->validate([
            'item_type' => 'required|in:package,addon,discount,prorate,adjustment',
            'description' => 'required|string|max:255',
            'quantity' => 'nullable|numeric',
            'unit_price' => 'nullable|numeric',
            'amount' => 'nullable|numeric',
            'discount_mode' => 'nullable|in:amount,percent',
            'discount_percent' => 'nullable|numeric|min:0|max:100',
            'base_amount' => 'nullable|numeric|min:0',
            'meta' => 'nullable|array',
            'reason' => 'nullable|string|max:255',
        ]);

        $amount = $this->billingItemService->resolveAmountForStore($invoice, $validated);
        $meta = $validated['meta'] ?? [];
        if (($validated['item_type'] ?? null) === 'discount') {
            $meta = array_merge($meta, [
                'discount_mode' => $validated['discount_mode'] ?? 'amount',
                'discount_percent' => isset($validated['discount_percent']) ? (float) $validated['discount_percent'] : null,
                'base_amount' => isset($validated['base_amount']) ? (float) $validated['base_amount'] : null,
            ]);
        }

        $item = InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'item_type' => $validated['item_type'],
            'description' => $validated['description'],
            'quantity' => $validated['quantity'] ?? 1,
            'unit_price' => $validated['unit_price'] ?? 0,
            'amount' => $amount,
            'meta' => $meta ?: null,
            'created_by' => auth()->id(),
        ]);

        $invoice = $this->billingItemService->recalculateInvoiceTotal($invoice);

        $this->auditLogService->log('invoice.item_created', $invoice, [
            'invoice_item_id' => $item->id,
            'item_type' => $item->item_type,
            'amount' => (float) $item->amount,
            'reason' => $validated['reason'] ?? null,
        ], auth()->id());

        return response()->json([
            'message' => 'Item invoice berhasil ditambahkan.',
            'data' => $invoice,
        ], 201);
    }

    public function update(Request $request, Invoice $invoice, InvoiceItem $item)
    {
        if ((int) $item->invoice_id !== (int) $invoice->id) {
            abort(404);
        }

        $validated = $request->validate([
            'description' => 'required|string|max:255',
            'quantity' => 'nullable|numeric',
            'unit_price' => 'nullable|numeric',
            'amount' => 'nullable|numeric',
            'discount_mode' => 'nullable|in:amount,percent',
            'discount_percent' => 'nullable|numeric|min:0|max:100',
            'base_amount' => 'nullable|numeric|min:0',
            'meta' => 'nullable|array',
            'reason' => 'nullable|string|max:255',
        ]);

        $oldAmount = (float) $item->amount;
        $item->description = $validated['description'];
        $item->quantity = $validated['quantity'] ?? 1;
        $item->unit_price = $validated['unit_price'] ?? 0;
        $item->amount = $this->billingItemService->resolveAmountForUpdate($invoice, $item, $validated);
        $meta = $validated['meta'] ?? [];
        if ($item->item_type === 'discount') {
            $existingMeta = is_array($item->meta) ? $item->meta : [];
            $meta = array_merge($meta, [
                'discount_mode' => $validated['discount_mode'] ?? ($existingMeta['discount_mode'] ?? 'amount'),
                'discount_percent' => isset($validated['discount_percent'])
                    ? (float) $validated['discount_percent']
                    : ($existingMeta['discount_percent'] ?? null),
                'base_amount' => isset($validated['base_amount'])
                    ? (float) $validated['base_amount']
                    : ($existingMeta['base_amount'] ?? null),
            ]);
        }
        $item->meta = $meta ?: null;
        $item->save();

        $invoice = $this->billingItemService->recalculateInvoiceTotal($invoice);

        $this->auditLogService->log('invoice.item_updated', $invoice, [
            'invoice_item_id' => $item->id,
            'old_amount' => $oldAmount,
            'new_amount' => (float) $item->amount,
            'reason' => $validated['reason'] ?? null,
        ], auth()->id());

        return response()->json([
            'message' => 'Item invoice berhasil diperbarui.',
            'data' => $invoice,
        ]);
    }

    public function destroy(Request $request, Invoice $invoice, InvoiceItem $item)
    {
        if ((int) $item->invoice_id !== (int) $invoice->id) {
            abort(404);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:255',
        ]);

        $amount = (float) $item->amount;
        $itemId = $item->id;
        $item->delete();

        $invoice = $this->billingItemService->recalculateInvoiceTotal($invoice);

        $this->auditLogService->log('invoice.item_deleted', $invoice, [
            'invoice_item_id' => $itemId,
            'amount' => $amount,
            'reason' => $validated['reason'] ?? null,
        ], auth()->id());

        return response()->json([
            'message' => 'Item invoice berhasil dihapus.',
            'data' => $invoice,
        ]);
    }
}

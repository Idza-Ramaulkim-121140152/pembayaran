<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerPackageHistory;
use App\Models\Invoice;
use App\Models\InvoiceItem;

class BillingItemService
{
    public function recalculateInvoiceTotal(Invoice $invoice): Invoice
    {
        $total = (float) $invoice->items()->sum('amount');
        $invoice->amount = $total;
        $invoice->save();

        return $invoice->fresh('items');
    }

    public function normalizeAmount(array $payload): float
    {
        $quantity = (float) ($payload['quantity'] ?? 1);
        $unitPrice = (float) ($payload['unit_price'] ?? 0);

        if (array_key_exists('amount', $payload) && $payload['amount'] !== null) {
            return (float) $payload['amount'];
        }

        return $quantity * $unitPrice;
    }

    public function resolveAmountForStore(Invoice $invoice, array $payload): float
    {
        if (($payload['item_type'] ?? null) !== 'discount') {
            return $this->normalizeAmount($payload);
        }

        return $this->resolveDiscountAmount($invoice, $payload, null);
    }

    public function resolveAmountForUpdate(Invoice $invoice, InvoiceItem $item, array $payload): float
    {
        if ($item->item_type !== 'discount') {
            return $this->normalizeAmount($payload);
        }

        return $this->resolveDiscountAmount($invoice, $payload, $item->id);
    }

    private function resolveDiscountAmount(Invoice $invoice, array $payload, ?int $excludeItemId = null): float
    {
        $mode = strtolower((string) ($payload['discount_mode'] ?? 'amount'));

        if ($mode !== 'percent') {
            $amount = $this->normalizeAmount($payload);
            return $amount > 0 ? -$amount : $amount;
        }

        $percent = (float) ($payload['discount_percent'] ?? 0);
        $percent = max(0, min(100, $percent));

        $baseAmount = null;
        if (array_key_exists('base_amount', $payload) && $payload['base_amount'] !== null && $payload['base_amount'] !== '') {
            $baseAmount = (float) $payload['base_amount'];
        }

        if ($baseAmount === null) {
            $query = $invoice->items()
                ->whereIn('item_type', ['package', 'addon', 'prorate', 'adjustment']);

            if ($excludeItemId) {
                $query->where('id', '!=', $excludeItemId);
            }

            $baseAmount = (float) $query->sum('amount');
        }

        $discount = round(($baseAmount * $percent) / 100, 2);

        return -abs($discount);
    }

    public function appendPackageHistory(
        Customer $customer,
        ?int $oldPackageId,
        ?int $newPackageId,
        ?string $oldLabel,
        ?string $newLabel,
        ?string $reason,
        ?int $userId
    ): void {
        CustomerPackageHistory::create([
            'customer_id' => $customer->id,
            'old_package_id' => $oldPackageId,
            'new_package_id' => $newPackageId,
            'old_package_label' => $oldLabel,
            'new_package_label' => $newLabel,
            'effective_from' => now()->toDateString(),
            'reason' => $reason,
            'changed_by' => $userId,
        ]);
    }
}

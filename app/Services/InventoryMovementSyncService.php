<?php

namespace App\Services;

use App\Models\FinancialTransaction;
use App\Models\InventoryDebt;
use App\Models\InventoryMovement;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class InventoryMovementSyncService
{
    public function __construct(
        private InventoryService $inventoryService,
        private FinancialLedgerService $ledgerService,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function updateMovement(InventoryMovement $movement, array $payload, int $actorId): InventoryMovement
    {
        $movement->loadMissing('pengeluaran');

        $old = [
            'inventory_item_id' => (int) $movement->inventory_item_id,
            'movement_type' => (string) $movement->movement_type,
            'source' => (string) $movement->source,
            'quantity' => (float) $movement->quantity,
            'total_amount' => $movement->total_amount !== null ? (float) $movement->total_amount : null,
            'pengeluaran_id' => $movement->pengeluaran_id,
        ];

        $newItemId = (int) $payload['inventory_item_id'];
        $newMovementType = (string) $payload['movement_type'];
        $newQuantity = (float) $payload['quantity'];
        $newUnitPrice = array_key_exists('unit_price', $payload) && $payload['unit_price'] !== null
            ? (float) $payload['unit_price']
            : null;

        $newTotalAmount = $newUnitPrice !== null ? round($newUnitPrice * $newQuantity, 2) : null;

        $this->assertProjectedStock(
            $old['inventory_item_id'],
            $old['movement_type'],
            $old['quantity'],
            $newItemId,
            $newMovementType,
            $newQuantity
        );

        $movement->fill([
            'inventory_item_id' => $newItemId,
            'movement_type' => $newMovementType,
            'quantity' => $newQuantity,
            'unit_price' => $newUnitPrice,
            'total_amount' => $newTotalAmount,
            'transaction_date' => $payload['transaction_date'],
            'notes' => $payload['notes'] ?? null,
        ]);
        $movement->save();

        $this->syncCashMovementAfterUpdate($movement, $old, $actorId);
        $this->syncDebtMovementAfterUpdate($movement, $old, $actorId);

        return $movement->fresh(['item.type:id,name', 'creator:id,name', 'pengeluaran']);
    }

    public function deleteMovement(InventoryMovement $movement, int $actorId): void
    {
        $movement->loadMissing('pengeluaran');

        $this->assertProjectedStock(
            (int) $movement->inventory_item_id,
            (string) $movement->movement_type,
            (float) $movement->quantity,
            null,
            null,
            0
        );

        $this->syncCashMovementBeforeDelete($movement, $actorId);
        $this->syncDebtMovementBeforeDelete($movement, $actorId);

        $movement->delete();
    }

    private function assertProjectedStock(
        int $oldItemId,
        string $oldMovementType,
        float $oldQuantity,
        ?int $newItemId,
        ?string $newMovementType,
        float $newQuantity
    ): void {
        $oldSigned = $this->signedQuantity($oldMovementType, $oldQuantity);
        $newSigned = ($newItemId !== null && $newMovementType !== null)
            ? $this->signedQuantity($newMovementType, $newQuantity)
            : 0;

        $affectedItemIds = [$oldItemId];
        if ($newItemId !== null) {
            $affectedItemIds[] = $newItemId;
        }

        foreach (array_unique($affectedItemIds) as $itemId) {
            $currentStock = (float) $this->inventoryService->getCurrentStock((int) $itemId);
            $projectedStock = $currentStock;

            if ((int) $itemId === $oldItemId) {
                $projectedStock -= $oldSigned;
            }

            if ($newItemId !== null && (int) $itemId === $newItemId) {
                $projectedStock += $newSigned;
            }

            if ($projectedStock < -0.00001) {
                throw ValidationException::withMessages([
                    'quantity' => 'Perubahan ditolak karena membuat stok menjadi minus untuk barang terkait.',
                ]);
            }
        }
    }

    private function signedQuantity(string $movementType, float $quantity): float
    {
        return $movementType === 'in' ? $quantity : -$quantity;
    }

    /**
     * @param array<string, mixed> $old
     */
    private function syncCashMovementAfterUpdate(InventoryMovement $movement, array $old, int $actorId): void
    {
        $oldWasCashIncoming = $old['source'] === 'manual_in_cash' && $old['movement_type'] === 'in';
        $newIsCashIncoming = $movement->source === 'manual_in_cash' && $movement->movement_type === 'in';

        $oldTotal = (float) ($old['total_amount'] ?? 0);
        $newTotal = (float) ($movement->total_amount ?? 0);

        if ($oldWasCashIncoming && !$newIsCashIncoming) {
            if ($movement->pengeluaran) {
                $this->ledgerService->removePengeluaran($movement->pengeluaran);
                $movement->pengeluaran->delete();
                $movement->pengeluaran_id = null;
                $movement->save();
            } elseif ($oldTotal > 0) {
                $this->createLegacyAdjustment(
                    $oldTotal,
                    'Koreksi legacy: penghapusan/konversi transaksi inventori tunai tanpa relasi pengeluaran.',
                    $actorId,
                    $movement->transaction_date?->format('Y-m-d')
                );
            }

            return;
        }

        if (!$newIsCashIncoming) {
            return;
        }

        if ($movement->pengeluaran) {
            $movement->pengeluaran->update([
                'tanggal' => $movement->transaction_date?->format('Y-m-d') ?? now()->toDateString(),
                'jumlah' => (int) round($newTotal),
                'kategori' => 'Inventori',
                'detail' => $movement->notes ?: 'Pembelian inventori tunai',
                'user_id' => $movement->created_by ?? $actorId,
            ]);

            $this->ledgerService->syncPengeluaran($movement->pengeluaran, $actorId);
            return;
        }

        $delta = $newTotal - $oldTotal;
        if (abs($delta) > 0.00001) {
            $this->createLegacyAdjustment(
                -$delta,
                'Koreksi legacy: update transaksi inventori tunai tanpa relasi pengeluaran.',
                $actorId,
                $movement->transaction_date?->format('Y-m-d')
            );
        }
    }

    /**
     * @param array<string, mixed> $old
     */
    private function syncDebtMovementAfterUpdate(InventoryMovement $movement, array $old, int $actorId): void
    {
        $oldWasDebtIncoming = $old['source'] === 'manual_in_debt' && $old['movement_type'] === 'in';
        $newIsDebtIncoming = $movement->source === 'manual_in_debt' && $movement->movement_type === 'in';

        $debt = InventoryDebt::query()
            ->with(['payments'])
            ->where('inventory_movement_id', $movement->id)
            ->lockForUpdate()
            ->first();

        if (!$newIsDebtIncoming) {
            if ($debt) {
                $this->removeDebtWithPayments($debt, $actorId, $movement->transaction_date?->format('Y-m-d'));
            }
            return;
        }

        $newOriginalAmount = $movement->total_amount !== null ? (float) $movement->total_amount : null;

        if (!$debt) {
            $debt = InventoryDebt::create([
                'inventory_item_id' => $movement->inventory_item_id,
                'inventory_movement_id' => $movement->id,
                'quantity' => $movement->quantity,
                'unit_price' => $movement->unit_price,
                'original_amount' => $newOriginalAmount,
                'paid_amount' => 0,
                'status' => 'unpaid',
                'due_date' => null,
                'notes' => $movement->notes,
                'created_by' => $movement->created_by ?? $actorId,
            ]);
            return;
        }

        $paidAmount = (float) $debt->payments()->sum('amount');

        if ($newOriginalAmount !== null && $newOriginalAmount + 0.00001 < $paidAmount) {
            throw ValidationException::withMessages([
                'unit_price' => 'Perubahan ditolak: total hutang baru lebih kecil dari nominal pembayaran yang sudah dicatat.',
            ]);
        }

        $debt->inventory_item_id = $movement->inventory_item_id;
        $debt->quantity = $movement->quantity;
        $debt->unit_price = $movement->unit_price;
        $debt->original_amount = $newOriginalAmount;
        $debt->paid_amount = $paidAmount;
        $debt->notes = $movement->notes;

        if ($newOriginalAmount === null) {
            $debt->status = $paidAmount > 0 ? 'partial' : 'unpaid';
            $debt->settled_at = null;
        } else {
            $remaining = max(0, $newOriginalAmount - $paidAmount);
            if ($remaining <= 0.00001) {
                $debt->status = 'paid';
                $debt->settled_at = now();
            } elseif ($paidAmount > 0) {
                $debt->status = 'partial';
                $debt->settled_at = null;
            } else {
                $debt->status = 'unpaid';
                $debt->settled_at = null;
            }
        }

        $debt->save();

        if (!$oldWasDebtIncoming && $debt->payments()->exists()) {
            // No-op; safety hook for future source conversion handling.
        }
    }

    private function syncCashMovementBeforeDelete(InventoryMovement $movement, int $actorId): void
    {
        $isCashIncoming = $movement->source === 'manual_in_cash' && $movement->movement_type === 'in';
        if (!$isCashIncoming) {
            return;
        }

        $total = (float) ($movement->total_amount ?? 0);

        if ($movement->pengeluaran) {
            $this->ledgerService->removePengeluaran($movement->pengeluaran);
            $movement->pengeluaran->delete();
            return;
        }

        if ($total > 0) {
            $this->createLegacyAdjustment(
                $total,
                'Koreksi legacy: hapus transaksi inventori tunai tanpa relasi pengeluaran.',
                $actorId,
                $movement->transaction_date?->format('Y-m-d')
            );
        }
    }

    private function syncDebtMovementBeforeDelete(InventoryMovement $movement, int $actorId): void
    {
        $isDebtIncoming = $movement->source === 'manual_in_debt' && $movement->movement_type === 'in';
        if (!$isDebtIncoming) {
            return;
        }

        $debt = InventoryDebt::query()
            ->with(['payments'])
            ->where('inventory_movement_id', $movement->id)
            ->lockForUpdate()
            ->first();

        if ($debt) {
            $this->removeDebtWithPayments($debt, $actorId, $movement->transaction_date?->format('Y-m-d'));
        }
    }

    private function removeDebtWithPayments(InventoryDebt $debt, int $actorId, ?string $referenceDate = null): void
    {
        $payments = $debt->payments()->with('pengeluaran')->get();

        foreach ($payments as $payment) {
            $amount = (float) $payment->amount;

            if ($payment->pengeluaran) {
                $this->ledgerService->removePengeluaran($payment->pengeluaran);
                $payment->pengeluaran->delete();
            } elseif ($amount > 0) {
                $this->createLegacyAdjustment(
                    $amount,
                    'Koreksi legacy: hapus pembayaran hutang inventori tanpa relasi pengeluaran.',
                    $actorId,
                    $referenceDate
                );
            }

            $payment->delete();
        }

        $debt->delete();
    }

    private function createLegacyAdjustment(float $amount, string $description, int $actorId, ?string $transactionDate = null): void
    {
        if (abs($amount) <= 0.00001) {
            return;
        }

        if (!Schema::hasTable('financial_transactions')) {
            return;
        }

        FinancialTransaction::create([
            'type' => 'adjustment',
            'source' => 'inventory_legacy_correction',
            'category' => 'inventory',
            'description' => $description,
            'amount' => round($amount, 2),
            'transaction_date' => $transactionDate ?: now()->toDateString(),
            'created_by' => $actorId,
            'updated_by' => $actorId,
            'meta' => [
                'context' => 'inventory_movement_mutation',
            ],
        ]);
    }
}

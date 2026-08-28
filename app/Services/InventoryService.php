<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\InventoryDebt;
use App\Models\InventoryDebtPayment;
use App\Models\InventoryMovement;
use App\Models\InstallationWorkOrder;
use App\Models\PayrollProject;
use App\Models\Pengeluaran;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InventoryService
{
    public function __construct(private FinancialLedgerService $ledgerService)
    {
    }

    public function isReady(): bool
    {
        return Schema::hasTable('inventory_items')
            && Schema::hasTable('inventory_movements')
            && Schema::hasTable('inventory_debts')
            && Schema::hasTable('inventory_debt_payments');
    }

    public function getCurrentStock(int $itemId): float
    {
        if (!$this->isReady()) {
            return 0;
        }

        $incoming = (float) InventoryMovement::query()
            ->where('inventory_item_id', $itemId)
            ->where('movement_type', 'in')
            ->sum('quantity');

        $outgoing = (float) InventoryMovement::query()
            ->where('inventory_item_id', $itemId)
            ->where('movement_type', 'out')
            ->sum('quantity');

        return $incoming - $outgoing;
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<string, mixed>
     */
    public function recordIncoming(
        array $items,
        string $paymentType,
        string $transactionDate,
        ?string $notes,
        ?string $dueDate,
        int $actorId,
        array $paymentContext = []
    ): array
    {
        if (!$this->isReady()) {
            return [
                'movements' => [],
                'debts' => [],
                'pengeluaran' => null,
            ];
        }

        $movements = [];
        $debts = [];
        $cashTotal = 0.0;
        $cashMovementIds = [];
        $cashGroupKey = $paymentType === 'cash'
            ? 'inv-cash-' . Str::uuid()->toString()
            : null;

        foreach ($items as $item) {
            $quantity = (float) ($item['quantity'] ?? 0);
            if ($quantity <= 0) {
                continue;
            }

            $hasUnitPrice = array_key_exists('unit_price', $item) && $item['unit_price'] !== null && $item['unit_price'] !== '';
            $unitPrice = $hasUnitPrice ? (float) $item['unit_price'] : null;

            if ($paymentType === 'cash' && $unitPrice === null) {
                throw ValidationException::withMessages([
                    'items' => 'Harga satuan wajib diisi untuk pembelian tunai.',
                ]);
            }

            $totalAmount = $unitPrice !== null ? ($quantity * $unitPrice) : null;

            $movement = InventoryMovement::create([
                'inventory_item_id' => (int) $item['inventory_item_id'],
                'movement_type' => 'in',
                'source' => $paymentType === 'cash' ? 'manual_in_cash' : 'manual_in_debt',
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'total_amount' => $totalAmount,
                'transaction_date' => $transactionDate,
                'notes' => $notes,
                'transaction_group_key' => $cashGroupKey,
                'created_by' => $actorId,
                'meta' => [
                    'payment_type' => $paymentType,
                    'payment_source' => $paymentContext['payment_source'] ?? 'company_cash',
                    'borrower_id' => $paymentContext['borrower_id'] ?? null,
                ],
            ]);

            $movements[] = $movement;

            if ($paymentType === 'cash') {
                $cashTotal += (float) ($totalAmount ?? 0);
                $cashMovementIds[] = $movement->id;
                continue;
            }

            $debt = InventoryDebt::create([
                'inventory_item_id' => (int) $item['inventory_item_id'],
                'inventory_movement_id' => $movement->id,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'original_amount' => $totalAmount,
                'paid_amount' => 0,
                'status' => 'unpaid',
                'due_date' => $dueDate,
                'notes' => $notes,
                'created_by' => $actorId,
            ]);

            $debts[] = $debt;
        }

        $pengeluaran = null;
        if ($paymentType === 'cash' && $cashTotal > 0) {
            $pengeluaran = Pengeluaran::create([
                'tanggal' => $transactionDate,
                'jumlah' => (int) round($cashTotal),
                'kategori' => 'Inventori',
                'detail' => $notes ?: 'Pembelian inventori tunai',
                'user_id' => $actorId,
                'payment_source' => $paymentContext['payment_source'] ?? 'company_cash',
                'borrower_id' => $paymentContext['borrower_id'] ?? null,
                'borrower_loan_settlement_amount' => (int) ($paymentContext['borrower_loan_settlement_amount'] ?? 0),
                'borrower_loan_settlement_action_group_key' => $paymentContext['borrower_loan_settlement_action_group_key'] ?? null,
            ]);

            $this->ledgerService->syncPengeluaran($pengeluaran, $actorId);

            if (count($cashMovementIds) > 0) {
                InventoryMovement::query()
                    ->whereIn('id', $cashMovementIds)
                    ->update(['pengeluaran_id' => $pengeluaran->id]);
            }
        }

        return [
            'movements' => $movements,
            'debts' => $debts,
            'pengeluaran' => $pengeluaran,
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<int, InventoryMovement>
     */
    public function recordManualOutgoing(array $items, string $transactionDate, ?string $notes, int $actorId): array
    {
        if (!$this->isReady()) {
            return [];
        }

        $movements = [];

        foreach ($items as $item) {
            $quantity = (float) ($item['quantity'] ?? 0);
            if ($quantity <= 0) {
                continue;
            }

            $inventoryItemId = (int) $item['inventory_item_id'];
            $this->assertSufficientStock($inventoryItemId, $quantity);

            $movement = InventoryMovement::create([
                'inventory_item_id' => $inventoryItemId,
                'movement_type' => 'out',
                'source' => 'manual_out',
                'quantity' => $quantity,
                'transaction_date' => $transactionDate,
                'notes' => $notes,
                'created_by' => $actorId,
            ]);

            $movements[] = $movement;
        }

        return $movements;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, InventoryMovement>
     */
    public function recordInstallationOutgoing(Customer $customer, array $payload, int $actorId): array
    {
        if (!$this->isReady()) {
            return [];
        }

        $movements = [];
        $transactionDate = $customer->activation_date
            ? $customer->activation_date->format('Y-m-d')
            : now()->toDateString();

        $routerItemId = (int) ($payload['router_item_id'] ?? 0);
        if ($routerItemId > 0) {
            $this->assertSufficientStock($routerItemId, 1);

            $movements[] = InventoryMovement::create([
                'inventory_item_id' => $routerItemId,
                'movement_type' => 'out',
                'source' => 'installation',
                'quantity' => 1,
                'transaction_date' => $transactionDate,
                'notes' => 'Instalasi pelanggan ' . $customer->name,
                'created_by' => $actorId,
                'reference_type' => Customer::class,
                'reference_id' => $customer->id,
                'meta' => [
                    'customer_name' => $customer->name,
                    'kind' => 'router',
                    'installation_notes' => $payload['notes'] ?? null,
                    'payroll_project_id' => $payload['payroll_project_id'] ?? null,
                ],
            ]);
        }

        $cableItemId = (int) ($payload['cable_item_id'] ?? 0);
        $cableUsed = (float) ($payload['cable_used'] ?? 0);

        if ($cableItemId > 0 && $cableUsed > 0) {
            $this->assertSufficientStock($cableItemId, $cableUsed);

            $movements[] = InventoryMovement::create([
                'inventory_item_id' => $cableItemId,
                'movement_type' => 'out',
                'source' => 'installation',
                'quantity' => $cableUsed,
                'transaction_date' => $transactionDate,
                'notes' => 'Pemakaian kabel instalasi pelanggan ' . $customer->name,
                'created_by' => $actorId,
                'reference_type' => Customer::class,
                'reference_id' => $customer->id,
                'meta' => [
                    'customer_name' => $customer->name,
                    'kind' => 'cable',
                    'installation_notes' => $payload['notes'] ?? null,
                    'payroll_project_id' => $payload['payroll_project_id'] ?? null,
                ],
            ]);
        }

        return $movements;
    }

    /**
     * @param array<int, array{inventory_item_id:int, quantity:numeric-string|float|int, notes?:string|null}> $materials
     * @return array<int, InventoryMovement>
     */
    public function recordInstallationOutgoingForWorkOrder(
        InstallationWorkOrder $workOrder,
        array $materials,
        ?string $transactionDate,
        ?string $notes,
        int $actorId
    ): array {
        if (!$this->isReady()) {
            return [];
        }

        $date = $transactionDate ?: now()->toDateString();
        $movements = [];

        foreach ($materials as $material) {
            $inventoryItemId = (int) ($material['inventory_item_id'] ?? 0);
            $quantity = (float) ($material['quantity'] ?? 0);

            if ($inventoryItemId <= 0 || $quantity <= 0) {
                continue;
            }

            $this->assertSufficientStock($inventoryItemId, $quantity);

            $movements[] = InventoryMovement::create([
                'inventory_item_id' => $inventoryItemId,
                'movement_type' => 'out',
                'source' => 'installation',
                'quantity' => $quantity,
                'transaction_date' => $date,
                'notes' => $material['notes'] ?? $notes ?? ('Pemakaian material WO #' . $workOrder->id),
                'created_by' => $actorId,
                'reference_type' => InstallationWorkOrder::class,
                'reference_id' => $workOrder->id,
                'meta' => [
                    'installation_work_order_id' => $workOrder->id,
                    'customer_id' => $workOrder->customer_id,
                    'lead_id' => $workOrder->lead_id,
                ],
            ]);
        }

        return $movements;
    }

    public function syncPayrollProjectOutflow(PayrollProject $project, ?int $actorId = null): void
    {
        if (!$this->isReady()) {
            return;
        }

        $this->removePayrollProjectOutflow($project);

        $project->loadMissing('details');

        foreach ($project->details as $detail) {
            if (!$detail->inventory_item_id) {
                continue;
            }

            $quantity = (float) $detail->jumlah;
            if ($quantity <= 0) {
                continue;
            }

            $this->assertSufficientStock((int) $detail->inventory_item_id, $quantity);

            InventoryMovement::create([
                'inventory_item_id' => (int) $detail->inventory_item_id,
                'movement_type' => 'out',
                'source' => 'payroll_project',
                'quantity' => $quantity,
                'transaction_date' => $project->tanggal->format('Y-m-d'),
                'notes' => 'Pemakaian inventori proyek payroll #' . $project->id,
                'created_by' => $actorId,
                'reference_type' => PayrollProject::class,
                'reference_id' => $project->id,
                'meta' => [
                    'payroll_project_detail_id' => $detail->id,
                    'tipe' => $detail->tipe,
                    'deskripsi' => $detail->deskripsi,
                ],
            ]);
        }
    }

    public function removePayrollProjectOutflow(PayrollProject $project): void
    {
        if (!$this->isReady()) {
            return;
        }

        InventoryMovement::query()
            ->where('source', 'payroll_project')
            ->where('reference_type', PayrollProject::class)
            ->where('reference_id', $project->id)
            ->delete();
    }

    public function payDebt(InventoryDebt $debt, float $amount, string $paymentDate, ?string $notes, int $actorId, bool $markAsPaid = false): InventoryDebtPayment
    {
        if (!$this->isReady()) {
            throw ValidationException::withMessages([
                'inventory' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ]);
        }

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'Nominal pembayaran harus lebih besar dari 0.',
            ]);
        }

        $debt->refresh();

        if ($debt->original_amount !== null) {
            $remaining = max(0, (float) $debt->original_amount - (float) $debt->paid_amount);
            if ($remaining <= 0) {
                throw ValidationException::withMessages([
                    'amount' => 'Hutang ini sudah lunas.',
                ]);
            }

            if ($amount > $remaining) {
                $amount = $remaining;
            }
        }

        $pengeluaran = Pengeluaran::create([
            'tanggal' => $paymentDate,
            'jumlah' => (int) round($amount),
            'kategori' => 'Inventori',
            'detail' => $notes ?: ('Pembayaran hutang inventori: ' . $debt->item?->name),
            'user_id' => $actorId,
        ]);

        $this->ledgerService->syncPengeluaran($pengeluaran, $actorId);

        $payment = InventoryDebtPayment::create([
            'inventory_debt_id' => $debt->id,
            'amount' => $amount,
            'payment_date' => $paymentDate,
            'notes' => $notes,
            'pengeluaran_id' => $pengeluaran->id,
            'created_by' => $actorId,
        ]);

        $this->refreshDebtStatus($debt, $markAsPaid);

        return $payment;
    }

    /**
     * @param Collection<int, InventoryDebt> $debts
     * @return array<int, float>
     */
    public function buildBulkAllocation(Collection $debts, float $totalAmount): array
    {
        $allocations = [];
        $remainingBudget = $totalAmount;

        $knownDebts = $debts->filter(fn (InventoryDebt $debt) => $debt->original_amount !== null);
        $unknownDebts = $debts->filter(fn (InventoryDebt $debt) => $debt->original_amount === null);

        foreach ($knownDebts as $debt) {
            if ($remainingBudget <= 0) {
                break;
            }

            $remaining = max(0, (float) $debt->original_amount - (float) $debt->paid_amount);
            if ($remaining <= 0) {
                continue;
            }

            $pay = min($remainingBudget, $remaining);
            if ($pay <= 0) {
                continue;
            }

            $allocations[$debt->id] = round($pay, 2);
            $remainingBudget -= $pay;
        }

        if ($remainingBudget > 0) {
            foreach ($unknownDebts as $debt) {
                if ($remainingBudget <= 0) {
                    break;
                }

                $allocations[$debt->id] = round(($allocations[$debt->id] ?? 0) + $remainingBudget, 2);
                $remainingBudget = 0;
            }
        }

        return $allocations;
    }

    private function refreshDebtStatus(InventoryDebt $debt, bool $markAsPaid = false): void
    {
        $debt->refresh();

        $paid = (float) $debt->payments()->sum('amount');
        $debt->paid_amount = $paid;

        if ($debt->original_amount === null) {
            if ($markAsPaid) {
                $debt->original_amount = $paid;
                $debt->status = 'paid';
                $debt->settled_at = now();
            } else {
                $debt->status = $paid > 0 ? 'partial' : 'unpaid';
                $debt->settled_at = null;
            }

            $debt->save();
            return;
        }

        $remaining = max(0, (float) $debt->original_amount - $paid);

        if ($remaining <= 0.00001) {
            $debt->status = 'paid';
            $debt->settled_at = now();
        } elseif ($paid > 0) {
            $debt->status = 'partial';
            $debt->settled_at = null;
        } else {
            $debt->status = 'unpaid';
            $debt->settled_at = null;
        }

        $debt->save();
    }

    private function assertSufficientStock(int $inventoryItemId, float $quantity): void
    {
        if ($quantity <= 0) {
            return;
        }

        $currentStock = $this->getCurrentStock($inventoryItemId);

        if ($currentStock + 0.00001 < $quantity) {
            throw ValidationException::withMessages([
                'stock' => 'Stok barang tidak mencukupi. Sisa stok saat ini: ' . rtrim(rtrim(number_format($currentStock, 2, '.', ''), '0'), '.'),
            ]);
        }
    }
}

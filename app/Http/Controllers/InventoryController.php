<?php

namespace App\Http\Controllers;

use App\Models\InventoryDebt;
use App\Models\InventoryItem;
use App\Models\InventoryItemType;
use App\Models\InventoryMovement;
use App\Models\SiteSetting;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class InventoryController extends Controller
{
    private const SETTING_DEFAULT_INSTALLATION_LABOR_FEE = 'default_installation_labor_fee_payroll';
    private const SETTING_DEFAULT_INSTALLATION_CABLE_RATE = 'default_installation_cable_rate_payroll';

    public function __construct(private InventoryService $inventoryService)
    {
    }

    public function summary(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'items' => [],
                'debts' => [
                    'total_count' => 0,
                    'unpaid_count' => 0,
                    'partial_count' => 0,
                    'paid_count' => 0,
                    'known_outstanding' => 0,
                    'unknown_outstanding_count' => 0,
                ],
                'recent_movements' => [],
            ]);
        }

        $items = $this->inventoryItemStockQuery()
            ->with('type:id,name')
            ->orderBy('name')
            ->get();

        $debtsQuery = InventoryDebt::query();

        $debtSummary = [
            'total_count' => (int) $debtsQuery->count(),
            'unpaid_count' => (int) (clone $debtsQuery)->where('status', 'unpaid')->count(),
            'partial_count' => (int) (clone $debtsQuery)->where('status', 'partial')->count(),
            'paid_count' => (int) (clone $debtsQuery)->where('status', 'paid')->count(),
            'known_outstanding' => (float) (clone $debtsQuery)
                ->whereNotNull('original_amount')
                ->selectRaw('COALESCE(SUM(GREATEST(original_amount - paid_amount, 0)), 0) as outstanding')
                ->value('outstanding'),
            'unknown_outstanding_count' => (int) (clone $debtsQuery)
                ->whereNull('original_amount')
                ->where('status', '!=', 'paid')
                ->count(),
        ];

        $recentMovements = InventoryMovement::with(['item.type:id,name', 'creator:id,name'])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->limit(30)
            ->get();

        return response()->json([
            'items' => $items,
            'debts' => $debtSummary,
            'recent_movements' => $recentMovements,
        ]);
    }

    public function itemOptions()
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json(['data' => []]);
        }

        $items = $this->inventoryItemStockQuery()
            ->with('type:id,name')
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(function (InventoryItem $item) {
                $stock = (float) $item->current_stock;

                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'type_name' => $item->type?->name,
                    'unit' => $item->unit,
                    'default_length' => $item->default_length,
                    'length_unit' => $item->length_unit,
                    'current_stock' => $stock,
                    'label' => trim($item->name . ' - ' . ($item->type?->name ?? 'Tanpa jenis')),
                ];
            })
            ->values();

        return response()->json([
            'data' => $items,
        ]);
    }

    public function installationItemOptions()
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'all_items' => [],
                'router_items' => [],
                'cable_items' => [],
                'default_pricing' => $this->installationDefaultPricing(),
            ]);
        }

        $allItems = $this->inventoryItemStockQuery()
            ->with('type:id,name')
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(function (InventoryItem $item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'type_name' => $item->type?->name,
                    'unit' => $item->unit,
                    'current_stock' => (float) $item->current_stock,
                    'default_length' => $item->default_length,
                    'length_unit' => $item->length_unit,
                ];
            })
            ->values();

        $routerItems = $allItems->filter(function (array $item) {
            $typeName = mb_strtolower((string) ($item['type_name'] ?? ''));
            $name = mb_strtolower((string) ($item['name'] ?? ''));

            return str_contains($typeName, 'router') || str_contains($name, 'router') || str_contains($name, 'onu');
        })->values();

        $cableItems = $allItems->filter(function (array $item) {
            $typeName = mb_strtolower((string) ($item['type_name'] ?? ''));
            $name = mb_strtolower((string) ($item['name'] ?? ''));

            return str_contains($typeName, 'kabel')
                || str_contains($typeName, 'cable')
                || str_contains($name, 'kabel')
                || str_contains($name, 'cable')
                || str_contains($name, 'fiber');
        })->values();

        return response()->json([
            'all_items' => $allItems,
            'router_items' => $routerItems,
            'cable_items' => $cableItems,
            'default_pricing' => $this->installationDefaultPricing(),
        ]);
    }

    public function movements(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'data' => [
                    'data' => [],
                ],
            ]);
        }

        $query = InventoryMovement::with(['item.type:id,name', 'creator:id,name']);
        $perPage = max(10, min($request->integer('per_page', 50), 200));

        if ($request->filled('movement_type')) {
            $query->where('movement_type', $request->string('movement_type'));
        }

        if ($request->filled('source')) {
            $query->where('source', $request->string('source'));
        }

        if ($request->filled('inventory_item_id')) {
            $query->where('inventory_item_id', $request->integer('inventory_item_id'));
        }

        if ($request->filled('start_date')) {
            $query->whereDate('transaction_date', '>=', $request->string('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('transaction_date', '<=', $request->string('end_date'));
        }

        $data = $query
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => $data,
        ]);
    }

    public function storeIncoming(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'transaction_date' => 'required|date',
            'payment_type' => 'required|in:cash,debt',
            'notes' => 'nullable|string|max:500',
            'due_date' => 'nullable|date',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'items.*.quantity' => 'required|numeric|min:0.01',
            'items.*.unit_price' => 'nullable|numeric|min:0',
        ]);

        DB::beginTransaction();

        try {
            $result = $this->inventoryService->recordIncoming(
                $validated['items'],
                $validated['payment_type'],
                $validated['transaction_date'],
                $validated['notes'] ?? null,
                $validated['due_date'] ?? null,
                (int) auth()->id()
            );

            DB::commit();

            return response()->json([
                'message' => $validated['payment_type'] === 'cash'
                    ? 'Pemasukan inventori tunai berhasil dicatat dan disinkronkan ke pengeluaran.'
                    : 'Pemasukan inventori hutang berhasil dicatat.',
                'data' => $result,
            ], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Gagal mencatat pemasukan inventori: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function storeOutgoing(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'transaction_date' => 'required|date',
            'notes' => 'nullable|string|max:500',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'items.*.quantity' => 'required|numeric|min:0.01',
        ]);

        DB::beginTransaction();

        try {
            $movements = $this->inventoryService->recordManualOutgoing(
                $validated['items'],
                $validated['transaction_date'],
                $validated['notes'] ?? null,
                (int) auth()->id()
            );

            DB::commit();

            return response()->json([
                'message' => 'Pengeluaran inventori berhasil dicatat.',
                'data' => $movements,
            ], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Gagal mencatat pengeluaran inventori: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function debts(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'data' => [
                    'data' => [],
                ],
                'summary' => [
                    'known_outstanding' => 0,
                    'unknown_outstanding_count' => 0,
                    'unpaid_count' => 0,
                    'partial_count' => 0,
                    'paid_count' => 0,
                ],
            ]);
        }

        $query = InventoryDebt::with([
            'item.type:id,name',
            'creator:id,name',
            'movement:id,inventory_item_id,transaction_date,source',
            'payments' => fn ($paymentQuery) => $paymentQuery->orderByDesc('payment_date')->orderByDesc('id'),
        ]);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('inventory_item_id')) {
            $query->where('inventory_item_id', $request->integer('inventory_item_id'));
        }

        if ($request->filled('keyword')) {
            $keyword = trim((string) $request->string('keyword'));

            $query->where(function ($inner) use ($keyword) {
                $inner->where('notes', 'like', "%{$keyword}%")
                    ->orWhereHas('item', function ($itemQuery) use ($keyword) {
                        $itemQuery->where('name', 'like', "%{$keyword}%");
                    });
            });
        }

        $perPage = max(10, min($request->integer('per_page', 50), 200));
        $summaryQuery = clone $query;

        $data = (clone $query)
            ->orderByRaw("FIELD(status, 'unpaid', 'partial', 'paid')")
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $summary = [
            'known_outstanding' => (float) (clone $summaryQuery)
                ->whereNotNull('original_amount')
                ->selectRaw('COALESCE(SUM(GREATEST(original_amount - paid_amount, 0)), 0) as outstanding')
                ->value('outstanding'),
            'unknown_outstanding_count' => (int) (clone $summaryQuery)
                ->whereNull('original_amount')
                ->where('status', '!=', 'paid')
                ->count(),
            'unpaid_count' => (int) (clone $summaryQuery)->where('status', 'unpaid')->count(),
            'partial_count' => (int) (clone $summaryQuery)->where('status', 'partial')->count(),
            'paid_count' => (int) (clone $summaryQuery)->where('status', 'paid')->count(),
        ];

        return response()->json([
            'data' => $data,
            'summary' => $summary,
        ]);
    }

    public function payDebt(Request $request, InventoryDebt $debt)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'notes' => 'nullable|string|max:500',
            'mark_as_paid' => 'nullable|boolean',
        ]);

        DB::beginTransaction();

        try {
            $payment = $this->inventoryService->payDebt(
                $debt,
                (float) $validated['amount'],
                $validated['payment_date'],
                $validated['notes'] ?? null,
                (int) auth()->id(),
                (bool) ($validated['mark_as_paid'] ?? false)
            );

            $debt->refresh()->load(['item.type:id,name', 'payments']);

            DB::commit();

            return response()->json([
                'message' => 'Pembayaran hutang berhasil dicatat dan disinkronkan ke pengeluaran.',
                'data' => [
                    'payment' => $payment,
                    'debt' => $debt,
                ],
            ], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Gagal memproses pembayaran hutang: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function payDebtBulk(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'payment_date' => 'required|date',
            'notes' => 'nullable|string|max:500',
            'total_amount' => 'nullable|numeric|min:0.01',
            'debt_ids' => 'nullable|array|min:1',
            'debt_ids.*' => 'integer|exists:inventory_debts,id',
            'allocations' => 'nullable|array|min:1',
            'allocations.*.debt_id' => 'required|integer|exists:inventory_debts,id',
            'allocations.*.amount' => 'required|numeric|min:0.01',
        ]);

        $allocations = [];

        if (!empty($validated['allocations'])) {
            foreach ($validated['allocations'] as $allocation) {
                $debtId = (int) $allocation['debt_id'];
                $allocations[$debtId] = (float) ($allocations[$debtId] ?? 0) + (float) $allocation['amount'];
            }
        } else {
            $debtIds = $validated['debt_ids'] ?? [];
            $totalAmount = (float) ($validated['total_amount'] ?? 0);

            if (count($debtIds) === 0 || $totalAmount <= 0) {
                throw ValidationException::withMessages([
                    'total_amount' => 'Untuk pembayaran total, pilih minimal 1 hutang dan isi nominal keseluruhan.',
                ]);
            }

            /** @var Collection<int, InventoryDebt> $debts */
            $debts = InventoryDebt::with('item')
                ->whereIn('id', $debtIds)
                ->get();

            $allocations = $this->inventoryService->buildBulkAllocation($debts, $totalAmount);

            if (count($allocations) === 0) {
                throw ValidationException::withMessages([
                    'total_amount' => 'Nominal tidak dapat dialokasikan ke hutang yang dipilih.',
                ]);
            }
        }

        DB::beginTransaction();

        try {
            $payments = [];
            $totalPaid = 0;

            foreach ($allocations as $debtId => $amount) {
                if ($amount <= 0) {
                    continue;
                }

                $debt = InventoryDebt::with('item')->lockForUpdate()->findOrFail($debtId);

                $payment = $this->inventoryService->payDebt(
                    $debt,
                    (float) $amount,
                    $validated['payment_date'],
                    $validated['notes'] ?? null,
                    (int) auth()->id(),
                    $debt->original_amount === null
                );

                $payments[] = $payment;
                $totalPaid += (float) $payment->amount;
            }

            DB::commit();

            return response()->json([
                'message' => 'Pembayaran hutang massal berhasil diproses.',
                'data' => [
                    'payments_count' => count($payments),
                    'total_paid' => $totalPaid,
                    'payments' => $payments,
                ],
            ], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Gagal memproses pembayaran hutang massal: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function itemTypesIndex()
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json(['data' => []]);
        }

        $data = InventoryItemType::withCount('items')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $data]);
    }

    public function itemTypesStore(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:inventory_item_types,name',
            'description' => 'nullable|string|max:500',
        ]);

        $type = InventoryItemType::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => 'Jenis barang berhasil ditambahkan.',
            'data' => $type,
        ], 201);
    }

    public function itemTypesUpdate(Request $request, InventoryItemType $type)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('inventory_item_types', 'name')->ignore($type->id),
            ],
            'description' => 'nullable|string|max:500',
        ]);

        $type->update($validated);

        return response()->json([
            'message' => 'Jenis barang berhasil diperbarui.',
            'data' => $type,
        ]);
    }

    public function itemTypesDestroy(InventoryItemType $type)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        if ($type->items()->count() > 0) {
            return response()->json([
                'message' => 'Jenis barang tidak dapat dihapus karena masih digunakan oleh master barang.',
            ], 422);
        }

        $type->delete();

        return response()->json([
            'message' => 'Jenis barang berhasil dihapus.',
        ]);
    }

    public function itemsIndex(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json(['data' => []]);
        }

        $query = $this->inventoryItemStockQuery()->with('type:id,name');

        if ($request->filled('type_id')) {
            $query->where('inventory_item_type_id', $request->integer('type_id'));
        }

        if ($request->filled('active')) {
            $query->where('is_active', filter_var($request->string('active'), FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('keyword')) {
            $keyword = trim((string) $request->string('keyword'));
            $query->where(function ($inner) use ($keyword) {
                $inner->where('name', 'like', "%{$keyword}%")
                    ->orWhere('unit', 'like', "%{$keyword}%")
                    ->orWhereHas('type', function ($typeQuery) use ($keyword) {
                        $typeQuery->where('name', 'like', "%{$keyword}%");
                    });
            });
        }

        $data = $query->orderBy('name')->get();

        return response()->json(['data' => $data]);
    }

    public function itemsStore(Request $request)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'inventory_item_type_id' => 'required|integer|exists:inventory_item_types,id',
            'name' => [
                'required',
                'string',
                'max:150',
                Rule::unique('inventory_items', 'name')->where(function ($query) use ($request) {
                    return $query->where('inventory_item_type_id', $request->integer('inventory_item_type_id'));
                }),
            ],
            'unit' => 'required|string|max:50',
            'default_length' => 'nullable|numeric|min:0',
            'length_unit' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
        ]);

        $item = InventoryItem::create([
            ...$validated,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => auth()->id(),
        ]);

        $item->load('type:id,name');

        return response()->json([
            'message' => 'Barang inventori berhasil ditambahkan.',
            'data' => $item,
        ], 201);
    }

    public function itemsUpdate(Request $request, InventoryItem $item)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'inventory_item_type_id' => 'required|integer|exists:inventory_item_types,id',
            'name' => [
                'required',
                'string',
                'max:150',
                Rule::unique('inventory_items', 'name')
                    ->ignore($item->id)
                    ->where(function ($query) use ($request) {
                        return $query->where('inventory_item_type_id', $request->integer('inventory_item_type_id'));
                    }),
            ],
            'unit' => 'required|string|max:50',
            'default_length' => 'nullable|numeric|min:0',
            'length_unit' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
        ]);

        $item->update([
            ...$validated,
            'is_active' => $validated['is_active'] ?? $item->is_active,
        ]);

        $item->load('type:id,name');

        return response()->json([
            'message' => 'Barang inventori berhasil diperbarui.',
            'data' => $item,
        ]);
    }

    public function itemsDestroy(InventoryItem $item)
    {
        if (!$this->inventoryService->isReady()) {
            return response()->json([
                'message' => 'Fitur inventori belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        if ($item->movements()->exists() || $item->debts()->exists()) {
            return response()->json([
                'message' => 'Barang tidak dapat dihapus karena sudah memiliki histori transaksi.',
            ], 422);
        }

        $item->delete();

        return response()->json([
            'message' => 'Barang inventori berhasil dihapus.',
        ]);
    }

    public function defaultPricing()
    {
        return response()->json([
            'data' => $this->installationDefaultPricing(),
        ]);
    }

    public function updateDefaultPricing(Request $request)
    {
        $validated = $request->validate([
            'installation_labor_fee_default' => 'required|numeric|min:0',
            'installation_cable_rate_default' => 'required|numeric|min:0',
        ]);

        SiteSetting::set(
            self::SETTING_DEFAULT_INSTALLATION_LABOR_FEE,
            (string) $validated['installation_labor_fee_default']
        );
        SiteSetting::set(
            self::SETTING_DEFAULT_INSTALLATION_CABLE_RATE,
            (string) $validated['installation_cable_rate_default']
        );

        return response()->json([
            'message' => 'Default biaya payroll pemasangan berhasil diperbarui.',
            'data' => $this->installationDefaultPricing(),
        ]);
    }

    private function installationDefaultPricing(): array
    {
        return [
            'installation_labor_fee_default' => (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_LABOR_FEE, 0),
            'installation_cable_rate_default' => (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_CABLE_RATE, 0),
        ];
    }

    private function inventoryItemStockQuery()
    {
        return InventoryItem::query()->addSelect([
            'current_stock' => InventoryMovement::query()
                ->selectRaw("COALESCE(SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE -quantity END), 0)")
                ->whereColumn('inventory_item_id', 'inventory_items.id'),
        ]);
    }
}

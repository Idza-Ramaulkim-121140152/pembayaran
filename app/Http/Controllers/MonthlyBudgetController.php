<?php

namespace App\Http\Controllers;

use App\Models\MonthlyBudget;
use App\Services\MonthlyBudgetService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MonthlyBudgetController extends Controller
{
    public function index(Request $request, MonthlyBudgetService $budgetService)
    {
        if (!$budgetService->isReady()) {
            return response()->json([
                'message' => 'Tabel monthly budget belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ]);

        $month = $validated['month'] ?? now()->format('Y-m');
        $budget = $budgetService->findByMonth($month);

        return response()->json([
            'data' => $budgetService->serializeBudget($budget, $month),
            'meta' => [
                'categories' => $budgetService->categoryDefinitions(),
            ],
        ]);
    }

    public function store(Request $request, MonthlyBudgetService $budgetService)
    {
        if (!$budgetService->isReady()) {
            return response()->json([
                'message' => 'Tabel monthly budget belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $payload = $this->validatePayload($request, $budgetService);
        if ($budgetService->findByMonth($payload['month'])) {
            return response()->json([
                'message' => 'Budget untuk bulan ini sudah ada. Gunakan update.',
            ], 422);
        }

        $budget = $budgetService->createBudget(
            $payload['month'],
            $payload['items'],
            $payload['notes'],
            $request->user()?->id
        );

        return response()->json([
            'message' => 'Budget bulanan berhasil dibuat.',
            'data' => $budgetService->serializeBudget($budget, $payload['month']),
        ], 201);
    }

    public function update(Request $request, MonthlyBudget $monthlyBudget, MonthlyBudgetService $budgetService)
    {
        if (!$budgetService->isReady()) {
            return response()->json([
                'message' => 'Tabel monthly budget belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $payload = $this->validatePayload($request, $budgetService, true);
        $budget = $budgetService->updateBudget(
            $monthlyBudget,
            $payload['items'],
            $payload['notes'],
            $request->user()?->id
        );

        return response()->json([
            'message' => 'Budget bulanan berhasil diperbarui.',
            'data' => $budgetService->serializeBudget($budget, $monthlyBudget->month?->format('Y-m') ?? $payload['month'] ?? now()->format('Y-m')),
        ]);
    }

    private function validatePayload(Request $request, MonthlyBudgetService $budgetService, bool $isUpdate = false): array
    {
        $validated = $request->validate([
            'month' => array_filter([
                $isUpdate ? 'nullable' : 'required',
                'date_format:Y-m',
            ]),
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array'],
            'items.*.category_key' => ['required', 'string', Rule::in($budgetService->categoryKeys())],
            'items.*.target_amount' => ['nullable', 'numeric', 'min:0'],
            'items.*.final_active_amount' => ['nullable', 'numeric', 'min:0'],
            'items.*.system_recommended_amount' => ['nullable', 'numeric', 'min:0'],
            'items.*.is_overridden' => ['nullable', 'boolean'],
            'items.*.source' => ['nullable', 'string', 'max:32'],
        ]);

        $validated['month'] = $validated['month'] ?? now()->format('Y-m');
        $validated['notes'] = isset($validated['notes']) ? trim((string) $validated['notes']) : null;
        $validated['items'] = $budgetService->normalizeItemPayload(
            collect($validated['items'] ?? [])->map(function (array $item) {
                $finalActiveAmount = array_key_exists('final_active_amount', $item)
                    ? $item['final_active_amount']
                    : ($item['target_amount'] ?? 0);

                return [
                    'category_key' => $item['category_key'],
                    'target_amount' => $finalActiveAmount,
                    'final_active_amount' => $finalActiveAmount,
                    'system_recommended_amount' => $item['system_recommended_amount'] ?? $finalActiveAmount,
                    'is_overridden' => $item['is_overridden'] ?? null,
                    'source' => $item['source'] ?? null,
                ];
            })->all()
        );

        return $validated;
    }
}

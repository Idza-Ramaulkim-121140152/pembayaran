<?php

namespace App\Http\Controllers;

use App\Models\ExpenseCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ExpenseCategoryController extends Controller
{
    public function index(Request $request)
    {
        $query = ExpenseCategory::query()->orderBy('name');

        if (!$request->user()?->isSuperAdmin()) {
            $query->where('is_active', true);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validatePayload($request);

        $category = ExpenseCategory::create($validated);

        return response()->json([
            'data' => $category,
            'message' => 'Jenis pengeluaran berhasil ditambahkan',
        ], 201);
    }

    public function update(Request $request, ExpenseCategory $expenseCategory)
    {
        $validated = $this->validatePayload($request, $expenseCategory->id);

        $expenseCategory->update($validated);

        return response()->json([
            'data' => $expenseCategory->fresh(),
            'message' => 'Jenis pengeluaran berhasil diperbarui',
        ]);
    }

    public function destroy(ExpenseCategory $expenseCategory)
    {
        if ($expenseCategory->pengeluarans()->exists()) {
            return response()->json([
                'message' => 'Jenis pengeluaran tidak dapat dihapus karena sudah dipakai.',
            ], 422);
        }

        $expenseCategory->delete();

        return response()->json([
            'message' => 'Jenis pengeluaran berhasil dihapus',
        ]);
    }

    private function validatePayload(Request $request, ?int $ignoreId = null): array
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('expense_categories', 'name')->ignore($ignoreId),
            ],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $validated['name'] = trim((string) ($validated['name'] ?? ''));
        $validated['is_active'] = (bool) ($validated['is_active'] ?? true);

        $duplicateExists = ExpenseCategory::query()
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($validated['name'])])
            ->exists();

        if ($duplicateExists) {
            abort(response()->json([
                'message' => 'Nama jenis pengeluaran sudah digunakan.',
                'errors' => [
                    'name' => ['Nama jenis pengeluaran sudah digunakan.'],
                ],
            ], 422));
        }

        return $validated;
    }
}

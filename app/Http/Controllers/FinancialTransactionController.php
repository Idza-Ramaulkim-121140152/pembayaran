<?php

namespace App\Http\Controllers;

use App\Models\FinancialTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class FinancialTransactionController extends Controller
{
    private function isLedgerReady(): bool
    {
        return Schema::hasTable('financial_transactions');
    }

    private function ensureCanEditMutations(): void
    {
        if (!auth()->check() || !auth()->user()->canEditMutations()) {
            abort(response()->json([
                'message' => 'Anda tidak memiliki izin edit mutasi. Hubungi superadmin.',
            ], 403));
        }
    }

    public function index(Request $request)
    {
        if (!$this->isLedgerReady()) {
            return response()->json([
                'data' => ['data' => []],
                'summary' => [
                    'income' => 0,
                    'expense' => 0,
                    'net' => 0,
                ],
            ]);
        }

        $baseQuery = FinancialTransaction::query();
        $perPage = max(10, min($request->integer('per_page', 50), 100));

        if ($request->filled('type')) {
            $baseQuery->where('type', $request->string('type'));
        }

        if ($request->filled('source')) {
            $baseQuery->where('source', $request->string('source'));
        }

        if ($request->filled('start_date')) {
            $baseQuery->whereDate('transaction_date', '>=', $request->string('start_date'));
        }

        if ($request->filled('end_date')) {
            $baseQuery->whereDate('transaction_date', '<=', $request->string('end_date'));
        }

        if ($request->filled('keyword')) {
            $keyword = trim((string) $request->string('keyword'));

            $baseQuery->where(function ($query) use ($keyword) {
                $query->where('source', 'like', "%{$keyword}%")
                    ->orWhere('description', 'like', "%{$keyword}%")
                    ->orWhere('type', 'like', "%{$keyword}%")
                    ->orWhereHas('creator', function ($creatorQuery) use ($keyword) {
                        $creatorQuery->where('name', 'like', "%{$keyword}%");
                    });
            });
        }

        $summaryRow = (clone $baseQuery)
            ->selectRaw("\n                COALESCE(SUM(CASE WHEN type = 'income' OR (type = 'adjustment' AND amount > 0) THEN ABS(amount) ELSE 0 END), 0) AS income,\n                COALESCE(SUM(CASE WHEN type = 'expense' OR (type = 'adjustment' AND amount < 0) THEN ABS(amount) ELSE 0 END), 0) AS expense\n            ")
            ->first();

        $summaryIncome = (float) ($summaryRow->income ?? 0);
        $summaryExpense = (float) ($summaryRow->expense ?? 0);

        $transactions = (clone $baseQuery)
            ->with(['creator:id,name', 'updater:id,name'])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => $transactions,
            'summary' => [
                'income' => $summaryIncome,
                'expense' => $summaryExpense,
                'net' => $summaryIncome - $summaryExpense,
            ],
        ]);
    }

    public function storeManualIncome(Request $request)
    {
        if (!$this->isLedgerReady()) {
            return response()->json(['message' => 'Tabel financial_transactions belum tersedia. Jalankan migrasi terlebih dahulu.'], 503);
        }

        $this->ensureCanEditMutations();

        $validated = $request->validate([
            'source' => 'required|in:pembayaran,pemasangan,manual',
            'category' => 'nullable|string|max:50',
            'description' => 'required|string|max:255',
            'amount' => 'required|numeric|min:1',
            'transaction_date' => 'required|date',
        ]);

        $sourceMap = [
            'pembayaran' => 'manual_payment_income',
            'pemasangan' => 'installation_income',
            'manual' => 'manual_income',
        ];

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => $sourceMap[$validated['source']],
            'category' => $validated['category'] ?? $validated['source'],
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'transaction_date' => $validated['transaction_date'],
            'created_by' => auth()->id(),
            'updated_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => 'Pemasukan berhasil ditambahkan.',
            'data' => $transaction,
        ], 201);
    }

    public function adjustBalance(Request $request)
    {
        if (!$this->isLedgerReady()) {
            return response()->json(['message' => 'Tabel financial_transactions belum tersedia. Jalankan migrasi terlebih dahulu.'], 503);
        }

        $this->ensureCanEditMutations();

        $validated = $request->validate([
            'description' => 'required|string|max:255',
            'amount' => 'required|numeric|not_in:0',
            'transaction_date' => 'required|date',
        ]);

        $transaction = FinancialTransaction::create([
            'type' => 'adjustment',
            'source' => 'balance_adjustment',
            'category' => 'adjustment',
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'transaction_date' => $validated['transaction_date'],
            'created_by' => auth()->id(),
            'updated_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => 'Penyesuaian saldo berhasil disimpan.',
            'data' => $transaction,
        ], 201);
    }

    public function update(Request $request, FinancialTransaction $financialTransaction)
    {
        if (!$this->isLedgerReady()) {
            return response()->json(['message' => 'Tabel financial_transactions belum tersedia. Jalankan migrasi terlebih dahulu.'], 503);
        }

        $this->ensureCanEditMutations();

        $validated = $request->validate([
            'description' => 'required|string|max:255',
            'amount' => 'required|numeric|not_in:0',
            'transaction_date' => 'required|date',
            'category' => 'nullable|string|max:50',
        ]);

        $financialTransaction->update([
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'transaction_date' => $validated['transaction_date'],
            'category' => $validated['category'] ?? $financialTransaction->category,
            'updated_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => 'Transaksi berhasil diperbarui.',
            'data' => $financialTransaction,
        ]);
    }

    public function destroy(FinancialTransaction $financialTransaction)
    {
        if (!$this->isLedgerReady()) {
            return response()->json(['message' => 'Tabel financial_transactions belum tersedia. Jalankan migrasi terlebih dahulu.'], 503);
        }

        $this->ensureCanEditMutations();

        $financialTransaction->delete();

        return response()->json([
            'message' => 'Transaksi berhasil dihapus.',
        ]);
    }
}

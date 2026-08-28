<?php

namespace App\Http\Controllers;

use App\Models\FinancialTransaction;
use App\Models\PaymentReceiptOption;
use App\Models\User;
use App\Services\PaymentReceiverService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class FinancialTransactionController extends Controller
{
    public function __construct(private PaymentReceiverService $paymentReceiverService)
    {
    }

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

    private function paymentReceiverRule(): array
    {
        if (!Schema::hasTable('users')) {
            return ['nullable'];
        }

        return [
            'nullable',
            'integer',
            Rule::exists('users', 'id'),
        ];
    }

    private function resolvePaymentReceiver(?int $requestedUserId = null): ?User
    {
        $actor = auth()->user();
        $receiverId = $actor?->canChoosePaymentReceiver()
            ? ($requestedUserId ?: auth()->id())
            : auth()->id();

        if ($receiverId && !$this->paymentReceiverService->isAllowedReceiver($actor, $receiverId)) {
            $receiverId = auth()->id();
        }

        return $receiverId ? User::query()->find($receiverId) : null;
    }

    private function putPaymentReceiverMeta(array $meta, ?User $receiver): array
    {
        if (!$receiver) {
            unset($meta['payment_receiver_user_id'], $meta['payment_receiver_name'], $meta['payment_receiver_is_company_finance']);
            return $meta;
        }

        $meta['payment_receiver_user_id'] = $receiver->id;
        $meta['payment_receiver_name'] = $receiver->name;
        $meta['payment_receiver_is_company_finance'] = $this->paymentReceiverService->isCompanyFinanceReceiver($receiver->id);

        return $meta;
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

        if ($request->filled('status') && Schema::hasColumn('financial_transactions', 'status')) {
            $baseQuery->where('status', $request->string('status'));
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

        $summaryBaseQuery = clone $baseQuery;
        if (Schema::hasColumn('financial_transactions', 'status')) {
            $summaryBaseQuery->where('status', FinancialTransaction::STATUS_CONFIRMED);
        }

        $summaryRow = $summaryBaseQuery
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

        $rules = [
            'source' => 'required|in:pembayaran,pemasangan,manual',
            'category' => 'nullable|string|max:50',
            'description' => 'required|string|max:255',
            'amount' => 'required|numeric|min:1',
            'transaction_date' => 'required|date',
            'payment_receipt_option_id' => 'nullable',
            'payment_receiver_user_id' => $this->paymentReceiverRule(),
        ];

        if (Schema::hasTable('payment_receipt_options')) {
            $rules['payment_receipt_option_id'] = [
                'nullable',
                'integer',
                Rule::exists('payment_receipt_options', 'id')->where(fn ($query) => $query->where('is_active', true)),
            ];
        }

        $validated = $request->validate($rules);

        $sourceMap = [
            'pembayaran' => 'manual_payment_income',
            'pemasangan' => 'installation_income',
            'manual' => 'manual_income',
        ];

        $receiptOption = null;
        if (!empty($validated['payment_receipt_option_id']) && Schema::hasTable('payment_receipt_options')) {
            $receiptOption = PaymentReceiptOption::find($validated['payment_receipt_option_id']);
        }

        $meta = [];
        if ($receiptOption) {
            $meta['received_via_id'] = $receiptOption->id;
            $meta['received_via_name'] = $receiptOption->name;
        }

        $receiver = $this->resolvePaymentReceiver($validated['payment_receiver_user_id'] ?? null);
        $meta = $this->putPaymentReceiverMeta($meta, $receiver);

        $transaction = FinancialTransaction::create([
            'type' => 'income',
            'source' => $sourceMap[$validated['source']],
            'category' => $validated['category'] ?? $validated['source'],
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'transaction_date' => $validated['transaction_date'],
            'created_by' => auth()->id(),
            'updated_by' => auth()->id(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'meta' => $meta !== [] ? $meta : null,
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
            'status' => FinancialTransaction::STATUS_CONFIRMED,
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

        $rules = [
            'description' => 'required|string|max:255',
            'amount' => 'required|numeric|not_in:0',
            'transaction_date' => 'required|date',
            'category' => 'nullable|string|max:50',
            'payment_receipt_option_id' => 'nullable',
            'payment_receiver_user_id' => $this->paymentReceiverRule(),
        ];

        if (Schema::hasTable('payment_receipt_options')) {
            $rules['payment_receipt_option_id'] = [
                'nullable',
                'integer',
                Rule::exists('payment_receipt_options', 'id')->where(fn ($query) => $query->where('is_active', true)),
            ];
        }

        $validated = $request->validate($rules);

        $meta = is_array($financialTransaction->meta) ? $financialTransaction->meta : [];
        if (array_key_exists('payment_receipt_option_id', $validated)) {
            $receiptOption = null;

            if (!empty($validated['payment_receipt_option_id']) && Schema::hasTable('payment_receipt_options')) {
                $receiptOption = PaymentReceiptOption::find($validated['payment_receipt_option_id']);
            }

            if ($receiptOption) {
                $meta['received_via_id'] = $receiptOption->id;
                $meta['received_via_name'] = $receiptOption->name;
            } else {
                unset($meta['received_via_id'], $meta['received_via_name']);
            }
        }

        if (array_key_exists('payment_receiver_user_id', $validated)) {
            $receiver = $this->resolvePaymentReceiver($validated['payment_receiver_user_id'] ?? null);
            $meta = $this->putPaymentReceiverMeta($meta, $receiver);
        }

        $financialTransaction->update([
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'transaction_date' => $validated['transaction_date'],
            'category' => $validated['category'] ?? $financialTransaction->category,
            'updated_by' => auth()->id(),
            'meta' => $meta !== [] ? $meta : null,
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

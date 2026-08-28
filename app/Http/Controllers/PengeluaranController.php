<?php

namespace App\Http\Controllers;

use App\Models\ExpenseCategory;
use App\Models\Borrower;
use App\Models\Pengeluaran;
use App\Services\BorrowerLoanService;
use App\Services\FinancialLedgerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PengeluaranController extends Controller
{
    public function __construct(
        private FinancialLedgerService $ledgerService,
        private BorrowerLoanService $borrowerLoanService,
    )
    {
    }

    public function index()
    {
        $pengeluarans = Pengeluaran::with(['user', 'expenseCategory'])->orderByDesc('tanggal')->get();
        return view('pengeluaran.index', compact('pengeluarans'));
    }

    public function store(Request $request)
    {
        $validated = $this->validatePengeluaran($request);
        Pengeluaran::create($validated);
        return redirect()->route('pengeluaran.index')->with('success', 'Pengeluaran berhasil dicatat.');
    }

    // API Methods for React
    public function apiIndex()
    {
        $pengeluarans = Pengeluaran::with(['user', 'expenseCategory', 'borrower:id,name'])
            ->orderByDesc('tanggal')
            ->get();
        return response()->json(['data' => $pengeluarans]);
    }

    public function apiStore(Request $request)
    {
        $validated = $this->validatePengeluaran($request);

        $pengeluaran = DB::transaction(function () use ($validated) {
            $pengeluaran = Pengeluaran::create($validated);
            $this->applyBorrowerSettlementIfNeeded($pengeluaran);
            $this->ledgerService->syncPengeluaran($pengeluaran->fresh(), Auth::id());

            return $pengeluaran->fresh();
        });

        $pengeluaran->load(['user', 'expenseCategory', 'borrower:id,name']);
        
        return response()->json(['data' => $pengeluaran, 'message' => 'Pengeluaran berhasil dicatat'], 201);
    }

    public function apiUpdate(Request $request, Pengeluaran $pengeluaran)
    {
        $validated = $this->validatePengeluaran($request);

        DB::transaction(function () use ($pengeluaran, $validated) {
            $this->reverseBorrowerSettlementIfNeeded($pengeluaran);
            $pengeluaran->update($validated);
            $this->applyBorrowerSettlementIfNeeded($pengeluaran->fresh());
            $this->ledgerService->syncPengeluaran($pengeluaran->fresh(), Auth::id());
        });

        $pengeluaran->load(['user', 'expenseCategory', 'borrower:id,name']);
        
        return response()->json(['data' => $pengeluaran, 'message' => 'Pengeluaran berhasil diupdate']);
    }

    public function apiDestroy(Pengeluaran $pengeluaran)
    {
        DB::transaction(function () use ($pengeluaran) {
            $this->reverseBorrowerSettlementIfNeeded($pengeluaran);
            $this->ledgerService->removePengeluaran($pengeluaran);
            $pengeluaran->delete();
        });

        return response()->json(['message' => 'Pengeluaran berhasil dihapus']);
    }

    private function validatePengeluaran(Request $request): array
    {
        $validated = $request->validate([
            'tanggal' => 'required|date',
            'jumlah' => ['required', 'regex:/^[0-9,]+$/'],
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'detail' => 'nullable|string',
            'payment_source' => ['nullable', Rule::in(['company_cash', 'borrower_loan_repayment'])],
            'borrower_id' => ['nullable', 'integer', 'exists:borrowers,id'],
        ]);

        $category = ExpenseCategory::query()->findOrFail($validated['expense_category_id']);
        if (!$category->is_active) {
            abort(response()->json([
                'message' => 'Jenis pengeluaran yang dipilih sudah nonaktif.',
                'errors' => [
                    'expense_category_id' => ['Jenis pengeluaran yang dipilih sudah nonaktif.'],
                ],
            ], 422));
        }

        $validated['jumlah'] = (int) str_replace(',', '', $validated['jumlah']);
        $validated['kategori'] = $category->name;
        $validated['user_id'] = Auth::id();
        $validated['payment_source'] = $validated['payment_source'] ?? 'company_cash';

        if ($validated['payment_source'] === 'borrower_loan_repayment') {
            if (!Auth::user()?->isSuperAdmin()) {
                throw ValidationException::withMessages([
                    'payment_source' => ['Hanya superadmin yang dapat memakai mode potong pinjaman borrower.'],
                ]);
            }

            if (empty($validated['borrower_id'])) {
                throw ValidationException::withMessages([
                    'borrower_id' => ['Pilih borrower yang akan dipotong pinjamannya.'],
                ]);
            }

            $borrower = Borrower::query()
                ->where('is_active', true)
                ->findOrFail((int) $validated['borrower_id']);

            $outstanding = $this->borrowerLoanService->outstandingForBorrower($borrower);
            if ($validated['jumlah'] > $outstanding) {
                throw ValidationException::withMessages([
                    'jumlah' => ['Nominal pengeluaran melebihi sisa pinjaman borrower.'],
                ]);
            }

            $validated['borrower_loan_settlement_amount'] = $validated['jumlah'];
            return $validated;
        }

        $validated['borrower_id'] = null;
        $validated['borrower_loan_settlement_amount'] = 0;
        $validated['borrower_loan_settlement_action_group_key'] = null;

        return $validated;
    }

    private function applyBorrowerSettlementIfNeeded(Pengeluaran $pengeluaran): void
    {
        if (($pengeluaran->payment_source ?? 'company_cash') !== 'borrower_loan_repayment') {
            return;
        }

        $borrower = Borrower::query()
            ->where('is_active', true)
            ->findOrFail((int) $pengeluaran->borrower_id);

        $result = $this->borrowerLoanService->settleBorrowerTotal(
            $borrower,
            (int) $pengeluaran->jumlah,
            $pengeluaran->tanggal?->format('Y-m-d') ?: now()->toDateString(),
            Auth::user(),
            'Pengurangan pinjaman dari pengeluaran #' . $pengeluaran->id
        );

        $pengeluaran->forceFill([
            'borrower_loan_settlement_amount' => (int) $pengeluaran->jumlah,
            'borrower_loan_settlement_action_group_key' => $result['action_group_key'] ?? null,
        ])->save();
    }

    private function reverseBorrowerSettlementIfNeeded(Pengeluaran $pengeluaran): void
    {
        $actionGroupKey = (string) ($pengeluaran->borrower_loan_settlement_action_group_key ?? '');
        if ($actionGroupKey === '') {
            return;
        }

        $this->borrowerLoanService->reverseSettlementActionGroup($actionGroupKey);
        $pengeluaran->forceFill([
            'borrower_loan_settlement_amount' => 0,
            'borrower_loan_settlement_action_group_key' => null,
        ])->save();
    }
}

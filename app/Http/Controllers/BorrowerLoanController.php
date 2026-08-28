<?php

namespace App\Http\Controllers;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\BorrowerLoanPayment;
use App\Models\Customer;
use App\Models\Pengeluaran;
use App\Services\BorrowerLoanService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class BorrowerLoanController extends Controller
{
    public function __construct(private BorrowerLoanService $borrowerLoanService)
    {
    }

    private function ensureReady(): void
    {
        abort_unless(Schema::hasTable('borrower_loans'), 503, 'Fitur hutang belum siap. Jalankan migrasi terlebih dahulu.');
    }

    public function index(Request $request)
    {
        $this->ensureReady();

        $query = BorrowerLoan::query()
            ->with([
                'borrower:id,name,mapped_user_id',
                'borrower.mappedUser:id,name,email,role',
                'invoice:id,invoice_link,customer_id',
                'invoice.customer:id,name',
                'confirmedBy:id,name',
                'targetReceiver:id,name',
                'actualReceiver:id,name',
                'payments:id,borrower_loan_id,amount,payment_date,action_group_key,received_by_user_id,financial_transaction_id,pengeluaran_id,notes,created_at',
                'payments.receivedBy:id,name',
                'payments.pengeluaran:id,tanggal,jumlah,kategori,detail,user_id,expense_category_id',
                'payments.pengeluaran.expenseCategory:id,name',
            ])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('borrower_id')) {
            $query->where('borrower_id', $request->integer('borrower_id'));
        }

        $rows = $query->get()->map(function (BorrowerLoan $loan) {
            $outstandingAmount = max(0, (int) $loan->amount - (int) $loan->settled_amount);
            $customerMeta = $this->resolveLoanCustomerContext($loan);
            $loanActor = $this->resolveLoanActor($loan);

            return [
                ...$loan->toArray(),
                'outstanding_amount' => $outstandingAmount,
                'customer_name' => $customerMeta['customer_name'],
                'customer_id' => $customerMeta['customer_id'],
                'customer_source' => $customerMeta['customer_source'],
                'actor_name' => $loanActor['name'],
                'actor_user_id' => $loanActor['user_id'],
                'payments' => collect($loan->payments)->map(fn (BorrowerLoanPayment $payment) => [
                    ...$payment->toArray(),
                    'history_type' => 'settlement',
                    'event_date' => $payment->payment_date,
                    'customer_name' => $customerMeta['customer_name'],
                    'customer_id' => $customerMeta['customer_id'],
                    'customer_source' => $customerMeta['customer_source'],
                    'actor_name' => $payment->receivedBy?->name ?: 'Sistem',
                    'actor_user_id' => $payment->received_by_user_id ? (int) $payment->received_by_user_id : null,
                    'linked_pengeluaran' => $payment->pengeluaran ? $this->formatSettlementExpenseOption($payment->pengeluaran) : null,
                ])->values()->all(),
            ];
        })->values();

        $borrowersSummary = $rows
            ->groupBy('borrower_id')
            ->map(function (Collection $loans, $borrowerId) {
                $first = $loans->first();
                $outstandingLoans = $loans
                    ->filter(fn (array $loan) => (int) ($loan['outstanding_amount'] ?? 0) > 0)
                    ->values()
                    ->map(fn (array $loan) => [
                        'id' => $loan['id'],
                        'invoice' => $loan['invoice'] ?? null,
                        'status' => $loan['status'],
                        'source' => $loan['source'] ?? null,
                        'occurred_at' => $loan['occurred_at'] ?? null,
                        'notes' => $loan['notes'] ?? null,
                        'amount' => (int) ($loan['amount'] ?? 0),
                        'settled_amount' => (int) ($loan['settled_amount'] ?? 0),
                        'outstanding_amount' => (int) ($loan['outstanding_amount'] ?? 0),
                    ])
                    ->all();

                return [
                    'borrower_id' => (int) $borrowerId,
                    'borrower' => $first['borrower'] ?? null,
                    'mapped_user' => $first['borrower']['mapped_user'] ?? null,
                    'total_outstanding' => $loans->sum(fn (array $loan) => (int) ($loan['outstanding_amount'] ?? 0)),
                    'outstanding_loans_count' => count($outstandingLoans),
                    'outstanding_loans' => $outstandingLoans,
                ];
            })
            ->sortBy(fn (array $summary) => strtolower((string) ($summary['borrower']['name'] ?? '')))
            ->values()
            ->all();

        $loanHistory = $rows->map(function (array $loan) {
            return [
                'id' => 'loan-' . $loan['id'],
                'history_type' => 'loan',
                'event_date' => $loan['occurred_at'],
                'borrower' => $loan['borrower'] ?? null,
                'source' => $loan['source'] ?? null,
                'amount' => (int) ($loan['amount'] ?? 0),
                'outstanding_amount' => (int) ($loan['outstanding_amount'] ?? 0),
                'loan_id' => $loan['id'],
                'customer_name' => $loan['customer_name'] ?? null,
                'customer_id' => $loan['customer_id'] ?? null,
                'customer_source' => $loan['customer_source'] ?? null,
                'notes' => $loan['notes'] ?? null,
                'display_notes' => $this->formatHistoryNotes($loan['notes'] ?? null, $loan['customer_name'] ?? null),
                'actor_name' => $loan['actor_name'] ?? 'Sistem',
                'actor_user_id' => $loan['actor_user_id'] ?? null,
            ];
        });

        $settlementHistory = $rows
            ->flatMap(function (array $loan) {
                return collect($loan['payments'] ?? [])->map(function (array $payment) use ($loan) {
                    return [
                        'id' => 'payment-' . $payment['id'],
                        'history_type' => 'settlement',
                        'event_date' => $payment['payment_date'] ?? null,
                        'borrower' => $loan['borrower'] ?? null,
                        'source' => $loan['source'] ?? null,
                        'amount' => (int) ($payment['amount'] ?? 0),
                        'loan_id' => $loan['id'],
                        'customer_name' => $payment['customer_name'] ?? ($loan['customer_name'] ?? null),
                        'customer_id' => $payment['customer_id'] ?? ($loan['customer_id'] ?? null),
                        'customer_source' => $payment['customer_source'] ?? ($loan['customer_source'] ?? null),
                        'notes' => $payment['notes'] ?? null,
                        'payment_id' => $payment['id'],
                        'action_group_key' => $payment['action_group_key'] ?? null,
                        'actor_name' => $payment['actor_name'] ?? 'Sistem',
                        'actor_user_id' => $payment['actor_user_id'] ?? null,
                        'linked_pengeluaran' => $payment['linked_pengeluaran'] ?? null,
                        'created_at' => $payment['created_at'] ?? null,
                    ];
                });
            })
            ->groupBy(fn (array $payment) => $payment['action_group_key'] ?: $this->fallbackSettlementHistoryKey($payment))
            ->map(function (Collection $group, string $groupKey) {
                $first = $group->sortBy('payment_id')->first();
                $customerNames = $group
                    ->pluck('customer_name')
                    ->filter(fn ($name) => trim((string) $name) !== '')
                    ->unique()
                    ->values()
                    ->all();

                return [
                    'id' => 'settlement-group-' . $groupKey,
                    'history_type' => 'settlement',
                    'event_date' => $first['event_date'] ?? null,
                    'borrower' => $first['borrower'] ?? null,
                    'source' => $this->resolveGroupedSourceLabel($group),
                    'amount' => (int) $group->sum('amount'),
                    'notes' => $first['notes'] ?? null,
                    'display_notes' => $this->formatSettlementHistoryNotes($first['notes'] ?? null),
                    'actor_name' => $first['actor_name'] ?? 'Sistem',
                    'actor_user_id' => $first['actor_user_id'] ?? null,
                    'affected_items_count' => $group->count(),
                    'affected_customers' => $customerNames,
                    'action_group_key' => $first['action_group_key'] ?? null,
                    'linked_pengeluaran' => $first['linked_pengeluaran'] ?? null,
                ];
            });

        $history = $loanHistory
            ->concat($settlementHistory)
            ->sortByDesc(function (array $row) {
                return sprintf('%s-%s', (string) ($row['event_date'] ?? ''), (string) $row['id']);
            })
            ->values()
            ->all();

        return response()->json([
            'data' => $rows,
            'borrowers_summary' => $borrowersSummary,
            'history' => $history,
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'borrower_id' => 'required|integer|exists:borrowers,id',
            'amount' => 'required|integer|min:1',
            'occurred_at' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        $borrower = Borrower::query()->findOrFail($validated['borrower_id']);
        $loan = $this->borrowerLoanService->createManualLoan(
            $borrower,
            (int) $validated['amount'],
            $validated['occurred_at'],
            $request->user(),
            $validated['notes'] ?? null,
        );

        return response()->json([
            'message' => 'Pinjaman manual berhasil ditambahkan.',
            'data' => $loan->load('borrower:id,name,mapped_user_id'),
        ], 201);
    }

    public function settle(Request $request, BorrowerLoan $borrowerLoan)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'amount' => 'nullable|required_without:pengeluaran_id|integer|min:1',
            'payment_date' => 'nullable|required_without:pengeluaran_id|date',
            'notes' => 'nullable|string',
            'pengeluaran_id' => 'nullable|integer|exists:pengeluarans,id',
        ]);
        $linkedPengeluaran = $this->resolveSettlementPengeluaran($borrowerLoan->borrower, $validated['pengeluaran_id'] ?? null);
        $settlementPayload = $this->resolveSettlementPayload($validated, $linkedPengeluaran);

        try {
            $loan = $this->borrowerLoanService->settleLoan(
                $borrowerLoan,
                $settlementPayload['amount'],
                $settlementPayload['payment_date'],
                $request->user(),
                $settlementPayload['notes'],
                $linkedPengeluaran?->id,
            );
        } catch (RuntimeException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => 'Pelunasan hutang berhasil dicatat.',
            'data' => $loan,
        ]);
    }

    public function settleBorrower(Request $request, Borrower $borrower)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'amount' => 'nullable|required_without:pengeluaran_id|integer|min:1',
            'payment_date' => 'nullable|required_without:pengeluaran_id|date',
            'notes' => 'nullable|string',
            'pengeluaran_id' => 'nullable|integer|exists:pengeluarans,id',
        ]);
        $linkedPengeluaran = $this->resolveSettlementPengeluaran($borrower, $validated['pengeluaran_id'] ?? null);
        $settlementPayload = $this->resolveSettlementPayload($validated, $linkedPengeluaran);

        try {
            $result = $this->borrowerLoanService->settleBorrowerTotal(
                $borrower,
                $settlementPayload['amount'],
                $settlementPayload['payment_date'],
                $request->user(),
                $settlementPayload['notes'],
                null,
                $linkedPengeluaran?->id,
            );
        } catch (RuntimeException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }

        $message = count($result['allocations'] ?? []) > 1
            ? 'Pelunasan total berhasil dicatat dan dialokasikan otomatis ke beberapa hutang.'
            : 'Pelunasan total berhasil dicatat.';

        return response()->json([
            'message' => $message,
            'data' => $result,
        ]);
    }

    public function settlementExpenseOptions(Request $request, Borrower $borrower)
    {
        $this->ensureReady();

        abort_unless(Schema::hasTable('pengeluarans'), 503, 'Data pengeluaran belum siap.');

        $window = $request->query('window', '7');
        if (!in_array($window, ['7', '30', '90', 'all'], true)) {
            $window = '7';
        }

        if (!$borrower->mapped_user_id) {
            return response()->json([
                'data' => [],
                'window' => $window,
                'mapped_user' => null,
                'message' => 'Peminjam belum terhubung ke akun sistem.',
            ]);
        }

        $query = Pengeluaran::query()
            ->with('expenseCategory:id,name')
            ->where('user_id', $borrower->mapped_user_id)
            ->orderByDesc('tanggal')
            ->orderByDesc('id');

        if ($window !== 'all') {
            $query->whereDate('tanggal', '>=', now()->subDays((int) $window)->toDateString());
        }

        $rows = $query
            ->limit($window === 'all' ? 200 : 100)
            ->get()
            ->map(fn (Pengeluaran $pengeluaran) => $this->formatSettlementExpenseOption($pengeluaran))
            ->values();

        return response()->json([
            'data' => $rows,
            'window' => $window,
            'mapped_user' => $borrower->mappedUser?->only(['id', 'name', 'email', 'role']),
        ]);
    }

    public function borrowerLoans(Borrower $borrower)
    {
        $this->ensureReady();

        $rows = $borrower->loans()
            ->with(['invoice:id,invoice_link,customer_id', 'confirmedBy:id,name'])
            ->orderByDesc('occurred_at')
            ->get()
            ->map(fn (BorrowerLoan $loan) => [
                ...$loan->toArray(),
                'outstanding_amount' => max(0, (int) $loan->amount - (int) $loan->settled_amount),
            ]);

        return response()->json(['data' => $rows]);
    }

    public function updateLoan(Request $request, BorrowerLoan $borrowerLoan)
    {
        $this->ensureReady();
        $this->ensureSuperAdmin($request);

        $validated = $request->validate([
            'amount' => 'required|integer|min:1',
            'occurred_at' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        try {
            $loan = $this->borrowerLoanService->updateManualLoan(
                $borrowerLoan,
                (int) $validated['amount'],
                $validated['occurred_at'],
                $validated['notes'] ?? null,
            );
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Histori pinjaman berhasil diperbarui.',
            'data' => $loan,
        ]);
    }

    public function destroyLoan(Request $request, BorrowerLoan $borrowerLoan)
    {
        $this->ensureReady();
        $this->ensureSuperAdmin($request);

        $this->borrowerLoanService->deleteLoan($borrowerLoan);

        return response()->json([
            'message' => 'Histori pinjaman berhasil dihapus.',
        ]);
    }

    public function updateSettlementGroup(Request $request, string $actionGroupKey)
    {
        $this->ensureReady();
        $this->ensureSuperAdmin($request);

        $validated = $request->validate([
            'amount' => 'required|integer|min:1',
            'payment_date' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        try {
            $result = $this->borrowerLoanService->replaceSettlementActionGroup(
                $actionGroupKey,
                (int) $validated['amount'],
                $validated['payment_date'],
                $request->user(),
                $validated['notes'] ?? null,
            );
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Histori pelunasan berhasil diperbarui.',
            'data' => $result,
        ]);
    }

    public function destroySettlementGroup(Request $request, string $actionGroupKey)
    {
        $this->ensureReady();
        $this->ensureSuperAdmin($request);

        $reversedTotal = $this->borrowerLoanService->reverseSettlementActionGroup($actionGroupKey);

        return response()->json([
            'message' => 'Histori pelunasan berhasil dihapus.',
            'data' => ['reversed_total' => $reversedTotal],
        ]);
    }

    private function ensureSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'Hanya superadmin yang dapat edit/hapus histori pinjaman.');
    }

    private function resolveLoanCustomerContext(BorrowerLoan $loan): array
    {
        $invoiceCustomer = $loan->invoice?->customer;
        if ($invoiceCustomer) {
            return [
                'customer_name' => $invoiceCustomer->name,
                'customer_id' => $invoiceCustomer->id,
                'customer_source' => 'invoice',
            ];
        }

        $meta = is_array($loan->meta) ? $loan->meta : [];
        $customerName = trim((string) ($meta['customer_name'] ?? ''));
        $customerId = isset($meta['customer_id']) ? (int) $meta['customer_id'] : null;

        if ($customerName !== '') {
            return [
                'customer_name' => $customerName,
                'customer_id' => $customerId,
                'customer_source' => 'meta',
            ];
        }

        if ($customerId) {
            $customer = Customer::query()->find($customerId);
            if ($customer) {
                return [
                    'customer_name' => $customer->name,
                    'customer_id' => $customer->id,
                    'customer_source' => 'meta',
                ];
            }
        }

        return [
            'customer_name' => null,
            'customer_id' => null,
            'customer_source' => null,
        ];
    }

    private function formatHistoryNotes(?string $notes, ?string $customerName): string
    {
        $normalizedNotes = trim((string) $notes);
        $normalizedCustomerName = trim((string) $customerName);

        if ($normalizedNotes !== '' && $normalizedCustomerName !== '') {
            return "{$normalizedNotes} | Pelanggan: {$normalizedCustomerName}";
        }

        if ($normalizedCustomerName !== '') {
            return "Pelanggan: {$normalizedCustomerName}";
        }

        return $normalizedNotes !== '' ? $normalizedNotes : '-';
    }

    private function formatSettlementHistoryNotes(?string $notes): string
    {
        $normalizedNotes = trim((string) $notes);

        return $normalizedNotes !== '' ? $normalizedNotes : '-';
    }

    private function formatGroupedHistoryNotes(?string $notes, array $customerNames): string
    {
        $normalizedNotes = trim((string) $notes);
        $customers = collect($customerNames)
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->values();

        $customerPart = '';
        if ($customers->count() === 1) {
            $customerPart = 'Pelanggan: ' . $customers->first();
        } elseif ($customers->count() > 1) {
            $preview = $customers->take(2)->implode(', ');
            $remaining = $customers->count() - 2;
            $customerPart = $remaining > 0
                ? "Pelanggan: {$preview} (+{$remaining} lain)"
                : "Pelanggan: {$preview}";
        }

        if ($normalizedNotes !== '' && $customerPart !== '') {
            return "{$normalizedNotes} | {$customerPart}";
        }

        if ($customerPart !== '') {
            return $customerPart;
        }

        return $normalizedNotes !== '' ? $normalizedNotes : '-';
    }

    private function fallbackSettlementHistoryKey(array $payment): string
    {
        $borrowerId = (int) data_get($payment, 'borrower.id', 0);
        $paymentDate = (string) ($payment['event_date'] ?? '');
        $actorId = (string) ($payment['actor_user_id'] ?? 'system');
        $notes = trim((string) ($payment['notes'] ?? ''));
        $createdAt = substr((string) ($payment['created_at'] ?? ''), 0, 16);

        return implode('|', [$borrowerId, $paymentDate, $actorId, $notes, $createdAt]);
    }

    private function resolveLoanActor(BorrowerLoan $loan): array
    {
        if ($loan->confirmedBy) {
            return [
                'name' => $loan->confirmedBy->name ?: 'Sistem',
                'user_id' => $loan->confirmedBy->id,
            ];
        }

        if ($loan->actualReceiver) {
            return [
                'name' => $loan->actualReceiver->name ?: 'Sistem',
                'user_id' => $loan->actualReceiver->id,
            ];
        }

        if ($loan->targetReceiver) {
            return [
                'name' => $loan->targetReceiver->name ?: 'Sistem',
                'user_id' => $loan->targetReceiver->id,
            ];
        }

        return [
            'name' => 'Sistem',
            'user_id' => null,
        ];
    }

    private function resolveGroupedSourceLabel(Collection $group): ?string
    {
        $sources = $group->pluck('source')->filter()->unique()->values();

        if ($sources->count() === 1) {
            return (string) $sources->first();
        }

        return $sources->isNotEmpty() ? 'multiple_sources' : null;
    }

    private function resolveSettlementPengeluaran(?Borrower $borrower, mixed $pengeluaranId): ?Pengeluaran
    {
        if (!$pengeluaranId) {
            return null;
        }

        if (!$borrower?->mapped_user_id) {
            throw ValidationException::withMessages([
                'pengeluaran_id' => ['Peminjam belum terhubung ke akun sistem.'],
            ]);
        }

        $pengeluaran = Pengeluaran::query()
            ->with('expenseCategory:id,name')
            ->whereKey((int) $pengeluaranId)
            ->where('user_id', $borrower->mapped_user_id)
            ->first();

        if (!$pengeluaran) {
            throw ValidationException::withMessages([
                'pengeluaran_id' => ['Pengeluaran tidak ditemukan atau bukan dibuat oleh akun peminjam yang terhubung.'],
            ]);
        }

        return $pengeluaran;
    }

    private function resolveSettlementPayload(array $validated, ?Pengeluaran $pengeluaran): array
    {
        $notes = trim((string) ($validated['notes'] ?? ''));

        return [
            'amount' => isset($validated['amount']) && (int) $validated['amount'] > 0
                ? (int) $validated['amount']
                : (int) ($pengeluaran?->jumlah ?? 0),
            'payment_date' => $validated['payment_date'] ?? $pengeluaran?->tanggal?->toDateString(),
            'notes' => $notes !== '' ? $notes : ($pengeluaran ? $this->defaultSettlementNotesFromPengeluaran($pengeluaran) : null),
        ];
    }

    private function defaultSettlementNotesFromPengeluaran(Pengeluaran $pengeluaran): string
    {
        $detail = trim((string) $pengeluaran->detail);
        if ($detail !== '') {
            return $detail;
        }

        $category = trim((string) ($pengeluaran->expenseCategory?->name ?: $pengeluaran->kategori));

        return $category !== '' ? $category : 'Pelunasan dari pengeluaran #' . $pengeluaran->id;
    }

    private function formatSettlementExpenseOption(Pengeluaran $pengeluaran): array
    {
        $category = $pengeluaran->expenseCategory?->name ?: $pengeluaran->kategori;
        $detail = trim((string) $pengeluaran->detail);

        return [
            'id' => $pengeluaran->id,
            'tanggal' => $pengeluaran->tanggal?->toDateString(),
            'jumlah' => (int) $pengeluaran->jumlah,
            'kategori' => $category,
            'detail' => $detail,
            'label' => trim(implode(' - ', array_filter([
                $pengeluaran->tanggal?->format('d/m/Y'),
                'Rp ' . number_format((int) $pengeluaran->jumlah, 0, ',', '.'),
                $category,
                $detail,
            ]))),
        ];
    }
}

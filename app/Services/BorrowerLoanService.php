<?php

namespace App\Services;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\BorrowerLoanPayment;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\PaymentReceiverApprovalRequest;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class BorrowerLoanService
{
    public function borrowerForUser(?User $user): ?Borrower
    {
        if (!$user || !Schema::hasTable('borrowers')) {
            return null;
        }

        return Borrower::query()
            ->where('mapped_user_id', $user->id)
            ->where('is_active', true)
            ->first();
    }

    public function getOrCreateBorrowerForUser(User $user): Borrower
    {
        $borrower = $this->borrowerForUser($user);

        if ($borrower) {
            return $borrower;
        }

        if (!Schema::hasTable('borrowers')) {
            throw new RuntimeException('Fitur peminjam belum siap. Jalankan migrasi terlebih dahulu.');
        }

        return Borrower::query()->create([
            'name' => $user->name ?: ('Peminjam User #' . $user->id),
            'phone' => null,
            'notes' => 'Dibuat otomatis dari flow konfirmasi pembayaran.',
            'mapped_user_id' => $user->id,
            'is_active' => true,
        ]);
    }

    public function requireBorrowerForUser(?User $user): Borrower
    {
        $borrower = $this->borrowerForUser($user);

        if (!$borrower) {
            throw new RuntimeException('Akun Anda belum dipetakan ke data peminjam. Hubungi admin untuk melengkapi konfigurasi.');
        }

        return $borrower;
    }

    public function createDirectDebt(
        Borrower $borrower,
        Invoice $invoice,
        ?User $confirmedBy,
        ?User $targetReceiver,
        ?User $actualReceiver,
        string $notes = 'Pembayaran dikonfirmasi ke akun penerima yang tidak sesuai mapping.'
    ): BorrowerLoan {
        return BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'invoice_id' => $invoice->id,
            'confirmed_by_user_id' => $confirmedBy?->id,
            'target_receiver_user_id' => $targetReceiver?->id,
            'actual_receiver_user_id' => $actualReceiver?->id,
            'amount' => (int) round((float) $invoice->amount),
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'payment_receiver_mismatch',
            'occurred_at' => now(),
            'notes' => $notes,
            'meta' => [
                'invoice_link' => $invoice->invoice_link,
                'customer_id' => $invoice->customer_id,
            ],
        ]);
    }

    public function createApprovalRequest(
        Borrower $borrower,
        ?Invoice $invoice,
        User $requestedBy,
        User $receiver,
        FinancialTransaction $financialTransaction,
        array $context = []
    ): PaymentReceiverApprovalRequest {
        $customer = $context['customer'] ?? null;
        $sourceType = $context['source_type'] ?? ($invoice ? 'invoice_payment' : null);
        $sourceId = $context['source_id'] ?? ($invoice?->id);
        $meta = array_merge([
            'invoice_link' => $invoice?->invoice_link,
            'customer_id' => $invoice?->customer_id ?? $customer?->id,
        ], (array) ($context['meta'] ?? []));

        $duplicateQuery = PaymentReceiverApprovalRequest::query()
            ->where('status', PaymentReceiverApprovalRequest::STATUS_PENDING);

        if ($invoice) {
            $duplicateQuery->where('invoice_id', $invoice->id);
        } elseif ($sourceType && $sourceId) {
            $duplicateQuery
                ->where('source_type', $sourceType)
                ->where('source_id', $sourceId);
        }

        $duplicateQuery->delete();

        return PaymentReceiverApprovalRequest::query()->create([
            'invoice_id' => $invoice?->id,
            'customer_id' => $invoice?->customer_id ?? $customer?->id,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'financial_transaction_id' => $financialTransaction->id,
            'requested_by_user_id' => $requestedBy->id,
            'receiver_user_id' => $receiver->id,
            'borrower_id' => $borrower->id,
            'amount' => (int) round((float) ($invoice?->amount ?? $financialTransaction->amount)),
            'status' => PaymentReceiverApprovalRequest::STATUS_PENDING,
            'meta' => $meta,
        ]);
    }

    public function approveReceiverRequest(PaymentReceiverApprovalRequest $request, User $actor, ?string $note = null): PaymentReceiverApprovalRequest
    {
        if ($request->receiver_user_id !== $actor->id) {
            throw new RuntimeException('Anda tidak berhak memutuskan approval ini.');
        }

        DB::transaction(function () use ($request, $note) {
            $request->status = PaymentReceiverApprovalRequest::STATUS_APPROVED;
            $request->decision_at = now();
            $request->decision_note = $note;
            $request->save();

            $transaction = $request->financialTransaction;
            if ($transaction) {
                $transaction->status = FinancialTransaction::STATUS_CONFIRMED;
                $transaction->save();
            }
        });

        return $request->fresh(['financialTransaction']);
    }

    public function rejectReceiverRequest(PaymentReceiverApprovalRequest $request, User $actor, ?string $note = null): BorrowerLoan
    {
        if ($request->receiver_user_id !== $actor->id) {
            throw new RuntimeException('Anda tidak berhak memutuskan approval ini.');
        }

        return DB::transaction(function () use ($request, $actor, $note) {
            $request->status = PaymentReceiverApprovalRequest::STATUS_REJECTED;
            $request->decision_at = now();
            $request->decision_note = $note;
            $request->save();

            $transaction = $request->financialTransaction;
            if ($transaction) {
                $transaction->status = FinancialTransaction::STATUS_REJECTED;
                $transaction->save();
            }

            $loanSource = $request->source_type === 'installation_income'
                ? 'installation_fee_receiver_rejected'
                : 'payment_receiver_rejected';
            $loanNotes = $note ?: ($request->source_type === 'installation_income'
                ? 'Akun penerima menolak biaya pemasangan ini.'
                : 'Akun penerima menolak menerima pembayaran ini.');

            return BorrowerLoan::query()->create([
                'borrower_id' => $request->borrower_id,
                'invoice_id' => $request->invoice_id,
                'confirmed_by_user_id' => $request->requested_by_user_id,
                'target_receiver_user_id' => $request->receiver_user_id,
                'actual_receiver_user_id' => $request->receiver_user_id,
                'amount' => $request->amount,
                'settled_amount' => 0,
                'status' => BorrowerLoan::STATUS_REJECTED_BY_RECEIVER,
                'source' => $loanSource,
                'occurred_at' => now(),
                'notes' => $loanNotes,
                'meta' => array_merge((array) $request->meta, [
                    'approval_request_id' => $request->id,
                    'rejected_by_user_id' => $actor->id,
                ]),
            ]);
        });
    }

    public function createInstallationFeeDebt(
        Borrower $borrower,
        Customer $customer,
        int $amount,
        ?User $confirmedBy,
        ?User $targetReceiver,
        ?User $actualReceiver,
        string $notes = 'Biaya pemasangan diarahkan ke hutang akun pengkonfirmasi.'
    ): BorrowerLoan {
        return BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'invoice_id' => null,
            'confirmed_by_user_id' => $confirmedBy?->id,
            'target_receiver_user_id' => $targetReceiver?->id,
            'actual_receiver_user_id' => $actualReceiver?->id,
            'amount' => $amount,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'installation_fee_receiver_mismatch',
            'occurred_at' => now(),
            'notes' => $notes,
            'meta' => [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
            ],
        ]);
    }

    public function settleLoan(BorrowerLoan $loan, int $amount, string $paymentDate, ?User $receivedBy, ?string $notes = null, ?int $pengeluaranId = null): BorrowerLoan
    {
        if ($amount <= 0) {
            throw new RuntimeException('Nominal pelunasan harus lebih dari 0.');
        }

        $remaining = max(0, (int) $loan->amount - (int) $loan->settled_amount);
        if ($amount > $remaining) {
            throw new RuntimeException('Nominal pelunasan melebihi sisa hutang.');
        }

        return DB::transaction(function () use ($loan, $amount, $paymentDate, $receivedBy, $notes, $pengeluaranId) {
            $actionGroupKey = (string) Str::uuid();

            BorrowerLoanPayment::query()->create([
                'borrower_loan_id' => $loan->id,
                'amount' => $amount,
                'payment_date' => $paymentDate,
                'action_group_key' => $actionGroupKey,
                'received_by_user_id' => $receivedBy?->id,
                'financial_transaction_id' => null,
                'pengeluaran_id' => $pengeluaranId,
                'notes' => $notes,
            ]);

            $loan->settled_amount = (int) $loan->settled_amount + $amount;
            $loan->status = (int) $loan->settled_amount >= (int) $loan->amount
                ? BorrowerLoan::STATUS_SETTLED
                : BorrowerLoan::STATUS_OUTSTANDING;
            $loan->save();

            return $loan->fresh(['borrower', 'invoice', 'payments']);
        });
    }

    public function settleBorrowerTotal(
        Borrower $borrower,
        int $amount,
        string $paymentDate,
        ?User $receivedBy,
        ?string $notes = null,
        ?string $actionGroupKey = null,
        ?int $pengeluaranId = null
    ): array
    {
        if ($amount <= 0) {
            throw new RuntimeException('Nominal pelunasan harus lebih dari 0.');
        }

        $loans = $borrower->loans()
            ->whereIn('status', [BorrowerLoan::STATUS_OUTSTANDING, BorrowerLoan::STATUS_REJECTED_BY_RECEIVER])
            ->orderBy('occurred_at')
            ->orderBy('id')
            ->get();

        if ($loans->isEmpty()) {
            throw new RuntimeException('Peminjam ini tidak memiliki hutang outstanding.');
        }

        $totalOutstanding = (int) $loans->sum(fn (BorrowerLoan $loan) => max(0, (int) $loan->amount - (int) $loan->settled_amount));
        if ($amount > $totalOutstanding) {
            throw new RuntimeException('Nominal pelunasan melebihi total outstanding peminjam.');
        }

        return DB::transaction(function () use ($borrower, $amount, $paymentDate, $receivedBy, $notes, $loans, $totalOutstanding, $actionGroupKey, $pengeluaranId) {
            $remainingAllocation = $amount;
            $allocations = [];
            $actionGroupKey = $actionGroupKey ?: (string) Str::uuid();

            foreach ($loans as $loan) {
                if ($remainingAllocation <= 0) {
                    break;
                }

                $remainingLoan = max(0, (int) $loan->amount - (int) $loan->settled_amount);
                if ($remainingLoan <= 0) {
                    continue;
                }

                $allocatedAmount = min($remainingAllocation, $remainingLoan);

                BorrowerLoanPayment::query()->create([
                    'borrower_loan_id' => $loan->id,
                    'amount' => $allocatedAmount,
                    'payment_date' => $paymentDate,
                    'action_group_key' => $actionGroupKey,
                    'received_by_user_id' => $receivedBy?->id,
                    'financial_transaction_id' => null,
                    'pengeluaran_id' => $pengeluaranId,
                    'notes' => $notes,
                ]);

                $loan->settled_amount = (int) $loan->settled_amount + $allocatedAmount;
                $loan->status = (int) $loan->settled_amount >= (int) $loan->amount
                    ? BorrowerLoan::STATUS_SETTLED
                    : BorrowerLoan::STATUS_OUTSTANDING;
                $loan->save();

                $remainingAfterAllocation = max(0, (int) $loan->amount - (int) $loan->settled_amount);

                $allocations[] = [
                    'loan_id' => $loan->id,
                    'allocated_amount' => $allocatedAmount,
                    'remaining_after_allocation' => $remainingAfterAllocation,
                ];

                $remainingAllocation -= $allocatedAmount;
            }

            return [
                'borrower_id' => $borrower->id,
                'allocated_total' => $amount,
                'remaining_outstanding' => max(0, $totalOutstanding - $amount),
                'action_group_key' => $actionGroupKey,
                'allocations' => $allocations,
            ];
        });
    }

    public function reverseSettlementActionGroup(string $actionGroupKey): int
    {
        if ($actionGroupKey === '') {
            return 0;
        }

        return DB::transaction(function () use ($actionGroupKey) {
            $payments = BorrowerLoanPayment::query()
                ->where('action_group_key', $actionGroupKey)
                ->with('loan')
                ->get();

            $reversedTotal = 0;

            foreach ($payments as $payment) {
                $loan = $payment->loan;
                if (!$loan) {
                    $payment->delete();
                    continue;
                }

                $amount = (int) $payment->amount;
                $loan->settled_amount = max(0, (int) $loan->settled_amount - $amount);
                $loan->status = (int) $loan->settled_amount >= (int) $loan->amount
                    ? BorrowerLoan::STATUS_SETTLED
                    : BorrowerLoan::STATUS_OUTSTANDING;
                $loan->save();

                $payment->delete();
                $reversedTotal += $amount;
            }

            return $reversedTotal;
        });
    }

    public function updateManualLoan(BorrowerLoan $loan, int $amount, string $occurredAt, ?string $notes = null): BorrowerLoan
    {
        if ($amount <= 0) {
            throw new RuntimeException('Nominal pinjaman harus lebih dari 0.');
        }

        $paymentTotal = (int) $loan->payments()->sum('amount');
        if ($amount < $paymentTotal) {
            throw new RuntimeException('Nominal pinjaman tidak boleh lebih kecil dari total pelunasan yang sudah tercatat.');
        }

        return DB::transaction(function () use ($loan, $amount, $occurredAt, $notes, $paymentTotal) {
            $loan->amount = $amount;
            $loan->settled_amount = min($paymentTotal, $amount);
            $loan->status = (int) $loan->settled_amount >= (int) $loan->amount
                ? BorrowerLoan::STATUS_SETTLED
                : BorrowerLoan::STATUS_OUTSTANDING;
            $loan->occurred_at = $occurredAt;
            $loan->notes = $notes;
            $loan->save();

            return $loan->fresh(['borrower', 'payments']);
        });
    }

    public function deleteLoan(BorrowerLoan $loan): void
    {
        DB::transaction(function () use ($loan) {
            $loan->payments()->delete();
            $loan->delete();
        });
    }

    public function replaceSettlementActionGroup(
        string $actionGroupKey,
        int $amount,
        string $paymentDate,
        ?User $receivedBy,
        ?string $notes = null
    ): array {
        if ($amount <= 0) {
            throw new RuntimeException('Nominal pelunasan harus lebih dari 0.');
        }

        $payments = BorrowerLoanPayment::query()
            ->where('action_group_key', $actionGroupKey)
            ->with('loan.borrower')
            ->get();

        if ($payments->isEmpty()) {
            throw new RuntimeException('Histori pelunasan tidak ditemukan.');
        }

        $borrower = $payments->first()?->loan?->borrower;
        if (!$borrower) {
            throw new RuntimeException('Data peminjam untuk pelunasan ini tidak ditemukan.');
        }

        return DB::transaction(function () use ($actionGroupKey, $amount, $paymentDate, $receivedBy, $notes, $borrower) {
            $this->reverseSettlementActionGroup($actionGroupKey);

            return $this->settleBorrowerTotal(
                $borrower,
                $amount,
                $paymentDate,
                $receivedBy,
                $notes,
                $actionGroupKey
            );
        });
    }

    public function outstandingForBorrower(Borrower $borrower): int
    {
        return (int) $borrower->loans()
            ->whereIn('status', [BorrowerLoan::STATUS_OUTSTANDING, BorrowerLoan::STATUS_REJECTED_BY_RECEIVER])
            ->selectRaw('COALESCE(SUM(amount - settled_amount), 0) as total')
            ->value('total');
    }

    public function createManualLoan(Borrower $borrower, int $amount, string $occurredAt, ?User $createdBy, ?string $notes = null): BorrowerLoan
    {
        if ($amount <= 0) {
            throw new RuntimeException('Nominal pinjaman harus lebih dari 0.');
        }

        return BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'invoice_id' => null,
            'confirmed_by_user_id' => $createdBy?->id,
            'target_receiver_user_id' => null,
            'actual_receiver_user_id' => null,
            'amount' => $amount,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => $occurredAt,
            'notes' => $notes,
        ]);
    }

    public function totalOutstanding(): float
    {
        if (!Schema::hasTable('borrower_loans')) {
            return 0;
        }

        return (float) BorrowerLoan::query()
            ->whereIn('status', [
                BorrowerLoan::STATUS_OUTSTANDING,
                BorrowerLoan::STATUS_REJECTED_BY_RECEIVER,
            ])
            ->selectRaw('COALESCE(SUM(amount - settled_amount), 0) as total')
            ->value('total');
    }
}

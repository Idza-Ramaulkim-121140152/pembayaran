<?php

namespace App\Services;

use App\Models\FinancialTransaction;
use App\Models\PaymentReceiptOption;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\PayrollMemberPayment;
use App\Models\Pengeluaran;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class FinancialLedgerService
{
    public function syncInvoicePayment(Invoice $invoice, ?int $actorId = null, string $transactionStatus = FinancialTransaction::STATUS_CONFIRMED): ?FinancialTransaction
    {
        if (!$this->isReady()) {
            return null;
        }

        $customer = $invoice->relationLoaded('customer')
            ? $invoice->customer
            : $invoice->customer()->first();

        $receivedViaOption = $invoice->relationLoaded('receivedViaPaymentReceiptOption')
            ? $invoice->receivedViaPaymentReceiptOption
            : $invoice->receivedViaPaymentReceiptOption()->first();

        $receivedViaPaymentMethod = $invoice->relationLoaded('receivedViaPaymentMethod')
            ? $invoice->receivedViaPaymentMethod
            : $invoice->receivedViaPaymentMethod()->first();

        $receivedViaName = $receivedViaOption?->name
            ?: $receivedViaPaymentMethod?->display_name;

        $paymentReceiver = null;
        if (Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
            $paymentReceiver = $invoice->relationLoaded('paymentReceiver')
                ? $invoice->paymentReceiver
                : $invoice->paymentReceiver()->first();
        }

        $pppoeUsername = trim((string) ($customer->pppoe_username ?? ''));
        $description = $pppoeUsername !== ''
            ? 'Pembayaran PPPoE ' . $pppoeUsername
            : 'Pembayaran pelanggan ' . ($customer->name ?? ('#' . $invoice->customer_id));

        $query = FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id);

        $includeInMutation = !Schema::hasColumn('invoices', 'include_in_mutation')
            || (bool) ($invoice->include_in_mutation ?? true);

        if ($invoice->status !== 'paid' || !$includeInMutation) {
            $query->delete();
            return null;
        }

        $transactionDate = $invoice->paid_at ? Carbon::parse($invoice->paid_at)->toDateString() : now()->toDateString();

        return $query->updateOrCreate(
            [
                'source' => 'invoice_payment',
                'reference_type' => Invoice::class,
                'reference_id' => $invoice->id,
            ],
            [
                'type' => 'income',
                'category' => 'pembayaran',
                'description' => $description,
                'amount' => (float) $invoice->amount,
                'transaction_date' => $transactionDate,
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'status' => $transactionStatus,
                'meta' => [
                    'invoice_link' => $invoice->invoice_link,
                    'customer_id' => $invoice->customer_id,
                    'pppoe_username' => $pppoeUsername,
                    'status' => $invoice->status,
                    'received_via_id' => $receivedViaOption?->id,
                    'received_via_name' => $receivedViaName,
                    'payment_receiver_user_id' => $paymentReceiver?->id,
                    'payment_receiver_name' => $paymentReceiver?->name,
                    'payment_receiver_is_company_finance' => $paymentReceiver
                        ? app(CompanyFinanceReceiverService::class)->isCompanyFinanceUserId($paymentReceiver->id)
                        : false,
                ],
            ]
        );
    }

    private function isReady(): bool
    {
        return Schema::hasTable('financial_transactions');
    }

    public function syncCustomerInstallationIncome(
        Customer $customer,
        ?int $actorId = null,
        string $transactionStatus = FinancialTransaction::STATUS_CONFIRMED,
        ?PaymentReceiptOption $receivedViaOption = null,
        ?User $paymentReceiver = null
    ): ?FinancialTransaction
    {
        if (!$this->isReady()) {
            return null;
        }

        $fee = (float) ($customer->installation_fee ?? 0);

        $query = FinancialTransaction::query()
            ->where('source', 'installation_income')
            ->where('reference_type', Customer::class)
            ->where('reference_id', $customer->id);

        if ($fee <= 0) {
            $query->delete();
            return null;
        }

        $transactionDate = $customer->activation_date
            ? Carbon::parse($customer->activation_date)->toDateString()
            : now()->toDateString();

        return $query->updateOrCreate(
            [
                'source' => 'installation_income',
                'reference_type' => Customer::class,
                'reference_id' => $customer->id,
            ],
            [
                'type' => 'income',
                'category' => 'pemasangan',
                'description' => 'Biaya pemasangan pelanggan ' . ($customer->name ?? ('#' . $customer->id)),
                'amount' => $fee,
                'transaction_date' => $transactionDate,
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'status' => $transactionStatus,
                'meta' => [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'received_via_id' => $receivedViaOption?->id,
                    'received_via_name' => $receivedViaOption?->name,
                    'payment_receiver_user_id' => $paymentReceiver?->id,
                    'payment_receiver_name' => $paymentReceiver?->name,
                    'payment_receiver_is_company_finance' => $paymentReceiver
                        ? app(CompanyFinanceReceiverService::class)->isCompanyFinanceUserId($paymentReceiver->id)
                        : false,
                ],
            ]
        );
    }

    public function syncPengeluaran(Pengeluaran $pengeluaran, ?int $actorId = null): void
    {
        if (!$this->isReady()) {
            return;
        }

        FinancialTransaction::updateOrCreate(
            [
                'source' => 'pengeluaran',
                'reference_type' => Pengeluaran::class,
                'reference_id' => $pengeluaran->id,
            ],
            [
                'type' => 'expense',
                'category' => $pengeluaran->kategori,
                'description' => $pengeluaran->detail ?: ('Pengeluaran ' . $pengeluaran->kategori),
                'amount' => (float) $pengeluaran->jumlah,
                'transaction_date' => Carbon::parse($pengeluaran->tanggal)->toDateString(),
                'created_by' => $pengeluaran->user_id,
                'updated_by' => $actorId,
                'status' => FinancialTransaction::STATUS_CONFIRMED,
                'meta' => [
                    'payment_source' => $pengeluaran->payment_source ?? 'company_cash',
                    'borrower_id' => $pengeluaran->borrower_id,
                    'borrower_loan_settlement_amount' => (int) ($pengeluaran->borrower_loan_settlement_amount ?? 0),
                    'borrower_loan_settlement_action_group_key' => $pengeluaran->borrower_loan_settlement_action_group_key,
                ],
            ]
        );
    }

    public function removePengeluaran(Pengeluaran $pengeluaran): void
    {
        if (!$this->isReady()) {
            return;
        }

        FinancialTransaction::query()
            ->where('source', 'pengeluaran')
            ->where('reference_type', Pengeluaran::class)
            ->where('reference_id', $pengeluaran->id)
            ->delete();
    }

    public function syncPayrollPayment(PayrollMemberPayment $payment, ?int $actorId = null): void
    {
        if (!$this->isReady()) {
            return;
        }

        $member = $payment->relationLoaded('member')
            ? $payment->member
            : $payment->member()->first();

        $memberName = trim((string) ($member->nama ?? ''));
        $description = $payment->catatan ?: ($memberName !== ''
            ? 'Pembayaran payroll member ' . $memberName
            : 'Pembayaran payroll member #' . $payment->payroll_member_id);

        $loanDeductionAmount = (float) ($payment->loan_deduction_amount ?? 0);
        $cashPaidAmount = (float) ($payment->cash_paid_amount ?? 0);
        if ($cashPaidAmount <= 0 && $loanDeductionAmount <= 0) {
            $cashPaidAmount = (float) $payment->nominal;
        }
        $grossPayrollAmount = (float) ($payment->gross_nominal ?: $payment->nominal);
        $query = FinancialTransaction::query()
            ->where('source', 'payroll')
            ->where('reference_type', PayrollMemberPayment::class)
            ->where('reference_id', $payment->id);

        if ($grossPayrollAmount <= 0) {
            $query->delete();
            return;
        }

        FinancialTransaction::updateOrCreate(
            [
                'source' => 'payroll',
                'reference_type' => PayrollMemberPayment::class,
                'reference_id' => $payment->id,
            ],
            [
                'type' => 'expense',
                'category' => 'payroll',
                'description' => $description,
                'amount' => $grossPayrollAmount,
                'transaction_date' => Carbon::parse($payment->created_at ?? now())->toDateString(),
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'status' => FinancialTransaction::STATUS_CONFIRMED,
                'meta' => [
                    'payroll_member_id' => $payment->payroll_member_id,
                    'payroll_member_name' => $memberName,
                    'gross_nominal' => $grossPayrollAmount,
                    'loan_handling' => $payment->loan_handling ?? 'cash',
                    'loan_deduction_amount' => $loanDeductionAmount,
                    'cash_paid_amount' => $cashPaidAmount,
                    'borrower_id' => $payment->borrower_id,
                    'borrower_loan_settlement_action_group_key' => $payment->borrower_loan_settlement_action_group_key,
                ],
            ]
        );
    }

    public function getSummary(): array
    {
        if (!$this->isReady()) {
            return [
                'total_income' => 0,
                'total_expense' => 0,
                'adjustment_net' => 0,
                'balance' => 0,
            ];
        }

        $totalIncome = (float) FinancialTransaction::query()
            ->where('type', 'income')
            ->where(function ($query) {
                if (Schema::hasColumn('financial_transactions', 'status')) {
                    $query->where('status', FinancialTransaction::STATUS_CONFIRMED);
                }
            })
            ->sum('amount');

        $totalExpense = (float) FinancialTransaction::query()
            ->where('type', 'expense')
            ->where(function ($query) {
                if (Schema::hasColumn('financial_transactions', 'status')) {
                    $query->where('status', FinancialTransaction::STATUS_CONFIRMED);
                }
            })
            ->sum('amount');

        $adjustmentNet = (float) FinancialTransaction::query()
            ->where('type', 'adjustment')
            ->where(function ($query) {
                if (Schema::hasColumn('financial_transactions', 'status')) {
                    $query->where('status', FinancialTransaction::STATUS_CONFIRMED);
                }
            })
            ->sum('amount');

        $balance = $totalIncome - $totalExpense + $adjustmentNet;

        return [
            'total_income' => $totalIncome,
            'total_expense' => $totalExpense,
            'adjustment_net' => $adjustmentNet,
            'balance' => $balance,
        ];
    }

    public function getSummaryAsOfDate(CarbonInterface $date): array
    {
        if (!$this->isReady()) {
            return [
                'total_income' => 0,
                'total_expense' => 0,
                'adjustment_net' => 0,
                'balance' => 0,
                'as_of_date' => $date->toDateString(),
            ];
        }

        $cutoffDate = $date->copy()->toDateString();

        $totalIncome = (float) FinancialTransaction::query()
            ->where('type', 'income')
            ->when(Schema::hasColumn('financial_transactions', 'status'), function ($query) {
                $query->where('status', FinancialTransaction::STATUS_CONFIRMED);
            })
            ->whereDate('transaction_date', '<=', $cutoffDate)
            ->sum('amount');

        $totalExpense = (float) FinancialTransaction::query()
            ->where('type', 'expense')
            ->when(Schema::hasColumn('financial_transactions', 'status'), function ($query) {
                $query->where('status', FinancialTransaction::STATUS_CONFIRMED);
            })
            ->whereDate('transaction_date', '<=', $cutoffDate)
            ->sum('amount');

        $adjustmentNet = (float) FinancialTransaction::query()
            ->where('type', 'adjustment')
            ->when(Schema::hasColumn('financial_transactions', 'status'), function ($query) {
                $query->where('status', FinancialTransaction::STATUS_CONFIRMED);
            })
            ->whereDate('transaction_date', '<=', $cutoffDate)
            ->sum('amount');

        $balance = $totalIncome - $totalExpense + $adjustmentNet;

        return [
            'total_income' => $totalIncome,
            'total_expense' => $totalExpense,
            'adjustment_net' => $adjustmentNet,
            'balance' => $balance,
            'as_of_date' => $cutoffDate,
        ];
    }

    public function getSummaryAsOfToday(): array
    {
        return $this->getSummaryAsOfDate(Carbon::today());
    }
}

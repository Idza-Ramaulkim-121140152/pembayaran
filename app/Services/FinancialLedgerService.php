<?php

namespace App\Services;

use App\Models\FinancialTransaction;
use App\Models\PaymentReceiptOption;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\PayrollMemberPayment;
use App\Models\Pengeluaran;
use App\Models\User;
use App\Services\CompanyFinanceReceiverService;
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

        $capture = null;
        if (class_exists(\App\Models\BillingPaymentCapture::class)) {
            $capture = \App\Models\BillingPaymentCapture::query()
                ->where('invoice_id', $invoice->id)
                ->where('match_status', 'approved')
                ->latest('id')
                ->first();
        }

        $paymentProofData = null;
        if ($capture) {
            $cMeta = (array) ($capture->meta ?? []);
            $cMediaPath = (string) data_get($cMeta, 'media.path', $invoice->bukti_pembayaran);
            $proofUrl = null;
            if ($cMediaPath !== '') {
                if (str_starts_with($cMediaPath, 'http://') || str_starts_with($cMediaPath, 'https://')) {
                    $proofUrl = $cMediaPath;
                } else {
                    $cleanPath = ltrim(str_replace('public/', '', $cMediaPath), '/');
                    $proofUrl = '/storage/' . $cleanPath;
                }
            } elseif ($invoice->id && $invoice->bukti_pembayaran) {
                $proofUrl = "/billing/invoice/{$invoice->id}/payment-proof";
            }

            $paymentProofData = [
                'capture_id' => $capture->id,
                'source' => $capture->source,
                'reference_code' => $capture->reference_code ?: data_get($cMeta, 'analysis.reference_code', $invoice->qris_transaction_number),
                'sender_name' => data_get($cMeta, 'analysis.sender_name', $invoice->qris_sender),
                'bank_name' => data_get($cMeta, 'analysis.payment_channel'),
                'amount' => (float) ($capture->amount ?: $invoice->amount),
                'paid_date' => optional($capture->paid_date)->toDateString() ?: ($invoice->paid_at ? Carbon::parse($invoice->paid_at)->toDateString() : now()->toDateString()),
                'paid_time' => data_get($cMeta, 'analysis.paid_time') ?: ($invoice->qris_payment_time ? Carbon::parse($invoice->qris_payment_time)->format('H:i:s') : null),
                'media_path' => $cMediaPath,
                'proof_url' => $proofUrl,
                'ocr_raw_text' => data_get($cMeta, 'analysis.ocr_raw_text'),
                'raw_summary' => data_get($cMeta, 'analysis.raw_summary'),
                'confidence' => $capture->match_confidence !== null ? (float) $capture->match_confidence : null,
            ];
        } elseif (!empty($invoice->bukti_pembayaran)) {
            $cMediaPath = (string) $invoice->bukti_pembayaran;
            $proofUrl = null;
            if (str_starts_with($cMediaPath, 'http://') || str_starts_with($cMediaPath, 'https://')) {
                $proofUrl = $cMediaPath;
            } else {
                $cleanPath = ltrim(str_replace('public/', '', $cMediaPath), '/');
                $proofUrl = '/storage/' . $cleanPath;
            }
            $paymentProofData = [
                'capture_id' => null,
                'source' => 'web_public_invoice',
                'reference_code' => $invoice->qris_transaction_number,
                'sender_name' => $invoice->qris_sender,
                'bank_name' => null,
                'amount' => (float) $invoice->amount,
                'paid_date' => $invoice->paid_at ? Carbon::parse($invoice->paid_at)->toDateString() : now()->toDateString(),
                'paid_time' => $invoice->qris_payment_time ? Carbon::parse($invoice->qris_payment_time)->format('H:i:s') : null,
                'media_path' => $cMediaPath,
                'proof_url' => $proofUrl,
                'ocr_raw_text' => null,
                'raw_summary' => null,
                'confidence' => null,
            ];
        }

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
                    'qris_payment_time' => $this->formatSafeIsoDateTime($invoice->qris_payment_time),
                    'qris_sender' => $invoice->qris_sender,
                    'qris_transaction_number' => $invoice->qris_transaction_number,
                    'payment_proof' => $paymentProofData,
                    'media' => $paymentProofData ? [
                        'path' => $paymentProofData['media_path'],
                        'url' => $paymentProofData['proof_url'],
                    ] : null,
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

    private function formatSafeIsoDateTime($value): ?string
    {
        if (!$value) {
            return null;
        }

        if ($value instanceof CarbonInterface) {
            return $value->toIso8601String();
        }

        $str = trim((string) $value);
        if ($str === '') {
            return null;
        }

        $normalized = preg_replace('/(\d{1,2})\.(\d{2})(?:\.(\d{2}))?/', '$1:$2$3', $str);

        try {
            return Carbon::parse($normalized)->toIso8601String();
        } catch (\Throwable $e) {
            try {
                return Carbon::parse($str)->toIso8601String();
            } catch (\Throwable $e2) {
                return now()->toIso8601String();
            }
        }
    }
}

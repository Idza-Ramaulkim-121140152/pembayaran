<?php

namespace App\Services;

use App\Models\FinancialTransaction;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\PayrollMemberPayment;
use App\Models\Pengeluaran;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class FinancialLedgerService
{
    private function isReady(): bool
    {
        return Schema::hasTable('financial_transactions');
    }

    public function syncInvoicePayment(Invoice $invoice, ?int $actorId = null): void
    {
        if (!$this->isReady()) {
            return;
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

        $pppoeUsername = trim((string) ($customer->pppoe_username ?? ''));
        $description = $pppoeUsername !== ''
            ? 'Pembayaran PPPoE ' . $pppoeUsername
            : 'Pembayaran pelanggan ' . ($customer->name ?? ('#' . $invoice->customer_id));

        $query = FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id);

        if ($invoice->status !== 'paid') {
            $query->delete();
            return;
        }

        $transactionDate = $invoice->paid_at ? Carbon::parse($invoice->paid_at)->toDateString() : now()->toDateString();

        $query->updateOrCreate(
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
                'meta' => [
                    'invoice_link' => $invoice->invoice_link,
                    'customer_id' => $invoice->customer_id,
                    'pppoe_username' => $pppoeUsername,
                    'status' => $invoice->status,
                    'received_via_id' => $receivedViaOption?->id,
                    'received_via_name' => $receivedViaName,
                ],
            ]
        );
    }

    public function syncCustomerInstallationIncome(Customer $customer, ?int $actorId = null): void
    {
        if (!$this->isReady()) {
            return;
        }

        $fee = (float) ($customer->installation_fee ?? 0);

        $query = FinancialTransaction::query()
            ->where('source', 'installation_income')
            ->where('reference_type', Customer::class)
            ->where('reference_id', $customer->id);

        if ($fee <= 0) {
            $query->delete();
            return;
        }

        $transactionDate = $customer->activation_date
            ? Carbon::parse($customer->activation_date)->toDateString()
            : now()->toDateString();

        $query->updateOrCreate(
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
                'meta' => [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
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
                'amount' => (float) $payment->nominal,
                'transaction_date' => Carbon::parse($payment->created_at ?? now())->toDateString(),
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'meta' => [
                    'payroll_member_id' => $payment->payroll_member_id,
                    'payroll_member_name' => $memberName,
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
            ->sum('amount');

        $totalExpense = (float) FinancialTransaction::query()
            ->where('type', 'expense')
            ->sum('amount');

        $adjustmentNet = (float) FinancialTransaction::query()
            ->where('type', 'adjustment')
            ->sum('amount');

        $balance = $totalIncome - $totalExpense + $adjustmentNet;

        return [
            'total_income' => $totalIncome,
            'total_expense' => $totalExpense,
            'adjustment_net' => $adjustmentNet,
            'balance' => $balance,
        ];
    }
}

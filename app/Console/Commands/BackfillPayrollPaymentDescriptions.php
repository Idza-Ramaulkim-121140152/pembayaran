<?php

namespace App\Console\Commands;

use App\Models\FinancialTransaction;
use Illuminate\Console\Command;

class BackfillPayrollPaymentDescriptions extends Command
{
    protected $signature = 'ledger:backfill-payroll-descriptions';

    protected $description = 'Backfill payroll mutation descriptions with payroll member names';

    public function handle(): int
    {
        $transactions = FinancialTransaction::query()
            ->where('source', 'payroll')
            ->with('reference.member')
            ->get();

        $updated = 0;

        foreach ($transactions as $transaction) {
            $payment = $transaction->reference;
            if (!$payment) {
                continue;
            }

            $member = $payment->member;
            $memberName = trim((string) ($member->nama ?? ''));

            if (trim((string) $transaction->description) === '' || str_contains((string) $transaction->description, 'Pembayaran payroll member #')) {
                $transaction->description = $memberName !== ''
                    ? 'Pembayaran payroll member ' . $memberName
                    : 'Pembayaran payroll member #' . $payment->payroll_member_id;
            }

            $meta = is_array($transaction->meta) ? $transaction->meta : [];
            $meta['payroll_member_name'] = $memberName;
            $transaction->meta = $meta;
            $transaction->save();

            $updated++;
        }

        $this->info("Backfill selesai. Total mutasi payroll diperbarui: {$updated}");

        return self::SUCCESS;
    }
}

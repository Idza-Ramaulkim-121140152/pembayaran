<?php

namespace App\Console\Commands;

use App\Models\FinancialTransaction;
use Illuminate\Console\Command;

class BackfillInvoicePaymentDescriptions extends Command
{
    protected $signature = 'ledger:backfill-invoice-descriptions';

    protected $description = 'Backfill invoice payment mutation descriptions with PPPoE username details';

    public function handle(): int
    {
        $transactions = FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->with('reference.customer')
            ->get();

        $updated = 0;

        foreach ($transactions as $transaction) {
            $invoice = $transaction->reference;
            if (!$invoice) {
                continue;
            }

            $customer = $invoice->customer;
            $pppoeUsername = trim((string) ($customer->pppoe_username ?? ''));
            $description = $pppoeUsername !== ''
                ? 'Pembayaran PPPoE ' . $pppoeUsername
                : 'Pembayaran pelanggan ' . ($customer->name ?? ('#' . $invoice->customer_id));

            $meta = is_array($transaction->meta) ? $transaction->meta : [];
            $meta['pppoe_username'] = $pppoeUsername;

            $transaction->description = $description;
            $transaction->meta = $meta;
            $transaction->save();
            $updated++;
        }

        $this->info("Backfill selesai. Total mutasi diperbarui: {$updated}");

        return self::SUCCESS;
    }
}

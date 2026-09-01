<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\BillingPaymentCapture;
use Illuminate\Support\Collection;

class CustomerResolutionService
{
    /**
     * Resolve Customer from any available metadata in BillingPaymentCapture
     */
    public function resolveFromCapture(BillingPaymentCapture $capture): ?Customer
    {
        if ($capture->customer_id && $capture->customer) {
            return $capture->customer;
        }

        if ($capture->customer_id) {
            $cust = Customer::query()->find($capture->customer_id);
            if ($cust) return $cust;
        }

        // 1. Resolve by sender phone
        $senderPhone = (string) data_get($capture->meta, 'sender_phone', '');
        if ($senderPhone !== '') {
            $cust = $this->findCustomerByPhone($senderPhone);
            if ($cust) return $cust;
        }

        // 2. Resolve by caption / message text
        $caption = (string) data_get($capture->meta, 'source.caption', '');
        $ocrText = (string) data_get($capture->meta, 'analysis.ocr_raw_text', '');
        $refCode = (string) ($capture->reference_code ?? '');

        $combinedText = trim($caption . ' ' . $ocrText . ' ' . $refCode);
        if ($combinedText !== '') {
            $cust = $this->resolveFromText($combinedText);
            if ($cust) return $cust;
        }

        // 3. Resolve by Invoice ID if attached
        if ($capture->invoice_id) {
            $invoice = Invoice::query()->with('customer')->find($capture->invoice_id);
            if ($invoice?->customer) {
                return $invoice->customer;
            }
        }

        return null;
    }

    /**
     * Find customer by phone with flexible Indonesian phone number normalization
     */
    public function findCustomerByPhone(?string $phone): ?Customer
    {
        if (!$phone) {
            return null;
        }

        $digits = preg_replace('/\D/', '', $phone) ?: '';
        if (strlen($digits) < 7) {
            return null;
        }

        // Extract core national digits (without country code 62 or leading 0)
        $coreNumber = $digits;
        if (str_starts_with($coreNumber, '62')) {
            $coreNumber = substr($coreNumber, 2);
        }
        $coreNumber = ltrim($coreNumber, '0');

        if (strlen($coreNumber) < 7) {
            return null;
        }

        // 1. Search exact common format variants
        $variants = array_values(array_unique(array_filter([
            $digits,
            '0' . $coreNumber,
            '62' . $coreNumber,
            '+62' . $coreNumber,
            '+62 ' . $coreNumber,
            '+62' . substr($coreNumber, 0, 3) . '-' . substr($coreNumber, 3),
            '0' . substr($coreNumber, 0, 3) . '-' . substr($coreNumber, 3),
        ])));

        $customer = Customer::query()
            ->where(function ($q) use ($variants) {
                foreach ($variants as $v) {
                    $q->orWhere('phone', $v);
                }
            })
            ->first();

        if ($customer) {
            return $customer;
        }

        // 2. Search database by stripping all punctuation and spaces from `phone` column in SQL
        $significant = strlen($coreNumber) >= 8 ? substr($coreNumber, -8) : $coreNumber;

        return Customer::query()
            ->where(function ($q) use ($coreNumber, $significant) {
                $q->whereRaw("REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '.', '') LIKE ?", ['%' . $coreNumber . '%'])
                  ->orWhereRaw("REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '.', '') LIKE ?", ['%' . $significant . '%']);
            })
            ->first();
    }

    /**
     * Resolve customer from freeform text (caption, OCR text, or notes)
     */
    public function resolveFromText(string $text): ?Customer
    {
        // A. Extract phone numbers from text
        if (preg_match_all('/(?:(?:\+62|62|0)8[0-9]{8,12})/', $text, $matches)) {
            foreach ($matches[0] as $extractedPhone) {
                $cust = $this->findCustomerByPhone($extractedPhone);
                if ($cust) return $cust;
            }
        }

        // B. Extract Invoice Link from text (e.g. inv_69ddc05712eff or INV-12345)
        if (preg_match('/(?:invoice\/|INV-?)([A-Za-z0-9\-_]+)/i', $text, $invMatch)) {
            $link = $invMatch[1];
            $invoice = Invoice::query()->with('customer')->where('invoice_link', 'like', "%{$link}%")->first();
            if ($invoice?->customer) {
                return $invoice->customer;
            }
        }

        // C. Extract PPPoE Username from text (e.g. CJA-kastori, SMD-cecep)
        if (preg_match('/\b([A-Z]{2,4}-[a-zA-Z0-9_-]+)\b/', $text, $pppoeMatch)) {
            $pppoe = $pppoeMatch[1];
            $cust = Customer::query()->where('pppoe_username', $pppoe)->first();
            if ($cust) return $cust;
        }

        return null;
    }

    /**
     * Find active unpaid / awaiting confirmation invoices for a given customer
     */
    public function findActiveInvoices(Customer $customer): Collection
    {
        return $customer->invoices()
            ->whereIn('status', ['unpaid', 'menunggu konfirmasi'])
            ->orderBy('due_date')
            ->orderBy('id')
            ->get();
    }
}

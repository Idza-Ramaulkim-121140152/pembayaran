<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\BillingPaymentCapture;
use Illuminate\Support\Collection;

class CustomerResolutionService
{
    public const LID_SETTING_KEY = 'whatsapp_lid_mappings';

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

        $senderPhone = (string) data_get($capture->meta, 'sender_phone', '');
        $senderLid = (string) data_get($capture->meta, 'sender_lid', '');
        $senderName = (string) data_get($capture->meta, 'sender_name', '');

        // 1. Resolve by sender phone (if regular telephone number)
        if ($senderPhone !== '' && !$this->isLid($senderPhone)) {
            $cust = $this->findCustomerByPhone($senderPhone);
            if ($cust) {
                if ($senderLid !== '') $this->rememberCustomerLid($cust->id, $senderLid);
                return $cust;
            }
        }

        // 2. Resolve by sender LID mapping or past capture
        if ($senderLid !== '') {
            $cust = $this->findCustomerByLid($senderLid);
            if ($cust) return $cust;
        }

        if ($senderPhone !== '' && $this->isLid($senderPhone)) {
            $cust = $this->findCustomerByLid($senderPhone);
            if ($cust) return $cust;
        }

        // 3. Resolve by WhatsApp push name (profile name)
        if ($senderName !== '') {
            $cust = $this->findCustomerByName($senderName);
            if ($cust) {
                $lidToRemember = $senderLid !== '' ? $senderLid : ($this->isLid($senderPhone) ? $senderPhone : null);
                if ($lidToRemember) $this->rememberCustomerLid($cust->id, $lidToRemember);
                return $cust;
            }
        }

        // 4. Resolve by caption / message text / OCR
        $caption = (string) data_get($capture->meta, 'source.caption', '');
        $ocrText = (string) data_get($capture->meta, 'analysis.ocr_raw_text', '');
        $refCode = (string) ($capture->reference_code ?? '');

        $combinedText = trim($caption . ' ' . $ocrText . ' ' . $refCode);
        if ($combinedText !== '') {
            $cust = $this->resolveFromText($combinedText);
            if ($cust) {
                $lidToRemember = $senderLid !== '' ? $senderLid : ($this->isLid($senderPhone) ? $senderPhone : null);
                if ($lidToRemember) $this->rememberCustomerLid($cust->id, $lidToRemember);
                return $cust;
            }
        }

        // 5. Resolve by Invoice ID if attached
        if ($capture->invoice_id) {
            $invoice = Invoice::query()->with('customer')->find($capture->invoice_id);
            if ($invoice?->customer) {
                $cust = $invoice->customer;
                $lidToRemember = $senderLid !== '' ? $senderLid : ($this->isLid($senderPhone) ? $senderPhone : null);
                if ($lidToRemember) $this->rememberCustomerLid($cust->id, $lidToRemember);
                return $cust;
            }
        }

        return null;
    }

    /**
     * Check if identifier is a WhatsApp LID (Linked Device Identifier)
     */
    public function isLid(?string $val): bool
    {
        if (!$val) return false;
        $str = (string) $val;
        if (str_contains($str, '@lid')) return true;
        $digits = preg_replace('/\D/', '', $str) ?: '';
        return strlen($digits) >= 14 && (
            str_starts_with($digits, '1') ||
            str_starts_with($digits, '2') ||
            str_starts_with($digits, '01') ||
            str_starts_with($digits, '02')
        );
    }

    /**
     * Clean raw LID into normalized digit string
     */
    public function cleanLid(?string $val): string
    {
        if (!$val) return '';
        $digits = preg_replace('/\D/', '', str_replace('@lid', '', $val)) ?: '';
        if (strlen($digits) >= 15 && str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }
        return $digits;
    }

    /**
     * Persist confirmed WhatsApp LID mapping for a customer
     */
    public function rememberCustomerLid(int $customerId, ?string $lid): void
    {
        $clean = $this->cleanLid($lid);
        if ($clean === '' || $customerId <= 0) return;

        try {
            \Illuminate\Support\Facades\Cache::forever("wa_lid_customer_{$clean}", $customerId);

            $stored = \App\Models\SiteSetting::get(self::LID_SETTING_KEY);
            $mappings = is_string($stored) ? json_decode($stored, true) : [];
            if (!is_array($mappings)) $mappings = [];

            $mappings[$clean] = $customerId;
            \App\Models\SiteSetting::set(self::LID_SETTING_KEY, json_encode($mappings));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Failed to remember WhatsApp LID: ' . $e->getMessage());
        }
    }

    /**
     * Find customer by WhatsApp LID (via cache, settings mapping, or past confirmed captures)
     */
    public function findCustomerByLid(?string $lid): ?Customer
    {
        $clean = $this->cleanLid($lid);
        if ($clean === '') return null;

        // 1. Check in-memory Cache
        $cachedId = \Illuminate\Support\Facades\Cache::get("wa_lid_customer_{$clean}");
        if ($cachedId) {
            $cust = Customer::query()->find($cachedId);
            if ($cust) return $cust;
        }

        // 2. Check SiteSetting storage
        try {
            $stored = \App\Models\SiteSetting::get(self::LID_SETTING_KEY);
            $mappings = is_string($stored) ? json_decode($stored, true) : [];
            if (is_array($mappings) && !empty($mappings[$clean])) {
                $cust = Customer::query()->find($mappings[$clean]);
                if ($cust) {
                    \Illuminate\Support\Facades\Cache::forever("wa_lid_customer_{$clean}", $cust->id);
                    return $cust;
                }
            }
        } catch (\Throwable) {}

        // 3. Check past confirmed captures that had this LID or phone
        $past = BillingPaymentCapture::query()
            ->whereNotNull('customer_id')
            ->where(function ($q) use ($clean, $lid) {
                $q->where('meta->sender_lid', $clean)
                  ->orWhere('meta->sender_phone', $clean)
                  ->orWhere('meta->sender_phone', '0' . $clean)
                  ->orWhere('meta->sender_phone', $lid);
            })
            ->latest('id')
            ->first();

        if ($past?->customer_id) {
            $cust = Customer::query()->find($past->customer_id);
            if ($cust) {
                $this->rememberCustomerLid($cust->id, $clean);
                return $cust;
            }
        }

        // 4. Check if customer table directly has this number in phone column
        return Customer::query()
            ->where('phone', $clean)
            ->orWhere('phone', '0' . $clean)
            ->first();
    }

    /**
     * Find customer by WhatsApp Push Name / Profile Name
     */
    public function findCustomerByName(?string $name): ?Customer
    {
        if (!$name) return null;
        $clean = trim($name);
        if (strlen($clean) < 3) return null;

        // Remove common Indonesian honorifics
        $clean = trim(preg_replace('/^(?:bapak|ibu|bpk|pak|mas|mbak|kak|bang)\.?\s+/i', '', $clean));
        if (strlen($clean) < 3) return null;

        // 1. Direct exact or like match
        $cust = Customer::query()->where('name', $clean)->first();
        if ($cust) return $cust;

        $cust = Customer::query()->where('name', 'like', "%{$clean}%")->first();
        if ($cust) return $cust;

        // 2. Match significant individual words (min 4 characters)
        $words = array_filter(explode(' ', $clean), fn ($w) => strlen($w) >= 4);
        foreach ($words as $word) {
            $cust = Customer::query()->where('name', 'like', "%{$word}%")->first();
            if ($cust) return $cust;
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

        // C. Extract PPPoE Username from text (e.g. CJA-kastori, SMD-cecep, KALTAMCJA-jumingan)
        if (preg_match('/\b([A-Z]{2,12}-[a-zA-Z0-9_-]+)\b/', $text, $pppoeMatch)) {
            $pppoe = $pppoeMatch[1];
            $cust = Customer::query()->where('pppoe_username', $pppoe)->first();
            if ($cust) return $cust;
        }

        // D. Extract Sender / Customer Name from receipt text (e.g. Dari: Saripudin, Pengirim: Saripudin)
        if (preg_match('/(?:dari|pengirim|sender|atas\s*nama|a\.?n\.?)\s*[:#\.\s]?\s*([a-zA-Z\s]{3,35})/i', $text, $nameMatch)) {
            $extractedName = trim($nameMatch[1]);
            $stopWords = ['bank', 'rekening', 'anda', 'kamu', 'qris', 'seabank', 'bca', 'bri', 'bni', 'mandiri', 'dana', 'gopay', 'ovo', 'shopeepay'];
            if (strlen($extractedName) >= 3 && !in_array(strtolower($extractedName), $stopWords, true)) {
                $cust = Customer::query()->where('name', 'like', "%{$extractedName}%")->first();
                if ($cust) return $cust;
            }
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

<?php

namespace App\Services;

use App\Models\Invoice;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class InvoiceDocumentService
{
    private const SIGNER_NAME = 'Idza Ramaulkim';
    private const SIGNER_ROLE = 'Direktur Utama';
    private const SIGNATURE_STATEMENT = 'Invoice ini ditandatangani secara digital oleh Idza Ramaulkim selaku Direktur Utama Rumah Kita Network.';

    public function ensureGenerated(Invoice $invoice, bool $force = false): Invoice
    {
        $invoice->loadMissing(['customer.package', 'items']);
        $sourceHash = $this->sourceHash($invoice);
        $signatureMeta = $invoice->signature_meta ?: [];

        if (
            !$force
            && $invoice->pdf_path
            && Storage::disk('public')->exists($invoice->pdf_path)
            && ($signatureMeta['source_hash'] ?? null) === $sourceHash
        ) {
            return $invoice;
        }

        $documentToken = $invoice->document_token ?: Str::random(48);
        $verifyUrl = route('invoice-documents.public.verify', ['token' => $documentToken], true);
        $signatureMeta = [
            'signer' => self::SIGNER_NAME,
            'role' => self::SIGNER_ROLE,
            'statement' => self::SIGNATURE_STATEMENT,
            'verify_url' => $verifyUrl,
            'qr' => $this->qrDataUri($verifyUrl),
            'signed_at' => now()->toISOString(),
            'source_hash' => $sourceHash,
        ];

        $invoice->forceFill([
            'document_token' => $documentToken,
            'signature_meta' => $signatureMeta,
            'document_generated_at' => now(),
        ])->save();

        $invoice->loadMissing(['customer.package', 'items']);
        $pdf = Pdf::loadView('billing.invoice-document', $this->viewData($invoice, false))
            ->setPaper('a4', 'landscape');

        $path = 'billing-invoices/' . now()->format('Y/m')
            . '/invoice-' . $invoice->id . '-' . substr($documentToken, 0, 12) . '.pdf';

        if ($invoice->pdf_path && $invoice->pdf_path !== $path) {
            Storage::disk('public')->delete($invoice->pdf_path);
        }

        Storage::disk('public')->put($path, $pdf->output());

        $invoice->forceFill([
            'pdf_path' => $path,
            'pdf_hash' => Storage::disk('public')->exists($path)
                ? hash('sha256', Storage::disk('public')->get($path))
                : null,
        ])->save();

        return $invoice->fresh(['customer.package', 'items']);
    }

    public function printViewData(Invoice $invoice): array
    {
        return $this->viewData($this->ensureGenerated($invoice), true);
    }

    public function viewData(Invoice $invoice, bool $autoPrint = false): array
    {
        $invoice->loadMissing(['customer.package', 'items']);
        $customer = $invoice->customer;
        $rows = $this->invoiceRows($invoice);
        $calculatedRows = collect($rows)->map(function (array $row): array {
            $gross = (float) $row['amount'];
            $base = round($gross / 1.11);

            return [
                'name' => $row['name'],
                'base' => $base,
                'tax' => $gross - $base,
                'gross' => $gross,
            ];
        });

        return [
            'invoice' => $invoice,
            'customer' => $customer,
            'invoiceNumber' => $invoice->invoice_link,
            'rows' => $calculatedRows->all(),
            'baseTotal' => $calculatedRows->sum('base'),
            'taxTotal' => $calculatedRows->sum('tax'),
            'grossTotal' => $calculatedRows->sum('gross'),
            'signatureMeta' => $invoice->signature_meta ?: [],
            'logoDataUri' => $this->localImageDataUri(public_path('logo_baru.png')),
            'autoPrint' => $autoPrint,
        ];
    }

    private function invoiceRows(Invoice $invoice): array
    {
        $itemRows = $invoice->items
            ->filter(fn ($item) => (float) $item->amount !== 0.0)
            ->map(fn ($item) => [
                'name' => $item->description ?: 'Layanan Internet',
                'amount' => (float) $item->amount,
            ])
            ->values()
            ->all();

        if ($itemRows !== []) {
            return $itemRows;
        }

        $total = (float) $invoice->amount;
        $installationFee = (float) ($invoice->customer?->installation_fee ?? 0);
        $packageName = $invoice->customer?->package?->name
            ?: $invoice->customer?->package_type
            ?: 'Layanan Internet';

        if ($installationFee > 0 && $installationFee < $total) {
            return [
                ['name' => 'Biaya Pemasangan', 'amount' => $installationFee],
                ['name' => 'Biaya Layanan Internet ' . $packageName, 'amount' => $total - $installationFee],
            ];
        }

        return [['name' => 'Biaya Layanan Internet ' . $packageName, 'amount' => $total]];
    }

    private function sourceHash(Invoice $invoice): string
    {
        $customer = $invoice->customer;

        return hash('sha256', json_encode([
            'invoice' => [
                'id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
                'invoice_date' => optional($invoice->invoice_date)->format('Y-m-d'),
                'due_date' => optional($invoice->due_date)->format('Y-m-d'),
                'amount' => (float) $invoice->amount,
                'status' => $invoice->status,
            ],
            'customer' => [
                'id' => $customer?->id,
                'name' => $customer?->name,
                'phone' => $customer?->phone,
                'address' => $customer?->address,
                'package_type' => $customer?->package?->name ?: $customer?->package_type,
                'installation_fee' => (float) ($customer?->installation_fee ?? 0),
            ],
            'items' => $invoice->items
                ->sortBy('id')
                ->map(fn ($item) => [
                    'id' => $item->id,
                    'description' => $item->description,
                    'quantity' => (float) $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'amount' => (float) $item->amount,
                ])
                ->values()
                ->all(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function qrDataUri(string $content): string
    {
        try {
            $renderer = new ImageRenderer(new RendererStyle(220), new SvgImageBackEnd());
            $svg = (new Writer($renderer))->writeString($content);

            return 'data:image/svg+xml;base64,' . base64_encode($svg);
        } catch (\Throwable $exception) {
            Log::warning('Failed generating invoice signature QR', [
                'error' => $exception->getMessage(),
            ]);

            return '';
        }
    }

    private function localImageDataUri(string $path): ?string
    {
        if (!is_file($path)) {
            return null;
        }

        $mime = mime_content_type($path) ?: 'image/png';

        return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($path));
    }
}

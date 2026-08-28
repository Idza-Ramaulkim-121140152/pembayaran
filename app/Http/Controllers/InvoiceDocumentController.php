<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Services\InvoiceDocumentService;
use Illuminate\Support\Facades\Storage;

class InvoiceDocumentController extends Controller
{
    public function showPrint(string $invoice_link, InvoiceDocumentService $documentService)
    {
        $invoice = Invoice::with(['customer.package', 'items'])
            ->where('invoice_link', $invoice_link)
            ->firstOrFail();

        return view('billing.invoice-document', $documentService->printViewData($invoice));
    }

    public function download(string $token, InvoiceDocumentService $documentService)
    {
        $invoice = Invoice::with(['customer.package', 'items'])
            ->where('document_token', $token)
            ->firstOrFail();

        $invoice = $documentService->ensureGenerated($invoice);

        abort_unless(
            $invoice->pdf_path && Storage::disk('public')->exists($invoice->pdf_path),
            404
        );

        return redirect(Storage::disk('public')->url($invoice->pdf_path));
    }

    public function verify(string $token, InvoiceDocumentService $documentService)
    {
        $invoice = Invoice::with(['customer.package', 'items'])
            ->where('document_token', $token)
            ->firstOrFail();

        $invoice = $documentService->ensureGenerated($invoice);

        return view('billing.invoice-verify', [
            'invoice' => $invoice,
            'customer' => $invoice->customer,
            'signatureMeta' => $invoice->signature_meta ?: [],
        ]);
    }
}

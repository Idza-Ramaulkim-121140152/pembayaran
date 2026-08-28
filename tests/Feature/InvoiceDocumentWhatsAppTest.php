<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\User;
use App\Services\InvoiceDocumentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class InvoiceDocumentWhatsAppTest extends TestCase
{
    use RefreshDatabase;

    public function test_invoice_document_contains_qr_hash_and_public_verification(): void
    {
        Storage::fake('public');
        config(['app.url' => 'https://rumahkitanet.site']);

        $invoice = $this->makeInvoice();
        $generated = app(InvoiceDocumentService::class)->ensureGenerated($invoice);

        $this->assertNotEmpty($generated->document_token);
        $this->assertNotEmpty($generated->pdf_path);
        $this->assertNotEmpty($generated->pdf_hash);
        $this->assertNotEmpty($generated->signature_meta['qr'] ?? null);
        $this->assertSame('Idza Ramaulkim', $generated->signature_meta['signer'] ?? null);
        Storage::disk('public')->assertExists($generated->pdf_path);

        $this->get("/invoice-documents/{$generated->document_token}/verify")
            ->assertOk()
            ->assertSee('DOKUMEN VALID')
            ->assertSee($generated->invoice_link)
            ->assertSee('Idza Ramaulkim');

        $this->get("/invoice/{$generated->invoice_link}/print")
            ->assertOk()
            ->assertSee('QR tanda tangan digital', false)
            ->assertDontSee('CamScanner');
    }

    public function test_superadmin_can_send_invoice_pdf_through_whatsapp_gateway(): void
    {
        Storage::fake('public');
        config(['app.url' => 'https://rumahkitanet.site']);

        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $invoice = $this->makeInvoice();

        Http::fake([
            '*send-media' => Http::response([
                'success' => true,
                'message' => 'Pesan berhasil terkirim',
            ]),
        ]);

        $this->actingAs($user)
            ->postJson("/api/billing/invoice-management/{$invoice->id}/send-whatsapp")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('result.meta.media_sent', true);

        $invoice->refresh();
        $this->assertSame('sent', $invoice->whatsapp_status);
        $this->assertNotNull($invoice->whatsapp_sent_at);

        Http::assertSent(function ($request) use ($invoice): bool {
            return str_ends_with($request->url(), '/send-media')
                && $request['phone'] === $invoice->customer->phone
                && $request['filename'] === "Invoice-{$invoice->id}.pdf"
                && str_contains((string) $request['file_url'], '/invoice-documents/')
                && str_contains((string) $request['message'], $invoice->invoice_link);
        });

        $log = NotificationLog::query()
            ->where('customer_id', $invoice->customer_id)
            ->where('status', 'sent')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('invoice_pdf', $log->meta['type'] ?? null);
        $this->assertSame($invoice->id, $log->meta['invoice_id'] ?? null);
    }

    public function test_media_failure_is_reported_without_text_fallback(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $invoice = $this->makeInvoice();

        Http::fake([
            '*send-media' => Http::response(['success' => false, 'error' => 'media_failed']),
            '*' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
            ->postJson("/api/billing/invoice-management/{$invoice->id}/send-whatsapp")
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('result.error', 'media_failed');

        $this->assertSame('failed', $invoice->fresh()->whatsapp_status);
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/send'));
    }

    public function test_invalid_phone_and_non_superadmin_are_rejected(): void
    {
        Storage::fake('public');

        $invoice = $this->makeInvoice('0');
        $superadmin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $this->actingAs($superadmin)
            ->postJson("/api/billing/invoice-management/{$invoice->id}/send-whatsapp")
            ->assertStatus(422)
            ->assertJsonPath('result.error', 'no_valid_whatsapp');

        Http::assertNothingSent();

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $validInvoice = $this->makeInvoice('081234567899');

        $this->actingAs($admin)
            ->postJson("/api/billing/invoice-management/{$validInvoice->id}/send-whatsapp")
            ->assertForbidden();
    }

    public function test_document_is_regenerated_when_invoice_source_changes(): void
    {
        Storage::fake('public');

        $invoice = app(InvoiceDocumentService::class)->ensureGenerated($this->makeInvoice());
        $firstSourceHash = $invoice->signature_meta['source_hash'] ?? null;

        $invoice->update(['amount' => 275000]);
        $regenerated = app(InvoiceDocumentService::class)->ensureGenerated($invoice->fresh());

        $this->assertNotSame($firstSourceHash, $regenerated->signature_meta['source_hash'] ?? null);
        $this->assertSame(275000.0, (float) $regenerated->amount);
        Storage::disk('public')->assertExists($regenerated->pdf_path);
    }

    private function makeInvoice(string $phone = '081234567890'): Invoice
    {
        $customer = Customer::create([
            'name' => 'Pelanggan Invoice Digital',
            'phone' => $phone,
            'address' => 'Jl. Contoh Invoice',
            'package_type' => 'Paket 20 Mbps',
            'installation_fee' => 50000,
            'due_date' => now()->toDateString(),
            'is_active' => true,
        ]);

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-06-01',
            'due_date' => '2026-06-10',
            'amount' => 250000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-digital-' . $customer->id . '-' . uniqid(),
        ])->fresh('customer');
    }
}

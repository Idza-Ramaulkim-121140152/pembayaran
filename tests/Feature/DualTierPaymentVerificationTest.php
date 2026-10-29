<?php

namespace Tests\Feature;

use App\Models\BillingPaymentCapture;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\User;
use App\Services\FinancialLedgerService;
use App\Services\PaymentVerificationConfigService;
use App\Services\QrisWebhookService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DualTierPaymentVerificationTest extends TestCase
{
    use RefreshDatabase;

    private array $waWebhookHeaders = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.openai.api_key' => 'test-key']);
        putenv('WA_PAYMENT_WEBHOOK_SECRET=test-dual-secret');
        $_ENV['WA_PAYMENT_WEBHOOK_SECRET'] = 'test-dual-secret';
        $_SERVER['WA_PAYMENT_WEBHOOK_SECRET'] = 'test-dual-secret';
        $this->waWebhookHeaders = [
            'X-Webhook-Secret' => 'test-dual-secret',
        ];

        // Ensure default QRIS whitelist includes Rumah Kita Net
        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [
                    [
                        'name' => 'Rumah Kita Net',
                        'merchant_id' => 'ID1024339131558',
                        'aliases' => ['Rumah Kita Net , KALIANDA', 'Rumah Kita Network', 'COM.GO-JEK.WWW', 'GoPay', 'GoBiz'],
                        'active' => true,
                    ],
                ],
                'transfer_bank' => [],
            ],
            'notification_recipients' => [
                [
                    'id' => 'admin-auto',
                    'name' => 'Admin Dual Tier',
                    'phone' => '081111111111',
                    'is_active' => true,
                    'receive_auto_approved' => true,
                    'receive_needs_review' => true,
                ],
            ],
        ]);
    }

    public function test_jalur_2_wa_auto_approves_when_receipt_nominal_matches_dynamic_qris_expected_amount(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->createCustomerAndInvoice([
            'amount' => 150000,
            'qris_unique_code' => 264,
            'qris_expected_amount' => 150264,
        ]);

        $initialDueDate = $customer->due_date;

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 150264,
                            'paid_date' => now()->toDateString(),
                            'paid_time' => now()->format('H:i'),
                            'reference_code' => 'GOPAY-150264-XYZ',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Net',
                                'merchant_id' => 'ID1024339131558',
                                'raw' => 'Rumah Kita Net , KALIANDA',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 96,
                            'ocr_raw_text' => 'QRIS Rumah Kita Net Rp 150.264 Berhasil',
                            'raw_summary' => 'Bukti pembayaran QRIS Rp 150.264 valid',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response(['success' => true]),
        ]);

        $response = $this->withHeaders($this->waWebhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-qris-match-1',
            'sender_phone' => $customer->phone,
            'sent_at' => now()->toIso8601String(),
            'media_base64' => base64_encode('fake-qris-receipt-150264'),
            'caption' => 'Sudah bayar via QRIS',
            'mime_type' => 'image/jpeg',
        ]);

        $response->assertStatus(202);

        $capture = BillingPaymentCapture::query()->firstOrFail();
        $invoice->refresh();
        $customer->refresh();

        $this->assertSame('approved', $capture->match_status);
        $this->assertSame('paid', $invoice->status);
        $this->assertNotNull($invoice->paid_at);
        $this->assertNotNull($invoice->bukti_pembayaran);
        // Due date extended +30 days
        $expectedDueDate = Carbon::parse($initialDueDate)->addDays(30)->toDateString();
        $this->assertSame($expectedDueDate, Carbon::parse($customer->due_date)->toDateString());
    }

    public function test_jalur_2_resolves_unknown_phone_number_via_unique_qris_nominal(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->createCustomerAndInvoice([
            'amount' => 150000,
            'qris_unique_code' => 589,
            'qris_expected_amount' => 150589,
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 150589,
                            'paid_date' => now()->toDateString(),
                            'paid_time' => now()->format('H:i'),
                            'reference_code' => 'QRIS-589-UNIQUE',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Net',
                                'merchant_id' => 'ID1024339131558',
                                'raw' => 'Rumah Kita Net , KALIANDA',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 97,
                            'ocr_raw_text' => 'QRIS Rumah Kita Net Rp 150.589 Sukses',
                            'raw_summary' => 'Bukti bayar nominal unik QRIS 150.589',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response(['success' => true]),
        ]);

        // Sent from unknown phone number (e.g. husband/child not registered in database)
        $response = $this->withHeaders($this->waWebhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-unknown-sender',
            'sender_phone' => '089988776655',
            'sent_at' => now()->toIso8601String(),
            'media_base64' => base64_encode('fake-unknown-phone-receipt'),
            'caption' => '',
            'mime_type' => 'image/jpeg',
        ]);

        $response->assertStatus(202);

        $capture = BillingPaymentCapture::query()->firstOrFail();
        $invoice->refresh();

        $this->assertSame($customer->id, $capture->customer_id);
        $this->assertSame($invoice->id, $capture->invoice_id);
        $this->assertSame('approved', $capture->match_status);
        $this->assertSame('paid', $invoice->status);
    }

    public function test_jalur_2_handles_invoice_already_settled_by_jalur_1_without_double_extension(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->createCustomerAndInvoice([
            'amount' => 150000,
            'qris_unique_code' => 312,
            'qris_expected_amount' => 150312,
        ]);

        // Mock financial ledger
        $ledgerMock = $this->mock(FinancialLedgerService::class);
        $ledgerMock->shouldReceive('syncInvoicePayment')
            ->once() // Only called ONCE by Jalur 1, Jalur 2 MUST NOT call it again!
            ->andReturn(null);

        \App\Models\SiteSetting::set(\App\Services\DynamicQrisService::SETTING_WEBHOOK_SECRET, 'macrodroid-test-secret');

        // Fake WhatsApp HTTP before running Jalur 1
        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 150312,
                            'paid_date' => now()->toDateString(),
                            'paid_time' => now()->format('H:i'),
                            'reference_code' => 'REF-312',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Net',
                                'merchant_id' => 'ID1024339131558',
                                'raw' => 'Rumah Kita Net , KALIANDA',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 95,
                            'ocr_raw_text' => 'QRIS Rp 150.312 Berhasil',
                            'raw_summary' => 'Bukti QRIS',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response(['success' => true]),
        ]);

        // --- STEP 1: JALUR 1 (GoBiz push notification via MacroDroid) settles invoice first ---
        $webhookService = app(QrisWebhookService::class);
        $result = $webhookService->processWebhook([
            'title' => 'GoBiz - Pembayaran Diterima',
            'text' => 'Pembayaran sebesar Rp 150.312 berhasil diterima dari RIZKY via QRIS GoPay.',
            'device_name' => 'HP-Kasir-1',
        ], 'macrodroid-test-secret');

        $this->assertTrue($result['success']);
        $this->assertSame('settled', $result['status']);

        $invoice->refresh();
        $customer->refresh();
        $this->assertSame('paid', $invoice->status);
        $firstExtendedDueDate = Carbon::parse($customer->due_date)->toDateString();

        // --- STEP 2: JALUR 2 (Customer sends payment proof via WhatsApp 5 seconds later) ---

        $response = $this->withHeaders($this->waWebhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-backup-proof',
            'sender_phone' => $customer->phone,
            'sent_at' => now()->toIso8601String(),
            'media_base64' => base64_encode('fake-backup-screenshot'),
            'caption' => 'Ini bukti bayar saya min',
            'mime_type' => 'image/jpeg',
        ]);

        $response->assertStatus(202);

        $capture = BillingPaymentCapture::query()->firstOrFail();
        $customer->refresh();
        $invoice->refresh();

        // Capture is approved and linked to the already settled invoice
        $this->assertSame('approved', $capture->match_status);
        $this->assertSame($invoice->id, $capture->invoice_id);
        $this->assertTrue((bool) data_get($capture->meta, 'already_settled_by_primary'));
        $this->assertNotNull($invoice->bukti_pembayaran);

        // Due date MUST NOT be extended again (stays at firstExtendedDueDate, NOT +30 more days)
        $this->assertSame($firstExtendedDueDate, Carbon::parse($customer->due_date)->toDateString());
    }

    public function test_jalur_2_nominal_mismatch_is_queued_for_manual_review(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->createCustomerAndInvoice([
            'amount' => 150000,
            'qris_unique_code' => 450,
            'qris_expected_amount' => 150450,
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 50000, // WRONG AMOUNT (Rp 50.000 instead of Rp 150.450)
                            'paid_date' => now()->toDateString(),
                            'paid_time' => now()->format('H:i'),
                            'reference_code' => 'WRONG-AMT-123',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Net',
                                'merchant_id' => 'ID1024339131558',
                                'raw' => 'Rumah Kita Net , KALIANDA',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 95,
                            'ocr_raw_text' => 'QRIS Rp 50.000 Berhasil',
                            'raw_summary' => 'Bukti bayar nominal tidak cocok',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response(['success' => true]),
        ]);

        $response = $this->withHeaders($this->waWebhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-mismatch',
            'sender_phone' => $customer->phone,
            'sent_at' => now()->toIso8601String(),
            'media_base64' => base64_encode('fake-mismatch-receipt'),
            'caption' => 'bukti tf',
            'mime_type' => 'image/jpeg',
        ]);

        $response->assertStatus(202);

        $capture = BillingPaymentCapture::query()->firstOrFail();
        $invoice->refresh();

        // Must be in needs_review queue, NOT auto-approved!
        $this->assertSame('needs_review', $capture->match_status);
        $this->assertSame('amount_mismatch', data_get($capture->meta, 'validation.failure_reason'));
        $this->assertSame('unpaid', $invoice->status);
    }

    private function createCustomerAndInvoice(array $invoiceAttributes = []): array
    {
        $package = Package::create([
            'name' => 'Paket Dual Tier 20M',
            'price' => 150000,
            'speed' => '20M',
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Dual Tier',
            'phone' => '081299881122',
            'address' => 'Kalianda, Lampung Selatan',
            'package_type' => $package->name,
            'package_id' => $package->id,
            'pppoe_username' => 'CJA-dualtier',
            'due_date' => Carbon::now()->addDays(2)->toDateString(),
            'is_active' => true,
        ]);

        $defaultInvoice = [
            'customer_id' => $customer->id,
            'invoice_date' => Carbon::now()->subDays(5)->toDateString(),
            'due_date' => $customer->due_date,
            'amount' => 150000,
            'status' => 'unpaid',
            'invoice_link' => 'inv_dual_' . uniqid(),
            'qris_unique_code' => 101,
            'qris_expected_amount' => 150101,
        ];

        $invoice = Invoice::create(array_merge($defaultInvoice, $invoiceAttributes));

        return [$customer, $invoice];
    }
}

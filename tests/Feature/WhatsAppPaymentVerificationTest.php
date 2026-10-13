<?php

namespace Tests\Feature;

use App\Models\BillingPaymentCapture;
use App\Models\BillingPaymentMatchReview;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\NotificationLog;
use App\Models\User;
use App\Services\PaymentVerificationConfigService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WhatsAppPaymentVerificationTest extends TestCase
{
    use RefreshDatabase;

    private array $webhookHeaders = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.openai.api_key' => 'test-openai-key']);
        putenv('WA_PAYMENT_WEBHOOK_SECRET=test-payment-webhook-secret');
        $_ENV['WA_PAYMENT_WEBHOOK_SECRET'] = 'test-payment-webhook-secret';
        $_SERVER['WA_PAYMENT_WEBHOOK_SECRET'] = 'test-payment-webhook-secret';
        $this->webhookHeaders = [
            'X-Webhook-Secret' => 'test-payment-webhook-secret',
        ];
    }

    public function test_webhook_payment_can_auto_approve_invoice_when_analysis_and_whitelist_match(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->makeCustomerInvoice();
        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [[
                    'name' => 'Rumah Kita Network',
                    'merchant_id' => 'G141935892',
                    'aliases' => ['rumahkitanetwork', 'mabdulrohman'],
                    'active' => true,
                ]],
                'transfer_bank' => [],
            ],
            'notification_recipients' => [
                [
                    'id' => 'admin-1',
                    'name' => 'Admin Auto',
                    'phone' => '081111111111',
                    'is_active' => true,
                    'receive_auto_approved' => true,
                    'receive_needs_review' => false,
                ],
                [
                    'id' => 'admin-2',
                    'name' => 'Admin Review Only',
                    'phone' => '082222222222',
                    'is_active' => true,
                    'receive_auto_approved' => false,
                    'receive_needs_review' => true,
                ],
            ],
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 200000,
                            'paid_date' => '2026-07-01',
                            'paid_time' => '20:24',
                            'reference_code' => 'TRX-001',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Network',
                                'account_number' => null,
                                'merchant_id' => 'G141935892',
                                'raw' => 'Rumah Kita Network / G141935892',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 98,
                            'confidence_by_field' => [
                                'payment_proof' => 99,
                                'amount' => 100,
                                'date' => 97,
                                'time' => 96,
                                'destination' => 99,
                                'success_status' => 98,
                            ],
                            'ocr_raw_text' => 'QRIS Rumah Kita Network Rp200.000',
                            'raw_summary' => 'Bukti transfer QRIS valid',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response([
                'results' => [
                    ['phone' => '081111111111', 'success' => true],
                    ['phone' => $customer->phone, 'success' => true],
                ],
            ]),
        ]);

        $response = $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-001',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-07-01T20:24:00+07:00',
            'media_base64' => base64_encode('fake-image-binary'),
            'caption' => 'Bukti transfer bulan ini',
            'mime_type' => 'image/png',
        ]);

        $response->assertStatus(202)
            ->assertJsonPath('duplicate', false);

        $capture = BillingPaymentCapture::query()->firstOrFail();
        $invoice->refresh();

        $this->assertSame('approved', $capture->fresh()->match_status);
        $this->assertSame('paid', $invoice->status);
        $this->assertNotNull($invoice->paid_at);
        $this->assertNotEmpty(data_get($capture->fresh()->meta, 'analysis.raw_summary'));

        $log = NotificationLog::query()
            ->where('customer_id', $customer->id)
            ->where('meta->type', 'billing_payment_capture_customer_confirmation')
            ->first();

        $this->assertNotNull($log);
        $this->assertDatabaseHas('notification_logs', [
            'phone' => '081111111111',
            'status' => 'sent',
        ]);
        $this->assertDatabaseMissing('notification_logs', [
            'phone' => '082222222222',
            'status' => 'sent',
        ]);
    }

    public function test_webhook_payment_with_amount_mismatch_is_sent_to_manual_review(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->makeCustomerInvoice();
        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [[
                    'name' => 'Rumah Kita Network',
                    'merchant_id' => 'G141935892',
                    'aliases' => [],
                    'active' => true,
                ]],
                'transfer_bank' => [],
            ],
            'notification_recipients' => [
                [
                    'id' => 'review-1',
                    'name' => 'Review Admin',
                    'phone' => '083333333333',
                    'is_active' => true,
                    'receive_auto_approved' => false,
                    'receive_needs_review' => true,
                ],
            ],
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 175000,
                            'paid_date' => '2026-07-01',
                            'paid_time' => '20:24',
                            'reference_code' => 'TRX-002',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Network',
                                'account_number' => null,
                                'merchant_id' => 'G141935892',
                                'raw' => 'Rumah Kita Network / G141935892',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 97,
                            'confidence_by_field' => [
                                'payment_proof' => 99,
                                'amount' => 99,
                                'date' => 97,
                                'time' => 96,
                                'destination' => 99,
                                'success_status' => 98,
                            ],
                            'ocr_raw_text' => 'QRIS Rumah Kita Network Rp175.000',
                            'raw_summary' => 'Nominal berbeda',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response([
                'results' => [
                    ['phone' => '083333333333', 'success' => true],
                ],
            ]),
        ]);

        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-002',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-07-01T20:24:00+07:00',
            'media_base64' => base64_encode('fake-image-binary-2'),
            'caption' => 'Bukti transfer nominal beda',
            'mime_type' => 'image/png',
        ])->assertStatus(202);

        $capture = BillingPaymentCapture::query()->firstOrFail();
        $invoice->refresh();

        $this->assertSame('needs_review', $capture->match_status);
        $this->assertSame('amount_mismatch', data_get($capture->meta, 'validation.failure_reason'));
        $this->assertSame('unpaid', $invoice->status);
        $this->assertNull($invoice->paid_at);
        $this->assertDatabaseHas('notification_logs', [
            'phone' => '083333333333',
            'status' => 'sent',
        ]);
    }

    public function test_superadmin_can_manually_resolve_capture_and_receive_analysis_summary(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        [$customer, $invoice] = $this->makeCustomerInvoice();

        $capture = BillingPaymentCapture::query()->create([
            'source' => 'whatsapp_webhook',
            'invoice_id' => $invoice->id,
            'customer_id' => $customer->id,
            'amount' => 200000,
            'paid_date' => '2026-07-01',
            'reference_code' => 'TRX-003',
            'fingerprint' => 'capture-manual-003',
            'match_status' => 'needs_review',
            'match_confidence' => 88,
            'meta' => [
                'sender_phone' => $customer->phone,
                'analysis' => [
                    'raw_summary' => 'Perlu review manual',
                    'payment_channel' => 'QRIS',
                ],
                'validation' => [
                    'failure_reason' => 'confidence_needs_review',
                ],
            ],
        ]);

        BillingPaymentMatchReview::query()->create([
            'capture_id' => $capture->id,
            'candidate_invoice_id' => $invoice->id,
            'score' => 98,
            'reason' => 'amount_exact,customer_match,invoice_hint',
            'status' => 'candidate',
        ]);

        $this->actingAs($user)
            ->postJson("/api/billing/payments/{$capture->id}/resolve", [
                'decision' => 'approve',
                'candidate_invoice_id' => $invoice->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.match_status', 'approved')
            ->assertJsonPath('data.analysis.raw_summary', 'Perlu review manual')
            ->assertJsonPath('data.failure_reason', 'confidence_needs_review');

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
    }

    public function test_superadmin_can_update_notification_recipients_config(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $this->actingAs($user)
            ->putJson('/api/billing/payment-verification/config', [
                'notification_recipients' => [
                    [
                        'name' => 'Admin Satu',
                        'phone' => '+62 811-1111-1111',
                        'is_active' => true,
                        'receive_auto_approved' => true,
                        'receive_needs_review' => false,
                    ],
                    [
                        'name' => 'Admin Dua',
                        'phone' => '082222222222',
                        'is_active' => false,
                        'receive_auto_approved' => false,
                        'receive_needs_review' => true,
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.notification_recipients.0.phone', '081111111111')
            ->assertJsonPath('data.notification_recipients.1.is_active', false);
    }

    public function test_notification_recipient_config_rejects_duplicate_or_invalid_numbers(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $this->actingAs($user)
            ->putJson('/api/billing/payment-verification/config', [
                'notification_recipients' => [
                    [
                        'name' => 'Admin Satu',
                        'phone' => '081111111111',
                        'is_active' => true,
                        'receive_auto_approved' => true,
                        'receive_needs_review' => false,
                    ],
                    [
                        'name' => 'Admin Duplikat',
                        'phone' => '081111111111',
                        'is_active' => true,
                        'receive_auto_approved' => false,
                        'receive_needs_review' => true,
                    ],
                ],
            ])
            ->assertStatus(422);

        $this->actingAs($user)
            ->putJson('/api/billing/payment-verification/config', [
                'notification_recipients' => [
                    [
                        'name' => 'Admin Invalid',
                        'phone' => '123',
                        'is_active' => true,
                        'receive_auto_approved' => true,
                        'receive_needs_review' => false,
                    ],
                ],
            ])
            ->assertStatus(422);
    }

    public function test_technician_cannot_update_notification_recipients_config(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_TEKNISI]);

        $this->actingAs($user)
            ->putJson('/api/billing/payment-verification/config', [
                'notification_recipients' => [
                    [
                        'name' => 'Blocked User',
                        'phone' => '081234567891',
                        'is_active' => true,
                        'receive_auto_approved' => true,
                        'receive_needs_review' => false,
                    ],
                ],
            ])
            ->assertForbidden();
    }

    public function test_auto_approved_notification_is_skipped_when_no_recipient_setting_exists(): void
    {
        Storage::fake('public');

        [$customer] = $this->makeCustomerInvoice();
        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [[
                    'name' => 'Rumah Kita Network',
                    'merchant_id' => 'G141935892',
                    'aliases' => ['rumahkitanetwork'],
                    'active' => true,
                ]],
                'transfer_bank' => [],
            ],
            'notification_recipients' => [],
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 200000,
                            'paid_date' => '2026-07-01',
                            'paid_time' => '20:24',
                            'reference_code' => 'TRX-004',
                            'payment_channel' => 'QRIS',
                            'destination_identity' => [
                                'name' => 'Rumah Kita Network',
                                'account_number' => null,
                                'merchant_id' => 'G141935892',
                                'raw' => 'Rumah Kita Network / G141935892',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 98,
                            'confidence_by_field' => [
                                'payment_proof' => 99,
                                'amount' => 100,
                                'date' => 97,
                                'time' => 96,
                                'destination' => 99,
                                'success_status' => 98,
                            ],
                            'ocr_raw_text' => 'QRIS Rumah Kita Network Rp200.000',
                            'raw_summary' => 'Bukti transfer QRIS valid',
                        ]),
                    ],
                ]],
            ]),
            '*send-bulk' => Http::response([
                'results' => [[
                    'phone' => $customer->phone,
                    'success' => true,
                ]],
            ]),
        ]);

        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-004',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-07-01T20:24:00+07:00',
            'media_base64' => base64_encode('fake-image-binary-4'),
            'caption' => 'Bukti transfer tanpa admin',
            'mime_type' => 'image/png',
        ])->assertStatus(202);

        $this->assertDatabaseHas('notification_logs', [
            'phone' => null,
            'status' => 'skipped',
        ]);
    }

    public function test_duplicate_reference_code_from_receipt_is_flagged_and_prevents_auto_approval(): void
    {
        Storage::fake('public');

        [$customer1, $invoice1] = $this->makeCustomerInvoice();
        [$customer2, $invoice2] = $this->makeCustomerInvoice();

        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [[
                    'name' => 'Rumah Kita Network',
                    'merchant_id' => 'G141935892',
                    'aliases' => ['rumahkitanetwork'],
                    'active' => true,
                ]],
                'transfer_bank' => [],
            ],
        ]);

        $realTrxId = '202610120725091234';

        Http::fake([
            'https://generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [[
                            'text' => json_encode([
                                'is_payment_proof' => true,
                                'amount' => 200000,
                                'paid_date' => '2026-07-01',
                                'paid_time' => '10:15:00',
                                'reference_code' => $realTrxId,
                                'payment_channel' => 'QRIS',
                                'destination_identity' => [
                                    'name' => 'Rumah Kita Network',
                                    'merchant_id' => 'G141935892',
                                ],
                                'success_status' => true,
                                'confidence_overall' => 95,
                                'confidence_by_field' => [
                                    'payment_proof' => 95,
                                    'amount' => 95,
                                    'date' => 95,
                                    'time' => 95,
                                    'destination' => 95,
                                    'success_status' => 95,
                                ],
                            ]),
                        ]],
                    ],
                ]],
            ]),
        ]);

        // First payment for customer 1
        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-first',
            'sender_phone' => $customer1->phone,
            'sent_at' => '2026-07-01T10:15:00+07:00',
            'media_base64' => base64_encode('fake-image-first'),
            'caption' => 'Pembayaran tagihan 1',
            'mime_type' => 'image/png',
        ])->assertStatus(202);

        $capture1 = BillingPaymentCapture::latest('id')->first();
        $this->assertSame('approved', $capture1->match_status);
        $this->assertSame($realTrxId, $capture1->reference_code);
        $this->assertSame('paid', $invoice1->fresh()->status);
        $this->assertSame($realTrxId, $invoice1->fresh()->qris_transaction_number);

        // Fraudulent reuse of the same receipt transaction ID for customer 2
        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-second-fraud',
            'sender_phone' => $customer2->phone,
            'sent_at' => '2026-07-01T11:00:00+07:00',
            'media_base64' => base64_encode('fake-image-second'),
            'caption' => 'Pembayaran tagihan 2 pakai bukti yang sama',
            'mime_type' => 'image/png',
        ])->assertStatus(202);

        $capture2 = BillingPaymentCapture::latest('id')->first();
        $this->assertNotSame('approved', $capture2->match_status);
        $this->assertSame('needs_review', $capture2->match_status);
        $this->assertSame('duplicate_reference_code', data_get($capture2->meta, 'validation.failure_reason'));
        $this->assertSame('unpaid', $invoice2->fresh()->status);
    }

    public function test_reference_code_never_defaults_to_system_invoice_link(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->makeCustomerInvoice();

        // AI returns no reference_code on the receipt
        Http::fake([
            'https://generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [[
                            'text' => json_encode([
                                'is_payment_proof' => true,
                                'amount' => 200000,
                                'paid_date' => '2026-07-01',
                                'paid_time' => '10:15:00',
                                'reference_code' => null,
                                'payment_channel' => 'QRIS',
                                'destination_identity' => [
                                    'name' => 'Rumah Kita Network',
                                    'merchant_id' => 'G141935892',
                                ],
                                'success_status' => true,
                                'confidence_overall' => 90,
                                'confidence_by_field' => [
                                    'payment_proof' => 90,
                                    'amount' => 90,
                                    'date' => 90,
                                    'time' => 90,
                                    'destination' => 90,
                                    'success_status' => 90,
                                ],
                            ]),
                        ]],
                    ],
                ]],
            ]),
        ]);

        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-no-ref',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-07-01T10:15:00+07:00',
            'media_base64' => base64_encode('fake-image-no-ref'),
            'caption' => 'Bukti bayar',
            'mime_type' => 'image/png',
        ])->assertStatus(202);

        $capture = BillingPaymentCapture::latest('id')->first();
        $this->assertNull($capture->reference_code);
        $this->assertNotSame($invoice->invoice_link, $capture->reference_code);
    }

    public function test_webhook_accepts_image_jpg_and_normalizes_it(): void
    {
        Storage::fake('public');
        [$customer, $invoice] = $this->makeCustomerInvoice();

        $response = $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-jpg-test',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-07-01T10:15:00+07:00',
            'media_base64' => base64_encode('fake-jpg-binary'),
            'caption' => 'Bukti JPG',
            'mime_type' => 'image/jpg; charset=binary',
        ]);

        $response->assertStatus(202);
        $capture = BillingPaymentCapture::latest('id')->first();
        $this->assertNotNull($capture);
        $this->assertSame('image/jpeg', data_get($capture->meta, 'source.mime_type'));
    }

    public function test_webhook_payment_resolves_customer_by_sender_name_on_receipt(): void
    {
        Storage::fake('public');
        $customer = Customer::create([
            'name' => 'Saripudin',
            'phone' => '089999999999', // Different phone from sender phone!
            'address' => 'Kalianda',
            'due_date' => '2026-07-10',
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-07-01',
            'due_date' => '2026-07-10',
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-saripudin-' . uniqid(),
        ]);

        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [[
                    'name' => 'Rumah Kita Network',
                    'merchant_id' => 'G141935892',
                    'aliases' => ['rumahkitanetwork'],
                    'active' => true,
                ]],
                'transfer_bank' => [],
            ],
        ]);

        Http::fake([
            'https://generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [[
                            'text' => json_encode([
                                'is_payment_proof' => true,
                                'amount' => 200000,
                                'paid_date' => '2026-07-01',
                                'paid_time' => '11:36:00',
                                'reference_code' => '011000MCWV7G',
                                'payment_channel' => 'QRIS',
                                'sender_name' => 'Saripudin',
                                'destination_identity' => [
                                    'name' => 'Rumah Kita Network',
                                    'merchant_id' => 'G141935892',
                                ],
                                'success_status' => true,
                                'confidence_overall' => 95,
                                'confidence_by_field' => [
                                    'payment_proof' => 95,
                                    'amount' => 95,
                                    'date' => 95,
                                    'time' => 95,
                                    'destination' => 95,
                                    'success_status' => 95,
                                ],
                            ]),
                        ]],
                    ],
                ]],
            ]),
        ]);

        // Incoming message from family/different phone +62 821-9045-4546
        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-saripudin-01',
            'sender_phone' => '+62 821-9045-4546',
            'sent_at' => '2026-07-01T11:36:00+07:00',
            'media_base64' => base64_encode('fake-seabank-saripudin'),
            'caption' => 'Saya telah berhasil mengirimkan Rp200.000 ke rekening kamu melalui SeaBank.',
            'mime_type' => 'image/jpeg',
        ])->assertStatus(202);

        $capture = BillingPaymentCapture::latest('id')->first();
        $this->assertSame($customer->id, $capture->customer_id);
        $this->assertSame('approved', $capture->match_status);
        $this->assertSame('paid', $invoice->fresh()->status);
    }

    public function test_captures_query_with_needs_review_includes_pending_captures(): void
    {
        Storage::fake('public');
        $customer = Customer::create([
            'name' => 'Pending Customer',
            'phone' => '087777777777',
            'address' => 'Test',
            'due_date' => '2026-07-10',
            'is_active' => true,
        ]);

        $capture = BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'amount' => 200000,
            'paid_date' => '2026-07-01',
            'fingerprint' => 'test-pending-fp',
            'match_status' => 'pending',
        ]);

        $matchingService = app(\App\Services\PaymentMatchingService::class);
        $list = $matchingService->captures(['status' => 'needs_review']);

        $this->assertTrue(collect($list->items())->contains('id', $capture->id));
    }

    private function makeCustomerInvoice(): array
    {
        $customer = Customer::create([
            'name' => 'Pelanggan WA AI',
            'phone' => '081234567890',
            'address' => 'Jl. Pembayaran AI',
            'package_type' => 'Paket 20 Mbps',
            'due_date' => '2026-07-10',
            'is_active' => true,
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-07-01',
            'due_date' => '2026-07-10',
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'inv-wa-ai-' . uniqid(),
        ]);

        return [$customer, $invoice];
    }
}

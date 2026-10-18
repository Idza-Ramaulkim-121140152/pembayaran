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
        $this->assertSame('rejected', $capture2->match_status);
        $this->assertTrue((bool) data_get($capture2->meta, 'duplicate_receipt_detected'));
        $this->assertSame('Bukti bayar sudah pernah digunakan', data_get($capture2->meta, 'duplicate_label'));
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

    public function test_seabank_receipt_pattern_extracts_correct_date_time_ref_and_sender(): void
    {
        $service = app(\App\Services\PaymentProofAnalysisService::class);
        $reflection = new \ReflectionClass($service);
        $method = $reflection->getMethod('parseReceiptPatterns');
        $method->setAccessible(true);

        $receiptText = "SeaBank\nTransfer Berhasil\nRp 200.000\nDari: Saripudin (SeaBank: ********2719)\nKe: Rumah Kita Net , KALIANDA\nLAMPUNG SELATAN\nNama Acquirer: GoPay\n9360-0914-3848-8266-793\nNo. Transaksi: 2026101343509824805187146\nNo. Referensi: 011000MCWV7G\nMetode Transaksi: QRIS\nWaktu Transaksi: 13 Okt 2026, 11:36";

        $parsed = $method->invoke($service, $receiptText);

        $this->assertEquals('2026-10-13', $parsed['paid_date']);
        $this->assertEquals('11:36:00', $parsed['paid_time']);
        $this->assertEquals('2026101343509824805187146', $parsed['reference_code']);
        $this->assertEquals('Saripudin', $parsed['sender_name']);
        $this->assertContains($parsed['payment_channel'], ['QRIS', 'SeaBank']);
        $this->assertEquals(200000, $parsed['amount']);
        $this->assertTrue($parsed['success_status']);
    }

    public function test_receipt_without_time_does_not_fabricate_fake_current_time(): void
    {
        $service = app(\App\Services\PaymentProofAnalysisService::class);
        $reflection = new \ReflectionClass($service);
        $method = $reflection->getMethod('parseReceiptPatterns');
        $method->setAccessible(true);

        $receiptText = "Transfer Berhasil\nRp 150.000\n13 Okt 2026\nDari: Budi";

        $parsed = $method->invoke($service, $receiptText);

        $this->assertEquals('2026-10-13', $parsed['paid_date']);
        $this->assertNull($parsed['paid_time'], 'paid_time must be null and never fabricated when missing from receipt');
    }

    public function test_presenter_formats_receipt_time_display_with_wib(): void
    {
        $capture = new BillingPaymentCapture([
            'id' => 99,
            'source' => 'whatsapp_webhook',
            'amount' => 200000,
            'paid_date' => '2026-10-13',
            'match_status' => 'approved',
            'meta' => [
                'analysis' => [
                    'paid_date' => '2026-10-13',
                    'paid_time' => '11:36:00',
                ],
            ],
        ]);

        $presenter = app(\App\Services\BillingPaymentCapturePresenter::class);
        $data = $presenter->present($capture);

        $this->assertEquals('11:36:00', $data['paid_time']);
        $this->assertEquals('11:36 WIB', $data['paid_time_display']);
        $this->assertStringContainsString('11:36 WIB', $data['receipt_time_display']);
    }

    public function test_customer_resolution_by_whatsapp_lid_and_push_name(): void
    {
        $customer = Customer::create([
            'name' => 'Saripudin',
            'phone' => '085712345678',
            'address' => 'Desa Makmur',
            'package_type' => 'Paket 15 Mbps',
            'due_date' => '2026-10-15',
            'is_active' => true,
        ]);

        $resolver = app(\App\Services\CustomerResolutionService::class);

        // 1. Resolve by Push Name
        $matchedByName = $resolver->findCustomerByName('Saripudin');
        $this->assertNotNull($matchedByName);
        $this->assertEquals($customer->id, $matchedByName->id);

        // 2. Remember and resolve by WhatsApp LID
        $lid = '170339074089196';
        $resolver->rememberCustomerLid($customer->id, $lid);

        $matchedByLid = $resolver->findCustomerByLid($lid);
        $this->assertNotNull($matchedByLid);
        $this->assertEquals($customer->id, $matchedByLid->id);

        // Also works with '0' prefix added by gateway
        $matchedByPrefixedLid = $resolver->findCustomerByLid('0' . $lid);
        $this->assertNotNull($matchedByPrefixedLid);
        $this->assertEquals($customer->id, $matchedByPrefixedLid->id);
    }

    public function test_assign_customer_remembers_lid_mapping(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $customer = Customer::create([
            'name' => 'Pak Rama',
            'phone' => '081299887766',
            'address' => 'Jl. Mawar',
            'is_active' => true,
        ]);

        $capture = BillingPaymentCapture::create([
            'source' => 'whatsapp_webhook',
            'amount' => 150000,
            'paid_date' => '2026-10-13',
            'fingerprint' => 'test-fp-' . uniqid(),
            'match_status' => 'needs_review',
            'meta' => [
                'sender_phone' => '013524902346818',
                'sender_lid' => '13524902346818',
            ],
        ]);

        $response = $this->actingAs($admin)->postJson("/api/billing/payments/{$capture->id}/assign-customer", [
            'customer_id' => $customer->id,
        ]);

        $response->assertOk();
        $this->assertEquals($customer->id, $capture->fresh()->customer_id);

        // Verify LID was remembered
        $resolver = app(\App\Services\CustomerResolutionService::class);
        $found = $resolver->findCustomerByLid('13524902346818');
        $this->assertNotNull($found);
        $this->assertEquals($customer->id, $found->id);
    }

    public function test_webhook_payment_with_wrong_destination_account_is_sent_to_manual_review_even_if_amount_matches(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->makeCustomerInvoice();
        $invoice->update(['amount' => 250000]);

        // Whitelist only company account: IDZA RAMAULKIM (BRI)
        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [],
                'transfer_bank' => [[
                    'name' => 'IDZA RAMAULKIM',
                    'account_number' => '581001000036562',
                    'aliases' => ['idza', 'ramaulkim'],
                    'active' => true,
                ]],
            ],
            'notification_recipients' => [
                [
                    'id' => 'review-admin-1',
                    'name' => 'Admin Review',
                    'phone' => '083333333333',
                    'is_active' => true,
                    'receive_auto_approved' => false,
                    'receive_needs_review' => true,
                ],
            ],
        ]);

        // Customer uploads a transfer receipt sent to an UNREGISTERED person (M ABDUL ROHMAN, BNI)
        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => true,
                            'amount' => 250000,
                            'paid_date' => '2026-10-15',
                            'paid_time' => '09:17:13',
                            'reference_code' => 'BNI-998877',
                            'payment_channel' => 'BNI',
                            'sender_name' => 'Nazarudin',
                            'destination_identity' => [
                                'name' => 'M ABDUL ROHMAN',
                                'account_number' => '0847566563',
                                'merchant_id' => null,
                                'raw' => 'BNI 0847566563 M ABDUL ROHMAN',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 95,
                            'confidence_by_field' => [
                                'payment_proof' => 99,
                                'amount' => 99,
                                'date' => 95,
                                'time' => 95,
                                'destination' => 95,
                                'success_status' => 99,
                            ],
                            'ocr_raw_text' => 'Transfer Berhasil ke BNI 0847566563 M ABDUL ROHMAN Rp 250.000',
                            'raw_summary' => 'Transfer ke rekening tidak terdaftar',
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
            'message_id' => 'wa-msg-wrong-dest',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-10-15T09:17:13+07:00',
            'media_base64' => base64_encode('fake-wrong-dest-receipt'),
            'caption' => 'Ini bukti bayar',
            'mime_type' => 'image/jpeg',
        ])->assertStatus(202);

        $capture = BillingPaymentCapture::query()->where('source', 'whatsapp_webhook')->latest('id')->firstOrFail();
        $invoice->refresh();

        // Must NOT be auto-approved!
        $this->assertSame('needs_review', $capture->match_status);
        $this->assertSame('destination_not_whitelisted', data_get($capture->meta, 'validation.failure_reason'));
        $this->assertFalse((bool) data_get($capture->meta, 'validation.flags.destination_whitelisted'));
        $this->assertSame('unpaid', $invoice->status);
        $this->assertNull($invoice->paid_at);

        // No confirmation should be sent to customer
        $customerLog = NotificationLog::query()
            ->where('customer_id', $customer->id)
            ->where('meta->type', 'billing_payment_capture_customer_confirmation')
            ->first();
        $this->assertNull($customerLog);
    }

    public function test_payment_auto_approval_sends_only_one_message_and_records_correct_sender_and_time(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->makeCustomerInvoice();
        $invoice->update(['amount' => 200000]);

        app(PaymentVerificationConfigService::class)->updateConfig([
            'destination_whitelist' => [
                'qris' => [],
                'transfer_bank' => [[
                    'name' => 'IDZA RAMAULKIM',
                    'account_number' => '581001000036562',
                    'aliases' => ['idza', 'ramaulkim'],
                    'active' => true,
                ]],
            ],
            'notification_recipients' => [
                [
                    'id' => 'auto-admin-1',
                    'name' => 'Admin Auto',
                    'phone' => '081111111111',
                    'is_active' => true,
                    'receive_auto_approved' => true,
                    'receive_needs_review' => false,
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
                            'paid_date' => '2026-10-15',
                            'paid_time' => '09:17:13',
                            'reference_code' => 'BRI-REF-12345',
                            'payment_channel' => 'BRI',
                            'sender_name' => 'Saripudin',
                            'destination_identity' => [
                                'name' => 'IDZA RAMAULKIM',
                                'account_number' => '581001000036562',
                                'merchant_id' => null,
                                'raw' => 'BRI 581001000036562 IDZA RAMAULKIM',
                            ],
                            'success_status' => true,
                            'confidence_overall' => 96,
                            'confidence_by_field' => [
                                'payment_proof' => 99,
                                'amount' => 99,
                                'date' => 95,
                                'time' => 95,
                                'destination' => 98,
                                'success_status' => 99,
                            ],
                            'ocr_raw_text' => 'Transfer Sukses BRI 581001000036562 IDZA RAMAULKIM Pengirim: Saripudin Rp 200.000',
                            'raw_summary' => 'Transfer sukses ke rekening perusahaan',
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

        $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-single-test',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-10-15T09:17:13+07:00',
            'media_base64' => base64_encode('fake-valid-receipt'),
            'caption' => 'Sudah bayar',
            'mime_type' => 'image/jpeg',
        ])->assertStatus(202);

        $capture = BillingPaymentCapture::query()->where('source', 'whatsapp_webhook')->latest('id')->firstOrFail();
        $invoice->refresh();

        $this->assertSame('approved', $capture->match_status);
        $this->assertSame('paid', $invoice->status);

        // Verify sender name is 'Saripudin' (NOT recipient 'IDZA RAMAULKIM')
        $this->assertSame('Saripudin', $invoice->qris_sender);

        // Verify paid_at timestamp: 09:17:13 WIB corresponds to 02:17:13 UTC
        $this->assertSame('02:17:13', $invoice->paid_at->format('H:i:s'));

        // Verify exactly ONE customer notification log was created (no duplicates)
        $customerLogsCount = NotificationLog::query()
            ->where('customer_id', $customer->id)
            ->where('meta->type', 'billing_payment_capture_customer_confirmation')
            ->count();
        $this->assertSame(1, $customerLogsCount);

        // Verify exactly ONE admin notification log was created
        $adminLogsCount = NotificationLog::query()
            ->where('phone', '081111111111')
            ->where('meta->type', 'billing_payment_capture_auto_approved')
            ->count();
        $this->assertSame(1, $adminLogsCount);
    }

    public function test_admin_review_message_contains_direct_review_link(): void
    {
        [$customer, $invoice] = $this->makeCustomerInvoice();

        $capture = BillingPaymentCapture::query()->create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
            'amount' => 150000,
            'paid_date' => '2026-10-18',
            'match_status' => 'needs_review',
            'match_confidence' => 65.5,
            'fingerprint' => 'test-fp-review-link',
            'meta' => [
                'sender_phone' => '081234567890',
                'validation' => [
                    'failure_reason' => 'amount_mismatch',
                ],
            ],
        ]);

        $notificationService = app(\App\Services\PaymentCaptureNotificationService::class);
        $reflection = new \ReflectionClass($notificationService);
        $method = $reflection->getMethod('buildAdminReviewMessage');
        $method->setAccessible(true);

        $message = $method->invoke($notificationService, $capture);

        $this->assertStringContainsString("Capture ID: {$capture->id}", $message);
        $this->assertStringContainsString("/settings/payment-verification?review_id={$capture->id}", $message);
        $this->assertStringContainsString('Konfirmasi / Review Bukti Bayar', $message);
    }

    public function test_can_get_single_payment_capture_api(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        [$customer, $invoice] = $this->makeCustomerInvoice();

        $capture = BillingPaymentCapture::query()->create([
            'source' => 'whatsapp_webhook',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
            'amount' => 200000,
            'paid_date' => '2026-10-18',
            'match_status' => 'needs_review',
            'match_confidence' => 85.0,
            'fingerprint' => 'test-fp-get-single',
            'meta' => [
                'sender_phone' => '081234567890',
            ],
        ]);

        $response = $this->actingAs($admin)->getJson("/api/billing/payments/{$capture->id}");

        $response->assertOk()
            ->assertJsonPath('data.id', $capture->id)
            ->assertJsonPath('data.amount', 200000)
            ->assertJsonPath('data.customer.id', $customer->id);
    }

    public function test_incoming_non_payment_proof_photo_is_discarded_and_not_saved_nor_notified(): void
    {
        Storage::fake('public');

        [$customer, $invoice] = $this->makeCustomerInvoice();

        app(PaymentVerificationConfigService::class)->updateConfig([
            'notification_recipients' => [
                [
                    'id' => 'admin-review',
                    'name' => 'Admin Review',
                    'phone' => '082222222222',
                    'is_active' => true,
                    'receive_auto_approved' => true,
                    'receive_needs_review' => true,
                ],
            ],
        ]);

        // Customer sends a photo of broken cables / street / speedtest / complaint
        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_proof' => false,
                            'amount' => null,
                            'paid_date' => null,
                            'paid_time' => null,
                            'reference_code' => null,
                            'payment_channel' => null,
                            'sender_name' => null,
                            'destination_identity' => [
                                'name' => null,
                                'account_number' => null,
                                'merchant_id' => null,
                                'raw' => null,
                            ],
                            'success_status' => false,
                            'confidence_overall' => 0,
                            'ocr_raw_text' => 'Kabel fiber putus di depan jalan mawar',
                            'raw_summary' => 'Bukan bukti pembayaran (foto kabel putus / keluhan gangguan)',
                        ]),
                    ],
                ]],
            ]),
        ]);

        $response = $this->withHeaders($this->webhookHeaders)->postJson('/api/whatsapp/webhooks/payments', [
            'message_id' => 'wa-msg-non-receipt',
            'sender_phone' => $customer->phone,
            'sent_at' => '2026-10-18T08:00:00+07:00',
            'media_base64' => base64_encode('fake-image-cable-broken'),
            'caption' => 'Pak tolong internet saya mati kabel putus ketabrak truk',
            'mime_type' => 'image/jpeg',
        ]);

        $response->assertStatus(202);

        // Capture record MUST be deleted and completely absent from database
        $this->assertDatabaseMissing('billing_payment_captures', [
            'fingerprint' => sha1('wa-msg-non-receipt|' . $customer->phone . '||' . substr(base64_encode('fake-image-cable-broken'), 0, 120)),
        ]);
        $this->assertSame(0, BillingPaymentCapture::query()->count());

        // Storage file must also be cleaned up
        $files = Storage::disk('public')->allFiles('payment-captures');
        $this->assertEmpty($files);

        // No notification should be sent to admin
        $adminReviewLog = NotificationLog::query()
            ->where('phone', '082222222222')
            ->where('meta->type', 'billing_payment_capture_admin_review')
            ->first();
        $this->assertNull($adminReviewLog);
    }

    public function test_local_heuristics_detects_non_receipt_text_as_not_payment_proof(): void
    {
        $service = app(\App\Services\PaymentProofAnalysisService::class);
        $reflection = new \ReflectionClass($service);
        $method = $reflection->getMethod('parseReceiptPatterns');
        $method->setAccessible(true);

        $speedtestText = "Speedtest by Ookla\nPing 12 ms Jitter 2 ms\nDownload 25.4 Mbps\nUpload 10.2 Mbps";
        $parsed = $method->invoke($service, $speedtestText);
        $this->assertFalse($parsed['is_payment_proof']);

        $cableComplaintText = "Pak kabel putus di tiang depan rumah lampu los merah menyala tolong teknisi";
        $parsedComplaint = $method->invoke($service, $cableComplaintText);
        $this->assertFalse($parsedComplaint['is_payment_proof']);
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

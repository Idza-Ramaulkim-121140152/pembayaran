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

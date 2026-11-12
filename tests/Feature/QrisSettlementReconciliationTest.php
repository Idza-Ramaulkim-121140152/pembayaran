<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\PaymentReceiptOption;
use App\Models\QrisDailyReconciliation;
use App\Models\QrisSettlement;
use App\Models\ReconciliationIssue;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\DynamicQrisService;
use App\Services\ExecutiveDailyReportService;
use App\Services\FinancialLedgerService;
use App\Services\QrisSettlementReconciliationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class QrisSettlementReconciliationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'valid-secret');

        Http::fake([
            '*/send-bulk' => Http::response(['success' => true, 'sent' => 1, 'results' => [['phone' => '081111111111', 'success' => true]]], 200),
            '*/send' => Http::response(['success' => true], 200),
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_gopay_merchant_completed_payout_webhook_records_settlement_without_settling_unpaid_invoice(): void
    {
        $package = Package::create(['name' => 'Paket 20M', 'price' => 350000, 'speed' => '20M']);
        $customer = Customer::create([
            'name' => 'Pelanggan Terisolir',
            'phone' => '08123450001',
            'package_id' => $package->id,
            'status' => 'active',
            'is_service_isolated' => true,
            'due_date' => now()->subDay(),
        ]);

        $unpaidInvoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-SAME-AMT-350469',
            'amount' => 350000,
            'qris_unique_code' => 469,
            'qris_expected_amount' => 350469,
            'status' => 'unpaid',
            'invoice_date' => now(),
            'due_date' => now(),
        ]);

        $response = $this->postJson('/api/qris/webhook', [
            'title' => 'Pencairan dana berhasil',
            'text' => 'Proses pencairan dana sebesar Rp350.469 telah selesai. Silakan cek akun bank Anda.',
            'device_name' => 'HP-Admin-Utama',
            'occurred_at' => '2026-11-12 06:37:00',
        ], ['X-QRIS-SECRET' => 'valid-secret']);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'status' => 'settlement_recorded',
                'amount' => 350469,
            ]);

        // Tagihan pelanggan TIDAK boleh ikut lunas oleh notifikasi pencairan GoPay
        $this->assertSame('unpaid', $unpaidInvoice->fresh()->status);
        $this->assertNull($unpaidInvoice->fresh()->paid_at);
        $this->assertTrue((bool) $customer->fresh()->is_service_isolated);

        $settlement = QrisSettlement::query()->firstOrFail();
        $this->assertSame('2026-11-12', Carbon::parse($settlement->cycle_date)->toDateString());
        $this->assertSame(350469.0, (float) $settlement->amount);
        $this->assertSame(QrisSettlement::TYPE_MANUAL, $settlement->settlement_type);
        $this->assertSame(QrisSettlement::SOURCE_WEBHOOK, $settlement->source);
    }

    public function test_multi_device_duplicate_payout_notifications_are_deduplicated(): void
    {
        Carbon::setTestNow(Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 06:37:00', 'Asia/Jakarta'));

        $payload = [
            'title' => 'Pencairan dana berhasil',
            'text' => 'Proses pencairan dana sebesar Rp350.469 telah selesai. Silakan cek akun bank Anda.',
            'device_name' => 'HP-Kasir-1',
        ];

        $first = $this->postJson('/api/qris/webhook', $payload, ['X-QRIS-SECRET' => 'valid-secret']);
        $first->assertStatus(200)->assertJson(['status' => 'settlement_recorded']);

        $payloadSecondPhone = array_merge($payload, ['device_name' => 'HP-Owner-2']);
        $second = $this->postJson('/api/qris/webhook', $payloadSecondPhone, ['X-QRIS-SECRET' => 'valid-secret']);
        $second->assertStatus(200)->assertJson(['status' => 'settlement_duplicate_ignored']);

        $this->assertSame(1, QrisSettlement::query()->count());
        $this->assertSame(350469.0, (float) QrisSettlement::query()->sum('amount'));
    }

    public function test_cumulative_manual_early_and_auto_2100_payouts_reconcile_matched_across_cutoff_window(): void
    {
        Carbon::setTestNow(Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:15:00', 'Asia/Jakarta'));

        $qrisOption = PaymentReceiptOption::create(['name' => 'QRIS - Admin Finance', 'is_active' => true]);
        $briOption = PaymentReceiptOption::create(['name' => 'BRI - Admin Finance', 'is_active' => true]);
        $package = Package::create(['name' => 'Paket Home', 'price' => 200000, 'speed' => '20M']);

        $custA = Customer::create(['name' => 'Wagino', 'phone' => '08110001', 'package_id' => $package->id, 'status' => 'active']);
        $custB = Customer::create(['name' => 'Anwar', 'phone' => '08110002', 'package_id' => $package->id, 'status' => 'active']);
        $custC = Customer::create(['name' => 'Late Night', 'phone' => '08110003', 'package_id' => $package->id, 'status' => 'active']);
        $custD = Customer::create(['name' => 'Aji BRI', 'phone' => '08110004', 'package_id' => $package->id, 'status' => 'active']);

        $ledger = app(FinancialLedgerService::class);

        // 1. Pembayaran A: 11 Nov 2026 pukul 22:15 WIB (masuk siklus 2026-11-12 karena setelah cut-off 21:00)
        // Pokok Rp 200.000 + Kode Unik 165 = Rp 200.165 riil masuk GoPay QRIS
        $invA = Invoice::create([
            'customer_id' => $custA->id,
            'invoice_link' => 'INV-A-1',
            'amount' => 200000,
            'qris_unique_code' => 165,
            'qris_expected_amount' => 200165,
            'status' => 'paid',
            'invoice_date' => '2026-11-11',
            'due_date' => '2026-11-20',
            'paid_at' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-11 22:15:00', 'Asia/Jakarta'),
            'qris_payment_time' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-11 22:15:00', 'Asia/Jakarta'),
            'qris_transaction_number' => 'QG-TEST-001',
            'qris_sender' => 'GoPay QRIS',
            'received_via_payment_receipt_option_id' => $qrisOption->id,
            'include_in_mutation' => true,
        ]);
        $ledger->syncInvoicePayment($invA->fresh(), null, FinancialTransaction::STATUS_CONFIRMED, 'unique_code', [
            'settled_via' => 'qris_webhook',
            'qris_settled_amount' => 200165,
        ]);

        // 2. Pembayaran B: 12 Nov 2026 pukul 15:10 WIB via Foto WA ke QRIS Rp 150.304
        $invB = Invoice::create([
            'customer_id' => $custB->id,
            'invoice_link' => 'INV-B-2',
            'amount' => 150304,
            'status' => 'paid',
            'invoice_date' => '2026-11-12',
            'due_date' => '2026-11-20',
            'paid_at' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 15:10:00', 'Asia/Jakarta'),
            'qris_payment_time' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 15:10:00', 'Asia/Jakarta'),
            'received_via_payment_receipt_option_id' => $qrisOption->id,
            'include_in_mutation' => true,
        ]);
        $ledger->syncInvoicePayment($invB->fresh(), null, FinancialTransaction::STATUS_CONFIRMED, 'wa_photo');

        // 3. Pembayaran C: 12 Nov 2026 pukul 21:10 WIB (SETELAH cut-off 21:00 -> milik siklus 2026-11-13!)
        $invC = Invoice::create([
            'customer_id' => $custC->id,
            'invoice_link' => 'INV-C-3',
            'amount' => 100000,
            'status' => 'paid',
            'invoice_date' => '2026-11-12',
            'due_date' => '2026-11-20',
            'paid_at' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:10:00', 'Asia/Jakarta'),
            'qris_payment_time' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:10:00', 'Asia/Jakarta'),
            'received_via_payment_receipt_option_id' => $qrisOption->id,
            'include_in_mutation' => true,
        ]);
        $ledger->syncInvoicePayment($invC->fresh(), null, FinancialTransaction::STATUS_CONFIRMED, 'manual');

        // 4. Pembayaran D: Non-QRIS (BRI) -> TIDAK boleh masuk hitungan QRIS
        $invD = Invoice::create([
            'customer_id' => $custD->id,
            'invoice_link' => 'INV-D-4',
            'amount' => 250000,
            'status' => 'paid',
            'invoice_date' => '2026-11-12',
            'due_date' => '2026-11-20',
            'paid_at' => Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 11:00:00', 'Asia/Jakarta'),
            'received_via_payment_receipt_option_id' => $briOption->id,
            'include_in_mutation' => true,
        ]);
        $ledger->syncInvoicePayment($invD->fresh(), null, FinancialTransaction::STATUS_CONFIRMED, 'manual');

        // Penarikan manual pagi 06:37 (Rp 200.165) + Penarikan otomatis 21:01 (Rp 150.304) = Rp 350.469
        $this->postJson('/api/qris/webhook', [
            'title' => 'Pencairan dana berhasil',
            'text' => 'Proses pencairan dana sebesar Rp200.165 telah selesai. Silakan cek akun bank Anda.',
            'occurred_at' => '2026-11-12 06:37:00',
        ], ['X-QRIS-SECRET' => 'valid-secret'])->assertOk();

        $this->postJson('/api/qris/webhook', [
            'title' => 'Pencairan dana berhasil',
            'text' => 'Proses pencairan dana sebesar Rp150.304 telah selesai. Silakan cek akun bank Anda.',
            'occurred_at' => '2026-11-12 21:01:00',
        ], ['X-QRIS-SECRET' => 'valid-secret'])->assertOk();

        Artisan::call('qris:reconcile-settlements', ['--date' => '2026-11-12']);

        $rec = QrisDailyReconciliation::query()->whereDate('cycle_date', '2026-11-12')->firstOrFail();
        $this->assertSame(QrisDailyReconciliation::STATUS_MATCHED, $rec->status);
        $this->assertSame(350469.0, (float) $rec->system_qris_gross_amount);
        $this->assertSame(2, (int) $rec->system_qris_count);
        $this->assertSame(350469.0, (float) $rec->settled_amount);
        $this->assertSame(2, (int) $rec->settlement_count);
        $this->assertSame(0.0, (float) $rec->discrepancy_amount);

        // Tidak ada pesan WA selisih terkirim karena cocok 100%
        Http::assertNothingSent();
    }

    public function test_mismatch_sends_whatsapp_alert_to_owner_and_qris_recipients_and_recovers_later(): void
    {
        Carbon::setTestNow(Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:15:00', 'Asia/Jakarta'));

        SiteSetting::set(ExecutiveDailyReportService::SETTING_RECIPIENTS, '081111111111');
        SiteSetting::set(QrisSettlementReconciliationService::SETTING_ALERT_RECIPIENTS, '082222222222');

        $qrisOption = PaymentReceiptOption::create(['name' => 'QRIS - Admin Finance', 'is_active' => true]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'manual_payment_income',
            'category' => 'pembayaran',
            'description' => 'Pembayaran QRIS Pelanggan',
            'amount' => 500000,
            'transaction_date' => '2026-11-12',
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'meta' => [
                'received_via_id' => $qrisOption->id,
                'received_via_name' => 'QRIS - Admin Finance',
            ],
        ]);

        // GoPay baru cair Rp 350.469 saat pagi (kurang Rp 149.531)
        $this->postJson('/api/qris/webhook', [
            'title' => 'Pencairan dana berhasil',
            'text' => 'Proses pencairan dana sebesar Rp350.469 telah selesai. Silakan cek akun bank Anda.',
            'occurred_at' => '2026-11-12 06:37:00',
        ], ['X-QRIS-SECRET' => 'valid-secret'])->assertOk();

        // Scheduler berjalan pukul 21:15 WIB
        Artisan::call('qris:reconcile-settlements');

        $rec = QrisDailyReconciliation::query()->whereDate('cycle_date', '2026-11-12')->firstOrFail();
        $this->assertSame(QrisDailyReconciliation::STATUS_MISMATCH, $rec->status);
        $this->assertSame(-149531.0, (float) $rec->discrepancy_amount);
        $this->assertSame(1, (int) $rec->alert_count);
        $this->assertNotNull($rec->alert_sent_at);

        Http::assertSent(function ($request) {
            $body = $request->data();
            $message = (string) ($body['message'] ?? '');
            $phones = collect($body['recipients'] ?? [])->pluck('phone')->all();

            return str_contains($request->url(), 'send-bulk')
                && in_array('081111111111', $phones, true)
                && in_array('082222222222', $phones, true)
                && str_contains(strtolower($message), 'pendapatan via qris hari ini tidak sesuai harap cek mutasi keuangan perusahaan anda')
                && str_contains($message, '500.000')
                && str_contains($message, '350.469')
                && str_contains($message, '149.531');
        });

        // Cron berjalan lagi 5 menit kemudian (21:20 WIB) -> jangan kirim alert ganda untuk selisih sama
        Carbon::setTestNow(Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:20:00', 'Asia/Jakarta'));
        Artisan::call('qris:reconcile-settlements');
        $this->assertSame(1, (int) $rec->fresh()->alert_count);

        // Jika pencairan susulan GoPay Rp 149.531 akhirnya masuk pukul 21:22 WIB -> status pulih menjadi matched
        Carbon::setTestNow(Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:22:00', 'Asia/Jakarta'));
        $this->postJson('/api/qris/webhook', [
            'title' => 'Pencairan dana berhasil',
            'text' => 'Proses pencairan dana sebesar Rp149.531 telah selesai. Silakan cek akun bank Anda.',
            'occurred_at' => '2026-11-12 21:22:00',
        ], ['X-QRIS-SECRET' => 'valid-secret'])->assertOk();

        $recovered = $rec->fresh();
        $this->assertSame(QrisDailyReconciliation::STATUS_MATCHED, $recovered->status);
        $this->assertSame(0.0, (float) $recovered->discrepancy_amount);
        $this->assertNotEmpty(data_get($recovered->meta, 'recovery_sent_at'));
    }

    public function test_admin_reconciliation_endpoints_and_reconciliation_center_issue_lifecycle(): void
    {
        Carbon::setTestNow(Carbon::createFromFormat('Y-m-d H:i:s', '2026-11-12 21:15:00', 'Asia/Jakarta'));
        $financeUser = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $qrisOption = PaymentReceiptOption::create(['name' => 'QRIS - Admin Finance', 'is_active' => true]);
        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'manual_payment_income',
            'category' => 'pembayaran',
            'description' => 'Pembayaran QRIS Manual Entry',
            'amount' => 400000,
            'transaction_date' => '2026-11-12',
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'meta' => ['received_via_id' => $qrisOption->id, 'received_via_name' => 'QRIS - Admin Finance'],
        ]);

        // Simpan konfigurasi MDR 0% & nomor WA tambahan
        $this->actingAs($financeUser)->postJson('/api/settings/qris/reconciliation/config', [
            'enabled' => true,
            'cutoff_time' => '21:00',
            'check_time' => '21:15',
            'grace_minutes' => 30,
            'mdr_percent' => 0,
            'payout_fee' => 0,
            'tolerance_amount' => 0,
            'include_owner_recipients' => true,
            'alert_recipients_raw' => '085500001111',
        ])->assertOk();

        // Catat pencairan manual Rp 300.000 (kurang Rp 100.000 -> mismatch)
        $manualRes = $this->actingAs($financeUser)->postJson('/api/settings/qris/reconciliation/settlements', [
            'amount' => 300000,
            'settled_at' => '2026-11-12 08:00:00',
            'settlement_type' => 'manual',
            'notes' => 'Tarik manual pagi',
        ]);
        $manualRes->assertOk();
        $settlementId = (int) $manualRes->json('data.settlement.id');

        $this->actingAs($financeUser)->postJson('/api/settings/qris/reconciliation/run', [
            'cycle_date' => '2026-11-12',
            'send_alert' => true,
        ])->assertOk()->assertJsonPath('data.status', 'mismatch');

        // Refresh Reconciliation Center harus mendeteksi qris_settlement_mismatch
        $this->actingAs($financeUser)->postJson('/api/reconciliation-center/refresh')->assertOk();
        $issue = ReconciliationIssue::query()
            ->where('issue_type', 'qris_settlement_mismatch')
            ->firstOrFail();
        $this->assertSame(ReconciliationIssue::STATUS_OPEN, $issue->status);

        // Input sisa pencairan Rp 100.000 agar cocok -> refresh Reconciliation Center auto-resolve!
        $this->actingAs($financeUser)->postJson('/api/settings/qris/reconciliation/settlements', [
            'amount' => 100000,
            'settled_at' => '2026-11-12 21:01:00',
            'settlement_type' => 'auto',
            'notes' => 'Pencairan otomatis jam 21:00',
        ])->assertOk()->assertJsonPath('data.reconciliation.status', 'matched');

        $this->actingAs($financeUser)->postJson('/api/reconciliation-center/refresh')->assertOk();
        $this->assertSame(ReconciliationIssue::STATUS_RESOLVED, $issue->fresh()->status);

        // Hapus salah satu entri manual -> kembali mismatch
        $this->actingAs($financeUser)->deleteJson("/api/settings/qris/reconciliation/settlements/{$settlementId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'mismatch');

        // Tes dashboard GET endpoint & test-alert endpoint
        $this->actingAs($financeUser)->getJson('/api/settings/qris/reconciliation?cycle_date=2026-11-12')
            ->assertOk()
            ->assertJsonPath('data.current_cycle.settled_amount', '100000.00');

        $this->actingAs($financeUser)->postJson('/api/settings/qris/reconciliation/test-alert', [
            'phone' => '085500001111',
        ])->assertOk()->assertJson(['success' => true]);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\QrisWebhookLog;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\DynamicQrisService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MutasiUniqueCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_qris_webhook_settlement_persists_and_exposes_unique_code_in_mutasi_endpoints(): void
    {
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'mutasi-qris-secret');

        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);

        $package = Package::create([
            'name' => 'Paket 200K',
            'price' => 200000,
            'speed' => '20M',
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Mismi',
            'phone' => '081234567890',
            'package_id' => $package->id,
            'pppoe_username' => 'CJA-mismi',
            'status' => 'active',
            'due_date' => now()->addDays(5)->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-MISMI-142',
            'amount' => 200000,
            'qris_unique_code' => 142,
            'qris_expected_amount' => 200142,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDays(2),
            'due_date' => now()->addDays(5),
        ]);

        $webhookRes = $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi Masuk',
            'text' => 'Pembayaran QRIS sebesar Rp 200.142 berhasil diterima dari MISMI. Ref: QG-20261110-142',
            'device_name' => 'HP-Kasir-Utama',
        ], ['X-QRIS-SECRET' => 'mutasi-qris-secret']);

        $webhookRes->assertOk();
        $this->assertSame('settled', $webhookRes->json('status'));

        $transaction = FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->firstOrFail();

        $this->assertSame('unique_code', $transaction->confirmation_via);
        $this->assertSame(142, data_get($transaction->meta, 'qris_unique_code'));
        $this->assertEquals(200000, data_get($transaction->meta, 'qris_base_amount'));
        $this->assertEquals(200142, data_get($transaction->meta, 'qris_expected_amount'));
        $this->assertEquals(200142, data_get($transaction->meta, 'qris_settled_amount'));
        $this->assertSame('qris_webhook', data_get($transaction->meta, 'settled_via'));

        $listRes = $this->actingAs($admin)
            ->getJson('/api/finance/transactions?confirmation_via=unique_code')
            ->assertOk();

        $rows = collect($listRes->json('data.data'));
        $row = $rows->firstWhere('id', $transaction->id);
        $this->assertNotNull($row);
        $this->assertSame('unique_code', $row['confirmation_via']);
        $this->assertTrue((bool) data_get($row, 'unique_code_info.has_unique_code'));
        $this->assertSame(142, data_get($row, 'unique_code_info.code'));
        $this->assertSame('+142', data_get($row, 'unique_code_info.formatted_code'));
        $this->assertEquals(200000, data_get($row, 'unique_code_info.base_amount'));
        $this->assertEquals(200142, data_get($row, 'unique_code_info.total_amount'));
        $this->assertTrue((bool) data_get($row, 'unique_code_info.amount_differs_from_ledger'));

        $showRes = $this->actingAs($admin)
            ->getJson('/api/finance/transactions/' . $transaction->id)
            ->assertOk();

        $this->assertSame(142, $showRes->json('data.unique_code_info.code'));
        $this->assertEquals(200142, $showRes->json('data.unique_code_info.total_amount'));
    }

    public function test_legacy_unique_code_transactions_without_meta_keys_resolve_from_invoice_webhook_and_package(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);

        $package = Package::create([
            'name' => 'Paket 200K',
            'price' => 200000,
            'speed' => '20M',
            'is_active' => true,
        ]);

        // Kasus 1: Baris lama dimana ledger menyimpan base amount 200.000, kode unik hanya tersimpan di Invoice + Log
        $customerA = Customer::create([
            'name' => 'Hasanudin',
            'phone' => '081211112222',
            'package_id' => $package->id,
            'pppoe_username' => 'LBR-hasanudin48',
            'status' => 'active',
        ]);

        $invoiceA = Invoice::create([
            'customer_id' => $customerA->id,
            'invoice_link' => 'INV-HASANUDIN-215',
            'amount' => 200000,
            'qris_unique_code' => 215,
            'qris_expected_amount' => 200215,
            'qris_transaction_number' => 'QG-LEGACY-215',
            'qris_sender' => 'GoPay QRIS',
            'status' => 'paid',
            'paid_at' => now(),
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(4),
        ]);

        QrisWebhookLog::create([
            'device_name' => 'HP-Kasir-Legacy',
            'extracted_amount' => 200215,
            'status' => 'settled',
            'invoice_id' => $invoiceA->id,
        ]);

        $txA = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'reference_type' => Invoice::class,
            'reference_id' => $invoiceA->id,
            'category' => 'pembayaran',
            'description' => 'Pembayaran PPPoE LBR-hasanudin48',
            'amount' => 200000,
            'transaction_date' => now()->toDateString(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'meta' => [
                'confirmation_method' => 'unique_code',
                'qris_transaction_number' => 'QG-LEGACY-215',
                'qris_sender' => 'GoPay QRIS',
            ],
        ]);

        // Kasus 2: Baris lama dimana invoice.amount & ledger.amount sudah 200.165 dan qris_unique_code belum tercatat
        $customerB = Customer::create([
            'name' => 'Wagino',
            'phone' => '081233334444',
            'package_id' => $package->id,
            'pppoe_username' => 'KBS-wagino',
            'status' => 'active',
        ]);

        $invoiceB = Invoice::create([
            'customer_id' => $customerB->id,
            'invoice_link' => 'INV-WAGINO-165',
            'amount' => 200165,
            'qris_transaction_number' => 'QG-LEGACY-165',
            'qris_sender' => 'GoPay QRIS',
            'status' => 'paid',
            'paid_at' => now(),
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(4),
        ]);

        $txB = FinancialTransaction::create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'reference_type' => Invoice::class,
            'reference_id' => $invoiceB->id,
            'category' => 'pembayaran',
            'description' => 'Pembayaran PPPoE KBS-wagino',
            'amount' => 200165,
            'transaction_date' => now()->toDateString(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
            'meta' => [
                'confirmation_method' => 'unique_code',
                'qris_transaction_number' => 'QG-LEGACY-165',
                'qris_sender' => 'GoPay QRIS',
            ],
        ]);

        $listRes = $this->actingAs($admin)
            ->getJson('/api/finance/transactions?confirmation_via=unique_code')
            ->assertOk();

        $rows = collect($listRes->json('data.data'));

        $rowA = $rows->firstWhere('id', $txA->id);
        $this->assertNotNull($rowA);
        $this->assertSame(215, data_get($rowA, 'unique_code_info.code'));
        $this->assertEquals(200000, data_get($rowA, 'unique_code_info.base_amount'));
        $this->assertEquals(200215, data_get($rowA, 'unique_code_info.total_amount'));
        $this->assertTrue((bool) data_get($rowA, 'unique_code_info.amount_differs_from_ledger'));

        $rowB = $rows->firstWhere('id', $txB->id);
        $this->assertNotNull($rowB);
        $this->assertSame(165, data_get($rowB, 'unique_code_info.code'));
        $this->assertEquals(200000, data_get($rowB, 'unique_code_info.base_amount'));
        $this->assertEquals(200165, data_get($rowB, 'unique_code_info.total_amount'));
        $this->assertFalse((bool) data_get($rowB, 'unique_code_info.amount_differs_from_ledger'));
    }

    public function test_qris_webhook_exact_base_amount_without_unique_code_reports_exact_amount_settlement(): void
    {
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        SiteSetting::set(DynamicQrisService::SETTING_WEBHOOK_SECRET, 'mutasi-qris-secret');

        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Pas',
            'phone' => '081255556666',
            'pppoe_username' => 'TST-nominalpas',
            'status' => 'active',
            'due_date' => now()->addDays(5)->toDateString(),
        ]);

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoice_link' => 'INV-PAS-200',
            'amount' => 200000,
            'qris_unique_code' => 199,
            'qris_expected_amount' => 200199,
            'qris_expired_at' => now()->addHours(3),
            'status' => 'unpaid',
            'invoice_date' => now()->subDay(),
            'due_date' => now()->addDays(5),
        ]);

        $this->postJson('/api/qris/webhook', [
            'title' => 'GoBiz - Transaksi Masuk',
            'text' => 'Pembayaran QRIS sebesar Rp 200.000 berhasil diterima. Ref: QG-PAS-200',
            'device_name' => 'HP-Kasir-Pas',
        ], ['X-QRIS-SECRET' => 'mutasi-qris-secret'])->assertOk();

        $transaction = FinancialTransaction::query()
            ->where('source', 'invoice_payment')
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->firstOrFail();

        $showRes = $this->actingAs($admin)
            ->getJson('/api/finance/transactions/' . $transaction->id)
            ->assertOk();

        $this->assertFalse((bool) $showRes->json('data.unique_code_info.has_unique_code'));
        $this->assertNull($showRes->json('data.unique_code_info.code'));
        $this->assertTrue((bool) $showRes->json('data.unique_code_info.is_exact_amount_settlement'));
        $this->assertEquals(200000, $showRes->json('data.unique_code_info.total_amount'));
        $this->assertSame(199, $showRes->json('data.unique_code_info.generated_code'));
    }
}

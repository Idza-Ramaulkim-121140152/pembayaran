<?php

namespace Tests\Feature;

use App\Models\CashObligationEntry;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\MasterMikrotik;
use App\Models\NotificationLog;
use App\Models\Package;
use App\Models\PaymentReceiptOption;
use App\Models\Pengeluaran;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\CashObligationAlertService;
use App\Services\ExecutiveDailyReportService;
use App\Services\MonthlyFinancialReportService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExecutiveReportsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SiteSetting::set(ExecutiveDailyReportService::SETTING_RECIPIENTS, '081234567890');
        SiteSetting::set(ExecutiveDailyReportService::SETTING_ENABLED, '1');
        SiteSetting::set(CashObligationAlertService::SETTING_ENABLED, '1');
        SiteSetting::set(MonthlyFinancialReportService::SETTING_ENABLED, '1');

        Http::fake([
            '*send-bulk' => Http::response(['success' => true, 'results' => [['phone' => '081234567890', 'success' => true]]]),
        ]);
    }

    public function test_executive_daily_report_generates_accurate_financial_and_operational_data_and_sends_whatsapp(): void
    {
        $today = Carbon::today('Asia/Jakarta');

        $package = Package::create([
            'name' => 'Paket Test 20M',
            'price' => 150000,
            'speed' => '20M',
            'is_active' => true,
        ]);

        $customer1 = Customer::create([
            'name' => 'Budi Santoso',
            'phone' => '081111111111',
            'package_type' => $package->name,
            'due_date' => $today->copy()->addDays(10)->toDateString(),
            'is_active' => true,
            'is_service_isolated' => false,
        ]);

        $customer2 = Customer::create([
            'name' => 'Siti Aminah',
            'phone' => '082222222222',
            'package_type' => $package->name,
            'due_date' => $today->copy()->subDays(2)->toDateString(),
            'is_active' => true,
            'is_service_isolated' => true,
            'service_isolated_at' => $today->copy()->addHours(9),
        ]);

        // Invoice QRIS lunas hari ini
        $qrisOption = PaymentReceiptOption::create([
            'name' => 'QRIS GoPay',
            'is_active' => true,
        ]);

        $invoicePaid = Invoice::create([
            'customer_id' => $customer1->id,
            'amount' => 150250,
            'status' => 'paid',
            'invoice_date' => $today->copy()->subDays(5)->toDateString(),
            'due_date' => $today->toDateString(),
            'paid_at' => $today->copy()->addHours(10),
            'qris_payment_time' => $today->copy()->addHours(10),
            'received_via_payment_receipt_option_id' => $qrisOption->id,
            'invoice_link' => 'inv_test_paid',
        ]);

        // Invoice belum lunas
        $invoiceUnpaid = Invoice::create([
            'customer_id' => $customer2->id,
            'amount' => 150000,
            'status' => 'unpaid',
            'invoice_date' => $today->copy()->subDays(5)->toDateString(),
            'due_date' => $today->copy()->addDays(5)->toDateString(),
            'invoice_link' => 'inv_test_unpaid',
        ]);

        // Transaksi Keuangan Hari Ini
        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'invoice_payment',
            'category' => 'Tagihan Internet',
            'description' => 'Pembayaran Budi',
            'amount' => 150250,
            'transaction_date' => $today->toDateString(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        FinancialTransaction::create([
            'type' => 'expense',
            'source' => 'operational',
            'category' => 'Operasional',
            'description' => 'Bensin motor teknisi',
            'amount' => 50000,
            'transaction_date' => $today->toDateString(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        // Komplain
        Complaint::create([
            'customer_id' => $customer1->id,
            'subject' => 'Internet lambat',
            'message' => 'Tolong dicek',
            'status' => 'pending',
            'priority' => 'medium',
            'category' => 'gangguan',
            'opened_at' => $today->copy()->addHours(11),
        ]);

        // MikroTik
        MasterMikrotik::create([
            'name' => 'CCR-1036 Utama',
            'host' => '192.168.88.1',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'secret',
            'is_active' => true,
            'last_status' => 'up',
        ]);

        $service = app(ExecutiveDailyReportService::class);
        $result = $service->sendReport();

        $this->assertTrue($result['success']);
        $this->assertSame('sent', $result['status']);
        $this->assertStringContainsString('REKAP HARIAN RUMAH KITA NETWORK', $result['preview']);
        $this->assertStringContainsString('150.250', $result['preview']);
        $this->assertStringContainsString('50.000', $result['preview']);

        // Assert notification logged
        $log = NotificationLog::query()
            ->where('phone', '081234567890')
            ->where('meta->type', 'executive_daily_report')
            ->first();

        $this->assertNotNull($log);
    }

    public function test_cash_obligation_alert_detects_upcoming_due_dates_and_calculates_cash_gap(): void
    {
        $today = Carbon::today('Asia/Jakarta');

        // Buat kewajiban kas H-2
        $obligation = CashObligationEntry::create([
            'title' => 'Sewa Bandwidth Upstream Provider',
            'amount' => 5000000,
            'due_date' => $today->copy()->addDays(2)->toDateString(),
            'category' => CashObligationEntry::CATEGORY_VENDOR,
            'priority' => CashObligationEntry::PRIORITY_HIGH,
            'status' => CashObligationEntry::STATUS_PENDING,
            'notes' => 'Tagihan Astinet 500M',
        ]);

        // Saldo kas saat ini: Rp 3.000.000 (Kurang Rp 2.000.000)
        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'initial_balance',
            'description' => 'Saldo awal',
            'amount' => 3000000,
            'transaction_date' => $today->copy()->subDay()->toDateString(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $service = app(CashObligationAlertService::class);
        $result = $service->checkAndSendAlerts();

        $this->assertTrue($result['success']);
        $this->assertSame(1, $result['alerts_sent']);
        $this->assertNotEmpty($result['previews']);

        $preview = $result['previews'][0];
        $this->assertStringContainsString('PENGINGAT KEWAJIBAN KAS', $preview);
        $this->assertStringContainsString('H-2', $preview);
        $this->assertStringContainsString('5.000.000', $preview);

        // Deduplication test: running again on same day should not send duplicate
        $secondRun = $service->checkAndSendAlerts();
        $this->assertTrue($secondRun['success']);
        $this->assertSame(0, $secondRun['alerts_sent']);
    }

    public function test_monthly_pnl_report_calculates_revenue_opex_profit_margin_and_sends_whatsapp(): void
    {
        $lastMonthStart = Carbon::now('Asia/Jakarta')->subMonth()->startOfMonth();
        $lastMonthEnd = $lastMonthStart->copy()->endOfMonth();
        $year = $lastMonthStart->year;
        $month = $lastMonthStart->month;

        $package = Package::create([
            'name' => 'Paket Bisnis 50M',
            'price' => 500000,
            'speed' => '50M',
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'name' => 'PT Pelanggan Sejahtera',
            'phone' => '087777777777',
            'package_type' => $package->name,
            'due_date' => $lastMonthStart->copy()->addDays(10)->toDateString(),
            'is_active' => true,
            'created_at' => $lastMonthStart->copy()->addDays(2),
        ]);

        // Invoice lunas bulan lalu
        Invoice::create([
            'customer_id' => $customer->id,
            'amount' => 500000,
            'status' => 'paid',
            'invoice_date' => $lastMonthStart->copy()->addDays(1)->toDateString(),
            'due_date' => $lastMonthStart->copy()->addDays(10)->toDateString(),
            'paid_at' => $lastMonthStart->copy()->addDays(5),
            'invoice_link' => 'inv_pnl_test',
        ]);

        // Pengeluaran operasional bulan lalu
        FinancialTransaction::create([
            'type' => 'expense',
            'source' => 'operational',
            'category' => 'Bandwidth Upstream',
            'description' => 'Tagihan sewa bandwidth upstream',
            'amount' => 200000,
            'transaction_date' => $lastMonthStart->copy()->addDays(10)->toDateString(),
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $service = app(MonthlyFinancialReportService::class);
        $result = $service->sendReport(null, $year, $month);

        $this->assertTrue($result['success']);
        $this->assertSame('sent', $result['status']);
        $this->assertStringContainsString('LAPORAN KEUANGAN & LABA RUGI BULANAN', $result['preview']);
        $this->assertStringContainsString('500.000', $result['preview']); // Revenue
        $this->assertStringContainsString('200.000', $result['preview']); // OPEX
        $this->assertStringContainsString('300.000', $result['preview']); // Net profit: 500k - 200k = 300k
        $this->assertStringContainsString('60%', $result['preview']);     // Profit Margin: 300k / 500k = 60%
    }

    public function test_artisan_commands_run_successfully(): void
    {
        $this->artisan('executive:send-daily-report', ['--dry-run' => true])
            ->assertSuccessful();

        $this->artisan('finance:send-obligation-alert', ['--dry-run' => true])
            ->assertSuccessful();

        $this->artisan('finance:send-monthly-pnl', ['--dry-run' => true])
            ->assertSuccessful();
    }

    public function test_executive_report_controller_get_and_update_config_and_test_send(): void
    {
        $superadmin = User::factory()->create([
            'role' => User::ROLE_SUPERADMIN,
        ]);

        // 1. Get config
        $response = $this->actingAs($superadmin)->getJson('/api/settings/executive-reports');
        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.daily_enabled', true)
            ->assertJsonPath('data.daily_time', '21:00');

        // 2. Update config
        $updateResp = $this->actingAs($superadmin)->postJson('/api/settings/executive-reports', [
            'recipients' => '081234567890, 089988776655',
            'daily_enabled' => true,
            'daily_time' => '21:30',
            'obligation_enabled' => true,
            'obligation_days_ahead' => 4,
            'monthly_pnl_enabled' => true,
        ]);

        $updateResp->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertSame('081234567890, 089988776655', SiteSetting::get(ExecutiveDailyReportService::SETTING_RECIPIENTS));
        $this->assertSame('21:30', SiteSetting::get(ExecutiveDailyReportService::SETTING_TIME));
        $this->assertSame('4', SiteSetting::get(CashObligationAlertService::SETTING_DAYS_AHEAD));

        // 3. Test send
        $testSendResp = $this->actingAs($superadmin)->postJson('/api/settings/executive-reports/test-send', [
            'type' => 'daily',
            'phone' => '081234567890',
        ]);

        $testSendResp->assertStatus(200)
            ->assertJsonPath('success', true);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InactiveCustomerReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_inactive_customer_report_lists_overdue_customers_with_isolation_indicators(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $dusun = $this->createRegion();

        $isolated = Customer::create([
            'name' => 'Pelanggan Isolir',
            'phone' => '081111111111',
            'due_date' => '2026-07-20',
            'is_active' => true,
            'is_service_isolated' => true,
            'service_isolated_at' => '2026-07-21 10:00:00',
            'kecamatan_id' => $dusun->desa->kecamatan_id,
            'desa_id' => $dusun->desa_id,
            'dusun_id' => $dusun->id,
        ]);

        $notIsolated = Customer::create([
            'name' => 'Pelanggan Belum Isolir',
            'phone' => '082222222222',
            'due_date' => '2026-07-01',
            'is_active' => true,
            'is_service_isolated' => false,
            'kecamatan_id' => $dusun->desa->kecamatan_id,
            'desa_id' => $dusun->desa_id,
            'dusun_id' => $dusun->id,
        ]);

        $current = Customer::create([
            'name' => 'Pelanggan Lancar',
            'phone' => '083333333333',
            'due_date' => '2026-08-05',
            'is_active' => true,
        ]);

        $this->createInvoice($isolated, 200000, 'unpaid', '2026-07-20', 'INV-ISOLIR');
        $this->createInvoice($isolated, 100000, 'paid', '2026-06-20', 'INV-PAID', '2026-06-21 08:00:00');
        $this->createInvoice($notIsolated, 500000, 'overdue', '2026-07-01', 'INV-BELUM-ISOLIR');
        $this->createInvoice($current, 300000, 'unpaid', '2026-08-05', 'INV-LANCAR');

        $response = $this->actingAs($user)
            ->getJson('/api/reports/inactive-customers?as_of_date=2026-07-30&sort_by=priority_desc')
            ->assertOk();

        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.summary.customer_count', 2);
        $response->assertJsonPath('data.summary.isolated_count', 1);
        $response->assertJsonPath('data.summary.not_isolated_count', 1);
        $response->assertJsonPath('data.summary.overdue_amount_total', 700000);
        $response->assertJsonPath('data.radar.not_isolated', 1);

        $rows = collect($response->json('data.rows'));
        $this->assertEquals(['Pelanggan Belum Isolir', 'Pelanggan Isolir'], $rows->pluck('customer_name')->all());
        $this->assertFalse($rows->contains('customer_name', 'Pelanggan Lancar'));

        $firstRow = $rows->firstWhere('customer_name', 'Pelanggan Belum Isolir');
        $this->assertSame('belum_isolir', $firstRow['isolation_status']);
        $this->assertSame(29, $firstRow['days_overdue']);
        $this->assertSame(500000, $firstRow['overdue_amount']);
        $this->assertSame('15-30 hari', $firstRow['aging_label']);

        $region = collect($response->json('data.by_region'))->first();
        $this->assertSame('Dusun Lambur', $region['label']);
        $this->assertSame(2, $region['customer_count']);
    }

    public function test_inactive_customer_report_filters_by_isolation_and_aging_bucket(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        Customer::create([
            'name' => 'Terlambat Isolir',
            'phone' => '084444444444',
            'due_date' => '2026-07-18',
            'is_active' => true,
            'is_service_isolated' => true,
        ]);

        Customer::create([
            'name' => 'Terlambat Belum Isolir',
            'phone' => '085555555555',
            'due_date' => '2026-07-29',
            'is_active' => true,
            'is_service_isolated' => false,
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/reports/inactive-customers?as_of_date=2026-07-30&isolation_status=isolir&aging_bucket=8_14')
            ->assertOk();

        $response->assertJsonPath('data.summary.customer_count', 1);
        $response->assertJsonPath('data.rows.0.customer_name', 'Terlambat Isolir');
        $response->assertJsonPath('data.rows.0.days_overdue', 12);
        $response->assertJsonPath('data.rows.0.isolation_status', 'isolir');
    }

    private function createRegion(): MasterWilayahDusun
    {
        $kecamatan = MasterWilayahKecamatan::create(['name' => 'Lebak', 'code' => 'LBK']);
        $desa = MasterWilayahDesa::create([
            'kecamatan_id' => $kecamatan->id,
            'name' => 'Rangkas',
            'code' => 'RGK',
        ]);

        return MasterWilayahDusun::create([
            'desa_id' => $desa->id,
            'name' => 'Lambur',
            'code' => 'LBR',
        ]);
    }

    private function createInvoice(Customer $customer, int $amount, string $status, string $dueDate, string $link, ?string $paidAt = null): Invoice
    {
        return Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => substr($dueDate, 0, 8) . '01',
            'due_date' => $dueDate,
            'amount' => $amount,
            'status' => $status,
            'invoice_link' => $link,
            'paid_at' => $paidAt,
        ]);
    }
}

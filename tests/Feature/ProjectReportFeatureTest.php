<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerInstallationCostSnapshot;
use App\Models\FinancialTransaction;
use App\Models\InstallationPricing;
use App\Models\Invoice;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\ProjectReport;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectReportFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_finance_can_create_project_report_and_totals_are_calculated(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $kecamatan = MasterWilayahKecamatan::create(['name' => 'Kecamatan A', 'code' => 'KCA']);
        $desa = MasterWilayahDesa::create(['kecamatan_id' => $kecamatan->id, 'name' => 'Desa A', 'code' => 'DSA']);
        $dusunA = MasterWilayahDusun::create(['desa_id' => $desa->id, 'name' => 'Dusun A', 'code' => 'DTA']);
        $dusunB = MasterWilayahDusun::create(['desa_id' => $desa->id, 'name' => 'Dusun B', 'code' => 'DTB']);

        $pricing = InstallationPricing::create([
            'cable_price_per_meter' => 1000,
            'connector_unit_price' => 5000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 100000,
        ]);

        $customer = Customer::create([
            'name' => 'Customer Project 1',
            'phone' => '081200000001',
            'address' => 'Dusun A',
            'activation_date' => '2026-07-01',
            'is_active' => true,
            'kecamatan_id' => $kecamatan->id,
            'desa_id' => $desa->id,
            'dusun_id' => $dusunA->id,
        ]);

        CustomerInstallationCostSnapshot::create([
            'customer_id' => $customer->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-01',
            'cable_used_meter' => 10,
            'cable_price_per_meter' => 1000,
            'cable_material_price_per_meter' => 1000,
            'cable_payroll_price_per_meter' => 200,
            'cable_total' => 12000,
            'connector_quantity' => 2,
            'connector_unit_price' => 5000,
            'router_used' => true,
            'router_unit_price' => 100000,
            'labor_fee' => 20000,
            'total_cost' => 142000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        Invoice::create([
            'customer_id' => $customer->id,
            'invoice_date' => '2026-07-02',
            'due_date' => '2026-07-10',
            'amount' => 80000,
            'status' => 'paid',
            'paid_at' => '2026-07-05 10:00:00',
            'invoice_link' => 'INV-PROJECT-1',
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Income pemasangan project 1',
            'amount' => 150000,
            'transaction_date' => '2026-07-01',
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $response = $this->actingAs($user)->postJson('/api/reports/projects', [
            'name' => 'Project Area Baru',
            'notes' => 'Project rollout area terbaru.',
            'starts_at' => '2026-07-01',
            'is_active' => true,
            'wilayah_mappings' => [
                ['level' => 'dusun', 'id' => $dusunA->id],
                ['level' => 'dusun', 'id' => $dusunB->id],
            ],
            'customer_ids' => [$customer->id],
            'manual_expenses' => [
                [
                    'name' => 'Tiang tambahan',
                    'category' => 'material',
                    'quantity' => 2,
                    'unit' => 'pcs',
                    'unit_price' => 15000,
                    'notes' => 'Pembelian lokal',
                ],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Project Area Baru')
            ->assertJsonPath('data.customer_count', 1)
            ->assertJsonPath('data.wilayah_count', 2)
            ->assertJsonPath('data.installation_income_total', 150000)
            ->assertJsonPath('data.invoice_income_total', 80000)
            ->assertJsonPath('data.total_income', 230000)
            ->assertJsonPath('data.customer_installation_expense_total', 142000)
            ->assertJsonPath('data.manual_expense_total', 30000)
            ->assertJsonPath('data.total_expense', 172000)
            ->assertJsonPath('data.margin', 58000)
            ->assertJsonMissingPath('data.payroll_project_expense_total')
            ->assertJsonPath('data.status', 'untung');
    }

    public function test_project_report_update_replaces_mapping_and_recomputes_totals(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $kecamatan = MasterWilayahKecamatan::create(['name' => 'Kecamatan B', 'code' => 'KCB']);
        $desa = MasterWilayahDesa::create(['kecamatan_id' => $kecamatan->id, 'name' => 'Desa B', 'code' => 'DSB']);
        $dusun = MasterWilayahDusun::create(['desa_id' => $desa->id, 'name' => 'Dusun C', 'code' => 'DTC']);

        $pricing = InstallationPricing::create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $customerA = Customer::create([
            'name' => 'Customer A',
            'phone' => '081200000002',
            'address' => 'Alamat A',
            'activation_date' => '2026-07-02',
            'is_active' => true,
            'kecamatan_id' => $kecamatan->id,
            'desa_id' => $desa->id,
            'dusun_id' => $dusun->id,
        ]);

        $customerB = Customer::create([
            'name' => 'Customer B',
            'phone' => '081200000003',
            'address' => 'Alamat B',
            'activation_date' => '2026-07-03',
            'is_active' => true,
            'kecamatan_id' => $kecamatan->id,
            'desa_id' => $desa->id,
            'dusun_id' => $dusun->id,
        ]);

        CustomerInstallationCostSnapshot::create([
            'customer_id' => $customerA->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-02',
            'cable_used_meter' => 5,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 300,
            'cable_total' => 7500,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => true,
            'router_unit_price' => 225000,
            'labor_fee' => 45000,
            'total_cost' => 293500,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        CustomerInstallationCostSnapshot::create([
            'customer_id' => $customerB->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-03',
            'cable_used_meter' => 20,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 300,
            'cable_total' => 30000,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => true,
            'router_unit_price' => 225000,
            'labor_fee' => 45000,
            'total_cost' => 316000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Income A',
            'amount' => 200000,
            'transaction_date' => '2026-07-02',
            'reference_type' => Customer::class,
            'reference_id' => $customerA->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Income B',
            'amount' => 450000,
            'transaction_date' => '2026-07-03',
            'reference_type' => Customer::class,
            'reference_id' => $customerB->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        Invoice::create([
            'customer_id' => $customerA->id,
            'invoice_date' => '2026-07-02',
            'due_date' => '2026-07-10',
            'amount' => 50000,
            'status' => 'paid',
            'paid_at' => '2026-07-06 10:00:00',
            'invoice_link' => 'INV-A',
        ]);

        Invoice::create([
            'customer_id' => $customerB->id,
            'invoice_date' => '2026-07-03',
            'due_date' => '2026-07-10',
            'amount' => 125000,
            'status' => 'paid',
            'paid_at' => '2026-07-07 10:00:00',
            'invoice_link' => 'INV-B',
        ]);

        $project = ProjectReport::create([
            'name' => 'Project Lama',
            'starts_at' => '2026-07-01',
            'is_active' => true,
        ]);
        $project->customers()->sync([$customerA->id]);

        $response = $this->actingAs($user)->putJson("/api/reports/projects/{$project->id}", [
            'name' => 'Project Baru Update',
            'notes' => 'Diganti ke pelanggan baru',
            'starts_at' => '2026-07-03',
            'is_active' => true,
            'wilayah_mappings' => [
                ['level' => 'dusun', 'id' => $dusun->id],
            ],
            'customer_ids' => [$customerB->id],
            'payroll_project_ids' => [],
            'manual_expenses' => [
                [
                    'name' => 'Sewa mobil',
                    'category' => 'operasional',
                    'quantity' => 1,
                    'unit' => 'unit',
                    'unit_price' => 50000,
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Project Baru Update')
            ->assertJsonPath('data.customer_count', 1)
            ->assertJsonPath('data.customers.0.customer_name', 'Customer B')
            ->assertJsonPath('data.installation_income_total', 450000)
            ->assertJsonPath('data.invoice_income_total', 125000)
            ->assertJsonPath('data.customer_installation_expense_total', 316000)
            ->assertJsonPath('data.manual_expense_total', 50000)
            ->assertJsonPath('data.total_expense', 366000)
            ->assertJsonPath('data.margin', 209000)
            ->assertJsonPath('data.status', 'untung');

        $this->assertSame([$customerB->id], $project->fresh()->customers()->pluck('customers.id')->all());
    }

    public function test_project_report_uses_same_customer_cost_logic_as_customer_income_report_and_ignores_legacy_payroll_ids(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        SiteSetting::set('default_installation_cable_rate_payroll', '350');

        $kecamatan = MasterWilayahKecamatan::create(['name' => 'Kecamatan C', 'code' => 'KCC']);
        $desa = MasterWilayahDesa::create(['kecamatan_id' => $kecamatan->id, 'name' => 'Desa C', 'code' => 'DSC']);
        $dusun = MasterWilayahDusun::create(['desa_id' => $desa->id, 'name' => 'Dusun D', 'code' => 'DTD']);

        $pricing = InstallationPricing::create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $customer = Customer::create([
            'name' => 'Customer Fallback Payroll',
            'phone' => '081200000004',
            'address' => 'Alamat C',
            'activation_date' => '2026-07-03',
            'is_active' => true,
            'kecamatan_id' => $kecamatan->id,
            'desa_id' => $desa->id,
            'dusun_id' => $dusun->id,
        ]);

        CustomerInstallationCostSnapshot::create([
            'customer_id' => $customer->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-03',
            'cable_used_meter' => 80,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 0,
            'cable_total' => 96000,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => true,
            'router_unit_price' => 225000,
            'labor_fee' => 45000,
            'total_cost' => 382000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Income customer fallback',
            'amount' => 300000,
            'transaction_date' => '2026-07-03',
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $project = ProjectReport::create([
            'name' => 'Project Fallback',
            'starts_at' => '2026-07-03',
            'is_active' => true,
        ]);
        $project->customers()->sync([$customer->id]);

        $response = $this->actingAs($user)->putJson("/api/reports/projects/{$project->id}", [
            'name' => 'Project Fallback',
            'starts_at' => '2026-07-03',
            'is_active' => true,
            'customer_ids' => [$customer->id],
            'payroll_project_ids' => [999999],
            'manual_expenses' => [],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.customers.0.cost_breakdown.cable_payroll_price_per_meter', 350)
            ->assertJsonPath('data.customers.0.cost_breakdown.cable_combined_price_per_meter', 1550)
            ->assertJsonPath('data.customers.0.cost_breakdown.cable_total', 124000)
            ->assertJsonPath('data.customers.0.installation_cost_total', 410000)
            ->assertJsonPath('data.customer_installation_expense_total', 410000)
            ->assertJsonPath('data.total_expense', 410000)
            ->assertJsonMissingPath('data.payroll_project_expense_total')
            ->assertJsonMissingPath('data.payroll_projects');
    }
}

<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerInstallationCostSnapshot;
use App\Models\CustomerTerminationRequest;
use App\Models\FinancialTransaction;
use App\Models\InventoryDebt;
use App\Models\InventoryItem;
use App\Models\InventoryItemType;
use App\Models\InventoryMovement;
use App\Models\InstallationPricing;
use App\Models\InstallationWorkOrder;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\PayrollMember;
use App\Models\PayrollProject;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ReportsAndTerminationTest extends TestCase
{
    use RefreshDatabase;

    public function test_monthly_report_counts_paid_overdue_installation_expense_and_termination(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $package = Package::create([
            'name' => 'Paket 20Mbps',
            'speed' => '20Mbps',
            'price' => 200000,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $paidCustomer = Customer::create([
            'name' => 'Pelanggan Bayar',
            'phone' => '081234567001',
            'address' => 'Wilayah A',
            'package_id' => $package->id,
            'package_type' => $package->name,
            'activation_date' => '2026-05-05',
            'installation_fee' => 50000,
            'due_date' => '2026-05-10',
            'is_active' => true,
        ]);

        $overdueCustomer = Customer::create([
            'name' => 'Pelanggan Telat',
            'phone' => '081234567002',
            'address' => 'Wilayah B',
            'package_id' => $package->id,
            'package_type' => $package->name,
            'due_date' => '2026-05-12',
            'is_active' => true,
        ]);

        $inactiveCustomer = Customer::create([
            'name' => 'Pelanggan Copot',
            'phone' => '081234567003',
            'address' => 'Wilayah C',
            'package_type' => 'Paket Lama',
            'due_date' => '2026-05-15',
            'is_active' => false,
        ]);

        Invoice::create([
            'customer_id' => $paidCustomer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-10',
            'amount' => 200000,
            'status' => 'paid',
            'paid_at' => '2026-05-09 10:00:00',
            'invoice_link' => 'paid-report-test',
        ]);

        Invoice::create([
            'customer_id' => $overdueCustomer->id,
            'invoice_date' => '2026-05-01',
            'due_date' => '2026-05-12',
            'amount' => 200000,
            'status' => 'unpaid',
            'invoice_link' => 'overdue-report-test',
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'opening_balance',
            'category' => 'saldo_awal',
            'description' => 'Saldo sebelum periode',
            'amount' => 100000,
            'transaction_date' => '2026-04-30',
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Biaya pemasangan',
            'amount' => 50000,
            'transaction_date' => '2026-05-05',
        ]);

        FinancialTransaction::create([
            'type' => 'expense',
            'source' => 'pengeluaran',
            'category' => 'operasional',
            'description' => 'Transport teknisi',
            'amount' => 25000,
            'transaction_date' => '2026-05-06',
        ]);

        FinancialTransaction::create([
            'type' => 'expense',
            'source' => 'inventory_purchase',
            'category' => 'pembelian',
            'description' => 'Pembelian kabel',
            'amount' => 75000,
            'transaction_date' => '2026-05-07',
        ]);

        FinancialTransaction::create([
            'type' => 'adjustment',
            'source' => 'manual_adjustment',
            'category' => 'penyesuaian',
            'description' => 'Koreksi saldo',
            'amount' => 10000,
            'transaction_date' => '2026-05-08',
        ]);

        $type = InventoryItemType::create(['name' => 'Kabel', 'is_active' => true]);
        $item = InventoryItem::create([
            'inventory_item_type_id' => $type->id,
            'name' => 'Kabel Dropcore',
            'unit' => 'meter',
            'is_active' => true,
        ]);
        $incomingMovement = InventoryMovement::create([
            'inventory_item_id' => $item->id,
            'movement_type' => 'in',
            'source' => 'purchase',
            'quantity' => 10,
            'unit_price' => 5000,
            'total_amount' => 50000,
            'transaction_date' => '2026-05-03',
        ]);
        InventoryMovement::create([
            'inventory_item_id' => $item->id,
            'movement_type' => 'out',
            'source' => 'usage',
            'quantity' => 4,
            'transaction_date' => '2026-05-04',
        ]);
        $inventoryDebt = InventoryDebt::create([
            'inventory_item_id' => $item->id,
            'inventory_movement_id' => $incomingMovement->id,
            'quantity' => 10,
            'unit_price' => 5000,
            'original_amount' => 50000,
            'paid_amount' => 10000,
            'status' => 'partial',
            'created_by' => $user->id,
        ]);
        $inventoryDebt->forceFill([
            'created_at' => '2026-05-03 09:00:00',
            'updated_at' => '2026-05-03 09:00:00',
        ])->save();

        CustomerTerminationRequest::create([
            'customer_id' => $inactiveCustomer->id,
            'requested_by' => $user->id,
            'document_number' => 'SPC/RKN/202605/00001-01',
            'public_token' => 'termination-report-token',
            'status' => 'completed',
            'completed_at' => '2026-05-20 09:00:00',
            'generated_at' => '2026-05-19 09:00:00',
        ]);

        $this->actingAs($user)
            ->getJson('/api/reports/summary?month=2026-05')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.summary.paid_customer_count', 1)
            ->assertJsonPath('data.summary.overdue_customer_count', 1)
            ->assertJsonPath('data.summary.due_invoice_count', 2)
            ->assertJsonPath('data.summary.paid_due_invoice_count', 1)
            ->assertJsonPath('data.summary.collection_rate', 50)
            ->assertJsonPath('data.summary.installation_count', 1)
            ->assertJsonPath('data.summary.installation_income_total', 50000)
            ->assertJsonPath('data.summary.expense_total', 25000)
            ->assertJsonPath('data.summary.purchase_total', 75000)
            ->assertJsonPath('data.summary.net_cashflow', -50000)
            ->assertJsonPath('data.summary.arpu', 200000)
            ->assertJsonPath('data.summary.termination_count', 1)
            ->assertJsonPath('data.summary.churn_rate', 33.33)
            ->assertJsonPath('data.summary.overdue_aging.0.invoice_count', 1)
            ->assertJsonPath('data.summary.overdue_aging.0.amount', 200000)
            ->assertJsonPath('data.summary.top_overdue_region.label', 'Wilayah B')
            ->assertJsonPath('data.financial_statement.basis', 'gabungan')
            ->assertJsonPath('data.financial_statement.income_statement.cash_revenue', 50000)
            ->assertJsonPath('data.financial_statement.income_statement.invoice_paid_revenue', 200000)
            ->assertJsonPath('data.financial_statement.income_statement.operational_expense', 25000)
            ->assertJsonPath('data.financial_statement.income_statement.purchase_expense', 75000)
            ->assertJsonPath('data.financial_statement.income_statement.net_profit', -50000)
            ->assertJsonPath('data.financial_statement.income_statement.net_profit_after_adjustment', -40000)
            ->assertJsonPath('data.financial_statement.cash_flow.opening_cash', 100000)
            ->assertJsonPath('data.financial_statement.cash_flow.cash_in', 50000)
            ->assertJsonPath('data.financial_statement.cash_flow.cash_out', 100000)
            ->assertJsonPath('data.financial_statement.cash_flow.adjustment', 10000)
            ->assertJsonPath('data.financial_statement.cash_flow.ending_cash', 60000)
            ->assertJsonPath('data.financial_statement.receivables.total', 200000)
            ->assertJsonPath('data.financial_statement.balance_sheet.assets.cash', 60000)
            ->assertJsonPath('data.financial_statement.balance_sheet.assets.receivables', 200000)
            ->assertJsonPath('data.financial_statement.balance_sheet.assets.inventory_estimated_value', 30000)
            ->assertJsonPath('data.financial_statement.balance_sheet.liabilities.inventory_supplier_debt', 40000)
            ->assertJsonPath('data.financial_statement.balance_sheet.equity.simple_equity', 250000)
            ->assertJsonPath('data.revenue_by_package.0.label', 'Paket 20Mbps')
            ->assertJsonMissingPath('data.paid_customers')
            ->assertJsonMissingPath('data.overdue_invoices');
    }

    public function test_installation_report_counts_activation_rows_costs_income_groups_and_filters(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $technician = User::factory()->create(['role' => User::ROLE_TEKNISI, 'name' => 'Teknisi Work Order']);
        $package = Package::create([
            'name' => 'Paket Instalasi',
            'speed' => '20Mbps',
            'price' => 200000,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        SiteSetting::set('default_installation_cable_rate_payroll', '350');

        $profitableCustomer = Customer::create([
            'name' => 'Pelanggan Untung',
            'phone' => '081234567010',
            'address' => 'Wilayah Instalasi A',
            'package_id' => $package->id,
            'package_type' => $package->name,
            'activation_date' => '2026-07-05',
            'installation_fee' => 350000,
            'due_date' => '2026-08-05',
            'is_active' => true,
        ]);

        $estimatedCustomer = Customer::create([
            'name' => 'Pelanggan Estimasi',
            'phone' => '081234567011',
            'address' => 'Wilayah Instalasi A',
            'package_id' => $package->id,
            'package_type' => $package->name,
            'activation_date' => '2026-07-06',
            'installation_fee' => 0,
            'due_date' => '2026-08-06',
            'is_active' => true,
        ]);

        Customer::create([
            'name' => 'Pelanggan Luar Periode',
            'phone' => '081234567012',
            'address' => 'Wilayah Instalasi B',
            'package_id' => $package->id,
            'package_type' => $package->name,
            'activation_date' => '2026-06-30',
            'installation_fee' => 500000,
            'due_date' => '2026-07-30',
            'is_active' => true,
        ]);

        $payrollProject = PayrollProject::create([
            'tanggal' => '2026-07-05',
            'total' => 45000,
            'status' => 'unpaid',
            'catatan' => 'Pemasangan pelanggan untung',
        ]);
        $member = PayrollMember::create(['nama' => 'Teknisi Payroll']);
        $payrollProject->members()->attach($member->id, ['bagian' => 45000]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $profitableCustomer->id,
            'installation_date' => '2026-07-05',
            'cable_used_meter' => 10,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 350,
            'cable_total' => 15500,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => true,
            'router_unit_price' => 225000,
            'labor_fee' => 45000,
            'total_cost' => 301500,
            'source' => 'verification',
            'is_estimated' => false,
            'meta' => ['payroll_project_id' => $payrollProject->id],
        ]);

        InstallationWorkOrder::create([
            'customer_id' => $profitableCustomer->id,
            'assigned_to' => $technician->id,
            'scheduled_at' => '2026-07-05 09:00:00',
            'status' => 'in_progress',
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Uang pemasangan pelanggan untung',
            'amount' => 350000,
            'transaction_date' => '2026-07-05',
            'reference_type' => Customer::class,
            'reference_id' => $profitableCustomer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $this->actingAs($user)
            ->getJson('/api/reports/installations?start_date=2026-07-01&end_date=2026-07-31')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.summary.installation_count', 2)
            ->assertJsonPath('data.summary.installation_income_total', 350000)
            ->assertJsonPath('data.summary.status_counts.untung', 1)
            ->assertJsonPath('data.summary.status_counts.rugi', 1)
            ->assertJsonPath('data.operational_health.estimated_snapshot', 1)
            ->assertJsonPath('data.rows.0.customer_name', 'Pelanggan Estimasi')
            ->assertJsonPath('data.rows.1.customer_name', 'Pelanggan Untung')
            ->assertJsonPath('data.rows.1.installation_cost_total', 301500)
            ->assertJsonPath('data.rows.1.cost_breakdown.cable_combined_price_per_meter', 1550)
            ->assertJsonPath('data.rows.1.cost_breakdown.cable_total', 15500)
            ->assertJsonPath('data.rows.1.gross_margin', 48500)
            ->assertJsonPath('data.rows.1.payroll_project.id', $payrollProject->id)
            ->assertJsonPath('data.by_region.0.label', 'Wilayah Instalasi A')
            ->assertJsonPath('data.material_efficiency.cable_used_meter_total', 10)
            ->assertJsonPath('data.by_installer.0.label', 'Teknisi Payroll')
            ->assertJsonPath('data.by_installer.0.payroll_share_total', 45000);

        $this->actingAs($user)
            ->getJson('/api/reports/installations?start_date=2026-07-01&end_date=2026-07-31&profit_status=untung&include_estimated=false')
            ->assertOk()
            ->assertJsonPath('data.summary.installation_count', 1)
            ->assertJsonPath('data.rows.0.customer_name', 'Pelanggan Untung');
    }

    public function test_customer_termination_two_step_flow_sends_notice_before_final_deactivation(): void
    {
        Storage::fake('public');
        config(['app.url' => 'https://rumahkitanet.site']);

        $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $customer = Customer::create([
            'name' => 'Pelanggan Copot Flow',
            'phone' => '081234567004',
            'address' => 'Wilayah D',
            'package_type' => 'Paket 20Mbps',
            'due_date' => '2026-05-10',
            'is_active' => true,
        ]);

        $createResponse = $this->actingAs($user)->postJson("/api/customers/{$customer->id}/termination", [
            'planned_termination_date' => '2026-05-25',
            'reason' => 'Pengingat copot pemasangan.',
            'device_notes' => 'Modem wajib dikembalikan.',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'draft');

        $termination = CustomerTerminationRequest::firstOrFail();
        Storage::disk('public')->assertExists($termination->pdf_path);

        Http::fake([
            '*send-media' => Http::response(['success' => false, 'error' => 'media_failed'], 200),
            '*send' => Http::response(['success' => true], 200),
        ]);

        $this->actingAs($user)
            ->postJson("/api/customers/{$customer->id}/termination/{$termination->id}/send-whatsapp")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'notified');

        $this->assertTrue((bool) $customer->fresh()->is_active);

        $this->actingAs($user)
            ->postJson("/api/customers/{$customer->id}/termination/{$termination->id}/finalize")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'completed');

        $this->assertFalse((bool) $customer->fresh()->is_active);
    }

    public function test_customer_income_report_keeps_summary_global_and_filters_rows_by_cable(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $pricing = InstallationPricing::query()->create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $withCable = Customer::create([
            'name' => 'Pelanggan Kabel',
            'phone' => '081111111111',
            'address' => 'Wilayah Kabel',
            'activation_date' => '2026-07-01',
            'is_active' => true,
        ]);

        $withoutCable = Customer::create([
            'name' => 'Pelanggan Tanpa Kabel',
            'phone' => '082222222222',
            'address' => 'Wilayah Tanpa Kabel',
            'activation_date' => '2026-07-02',
            'is_active' => true,
        ]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $withCable->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-01',
            'cable_used_meter' => 30,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 0,
            'cable_total' => 36000,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => true,
            'router_unit_price' => 225000,
            'labor_fee' => 50000,
            'total_cost' => 327000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $withoutCable->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-02',
            'cable_used_meter' => 0,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 0,
            'cable_total' => 0,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => false,
            'router_unit_price' => 225000,
            'labor_fee' => 30000,
            'total_cost' => 46000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        Invoice::create([
            'customer_id' => $withCable->id,
            'invoice_date' => '2026-07-03',
            'due_date' => '2026-07-10',
            'amount' => 200000,
            'status' => 'paid',
            'paid_at' => '2026-07-05 10:00:00',
            'invoice_link' => 'INV-KABEL',
        ]);

        Invoice::create([
            'customer_id' => $withoutCable->id,
            'invoice_date' => '2026-07-03',
            'due_date' => '2026-07-10',
            'amount' => 150000,
            'status' => 'paid',
            'paid_at' => '2026-07-06 11:00:00',
            'invoice_link' => 'INV-TANPA-KABEL',
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Uang pemasangan pelanggan kabel',
            'amount' => 250000,
            'transaction_date' => '2026-07-01',
            'reference_type' => Customer::class,
            'reference_id' => $withCable->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Uang pemasangan pelanggan tanpa kabel',
            'amount' => 200000,
            'transaction_date' => '2026-07-02',
            'reference_type' => Customer::class,
            'reference_id' => $withoutCable->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/reports/customer-income?has_cable_only=true');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.summary.customer_count', 2)
            ->assertJsonPath('data.summary.installation_income_total', 450000)
            ->assertJsonPath('data.rows.0.customer_name', 'Pelanggan Kabel')
            ->assertJsonPath('data.rows.0.has_cable', true)
            ->assertJsonPath('data.rows.0.invoices.0.invoice_link', 'INV-KABEL');

        $this->assertCount(1, $response->json('data.rows'));
    }

    public function test_customer_income_report_combines_cable_material_and_payroll_costs(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $pricing = InstallationPricing::query()->create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Kabel Gabungan',
            'phone' => '081999999999',
            'address' => 'Wilayah Gabungan',
            'activation_date' => '2026-07-01',
            'is_active' => true,
        ]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $customer->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-01',
            'cable_used_meter' => 10,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 300,
            'cable_total' => 15000,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => true,
            'router_unit_price' => 225000,
            'labor_fee' => 45000,
            'total_cost' => 301000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        FinancialTransaction::create([
            'type' => 'income',
            'source' => 'installation_income',
            'category' => 'pemasangan',
            'description' => 'Uang pemasangan pelanggan kabel gabungan',
            'amount' => 350000,
            'transaction_date' => '2026-07-01',
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $response = $this->actingAs($user)->getJson('/api/reports/customer-income');

        $response->assertOk()
            ->assertJsonPath('data.rows.0.customer_name', 'Pelanggan Kabel Gabungan')
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_material_price_per_meter', 1200)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_payroll_price_per_meter', 300)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_payroll_source', 'snapshot')
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_combined_price_per_meter', 1500)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_total', 15000)
            ->assertJsonPath('data.rows.0.installation_cost_total', 301000);
    }

    public function test_customer_income_report_uses_inventory_default_for_missing_cable_payroll_rate(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        SiteSetting::set('default_installation_cable_rate_payroll', '350');

        $pricing = InstallationPricing::query()->create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Payroll Default',
            'phone' => '081888888888',
            'address' => 'Wilayah Default',
            'activation_date' => '2026-07-01',
            'is_active' => true,
        ]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $customer->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-01',
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
            'description' => 'Uang pemasangan pelanggan payroll default',
            'amount' => 250000,
            'transaction_date' => '2026-07-01',
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $response = $this->actingAs($user)->getJson('/api/reports/customer-income');

        $response->assertOk()
            ->assertJsonPath('data.rows.0.customer_name', 'Pelanggan Payroll Default')
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_payroll_price_per_meter', 350)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_payroll_source', 'inventory_default')
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_combined_price_per_meter', 1550)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_total', 124000)
            ->assertJsonPath('data.rows.0.installation_cost_total', 410000);
    }

    public function test_finance_can_update_report_pricing_for_future_only_without_touching_existing_snapshots(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        SiteSetting::set('default_installation_cable_rate_payroll', '4500');

        $pricing = InstallationPricing::query()->create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Snapshot Lama',
            'phone' => '081000000001',
            'address' => 'Wilayah Lama',
            'activation_date' => '2026-07-01',
            'is_active' => true,
        ]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $customer->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-01',
            'cable_used_meter' => 20,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 0,
            'cable_total' => 24000,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => false,
            'router_unit_price' => 225000,
            'labor_fee' => 50000,
            'total_cost' => 90000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        $response = $this->actingAs($user)->postJson('/api/master/installation-pricing', [
            'cable_price_per_meter' => 1500,
            'router_unit_price' => 250000,
            'apply_scope' => 'future_only',
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.updated_snapshot_count', 0);

        $snapshot = CustomerInstallationCostSnapshot::query()->firstOrFail();
        $this->assertSame('4500', SiteSetting::get('default_installation_cable_rate_payroll'));
        $this->assertSame(1200.0, (float) $snapshot->cable_price_per_meter);
        $this->assertSame(225000.0, (float) $snapshot->router_unit_price);
        $this->assertFalse((bool) $snapshot->router_used);
    }

    public function test_finance_can_recalculate_existing_report_snapshots_and_report_treats_router_as_installed(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        SiteSetting::set('default_installation_cable_rate_payroll', '4700');

        $pricing = InstallationPricing::query()->create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $customer = Customer::create([
            'name' => 'Pelanggan Router Lama',
            'phone' => '081000000002',
            'address' => 'Wilayah Router',
            'activation_date' => '2026-07-01',
            'is_active' => true,
        ]);

        CustomerInstallationCostSnapshot::query()->create([
            'customer_id' => $customer->id,
            'installation_pricing_id' => $pricing->id,
            'installation_date' => '2026-07-01',
            'cable_used_meter' => 10,
            'cable_price_per_meter' => 1200,
            'cable_material_price_per_meter' => 1200,
            'cable_payroll_price_per_meter' => 0,
            'cable_total' => 12000,
            'connector_quantity' => 2,
            'connector_unit_price' => 8000,
            'router_used' => false,
            'router_unit_price' => 225000,
            'labor_fee' => 50000,
            'total_cost' => 78000,
            'source' => 'verification',
            'is_estimated' => false,
        ]);

        $updateResponse = $this->actingAs($user)->postJson('/api/master/installation-pricing', [
            'cable_price_per_meter' => 1500,
            'router_unit_price' => 240000,
            'apply_scope' => 'recalculate_existing',
        ]);

        $updateResponse->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.updated_snapshot_count', 1);

        $snapshot = CustomerInstallationCostSnapshot::query()->firstOrFail();
        $this->assertSame('4700', SiteSetting::get('default_installation_cable_rate_payroll'));
        $this->assertSame(1500.0, (float) $snapshot->cable_price_per_meter);
        $this->assertSame(240000.0, (float) $snapshot->router_unit_price);
        $this->assertTrue((bool) $snapshot->router_used);
        $this->assertSame(321000.0, (float) $snapshot->total_cost);

        $reportResponse = $this->actingAs($user)->getJson('/api/reports/customer-income');

        $reportResponse->assertOk()
            ->assertJsonPath('data.rows.0.customer_name', 'Pelanggan Router Lama')
            ->assertJsonPath('data.rows.0.cost_breakdown.router_used', true)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_payroll_price_per_meter', 4700)
            ->assertJsonPath('data.rows.0.cost_breakdown.cable_payroll_source', 'inventory_default')
            ->assertJsonPath('data.rows.0.installation_cost_total', 368000);
    }

    public function test_inventory_payroll_default_pricing_does_not_change_report_material_pricing(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $pricing = InstallationPricing::query()->create([
            'cable_price_per_meter' => 1800,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 230000,
        ]);

        $response = $this->actingAs($user)->putJson('/api/inventory/master/default-pricing', [
            'installation_labor_fee_default' => 65000,
            'installation_cable_rate_default' => 5200,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.installation_labor_fee_default', 65000)
            ->assertJsonPath('data.installation_cable_rate_default', 5200)
            ->assertJsonPath('data.report_material_pricing.cable_price_per_meter', 1800)
            ->assertJsonPath('data.report_material_pricing.router_unit_price', 230000);

        $this->assertSame('5200', SiteSetting::get('default_installation_cable_rate_payroll'));
        $this->assertCount(1, InstallationPricing::query()->get());
        $this->assertSame($pricing->id, InstallationPricing::query()->firstOrFail()->id);
        $this->assertSame(1800.0, (float) InstallationPricing::query()->firstOrFail()->cable_price_per_meter);
    }
}

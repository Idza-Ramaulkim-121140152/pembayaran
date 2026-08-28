<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\CompanyFinanceReceiver;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\InstallationPricing;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\Package;
use App\Models\PaymentReceiptOption;
use App\Models\PaymentReceiverApprovalRequest;
use App\Models\PaymentReceiverUserMapping;
use App\Models\CustomerInstallationCostSnapshot;
use App\Models\PayrollMember;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\MikroTikService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class CustomerVerificationInstallationIncomeFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $mikrotik = Mockery::mock(MikroTikService::class);
        $mikrotik->shouldReceive('getNextIpAddress')->andReturn('10.10.10.10');
        $mikrotik->shouldReceive('createPPPoESecret')->andReturn([
            'name' => 'ABCDEF-john001',
            'password' => 'admin',
            'profile' => 'BasicProfile',
            'remote_address' => '10.10.10.10',
        ]);
        $mikrotik->shouldReceive('removePPPoESecret')->andReturnTrue();
        $this->app->instance(MikroTikService::class, $mikrotik);
    }

    public function test_customer_verification_with_zero_installation_fee_does_not_create_installation_mutation(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);

        $response = $this->actingAs($actor)->post('/api/customer-verification/verify', $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-zero',
            'installation_fee' => 0,
        ]), ['Accept' => 'application/json']);

        $response->assertOk();
        $this->assertDatabaseCount('customers', 1);
        $this->assertDatabaseMissing('financial_transactions', [
            'source' => 'installation_income',
        ]);
    }

    public function test_customer_verification_requires_cable_usage_when_installation_team_enabled(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);

        $response = $this->actingAs($actor)->post('/api/customer-verification/verify', $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-cable-required',
            'enable_installation_team' => 1,
            'installation_cable_used' => '',
        ]), ['Accept' => 'application/json']);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['installation_cable_used']);
    }

    public function test_customer_verification_saves_separate_cable_material_and_payroll_rates(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);
        $member = PayrollMember::query()->create([
            'nama' => 'Teknisi Kabel',
            'telepon' => '081234567890',
        ]);

        SiteSetting::set('default_installation_cable_rate_payroll', '350');
        InstallationPricing::query()->create([
            'cable_price_per_meter' => 1200,
            'connector_unit_price' => 8000,
            'connector_quantity_default' => 2,
            'router_unit_price' => 225000,
        ]);

        $payload = $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-cable-snapshot-ok',
            'enable_installation_team' => 1,
            'installer_member_ids' => [$member->id],
            'installation_cable_used' => 10,
            'installation_labor_fee' => 45000,
        ]);

        $response = $this->actingAs($actor)->post('/api/customer-verification/verify', $payload, ['Accept' => 'application/json']);
        $response->assertOk();

        $snapshot = CustomerInstallationCostSnapshot::query()->firstOrFail();
        $this->assertSame(1200.0, (float) $snapshot->cable_material_price_per_meter);
        $this->assertSame(350.0, (float) $snapshot->cable_payroll_price_per_meter);
        $this->assertSame(15500.0, (float) $snapshot->cable_total);
        $this->assertSame(76500.0, (float) $snapshot->total_cost);
    }

    public function test_customer_verification_self_confirm_non_company_finance_creates_installation_debt_and_auto_borrower(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);
        $receipt = PaymentReceiptOption::query()->firstOrFail();

        $response = $this->actingAs($actor)->post('/api/customer-verification/verify', $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-self-debt',
            'installation_fee' => 200000,
            'payment_receipt_option_id' => $receipt->id,
            'payment_receiver_user_id' => $actor->id,
        ]), ['Accept' => 'application/json']);

        $response->assertOk();
        $customer = Customer::query()->firstOrFail();

        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'installation_income',
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);

        $borrower = Borrower::query()->where('mapped_user_id', $actor->id)->firstOrFail();
        $loan = BorrowerLoan::query()->firstOrFail();
        $this->assertSame($borrower->id, $loan->borrower_id);
        $this->assertSame('installation_fee_receiver_mismatch', $loan->source);
        $this->assertSame(200000, (int) $loan->amount);
    }

    public function test_customer_verification_self_confirm_company_finance_does_not_create_debt(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);
        CompanyFinanceReceiver::query()->create([
            'user_id' => $actor->id,
            'is_active' => true,
        ]);
        $receipt = PaymentReceiptOption::query()->firstOrFail();

        $this->actingAs($actor)->post('/api/customer-verification/verify', $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-company-self',
            'installation_fee' => 210000,
            'payment_receipt_option_id' => $receipt->id,
            'payment_receiver_user_id' => $actor->id,
        ]), ['Accept' => 'application/json'])->assertOk();

        $customer = Customer::query()->firstOrFail();
        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'installation_income',
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => FinancialTransaction::STATUS_CONFIRMED,
        ]);
        $this->assertDatabaseCount('borrower_loans', 0);
    }

    public function test_customer_verification_with_mapped_other_receiver_creates_pending_installation_mutation_and_approval(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        Borrower::query()->create([
            'name' => 'Borrower Installation Approval',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        $receipt = PaymentReceiptOption::query()->firstOrFail();

        $this->actingAs($actor)->post('/api/customer-verification/verify', $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-install-approval',
            'installation_fee' => 220000,
            'payment_receipt_option_id' => $receipt->id,
            'payment_receiver_user_id' => $receiver->id,
            'other_receiver_confirmed' => 1,
            'receiver_conflict_resolution' => 'approval',
        ]), ['Accept' => 'application/json'])->assertOk();

        $customer = Customer::query()->firstOrFail();
        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();

        $this->assertSame('installation_income', $approval->source_type);
        $this->assertSame($customer->id, $approval->source_id);
        $this->assertSame($customer->id, $approval->customer_id);
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_PENDING,
        ]);
    }

    public function test_rejecting_installation_income_approval_creates_debt(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'can_choose_payment_receiver' => true,
        ]);
        $receiver = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $borrower = Borrower::query()->create([
            'name' => 'Borrower Installation Reject',
            'mapped_user_id' => $actor->id,
            'is_active' => true,
        ]);
        PaymentReceiverUserMapping::query()->create([
            'user_id' => $actor->id,
            'receiver_user_id' => $receiver->id,
        ]);
        $receipt = PaymentReceiptOption::query()->firstOrFail();

        $this->actingAs($actor)->post('/api/customer-verification/verify', $this->verificationPayload([
            'google_sheets_timestamp' => 'ts-install-reject',
            'installation_fee' => 230000,
            'payment_receipt_option_id' => $receipt->id,
            'payment_receiver_user_id' => $receiver->id,
            'other_receiver_confirmed' => 1,
            'receiver_conflict_resolution' => 'approval',
        ]), ['Accept' => 'application/json'])->assertOk();

        $approval = PaymentReceiverApprovalRequest::query()->firstOrFail();

        $this->actingAs($receiver)->postJson('/api/payment-receiver-approvals/' . $approval->id . '/reject')
            ->assertOk();

        $loan = BorrowerLoan::query()->firstOrFail();
        $this->assertSame($borrower->id, $loan->borrower_id);
        $this->assertSame('installation_fee_receiver_rejected', $loan->source);
        $this->assertDatabaseHas('financial_transactions', [
            'id' => $approval->financial_transaction_id,
            'status' => FinancialTransaction::STATUS_REJECTED,
        ]);
    }

    private function verificationPayload(array $overrides = []): array
    {
        $kecamatan = MasterWilayahKecamatan::query()->create([
            'name' => 'Kecamatan A' . ($overrides['google_sheets_timestamp'] ?? 'x'),
            'code' => strtoupper(substr(md5((string) ($overrides['google_sheets_timestamp'] ?? 'x')), 0, 3)),
        ]);
        $desa = MasterWilayahDesa::query()->create([
            'kecamatan_id' => $kecamatan->id,
            'name' => 'Desa A',
            'code' => 'DS1',
        ]);
        $dusun = MasterWilayahDusun::query()->create([
            'desa_id' => $desa->id,
            'name' => 'Dusun A',
            'code' => 'DN1',
        ]);
        Package::query()->create([
            'name' => 'Paket Basic ' . ($overrides['google_sheets_timestamp'] ?? 'x'),
            'speed' => '20Mbps',
            'mikrotik_profile' => 'BasicProfile',
            'price' => 100000,
            'device_count' => '3 Device',
            'is_active' => true,
        ]);

        return array_merge([
            'google_sheets_timestamp' => 'ts-default',
            'name' => 'John Installation',
            'phone' => '0',
            'email' => 'john@example.com',
            'address' => 'Jl. Test',
            'gender' => 'male',
            'package_type' => 'Paket Basic ' . ($overrides['google_sheets_timestamp'] ?? 'x'),
            'activation_date' => now()->toDateString(),
            'due_date' => now()->addDays(30)->toDateString(),
            'odp' => '',
            'installation_fee' => 0,
            'latitude' => '',
            'longitude' => '',
            'is_active' => 1,
            'kecamatan_id' => $kecamatan->id,
            'desa_id' => $desa->id,
            'dusun_id' => $dusun->id,
            'enable_home_router' => 0,
            'enable_installation_team' => 0,
        ], $overrides);
    }
}

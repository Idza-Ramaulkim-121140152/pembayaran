<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\FinancialTransaction;
use App\Models\PayrollMember;
use App\Models\PayrollMemberPayment;
use App\Models\PayrollProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollLoanDeductionTest extends TestCase
{
    use RefreshDatabase;

    public function test_payroll_payment_can_deduct_mapped_borrower_loan_and_still_create_expense_mutation(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $member = PayrollMember::query()->create(['nama' => 'Karyawan Pinjaman']);
        $mappedUser = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'payroll_member_id' => $member->id,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Borrower Karyawan',
            'mapped_user_id' => $mappedUser->id,
            'is_active' => true,
        ]);
        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => '2026-07-30 09:00:00',
        ]);
        $project = PayrollProject::query()->create([
            'tanggal' => '2026-07-30',
            'total' => 150000,
            'status' => 'unpaid',
        ]);
        $project->members()->attach($member->id, ['bagian' => 150000]);

        $this->actingAs($actor)->postJson("/api/payroll/members/{$member->id}/pay", [
            'nominal' => 80000,
            'catatan' => 'Bayar payroll dengan potong pinjaman',
            'loan_handling' => 'deduct_loan',
            'loan_deduction_amount' => 30000,
        ])->assertOk()
            ->assertJsonPath('remaining', 70000);

        $payment = PayrollMemberPayment::query()->firstOrFail();
        $this->assertSame(80000, (int) $payment->nominal);
        $this->assertSame('deduct_loan', $payment->loan_handling);
        $this->assertSame(30000, (int) $payment->loan_deduction_amount);
        $this->assertSame(50000, (int) $payment->cash_paid_amount);
        $this->assertSame($borrower->id, $payment->borrower_id);
        $this->assertNotNull($payment->borrower_loan_settlement_action_group_key);

        $this->assertDatabaseHas('borrower_loan_payments', [
            'borrower_loan_id' => $loan->id,
            'amount' => 30000,
        ]);
        $this->assertSame(30000, (int) $loan->fresh()->settled_amount);

        $transaction = FinancialTransaction::query()
            ->where('source', 'payroll')
            ->where('reference_type', PayrollMemberPayment::class)
            ->where('reference_id', $payment->id)
            ->firstOrFail();

        $this->assertSame('expense', $transaction->type);
        $this->assertSame(80000, (int) $transaction->amount);
        $this->assertSame(30000.0, (float) data_get($transaction->meta, 'loan_deduction_amount'));
        $this->assertSame(50000.0, (float) data_get($transaction->meta, 'cash_paid_amount'));
    }

    public function test_payroll_payment_without_loan_deduction_only_creates_expense_mutation(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $member = PayrollMember::query()->create(['nama' => 'Karyawan Tunai']);
        $project = PayrollProject::query()->create([
            'tanggal' => '2026-07-30',
            'total' => 90000,
            'status' => 'unpaid',
        ]);
        $project->members()->attach($member->id, ['bagian' => 90000]);

        $this->actingAs($actor)->postJson("/api/payroll/members/{$member->id}/pay", [
            'nominal' => 40000,
            'catatan' => 'Bayar payroll tunai',
            'loan_handling' => 'cash',
        ])->assertOk()
            ->assertJsonPath('remaining', 50000);

        $payment = PayrollMemberPayment::query()->firstOrFail();
        $this->assertSame('cash', $payment->loan_handling);
        $this->assertSame(0, (int) $payment->loan_deduction_amount);
        $this->assertSame(40000, (int) $payment->cash_paid_amount);
        $this->assertDatabaseCount('borrower_loan_payments', 0);
        $this->assertDatabaseHas('financial_transactions', [
            'source' => 'payroll',
            'reference_type' => PayrollMemberPayment::class,
            'reference_id' => $payment->id,
            'type' => 'expense',
            'amount' => 40000,
        ]);
    }

    public function test_payroll_loan_deduction_cannot_exceed_payroll_amount(): void
    {
        $actor = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $member = PayrollMember::query()->create(['nama' => 'Karyawan Limit']);
        $mappedUser = User::factory()->create([
            'role' => User::ROLE_TEKNISI,
            'payroll_member_id' => $member->id,
        ]);
        $borrower = Borrower::query()->create([
            'name' => 'Borrower Limit',
            'mapped_user_id' => $mappedUser->id,
            'is_active' => true,
        ]);
        BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 100000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => '2026-07-30 09:00:00',
        ]);
        $project = PayrollProject::query()->create([
            'tanggal' => '2026-07-30',
            'total' => 50000,
            'status' => 'unpaid',
        ]);
        $project->members()->attach($member->id, ['bagian' => 50000]);

        $this->actingAs($actor)->postJson("/api/payroll/members/{$member->id}/pay", [
            'nominal' => 50000,
            'loan_handling' => 'deduct_loan',
            'loan_deduction_amount' => 60000,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Nominal bayar pinjaman tidak boleh lebih besar dari jumlah payroll.');

        $this->assertDatabaseCount('payroll_member_payments', 0);
        $this->assertDatabaseCount('borrower_loan_payments', 0);
    }
}

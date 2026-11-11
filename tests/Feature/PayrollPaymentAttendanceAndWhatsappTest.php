<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\EmployeeAttendance;
use App\Models\FinancialTransaction;
use App\Models\NotificationLog;
use App\Models\PayrollMember;
use App\Models\PayrollMemberAllowance;
use App\Models\PayrollMemberPayment;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\AttendanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PayrollPaymentAttendanceAndWhatsappTest extends TestCase
{
    use RefreshDatabase;

    public function test_monthly_employee_with_zero_project_unpaid_can_be_paid_with_attendance_bank_and_whatsapp(): void
    {
        Http::fake([
            'http://localhost:3001/send-bulk' => Http::response([
                'success' => true,
                'results' => [[
                    'phone' => '081234567890',
                    'success' => true,
                    'error' => null,
                ]],
            ], 200),
        ]);

        SiteSetting::set(AttendanceService::SETTING_MONTHLY_RESET_DAY, '1');
        SiteSetting::set('company_name', 'Rumah Kita Net');

        $actor = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $member = PayrollMember::query()->create([
            'nama' => 'Kholid Rosidi',
            'telepon' => '081234567890',
            'tipe_gaji' => 'bulanan',
            'gaji_pokok' => 2200000,
            'tunjangan' => 260000,
            'tanggal_gajian' => 14,
            'nama_bank' => null,
            'nomor_rekening' => null,
            'atas_nama_rekening' => null,
            'is_active' => true,
        ]);

        $employeeUser = User::factory()->create([
            'name' => 'Kholid Rosidi',
            'role' => User::ROLE_TEKNISI,
            'is_employee' => true,
            'phone' => '081234567890',
            'payroll_member_id' => $member->id,
        ]);

        $borrower = Borrower::query()->create([
            'name' => 'Kholid Rosidi',
            'mapped_user_id' => $employeeUser->id,
            'is_active' => true,
        ]);

        $loan = BorrowerLoan::query()->create([
            'borrower_id' => $borrower->id,
            'amount' => 825000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'source' => 'manual_loan',
            'occurred_at' => now()->subDays(10),
        ]);

        $monthDay1 = now()->startOfMonth()->format('Y-m-d');
        $monthDay2 = now()->startOfMonth()->addDay()->format('Y-m-d');

        EmployeeAttendance::query()->create([
            'user_id' => $employeeUser->id,
            'date' => $monthDay1,
            'clock_in_at' => $monthDay1 . ' 08:00:00',
            'clock_out_at' => $monthDay1 . ' 17:00:00',
            'clock_in_status' => 'on_time',
            'clock_in_late_minutes' => 0,
            'work_duration_minutes' => 540,
            'status' => 'present',
        ]);

        EmployeeAttendance::query()->create([
            'user_id' => $employeeUser->id,
            'date' => $monthDay2,
            'clock_in_at' => $monthDay2 . ' 08:15:00',
            'clock_out_at' => $monthDay2 . ' 17:15:00',
            'clock_in_status' => 'late',
            'clock_in_late_minutes' => 15,
            'work_duration_minutes' => 540,
            'status' => 'present',
        ]);

        // 1. Fetch payments + attendance summary when clicking "Bayar"
        $previewResponse = $this->actingAs($actor)
            ->getJson("/api/payroll/members/{$member->id}/payments")
            ->assertOk();

        $previewResponse->assertJsonPath('attendance_summary.linked', true);
        $previewResponse->assertJsonPath('attendance_summary.total_present', 2);
        $previewResponse->assertJsonPath('attendance_summary.total_on_time', 1);
        $previewResponse->assertJsonPath('attendance_summary.total_late', 1);
        $previewResponse->assertJsonPath('attendance_summary.total_late_minutes', 15);
        $previewResponse->assertJsonPath('attendance_summary.total_hours_formatted', '18 jam 0 mnt');
        $previewResponse->assertJsonPath('loan_context.outstanding', 825000);

        // 2. Confirm & pay monthly salary (no project parts attached => remaining = 0)
        $payResponse = $this->actingAs($actor)
            ->postJson("/api/payroll/members/{$member->id}/pay", [
                'nominal' => 2460000,
                'catatan' => 'Gaji Bulanan - Kholid Rosidi',
                'loan_handling' => 'deduct_loan',
                'loan_deduction_amount' => 825000,
                'payment_method' => 'transfer',
                'bank_name' => 'BCA',
                'account_number' => '1234567890',
                'account_holder' => 'Kholid Rosidi',
                'save_bank_to_member' => true,
                'attendance_confirmed' => true,
                'attendance_note' => 'Shift lengkap bulan berjalan',
                'send_whatsapp' => true,
            ])
            ->assertOk();

        $payResponse->assertJsonPath('whatsapp.status', 'sent');
        $payResponse->assertJsonPath('payment.payment_method', 'transfer');
        $payResponse->assertJsonPath('payment.bank_name', 'BCA');
        $payResponse->assertJsonPath('payment.account_number', '1234567890');
        $payResponse->assertJsonPath('payment.account_holder', 'Kholid Rosidi');
        $payResponse->assertJsonPath('payment.whatsapp_status', 'sent');

        // Member bank details saved automatically
        $member->refresh();
        $this->assertSame('BCA', $member->nama_bank);
        $this->assertSame('1234567890', $member->nomor_rekening);
        $this->assertSame('Kholid Rosidi', $member->atas_nama_rekening);

        // Loan settled and ledger updated
        $this->assertSame(825000, (int) $loan->fresh()->settled_amount);
        $payment = PayrollMemberPayment::query()->firstOrFail();
        $this->assertSame(1635000, (int) $payment->cash_paid_amount);
        $this->assertSame(2, (int) data_get($payment->attendance_summary, 'total_present'));
        $this->assertSame('18 jam 0 mnt', data_get($payment->attendance_summary, 'total_hours_formatted'));

        $transaction = FinancialTransaction::query()
            ->where('source', 'payroll')
            ->where('reference_id', $payment->id)
            ->firstOrFail();
        $this->assertSame('BCA', data_get($transaction->meta, 'bank_name'));
        $this->assertSame('1234567890', data_get($transaction->meta, 'account_number'));

        // Verify WhatsApp payload contains work time, salary, loan deduction, net payable, and destination bank
        Http::assertSent(function ($request) {
            $data = $request->data();
            $phone = $data['recipients'][0]['phone'] ?? '';
            $message = $data['message'] ?? '';

            return $phone === '081234567890'
                && str_contains($message, '2 hari')
                && str_contains($message, '18 jam 0 mnt')
                && str_contains($message, 'Rp 2.460.000')
                && str_contains($message, 'Rp 825.000')
                && str_contains($message, 'Rp 1.635.000')
                && str_contains($message, 'BCA')
                && str_contains($message, '1234567890');
        });

        $this->assertDatabaseHas('notification_logs', [
            'phone' => '081234567890',
            'status' => 'sent',
        ]);
        $log = NotificationLog::query()->firstOrFail();
        $this->assertSame('payroll_salary_slip', data_get($log->meta, 'type'));
    }

    public function test_employee_can_update_own_bank_info_on_profile_and_exposed_via_api_user(): void
    {
        $member = PayrollMember::query()->create([
            'nama' => 'Budi Teknisi',
            'telepon' => '081300001111',
            'tipe_gaji' => 'bulanan',
            'gaji_pokok' => 2000000,
        ]);

        $employee = User::factory()->create([
            'name' => 'Budi Teknisi',
            'role' => User::ROLE_TEKNISI,
            'is_employee' => true,
            'payroll_member_id' => $member->id,
        ]);

        $this->actingAs($employee)
            ->patchJson('/api/profile/bank', [
                'nama_bank' => 'BRI',
                'nomor_rekening' => '009988776655',
                'atas_nama_rekening' => 'Budi Santoso',
                'telepon' => '081300002222',
            ])
            ->assertOk()
            ->assertJsonPath('payroll_member.nama_bank', 'BRI')
            ->assertJsonPath('payroll_member.nomor_rekening', '009988776655')
            ->assertJsonPath('payroll_member.atas_nama_rekening', 'Budi Santoso');

        $this->actingAs($employee)
            ->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('payroll_member.nama_bank', 'BRI')
            ->assertJsonPath('payroll_member.nomor_rekening', '009988776655')
            ->assertJsonPath('payroll_member.atas_nama_rekening', 'Budi Santoso');
    }

    public function test_whatsapp_failure_does_not_abort_payroll_payment_and_records_failed_status(): void
    {
        Http::fake([
            'http://localhost:3001/send-bulk' => Http::response(['error' => 'Gateway down'], 500),
        ]);

        $actor = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $member = PayrollMember::query()->create([
            'nama' => 'Danang',
            'telepon' => '085612341234',
            'tipe_gaji' => 'bulanan',
            'gaji_pokok' => 1500000,
        ]);

        $response = $this->actingAs($actor)
            ->postJson("/api/payroll/members/{$member->id}/pay", [
                'nominal' => 1500000,
                'payment_method' => 'cash',
                'send_whatsapp' => true,
            ])
            ->assertOk();

        $response->assertJsonPath('whatsapp.status', 'failed');
        $response->assertJsonPath('payment.payment_method', 'cash');

        $payment = PayrollMemberPayment::query()->firstOrFail();
        $this->assertSame('failed', $payment->whatsapp_status);
        $this->assertSame(1500000, (int) $payment->cash_paid_amount);
    }

    public function test_employee_multiple_monthly_and_daily_allowances_calculate_by_attendance_date_range_and_send_itemized_whatsapp(): void
    {
        Http::fake([
            'http://localhost:3001/send-bulk' => Http::response([
                'success' => true,
                'results' => [[
                    'phone' => '081999888777',
                    'success' => true,
                    'error' => null,
                ]],
            ], 200),
        ]);

        SiteSetting::set('company_name', 'Rumah Kita Net');
        $actor = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        // 1. Create payroll member with 1 monthly allowance and 2 daily allowances
        $createRes = $this->actingAs($actor)
            ->postJson('/api/payroll/members', [
                'nama' => 'Rendi Teknisi',
                'telepon' => '081999888777',
                'tipe_gaji' => 'bulanan',
                'gaji_pokok' => 2000000,
                'allowances' => [
                    ['nama' => 'Tunjangan Jabatan', 'jenis' => 'bulanan', 'nominal' => 300000],
                    ['nama' => 'Uang Makan', 'jenis' => 'harian', 'nominal' => 25000],
                    ['nama' => 'Uang Transport', 'jenis' => 'harian', 'nominal' => 15000],
                ],
                'tanggal_gajian' => 1,
                'nama_bank' => 'BRI',
                'nomor_rekening' => '1122334455',
                'atas_nama_rekening' => 'Rendi Teknisi',
                'is_active' => true,
            ])
            ->assertCreated();

        $createRes->assertJsonPath('data.tunjangan', 300000);
        $createRes->assertJsonPath('data.tunjangan_bulanan_total', 300000);
        $createRes->assertJsonPath('data.tunjangan_harian_per_hari', 40000);
        $createRes->assertJsonPath('data.total_gaji_bulanan', 2300000);
        $memberId = (int) $createRes->json('data.id');

        $this->assertSame(3, PayrollMemberAllowance::query()->where('payroll_member_id', $memberId)->count());

        // 2. Link employee user & record attendance (3 present in target range, 1 absent in range, 1 present outside range)
        $employeeUser = User::factory()->create([
            'name' => 'Rendi Teknisi',
            'role' => User::ROLE_TEKNISI,
            'is_employee' => true,
            'phone' => '081999888777',
            'payroll_member_id' => $memberId,
        ]);

        foreach (['2026-10-05', '2026-10-06'] as $presentDate) {
            EmployeeAttendance::query()->create([
                'user_id' => $employeeUser->id,
                'date' => $presentDate,
                'clock_in_at' => $presentDate . ' 08:00:00',
                'clock_out_at' => $presentDate . ' 17:00:00',
                'clock_in_status' => 'on_time',
                'clock_in_late_minutes' => 0,
                'work_duration_minutes' => 540,
                'status' => 'present',
            ]);
        }

        // Late attendance still counts as attending ("masuk")
        EmployeeAttendance::query()->create([
            'user_id' => $employeeUser->id,
            'date' => '2026-10-10',
            'clock_in_at' => '2026-10-10 08:20:00',
            'clock_out_at' => '2026-10-10 17:00:00',
            'clock_in_status' => 'late',
            'clock_in_late_minutes' => 20,
            'work_duration_minutes' => 520,
            'status' => 'late',
        ]);

        // Absent without clock-in inside range MUST NOT earn daily allowance
        EmployeeAttendance::query()->create([
            'user_id' => $employeeUser->id,
            'date' => '2026-10-12',
            'clock_in_at' => null,
            'clock_out_at' => null,
            'status' => 'absent',
        ]);

        // Present outside queried range MUST NOT count for 2026-10-05..2026-10-20
        EmployeeAttendance::query()->create([
            'user_id' => $employeeUser->id,
            'date' => '2026-10-25',
            'clock_in_at' => '2026-10-25 08:00:00',
            'clock_out_at' => '2026-10-25 17:00:00',
            'clock_in_status' => 'on_time',
            'clock_in_late_minutes' => 0,
            'work_duration_minutes' => 540,
            'status' => 'present',
        ]);

        // 3. Query attendance range 2026-10-05..2026-10-20 => 3 attendance days
        $previewNarrow = $this->actingAs($actor)
            ->getJson("/api/payroll/members/{$memberId}/payments?start_date=2026-10-05&end_date=2026-10-20")
            ->assertOk();

        $previewNarrow->assertJsonPath('attendance_summary.total_present', 3);
        $previewNarrow->assertJsonPath('salary_breakdown.gaji_pokok', 2000000);
        $previewNarrow->assertJsonPath('salary_breakdown.attendance_days', 3);
        $previewNarrow->assertJsonPath('salary_breakdown.tunjangan_bulanan_total', 300000);
        $previewNarrow->assertJsonPath('salary_breakdown.tunjangan_harian_per_hari', 40000);
        $previewNarrow->assertJsonPath('salary_breakdown.tunjangan_harian_total', 120000);
        $previewNarrow->assertJsonPath('salary_breakdown.total_gaji_dihitung', 2420000);

        // 4. Query full October range 2026-10-05..2026-10-31 => 4 attendance days
        $previewWide = $this->actingAs($actor)
            ->getJson("/api/payroll/members/{$memberId}/payments?start_date=2026-10-05&end_date=2026-10-31")
            ->assertOk();

        $previewWide->assertJsonPath('attendance_summary.total_present', 4);
        $previewWide->assertJsonPath('salary_breakdown.tunjangan_harian_total', 160000);
        $previewWide->assertJsonPath('salary_breakdown.total_gaji_dihitung', 2460000);

        // 5. Pay for the 3-day range (2026-10-05..2026-10-20) => Rp 2.420.000
        $payRes = $this->actingAs($actor)
            ->postJson("/api/payroll/members/{$memberId}/pay", [
                'nominal' => 2420000,
                'payment_method' => 'transfer',
                'bank_name' => 'BRI',
                'account_number' => '1122334455',
                'account_holder' => 'Rendi Teknisi',
                'attendance_start_date' => '2026-10-05',
                'attendance_end_date' => '2026-10-20',
                'attendance_confirmed' => true,
                'send_whatsapp' => true,
            ])
            ->assertOk();

        $payRes->assertJsonPath('payment.allowance_breakdown.attendance_days', 3);
        $payRes->assertJsonPath('payment.allowance_breakdown.tunjangan_bulanan_total', 300000);
        $payRes->assertJsonPath('payment.allowance_breakdown.tunjangan_harian_total', 120000);
        $payRes->assertJsonPath('payment.allowance_breakdown.total_gaji_dihitung', 2420000);

        Http::assertSent(function ($request) {
            $data = $request->data();
            $message = $data['message'] ?? '';

            return ($data['recipients'][0]['phone'] ?? '') === '081999888777'
                && str_contains($message, 'Gaji Pokok: Rp 2.000.000')
                && str_contains($message, 'Tunjangan Bulanan (Tunjangan Jabatan): Rp 300.000')
                && str_contains($message, 'Tunjangan Harian (Uang Makan): 3 hr x Rp 25.000 = Rp 75.000')
                && str_contains($message, 'Tunjangan Harian (Uang Transport): 3 hr x Rp 15.000 = Rp 45.000')
                && str_contains($message, 'Rp 2.420.000');
        });
    }
}

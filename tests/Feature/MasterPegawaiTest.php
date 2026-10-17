<?php

namespace Tests\Feature;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\PayrollMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MasterPegawaiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_unified_employees(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $payroll = PayrollMember::create([
            'nama' => 'Teknisi Satu',
            'telepon' => '081234567891',
            'tipe_gaji' => 'bulanan',
            'gaji_pokok' => 3000000,
            'tunjangan' => 500000,
            'tanggal_gajian' => 25,
            'is_active' => true,
        ]);

        $tech = User::factory()->create([
            'name' => 'Teknisi Satu',
            'email' => 'tech1@example.com',
            'phone' => '081234567891',
            'role' => User::ROLE_TEKNISI,
            'is_employee' => true,
            'payroll_member_id' => $payroll->id,
        ]);

        $borrower = Borrower::create([
            'name' => 'Teknisi Satu',
            'phone' => '081234567891',
            'mapped_user_id' => $tech->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/master-pegawai');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ])
            ->assertJsonStructure([
                'data',
                'metrics' => [
                    'total_employees',
                    'total_with_account',
                    'total_with_payroll',
                    'total_with_loans',
                    'total_present_today',
                    'total_unsynced',
                ],
            ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data);
        $found = collect($data)->firstWhere('nama', 'Teknisi Satu');
        $this->assertNotNull($found);
        $this->assertEquals('synced', $found['sync_status']);
        $this->assertEquals($tech->id, $found['user']['id']);
        $this->assertEquals($payroll->id, $found['payroll']['id']);
        $this->assertEquals($borrower->id, $found['borrower']['id']);
    }

    public function test_can_create_employee_with_account_payroll_and_borrower(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $response = $this->actingAs($admin)->postJson('/api/master-pegawai', [
            'name' => 'Ahmad Teknisi',
            'phone' => '089876543210',
            'create_account' => true,
            'email' => 'ahmad@example.com',
            'password' => 'secret123',
            'role' => User::ROLE_TEKNISI,
            'create_payroll' => true,
            'tipe_gaji' => 'bulanan',
            'gaji_pokok' => 3500000,
            'tunjangan' => 200000,
            'tanggal_gajian' => 28,
            'nama_bank' => 'BCA',
            'nomor_rekening' => '882109281',
            'create_borrower' => true,
            'borrower_notes' => 'Teknisi area timur',
        ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Pegawai berhasil ditambahkan dan disinkronkan ke seluruh sistem.',
            ]);

        $this->assertDatabaseHas('users', [
            'name' => 'Ahmad Teknisi',
            'email' => 'ahmad@example.com',
            'phone' => '089876543210',
            'role' => User::ROLE_TEKNISI,
            'is_employee' => true,
        ]);

        $this->assertDatabaseHas('payroll_members', [
            'nama' => 'Ahmad Teknisi',
            'telepon' => '089876543210',
            'gaji_pokok' => 3500000,
            'nama_bank' => 'BCA',
        ]);

        $this->assertDatabaseHas('borrowers', [
            'name' => 'Ahmad Teknisi',
            'phone' => '089876543210',
            'notes' => 'Teknisi area timur',
        ]);

        $user = User::where('email', 'ahmad@example.com')->first();
        $payroll = PayrollMember::where('nama', 'Ahmad Teknisi')->first();
        $borrower = Borrower::where('name', 'Ahmad Teknisi')->first();

        $this->assertEquals($payroll->id, $user->payroll_member_id);
        $this->assertEquals($user->id, $borrower->mapped_user_id);
    }

    public function test_can_update_employee_syncs_name_and_phone_across_models(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $payroll = PayrollMember::create([
            'nama' => 'Budi Lama',
            'telepon' => '08111111111',
            'tipe_gaji' => 'bulanan',
            'gaji_pokok' => 2500000,
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'name' => 'Budi Lama',
            'email' => 'budi@example.com',
            'phone' => '08111111111',
            'role' => User::ROLE_TEKNISI,
            'payroll_member_id' => $payroll->id,
        ]);

        $borrower = Borrower::create([
            'name' => 'Budi Lama',
            'phone' => '08111111111',
            'mapped_user_id' => $user->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin)->putJson("/api/master-pegawai/u_{$user->id}", [
            'name' => 'Budi Baru',
            'phone' => '08222222222',
            'email' => 'budi.baru@example.com',
            'gaji_pokok' => 3200000,
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);

        // Assert all 3 models are updated in sync!
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'Budi Baru',
            'phone' => '08222222222',
            'email' => 'budi.baru@example.com',
        ]);

        $this->assertDatabaseHas('payroll_members', [
            'id' => $payroll->id,
            'nama' => 'Budi Baru',
            'telepon' => '08222222222',
            'gaji_pokok' => 3200000,
        ]);

        $this->assertDatabaseHas('borrowers', [
            'id' => $borrower->id,
            'name' => 'Budi Baru',
            'phone' => '08222222222',
        ]);
    }

    public function test_auto_sync_reconciles_unlinked_records_by_phone_or_name(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        // User without payroll_member_id
        $user = User::factory()->create([
            'name' => 'Doni Wahyudi',
            'phone' => '081233334444',
            'role' => User::ROLE_TEKNISI,
            'is_employee' => true,
            'payroll_member_id' => null,
        ]);

        // Unlinked PayrollMember with same phone
        $payroll = PayrollMember::create([
            'nama' => 'Doni W',
            'telepon' => '+62 812-3333-4444',
            'gaji_pokok' => 4000000,
        ]);

        // Unlinked Borrower with same name
        $borrower = Borrower::create([
            'name' => 'Doni Wahyudi',
            'phone' => null,
            'mapped_user_id' => null,
        ]);

        $response = $this->actingAs($admin)->postJson('/api/master-pegawai/auto-sync');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);

        $user->refresh();
        $borrower->refresh();

        $this->assertEquals($payroll->id, $user->payroll_member_id);
        $this->assertEquals($user->id, $borrower->mapped_user_id);
        $this->assertEquals('081233334444', $borrower->phone);
    }

    public function test_can_manually_link_user_to_payroll_and_borrower(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $user = User::factory()->create([
            'name' => 'Eko Prasetyo',
            'phone' => '08555555555',
            'role' => User::ROLE_TEKNISI,
            'payroll_member_id' => null,
        ]);

        $payroll = PayrollMember::create([
            'nama' => 'Eko Staff',
            'telepon' => null,
            'gaji_pokok' => 3000000,
        ]);

        $borrower = Borrower::create([
            'name' => 'Eko Staff Peminjam',
            'phone' => null,
            'mapped_user_id' => null,
        ]);

        $response = $this->actingAs($admin)->postJson('/api/master-pegawai/link', [
            'user_id' => $user->id,
            'payroll_member_id' => $payroll->id,
            'borrower_id' => $borrower->id,
            'sync_attributes' => true,
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);

        $user->refresh();
        $payroll->refresh();
        $borrower->refresh();

        $this->assertEquals($payroll->id, $user->payroll_member_id);
        $this->assertEquals($user->id, $borrower->mapped_user_id);
        $this->assertEquals('08555555555', $payroll->telepon);
        $this->assertEquals('08555555555', $borrower->phone);
    }

    public function test_safe_destroy_deactivates_when_financial_records_exist(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $user = User::factory()->create([
            'name' => 'Ferry Kasbon',
            'phone' => '08777777777',
            'role' => User::ROLE_TEKNISI,
        ]);

        $borrower = Borrower::create([
            'name' => 'Ferry Kasbon',
            'phone' => '08777777777',
            'mapped_user_id' => $user->id,
            'is_active' => true,
        ]);

        // Create an outstanding loan
        BorrowerLoan::create([
            'borrower_id' => $borrower->id,
            'amount' => 500000,
            'settled_amount' => 0,
            'status' => BorrowerLoan::STATUS_OUTSTANDING,
            'occurred_at' => now(),
        ]);

        $response = $this->actingAs($admin)->deleteJson("/api/master-pegawai/u_{$user->id}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);

        $borrower->refresh();
        $user->refresh();

        // Must NOT be deleted from database, only deactivated!
        $this->assertDatabaseHas('borrowers', ['id' => $borrower->id]);
        $this->assertFalse($borrower->is_active);
        $this->assertFalse($user->is_employee);
    }
}

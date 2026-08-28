<?php

namespace Tests\Feature;

use App\Models\ExpenseCategory;
use App\Models\Pengeluaran;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExpenseCategoryManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_superadmin_can_manage_expense_categories(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);

        $createResponse = $this->actingAs($user)->postJson('/api/expense-categories', [
            'name' => 'Operasional Lapangan',
            'is_active' => true,
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.name', 'Operasional Lapangan')
            ->assertJsonPath('data.is_active', true);

        $category = ExpenseCategory::firstOrFail();

        $this->actingAs($user)->putJson("/api/expense-categories/{$category->id}", [
            'name' => 'Operasional Tim Lapangan',
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.name', 'Operasional Tim Lapangan')
            ->assertJsonPath('data.is_active', false);

        $this->actingAs($user)->deleteJson("/api/expense-categories/{$category->id}")
            ->assertOk();

        $this->assertDatabaseMissing('expense_categories', ['id' => $category->id]);
    }

    public function test_non_superadmin_cannot_manage_expense_categories(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);

        $this->actingAs($user)->postJson('/api/expense-categories', [
            'name' => 'Transport',
            'is_active' => true,
        ])->assertForbidden();
    }

    public function test_duplicate_expense_category_name_is_rejected_case_insensitively(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        ExpenseCategory::create([
            'name' => 'Transport',
            'is_active' => true,
        ]);

        $this->actingAs($user)->postJson('/api/expense-categories', [
            'name' => 'transport',
            'is_active' => true,
        ])->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nama jenis pengeluaran sudah digunakan.');
    }

    public function test_used_expense_category_cannot_be_deleted(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPERADMIN]);
        $category = ExpenseCategory::create([
            'name' => 'Operasional',
            'is_active' => true,
        ]);
        Pengeluaran::create([
            'tanggal' => now()->toDateString(),
            'jumlah' => 10000,
            'kategori' => 'Operasional',
            'expense_category_id' => $category->id,
            'detail' => 'Pengeluaran test',
            'user_id' => $user->id,
        ]);

        $this->actingAs($user)->deleteJson("/api/expense-categories/{$category->id}")
            ->assertStatus(422);
    }

    public function test_finance_only_sees_active_expense_categories(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        ExpenseCategory::create(['name' => 'Aktif', 'is_active' => true]);
        ExpenseCategory::create(['name' => 'Nonaktif', 'is_active' => false]);

        $response = $this->actingAs($user)->getJson('/api/expense-categories')
            ->assertOk()
            ->json('data');

        $names = collect($response)->pluck('name');

        $this->assertTrue($names->contains('Aktif'));
        $this->assertFalse($names->contains('Nonaktif'));
    }

    public function test_pengeluaran_create_and_update_use_master_category_and_keep_legacy_kategori(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $activeCategory = ExpenseCategory::create(['name' => 'Operasional', 'is_active' => true]);
        $otherCategory = ExpenseCategory::create(['name' => 'Transport', 'is_active' => true]);

        $createResponse = $this->actingAs($user)->postJson('/api/pengeluaran', [
            'tanggal' => '2026-07-10',
            'jumlah' => '12000',
            'expense_category_id' => $activeCategory->id,
            'detail' => 'Beli bensin',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.expense_category.name', 'Operasional')
            ->assertJsonPath('data.kategori', 'Operasional');

        $pengeluaran = Pengeluaran::firstOrFail();

        $this->assertDatabaseHas('pengeluarans', [
            'id' => $pengeluaran->id,
            'expense_category_id' => $activeCategory->id,
            'kategori' => 'Operasional',
        ]);

        $this->actingAs($user)->putJson("/api/pengeluaran/{$pengeluaran->id}", [
            'tanggal' => '2026-07-11',
            'jumlah' => '15000',
            'expense_category_id' => $otherCategory->id,
            'detail' => 'Beli tiket',
        ])->assertOk()
            ->assertJsonPath('data.expense_category.name', 'Transport')
            ->assertJsonPath('data.kategori', 'Transport');

        $this->assertDatabaseHas('pengeluarans', [
            'id' => $pengeluaran->id,
            'expense_category_id' => $otherCategory->id,
            'kategori' => 'Transport',
        ]);
    }

    public function test_pengeluaran_rejects_inactive_category(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $inactiveCategory = ExpenseCategory::create(['name' => 'Nonaktif', 'is_active' => false]);

        $this->actingAs($user)->postJson('/api/pengeluaran', [
            'tanggal' => '2026-07-10',
            'jumlah' => '12000',
            'expense_category_id' => $inactiveCategory->id,
            'detail' => 'Test',
        ])->assertStatus(422)
            ->assertJsonPath('errors.expense_category_id.0', 'Jenis pengeluaran yang dipilih sudah nonaktif.');
    }

    public function test_pengeluaran_index_returns_relation_and_fallback_legacy_category(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_FINANCE]);
        $category = ExpenseCategory::create(['name' => 'Operasional', 'is_active' => true]);

        Pengeluaran::create([
            'tanggal' => '2026-07-10',
            'jumlah' => 8000,
            'kategori' => 'Operasional',
            'expense_category_id' => $category->id,
            'detail' => 'Ada relasi',
            'user_id' => $user->id,
        ]);

        Pengeluaran::create([
            'tanggal' => '2026-07-09',
            'jumlah' => 5000,
            'kategori' => 'Legacy Manual',
            'expense_category_id' => null,
            'detail' => 'Tanpa relasi',
            'user_id' => $user->id,
        ]);

        $this->actingAs($user)->getJson('/api/pengeluaran')
            ->assertOk()
            ->assertJsonPath('data.0.kategori', 'Operasional')
            ->assertJsonPath('data.0.expense_category.name', 'Operasional')
            ->assertJsonPath('data.1.kategori', 'Legacy Manual')
            ->assertJsonPath('data.1.expense_category', null);
    }
}

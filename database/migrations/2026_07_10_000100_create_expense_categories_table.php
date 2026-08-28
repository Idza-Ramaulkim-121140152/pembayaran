<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('expense_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('pengeluarans', function (Blueprint $table) {
            $table->foreignId('expense_category_id')
                ->nullable()
                ->after('kategori')
                ->constrained('expense_categories')
                ->nullOnDelete();
        });

        $seedNames = [
            'Inventori',
            'Lain-Lain',
            'Lainnya',
            'Maintenance',
            'Operasional',
            'Pembayaran Bandwith',
            'Pembayaran Pinjaman',
            'Pembelian Alat',
            'Peralatan',
            'Transport',
        ];

        $existingNames = DB::table('pengeluarans')
            ->whereNotNull('kategori')
            ->where('kategori', '!=', '')
            ->distinct()
            ->pluck('kategori')
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->values()
            ->all();

        $names = collect(array_merge($seedNames, $existingNames))
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique(fn ($name) => mb_strtolower($name))
            ->values();

        $now = now();
        $rows = $names->map(fn ($name) => [
            'name' => $name,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        if ($rows !== []) {
            DB::table('expense_categories')->insert($rows);
        }

        $categories = DB::table('expense_categories')->get(['id', 'name']);
        foreach ($categories as $category) {
            DB::table('pengeluarans')
                ->whereRaw('LOWER(TRIM(kategori)) = ?', [mb_strtolower(trim((string) $category->name))])
                ->update(['expense_category_id' => $category->id]);
        }
    }

    public function down(): void
    {
        Schema::table('pengeluarans', function (Blueprint $table) {
            $table->dropConstrainedForeignId('expense_category_id');
        });

        Schema::dropIfExists('expense_categories');
    }
};

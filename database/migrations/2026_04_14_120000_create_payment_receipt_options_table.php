<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('payment_receipt_options', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();

        DB::table('payment_receipt_options')->insert([
            'name' => 'Tunai',
            'description' => 'Pembayaran diterima secara cash di kantor atau petugas.',
            'is_active' => true,
            'is_default' => true,
            'sort_order' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        if (Schema::hasTable('payment_methods')) {
            $methods = DB::table('payment_methods')
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('created_at')
                ->get();

            $names = ['tunai'];
            $sortOrder = 1;

            foreach ($methods as $method) {
                $label = $method->type === 'qris'
                    ? 'QRIS'
                    : ($method->bank_name ?: 'Transfer Bank');

                $normalized = mb_strtolower(trim($label));
                if (in_array($normalized, $names, true)) {
                    continue;
                }

                DB::table('payment_receipt_options')->insert([
                    'name' => $label,
                    'description' => $method->instructions,
                    'is_active' => true,
                    'is_default' => false,
                    'sort_order' => $sortOrder,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $names[] = $normalized;
                $sortOrder++;
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_receipt_options');
    }
};

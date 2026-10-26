<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Profiling Perilaku Pembayaran Pelanggan
        Schema::create('customer_payment_behavior_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained('customers')->cascadeOnDelete();
            $table->unsignedInteger('total_invoices_analyzed')->default(0);
            $table->unsignedInteger('total_paid_invoices')->default(0);
            $table->unsignedInteger('ontime_paid_count')->default(0);
            $table->unsignedInteger('early_paid_count')->default(0);
            $table->unsignedInteger('late_paid_count')->default(0);
            $table->decimal('avg_delta_days', 6, 2)->default(0.00)->comment('Negatif = lebih awal, Positif = terlambat');
            $table->decimal('median_delta_days', 6, 2)->default(0.00);
            $table->decimal('payment_probability', 5, 4)->default(0.9500)->comment('Nilai 0.0000 s/d 1.0000');
            $table->string('behavior_segment', 50)->default('ontime_payer')->comment('early_payer, ontime_payer, grace_payer, late_payer, new_customer');
            $table->string('behavior_summary', 255)->nullable();
            $table->timestamp('last_calculated_at')->nullable();
            $table->timestamps();

            $table->index('behavior_segment');
            $table->index('payment_probability');
        });

        // 2. Snapshot Konsistensi Prediksi Pendapatan
        Schema::create('revenue_prediction_snapshots', function (Blueprint $table) {
            $table->id();
            $table->string('range_key', 100)->unique()->comment('Contoh: month_2026_10 atau range_2026-10-01_2026-10-31');
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('realized_revenue', 15, 2)->default(0.00);
            $table->decimal('predicted_remaining_revenue', 15, 2)->default(0.00);
            $table->decimal('total_expected_revenue', 15, 2)->default(0.00);
            $table->decimal('potential_total_revenue', 15, 2)->default(0.00);
            $table->unsignedInteger('customer_count')->default(0);
            $table->longText('chart_data')->nullable()->comment('JSON deret harian realisasi vs prediksi');
            $table->longText('customer_breakdown')->nullable()->comment('JSON rincian per pelanggan dan estimasi tanggal bayar');
            $table->longText('meta')->nullable()->comment('JSON metrik kepatuhan, segmentasi, dan parameter model');
            $table->timestamp('calculated_at');
            $table->timestamps();

            $table->index(['start_date', 'end_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('revenue_prediction_snapshots');
        Schema::dropIfExists('customer_payment_behavior_profiles');
    }
};

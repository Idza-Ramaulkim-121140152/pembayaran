<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerPaymentBehaviorProfile;
use App\Models\Invoice;
use App\Models\RevenuePredictionSnapshot;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RevenuePredictionService
{
    /**
     * Hitung profil perilaku pembayaran untuk satu pelanggan berdasarkan riwayat invoice-nya.
     */
    public function analyzeCustomerBehavior(Customer $customer): CustomerPaymentBehaviorProfile
    {
        // Ambil seluruh invoice lunas milik pelanggan yang memiliki data due_date dan paid_at
        $paidInvoices = Invoice::query()
            ->where('customer_id', $customer->id)
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereNotNull('due_date')
            ->orderBy('paid_at')
            ->get(['id', 'amount', 'due_date', 'paid_at', 'invoice_date']);

        $totalInvoices = Invoice::query()->where('customer_id', $customer->id)->count();
        $totalPaid = $paidInvoices->count();

        $deltas = [];
        $earlyCount = 0;
        $ontimeCount = 0;
        $lateCount = 0;

        foreach ($paidInvoices as $inv) {
            $dueDate = Carbon::parse($inv->due_date)->startOfDay();
            $paidDate = Carbon::parse($inv->paid_at)->startOfDay();
            // Selisih hari: negatif jika bayar sebelum jatuh tempo, positif jika terlambat
            $diffDays = $dueDate->diffInDays($paidDate, false);
            $deltas[] = $diffDays;

            if ($diffDays < 0) {
                $earlyCount++;
            } elseif ($diffDays === 0) {
                $ontimeCount++;
            } else {
                $lateCount++;
            }
        }

        $avgDelta = count($deltas) > 0 ? (float) (array_sum($deltas) / count($deltas)) : 0.0;

        // Median delta
        $medianDelta = 0.0;
        if (count($deltas) > 0) {
            sort($deltas);
            $count = count($deltas);
            $middle = (int) floor($count / 2);
            $medianDelta = ($count % 2 === 0)
                ? (float) (($deltas[$middle - 1] + $deltas[$middle]) / 2)
                : (float) $deltas[$middle];
        }

        // Tentukan Probabilitas Kepatuhan Bayar (0.50 s/d 0.99)
        if ($totalPaid >= 3) {
            $paidRatio = $totalInvoices > 0 ? ($totalPaid / $totalInvoices) : 1.0;
            $ontimeOrEarlyRatio = ($earlyCount + $ontimeCount) / $totalPaid;
            $probability = round(min(0.99, max(0.50, ($paidRatio * 0.6) + ($ontimeOrEarlyRatio * 0.4))), 4);
        } elseif ($totalPaid > 0) {
            $probability = 0.9500;
        } else {
            $probability = 0.9200; // Baseline pelanggan baru
        }

        // Segmentasi perilaku
        if ($totalPaid < 2) {
            $segment = 'new_customer';
            $summary = 'Pelanggan baru - belum cukup riwayat pembayaran.';
        } elseif ($avgDelta <= -1.0 && $earlyCount >= $lateCount) {
            $segment = 'early_payer';
            $summary = sprintf('Konsisten bayar rata-rata %.1f hari lebih cepat dari jatuh tempo.', abs($avgDelta));
        } elseif ($avgDelta <= 1.0 && $lateCount <= 1) {
            $segment = 'ontime_payer';
            $summary = 'Selalu membayar tepat waktu pada tanggal jatuh tempo.';
        } elseif ($avgDelta <= 4.0) {
            $segment = 'grace_payer';
            $summary = sprintf('Membayar dalam masa toleransi (terlambat sekitar %.1f hari).', $avgDelta);
        } else {
            $segment = 'late_payer';
            $summary = sprintf('Keterlambatan tinggi (rata-rata terlambat %.1f hari).', $avgDelta);
        }

        return CustomerPaymentBehaviorProfile::updateOrCreate(
            ['customer_id' => $customer->id],
            [
                'total_invoices_analyzed' => $totalInvoices,
                'total_paid_invoices' => $totalPaid,
                'ontime_paid_count' => $ontimeCount,
                'early_paid_count' => $earlyCount,
                'late_paid_count' => $lateCount,
                'avg_delta_days' => round($avgDelta, 2),
                'median_delta_days' => round($medianDelta, 2),
                'payment_probability' => $probability,
                'behavior_segment' => $segment,
                'behavior_summary' => $summary,
                'last_calculated_at' => now(),
            ]
        );
    }

    /**
     * Jalankan profiling untuk seluruh pelanggan aktif yang belum memiliki profil atau perlu diperbarui.
     */
    public function syncAllCustomerBehaviorProfiles(): int
    {
        $customers = Customer::query()
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->get();

        $processed = 0;
        foreach ($customers as $customer) {
            $this->analyzeCustomerBehavior($customer);
            $processed++;
        }

        return $processed;
    }

    /**
     * Hitung prediksi pendapatan untuk range tertentu.
     * Default adalah bulan berjalan (1 s/d akhir bulan).
     */
    public function predictRange(
        CarbonInterface $startDate,
        CarbonInterface $endDate,
        bool $forceRecalculate = false
    ): array {
        $rangeKey = sprintf('range_%s_%s', $startDate->toDateString(), $endDate->toDateString());

        // Cek snapshot tersimpan jika tidak dipaksa hitung ulang
        if (!$forceRecalculate && Schema::hasTable('revenue_prediction_snapshots')) {
            $snapshot = RevenuePredictionSnapshot::where('range_key', $rangeKey)->first();
            if ($snapshot && $snapshot->calculated_at && $snapshot->calculated_at->diffInHours(now()) < 3) {
                return $this->formatSnapshotResponse($snapshot);
            }
        }

        // Ambil semua pelanggan aktif beserta paket dan profil perilakunya
        $customers = Customer::query()
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->with(['package', 'paymentBehaviorProfile'])
            ->get();

        // Ambil semua invoice lunas yang pembayarannya jatuh pada range ini
        $paidInvoicesInRange = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->get()
            ->groupBy('customer_id');

        // Peta hari kalender dalam range
        $period = CarbonPeriod::create($startDate, $endDate);
        $dailyActual = [];
        $dailyPredicted = [];

        foreach ($period as $date) {
            $dateStr = $date->toDateString();
            $dailyActual[$dateStr] = 0.0;
            $dailyPredicted[$dateStr] = 0.0;
        }

        $customerBreakdown = [];
        $totalRealized = 0.0;
        $totalPredictedRemaining = 0.0;
        $totalPotential = 0.0;
        $segmentCounts = [
            'early_payer' => 0,
            'ontime_payer' => 0,
            'grace_payer' => 0,
            'late_payer' => 0,
            'new_customer' => 0,
        ];

        $today = now()->startOfDay();

        foreach ($customers as $customer) {
            $profile = $customer->paymentBehaviorProfile;
            if (!$profile) {
                $profile = $this->analyzeCustomerBehavior($customer);
            }

            $segment = $profile->behavior_segment ?: 'ontime_payer';
            if (isset($segmentCounts[$segment])) {
                $segmentCounts[$segment]++;
            }

            // Tentukan besaran tagihan bulanan pelanggan
            $billAmount = (float) ($customer->custom_package ?: ($customer->package?->price ?: 0));
            if ($billAmount <= 0) {
                continue; // Lewati pelanggan gratis/tanpa tarif
            }

            // Tentukan tanggal jatuh tempo dalam range ini
            $customerDueDateDay = null;
            if (!empty($customer->due_date)) {
                $customerDueDateDay = (int) Carbon::parse($customer->due_date)->format('d');
            } else {
                $customerDueDateDay = 10; // Default jika null
            }

            // Cari tanggal jatuh tempo pada bulan dalam range ini
            $dueDateInPeriod = null;
            $cursorMonth = $startDate->copy()->startOfMonth();
            $endMonth = $endDate->copy()->endOfMonth();

            while ($cursorMonth->lte($endMonth)) {
                $daysInMonth = $cursorMonth->daysInMonth;
                $clampedDay = min($customerDueDateDay, $daysInMonth);
                $candidateDueDate = $cursorMonth->copy()->day($clampedDay)->startOfDay();

                if ($candidateDueDate->betweenIncluded($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                    $dueDateInPeriod = $candidateDueDate;
                    break;
                }
                $cursorMonth->addMonth();
            }

            if (!$dueDateInPeriod) {
                continue;
            }

            $totalPotential += $billAmount;

            // Cek apakah invoice bulan ini sudah terbayar
            $customerPaidInvoices = $paidInvoicesInRange->get($customer->id, collect());
            $isPaid = $customerPaidInvoices->isNotEmpty();
            $paidInvoice = $customerPaidInvoices->first();

            if ($isPaid && $paidInvoice) {
                // Sudah Lunas (Realisasi Aktual)
                $paidDate = Carbon::parse($paidInvoice->paid_at)->toDateString();
                $actualAmount = (float) $paidInvoice->amount;
                $totalRealized += $actualAmount;

                if (isset($dailyActual[$paidDate])) {
                    $dailyActual[$paidDate] += $actualAmount;
                }

                $customerBreakdown[] = [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'phone' => $customer->phone,
                    'package_name' => $customer->package?->name ?? ($customer->package_type ?: 'Reguler'),
                    'amount' => $actualAmount,
                    'due_date' => $dueDateInPeriod->toDateString(),
                    'estimated_payment_date' => $paidDate,
                    'status' => 'paid',
                    'paid_at' => $paidInvoice->paid_at?->format('Y-m-d H:i:s'),
                    'behavior_segment' => $segment,
                    'behavior_badge' => $profile->segment_badge,
                    'avg_delta_days' => $profile->avg_delta_days,
                    'payment_probability' => 1.0,
                    'is_early' => Carbon::parse($paidInvoice->paid_at)->startOfDay()->lt($dueDateInPeriod),
                ];
            } else {
                // Belum Lunas (Prediksi Cerdas Berbasis Pola Pelanggan)
                $deltaDays = (int) round($profile->avg_delta_days);
                $estimatedPayDate = $dueDateInPeriod->copy()->addDays($deltaDays);

                // Jika estimasi jatuh di masa lalu tetapi belum bayar, geser ke hari ini atau masa toleransi
                if ($estimatedPayDate->lt($today)) {
                    $estimatedPayDate = $today->copy();
                }

                // Batasi estimasi agar tetap dalam batas range visualisasi
                if ($estimatedPayDate->gt($endDate)) {
                    $estimatedPayDate = $endDate->copy();
                }

                $estimatedPayDateStr = $estimatedPayDate->toDateString();
                $probability = $profile->payment_probability;
                $expectedIncome = round($billAmount * $probability, 2);

                $totalPredictedRemaining += $expectedIncome;

                if (isset($dailyPredicted[$estimatedPayDateStr])) {
                    $dailyPredicted[$estimatedPayDateStr] += $expectedIncome;
                }

                $customerBreakdown[] = [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'phone' => $customer->phone,
                    'package_name' => $customer->package?->name ?? ($customer->package_type ?: 'Reguler'),
                    'amount' => $billAmount,
                    'expected_amount' => $expectedIncome,
                    'due_date' => $dueDateInPeriod->toDateString(),
                    'estimated_payment_date' => $estimatedPayDateStr,
                    'status' => 'pending',
                    'paid_at' => null,
                    'behavior_segment' => $segment,
                    'behavior_badge' => $profile->segment_badge,
                    'avg_delta_days' => $profile->avg_delta_days,
                    'payment_probability' => $probability,
                    'is_early' => $deltaDays < 0,
                ];
            }
        }

        // Susun data deret grafik harian (Realisasi vs Prediksi + Akumulasi)
        $chartData = [];
        $runningActual = 0.0;
        $runningProjected = 0.0;

        foreach ($period as $date) {
            $dateStr = $date->toDateString();
            $dayLabel = $date->translatedFormat('d M');
            $act = $dailyActual[$dateStr] ?? 0.0;
            $pred = $dailyPredicted[$dateStr] ?? 0.0;

            $runningActual += $act;
            $runningProjected += ($act + $pred);

            $chartData[] = [
                'date' => $dateStr,
                'label' => $dayLabel,
                'day' => (int) $date->format('j'),
                'actual' => round($act, 0),
                'predicted' => round($pred, 0),
                'total_day' => round($act + $pred, 0),
                'cumulative_actual' => round($runningActual, 0),
                'cumulative_projected' => round($runningProjected, 0),
            ];
        }

        $totalExpected = $totalRealized + $totalPredictedRemaining;
        $paidCount = count(array_filter($customerBreakdown, fn($item) => $item['status'] === 'paid'));
        $pendingCount = count($customerBreakdown) - $paidCount;
        $realizationRate = $totalExpected > 0 ? round(($totalRealized / $totalExpected) * 100, 1) : 0;

        // Urutkan rincian pelanggan berdasarkan tanggal estimasi/realisasi
        usort($customerBreakdown, function ($a, $b) {
            return strcmp($a['estimated_payment_date'], $b['estimated_payment_date']);
        });

        $meta = [
            'range_type' => $startDate->format('Y-m') === $endDate->format('Y-m') ? 'month' : 'custom',
            'month_name' => $startDate->translatedFormat('F Y'),
            'realization_rate' => $realizationRate,
            'paid_customer_count' => $paidCount,
            'pending_customer_count' => $pendingCount,
            'segments_count' => $segmentCounts,
            'calculated_at' => now()->toIso8601String(),
        ];

        // Simpan / update snapshot ke database
        if (Schema::hasTable('revenue_prediction_snapshots')) {
            RevenuePredictionSnapshot::updateOrCreate(
                ['range_key' => $rangeKey],
                [
                    'start_date' => $startDate->toDateString(),
                    'end_date' => $endDate->toDateString(),
                    'realized_revenue' => $totalRealized,
                    'predicted_remaining_revenue' => $totalPredictedRemaining,
                    'total_expected_revenue' => $totalExpected,
                    'potential_total_revenue' => $totalPotential,
                    'customer_count' => count($customerBreakdown),
                    'chart_data' => $chartData,
                    'customer_breakdown' => $customerBreakdown,
                    'meta' => $meta,
                    'calculated_at' => now(),
                ]
            );
        }

        return [
            'range_key' => $rangeKey,
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'summary' => [
                'realized_revenue' => $totalRealized,
                'predicted_remaining_revenue' => $totalPredictedRemaining,
                'total_expected_revenue' => $totalExpected,
                'potential_total_revenue' => $totalPotential,
                'realization_rate' => $realizationRate,
                'total_customers' => count($customerBreakdown),
                'paid_customers' => $paidCount,
                'pending_customers' => $pendingCount,
                'segments_count' => $segmentCounts,
            ],
            'chart_data' => $chartData,
            'customer_breakdown' => $customerBreakdown,
            'meta' => $meta,
        ];
    }

    private function formatSnapshotResponse(RevenuePredictionSnapshot $snapshot): array
    {
        return [
            'range_key' => $snapshot->range_key,
            'start_date' => $snapshot->start_date->toDateString(),
            'end_date' => $snapshot->end_date->toDateString(),
            'summary' => [
                'realized_revenue' => (float) $snapshot->realized_revenue,
                'predicted_remaining_revenue' => (float) $snapshot->predicted_remaining_revenue,
                'total_expected_revenue' => (float) $snapshot->total_expected_revenue,
                'potential_total_revenue' => (float) $snapshot->potential_total_revenue,
                'realization_rate' => (float) ($snapshot->meta['realization_rate'] ?? 0),
                'total_customers' => (int) $snapshot->customer_count,
                'paid_customers' => (int) ($snapshot->meta['paid_customer_count'] ?? 0),
                'pending_customers' => (int) ($snapshot->meta['pending_customer_count'] ?? 0),
                'segments_count' => $snapshot->meta['segments_count'] ?? [],
            ],
            'chart_data' => $snapshot->chart_data ?? [],
            'customer_breakdown' => $snapshot->customer_breakdown ?? [],
            'meta' => $snapshot->meta ?? [],
        ];
    }
}

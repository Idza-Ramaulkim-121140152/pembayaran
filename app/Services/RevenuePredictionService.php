<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerPaymentBehaviorProfile;
use App\Models\Invoice;
use App\Models\RevenuePredictionSnapshot;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Carbon\CarbonPeriod;
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

            // Selisih hari: negatif jika bayar lebih cepat dari jatuh tempo, positif jika terlambat
            $diffDays = intval(round(($paidDate->getTimestamp() - $dueDate->getTimestamp()) / 86400));
            
            // Batasi outlier ekstrim (misal selisih > 45 hari karena tunggakan lama) agar tidak merusak rata-rata kebiasaan rutin
            $clampedDiff = max(-25, min(35, $diffDays));
            $deltas[] = $clampedDiff;

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

        // Tentukan Probabilitas Kepatuhan Bayar (0.65 s/d 0.99)
        if ($totalPaid >= 2) {
            $paidRatio = $totalInvoices > 0 ? ($totalPaid / $totalInvoices) : 1.0;
            $ontimeOrEarlyRatio = ($earlyCount + $ontimeCount) / $totalPaid;
            $probability = round(min(0.99, max(0.65, ($paidRatio * 0.7) + ($ontimeOrEarlyRatio * 0.3))), 4);
        } elseif ($totalPaid > 0) {
            $probability = 0.9600;
        } else {
            $probability = 0.9400; // Baseline pelanggan baru
        }

        // Segmentasi perilaku
        if ($totalPaid < 2) {
            $segment = 'new_customer';
            $summary = 'Pelanggan baru - estimasi menggunakan baseline sistem.';
        } elseif ($avgDelta <= -1.0 && $earlyCount >= $lateCount) {
            $segment = 'early_payer';
            $summary = sprintf('Konsisten bayar rata-rata %.1f hari lebih cepat dari jatuh tempo.', abs($avgDelta));
        } elseif ($avgDelta <= 1.0 && $lateCount <= 1) {
            $segment = 'ontime_payer';
            $summary = 'Selalu membayar tepat waktu pada tanggal jatuh tempo.';
        } elseif ($avgDelta <= 4.0) {
            $segment = 'grace_payer';
            $summary = sprintf('Membayar dalam masa toleransi (rata-rata terlambat %.1f hari).', $avgDelta);
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
     * Jalankan profiling untuk seluruh pelanggan aktif.
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
     * Hitung prediksi pendapatan untuk range tertentu dengan akurasi tinggi berbasis arus kas riil.
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
            if ($snapshot && $snapshot->calculated_at && $snapshot->calculated_at->diffInHours(now()) < 2) {
                return $this->formatSnapshotResponse($snapshot);
            }
        }

        $start = $startDate->copy()->startOfDay();
        $end = $endDate->copy()->endOfDay();
        $today = now()->startOfDay();

        // 1. Inisialisasi peta hari kalender
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
        $paidCustomersMap = []; // customer_id => true jika sudah lunas di range ini

        // 2. STREAM 1: AMBIL SELURUH REALISASI PEMBAYARAN TAGIHAN PADA RENTANG INI
        // Hanya pembayaran tagihan bulanan (invoice_payment), biaya pemasangan baru tidak dihitung.
        $paidInvoicesInRange = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$start, $end])
            ->with(['customer', 'customer.package'])
            ->orderBy('paid_at')
            ->get();

        foreach ($paidInvoicesInRange as $invoice) {
            $customer = $invoice->customer;
            if (!$customer) {
                continue;
            }

            $paidTimestamp = Carbon::parse($invoice->paid_at);
            $paidDateStr = $paidTimestamp->toDateString();
            $amount = (float) $invoice->amount;

            $totalRealized += $amount;
            $totalPotential += $amount;

            if (isset($dailyActual[$paidDateStr])) {
                $dailyActual[$paidDateStr] += $amount;
            }

            $dueDateStr = $invoice->due_date ? Carbon::parse($invoice->due_date)->toDateString() : $paidDateStr;
            $isEarly = $invoice->due_date ? $paidTimestamp->startOfDay()->lt(Carbon::parse($invoice->due_date)->startOfDay()) : false;

            $profile = $customer->paymentBehaviorProfile;
            if (!$profile) {
                $profile = $this->analyzeCustomerBehavior($customer);
            }

            $paidCustomersMap[$customer->id] = true;

            $customerBreakdown[] = [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'package_name' => $customer->package?->name ?? ($customer->package_type ?: 'Reguler'),
                'amount' => $amount,
                'expected_amount' => $amount,
                'due_date' => $dueDateStr,
                'estimated_payment_date' => $paidDateStr,
                'status' => 'paid',
                'paid_at' => $paidTimestamp->format('Y-m-d H:i:s'),
                'behavior_segment' => $profile->behavior_segment,
                'behavior_badge' => $profile->segment_badge,
                'avg_delta_days' => $profile->avg_delta_days,
                'payment_probability' => 1.0,
                'is_early' => $isEarly,
            ];
        }

        // 3. STREAM 2: PREDIKSI PEMBAYARAN MASA DEPAN DARI PELANGGAN AKTIF
        // Ambil seluruh pelanggan aktif
        $customers = Customer::query()
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->with(['package', 'paymentBehaviorProfile'])
            ->get();

        // Cari tahu bulan apa saja yang relevan (bulan sebelum start sampai bulan end)
        $monthCursor = $start->copy()->subMonth()->startOfMonth();
        $monthLimit = $end->copy()->addMonth()->endOfMonth();
        $candidateMonths = [];

        while ($monthCursor->lte($monthLimit)) {
            $candidateMonths[] = $monthCursor->copy();
            $monthCursor->addMonth();
        }

        foreach ($customers as $customer) {
            // Jika pelanggan sudah tercatat lunas di rentang ini (pada rentang <= 30 hari), tidak perlu diprediksi ulang
            if (isset($paidCustomersMap[$customer->id])) {
                continue;
            }

            $profile = $customer->paymentBehaviorProfile;
            if (!$profile) {
                $profile = $this->analyzeCustomerBehavior($customer);
            }

            // Tentukan besaran tagihan bulanan pelanggan
            $billAmount = (float) ($customer->custom_package ?: ($customer->package?->price ?: 0));
            if ($billAmount <= 0) {
                // Fallback ke invoice terakhir jika paket 0
                $lastInv = Invoice::where('customer_id', $customer->id)->where('amount', '>', 0)->latest('id')->first();
                if ($lastInv) {
                    $billAmount = (float) $lastInv->amount;
                }
            }

            if ($billAmount <= 0) {
                continue; // Lewati jika tidak ada tarif tagihan
            }

            // Tanggal jatuh tempo nominal (hari dalam bulan, e.g. 5, 10, 15, 20, 25)
            $dueDay = 10;
            if (!empty($customer->due_date)) {
                $dueDay = (int) Carbon::parse($customer->due_date)->format('d');
            }

            $avgDelta = $profile->avg_delta_days; // negatif = lebih cepat, positif = terlambat
            $deltaDays = (int) round($avgDelta);

            // Cek apakah ada jadwal pembayaran pelanggan yang mendarat di rentang [$start, $end]
            $matchedCycle = null;

            foreach ($candidateMonths as $cMonth) {
                $daysInMonth = $cMonth->daysInMonth;
                $clampedDay = min($dueDay, $daysInMonth);
                $nominalDueDate = $cMonth->copy()->day($clampedDay)->startOfDay();

                // Hitung estimasi tanggal bayar aktual berdasarkan pola historis pelanggan
                $estimatedPayDate = $nominalDueDate->copy()->addDays($deltaDays);

                // Cek apakah invoice untuk siklus nominal ini SUDAH dibayar sebelumnya (di masa lalu sebelum range start)
                $alreadyPaidForThisCycle = Invoice::query()
                    ->where('customer_id', $customer->id)
                    ->where('status', 'paid')
                    ->whereBetween('due_date', [
                        $nominalDueDate->copy()->subDays(5)->toDateString(),
                        $nominalDueDate->copy()->addDays(5)->toDateString(),
                    ])
                    ->exists();

                if ($alreadyPaidForThisCycle) {
                    continue; // Siklus ini sudah lunas di masa lalu
                }

                // Jika tanggal estimasi jatuh di masa lalu (< today) tetapi pelanggan belum bayar:
                // Artinya pelanggan sedang OVERDUE / menunggak dari siklus sebelumnya.
                // Dalam operasional ISP, pelanggan menunggak tidak membayar sekaligus di hari ini,
                // melainkan terdistribusi secara realistis:
                // 1. Baru terlambat (1-5 hari): bayar dalam 1-2 hari ke depan
                // 2. Terlambat sedang (6-15 hari): bayar saat masa gajian akhir bulan (tanggal 27-31)
                // 3. Terlambat lama (> 15 hari): bayar saat tindakan isolir awal bulan berikutnya (tanggal 1-5)
                if ($estimatedPayDate->lt($today)) {
                    $daysOverdue = (int) $nominalDueDate->diffInDays($today);

                    if ($daysOverdue <= 5) {
                        $stagger = (int) ($customer->id % 3);
                        $estimatedPayDate = $today->copy()->addDays($stagger);
                    } elseif ($daysOverdue <= 15) {
                        $stagger = 1 + (int) ($customer->id % 5);
                        $estimatedPayDate = $today->copy()->addDays($stagger);
                    } else {
                        $nextMonthStart = $today->copy()->addMonth()->startOfMonth();
                        $stagger = (int) ($customer->id % 5);
                        $estimatedPayDate = $nextMonthStart->copy()->addDays($stagger);
                    }
                }

                // Cek apakah tanggal estimasi bayar jatuh DALAM rentang [$start, $end]
                if ($estimatedPayDate->betweenIncluded($start, $end)) {
                    $matchedCycle = [
                        'due_date' => $nominalDueDate->toDateString(),
                        'estimated_pay_date' => $estimatedPayDate->toDateString(),
                    ];
                    break;
                }
            }

            if (!$matchedCycle) {
                continue;
            }

            $probability = $profile->payment_probability;
            $expectedIncome = round($billAmount * $probability, 2);
            $payDateStr = $matchedCycle['estimated_pay_date'];

            $totalPredictedRemaining += $expectedIncome;
            $totalPotential += $billAmount;

            if (isset($dailyPredicted[$payDateStr])) {
                $dailyPredicted[$payDateStr] += $expectedIncome;
            }

            $customerBreakdown[] = [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'pppoe_username' => $customer->pppoe_username,
                'phone' => $customer->phone,
                'package_name' => $customer->package?->name ?? ($customer->package_type ?: 'Reguler'),
                'amount' => $billAmount,
                'expected_amount' => $expectedIncome,
                'due_date' => $matchedCycle['due_date'],
                'estimated_payment_date' => $payDateStr,
                'status' => 'pending',
                'paid_at' => null,
                'behavior_segment' => $profile->behavior_segment,
                'behavior_badge' => $profile->segment_badge,
                'avg_delta_days' => $profile->avg_delta_days,
                'payment_probability' => $probability,
                'is_early' => $deltaDays < 0,
            ];
        }

        // 4. SUSUN DERET GRAFIK HARIAN (Realisasi vs Prediksi + Akumulasi)
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

        // Hitung rekap segmentasi untuk seluruh pelanggan aktif
        $segmentCounts = [
            'early_payer' => 0,
            'ontime_payer' => 0,
            'grace_payer' => 0,
            'late_payer' => 0,
            'new_customer' => 0,
        ];
        foreach ($customers as $c) {
            $seg = $c->paymentBehaviorProfile?->behavior_segment ?: 'ontime_payer';
            if (isset($segmentCounts[$seg])) {
                $segmentCounts[$seg]++;
            }
        }

        // Urutkan rincian pelanggan berdasarkan tanggal estimasi/realisasi bayar
        usort($customerBreakdown, function ($a, $b) {
            return strcmp($a['estimated_payment_date'], $b['estimated_payment_date']);
        });

        $meta = [
            'range_type' => $start->format('Y-m') === $end->format('Y-m') ? 'month' : 'custom',
            'month_name' => $start->translatedFormat('F Y'),
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
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
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
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
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

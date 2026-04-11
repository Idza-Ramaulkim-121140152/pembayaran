<?php

namespace App\Http\Controllers;


use App\Models\Invoice;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\User;
use App\Services\FinancialLedgerService;
use Illuminate\Http\Request;
use Carbon\Carbon;

class DashboardController extends Controller
{
    private function canViewFinancialMetrics(?User $user): bool
    {
        return $user !== null && !$user->isTeknisi();
    }

    private function countNewInstallationsForPeriod(Carbon $start, Carbon $end): int
    {
        return Customer::where(function ($query) use ($start, $end) {
            $query->whereBetween('activation_date', [$start, $end])
                ->orWhere(function ($fallbackQuery) use ($start, $end) {
                    $fallbackQuery->whereNull('activation_date')
                        ->whereBetween('created_at', [$start, $end]);
                });
        })->count();
    }

    private function fetchIsolatedUsernameMap(): array
    {
        try {
            $mikrotik = new \App\Services\MikroTikService();
            $isolatedSecrets = $mikrotik->getIsolatedSecrets();

            $isolatedUsernameMap = [];
            foreach ($isolatedSecrets as $secret) {
                $username = strtolower(trim((string) ($secret['name'] ?? '')));
                if ($username !== '') {
                    $isolatedUsernameMap[$username] = true;
                }
            }

            return $isolatedUsernameMap;
        } catch (\Exception $e) {
            \Log::warning('Failed to fetch isolated usernames from MikroTik', [
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    private function buildCustomerActivitySummary(Carbon $asOfDate, ?array $isolatedUsernameMap = null): array
    {
        $asOfDay = $asOfDate->copy()->startOfDay();
        $isolatedUsernameMap = $isolatedUsernameMap ?? $this->fetchIsolatedUsernameMap();

        $customers = Customer::get(['id', 'due_date', 'pppoe_username']);

        $inactiveCustomers = 0;
        $overdueCustomers = 0;
        $isolatedCustomers = 0;
        $activeUsernameMap = [];

        foreach ($customers as $customer) {
            $isOverdue = $customer->due_date
                ? Carbon::parse($customer->due_date)->startOfDay()->lt($asOfDay)
                : false;

            $username = strtolower(trim((string) ($customer->pppoe_username ?? '')));
            $isIsolated = $username !== '' && isset($isolatedUsernameMap[$username]);

            if ($isOverdue) {
                $overdueCustomers++;
            }

            if ($isIsolated) {
                $isolatedCustomers++;
            }

            if ($isOverdue || $isIsolated) {
                $inactiveCustomers++;
                continue;
            }

            if ($username !== '') {
                $activeUsernameMap[$username] = true;
            }
        }

        $totalCustomers = $customers->count();

        return [
            'as_of_date' => $asOfDay->toDateString(),
            'total_customers' => $totalCustomers,
            'active_customers' => max(0, $totalCustomers - $inactiveCustomers),
            'inactive_customers' => $inactiveCustomers,
            'overdue_customers' => $overdueCustomers,
            'isolated_customers' => $isolatedCustomers,
            'active_usernames' => array_keys($activeUsernameMap),
        ];
    }

    public function index()
    {
        // Ringkasan pendapatan bulan ini
        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        $endOfMonth = $now->copy()->endOfMonth();


        $thisMonthIncome = \App\Models\Invoice::whereBetween('paid_at', [$startOfMonth, $endOfMonth])
            ->where('status', 'paid')
            ->sum('amount');

        // Ringkasan pendapatan bulan kemarin
        $lastMonth = $now->copy()->subMonth();
        $startOfLastMonth = $lastMonth->copy()->startOfMonth();
        $endOfLastMonth = $lastMonth->copy()->endOfMonth();

        $lastMonthIncome = Invoice::whereBetween('paid_at', [$startOfLastMonth, $endOfLastMonth])
            ->where('status', 'paid')
            ->sum('amount');

        // Data grafik: pendapatan 12 bulan terakhir
        $monthlyIncome = [];
        $monthLabels = [];
        for ($i = 11; $i >= 0; $i--) {
            $month = $now->copy()->startOfMonth()->subMonths($i);
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $income = Invoice::whereBetween('paid_at', [$start, $end])
                ->where('status', 'paid')
                ->sum('amount');
            $monthlyIncome[] = $income;
            $monthLabels[] = $month->format('M Y');
        }

        // Summary pemasangan bulanan (jumlah pelanggan baru per bulan)
        $monthlyInstalls = [];
        $installLabels = [];
        for ($i = 11; $i >= 0; $i--) {
            $month = $now->copy()->startOfMonth()->subMonths($i);
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $count = $this->countNewInstallationsForPeriod($start, $end);
            $monthlyInstalls[] = $count;
            $installLabels[] = $month->format('M Y');
        }

        // Pelanggan telat bayar: due_date < hari ini dan belum ada invoice status paid bulan ini
        $today = $now->toDateString();
        $lateCustomers = \App\Models\Customer::where('due_date', '<', $today)
            ->whereDoesntHave('invoices', function($q) use ($startOfMonth, $endOfMonth) {
                $q->where('status', 'paid')->whereBetween('paid_at', [$startOfMonth, $endOfMonth]);
            })->count();

        // Pelanggan sudah bayar bulan ini: ada invoice status paid bulan ini
        $paidCustomers = \App\Models\Customer::whereHas('invoices', function($q) use ($startOfMonth, $endOfMonth) {
            $q->where('status', 'paid')->whereBetween('paid_at', [$startOfMonth, $endOfMonth]);
        })->count();

        return view('dashboard', [
            'thisMonthIncome' => $thisMonthIncome,
            'lastMonthIncome' => $lastMonthIncome,
            'monthlyIncome' => $monthlyIncome,
            'monthLabels' => $monthLabels,
            'monthlyInstalls' => $monthlyInstalls,
            'installLabels' => $installLabels,
            'lateCustomers' => $lateCustomers,
            'paidCustomers' => $paidCustomers,
        ]);
    }

    public function api()
    {
        $user = request()->user();
        $canViewFinancialMetrics = $this->canViewFinancialMetrics($user);

        // Ringkasan pendapatan bulan ini
        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        $endOfMonth = $now->copy()->endOfMonth();

        $activitySummary = $this->buildCustomerActivitySummary($now->copy()->startOfDay());

        $totalCustomers = (int) $activitySummary['total_customers'];
        $activeCustomers = (int) $activitySummary['active_customers'];
        $inactiveCustomers = (int) $activitySummary['inactive_customers'];
        $overdueCustomers = (int) $activitySummary['overdue_customers'];
        $isolatedCustomers = (int) $activitySummary['isolated_customers'];

        $monthlyRevenue = null;
        $pendingInvoices = null;
        $revenueByMonth = [];
        $financeSummary = null;

        if ($canViewFinancialMetrics) {
            $ledgerService = app(FinancialLedgerService::class);
            $financeSummary = $ledgerService->getSummary();

            $monthlyRevenue = \App\Models\Invoice::whereBetween('paid_at', [$startOfMonth, $endOfMonth])
                ->where('status', 'paid')
                ->sum('amount');

            $today = $now->toDateString();
            $pendingInvoices = \App\Models\Invoice::whereIn('status', ['unpaid', 'menunggu konfirmasi'])
                ->where('due_date', '<', $today)
                ->count();

            // Revenue untuk 6 bulan terakhir
            for ($i = 5; $i >= 0; $i--) {
                $month = $now->copy()->startOfMonth()->subMonths($i);
                $start = $month->copy()->startOfMonth();
                $end = $month->copy()->endOfMonth();
                $revenue = \App\Models\Invoice::whereBetween('paid_at', [$start, $end])
                    ->where('status', 'paid')
                    ->sum('amount');
                $revenueByMonth[] = (int) $revenue;
            }
        }

        $recentCustomers = \App\Models\Customer::latest()->take(5)->get(['id', 'name', 'email', 'is_active']);

        // Pemasangan baru untuk 6 bulan terakhir
        $newInstallations = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = $now->copy()->startOfMonth()->subMonths($i);
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $count = $this->countNewInstallationsForPeriod($start, $end);
            $newInstallations[] = (int) $count;
        }

        $monthlyInstallations = $this->countNewInstallationsForPeriod($startOfMonth, $endOfMonth);

        // Complaint statistics
        $pendingComplaints = Complaint::where('status', 'pending')->count();
        $inProgressComplaints = Complaint::where('status', 'in_progress')->count();
        $totalActiveComplaints = $pendingComplaints + $inProgressComplaints;

        // Monitoring data: Get online customers from MikroTik
        $online_customers = 0;
        try {
            $mikrotik = new \App\Services\MikroTikService();
            $activeConnections = $mikrotik->getActivePPPoEConnections();

            $activeUsernameMap = array_fill_keys($activitySummary['active_usernames'], true);

            foreach ($activeConnections as $conn) {
                $connUsername = strtolower(trim($conn['name'] ?? ''));
                if ($connUsername !== '' && isset($activeUsernameMap[$connUsername])) {
                    $online_customers++;
                }
            }
        } catch (\Exception $e) {
            // If MikroTik connection fails, set to 0
            $online_customers = 0;
        }

        $payload = [
            'total_customers' => $totalCustomers,
            'active_customers' => $activeCustomers,
            'inactive_customers' => $inactiveCustomers,
            'overdue_customers' => $overdueCustomers,
            'isolated_customers' => $isolatedCustomers,
            'online_customers' => $online_customers,
            'recent_customers' => $recentCustomers,
            'new_installations' => $newInstallations,
            'monthly_installations' => (int) $monthlyInstallations,
            'pending_complaints' => $pendingComplaints,
            'in_progress_complaints' => $inProgressComplaints,
            'total_active_complaints' => $totalActiveComplaints,
        ];

        if ($canViewFinancialMetrics) {
            $payload['monthly_revenue'] = $monthlyRevenue;
            $payload['pending_invoices'] = $pendingInvoices;
            $payload['revenue_by_month'] = $revenueByMonth;
            $payload['finance_summary'] = $financeSummary;
        }

        return response()->json([
            'data' => $payload,
        ]);
    }

    public function revenueForecast(Request $request)
    {
        if (!$this->canViewFinancialMetrics($request->user())) {
            return response()->json([
                'message' => 'Anda tidak memiliki izin melihat data keuangan.',
            ], 403);
        }

        $validated = $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        $startDate = isset($validated['start_date'])
            ? Carbon::parse($validated['start_date'])->startOfDay()
            : Carbon::today()->startOfDay();

        $endDate = isset($validated['end_date'])
            ? Carbon::parse($validated['end_date'])->endOfDay()
            : $startDate->copy()->addDays(6)->endOfDay();

        if ($startDate->gt($endDate)) {
            return response()->json([
                'message' => 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.',
            ], 422);
        }

        $totalForecastDays = $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        if ($totalForecastDays > 60) {
            return response()->json([
                'message' => 'Rentang prediksi maksimal 60 hari.',
            ], 422);
        }

        return response()->json([
            'data' => $this->buildRevenueForecast($startDate, $endDate),
        ]);
    }

    public function managementKpis(Request $request)
    {
        if (!$this->canViewFinancialMetrics($request->user())) {
            return response()->json([
                'message' => 'Anda tidak memiliki izin melihat data keuangan.',
            ], 403);
        }

        $validated = $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        $startDate = isset($validated['start_date'])
            ? Carbon::parse($validated['start_date'])->startOfDay()
            : Carbon::today()->subDays(29)->startOfDay();

        $endDate = isset($validated['end_date'])
            ? Carbon::parse($validated['end_date'])->endOfDay()
            : Carbon::today()->endOfDay();

        if ($startDate->gt($endDate)) {
            return response()->json([
                'message' => 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.',
            ], 422);
        }

        $totalDays = $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        if ($totalDays > 120) {
            return response()->json([
                'message' => 'Rentang KPI maksimal 120 hari.',
            ], 422);
        }

        return response()->json([
            'data' => $this->buildManagementKpis($startDate, $endDate),
        ]);
    }

    private function buildManagementKpis(Carbon $startDate, Carbon $endDate): array
    {
        $periodDays = $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        $previousStart = $startDate->copy()->subDays($periodDays)->startOfDay();
        $previousEnd = $startDate->copy()->subDay()->endOfDay();
        $isolatedUsernameMap = $this->fetchIsolatedUsernameMap();

        $activityCurrent = $this->buildCustomerActivitySummary($endDate->copy()->startOfDay(), $isolatedUsernameMap);
        $activityPrevious = $this->buildCustomerActivitySummary($previousEnd->copy()->startOfDay(), $isolatedUsernameMap);

        $collectionCurrent = $this->computeCollectionMetrics($startDate, $endDate);
        $collectionPrevious = $this->computeCollectionMetrics($previousStart, $previousEnd);

        $agingMetrics = $this->computeAgingMetrics($endDate);

        $churnMetrics = $this->computePaymentChurnMetrics($startDate, $endDate);

        $arpuCurrent = $this->computeArpuMetrics($startDate, $endDate, $isolatedUsernameMap);
        $arpuPrevious = $this->computeArpuMetrics($previousStart, $previousEnd, $isolatedUsernameMap);

        $backtestEnd = Carbon::today()->subDay()->endOfDay();
        if ($endDate->lt($backtestEnd)) {
            $backtestEnd = $endDate->copy()->endOfDay();
        }

        $varianceMetrics = null;
        if ($backtestEnd->gte($startDate)) {
            $varianceMetrics = $this->buildForecastVarianceBacktest($startDate->copy()->startOfDay(), $backtestEnd->copy()->endOfDay());
        }

        $collectionRateDelta = (float) $collectionCurrent['collection_rate'] - (float) $collectionPrevious['collection_rate'];
        $arpuDelta = (float) $arpuCurrent['arpu_paid_customer'] - (float) $arpuPrevious['arpu_paid_customer'];
        $revenueGrowth = (float) $arpuPrevious['realized_revenue'] > 0
            ? (((float) $arpuCurrent['realized_revenue'] - (float) $arpuPrevious['realized_revenue']) / (float) $arpuPrevious['realized_revenue']) * 100
            : ((float) $arpuCurrent['realized_revenue'] > 0 ? 100.0 : 0.0);

        return [
            'range' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'days' => $periodDays,
            ],
            'summary' => [
                'collection_rate' => round((float) $collectionCurrent['collection_rate'], 2),
                'collection_rate_delta_vs_previous' => round($collectionRateDelta, 2),
                'due_amount' => (int) round((float) $collectionCurrent['due_amount']),
                'collected_due_amount' => (int) round((float) $collectionCurrent['collected_due_amount']),
                'outstanding_due_amount' => (int) round((float) $collectionCurrent['outstanding_due_amount']),
                'aging_total_outstanding_amount' => (int) round((float) $agingMetrics['total_outstanding_amount']),
                'aging_total_overdue_amount' => (int) round((float) $agingMetrics['total_overdue_amount']),
                'aging_total_overdue_invoices' => (int) $agingMetrics['total_overdue_invoices'],
                'churn_rate' => round((float) $churnMetrics['churn_rate'], 2),
                'retention_rate' => round((float) $churnMetrics['retention_rate'], 2),
                'churned_customers' => (int) $churnMetrics['churned_customers'],
                'arpu_paid_customer' => (int) round((float) $arpuCurrent['arpu_paid_customer']),
                'arpu_operational_active' => (int) round((float) $arpuCurrent['arpu_operational_active']),
                'arpu_delta_vs_previous' => (int) round($arpuDelta),
                'realized_revenue' => (int) round((float) $arpuCurrent['realized_revenue']),
                'revenue_growth_vs_previous' => round($revenueGrowth, 2),
                'paid_customers' => (int) $arpuCurrent['paid_customers'],
                'operational_active_customers' => (int) $activityCurrent['active_customers'],
                'operational_inactive_customers' => (int) $activityCurrent['inactive_customers'],
                'overdue_customers' => (int) $activityCurrent['overdue_customers'],
                'isolated_customers' => (int) $activityCurrent['isolated_customers'],
                'variance_available' => $varianceMetrics !== null,
                'variance_amount' => $varianceMetrics ? (int) round((float) ($varianceMetrics['summary']['variance_amount'] ?? 0)) : null,
                'variance_percentage' => $varianceMetrics ? round((float) ($varianceMetrics['summary']['variance_percentage'] ?? 0), 2) : null,
                'variance_accuracy_score' => $varianceMetrics ? round((float) ($varianceMetrics['summary']['accuracy_score'] ?? 0), 2) : null,
            ],
            'collection' => [
                'current' => $collectionCurrent,
                'previous' => $collectionPrevious,
            ],
            'aging' => $agingMetrics,
            'churn' => $churnMetrics,
            'arpu' => [
                'current' => $arpuCurrent,
                'previous' => $arpuPrevious,
            ],
            'activity' => [
                'current' => [
                    'active_customers' => (int) $activityCurrent['active_customers'],
                    'inactive_customers' => (int) $activityCurrent['inactive_customers'],
                    'overdue_customers' => (int) $activityCurrent['overdue_customers'],
                    'isolated_customers' => (int) $activityCurrent['isolated_customers'],
                ],
                'previous' => [
                    'active_customers' => (int) $activityPrevious['active_customers'],
                    'inactive_customers' => (int) $activityPrevious['inactive_customers'],
                    'overdue_customers' => (int) $activityPrevious['overdue_customers'],
                    'isolated_customers' => (int) $activityPrevious['isolated_customers'],
                ],
            ],
            'variance' => $varianceMetrics,
        ];
    }

    private function computeCollectionMetrics(Carbon $startDate, Carbon $endDate): array
    {
        $startDateString = $startDate->toDateString();
        $endDateString = $endDate->toDateString();

        $dueAmount = (float) Invoice::whereBetween('due_date', [$startDateString, $endDateString])
            ->where('status', '!=', 'cancelled')
            ->sum('amount');

        $dueInvoices = (int) Invoice::whereBetween('due_date', [$startDateString, $endDateString])
            ->where('status', '!=', 'cancelled')
            ->count();

        $collectedDueAmount = (float) Invoice::whereBetween('due_date', [$startDateString, $endDateString])
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->where('paid_at', '<=', $endDate->copy()->endOfDay())
            ->sum('amount');

        $collectedDueInvoices = (int) Invoice::whereBetween('due_date', [$startDateString, $endDateString])
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->where('paid_at', '<=', $endDate->copy()->endOfDay())
            ->count();

        $cashCollectedInPeriod = (float) Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->sum('amount');

        $collectionRate = $dueAmount > 0 ? ($collectedDueAmount / $dueAmount) * 100 : 0.0;

        return [
            'range' => [
                'start_date' => $startDateString,
                'end_date' => $endDateString,
            ],
            'due_amount' => (int) round($dueAmount),
            'due_invoices' => $dueInvoices,
            'collected_due_amount' => (int) round($collectedDueAmount),
            'collected_due_invoices' => $collectedDueInvoices,
            'outstanding_due_amount' => (int) round(max(0, $dueAmount - $collectedDueAmount)),
            'cash_collected_in_period' => (int) round($cashCollectedInPeriod),
            'collection_rate' => round($collectionRate, 2),
        ];
    }

    private function computeAgingMetrics(Carbon $asOfDate): array
    {
        $asOfDay = $asOfDate->copy()->startOfDay();

        $buckets = [
            'not_due' => ['key' => 'not_due', 'label' => 'Belum Jatuh Tempo', 'amount' => 0.0, 'invoice_count' => 0],
            'overdue_1_30' => ['key' => 'overdue_1_30', 'label' => '1-30 Hari', 'amount' => 0.0, 'invoice_count' => 0],
            'overdue_31_60' => ['key' => 'overdue_31_60', 'label' => '31-60 Hari', 'amount' => 0.0, 'invoice_count' => 0],
            'overdue_61_90' => ['key' => 'overdue_61_90', 'label' => '61-90 Hari', 'amount' => 0.0, 'invoice_count' => 0],
            'overdue_90_plus' => ['key' => 'overdue_90_plus', 'label' => '>90 Hari', 'amount' => 0.0, 'invoice_count' => 0],
        ];

        $openInvoices = Invoice::whereNotIn('status', ['paid', 'cancelled'])
            ->whereNotNull('due_date')
            ->get(['id', 'amount', 'due_date']);

        $totalOutstandingAmount = 0.0;
        foreach ($openInvoices as $invoice) {
            $amount = (float) ($invoice->amount ?? 0);
            $totalOutstandingAmount += $amount;

            $dueDate = Carbon::parse($invoice->due_date)->startOfDay();
            if ($dueDate->gt($asOfDay)) {
                $bucketKey = 'not_due';
            } else {
                $daysOverdue = $dueDate->diffInDays($asOfDay);
                if ($daysOverdue <= 30) {
                    $bucketKey = 'overdue_1_30';
                } elseif ($daysOverdue <= 60) {
                    $bucketKey = 'overdue_31_60';
                } elseif ($daysOverdue <= 90) {
                    $bucketKey = 'overdue_61_90';
                } else {
                    $bucketKey = 'overdue_90_plus';
                }
            }

            $buckets[$bucketKey]['amount'] += $amount;
            $buckets[$bucketKey]['invoice_count']++;
        }

        $totalOverdueAmount = (float) $buckets['overdue_1_30']['amount']
            + (float) $buckets['overdue_31_60']['amount']
            + (float) $buckets['overdue_61_90']['amount']
            + (float) $buckets['overdue_90_plus']['amount'];

        $totalOverdueInvoices = (int) $buckets['overdue_1_30']['invoice_count']
            + (int) $buckets['overdue_31_60']['invoice_count']
            + (int) $buckets['overdue_61_90']['invoice_count']
            + (int) $buckets['overdue_90_plus']['invoice_count'];

        $orderedBuckets = [
            $buckets['not_due'],
            $buckets['overdue_1_30'],
            $buckets['overdue_31_60'],
            $buckets['overdue_61_90'],
            $buckets['overdue_90_plus'],
        ];

        foreach ($orderedBuckets as &$bucket) {
            $bucket['amount'] = (int) round((float) $bucket['amount']);
            $bucket['percentage_of_outstanding'] = $totalOutstandingAmount > 0
                ? round((((float) $bucket['amount']) / $totalOutstandingAmount) * 100, 2)
                : 0.0;
        }

        return [
            'as_of_date' => $asOfDay->toDateString(),
            'total_outstanding_amount' => (int) round($totalOutstandingAmount),
            'total_overdue_amount' => (int) round($totalOverdueAmount),
            'total_overdue_invoices' => $totalOverdueInvoices,
            'buckets' => $orderedBuckets,
        ];
    }

    private function computePaymentChurnMetrics(Carbon $startDate, Carbon $endDate): array
    {
        $periodDays = $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        $previousStart = $startDate->copy()->subDays($periodDays)->startOfDay();
        $previousEnd = $startDate->copy()->subDay()->endOfDay();

        $currentPaidCustomers = Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->distinct()
            ->pluck('customer_id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        $previousPaidCustomers = Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$previousStart->copy()->startOfDay(), $previousEnd->copy()->endOfDay()])
            ->distinct()
            ->pluck('customer_id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        $churnedCustomers = array_values(array_diff($previousPaidCustomers, $currentPaidCustomers));
        $retainedCustomers = array_values(array_intersect($previousPaidCustomers, $currentPaidCustomers));
        $newlyPayingCustomers = array_values(array_diff($currentPaidCustomers, $previousPaidCustomers));

        $previousPaidCount = count($previousPaidCustomers);
        $currentPaidCount = count($currentPaidCustomers);
        $churnedCount = count($churnedCustomers);
        $retainedCount = count($retainedCustomers);
        $newlyPayingCount = count($newlyPayingCustomers);

        $churnRate = $previousPaidCount > 0 ? ($churnedCount / $previousPaidCount) * 100 : 0.0;
        $retentionRate = $previousPaidCount > 0 ? ($retainedCount / $previousPaidCount) * 100 : 0.0;

        return [
            'definition' => 'Churn berbasis pelanggan yang membayar: pelanggan yang bayar di periode sebelumnya namun tidak bayar di periode berjalan.',
            'period_days' => $periodDays,
            'previous_paid_customers' => $previousPaidCount,
            'current_paid_customers' => $currentPaidCount,
            'churned_customers' => $churnedCount,
            'retained_customers' => $retainedCount,
            'newly_paying_customers' => $newlyPayingCount,
            'churn_rate' => round($churnRate, 2),
            'retention_rate' => round($retentionRate, 2),
            'net_paid_customer_change' => $currentPaidCount - $previousPaidCount,
        ];
    }

    private function computeArpuMetrics(Carbon $startDate, Carbon $endDate, ?array $isolatedUsernameMap = null): array
    {
        $realizedRevenue = (float) Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->sum('amount');

        $paidCustomers = (int) Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->distinct()
            ->count('customer_id');

        $activitySummary = $this->buildCustomerActivitySummary($endDate->copy()->startOfDay(), $isolatedUsernameMap);
        $operationalActiveCustomers = (int) $activitySummary['active_customers'];
        $operationalInactiveCustomers = (int) $activitySummary['inactive_customers'];

        return [
            'realized_revenue' => (int) round($realizedRevenue),
            'paid_customers' => $paidCustomers,
            'operational_active_customers' => $operationalActiveCustomers,
            'operational_inactive_customers' => $operationalInactiveCustomers,
            'arpu_paid_customer' => round($this->safeAverage($realizedRevenue, $paidCustomers), 2),
            'arpu_operational_active' => round($this->safeAverage($realizedRevenue, $operationalActiveCustomers), 2),
        ];
    }

    private function buildForecastVarianceBacktest(Carbon $startDate, Carbon $endDate): array
    {
        $historyWindowStart = $startDate->copy()->subDays(210)->startOfDay();
        $dailyRevenueMap = $this->getDailyPaidRevenueMap($historyWindowStart, $endDate->copy()->endOfDay());

        $dailyRows = [];
        $predictedTotal = 0.0;
        $actualTotal = 0.0;
        $absolutePercentageErrorTotal = 0.0;
        $daysAboveForecast = 0;
        $daysBelowForecast = 0;

        for ($targetDate = $startDate->copy()->startOfDay(); $targetDate->lte($endDate); $targetDate->addDay()) {
            $historyStart = $targetDate->copy()->subDays(180)->startOfDay();
            $historyEnd = $targetDate->copy()->subDay()->endOfDay();

            $weekdayStats = [];
            for ($i = 0; $i <= 6; $i++) {
                $weekdayStats[$i] = ['sum' => 0.0, 'count' => 0];
            }

            $domStats = [];
            for ($i = 1; $i <= 31; $i++) {
                $domStats[$i] = ['sum' => 0.0, 'count' => 0];
            }

            $overallRevenue = 0.0;
            $historyDays = 0;
            $daysWithPayments = 0;

            $recentRevenue = 0.0;
            $recentDays = 0;
            $recentWindowStart = $targetDate->copy()->subDays(30)->startOfDay();

            for ($cursor = $historyStart->copy(); $cursor->lte($historyEnd); $cursor->addDay()) {
                $amount = (float) ($dailyRevenueMap[$cursor->toDateString()] ?? 0);
                $overallRevenue += $amount;
                $historyDays++;

                if ($amount > 0) {
                    $daysWithPayments++;
                }

                if ($cursor->gte($recentWindowStart)) {
                    $recentRevenue += $amount;
                    $recentDays++;
                }

                $weekday = $cursor->dayOfWeek;
                $dayOfMonth = $cursor->day;

                $weekdayStats[$weekday]['sum'] += $amount;
                $weekdayStats[$weekday]['count']++;
                $domStats[$dayOfMonth]['sum'] += $amount;
                $domStats[$dayOfMonth]['count']++;
            }

            $overallAverage = $this->safeAverage($overallRevenue, $historyDays);
            $recentAverage = $this->safeAverage($recentRevenue, $recentDays);
            $targetWeekday = $targetDate->dayOfWeek;
            $targetDayOfMonth = $targetDate->day;

            $weekdayAverage = $this->safeAverage((float) $weekdayStats[$targetWeekday]['sum'], (int) $weekdayStats[$targetWeekday]['count']);
            $domAverage = $this->safeAverage((float) $domStats[$targetDayOfMonth]['sum'], (int) $domStats[$targetDayOfMonth]['count']);

            if ($weekdayAverage <= 0) {
                $weekdayAverage = $overallAverage;
            }
            if ($domAverage <= 0) {
                $domAverage = $overallAverage;
            }

            $predictedRevenue = (float) round(max(0, ($weekdayAverage * 0.55) + ($domAverage * 0.25) + ($recentAverage * 0.20)));
            $actualRevenue = (float) ($dailyRevenueMap[$targetDate->toDateString()] ?? 0);

            $varianceAmount = $actualRevenue - $predictedRevenue;
            $variancePercentage = $predictedRevenue > 0
                ? ($varianceAmount / $predictedRevenue) * 100
                : ($actualRevenue > 0 ? 100.0 : 0.0);

            $absolutePercentageError = $actualRevenue > 0
                ? (abs($varianceAmount) / $actualRevenue) * 100
                : ($predictedRevenue > 0 ? 100.0 : 0.0);

            $confidence = 45
                + min(20, ((int) $weekdayStats[$targetWeekday]['count']) * 0.8)
                + min(15, ((int) $domStats[$targetDayOfMonth]['count']) * 0.5)
                + min(8, $daysWithPayments / 12);
            $confidence = $overallAverage > 0 ? $this->clamp($confidence, 35, 90) : 35;

            if ($varianceAmount >= 0) {
                $daysAboveForecast++;
            } else {
                $daysBelowForecast++;
            }

            $predictedTotal += $predictedRevenue;
            $actualTotal += $actualRevenue;
            $absolutePercentageErrorTotal += $absolutePercentageError;

            $dailyRows[] = [
                'date' => $targetDate->toDateString(),
                'day_name' => $this->getWeekdayName($targetWeekday),
                'predicted_revenue' => (int) round($predictedRevenue),
                'actual_revenue' => (int) round($actualRevenue),
                'variance_amount' => (int) round($varianceAmount),
                'variance_percentage' => round($variancePercentage, 2),
                'confidence' => (int) round($confidence),
            ];
        }

        $days = count($dailyRows);
        $varianceAmountTotal = $actualTotal - $predictedTotal;
        $variancePercentageTotal = $predictedTotal > 0 ? ($varianceAmountTotal / $predictedTotal) * 100 : 0.0;
        $mape = $this->safeAverage($absolutePercentageErrorTotal, $days);
        $accuracyScore = $this->clamp(100 - $mape, 0, 100);

        return [
            'range' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'days' => $days,
            ],
            'summary' => [
                'predicted_total' => (int) round($predictedTotal),
                'actual_total' => (int) round($actualTotal),
                'variance_amount' => (int) round($varianceAmountTotal),
                'variance_percentage' => round($variancePercentageTotal, 2),
                'mape' => round($mape, 2),
                'accuracy_score' => round($accuracyScore, 2),
                'days_above_forecast' => $daysAboveForecast,
                'days_below_forecast' => $daysBelowForecast,
            ],
            'daily' => $dailyRows,
        ];
    }

    private function getDailyPaidRevenueMap(Carbon $startDate, Carbon $endDate): array
    {
        $rows = Invoice::selectRaw('DATE(paid_at) as paid_date, SUM(amount) as total_amount')
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->groupByRaw('DATE(paid_at)')
            ->orderBy('paid_date')
            ->get();

        $dailyRevenueMap = [];
        foreach ($rows as $row) {
            $dailyRevenueMap[(string) $row->paid_date] = (float) ($row->total_amount ?? 0);
        }

        return $dailyRevenueMap;
    }

    private function buildRevenueForecast(Carbon $startDate, Carbon $endDate): array
    {
        $forecastStart = $startDate->copy()->startOfDay();
        $forecastEnd = $endDate->copy()->endOfDay();

        $historyEnd = Carbon::today()->subDay()->endOfDay();
        $historyStart = $historyEnd->copy()->subMonths(12)->startOfDay();

        $historicalRows = Invoice::selectRaw('DATE(paid_at) as paid_date, SUM(amount) as total_amount, COUNT(*) as invoice_count')
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$historyStart, $historyEnd])
            ->groupByRaw('DATE(paid_at)')
            ->orderBy('paid_date')
            ->get();

        $historyByDate = [];
        $historicalInvoiceCount = 0;
        foreach ($historicalRows as $row) {
            $dateKey = (string) $row->paid_date;
            $historyByDate[$dateKey] = [
                'amount' => (float) ($row->total_amount ?? 0),
                'count' => (int) ($row->invoice_count ?? 0),
            ];
            $historicalInvoiceCount += (int) ($row->invoice_count ?? 0);
        }

        $dailyHistory = [];
        $overallRevenue = 0.0;
        $historyDayCount = 0;
        $daysWithPayments = 0;

        $weekdayStats = [];
        for ($i = 0; $i <= 6; $i++) {
            $weekdayStats[$i] = ['sum' => 0.0, 'count' => 0, 'payment_days' => 0];
        }

        $domStats = [];
        for ($i = 1; $i <= 31; $i++) {
            $domStats[$i] = ['sum' => 0.0, 'count' => 0, 'payment_days' => 0];
        }

        $monthStats = [];
        for ($i = 1; $i <= 12; $i++) {
            $monthStats[$i] = ['sum' => 0.0, 'count' => 0, 'payment_days' => 0];
        }

        $recentWindowStart = Carbon::today()->subDays(29)->startOfDay();
        $recentRevenueTotal = 0.0;
        $recentDayCount = 0;

        $monthlyTotals = [];

        for ($cursor = $historyStart->copy(); $cursor->lte($historyEnd); $cursor->addDay()) {
            $dateKey = $cursor->toDateString();
            $amount = (float) ($historyByDate[$dateKey]['amount'] ?? 0);
            $invoiceCount = (int) ($historyByDate[$dateKey]['count'] ?? 0);

            $overallRevenue += $amount;
            $historyDayCount++;

            if ($amount > 0) {
                $daysWithPayments++;
            }

            if ($cursor->gte($recentWindowStart)) {
                $recentRevenueTotal += $amount;
                $recentDayCount++;
            }

            $weekday = $cursor->dayOfWeek;
            $dayOfMonth = $cursor->day;
            $monthNumber = $cursor->month;

            $weekdayStats[$weekday]['sum'] += $amount;
            $weekdayStats[$weekday]['count']++;
            if ($amount > 0) {
                $weekdayStats[$weekday]['payment_days']++;
            }

            $domStats[$dayOfMonth]['sum'] += $amount;
            $domStats[$dayOfMonth]['count']++;
            if ($amount > 0) {
                $domStats[$dayOfMonth]['payment_days']++;
            }

            $monthStats[$monthNumber]['sum'] += $amount;
            $monthStats[$monthNumber]['count']++;
            if ($amount > 0) {
                $monthStats[$monthNumber]['payment_days']++;
            }

            $monthKey = $cursor->format('Y-m');
            if (!isset($monthlyTotals[$monthKey])) {
                $monthlyTotals[$monthKey] = 0.0;
            }
            $monthlyTotals[$monthKey] += $amount;

            $dailyHistory[] = [
                'date' => $dateKey,
                'amount' => $amount,
                'invoice_count' => $invoiceCount,
            ];
        }

        $overallDailyAverage = $this->safeAverage($overallRevenue, $historyDayCount);
        $recentDailyAverage = $this->safeAverage($recentRevenueTotal, $recentDayCount);

        $variance = 0.0;
        if ($historyDayCount > 0) {
            foreach ($dailyHistory as $entry) {
                $variance += pow((float) $entry['amount'] - $overallDailyAverage, 2);
            }
            $variance /= $historyDayCount;
        }
        $stdDev = sqrt($variance);
        $volatilityRatio = $overallDailyAverage > 0 ? $stdDev / $overallDailyAverage : 0.0;
        $volatilityIndex = round($this->clamp($volatilityRatio * 100, 0, 100), 2);

        ksort($monthlyTotals);
        $monthlyValues = array_values($monthlyTotals);
        $recentMonthlyValues = array_slice($monthlyValues, -6);

        $trendPercentage = 0.0;
        if (count($recentMonthlyValues) >= 2) {
            $firstValue = (float) $recentMonthlyValues[0];
            $lastValue = (float) $recentMonthlyValues[count($recentMonthlyValues) - 1];

            if ($firstValue > 0) {
                $trendPercentage = (($lastValue - $firstValue) / $firstValue) * 100;
            } elseif ($lastValue > 0) {
                $trendPercentage = 100.0;
            }
        }

        $trendFactor = $this->clamp(1 + (($trendPercentage / 100) * 0.20), 0.80, 1.25);
        $recencyFactor = $overallDailyAverage > 0
            ? $this->clamp($recentDailyAverage / $overallDailyAverage, 0.80, 1.20)
            : 1.0;

        $bestWeekday = 0;
        $worstWeekday = 0;
        $bestWeekdayAvg = -1;
        $worstWeekdayAvg = PHP_FLOAT_MAX;

        foreach ($weekdayStats as $weekday => $stats) {
            $average = $this->safeAverage((float) $stats['sum'], (int) $stats['count']);
            if ($average > $bestWeekdayAvg) {
                $bestWeekdayAvg = $average;
                $bestWeekday = (int) $weekday;
            }
            if ($average < $worstWeekdayAvg) {
                $worstWeekdayAvg = $average;
                $worstWeekday = (int) $weekday;
            }
        }

        $forecastDays = $forecastStart->copy()->startOfDay()->diffInDays($forecastEnd->copy()->startOfDay()) + 1;
        $dailyForecast = [];
        $predictedTotal = 0.0;
        $confidenceTotal = 0.0;

        for ($cursor = $forecastStart->copy(), $offset = 0; $cursor->lte($forecastEnd); $cursor->addDay(), $offset++) {
            $weekday = $cursor->dayOfWeek;
            $dayOfMonth = $cursor->day;
            $monthNumber = $cursor->month;

            $weekdayAverage = $this->safeAverage((float) $weekdayStats[$weekday]['sum'], (int) $weekdayStats[$weekday]['count']);
            $domAverage = $this->safeAverage((float) $domStats[$dayOfMonth]['sum'], (int) $domStats[$dayOfMonth]['count']);
            $monthAverage = $this->safeAverage((float) $monthStats[$monthNumber]['sum'], (int) $monthStats[$monthNumber]['count']);

            if ($weekdayAverage <= 0) {
                $weekdayAverage = $overallDailyAverage;
            }

            if ($domAverage <= 0) {
                $domAverage = $overallDailyAverage;
            }

            if ($monthAverage <= 0) {
                $monthAverage = $overallDailyAverage;
            }

            $seasonalityFactor = $overallDailyAverage > 0
                ? $this->clamp($monthAverage / $overallDailyAverage, 0.75, 1.25)
                : 1.0;

            $baseline = ($weekdayAverage * 0.50) + ($domAverage * 0.30) + ($recentDailyAverage * 0.20);
            $predictedRevenue = (int) round(max(0, $baseline * $trendFactor * $seasonalityFactor * $recencyFactor));

            $weekdaySamples = (int) ($weekdayStats[$weekday]['count'] ?? 0);
            $domSamples = (int) ($domStats[$dayOfMonth]['count'] ?? 0);
            $confidence = 45
                + min(20, $weekdaySamples * 0.8)
                + min(15, $domSamples * 0.5)
                + min(8, $daysWithPayments / 15)
                - min(18, $volatilityRatio * 20)
                - min(10, $offset * 0.8);

            if ($overallDailyAverage <= 0) {
                $confidence = 35;
            }

            $confidence = (int) round($this->clamp($confidence, 35, 95));

            $dailyForecast[] = [
                'date' => $cursor->toDateString(),
                'day_name' => $this->getWeekdayName($weekday),
                'predicted_revenue' => $predictedRevenue,
                'confidence' => $confidence,
                'components' => [
                    'weekday_average' => (int) round($weekdayAverage),
                    'day_of_month_average' => (int) round($domAverage),
                    'recent_average' => (int) round($recentDailyAverage),
                    'trend_factor' => round($trendFactor, 3),
                    'seasonality_factor' => round($seasonalityFactor, 3),
                    'recency_factor' => round($recencyFactor, 3),
                ],
            ];

            $predictedTotal += $predictedRevenue;
            $confidenceTotal += $confidence;
        }

        $averageConfidence = (int) round($this->safeAverage($confidenceTotal, $forecastDays));
        $predictedDailyAverage = (int) round($this->safeAverage($predictedTotal, $forecastDays));

        $analysisNotes = [];
        if ($historicalInvoiceCount === 0) {
            $analysisNotes[] = 'Data invoice paid historis belum tersedia, sehingga prediksi masih konservatif.';
        } else {
            $analysisNotes[] = 'Model memadukan pola hari (mingguan), tanggal, tren 6 bulan, dan faktor seasonality bulanan.';
            $analysisNotes[] = 'Tren 6 bulan terakhir ' . ($trendPercentage >= 0 ? 'naik' : 'turun') . ' sekitar ' . number_format(abs($trendPercentage), 1) . '%.';
            $analysisNotes[] = 'Hari terkuat historis: ' . $this->getWeekdayName($bestWeekday) . ' (rata-rata Rp ' . number_format((int) round(max($bestWeekdayAvg, 0)), 0, ',', '.') . ').';
        }

        if ($volatilityIndex >= 70) {
            $analysisNotes[] = 'Volatilitas pendapatan tergolong tinggi, gunakan prediksi sebagai baseline operasional.';
        } elseif ($volatilityIndex >= 40) {
            $analysisNotes[] = 'Volatilitas pendapatan sedang, prediksi cukup stabil untuk perencanaan mingguan.';
        } else {
            $analysisNotes[] = 'Volatilitas pendapatan rendah, pola historis cenderung konsisten.';
        }

        return [
            'range' => [
                'start_date' => $forecastStart->toDateString(),
                'end_date' => $forecastEnd->toDateString(),
                'days' => $forecastDays,
            ],
            'summary' => [
                'predicted_total_revenue' => (int) round($predictedTotal),
                'predicted_daily_average' => $predictedDailyAverage,
                'historical_daily_average' => (int) round($overallDailyAverage),
                'recent_30d_daily_average' => (int) round($recentDailyAverage),
                'trend_percentage_6m' => round($trendPercentage, 2),
                'average_confidence' => $averageConfidence,
                'historical_paid_invoices' => $historicalInvoiceCount,
                'historical_total_revenue' => (int) round($overallRevenue),
                'best_weekday' => $this->getWeekdayName($bestWeekday),
                'best_weekday_average' => (int) round(max($bestWeekdayAvg, 0)),
                'worst_weekday' => $this->getWeekdayName($worstWeekday),
                'worst_weekday_average' => (int) round(max($worstWeekdayAvg, 0)),
                'analysis_notes' => $analysisNotes,
            ],
            'historical_context' => [
                'window_start' => $historyStart->toDateString(),
                'window_end' => $historyEnd->toDateString(),
                'total_days' => $historyDayCount,
                'days_with_payments' => $daysWithPayments,
                'zero_revenue_days' => max(0, $historyDayCount - $daysWithPayments),
                'volatility_index' => $volatilityIndex,
            ],
            'daily_forecast' => $dailyForecast,
        ];
    }

    private function safeAverage(float $sum, int $count): float
    {
        return $count > 0 ? ($sum / $count) : 0.0;
    }

    private function clamp(float $value, float $min, float $max): float
    {
        return max($min, min($max, $value));
    }

    private function getWeekdayName(int $dayOfWeek): string
    {
        $map = [
            0 => 'Minggu',
            1 => 'Senin',
            2 => 'Selasa',
            3 => 'Rabu',
            4 => 'Kamis',
            5 => 'Jumat',
            6 => 'Sabtu',
        ];

        return $map[$dayOfWeek] ?? 'Tidak diketahui';
    }
}

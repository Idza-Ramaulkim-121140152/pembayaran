<?php

namespace App\Http\Controllers;


use App\Models\Invoice;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\FinancialPlanningTarget;
use App\Models\FinancialTransaction;
use App\Models\NetworkNotice;
use App\Models\User;
use App\Services\FinancialLedgerService;
use Illuminate\Http\Request;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class DashboardController extends Controller
{
    private function canViewFinancialMetrics(?User $user): bool
    {
        return $user !== null && !$user->isTeknisi();
    }

    private function canManageFinancialTargets(?User $user): bool
    {
        return $user !== null && $user->isSuperAdmin();
    }

    private function isFinancialTargetsReady(): bool
    {
        return Schema::hasTable('financial_planning_targets');
    }

    private function isLedgerReady(): bool
    {
        return Schema::hasTable('financial_transactions');
    }

    private function isComplaintsReady(): bool
    {
        return Schema::hasTable('complaints');
    }

    private function isNetworkNoticesReady(): bool
    {
        return Schema::hasTable('network_notices');
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

    private function calculateChangePercentage(float $current, float $previous): float
    {
        if (abs($previous) < 0.00001) {
            return $current === 0.0 ? 0.0 : 100.0;
        }

        return (($current - $previous) / abs($previous)) * 100;
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
        $monthlyExpense = null;
        $monthlyNet = null;
        $pendingInvoices = null;
        $revenueByMonth = [];
        $monthlyFinance = null;
        $financeSummary = null;

        if ($canViewFinancialMetrics) {
            $ledgerService = app(FinancialLedgerService::class);
            $financeSummary = $ledgerService->getSummary();

            $monthlyRevenue = \App\Models\Invoice::whereBetween('paid_at', [$startOfMonth, $endOfMonth])
                ->where('status', 'paid')
                ->sum('amount');

            $monthlyIncomeForComparison = (float) $monthlyRevenue;
            $monthlyExpenseForComparison = 0.0;
            $monthlyAdjustmentForComparison = 0.0;

            $lastMonthStart = $startOfMonth->copy()->subMonthNoOverflow()->startOfMonth();
            $lastMonthEnd = $startOfMonth->copy()->subMonthNoOverflow()->endOfMonth();

            $lastMonthIncomeForComparison = (float) Invoice::whereBetween('paid_at', [$lastMonthStart, $lastMonthEnd])
                ->where('status', 'paid')
                ->sum('amount');
            $lastMonthExpenseForComparison = 0.0;
            $lastMonthAdjustmentForComparison = 0.0;

            if ($this->isLedgerReady()) {
                $monthlyIncomeForComparison = (float) FinancialTransaction::query()
                    ->where('type', 'income')
                    ->whereBetween('transaction_date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->sum('amount');

                $monthlyExpenseForComparison = (float) FinancialTransaction::query()
                    ->where('type', 'expense')
                    ->whereBetween('transaction_date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->sum('amount');

                $monthlyAdjustmentForComparison = (float) FinancialTransaction::query()
                    ->where('type', 'adjustment')
                    ->whereBetween('transaction_date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->sum('amount');

                $lastMonthIncomeForComparison = (float) FinancialTransaction::query()
                    ->where('type', 'income')
                    ->whereBetween('transaction_date', [$lastMonthStart->toDateString(), $lastMonthEnd->toDateString()])
                    ->sum('amount');

                $lastMonthExpenseForComparison = (float) FinancialTransaction::query()
                    ->where('type', 'expense')
                    ->whereBetween('transaction_date', [$lastMonthStart->toDateString(), $lastMonthEnd->toDateString()])
                    ->sum('amount');

                $lastMonthAdjustmentForComparison = (float) FinancialTransaction::query()
                    ->where('type', 'adjustment')
                    ->whereBetween('transaction_date', [$lastMonthStart->toDateString(), $lastMonthEnd->toDateString()])
                    ->sum('amount');
            }

            $monthlyExpense = $monthlyExpenseForComparison;
            $monthlyNet = $monthlyIncomeForComparison - $monthlyExpenseForComparison + $monthlyAdjustmentForComparison;
            $previousMonthNet = $lastMonthIncomeForComparison - $lastMonthExpenseForComparison + $lastMonthAdjustmentForComparison;

            $monthlyFinance = [
                'current_month' => [
                    'label' => $startOfMonth->copy()->locale('id')->translatedFormat('F Y'),
                    'income' => (int) round($monthlyIncomeForComparison),
                    'expense' => (int) round($monthlyExpenseForComparison),
                    'adjustment' => (int) round($monthlyAdjustmentForComparison),
                    'net' => (int) round($monthlyNet),
                ],
                'previous_month' => [
                    'label' => $lastMonthStart->copy()->locale('id')->translatedFormat('F Y'),
                    'income' => (int) round($lastMonthIncomeForComparison),
                    'expense' => (int) round($lastMonthExpenseForComparison),
                    'adjustment' => (int) round($lastMonthAdjustmentForComparison),
                    'net' => (int) round($previousMonthNet),
                ],
                'ratio_income_to_expense' => $monthlyExpenseForComparison > 0
                    ? round($monthlyIncomeForComparison / $monthlyExpenseForComparison, 2)
                    : null,
                'comparison' => [
                    'income_change_percentage' => round($this->calculateChangePercentage($monthlyIncomeForComparison, $lastMonthIncomeForComparison), 2),
                    'expense_change_percentage' => round($this->calculateChangePercentage($monthlyExpenseForComparison, $lastMonthExpenseForComparison), 2),
                    'net_change_percentage' => round($this->calculateChangePercentage($monthlyNet, $previousMonthNet), 2),
                ],
            ];

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
            $payload['monthly_expense'] = $monthlyExpense;
            $payload['monthly_net'] = $monthlyNet;
            $payload['pending_invoices'] = $pendingInvoices;
            $payload['revenue_by_month'] = $revenueByMonth;
            $payload['monthly_finance'] = $monthlyFinance;
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

    public function financialProjection(Request $request)
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

        $hasStartDate = isset($validated['start_date']);
        $hasEndDate = isset($validated['end_date']);

        if ($hasStartDate && $hasEndDate) {
            $startDate = Carbon::parse($validated['start_date'])->startOfDay();
            $endDate = Carbon::parse($validated['end_date'])->endOfDay();
        } elseif ($hasStartDate) {
            $monthReference = Carbon::parse($validated['start_date']);
            $startDate = $monthReference->copy()->startOfMonth()->startOfDay();
            $endDate = $monthReference->copy()->endOfMonth()->endOfDay();
        } elseif ($hasEndDate) {
            $monthReference = Carbon::parse($validated['end_date']);
            $startDate = $monthReference->copy()->startOfMonth()->startOfDay();
            $endDate = $monthReference->copy()->endOfMonth()->endOfDay();
        } else {
            $monthReference = Carbon::today();
            $startDate = $monthReference->copy()->startOfMonth()->startOfDay();
            $endDate = $monthReference->copy()->endOfMonth()->endOfDay();
        }

        if ($startDate->gt($endDate)) {
            return response()->json([
                'message' => 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.',
            ], 422);
        }

        $totalDays = $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        if ($totalDays > 365) {
            return response()->json([
                'message' => 'Rentang prediksi keuangan maksimal 365 hari.',
            ], 422);
        }

        $projectionData = $this->buildFinancialProjection($startDate, $endDate);
        $projectionData['ai_assistant'] = $this->buildFinancialProjectionAssistant($projectionData);

        return response()->json([
            'data' => $projectionData,
        ]);
    }

    public function confirmMandatoryExpenseExecution(Request $request)
    {
        if (!$this->canViewFinancialMetrics($request->user())) {
            return response()->json([
                'message' => 'Anda tidak memiliki izin mengonfirmasi pengeluaran wajib.',
            ], 403);
        }

        if (!$this->isFinancialTargetsReady()) {
            return response()->json([
                'message' => 'Data target keuangan belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'target_id' => 'required|integer|exists:financial_planning_targets,id',
            'due_date' => 'required|date',
            'actual_date' => 'nullable|date',
            'amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string|max:500',
        ]);

        $target = FinancialPlanningTarget::query()->find((int) $validated['target_id']);
        if (!$target || $target->type !== FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE) {
            return response()->json([
                'message' => 'Target yang dipilih bukan target pengeluaran wajib.',
            ], 422);
        }

        $dueDate = Carbon::parse($validated['due_date'])->toDateString();
        $actualDate = isset($validated['actual_date'])
            ? Carbon::parse($validated['actual_date'])->toDateString()
            : Carbon::today()->toDateString();

        $amount = isset($validated['amount']) && (float) $validated['amount'] > 0
            ? (float) $validated['amount']
            : (float) ($target->amount ?? 0);

        if ($amount <= 0) {
            return response()->json([
                'message' => 'Nominal realisasi wajib harus lebih dari 0.',
            ], 422);
        }

        $notes = isset($validated['notes']) ? trim((string) $validated['notes']) : null;

        $targetMeta = is_array($target->meta) ? $target->meta : [];
        $confirmations = is_array($targetMeta['confirmations'] ?? null)
            ? $targetMeta['confirmations']
            : [];

        $confirmations[$dueDate] = [
            'due_date' => $dueDate,
            'actual_date' => $actualDate,
            'amount' => $amount,
            'notes' => $notes,
            'confirmed_by' => $request->user()?->id,
            'confirmed_at' => now()->toIso8601String(),
        ];

        $targetMeta['confirmations'] = $confirmations;

        $target->update([
            'meta' => $targetMeta,
            'updated_by' => $request->user()?->id,
        ]);

        if ($this->isLedgerReady()) {
            FinancialTransaction::query()
                ->where('source', 'mandatory_target_execution')
                ->where('reference_type', FinancialPlanningTarget::class)
                ->where('reference_id', (int) $target->id)
                ->where('meta->due_date', $dueDate)
                ->delete();
        }

        return response()->json([
            'message' => 'Pengeluaran wajib berhasil dikonfirmasi sebagai terlaksana.',
            'data' => [
                'target_id' => (int) $target->id,
                'due_date' => $dueDate,
                'actual_date' => $actualDate,
                'amount' => (int) round($amount),
            ],
        ]);
    }

    public function revokeMandatoryExpenseExecution(Request $request)
    {
        if (!$this->canViewFinancialMetrics($request->user())) {
            return response()->json([
                'message' => 'Anda tidak memiliki izin membatalkan konfirmasi pengeluaran wajib.',
            ], 403);
        }

        if (!$this->isFinancialTargetsReady()) {
            return response()->json([
                'message' => 'Data target keuangan belum siap. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'target_id' => 'required|integer|exists:financial_planning_targets,id',
            'due_date' => 'required|date',
        ]);

        $target = FinancialPlanningTarget::query()->find((int) $validated['target_id']);
        if (!$target || $target->type !== FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE) {
            return response()->json([
                'message' => 'Target yang dipilih bukan target pengeluaran wajib.',
            ], 422);
        }

        $dueDate = Carbon::parse($validated['due_date'])->toDateString();

        $targetMeta = is_array($target->meta) ? $target->meta : [];
        $confirmations = is_array($targetMeta['confirmations'] ?? null)
            ? $targetMeta['confirmations']
            : [];

        if (!isset($confirmations[$dueDate])) {
            return response()->json([
                'message' => 'Konfirmasi pengeluaran wajib tidak ditemukan.',
            ], 404);
        }

        unset($confirmations[$dueDate]);
        if (count($confirmations) > 0) {
            $targetMeta['confirmations'] = $confirmations;
        } else {
            unset($targetMeta['confirmations']);
        }

        $metaHasContent = false;
        foreach ($targetMeta as $value) {
            if (is_array($value)) {
                if (count($value) > 0) {
                    $metaHasContent = true;
                    break;
                }
                continue;
            }

            if ($value !== null && $value !== '') {
                $metaHasContent = true;
                break;
            }
        }

        $target->update([
            'meta' => $metaHasContent ? $targetMeta : null,
            'updated_by' => $request->user()?->id,
        ]);

        if ($this->isLedgerReady()) {
            FinancialTransaction::query()
                ->where('source', 'mandatory_target_execution')
                ->where('reference_type', FinancialPlanningTarget::class)
                ->where('reference_id', (int) $target->id)
                ->where('meta->due_date', $dueDate)
                ->delete();
        }

        return response()->json([
            'message' => 'Konfirmasi pengeluaran wajib berhasil dibatalkan.',
        ]);
    }

    public function financialTargets(Request $request)
    {
        if (!$this->canViewFinancialMetrics($request->user())) {
            return response()->json([
                'message' => 'Anda tidak memiliki izin melihat data keuangan.',
            ], 403);
        }

        if (!$this->isFinancialTargetsReady()) {
            return response()->json([
                'data' => [],
            ]);
        }

        $includeInactive = $request->boolean('include_inactive', false)
            && $this->canManageFinancialTargets($request->user());

        $query = FinancialPlanningTarget::query()
            ->orderBy('type')
            ->orderBy('priority')
            ->orderBy('name');

        if (!$includeInactive) {
            $query->where('is_active', true);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function storeFinancialTarget(Request $request)
    {
        if (!$this->canManageFinancialTargets($request->user())) {
            return response()->json([
                'message' => 'Hanya superadmin yang dapat mengatur target keuangan.',
            ], 403);
        }

        if (!$this->isFinancialTargetsReady()) {
            return response()->json([
                'message' => 'Tabel financial_planning_targets belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $payload = $this->validateFinancialTargetPayload($request);
        $payload['created_by'] = $request->user()?->id;
        $payload['updated_by'] = $request->user()?->id;

        $target = FinancialPlanningTarget::create($payload);

        return response()->json([
            'message' => 'Target keuangan berhasil ditambahkan.',
            'data' => $target,
        ], 201);
    }

    public function updateFinancialTarget(Request $request, FinancialPlanningTarget $financialTarget)
    {
        if (!$this->canManageFinancialTargets($request->user())) {
            return response()->json([
                'message' => 'Hanya superadmin yang dapat mengatur target keuangan.',
            ], 403);
        }

        if (!$this->isFinancialTargetsReady()) {
            return response()->json([
                'message' => 'Tabel financial_planning_targets belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $payload = $this->validateFinancialTargetPayload($request, $financialTarget);
        $payload['updated_by'] = $request->user()?->id;

        $financialTarget->update($payload);

        return response()->json([
            'message' => 'Target keuangan berhasil diperbarui.',
            'data' => $financialTarget->fresh(),
        ]);
    }

    public function destroyFinancialTarget(Request $request, FinancialPlanningTarget $financialTarget)
    {
        if (!$this->canManageFinancialTargets($request->user())) {
            return response()->json([
                'message' => 'Hanya superadmin yang dapat mengatur target keuangan.',
            ], 403);
        }

        if (!$this->isFinancialTargetsReady()) {
            return response()->json([
                'message' => 'Tabel financial_planning_targets belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $financialTarget->delete();

        return response()->json([
            'message' => 'Target keuangan berhasil dihapus.',
        ]);
    }

    private function validateFinancialTargetPayload(Request $request, ?FinancialPlanningTarget $existingTarget = null): array
    {
        $validator = Validator::make($request->all(), [
            'type' => ['required', 'string', Rule::in([
                FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE,
                FinancialPlanningTarget::TYPE_PURCHASE_TARGET,
            ])],
            'name' => 'required|string|max:120',
            'description' => 'nullable|string|max:1000',
            'amount' => 'required|numeric|min:1',
            'target_date' => 'nullable|date',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'monthly_day' => 'nullable|integer|min:1|max:31',
            'is_recurring_monthly' => 'nullable|boolean',
            'recurrence_until' => 'nullable|date',
            'recurrence_forever' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:1|max:1000',
        ]);

        $validator->after(function ($validator) use ($request) {
            $type = (string) $request->input('type');
            $startDate = $request->input('start_date');
            $endDate = $request->input('end_date');
            $monthlyDay = $request->input('monthly_day');
            $isRecurring = $request->boolean('is_recurring_monthly', false);
            $recurrenceForever = $request->boolean('recurrence_forever', false);
            $recurrenceUntil = $request->input('recurrence_until');

            if ($type === FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE) {
                $usesMonthlyForever = $isRecurring && $recurrenceForever;

                if ($usesMonthlyForever) {
                    if (!$monthlyDay) {
                        $validator->errors()->add('monthly_day', 'Tanggal setiap bulan wajib diisi jika target bulanan selamanya.');
                    }
                } else {
                    if (!$startDate) {
                        $validator->errors()->add('start_date', 'Tanggal mulai wajib diisi untuk target pengeluaran wajib.');
                    }

                    if (!$endDate) {
                        $validator->errors()->add('end_date', 'Tanggal akhir wajib diisi untuk target pengeluaran wajib.');
                    }

                    if ($startDate && $endDate) {
                        $parsedStart = Carbon::parse($startDate)->startOfDay();
                        $parsedEnd = Carbon::parse($endDate)->startOfDay();
                        if ($parsedEnd->lt($parsedStart)) {
                            $validator->errors()->add('end_date', 'Tanggal akhir tidak boleh sebelum tanggal mulai.');
                        }
                    }
                }

                if ($isRecurring && !$recurrenceForever && !$recurrenceUntil) {
                    $validator->errors()->add('recurrence_until', 'Isi batas bulan pengulangan atau aktifkan opsi selamanya.');
                }

                if ($isRecurring && !$recurrenceForever && $recurrenceUntil && $endDate) {
                    $recurrenceLimit = Carbon::parse($recurrenceUntil)->startOfMonth();
                    $targetMonth = Carbon::parse($endDate)->startOfMonth();
                    if ($recurrenceLimit->lt($targetMonth)) {
                        $validator->errors()->add('recurrence_until', 'Batas pengulangan tidak boleh lebih awal dari bulan target awal.');
                    }
                }
            }
        });

        $validated = $validator->validate();

        $type = $validated['type'];
        $isRecurring = (bool) ($validated['is_recurring_monthly'] ?? false);
        $recurrenceForever = (bool) ($validated['recurrence_forever'] ?? false);

        $payload = [
            'type' => $type,
            'name' => trim((string) $validated['name']),
            'description' => isset($validated['description']) ? trim((string) $validated['description']) : null,
            'amount' => (float) $validated['amount'],
            'target_date' => $validated['target_date'] ?? null,
            'start_date' => $validated['start_date'] ?? null,
            'end_date' => $validated['end_date'] ?? null,
            'is_recurring_monthly' => $isRecurring,
            'recurrence_until' => $validated['recurrence_until'] ?? null,
            'recurrence_forever' => $recurrenceForever,
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'priority' => (int) ($validated['priority'] ?? 100),
            'meta' => null,
        ];

        if ($type === FinancialPlanningTarget::TYPE_PURCHASE_TARGET) {
            $payload['start_date'] = null;
            $payload['end_date'] = null;
            $payload['is_recurring_monthly'] = false;
            $payload['recurrence_until'] = null;
            $payload['recurrence_forever'] = false;
            $payload['meta'] = null;
        }

        if ($type === FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE) {
            $payload['target_date'] = null;

            if (!$payload['is_recurring_monthly']) {
                $payload['recurrence_until'] = null;
                $payload['recurrence_forever'] = false;
            }

            if ($payload['recurrence_forever']) {
                $existingMeta = $existingTarget && is_array($existingTarget->meta) ? $existingTarget->meta : [];
                $startMonth = (string) ($existingMeta['start_month'] ?? Carbon::today()->startOfMonth()->toDateString());
                $existingConfirmations = is_array($existingMeta['confirmations'] ?? null)
                    ? $existingMeta['confirmations']
                    : [];

                $payload['recurrence_until'] = null;
                $payload['start_date'] = null;
                $payload['end_date'] = null;
                $payload['meta'] = [
                    'monthly_day' => (int) ($validated['monthly_day'] ?? 0),
                    'start_month' => $startMonth,
                ];

                if (count($existingConfirmations) > 0) {
                    $payload['meta']['confirmations'] = $existingConfirmations;
                }
            } else {
                $existingMeta = $existingTarget && is_array($existingTarget->meta) ? $existingTarget->meta : [];
                $existingConfirmations = is_array($existingMeta['confirmations'] ?? null)
                    ? $existingMeta['confirmations']
                    : [];

                $payload['meta'] = count($existingConfirmations) > 0
                    ? ['confirmations' => $existingConfirmations]
                    : null;
            }
        }

        return $payload;
    }

    private function getLedgerBalanceBefore(Carbon $startDate): float
    {
        if (!$this->isLedgerReady()) {
            return 0.0;
        }

        $cutoffDate = $startDate->copy()->subDay()->toDateString();

        $income = (float) FinancialTransaction::query()
            ->where('type', 'income')
            ->where('source', '!=', 'mandatory_target_execution')
            ->whereDate('transaction_date', '<=', $cutoffDate)
            ->sum('amount');

        $expense = (float) FinancialTransaction::query()
            ->where('type', 'expense')
            ->where('source', '!=', 'mandatory_target_execution')
            ->whereDate('transaction_date', '<=', $cutoffDate)
            ->sum('amount');

        $adjustment = (float) FinancialTransaction::query()
            ->where('type', 'adjustment')
            ->where('source', '!=', 'mandatory_target_execution')
            ->whereDate('transaction_date', '<=', $cutoffDate)
            ->sum('amount');

        return $income - $expense + $adjustment;
    }

    private function buildDailyLedgerCashflowMaps(Carbon $startDate, Carbon $endDate): array
    {
        $maps = [
            'net' => [],
            'income' => [],
        ];

        if (!$this->isLedgerReady()) {
            return $maps;
        }

        $rows = FinancialTransaction::query()
            ->selectRaw('transaction_date, type, SUM(amount) as total_amount')
            ->where('source', '!=', 'mandatory_target_execution')
            ->whereBetween('transaction_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->groupBy('transaction_date', 'type')
            ->orderBy('transaction_date')
            ->get();

        foreach ($rows as $row) {
            $dateKey = (string) $row->transaction_date;
            $type = (string) $row->type;
            $amount = (float) ($row->total_amount ?? 0);

            if (!isset($maps['net'][$dateKey])) {
                $maps['net'][$dateKey] = 0.0;
            }

            if (!isset($maps['income'][$dateKey])) {
                $maps['income'][$dateKey] = 0.0;
            }

            if ($type === 'income') {
                $maps['net'][$dateKey] += $amount;
                $maps['income'][$dateKey] += $amount;
                continue;
            }

            if ($type === 'expense') {
                $maps['net'][$dateKey] -= $amount;
                continue;
            }

            $maps['net'][$dateKey] += $amount;
        }

        return $maps;
    }

    private function buildMandatoryExecutionConfirmationMap($mandatoryTargets, Carbon $startDate, Carbon $endDate): array
    {
        $confirmationMap = [];

        foreach ($mandatoryTargets as $target) {
            $targetId = (int) ($target->id ?? 0);
            if ($targetId < 1) {
                continue;
            }

            $targetMeta = is_array($target->meta) ? $target->meta : [];
            $confirmations = is_array($targetMeta['confirmations'] ?? null)
                ? $targetMeta['confirmations']
                : [];

            foreach ($confirmations as $dueDateKey => $confirmation) {
                $dueDateRaw = trim((string) ($confirmation['due_date'] ?? $dueDateKey));
                if ($dueDateRaw === '') {
                    continue;
                }

                try {
                    $dueDate = Carbon::parse($dueDateRaw)->toDateString();
                } catch (\Throwable $e) {
                    continue;
                }

                if ($dueDate < $startDate->toDateString() || $dueDate > $endDate->toDateString()) {
                    continue;
                }

                $actualDateRaw = trim((string) ($confirmation['actual_date'] ?? ''));
                $actualDate = null;
                if ($actualDateRaw !== '') {
                    try {
                        $actualDate = Carbon::parse($actualDateRaw)->toDateString();
                    } catch (\Throwable $e) {
                        $actualDate = null;
                    }
                }

                $confirmedAtRaw = trim((string) ($confirmation['confirmed_at'] ?? ''));
                $confirmedAt = null;
                if ($confirmedAtRaw !== '') {
                    try {
                        $confirmedAt = Carbon::parse($confirmedAtRaw)->toIso8601String();
                    } catch (\Throwable $e) {
                        $confirmedAt = null;
                    }
                }

                $key = $targetId . '|' . $dueDate;

                $confirmationMap[$key] = [
                    'target_id' => $targetId,
                    'due_date' => $dueDate,
                    'transaction_date' => $actualDate,
                    'amount' => (float) ($confirmation['amount'] ?? 0),
                    'confirmed_at' => $confirmedAt,
                ];
            }
        }

        return $confirmationMap;
    }

    private function resolveMandatoryIndicator(float $coverageRatio): string
    {
        if ($coverageRatio >= 1.15) {
            return 'aman';
        }

        if ($coverageRatio >= 1.0) {
            return 'waspada';
        }

        if ($coverageRatio >= 0.85) {
            return 'risiko';
        }

        return 'kritis';
    }

    private function buildFinancialProjection(Carbon $startDate, Carbon $endDate): array
    {
        $rangeStart = $startDate->copy()->startOfDay();
        $rangeEnd = $endDate->copy()->endOfDay();
        $today = Carbon::today()->startOfDay();

        $forecast = $this->buildRevenueForecast($rangeStart->copy(), $rangeEnd->copy());
        $dailyForecast = $forecast['daily_forecast'] ?? [];

        $ledgerReady = $this->isLedgerReady();
        $openingBalance = $ledgerReady
            ? $this->getLedgerBalanceBefore($rangeStart->copy())
            : 0.0;

        $ledgerMaps = $this->buildDailyLedgerCashflowMaps($rangeStart->copy(), $rangeEnd->copy());
        $dailyLedgerNetMap = $ledgerMaps['net'] ?? [];
        $dailyLedgerIncomeMap = $ledgerMaps['income'] ?? [];

        $activeTargets = collect();
        if ($this->isFinancialTargetsReady()) {
            $activeTargets = FinancialPlanningTarget::query()
                ->where('is_active', true)
                ->orderBy('priority')
                ->orderBy('id')
                ->get();
        }

        $mandatoryTargets = $activeTargets
            ->where('type', FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE)
            ->values();
        $purchaseTargets = $activeTargets
            ->where('type', FinancialPlanningTarget::TYPE_PURCHASE_TARGET)
            ->values();

        $mandatoryEvents = $this->expandMandatoryExpenseEvents($mandatoryTargets, $rangeStart->copy(), $rangeEnd->copy());
        $mandatoryConfirmations = $this->buildMandatoryExecutionConfirmationMap($mandatoryTargets, $rangeStart->copy(), $rangeEnd->copy());

        $eventsByDate = [];
        foreach ($mandatoryEvents as $event) {
            $eventsByDate[$event['due_date']][] = $event;
        }

        $dailyForecastIncomeMap = [];
        foreach ($dailyForecast as $item) {
            $date = (string) ($item['date'] ?? '');
            if ($date === '') {
                continue;
            }

            $dailyForecastIncomeMap[$date] = (float) ($item['predicted_revenue'] ?? 0);
        }

        $cash = $openingBalance;
        $mandatoryExpenseProjection = [];
        $dailyProjection = [];
        $mandatoryExpenseTotal = 0.0;
        $predictedIncomeTotal = 0.0;
        $actualIncomeInRange = 0.0;
        $forecastIncomeRemaining = 0.0;
        $mandatoryCoveredAmount = 0.0;
        $mandatoryShortfallTotal = 0.0;

        for ($cursor = $rangeStart->copy(); $cursor->lte($rangeEnd); $cursor->addDay()) {
            $dateKey = $cursor->toDateString();
            $forecastIncome = (float) ($dailyForecastIncomeMap[$dateKey] ?? 0);
            $actualNetCashflow = (float) ($dailyLedgerNetMap[$dateKey] ?? 0);
            $actualIncome = (float) ($dailyLedgerIncomeMap[$dateKey] ?? 0);
            $hasActualLedgerData = array_key_exists($dateKey, $dailyLedgerNetMap) || array_key_exists($dateKey, $dailyLedgerIncomeMap);

            $useActuals = $ledgerReady && ($cursor->lt($today) || ($cursor->equalTo($today) && $hasActualLedgerData));
            $cashflowBeforeMandatory = $useActuals ? $actualNetCashflow : $forecastIncome;
            $incomeForSummary = $useActuals ? $actualIncome : $forecastIncome;
            $incomeSource = $useActuals ? 'actual' : 'forecast';

            if ($useActuals) {
                $actualIncomeInRange += $incomeForSummary;
            } else {
                $forecastIncomeRemaining += $incomeForSummary;
            }

            $predictedIncomeTotal += $incomeForSummary;
            $cash += $cashflowBeforeMandatory;

            $mandatorySpentToday = 0.0;
            foreach (($eventsByDate[$dateKey] ?? []) as $event) {
                $amount = (float) ($event['amount'] ?? 0);
                $mandatoryExpenseTotal += $amount;

                $availableBefore = $cash;
                $eventKey = ((int) ($event['target_id'] ?? 0)) . '|' . ((string) ($event['due_date'] ?? $dateKey));
                $confirmation = $mandatoryConfirmations[$eventKey] ?? null;
                $isConfirmed = $confirmation !== null;

                if ($isConfirmed) {
                    $canCover = true;
                    $shortfall = 0.0;
                    $coverageRatio = 1.0;
                    $indicator = 'terlaksana';
                    $mandatoryCoveredAmount += $amount;
                } else {
                    $canCover = $availableBefore >= $amount;
                    $shortfall = max(0, $amount - $availableBefore);
                    $coverageRatio = $amount > 0 ? ($availableBefore / $amount) : 1.0;
                    $indicator = $this->resolveMandatoryIndicator($coverageRatio);

                    $cash -= $amount;
                    $mandatorySpentToday += $amount;
                    $mandatoryShortfallTotal += $shortfall;

                    if ($canCover) {
                        $mandatoryCoveredAmount += $amount;
                    }
                }

                $mandatoryExpenseProjection[] = array_merge($event, [
                    'available_before' => (int) round($availableBefore),
                    'projected_balance_after' => (int) round($cash),
                    'can_cover' => $canCover,
                    'coverage_ratio' => round($coverageRatio * 100, 2),
                    'shortfall' => (int) round($shortfall),
                    'indicator' => $indicator,
                    'is_confirmed' => $isConfirmed,
                    'confirmed_transaction_id' => $isConfirmed ? (int) ($confirmation['transaction_id'] ?? 0) : null,
                    'confirmed_transaction_date' => $isConfirmed ? ($confirmation['transaction_date'] ?? null) : null,
                    'confirmed_at' => $isConfirmed ? ($confirmation['confirmed_at'] ?? null) : null,
                ]);
            }

            $dailyProjection[] = [
                'date' => $dateKey,
                'predicted_income' => (int) round($incomeForSummary),
                'income_source' => $incomeSource,
                'cashflow_before_mandatory' => (int) round($cashflowBeforeMandatory),
                'mandatory_expense' => (int) round($mandatorySpentToday),
                'projected_balance' => (int) round($cash),
                '__projected_balance_raw' => $cash,
                '__mandatory_expense_raw' => $mandatorySpentToday,
            ];
        }

        $remainingMandatoryReserve = 0.0;
        for ($index = count($dailyProjection) - 1; $index >= 0; $index--) {
            $projectedBalanceRaw = (float) ($dailyProjection[$index]['__projected_balance_raw'] ?? 0);
            $mandatoryExpenseRaw = (float) ($dailyProjection[$index]['__mandatory_expense_raw'] ?? 0);

            $dailyProjection[$index]['remaining_mandatory_reserve'] = (int) round($remainingMandatoryReserve);
            $dailyProjection[$index]['discretionary_balance'] = (int) round($projectedBalanceRaw - $remainingMandatoryReserve);

            $remainingMandatoryReserve += $mandatoryExpenseRaw;

            unset($dailyProjection[$index]['__projected_balance_raw'], $dailyProjection[$index]['__mandatory_expense_raw']);
        }

        $discretionaryBalanceByDate = [];
        foreach ($dailyProjection as $row) {
            $dateKey = (string) ($row['date'] ?? '');
            if ($dateKey === '') {
                continue;
            }

            $discretionaryBalanceByDate[$dateKey] = (float) ($row['discretionary_balance'] ?? 0);
        }

        $coveredMandatory = collect($mandatoryExpenseProjection)->where('can_cover', true)->count();
        $confirmedMandatory = collect($mandatoryExpenseProjection)->where('is_confirmed', true)->count();
        $mandatoryTotalEvents = count($mandatoryExpenseProjection);
        $mandatoryFullyCovered = $mandatoryTotalEvents === 0 || $coveredMandatory === $mandatoryTotalEvents;

        $budgetStartDate = $rangeStart->copy();
        if ($today->gt($budgetStartDate)) {
            $budgetStartDate = $today->copy();
        }
        if ($budgetStartDate->gt($rangeEnd->copy()->startOfDay())) {
            $budgetStartDate = $rangeEnd->copy()->startOfDay();
        }

        $budgetReferenceDate = $budgetStartDate->toDateString();
        $budgetRows = collect($dailyProjection)->filter(function (array $row) use ($budgetReferenceDate) {
            return isset($row['date']) && (string) $row['date'] >= $budgetReferenceDate;
        })->values();

        $minimumDiscretionaryFromAsOf = $budgetRows->count() > 0
            ? (float) $budgetRows->min('discretionary_balance')
            : (float) ($dailyProjection[count($dailyProjection) - 1]['discretionary_balance'] ?? 0);

        $operationalSpendingBudget = (int) round(max(0, $minimumDiscretionaryFromAsOf));
        $recommendedOperationalBudget = (int) round(max(0, $operationalSpendingBudget * 0.9));
        $currentDiscretionaryBalance = isset($discretionaryBalanceByDate[$budgetReferenceDate])
            ? (float) $discretionaryBalanceByDate[$budgetReferenceDate]
            : ($budgetRows->count() > 0 ? (float) ($budgetRows->first()['discretionary_balance'] ?? 0) : 0.0);

        $purchaseGoals = [];
        foreach ($purchaseTargets as $target) {
            $amount = (float) ($target->amount ?? 0);
            $desiredDate = $target->target_date ? Carbon::parse($target->target_date)->toDateString() : null;

            $predictedBuyDate = null;
            foreach ($budgetRows as $row) {
                if ((float) ($row['discretionary_balance'] ?? 0) >= $amount) {
                    $predictedBuyDate = (string) $row['date'];
                    break;
                }
            }

            $canExecuteAtDesiredDate = null;
            $desiredDateDiscretionaryBalance = null;
            if ($desiredDate !== null && isset($discretionaryBalanceByDate[$desiredDate])) {
                $desiredDateDiscretionaryBalance = (float) $discretionaryBalanceByDate[$desiredDate];
                $canExecuteAtDesiredDate = $desiredDateDiscretionaryBalance >= $amount;
            }

            $canExecuteNowByCash = $currentDiscretionaryBalance >= $amount;
            $canExecuteInRangeByCash = $predictedBuyDate !== null;
            $blockedByMandatory = !$mandatoryFullyCovered && ($canExecuteNowByCash || $canExecuteInRangeByCash);
            $canExecuteNow = $canExecuteNowByCash && !$blockedByMandatory;
            $canExecuteInRange = $canExecuteInRangeByCash && !$blockedByMandatory;

            $indicator = 'belum_terjangkau';
            if ($blockedByMandatory) {
                $indicator = 'tertahan_wajib';
            } elseif ($canExecuteNow) {
                $indicator = 'siap';
            } elseif ($predictedBuyDate !== null) {
                $indicator = 'menunggu';
            }

            $purchaseGoals[] = [
                'id' => $target->id,
                'name' => $target->name,
                'description' => $target->description,
                'amount' => (int) round($amount),
                'desired_date' => $desiredDate,
                'predicted_buy_date' => $predictedBuyDate,
                'can_execute_now' => $canExecuteNow,
                'can_execute_in_range' => $canExecuteInRange,
                'can_execute_at_desired_date' => $canExecuteAtDesiredDate,
                'blocked_by_mandatory' => $blockedByMandatory,
                'desired_date_discretionary_balance' => $desiredDateDiscretionaryBalance !== null
                    ? (int) round($desiredDateDiscretionaryBalance)
                    : null,
                'indicator' => $indicator,
            ];
        }

        $reachablePurchaseTargets = collect($purchaseGoals)->where('can_execute_in_range', true)->count();
        $readyNowPurchaseTargets = collect($purchaseGoals)->where('can_execute_now', true)->count();

        return [
            'range' => [
                'start_date' => $rangeStart->toDateString(),
                'end_date' => $rangeEnd->toDateString(),
                'days' => $rangeStart->copy()->diffInDays($rangeEnd->copy()->startOfDay()) + 1,
            ],
            'summary' => [
                'opening_balance' => (int) round($openingBalance),
                'predicted_income' => (int) round($predictedIncomeTotal),
                'income_actual_to_date' => (int) round($actualIncomeInRange),
                'income_forecast_remaining' => (int) round($forecastIncomeRemaining),
                'mandatory_expense' => (int) round($mandatoryExpenseTotal),
                'mandatory_shortfall_total' => (int) round($mandatoryShortfallTotal),
                'net_after_mandatory' => (int) round($predictedIncomeTotal - $mandatoryExpenseTotal),
                'projected_ending_balance' => (int) round($cash),
                'mandatory_total_events' => $mandatoryTotalEvents,
                'mandatory_covered_events' => $coveredMandatory,
                'mandatory_confirmed_events' => $confirmedMandatory,
                'mandatory_coverage_rate' => $mandatoryTotalEvents > 0
                    ? round(($coveredMandatory / $mandatoryTotalEvents) * 100, 2)
                    : 100.0,
                'mandatory_total_amount' => (int) round($mandatoryExpenseTotal),
                'mandatory_covered_amount' => (int) round($mandatoryCoveredAmount),
                'mandatory_coverage_amount_rate' => $mandatoryExpenseTotal > 0
                    ? round(($mandatoryCoveredAmount / $mandatoryExpenseTotal) * 100, 2)
                    : 100.0,
                'operational_spending_budget' => $operationalSpendingBudget,
                'recommended_operational_spending_budget' => $recommendedOperationalBudget,
                'operational_budget_as_of_date' => $budgetReferenceDate,
                'purchase_targets_total' => count($purchaseGoals),
                'purchase_targets_reachable' => $reachablePurchaseTargets,
                'purchase_targets_ready_now' => $readyNowPurchaseTargets,
                'calculation_mode' => $ledgerReady ? 'hybrid_actual_forecast' : 'forecast_only',
            ],
            'forecast_context' => [
                'average_confidence' => (int) ($forecast['summary']['average_confidence'] ?? 0),
                'trend_percentage_6m' => (float) ($forecast['summary']['trend_percentage_6m'] ?? 0),
                'historical_daily_average' => (int) ($forecast['summary']['historical_daily_average'] ?? 0),
                'volatility_index' => (float) ($forecast['historical_context']['volatility_index'] ?? 0),
            ],
            'daily_projection' => $dailyProjection,
            'mandatory_expense_projection' => $mandatoryExpenseProjection,
            'purchase_goals' => $purchaseGoals,
        ];
    }

    private function expandMandatoryExpenseEvents($mandatoryTargets, Carbon $startDate, Carbon $endDate): array
    {
        $events = [];

        foreach ($mandatoryTargets as $target) {
            if ($target->is_recurring_monthly && $target->recurrence_forever) {
                $targetMeta = is_array($target->meta) ? $target->meta : [];
                $monthlyDay = (int) ($targetMeta['monthly_day'] ?? 0);

                if ($monthlyDay < 1 || $monthlyDay > 31) {
                    if ($target->end_date) {
                        $monthlyDay = (int) Carbon::parse($target->end_date)->day;
                    } else {
                        continue;
                    }
                }

                $startMonth = null;
                if (!empty($targetMeta['start_month'])) {
                    try {
                        $startMonth = Carbon::parse((string) $targetMeta['start_month'])->startOfMonth();
                    } catch (\Throwable $e) {
                        $startMonth = null;
                    }
                }

                if ($startMonth === null && $target->created_at) {
                    $startMonth = Carbon::parse($target->created_at)->startOfMonth();
                }

                if ($startMonth === null) {
                    $startMonth = $startDate->copy()->startOfMonth();
                }

                $monthCursor = $startDate->copy()->startOfMonth();
                if ($monthCursor->lt($startMonth)) {
                    $monthCursor = $startMonth->copy();
                }

                $monthLimit = $endDate->copy()->startOfMonth();

                while ($monthCursor->lte($monthLimit)) {
                    $dueDate = $monthCursor->copy()->day(min($monthlyDay, $monthCursor->daysInMonth));
                    $previousMonth = $dueDate->copy()->subMonthNoOverflow();
                    $previousDueDate = $previousMonth->copy()->day(min($monthlyDay, $previousMonth->daysInMonth));
                    $periodStart = $previousDueDate->copy()->addDay();

                    if ($dueDate->between($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                        $events[] = [
                            'event_id' => $target->id . '-' . $monthCursor->format('Ym'),
                            'target_id' => $target->id,
                            'name' => $target->name,
                            'description' => $target->description,
                            'amount' => (float) $target->amount,
                            'period_start' => $periodStart->toDateString(),
                            'period_end' => $dueDate->toDateString(),
                            'due_date' => $dueDate->toDateString(),
                            'is_recurring_monthly' => true,
                            'priority' => (int) ($target->priority ?? 100),
                        ];
                    }

                    $monthCursor->addMonthNoOverflow();
                }

                continue;
            }

            if (!$target->start_date || !$target->end_date) {
                continue;
            }

            $baseStart = Carbon::parse($target->start_date)->startOfDay();
            $baseEnd = Carbon::parse($target->end_date)->startOfDay();

            if (!$target->is_recurring_monthly) {
                if ($baseEnd->between($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                    $events[] = [
                        'event_id' => $target->id . '-0',
                        'target_id' => $target->id,
                        'name' => $target->name,
                        'description' => $target->description,
                        'amount' => (float) $target->amount,
                        'period_start' => $baseStart->toDateString(),
                        'period_end' => $baseEnd->toDateString(),
                        'due_date' => $baseEnd->toDateString(),
                        'is_recurring_monthly' => false,
                        'priority' => (int) ($target->priority ?? 100),
                    ];
                }

                continue;
            }

            $recurrenceLimit = null;
            if (!$target->recurrence_forever) {
                if ($target->recurrence_until) {
                    $recurrenceLimit = Carbon::parse($target->recurrence_until)->endOfMonth();
                } else {
                    $recurrenceLimit = $baseEnd->copy();
                }
            }

            $index = 0;
            while (true) {
                if ($index > 240) {
                    break;
                }

                $occurrenceStart = $baseStart->copy()->addMonthsNoOverflow($index);
                $occurrenceEnd = $baseEnd->copy()->addMonthsNoOverflow($index);

                if ($recurrenceLimit && $occurrenceStart->startOfMonth()->gt($recurrenceLimit->startOfMonth())) {
                    break;
                }

                if ($occurrenceStart->gt($endDate->copy()->endOfDay())) {
                    break;
                }

                if ($occurrenceEnd->between($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                    $events[] = [
                        'event_id' => $target->id . '-' . $index,
                        'target_id' => $target->id,
                        'name' => $target->name,
                        'description' => $target->description,
                        'amount' => (float) $target->amount,
                        'period_start' => $occurrenceStart->toDateString(),
                        'period_end' => $occurrenceEnd->toDateString(),
                        'due_date' => $occurrenceEnd->toDateString(),
                        'is_recurring_monthly' => true,
                        'priority' => (int) ($target->priority ?? 100),
                    ];
                }

                $index++;
            }
        }

        usort($events, function (array $a, array $b) {
            $dateComparison = strcmp((string) $a['due_date'], (string) $b['due_date']);
            if ($dateComparison !== 0) {
                return $dateComparison;
            }

            $priorityComparison = ((int) $a['priority']) <=> ((int) $b['priority']);
            if ($priorityComparison !== 0) {
                return $priorityComparison;
            }

            return ((int) $a['target_id']) <=> ((int) $b['target_id']);
        });

        return $events;
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

        $customerHealthMetrics = $this->buildCustomerHealthScoreMetrics($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay(), $isolatedUsernameMap);
        $healthSummary = is_array($customerHealthMetrics['summary'] ?? null) ? $customerHealthMetrics['summary'] : [];

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
                'invoice_revenue' => (int) round((float) $arpuCurrent['invoice_revenue']),
                'installation_income' => (int) round((float) $arpuCurrent['installation_income']),
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
                'customer_health_average_score' => round((float) ($healthSummary['average_health_score'] ?? 0), 2),
                'customer_health_high_risk_count' => (int) ($healthSummary['high_risk_customers'] ?? 0),
                'customer_health_critical_count' => (int) ($healthSummary['critical_customers'] ?? 0),
                'customer_health_total_customers' => (int) ($healthSummary['total_customers'] ?? 0),
                'customer_health_dominant_factor' => (string) ($healthSummary['dominant_risk_factor_label'] ?? '-'),
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
            'customer_health' => $customerHealthMetrics,
        ];
    }

    private function buildCustomerHealthScoreMetrics(Carbon $startDate, Carbon $endDate, array $isolatedUsernameMap): array
    {
        $windowStart = $startDate->copy()->startOfDay();
        $windowEnd = $endDate->copy()->endOfDay();
        $asOfDate = $endDate->copy()->startOfDay();

        $factorConfig = [
            'overdue' => ['label' => 'Telat Bayar', 'max_points' => 35.0],
            'complaints' => ['label' => 'Keluhan', 'max_points' => 20.0],
            'isolation' => ['label' => 'Status Isolir', 'max_points' => 20.0],
            'connection_quality' => ['label' => 'Kualitas Koneksi', 'max_points' => 15.0],
            'odp_disturbance' => ['label' => 'Gangguan Area ODP', 'max_points' => 10.0],
        ];

        $customers = Customer::query()
            ->orderBy('id')
            ->get(['id', 'name', 'due_date', 'pppoe_username', 'odp', 'is_active']);

        if ($customers->count() === 0) {
            return [
                'as_of_date' => $asOfDate->toDateString(),
                'window' => [
                    'start_date' => $windowStart->toDateString(),
                    'end_date' => $windowEnd->toDateString(),
                    'days' => $windowStart->diffInDays($windowEnd->copy()->startOfDay()) + 1,
                ],
                'summary' => [
                    'total_customers' => 0,
                    'average_health_score' => 0,
                    'healthy_customers' => 0,
                    'watch_customers' => 0,
                    'high_risk_customers' => 0,
                    'critical_customers' => 0,
                    'connection_data_available' => false,
                    'dominant_risk_factor_key' => null,
                    'dominant_risk_factor_label' => '-',
                ],
                'distribution' => [],
                'factor_averages' => [],
                'top_risk_customers' => [],
                'high_risk_customer_rows' => [],
                'recommendations' => ['Data pelanggan belum tersedia untuk menghitung health score.'],
            ];
        }

        $customerIds = $customers->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->values()
            ->all();

        $overdueInvoiceMap = [];
        if (count($customerIds) > 0) {
            $overdueRows = Invoice::query()
                ->selectRaw('customer_id, COUNT(*) as overdue_invoice_count, SUM(amount) as overdue_amount')
                ->whereIn('customer_id', $customerIds)
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->whereNotNull('due_date')
                ->whereDate('due_date', '<', $asOfDate->toDateString())
                ->groupBy('customer_id')
                ->get();

            foreach ($overdueRows as $row) {
                $customerId = (int) ($row->customer_id ?? 0);
                if ($customerId < 1) {
                    continue;
                }

                $overdueInvoiceMap[$customerId] = [
                    'overdue_invoice_count' => (int) ($row->overdue_invoice_count ?? 0),
                    'overdue_amount' => (float) ($row->overdue_amount ?? 0),
                ];
            }
        }

        $complaintMap = [];
        if ($this->isComplaintsReady() && count($customerIds) > 0) {
            $complaintRows = Complaint::query()
                ->selectRaw("customer_id,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN status IN ('pending', 'in_progress') THEN 1 ELSE 0 END) as open_count,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                    SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_count,
                    SUM(CASE WHEN category = 'gangguan' THEN 1 ELSE 0 END) as gangguan_count")
                ->whereIn('customer_id', $customerIds)
                ->whereBetween('created_at', [$windowStart->copy()->startOfDay(), $windowEnd->copy()->endOfDay()])
                ->groupBy('customer_id')
                ->get();

            foreach ($complaintRows as $row) {
                $customerId = (int) ($row->customer_id ?? 0);
                if ($customerId < 1) {
                    continue;
                }

                $complaintMap[$customerId] = [
                    'total_count' => (int) ($row->total_count ?? 0),
                    'open_count' => (int) ($row->open_count ?? 0),
                    'pending_count' => (int) ($row->pending_count ?? 0),
                    'high_count' => (int) ($row->high_count ?? 0),
                    'gangguan_count' => (int) ($row->gangguan_count ?? 0),
                ];
            }
        }

        $connectionDataAvailable = false;
        $onlineConnectionMap = [];
        try {
            $mikrotik = new \App\Services\MikroTikService();
            $activeConnections = $mikrotik->getActivePPPoEConnections();
            $connectionDataAvailable = true;

            foreach ($activeConnections as $connection) {
                $username = strtolower(trim((string) ($connection['name'] ?? '')));
                if ($username === '') {
                    continue;
                }

                $uptimeSeconds = $this->parseRouterUptimeToSeconds((string) ($connection['uptime'] ?? ''));

                if (!isset($onlineConnectionMap[$username])) {
                    $onlineConnectionMap[$username] = [
                        'uptime_seconds' => $uptimeSeconds,
                        'uptime_raw' => (string) ($connection['uptime'] ?? ''),
                    ];
                    continue;
                }

                if ($uptimeSeconds > (int) ($onlineConnectionMap[$username]['uptime_seconds'] ?? 0)) {
                    $onlineConnectionMap[$username] = [
                        'uptime_seconds' => $uptimeSeconds,
                        'uptime_raw' => (string) ($connection['uptime'] ?? ''),
                    ];
                }
            }
        } catch (\Throwable $e) {
            \Log::warning('Failed to fetch active PPPoE connections for customer health score', [
                'error' => $e->getMessage(),
            ]);
        }

        $odpDisturbanceMap = $this->buildOdpDisturbanceFrequencyMap($windowStart, $windowEnd);
        $massOdpDisturbance = (float) ($odpDisturbanceMap['mass_weighted_count'] ?? 0);
        $perOdpDisturbance = is_array($odpDisturbanceMap['per_odp_weighted_count'] ?? null)
            ? $odpDisturbanceMap['per_odp_weighted_count']
            : [];

        $scoreTotal = 0.0;
        $riskLevelCounters = [
            'sehat' => 0,
            'waspada' => 0,
            'tinggi' => 0,
            'kritis' => 0,
        ];
        $factorTotals = [];
        foreach ($factorConfig as $factorKey => $config) {
            $factorTotals[$factorKey] = 0.0;
        }

        $rows = [];

        foreach ($customers as $customer) {
            $customerId = (int) ($customer->id ?? 0);
            if ($customerId < 1) {
                continue;
            }

            $customerName = trim((string) ($customer->name ?? ''));
            if ($customerName === '') {
                $customerName = 'Pelanggan #' . $customerId;
            }

            $pppoeUsername = strtolower(trim((string) ($customer->pppoe_username ?? '')));
            $isIsolated = $pppoeUsername !== '' && isset($isolatedUsernameMap[$pppoeUsername]);

            $daysOverdue = 0;
            if (!empty($customer->due_date)) {
                try {
                    $dueDate = $customer->due_date instanceof Carbon
                        ? $customer->due_date->copy()->startOfDay()
                        : Carbon::parse($customer->due_date)->startOfDay();

                    if ($dueDate->lt($asOfDate)) {
                        $daysOverdue = $dueDate->diffInDays($asOfDate);
                    }
                } catch (\Throwable $e) {
                    $daysOverdue = 0;
                }
            }

            $overdueInvoiceCount = (int) ($overdueInvoiceMap[$customerId]['overdue_invoice_count'] ?? 0);
            $overdueAmount = (float) ($overdueInvoiceMap[$customerId]['overdue_amount'] ?? 0);

            $overdueRisk = 0.0;
            if ($daysOverdue > 0) {
                if ($daysOverdue <= 7) {
                    $overdueRisk += 8;
                } elseif ($daysOverdue <= 30) {
                    $overdueRisk += 16;
                } elseif ($daysOverdue <= 60) {
                    $overdueRisk += 24;
                } else {
                    $overdueRisk += 28;
                }
            }

            if ($overdueInvoiceCount > 0) {
                $overdueRisk += min(7, $overdueInvoiceCount * 2);
            }

            if ($overdueAmount >= 1500000) {
                $overdueRisk += 3;
            } elseif ($overdueAmount >= 750000) {
                $overdueRisk += 2;
            } elseif ($overdueAmount >= 300000) {
                $overdueRisk += 1;
            }

            $overdueRisk = $this->clamp($overdueRisk, 0, (float) $factorConfig['overdue']['max_points']);

            $complaintStats = $complaintMap[$customerId] ?? [
                'total_count' => 0,
                'open_count' => 0,
                'pending_count' => 0,
                'high_count' => 0,
                'gangguan_count' => 0,
            ];

            $totalComplaints = (int) ($complaintStats['total_count'] ?? 0);
            $openComplaints = (int) ($complaintStats['open_count'] ?? 0);
            $pendingComplaints = (int) ($complaintStats['pending_count'] ?? 0);
            $highPriorityComplaints = (int) ($complaintStats['high_count'] ?? 0);
            $gangguanComplaints = (int) ($complaintStats['gangguan_count'] ?? 0);

            $complaintRisk = ($openComplaints * 4.5)
                + ($pendingComplaints * 1.5)
                + ($highPriorityComplaints * 2.2)
                + ($gangguanComplaints * 1.2)
                + (max(0, $totalComplaints - $openComplaints) * 0.6);
            $complaintRisk = $this->clamp($complaintRisk, 0, (float) $factorConfig['complaints']['max_points']);

            $isolationRisk = $isIsolated ? (float) $factorConfig['isolation']['max_points'] : 0.0;

            $isOnline = $pppoeUsername !== '' && isset($onlineConnectionMap[$pppoeUsername]);
            $uptimeSeconds = $isOnline
                ? (int) ($onlineConnectionMap[$pppoeUsername]['uptime_seconds'] ?? 0)
                : 0;

            $connectionRisk = 0.0;
            if ($connectionDataAvailable) {
                if ($pppoeUsername === '') {
                    $connectionRisk = 3.0;
                } elseif ($isOnline) {
                    if ($uptimeSeconds >= 86400) {
                        $connectionRisk = 0.0;
                    } elseif ($uptimeSeconds >= 21600) {
                        $connectionRisk = 2.5;
                    } elseif ($uptimeSeconds >= 3600) {
                        $connectionRisk = 5.5;
                    } else {
                        $connectionRisk = 8.5;
                    }
                } else {
                    $connectionRisk = $isIsolated ? 5.0 : 15.0;
                }
            }
            $connectionRisk = $this->clamp($connectionRisk, 0, (float) $factorConfig['connection_quality']['max_points']);

            $odpName = trim((string) ($customer->odp ?? ''));
            $normalizedOdpName = $this->normalizeOdpName($odpName);
            $odpDisturbanceFrequency = $massOdpDisturbance;
            if ($normalizedOdpName !== '' && isset($perOdpDisturbance[$normalizedOdpName])) {
                $odpDisturbanceFrequency += (float) $perOdpDisturbance[$normalizedOdpName];
            }

            $odpRisk = 0.0;
            if ($normalizedOdpName === '') {
                $odpRisk = 1.5;
            } elseif ($odpDisturbanceFrequency <= 0.5) {
                $odpRisk = 0;
            } elseif ($odpDisturbanceFrequency <= 2.0) {
                $odpRisk = 2.5;
            } elseif ($odpDisturbanceFrequency <= 4.0) {
                $odpRisk = 5.0;
            } elseif ($odpDisturbanceFrequency <= 7.0) {
                $odpRisk = 7.5;
            } else {
                $odpRisk = 10.0;
            }
            $odpRisk = $this->clamp($odpRisk, 0, (float) $factorConfig['odp_disturbance']['max_points']);

            $factorPoints = [
                'overdue' => $overdueRisk,
                'complaints' => $complaintRisk,
                'isolation' => $isolationRisk,
                'connection_quality' => $connectionRisk,
                'odp_disturbance' => $odpRisk,
            ];

            $riskPoints = 0.0;
            foreach ($factorPoints as $factorPointValue) {
                $riskPoints += (float) $factorPointValue;
            }

            $healthScore = (int) round($this->clamp(100 - $riskPoints, 0, 100));
            $riskLevel = $this->resolveCustomerHealthRiskLevel($healthScore);

            $scoreTotal += $healthScore;
            $riskLevelCounters[$riskLevel] = ($riskLevelCounters[$riskLevel] ?? 0) + 1;

            $factors = [];
            foreach ($factorConfig as $factorKey => $config) {
                $points = (float) ($factorPoints[$factorKey] ?? 0);
                $maxPoints = (float) ($config['max_points'] ?? 0);

                $factorTotals[$factorKey] = ($factorTotals[$factorKey] ?? 0) + $points;

                $factors[] = [
                    'key' => $factorKey,
                    'label' => (string) ($config['label'] ?? $factorKey),
                    'points' => round($points, 2),
                    'max_points' => $maxPoints,
                    'pressure' => $maxPoints > 0
                        ? round(($points / $maxPoints) * 100, 2)
                        : 0.0,
                ];
            }

            usort($factors, function (array $a, array $b) {
                return (float) ($b['points'] ?? 0) <=> (float) ($a['points'] ?? 0);
            });

            $dominantFactor = $factors[0] ?? [
                'key' => 'overdue',
                'label' => 'Telat Bayar',
                'points' => 0,
                'max_points' => 0,
                'pressure' => 0,
            ];

            $priorityReasons = [];
            if ($daysOverdue > 0 || $overdueInvoiceCount > 0) {
                $priorityReasons[] = $daysOverdue > 0
                    ? 'Telat bayar ' . $daysOverdue . ' hari dengan ' . $overdueInvoiceCount . ' invoice overdue.'
                    : $overdueInvoiceCount . ' invoice overdue perlu ditangani.';
            }

            if ($openComplaints > 0 || $totalComplaints > 0) {
                $priorityReasons[] = 'Keluhan periode ini ' . $totalComplaints . ' tiket (' . $openComplaints . ' masih aktif).';
            }

            if ($isIsolated) {
                $priorityReasons[] = 'Pelanggan dalam status isolir (indikasi risiko churn tinggi).';
            }

            if ($connectionDataAvailable) {
                if ($pppoeUsername === '') {
                    $priorityReasons[] = 'PPPoE username belum tercatat sehingga kualitas koneksi belum termonitor otomatis.';
                } elseif (!$isOnline) {
                    $priorityReasons[] = 'Perangkat PPPoE tidak terdeteksi online pada pembacaan terbaru.';
                } elseif ($uptimeSeconds < 3600) {
                    $priorityReasons[] = 'Uptime koneksi masih rendah, indikasi kestabilan jaringan belum optimal.';
                }
            }

            if ($normalizedOdpName !== '' && $odpDisturbanceFrequency >= 3) {
                $priorityReasons[] = 'Area ODP memiliki frekuensi gangguan relatif tinggi pada periode ini.';
            }

            if (count($priorityReasons) === 0) {
                $priorityReasons[] = 'Belum ada sinyal risiko dominan pada periode ini.';
            }

            $recommendedAction = $this->buildCustomerHealthAction((string) ($dominantFactor['key'] ?? ''), [
                'days_overdue' => $daysOverdue,
                'open_complaints' => $openComplaints,
                'is_isolated' => $isIsolated,
                'is_online' => $isOnline,
                'connection_data_available' => $connectionDataAvailable,
                'odp_disturbance_frequency' => $odpDisturbanceFrequency,
            ]);

            $rows[] = [
                'customer_id' => $customerId,
                'customer_name' => $customerName,
                'is_active' => (bool) ($customer->is_active ?? true),
                'pppoe_username' => $pppoeUsername !== '' ? $pppoeUsername : null,
                'odp' => $odpName !== '' ? $odpName : null,
                'health_score' => $healthScore,
                'risk_points' => round($riskPoints, 2),
                'risk_level' => $riskLevel,
                'dominant_factor' => $dominantFactor,
                'factors' => $factors,
                'signals' => [
                    'days_overdue' => $daysOverdue,
                    'overdue_invoice_count' => $overdueInvoiceCount,
                    'overdue_amount' => (int) round($overdueAmount),
                    'total_complaints' => $totalComplaints,
                    'open_complaints' => $openComplaints,
                    'is_isolated' => $isIsolated,
                    'is_online' => $isOnline,
                    'connection_data_available' => $connectionDataAvailable,
                    'connection_uptime_seconds' => $uptimeSeconds,
                    'odp_disturbance_frequency' => round($odpDisturbanceFrequency, 2),
                ],
                'priority_reasons' => array_slice($priorityReasons, 0, 3),
                'recommended_action' => $recommendedAction,
            ];
        }

        usort($rows, function (array $a, array $b) {
            $scoreComparison = (int) ($a['health_score'] ?? 0) <=> (int) ($b['health_score'] ?? 0);
            if ($scoreComparison !== 0) {
                return $scoreComparison;
            }

            return (float) ($b['risk_points'] ?? 0) <=> (float) ($a['risk_points'] ?? 0);
        });

        $totalCustomers = count($rows);

        $factorAverages = [];
        foreach ($factorConfig as $factorKey => $config) {
            $maxPoints = (float) ($config['max_points'] ?? 0);
            $averagePoints = $totalCustomers > 0
                ? ((float) ($factorTotals[$factorKey] ?? 0) / $totalCustomers)
                : 0.0;

            $factorAverages[] = [
                'key' => $factorKey,
                'label' => (string) ($config['label'] ?? $factorKey),
                'average_points' => round($averagePoints, 2),
                'max_points' => $maxPoints,
                'average_pressure' => $maxPoints > 0
                    ? round(($averagePoints / $maxPoints) * 100, 2)
                    : 0.0,
            ];
        }

        usort($factorAverages, function (array $a, array $b) {
            return (float) ($b['average_points'] ?? 0) <=> (float) ($a['average_points'] ?? 0);
        });

        $dominantRiskFactor = $factorAverages[0] ?? [
            'key' => null,
            'label' => '-',
            'average_points' => 0,
        ];

        $distribution = [
            [
                'key' => 'sehat',
                'label' => 'Sehat (80-100)',
                'count' => (int) ($riskLevelCounters['sehat'] ?? 0),
            ],
            [
                'key' => 'waspada',
                'label' => 'Waspada (60-79)',
                'count' => (int) ($riskLevelCounters['waspada'] ?? 0),
            ],
            [
                'key' => 'tinggi',
                'label' => 'Risiko Tinggi (40-59)',
                'count' => (int) ($riskLevelCounters['tinggi'] ?? 0),
            ],
            [
                'key' => 'kritis',
                'label' => 'Kritis (0-39)',
                'count' => (int) ($riskLevelCounters['kritis'] ?? 0),
            ],
        ];

        $highRiskRows = array_values(array_filter($rows, function (array $row) {
            $riskLevel = (string) ($row['risk_level'] ?? '');
            return in_array($riskLevel, ['tinggi', 'kritis'], true);
        }));

        $recommendations = [];
        if (($riskLevelCounters['kritis'] ?? 0) > 0) {
            $recommendations[] = 'Prioritaskan penyelamatan pelanggan kritis dengan kombinasi penagihan aktif dan intervensi teknis maksimum 24 jam.';
        }

        if (($riskLevelCounters['tinggi'] ?? 0) > 0) {
            $recommendations[] = 'Jadwalkan follow-up pelanggan risiko tinggi per minggu agar tidak turun ke level kritis.';
        }

        if ((string) ($dominantRiskFactor['key'] ?? '') === 'complaints') {
            $recommendations[] = 'Faktor dominan berasal dari keluhan, tingkatkan SLA penyelesaian aduan dan update progres ke pelanggan.';
        }

        if ((string) ($dominantRiskFactor['key'] ?? '') === 'overdue') {
            $recommendations[] = 'Faktor dominan berasal dari keterlambatan bayar, prioritaskan reminder berjenjang sebelum status isolir.';
        }

        if ((string) ($dominantRiskFactor['key'] ?? '') === 'odp_disturbance') {
            $recommendations[] = 'Faktor dominan berasal dari gangguan area ODP, lakukan notifikasi proaktif dan mitigasi jaringan per area.';
        }

        if (!$connectionDataAvailable) {
            $recommendations[] = 'Data koneksi realtime MikroTik tidak tersedia, validasi layer monitoring agar health score koneksi lebih presisi.';
        }

        if (count($recommendations) === 0) {
            $recommendations[] = 'Mayoritas pelanggan berada di zona sehat, pertahankan ritme monitoring dan komunikasi preventif.';
        }

        return [
            'as_of_date' => $asOfDate->toDateString(),
            'window' => [
                'start_date' => $windowStart->toDateString(),
                'end_date' => $windowEnd->toDateString(),
                'days' => $windowStart->diffInDays($windowEnd->copy()->startOfDay()) + 1,
            ],
            'summary' => [
                'total_customers' => $totalCustomers,
                'average_health_score' => round($this->safeAverage($scoreTotal, $totalCustomers), 2),
                'healthy_customers' => (int) ($riskLevelCounters['sehat'] ?? 0),
                'watch_customers' => (int) ($riskLevelCounters['waspada'] ?? 0),
                'high_risk_customers' => (int) (($riskLevelCounters['tinggi'] ?? 0) + ($riskLevelCounters['kritis'] ?? 0)),
                'critical_customers' => (int) ($riskLevelCounters['kritis'] ?? 0),
                'connection_data_available' => $connectionDataAvailable,
                'dominant_risk_factor_key' => $dominantRiskFactor['key'] ?? null,
                'dominant_risk_factor_label' => (string) ($dominantRiskFactor['label'] ?? '-'),
            ],
            'distribution' => $distribution,
            'factor_averages' => $factorAverages,
            'top_risk_customers' => array_slice($rows, 0, 10),
            'high_risk_customer_rows' => array_slice($highRiskRows, 0, 20),
            'recommendations' => $recommendations,
        ];
    }

    private function buildOdpDisturbanceFrequencyMap(Carbon $startDate, Carbon $endDate): array
    {
        $result = [
            'mass_weighted_count' => 0.0,
            'per_odp_weighted_count' => [],
            'notice_count' => 0,
        ];

        if (!$this->isNetworkNoticesReady()) {
            return $result;
        }

        $windowStart = $startDate->copy()->startOfDay();
        $windowEnd = $endDate->copy()->endOfDay();

        $rows = NetworkNotice::query()
            ->where('type', 'gangguan')
            ->where(function ($query) use ($windowStart, $windowEnd) {
                $query->whereBetween('created_at', [$windowStart->copy(), $windowEnd->copy()])
                    ->orWhereBetween('start_time', [$windowStart->copy(), $windowEnd->copy()])
                    ->orWhere(function ($overlapQuery) use ($windowStart, $windowEnd) {
                        $overlapQuery->whereNotNull('start_time')
                            ->where('start_time', '<=', $windowEnd->copy())
                            ->where(function ($endTimeQuery) use ($windowStart) {
                                $endTimeQuery->whereNull('end_time')
                                    ->orWhere('end_time', '>=', $windowStart->copy());
                            });
                    });
            })
            ->get(['id', 'is_mass', 'severity', 'affected_odp']);

        $severityWeights = [
            'low' => 0.8,
            'medium' => 1.0,
            'high' => 1.3,
            'critical' => 1.6,
        ];

        foreach ($rows as $row) {
            $result['notice_count']++;

            $severityKey = strtolower(trim((string) ($row->severity ?? 'medium')));
            $weight = (float) ($severityWeights[$severityKey] ?? 1.0);

            if ((bool) ($row->is_mass ?? false)) {
                $result['mass_weighted_count'] += $weight;
                continue;
            }

            $odpNames = $this->parseAffectedOdpList((string) ($row->affected_odp ?? ''));
            if (count($odpNames) === 0) {
                continue;
            }

            foreach ($odpNames as $odpName) {
                if (!isset($result['per_odp_weighted_count'][$odpName])) {
                    $result['per_odp_weighted_count'][$odpName] = 0.0;
                }

                $result['per_odp_weighted_count'][$odpName] += $weight;
            }
        }

        return $result;
    }

    private function normalizeOdpName(?string $odpName): string
    {
        $value = strtoupper(trim((string) $odpName));
        $value = preg_replace('/\s+/', ' ', $value) ?? '';

        return trim($value);
    }

    private function parseAffectedOdpList(?string $affectedOdp): array
    {
        $rawValue = trim((string) $affectedOdp);
        if ($rawValue === '') {
            return [];
        }

        $parts = preg_split('/[,;|\n]+/', $rawValue);
        if (!is_array($parts)) {
            return [];
        }

        $normalized = [];
        foreach ($parts as $part) {
            $odpName = $this->normalizeOdpName((string) $part);
            if ($odpName === '') {
                continue;
            }
            $normalized[] = $odpName;
        }

        return array_values(array_unique($normalized));
    }

    private function parseRouterUptimeToSeconds(?string $uptime): int
    {
        $value = strtolower(trim((string) $uptime));
        if ($value === '') {
            return 0;
        }

        $totalSeconds = 0;
        $matchedToken = false;

        if (preg_match_all('/(\d+)\s*([wdhms])/', $value, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $matchedToken = true;
                $amount = (int) ($match[1] ?? 0);
                $unit = (string) ($match[2] ?? 's');

                if ($unit === 'w') {
                    $totalSeconds += $amount * 604800;
                } elseif ($unit === 'd') {
                    $totalSeconds += $amount * 86400;
                } elseif ($unit === 'h') {
                    $totalSeconds += $amount * 3600;
                } elseif ($unit === 'm') {
                    $totalSeconds += $amount * 60;
                } else {
                    $totalSeconds += $amount;
                }
            }
        }

        $remaining = preg_replace('/\d+\s*[wdhms]/', '', $value) ?? '';
        $remaining = trim($remaining);

        if (strpos($remaining, ':') !== false) {
            $parts = array_values(array_filter(explode(':', $remaining), function ($item) {
                return trim($item) !== '';
            }));

            if (count($parts) === 3) {
                $totalSeconds += ((int) $parts[0] * 3600) + ((int) $parts[1] * 60) + (int) $parts[2];
                $matchedToken = true;
            } elseif (count($parts) === 2) {
                $totalSeconds += ((int) $parts[0] * 60) + (int) $parts[1];
                $matchedToken = true;
            }
        }

        if (!$matchedToken && preg_match('/^\d+$/', $value)) {
            return (int) $value;
        }

        return $totalSeconds;
    }

    private function resolveCustomerHealthRiskLevel(int $healthScore): string
    {
        if ($healthScore >= 80) {
            return 'sehat';
        }

        if ($healthScore >= 60) {
            return 'waspada';
        }

        if ($healthScore >= 40) {
            return 'tinggi';
        }

        return 'kritis';
    }

    private function buildCustomerHealthAction(string $dominantFactorKey, array $context): string
    {
        $daysOverdue = (int) ($context['days_overdue'] ?? 0);
        $openComplaints = (int) ($context['open_complaints'] ?? 0);
        $isIsolated = (bool) ($context['is_isolated'] ?? false);
        $isOnline = (bool) ($context['is_online'] ?? true);
        $connectionDataAvailable = (bool) ($context['connection_data_available'] ?? false);
        $odpDisturbanceFrequency = (float) ($context['odp_disturbance_frequency'] ?? 0);

        if ($isIsolated || $daysOverdue > 7) {
            return 'Prioritaskan recovery pembayaran dan validasi status isolir melalui follow-up langsung ke pelanggan.';
        }

        if ($openComplaints > 0 || $dominantFactorKey === 'complaints') {
            return 'Percepat penyelesaian keluhan aktif dan kirim update progres berkala untuk menekan risiko churn.';
        }

        if ($dominantFactorKey === 'connection_quality') {
            if ($connectionDataAvailable && !$isOnline) {
                return 'Jadwalkan pengecekan perangkat akses terakhir dan jalur distribusi karena koneksi belum terdeteksi online.';
            }

            return 'Pantau kestabilan koneksi pelanggan dan lakukan inspeksi teknis preventif bila uptime belum stabil.';
        }

        if ($dominantFactorKey === 'odp_disturbance' || $odpDisturbanceFrequency >= 3) {
            return 'Lakukan komunikasi proaktif pada pelanggan area ODP terdampak dan siapkan rencana mitigasi gangguan berulang.';
        }

        return 'Pertahankan komunikasi rutin dan monitoring preventif agar skor kesehatan tetap stabil.';
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
        $invoiceRevenue = (float) Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->sum('amount');

        $installationIncome = 0.0;
        if ($this->isLedgerReady()) {
            $installationIncome = (float) FinancialTransaction::query()
                ->where('type', 'income')
                ->where('source', 'installation_income')
                ->whereBetween('transaction_date', [$startDate->toDateString(), $endDate->toDateString()])
                ->sum('amount');
        }

        $realizedRevenue = $invoiceRevenue + $installationIncome;

        $paidCustomers = (int) Invoice::where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->distinct()
            ->count('customer_id');

        $activitySummary = $this->buildCustomerActivitySummary($endDate->copy()->startOfDay(), $isolatedUsernameMap);
        $operationalActiveCustomers = (int) $activitySummary['active_customers'];
        $operationalInactiveCustomers = (int) $activitySummary['inactive_customers'];

        return [
            'invoice_revenue' => (int) round($invoiceRevenue),
            'installation_income' => (int) round($installationIncome),
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

        $historyAmountMap = [];
        foreach ($dailyHistory as $entry) {
            $historyAmountMap[(string) $entry['date']] = (float) ($entry['amount'] ?? 0);
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

        $rollingAverage = function (Carbon $endDate, int $days, array $amountMap): float {
            if ($days < 1) {
                return 0.0;
            }

            $sum = 0.0;
            $count = 0;
            for ($i = 0; $i < $days; $i++) {
                $dateKey = $endDate->copy()->subDays($i)->toDateString();
                if (!array_key_exists($dateKey, $amountMap)) {
                    continue;
                }

                $sum += (float) $amountMap[$dateKey];
                $count++;
            }

            return $this->safeAverage($sum, $count);
        };

        $ensembleWeights = [
            'seasonal' => 0.5,
            'momentum' => 0.3,
            'smoothing' => 0.2,
        ];
        $ensembleValidation = [
            'window_days' => 0,
            'wmape' => [
                'seasonal' => null,
                'momentum' => null,
                'smoothing' => null,
                'ensemble_equal' => null,
            ],
            'accuracy' => [
                'seasonal' => null,
                'momentum' => null,
                'smoothing' => null,
                'ensemble_equal' => null,
            ],
        ];

        $validationDays = min(45, max(0, $historyDayCount - 14));
        if ($validationDays >= 14 && $overallDailyAverage > 0) {
            $validationStart = $historyEnd->copy()->subDays($validationDays - 1)->startOfDay();

            $validationAbsError = [
                'seasonal' => 0.0,
                'momentum' => 0.0,
                'smoothing' => 0.0,
                'ensemble_equal' => 0.0,
            ];
            $validationActualTotal = 0.0;
            $validationCount = 0;

            for ($vDate = $validationStart->copy(); $vDate->lte($historyEnd); $vDate->addDay()) {
                $dateKey = $vDate->toDateString();
                $actual = (float) ($historyAmountMap[$dateKey] ?? 0);
                $previousDate = $vDate->copy()->subDay();

                $weekday = $vDate->dayOfWeek;
                $dayOfMonth = $vDate->day;
                $monthNumber = $vDate->month;

                $weekdayAverage = $this->safeAverage((float) ($weekdayStats[$weekday]['sum'] ?? 0), (int) ($weekdayStats[$weekday]['count'] ?? 0));
                $domAverage = $this->safeAverage((float) ($domStats[$dayOfMonth]['sum'] ?? 0), (int) ($domStats[$dayOfMonth]['count'] ?? 0));
                $monthAverage = $this->safeAverage((float) ($monthStats[$monthNumber]['sum'] ?? 0), (int) ($monthStats[$monthNumber]['count'] ?? 0));

                if ($weekdayAverage <= 0) $weekdayAverage = $overallDailyAverage;
                if ($domAverage <= 0) $domAverage = $overallDailyAverage;
                if ($monthAverage <= 0) $monthAverage = $overallDailyAverage;

                $seasonalityFactor = $overallDailyAverage > 0
                    ? $this->clamp($monthAverage / $overallDailyAverage, 0.75, 1.25)
                    : 1.0;

                $baseline = ($weekdayAverage * 0.50) + ($domAverage * 0.30) + ($recentDailyAverage * 0.20);
                $seasonalPrediction = max(0, $baseline * $trendFactor * $seasonalityFactor * $recencyFactor);

                $rolling7 = $rollingAverage($previousDate, 7, $historyAmountMap);
                $rolling30 = $rollingAverage($previousDate, 30, $historyAmountMap);
                if ($rolling7 <= 0) $rolling7 = $recentDailyAverage > 0 ? $recentDailyAverage : $overallDailyAverage;
                if ($rolling30 <= 0) $rolling30 = $overallDailyAverage;

                $momentumPrediction = max(0, (($rolling7 * 0.65) + ($rolling30 * 0.35)) * $seasonalityFactor * $trendFactor);
                $smoothingPrediction = max(0, (($rolling7 * 0.45) + ($overallDailyAverage * 0.30) + ($recentDailyAverage * 0.25)) * $recencyFactor);
                $ensembleEqualPrediction = ($seasonalPrediction + $momentumPrediction + $smoothingPrediction) / 3;

                $validationAbsError['seasonal'] += abs($actual - $seasonalPrediction);
                $validationAbsError['momentum'] += abs($actual - $momentumPrediction);
                $validationAbsError['smoothing'] += abs($actual - $smoothingPrediction);
                $validationAbsError['ensemble_equal'] += abs($actual - $ensembleEqualPrediction);
                $validationActualTotal += max($actual, 0);
                $validationCount++;
            }

            if ($validationCount > 0 && $validationActualTotal > 0) {
                $seasonalWmape = ($validationAbsError['seasonal'] / $validationActualTotal) * 100;
                $momentumWmape = ($validationAbsError['momentum'] / $validationActualTotal) * 100;
                $smoothingWmape = ($validationAbsError['smoothing'] / $validationActualTotal) * 100;
                $ensembleEqualWmape = ($validationAbsError['ensemble_equal'] / $validationActualTotal) * 100;

                $seasonalScore = 1 / max($seasonalWmape, 1.0);
                $momentumScore = 1 / max($momentumWmape, 1.0);
                $smoothingScore = 1 / max($smoothingWmape, 1.0);
                $scoreTotal = $seasonalScore + $momentumScore + $smoothingScore;

                if ($scoreTotal > 0) {
                    $ensembleWeights = [
                        'seasonal' => $seasonalScore / $scoreTotal,
                        'momentum' => $momentumScore / $scoreTotal,
                        'smoothing' => $smoothingScore / $scoreTotal,
                    ];
                }

                $ensembleValidation = [
                    'window_days' => $validationCount,
                    'wmape' => [
                        'seasonal' => round($seasonalWmape, 2),
                        'momentum' => round($momentumWmape, 2),
                        'smoothing' => round($smoothingWmape, 2),
                        'ensemble_equal' => round($ensembleEqualWmape, 2),
                    ],
                    'accuracy' => [
                        'seasonal' => round($this->clamp(100 - $seasonalWmape, 0, 100), 2),
                        'momentum' => round($this->clamp(100 - $momentumWmape, 0, 100), 2),
                        'smoothing' => round($this->clamp(100 - $smoothingWmape, 0, 100), 2),
                        'ensemble_equal' => round($this->clamp(100 - $ensembleEqualWmape, 0, 100), 2),
                    ],
                ];
            }
        }

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
        $forecastSeriesMap = $historyAmountMap;

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
            $seasonalPrediction = max(0, $baseline * $trendFactor * $seasonalityFactor * $recencyFactor);

            $previousDate = $cursor->copy()->subDay();
            $rolling7 = $rollingAverage($previousDate, 7, $forecastSeriesMap);
            $rolling30 = $rollingAverage($previousDate, 30, $forecastSeriesMap);
            if ($rolling7 <= 0) $rolling7 = $recentDailyAverage > 0 ? $recentDailyAverage : $overallDailyAverage;
            if ($rolling30 <= 0) $rolling30 = $overallDailyAverage;

            $momentumPrediction = max(0, (($rolling7 * 0.65) + ($rolling30 * 0.35)) * $seasonalityFactor * $trendFactor);
            $smoothingPrediction = max(0, (($rolling7 * 0.45) + ($overallDailyAverage * 0.30) + ($recentDailyAverage * 0.25)) * $recencyFactor);

            $predictedRevenueRaw = (
                ($seasonalPrediction * (float) ($ensembleWeights['seasonal'] ?? 0.5))
                + ($momentumPrediction * (float) ($ensembleWeights['momentum'] ?? 0.3))
                + ($smoothingPrediction * (float) ($ensembleWeights['smoothing'] ?? 0.2))
            );
            $predictedRevenue = (int) round(max(0, $predictedRevenueRaw));

            $modelSpread = max($seasonalPrediction, $momentumPrediction, $smoothingPrediction) - min($seasonalPrediction, $momentumPrediction, $smoothingPrediction);
            $modelSpreadRatio = $predictedRevenueRaw > 0 ? ($modelSpread / $predictedRevenueRaw) : 0.0;

            $weekdaySamples = (int) ($weekdayStats[$weekday]['count'] ?? 0);
            $domSamples = (int) ($domStats[$dayOfMonth]['count'] ?? 0);
            $confidence = 45
                + min(20, $weekdaySamples * 0.8)
                + min(15, $domSamples * 0.5)
                + min(8, $daysWithPayments / 15)
                - min(18, $volatilityRatio * 20)
                - min(10, $offset * 0.8)
                - min(12, $modelSpreadRatio * 60);

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
                    'model_seasonal' => (int) round($seasonalPrediction),
                    'model_momentum' => (int) round($momentumPrediction),
                    'model_smoothing' => (int) round($smoothingPrediction),
                    'model_spread_ratio' => round($modelSpreadRatio * 100, 2),
                    'ensemble_weights' => [
                        'seasonal' => round((float) ($ensembleWeights['seasonal'] ?? 0), 4),
                        'momentum' => round((float) ($ensembleWeights['momentum'] ?? 0), 4),
                        'smoothing' => round((float) ($ensembleWeights['smoothing'] ?? 0), 4),
                    ],
                ],
            ];

            $forecastSeriesMap[$cursor->toDateString()] = (float) $predictedRevenue;

            $predictedTotal += $predictedRevenue;
            $confidenceTotal += $confidence;
        }

        $averageConfidence = (int) round($this->safeAverage($confidenceTotal, $forecastDays));
        $predictedDailyAverage = (int) round($this->safeAverage($predictedTotal, $forecastDays));

        $analysisNotes = [];
        if ($historicalInvoiceCount === 0) {
            $analysisNotes[] = 'Data invoice paid historis belum tersedia, sehingga prediksi masih konservatif.';
        } else {
            $analysisNotes[] = 'Model prediksi memakai ensemble adaptif: seasonal, momentum (moving average), dan smoothing.';
            if (($ensembleValidation['window_days'] ?? 0) > 0) {
                $analysisNotes[] = 'Kalibrasi bobot otomatis berdasarkan backtest ' . (int) ($ensembleValidation['window_days'] ?? 0) . ' hari terakhir (WMAPE seasonal ' . number_format((float) ($ensembleValidation['wmape']['seasonal'] ?? 0), 1) . '%, momentum ' . number_format((float) ($ensembleValidation['wmape']['momentum'] ?? 0), 1) . '%, smoothing ' . number_format((float) ($ensembleValidation['wmape']['smoothing'] ?? 0), 1) . '%).';
            }
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
                'ensemble_weights' => [
                    'seasonal' => round((float) ($ensembleWeights['seasonal'] ?? 0), 4),
                    'momentum' => round((float) ($ensembleWeights['momentum'] ?? 0), 4),
                    'smoothing' => round((float) ($ensembleWeights['smoothing'] ?? 0), 4),
                ],
                'validation' => $ensembleValidation,
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

    private function buildFinancialProjectionAssistant(array $projection): array
    {
        $summary = is_array($projection['summary'] ?? null) ? $projection['summary'] : [];
        $forecastContext = is_array($projection['forecast_context'] ?? null) ? $projection['forecast_context'] : [];
        $mandatoryRows = is_array($projection['mandatory_expense_projection'] ?? null)
            ? $projection['mandatory_expense_projection']
            : [];
        $purchaseRows = is_array($projection['purchase_goals'] ?? null)
            ? $projection['purchase_goals']
            : [];

        $coverageRate = (float) ($summary['mandatory_coverage_rate'] ?? 100);
        $coverageAmountRate = (float) ($summary['mandatory_coverage_amount_rate'] ?? 100);
        $shortfallTotal = (float) ($summary['mandatory_shortfall_total'] ?? 0);
        $endingBalance = (float) ($summary['projected_ending_balance'] ?? 0);
        $netAfterMandatory = (float) ($summary['net_after_mandatory'] ?? 0);
        $averageConfidence = (float) ($forecastContext['average_confidence'] ?? 0);
        $volatilityIndex = (float) ($forecastContext['volatility_index'] ?? 0);
        $purchaseReachable = (int) ($summary['purchase_targets_reachable'] ?? 0);
        $purchaseReadyNow = (int) ($summary['purchase_targets_ready_now'] ?? 0);
        $purchaseTotal = (int) ($summary['purchase_targets_total'] ?? 0);
        $confirmedMandatory = (int) ($summary['mandatory_confirmed_events'] ?? 0);
        $operationalBudget = (float) ($summary['operational_spending_budget'] ?? 0);
        $recommendedOperationalBudget = (float) ($summary['recommended_operational_spending_budget'] ?? 0);
        $operationalBudgetAsOfDate = (string) ($summary['operational_budget_as_of_date'] ?? '');
        $blockedPurchaseCount = collect($purchaseRows)->where('blocked_by_mandatory', true)->count();

        $score = 100.0;
        $score -= max(0, 100 - $coverageAmountRate) * 0.45;
        if ($shortfallTotal > 0) {
            $score -= min(25, log10(max(10, $shortfallTotal)) * 4.5);
        }
        if ($endingBalance < 0) {
            $score -= 20;
        }
        if ($netAfterMandatory < 0) {
            $score -= 15;
        }
        if ($averageConfidence < 70) {
            $score -= min(12, (70 - $averageConfidence) * 0.5);
        }
        if ($volatilityIndex > 60) {
            $score -= min(12, ($volatilityIndex - 60) * 0.25);
        }

        $score = (int) round($this->clamp($score, 0, 100));

        $riskLevel = 'rendah';
        if ($score < 40) {
            $riskLevel = 'kritis';
        } elseif ($score < 60) {
            $riskLevel = 'tinggi';
        } elseif ($score < 80) {
            $riskLevel = 'sedang';
        }

        $headline = 'Proyeksi bulanan sehat dan siap dieksekusi.';
        if ($riskLevel === 'sedang') {
            $headline = 'Proyeksi cukup stabil, namun masih perlu pengawalan kas.';
        } elseif ($riskLevel === 'tinggi') {
            $headline = 'Risiko kas tinggi: prioritaskan kewajiban sebelum belanja target.';
        } elseif ($riskLevel === 'kritis') {
            $headline = 'Kondisi kas kritis: butuh koreksi arus kas segera.';
        }

        $keyFindings = [];
        $keyFindings[] = 'Coverage kewajiban: ' . number_format($coverageRate, 1) . '% event dan ' . number_format($coverageAmountRate, 1) . '% nominal.';
        $keyFindings[] = 'Sisa setelah kewajiban: Rp ' . number_format((int) round($netAfterMandatory), 0, ',', '.') . ', estimasi saldo akhir: Rp ' . number_format((int) round($endingBalance), 0, ',', '.');
        $keyFindings[] = 'Budget operasional aman mulai ' . ($operationalBudgetAsOfDate !== '' ? $operationalBudgetAsOfDate : 'hari ini') . ': Rp ' . number_format((int) round($operationalBudget), 0, ',', '.') . ' (saran pakai: Rp ' . number_format((int) round($recommendedOperationalBudget), 0, ',', '.') . ').';
        $keyFindings[] = 'Akurasi model pendapatan saat ini pada confidence rata-rata ' . number_format($averageConfidence, 0) . '% dengan volatilitas ' . number_format($volatilityIndex, 1) . '%.';
        $keyFindings[] = 'Target pembelian siap dieksekusi sekarang: ' . $purchaseReadyNow . '/' . $purchaseTotal . ' (tercapai di rentang: ' . $purchaseReachable . '/' . $purchaseTotal . ').';
        $keyFindings[] = 'Event wajib yang sudah dikonfirmasi terlaksana: ' . $confirmedMandatory . ' event.';
        $keyFindings[] = 'Konfirmasi pengeluaran wajib dipakai untuk presisi prediksi dan tidak menambah mutasi ke ledger secara otomatis.';

        if ($blockedPurchaseCount > 0) {
            $keyFindings[] = $blockedPurchaseCount . ' target pembelian tertahan karena kewajiban wajib belum aman.';
        }

        $recommendedActions = [];
        if ($shortfallTotal > 0) {
            $recommendedActions[] = [
                'priority' => 'tinggi',
                'title' => 'Tutup shortfall kewajiban terlebih dahulu',
                'detail' => 'Kekurangan kewajiban wajib masih Rp ' . number_format((int) round($shortfallTotal), 0, ',', '.') . '. Alokasikan kas atau jadwalkan ulang beban wajib sebelum belanja target.',
            ];
        }

        if ($blockedPurchaseCount > 0) {
            $recommendedActions[] = [
                'priority' => 'tinggi',
                'title' => 'Tunda target pembelian non-prioritas',
                'detail' => 'Sebanyak ' . $blockedPurchaseCount . ' target masih tertahan oleh kewajiban. Gunakan dana diskresioner hanya setelah coverage wajib aman.',
            ];
        }

        if ($averageConfidence < 70 || $volatilityIndex > 60) {
            $recommendedActions[] = [
                'priority' => 'menengah',
                'title' => 'Perketat review mingguan proyeksi pendapatan',
                'detail' => 'Confidence model belum ideal atau volatilitas tinggi. Lakukan review prediksi minimal mingguan agar penyesuaian kas lebih cepat.',
            ];
        }

        if ($operationalBudget > 0) {
            $recommendedActions[] = [
                'priority' => 'menengah',
                'title' => 'Gunakan plafon budget operasional aman',
                'detail' => 'Batas aman tambahan belanja operasional saat ini sekitar Rp ' . number_format((int) round($operationalBudget), 0, ',', '.') . '. Untuk margin aman, gunakan maksimal Rp ' . number_format((int) round($recommendedOperationalBudget), 0, ',', '.') . '.',
            ];
        }

        if ($confirmedMandatory > 0) {
            $recommendedActions[] = [
                'priority' => 'menengah',
                'title' => 'Sinkronkan konfirmasi dengan input manual finance',
                'detail' => 'Pastikan event wajib yang sudah dikonfirmasi tetap dicatat melalui alur mutasi manual finance agar laporan realisasi tetap konsisten.',
            ];
        }

        if ($endingBalance < 0) {
            $recommendedActions[] = [
                'priority' => 'tinggi',
                'title' => 'Aktifkan mode pengendalian kas',
                'detail' => 'Saldo akhir diproyeksikan negatif. Prioritaskan pengeluaran operasional inti dan tahan pengeluaran discretionary.',
            ];
        }

        if (count($recommendedActions) === 0) {
            $recommendedActions[] = [
                'priority' => 'rendah',
                'title' => 'Pertahankan disiplin alokasi kas',
                'detail' => 'Proyeksi dalam kondisi sehat. Pertahankan pembagian kas antara biaya wajib, cadangan, dan target pembelian.',
            ];
        }

        $assumptions = [
            'Hari sebelum hari ini memakai realisasi ledger, dan hari ini memakai realisasi bila transaksi sudah ada; sisanya memakai forecast pendapatan.',
            'Target pembelian dihitung dari saldo diskresioner setelah menyisihkan kewajiban wajib yang masih tersisa.',
            'Target wajib bulanan selamanya mengikuti bulan mulai target agar tidak mundur ke periode sebelum target dibuat.',
        ];

        return [
            'assistant_name' => 'Asisten AI Proyeksi Keuangan',
            'model' => 'rule-based-financial-assistant-v1',
            'generated_at' => now()->toIso8601String(),
            'score' => $score,
            'risk_level' => $riskLevel,
            'headline' => $headline,
            'key_findings' => $keyFindings,
            'recommended_actions' => $recommendedActions,
            'assumptions' => $assumptions,
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

<?php

namespace App\Http\Controllers;


use App\Models\Invoice;
use App\Models\Complaint;
use Illuminate\Http\Request;
use Carbon\Carbon;

class DashboardController extends Controller
{
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
            $month = $now->copy()->subMonths($i);
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
            $month = $now->copy()->subMonths($i);
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $count = \App\Models\Customer::whereBetween('activation_date', [$start, $end])->count();
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
        // Ringkasan pendapatan bulan ini
        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        $endOfMonth = $now->copy()->endOfMonth();

        $monthlyRevenue = \App\Models\Invoice::whereBetween('paid_at', [$startOfMonth, $endOfMonth])
            ->where('status', 'paid')
            ->sum('amount');

        $totalCustomers = \App\Models\Customer::count();
        
        // Pelanggan Aktif = yang sudah membayar bulan ini
        $activeCustomers = \App\Models\Customer::whereHas('invoices', function($q) use ($startOfMonth, $endOfMonth) {
            $q->where('status', 'paid')->whereBetween('paid_at', [$startOfMonth, $endOfMonth]);
        })->count();
        
        $today = $now->toDateString();
        $pendingInvoices = \App\Models\Invoice::where('status', '!=', 'paid')
            ->where('due_date', '<', $today)
            ->count();

        $recentCustomers = \App\Models\Customer::latest()->take(5)->get(['id', 'name', 'email', 'is_active']);

        // Revenue untuk 6 bulan terakhir
        $revenueByMonth = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = $now->copy()->subMonths($i);
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $revenue = \App\Models\Invoice::whereBetween('paid_at', [$start, $end])
                ->where('status', 'paid')
                ->sum('amount');
            $revenueByMonth[] = (int) $revenue;
        }

        // Pemasangan baru untuk 6 bulan terakhir
        $newInstallations = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = $now->copy()->subMonths($i);
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $count = \App\Models\Customer::whereBetween('activation_date', [$start, $end])->count();
            $newInstallations[] = (int) $count;
        }

        // Complaint statistics
        $pendingComplaints = Complaint::where('status', 'pending')->count();
        $inProgressComplaints = Complaint::where('status', 'in_progress')->count();
        $totalActiveComplaints = $pendingComplaints + $inProgressComplaints;

        // Monitoring data: Get online customers from MikroTik
        $online_customers = 0;
        try {
            $mikrotik = new \App\Services\MikroTikService();
            $activeConnections = $mikrotik->getActivePPPoEConnections();
            
            // Count active customers (yang pppoe_username-nya ada di database)
            $dbCustomers = \App\Models\Customer::where('is_active', true)
                ->whereNotNull('pppoe_username')
                ->where('pppoe_username', '!=', '')
                ->pluck('pppoe_username')
                ->map(function($username) {
                    return strtolower(trim($username));
                })
                ->toArray();
            
            foreach ($activeConnections as $conn) {
                $connUsername = strtolower(trim($conn['name'] ?? ''));
                if (in_array($connUsername, $dbCustomers)) {
                    $online_customers++;
                }
            }
        } catch (\Exception $e) {
            // If MikroTik connection fails, set to 0
            $online_customers = 0;
        }

        return response()->json([
            'data' => [
                'total_customers' => $totalCustomers,
                'active_customers' => $activeCustomers,
                'online_customers' => $online_customers,
                'monthly_revenue' => $monthlyRevenue,
                'pending_invoices' => $pendingInvoices,
                'recent_customers' => $recentCustomers,
                'revenue_by_month' => $revenueByMonth,
                'new_installations' => $newInstallations,
                'pending_complaints' => $pendingComplaints,
                'in_progress_complaints' => $inProgressComplaints,
                'total_active_complaints' => $totalActiveComplaints,
            ]
        ]);
    }
}

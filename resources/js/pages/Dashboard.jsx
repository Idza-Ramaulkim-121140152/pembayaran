import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    ArrowRight,
    Calendar,
    DollarSign,
    FileText,
    Plus,
    Settings,
    TrendingDown,
    TrendingUp,
    Wallet,
    Zap,
} from 'lucide-react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ResponsiveDataView from '../components/common/ResponsiveDataView';
import apiClient from '../services/api';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

function getLastSixMonthLabels() {
    const now = new Date();
    const labels = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }));
    }
    return labels;
}

function getTodayDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const DEFAULT_STATS = {
    total_customers: 0,
    active_customers: 0,
    inactive_customers: 0,
    overdue_customers: 0,
    isolated_customers: 0,
    online_customers: 0,
    recent_customers: [],
    new_installations: [0, 0, 0, 0, 0, 0],
    monthly_installations: 0,
    pending_complaints: 0,
    in_progress_complaints: 0,
    total_active_complaints: 0,
    monthly_revenue: 0,
    monthly_income: 0,
    monthly_expense: 0,
    pending_invoices: 0,
    revenue_by_month: [0, 0, 0, 0, 0, 0],
    income_by_month: [0, 0, 0, 0, 0, 0],
    expense_by_month: [0, 0, 0, 0, 0, 0],
    package_distribution: [],
    active_package_distribution: [],
    finance_summary: { total_income: 0, total_expense: 0, adjustment_net: 0, balance: 0 },
    cashflow: { balance: 0, month_income: 0, month_expense: 0, month_net: 0, net_delta_pct: 0, runway_days: null, runway_status: 'normal' },
    loan_summary: { total_outstanding: 0, pending_receipts: 0 },
    borrower_debts: [],
    employee_payroll: {
        enabled: false,
        warning: null,
        member: null,
        salary_total: 0,
        salary_paid: 0,
        salary_unpaid: 0,
        project_history: [],
    },
};

function DashboardShell({ children }) {
    return (
        <div className="relative isolate -mx-3 -my-4 min-h-[calc(100vh-64px)] overflow-hidden bg-slate-50 text-slate-900 sm:-mx-4 sm:-my-6 md:-mx-6 md:-my-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(251,146,60,0.16),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,#fff7ed_0%,#f8fafc_34%,#ffffff_100%)]" />
            <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(120deg,rgba(251,146,60,0.12),rgba(59,130,246,0.08)_48%,transparent)]" />
            <div className="relative z-10 p-4 sm:p-5 md:p-7 xl:p-9">{children}</div>
        </div>
    );
}

function SectionFrame({ eyebrow, title, aside = null, children, className = '' }) {
    return (
        <section className={`pt-3 ${className}`}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-500">{eyebrow}</p>}
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
                </div>
                {aside}
            </div>
            {children}
        </section>
    );
}

function HeroMetric({ label, value, helper, tone = 'cyan' }) {
    const toneMap = {
        cyan: 'border-blue-100 bg-blue-50 text-blue-800',
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
        violet: 'border-orange-100 bg-orange-50 text-orange-800',
        amber: 'border-amber-100 bg-amber-50 text-amber-800',
        rose: 'border-rose-100 bg-rose-50 text-rose-800',
    };

    return (
        <div className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md ${toneMap[tone] || toneMap.cyan}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
            {helper && <p className="mt-2 text-sm opacity-75">{helper}</p>}
        </div>
    );
}

function DataTile({ icon: Icon, label, value, helper, accent = 'cyan' }) {
    const accentMap = {
        cyan: 'text-blue-600 bg-blue-50',
        emerald: 'text-emerald-600 bg-emerald-50',
        violet: 'text-orange-600 bg-orange-50',
        amber: 'text-amber-600 bg-amber-50',
        rose: 'text-rose-600 bg-rose-50',
        slate: 'text-slate-600 bg-slate-100',
    };

    return (
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                    <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900">{value}</p>
                    {helper && <p className="mt-2 text-sm text-slate-600">{helper}</p>}
                </div>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accentMap[accent] || accentMap.cyan}`}>
                    <Icon size={18} />
                </div>
            </div>
        </div>
    );
}

function ActionTile({ href, icon: Icon, label }) {
    return (
        <a
            href={href}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
        >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(251,146,60,0.08),transparent_45%)] opacity-70" />
            <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                        <Icon size={18} />
                    </div>
                    <p className="mt-4 font-semibold">{label}</p>
                </div>
                <ArrowRight size={18} className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-orange-500" />
            </div>
        </a>
    );
}

function DashboardPanelSurface({ children, className = '' }) {
    return (
        <div className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm transition duration-300 hover:shadow-md ${className}`}>
            {children}
        </div>
    );
}

function DashboardField({ label, hint, children }) {
    return (
        <label className="block space-y-2">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                {hint && <span className="text-xs text-slate-500">{hint}</span>}
            </div>
            {children}
        </label>
    );
}

const dashboardInputClassName =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100';

const dashboardSelectClassName =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100';

function Dashboard() {
    const userRole = window.appUserRole || 'admin';
    const canEditMutations = !!window.appCanEditMutations;
    const isTeknisi = userRole === 'teknisi';
    const isFinance = userRole === 'finance';
    const canViewBalance = !isTeknisi;

    const [stats, setStats] = useState(DEFAULT_STATS);
    const [monthLabels] = useState(getLastSixMonthLabels);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isolatedCount, setIsolatedCount] = useState(0);
    const [isolatedCountLoading, setIsolatedCountLoading] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustSubmitting, setAdjustSubmitting] = useState(false);
    const [adjustForm, setAdjustForm] = useState({
        description: '',
        amount: '',
        transaction_date: getTodayDateValue(),
    });
    const [showManualIncomeModal, setShowManualIncomeModal] = useState(false);
    const [manualIncomeSubmitting, setManualIncomeSubmitting] = useState(false);
    const [visibleEmployeeHistoryCount, setVisibleEmployeeHistoryCount] = useState(3);
    const [manualIncomeForm, setManualIncomeForm] = useState({
        source: 'manual',
        description: '',
        amount: '',
        transaction_date: getTodayDateValue(),
    });

    const fetchDashboardStats = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/dashboard');
            const payload = response.data?.data || {};
            setStats((prev) => ({ ...prev, ...payload }));
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat ringkasan dashboard.');
        } finally {
            setLoading(false);
        }
    };

    const fetchIsolatedCount = async () => {
        if (isFinance) return;

        try {
            setIsolatedCountLoading(true);
            const response = await apiClient.get('/isolir');
            setIsolatedCount(Number(response.data?.count || 0));
        } catch (err) {
            console.error('Failed to fetch isolated count:', err);
        } finally {
            setIsolatedCountLoading(false);
        }
    };

    const fetchTransactions = async () => {
        if (isTeknisi) return;

        try {
            setTransactionsLoading(true);
            const response = await apiClient.get('/finance/transactions');
            setTransactions(response.data?.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch transactions:', err);
        } finally {
            setTransactionsLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardStats();
        fetchIsolatedCount();
        fetchTransactions();
    }, []);

    useEffect(() => {
        setVisibleEmployeeHistoryCount(3);
    }, [stats?.employee_payroll?.member?.id]);

    const handleAdjustBalance = async (e) => {
        e.preventDefault();
        try {
            setAdjustSubmitting(true);
            await apiClient.post('/finance/balance-adjustments', {
                description: adjustForm.description,
                amount: Number(adjustForm.amount),
                transaction_date: adjustForm.transaction_date,
            });

            setShowAdjustModal(false);
            setAdjustForm({
                description: '',
                amount: '',
                transaction_date: getTodayDateValue(),
            });

            await Promise.all([
                fetchDashboardStats(),
                fetchTransactions(),
            ]);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan penyesuaian saldo');
        } finally {
            setAdjustSubmitting(false);
        }
    };

    const handleManualIncome = async (e) => {
        e.preventDefault();
        try {
            setManualIncomeSubmitting(true);
            await apiClient.post('/finance/manual-income', {
                source: manualIncomeForm.source,
                description: manualIncomeForm.description,
                amount: Number(manualIncomeForm.amount),
                transaction_date: manualIncomeForm.transaction_date,
            });

            setShowManualIncomeModal(false);
            setManualIncomeForm({
                source: 'manual',
                description: '',
                amount: '',
                transaction_date: getTodayDateValue(),
            });

            await Promise.all([
                fetchDashboardStats(),
                fetchTransactions(),
            ]);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah pemasukan manual');
        } finally {
            setManualIncomeSubmitting(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(Number(amount || 0));
    };

    const formatPercent = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;

    const activeCustomerCount = Number(stats?.active_customers || 0);
    const totalCustomerCount = Number(stats?.total_customers || 0);
    const inactiveCustomerCount = Number(
        stats?.inactive_customers ?? Math.max(0, totalCustomerCount - activeCustomerCount)
    );
    const monthlyInstallations = Number(
        stats?.monthly_installations ?? stats?.new_installations?.[stats?.new_installations?.length - 1] ?? 0
    );
    const financeSummary = stats?.finance_summary || DEFAULT_STATS.finance_summary;
    const monthlyFinance = stats?.monthly_finance || null;
    const cashflowSummary = stats?.cashflow || DEFAULT_STATS.cashflow;
    const loanSummary = stats?.loan_summary || DEFAULT_STATS.loan_summary;
    const cashBalance = Number(cashflowSummary?.balance ?? financeSummary?.balance ?? 0);
    const totalLoanOutstanding = Number(loanSummary?.total_outstanding ?? 0);
    const pendingReceipts = Number(loanSummary?.pending_receipts ?? 0);
    const monthExpense = Number(cashflowSummary?.month_expense ?? monthlyFinance?.current_month?.expense ?? stats?.monthly_expense ?? 0);
    const monthIncome = Number(cashflowSummary?.month_income ?? monthlyFinance?.current_month?.income ?? stats?.monthly_revenue ?? 0);
    const monthNet = Number(cashflowSummary?.month_net ?? monthlyFinance?.current_month?.net ?? stats?.monthly_net ?? 0);
    const netDeltaPct = Number(cashflowSummary?.net_delta_pct ?? monthlyFinance?.comparison?.net_change_percentage ?? 0);
    const elapsedDays = Math.max(new Date().getDate(), 1);
    const avgDailyExpense = monthExpense > 0 ? monthExpense / elapsedDays : 0;
    const fallbackRunwayDays = cashBalance <= 0 ? 0 : avgDailyExpense > 0 ? Math.floor(cashBalance / avgDailyExpense) : null;
    const runwayDays = cashflowSummary?.runway_days ?? fallbackRunwayDays;
    const runwayStatus = cashflowSummary?.runway_status
        || (runwayDays === null ? 'normal' : runwayDays < 15 ? 'critical' : runwayDays <= 45 ? 'warning' : 'normal');
    const runwayBadgeClass = runwayStatus === 'critical'
        ? 'bg-rose-100 text-rose-700'
        : runwayStatus === 'warning'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-100 text-emerald-700';
    const isPositiveNetDelta = netDeltaPct >= 0;
    const packageDistribution = Array.isArray(stats?.package_distribution) ? stats.package_distribution : [];
    const activePackageDistribution = Array.isArray(stats?.active_package_distribution) ? stats.active_package_distribution : [];
    const borrowerDebts = Array.isArray(stats?.borrower_debts) ? stats.borrower_debts : [];
    const packageDistributionTotal = packageDistribution.reduce((sum, item) => sum + Number(item?.count || 0), 0);
    const activePackageDistributionTotal = activePackageDistribution.reduce((sum, item) => sum + Number(item?.count || 0), 0);
    const defaultMonthlySeries = [0, 0, 0, 0, 0, 0];
    const normalizeSeries = (series) => (Array.isArray(series) && series.length === monthLabels.length ? series : defaultMonthlySeries);
    const packagePalette = [
        'rgba(14, 165, 233, 0.9)',
        'rgba(16, 185, 129, 0.9)',
        'rgba(245, 158, 11, 0.9)',
        'rgba(236, 72, 153, 0.9)',
        'rgba(139, 92, 246, 0.9)',
        'rgba(239, 68, 68, 0.9)',
        'rgba(34, 197, 94, 0.9)',
        'rgba(59, 130, 246, 0.9)',
    ];

    const financeChartData = {
        labels: monthLabels,
        datasets: [
            {
                label: 'Pemasukan',
                data: normalizeSeries(stats?.income_by_month || stats?.revenue_by_month),
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 12,
                borderSkipped: false,
            },
            {
                label: 'Pengeluaran',
                data: normalizeSeries(stats?.expense_by_month),
                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 12,
                borderSkipped: false,
            },
        ],
    };

    const installationChartData = {
        labels: monthLabels,
        datasets: [
            {
                label: 'Pemasangan Baru',
                data: stats?.new_installations || [0, 0, 0, 0, 0, 0],
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
                    gradient.addColorStop(1, 'rgba(147, 51, 234, 0.9)');
                    return gradient;
                },
                borderRadius: 12,
                borderSkipped: false,
            },
        ],
    };

    const customerStatusData = {
        labels: ['Aktif', 'Tidak Aktif'],
        datasets: [
            {
                data: [activeCustomerCount, inactiveCustomerCount],
                backgroundColor: ['rgba(34, 197, 94, 0.9)', 'rgba(239, 68, 68, 0.9)'],
                borderColor: ['transparent', 'transparent'],
                borderWidth: 0,
                hoverOffset: 10,
            },
        ],
    };

    const packageDistributionData = {
        labels: packageDistribution.map((item) => item.label),
        datasets: [
            {
                data: packageDistribution.map((item) => Number(item.count || 0)),
                backgroundColor: packageDistribution.map((_, index) => packagePalette[index % packagePalette.length]),
                borderColor: 'transparent',
                borderWidth: 0,
                hoverOffset: 10,
            },
        ],
    };

    const activePackageDistributionData = {
        labels: activePackageDistribution.map((item) => item.label),
        datasets: [
            {
                data: activePackageDistribution.map((item) => Number(item.count || 0)),
                backgroundColor: activePackageDistribution.map((_, index) => packagePalette[index % packagePalette.length]),
                borderColor: 'transparent',
                borderWidth: 0,
                hoverOffset: 10,
            },
        ],
    };

    const financeChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(2, 6, 23, 0.96)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => `Rp ${Number(context.raw || 0).toLocaleString('id-ID')}`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(148, 163, 184, 0.12)', drawBorder: false },
                ticks: {
                    color: '#cbd5e1',
                    callback: (value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}jt`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}rb`;
                        return value;
                    },
                },
            },
        },
    };

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(2, 6, 23, 0.96)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => `${context.raw} pelanggan baru`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
            y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.12)', drawBorder: false }, ticks: { color: '#cbd5e1', stepSize: 1 } },
        },
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(2, 6, 23, 0.96)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => `${context.label}: ${context.raw} pelanggan`,
                },
            },
        },
    };

    const packageDoughnutOptions = {
        ...doughnutOptions,
        plugins: {
            ...doughnutOptions.plugins,
            tooltip: {
                backgroundColor: 'rgba(2, 6, 23, 0.96)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => {
                        const item = packageDistribution[context.dataIndex];
                        return `${context.label}: ${Number(context.raw || 0)} pelanggan (${item?.percentage ?? 0}%)`;
                    },
                },
            },
        },
    };

    const activePackageDoughnutOptions = {
        ...packageDoughnutOptions,
        plugins: {
            ...packageDoughnutOptions.plugins,
            tooltip: {
                backgroundColor: 'rgba(2, 6, 23, 0.96)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => {
                        const item = activePackageDistribution[context.dataIndex];
                        return `${context.label}: ${Number(context.raw || 0)} pelanggan (${item?.percentage ?? 0}%)`;
                    },
                },
            },
        },
    };

    const quickActions = useMemo(() => {
        const actions = [];

        if (!isFinance) {
            actions.push({
                href: '/customers/create',
                label: 'Aktivasi Pelanggan',
                icon: Plus,
            });
        }

        if (!isTeknisi) {
            actions.push({
                href: '/pengeluaran',
                label: 'Catat Pengeluaran',
                icon: FileText,
            });
            actions.push({
                href: '/penagihan',
                label: 'Kelola Tagihan',
                icon: DollarSign,
            });
            actions.push({
                href: '/laporan',
                label: 'Laporan Keuangan',
                icon: FileText,
            });
        }

        if (!isFinance) {
            actions.push({
                href: '/odp',
                label: 'Kelola ODP',
                icon: Settings,
            });
        }

        return actions;
    }, [isFinance, isTeknisi]);

    const headlineMetrics = [
        !isFinance ? {
            key: 'customers',
            icon: Activity,
            label: 'Total Pelanggan',
            value: loading ? '...' : totalCustomerCount,
            accent: 'cyan',
        } : null,
        !isFinance ? {
            key: 'active-customers',
            icon: Zap,
            label: 'Pelanggan Aktif',
            value: loading ? '...' : activeCustomerCount,
            accent: 'emerald',
        } : null,
        !isTeknisi ? {
            key: 'monthly-revenue',
            icon: DollarSign,
            label: 'Pendapatan Bulan Ini',
            value: loading ? '...' : `Rp ${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.monthly_revenue || 0)}`,
            accent: 'violet',
        } : null,
        !isFinance ? {
            key: 'monthly-installations',
            icon: Plus,
            label: 'Pemasangan Bulan Ini',
            value: loading ? '...' : monthlyInstallations,
            accent: 'cyan',
        } : null,
        !isTeknisi ? {
            key: 'loan-outstanding',
            icon: Wallet,
            label: 'Total Pinjaman',
            value: loading ? '...' : `Rp ${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(totalLoanOutstanding || 0)}`,
            accent: 'amber',
        } : null,
        !isTeknisi ? {
            key: 'pending-receipts',
            icon: FileText,
            label: 'Mutasi Pending',
            value: loading ? '...' : `Rp ${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(pendingReceipts || 0)}`,
            accent: 'cyan',
        } : null,
        !isTeknisi ? {
            key: 'pending-invoices',
            icon: FileText,
            label: 'Invoice Tertunda',
            value: loading ? '...' : (stats.pending_invoices || 0),
            accent: 'amber',
        } : null,
        !isFinance ? {
            key: 'active-complaints',
            icon: Activity,
            label: 'Aduan Aktif',
            value: loading ? '...' : (stats.total_active_complaints || 0),
            accent: 'rose',
        } : null,
    ].filter(Boolean);

    const employeePayroll = stats?.employee_payroll || DEFAULT_STATS.employee_payroll;
    const employeePayrollHistory = Array.isArray(employeePayroll?.project_history) ? employeePayroll.project_history : [];
    const visibleEmployeePayrollHistory = employeePayrollHistory.slice(0, visibleEmployeeHistoryCount);
    const hasMoreEmployeePayrollHistory = employeePayrollHistory.length > visibleEmployeeHistoryCount;

    const formatShortDate = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const employeePayrollColumns = [
        { key: 'tanggal', label: 'Tanggal', render: (row) => formatShortDate(row.tanggal), cellClassName: 'px-3 py-2 text-slate-600' },
        {
            key: 'project',
            label: 'Proyek',
            render: (row) => (
                <div>
                    <p className="font-medium text-slate-900">#{row.project_id}</p>
                    <p className="text-xs text-slate-500">{row.catatan || '-'}</p>
                </div>
            ),
            cellClassName: 'px-3 py-2 text-slate-600',
        },
        {
            key: 'status',
            label: 'Status',
            render: (row) => (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {row.status === 'paid' ? 'Dibayar' : 'Belum Dibayar'}
                </span>
            ),
            cellClassName: 'px-3 py-2',
        },
        {
            key: 'bagian',
            label: 'Bagian Anda',
            headerClassName: 'px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500',
            cellClassName: 'px-3 py-2 text-right font-semibold text-blue-700',
            render: (row) => formatCurrency(row.bagian || 0),
        },
        {
            key: 'project_total',
            label: 'Total Proyek',
            headerClassName: 'px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500',
            cellClassName: 'px-3 py-2 text-right text-slate-600',
            render: (row) => formatCurrency(row.project_total || 0),
        },
    ];

    const dashboardTransactionColumns = [
        { key: 'transaction_date', label: 'Tanggal', cellClassName: 'px-3 py-2 text-slate-600' },
        { key: 'type', label: 'Jenis', cellClassName: 'px-3 py-2 text-slate-700', render: (row) => row.type || '-' },
        { key: 'source', label: 'Sumber', cellClassName: 'px-3 py-2 text-slate-700', render: (row) => row.source || '-' },
        { key: 'description', label: 'Deskripsi', cellClassName: 'px-3 py-2 text-slate-900', render: (row) => row.description || '-' },
        {
            key: 'amount',
            label: 'Nominal',
            headerClassName: 'px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500',
            cellClassName: 'px-3 py-2 text-right font-semibold',
            render: (row) => {
                const amount = Number(row.amount || 0);
                const isIncome = row.type === 'income';
                return (
                    <span className={isIncome ? 'text-emerald-700' : 'text-rose-700'}>
                        {isIncome ? '+' : '-'}{formatCurrency(amount)}
                    </span>
                );
            },
        },
    ];

    return (
        <DashboardShell>
            <div className="space-y-7 min-w-0">
                <section className="px-1 py-2 md:px-0">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-500">
                                Rumah Kita Net
                            </p>
                            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                                Dashboard Operasional
                            </h1>
                            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
                                <span className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-1.5 shadow-sm">
                                    <Calendar size={15} className="text-orange-500" />
                                    {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 shadow-sm">
                                    <Wallet size={15} className="text-emerald-600" />
                                    Kas {loading ? 'memuat...' : formatCurrency(cashBalance)}
                                </span>
                            </div>
                        </div>

                        <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
                            {canViewBalance && (
                                <HeroMetric
                                    label="Saldo Kas Saat Ini"
                                    value={loading ? 'Memuat...' : formatCurrency(cashBalance)}
                                    helper={loading ? null : `Masuk ${formatCurrency(monthIncome)} | Keluar ${formatCurrency(monthExpense)} | Pending ${formatCurrency(pendingReceipts)} | Pinjaman ${formatCurrency(totalLoanOutstanding)}`}
                                    tone="emerald"
                                />
                            )}
                            {canViewBalance && (
                                <HeroMetric
                                    label="Total Pinjaman"
                                    value={loading ? 'Memuat...' : formatCurrency(totalLoanOutstanding)}
                                    helper="Outstanding hutang ke perusahaan"
                                    tone="amber"
                                />
                            )}
                            <HeroMetric
                                label="Cash Runway"
                                value={runwayDays === null ? '-' : `${runwayDays} hari`}
                                helper={(
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] ${runwayBadgeClass}`}>
                                        {runwayStatus}
                                    </span>
                                )}
                                tone={runwayStatus === 'critical' ? 'rose' : runwayStatus === 'warning' ? 'amber' : 'cyan'}
                            />
                            <HeroMetric
                                label="Perubahan Net (MoM)"
                                value={`${Math.abs(netDeltaPct).toFixed(1)}%`}
                                tone={isPositiveNetDelta ? 'emerald' : 'rose'}
                            />
                            <HeroMetric
                                label="Aduan Aktif"
                                value={loading ? '...' : (stats.total_active_complaints || 0)}
                                tone="violet"
                            />
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        {!isFinance && (
                            <a
                                href="/customer-verification"
                                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-600"
                            >
                                <Plus size={18} />
                                Aktivasi Baru
                            </a>
                        )}
                        {canEditMutations && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowManualIncomeModal(true)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700"
                                >
                                    <Plus size={18} />
                                    Pemasukan Manual
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAdjustModal(true)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
                                >
                                    <Wallet size={18} />
                                    Penyesuaian Saldo
                                </button>
                            </>
                        )}
                    </div>
                </section>

                {error && (
                    <Alert
                        type="error"
                        title="Error"
                        message={error}
                        onClose={() => setError(null)}
                        className="border-rose-200 bg-rose-50 text-rose-800 shadow-none"
                    />
                )}

                {loading && (
                    <Alert
                        type="info"
                        title="Memuat Dashboard"
                        message="Ringkasan utama sedang diproses."
                        className="border-blue-200 bg-blue-50 text-blue-800 shadow-none"
                    />
                )}

                {!isFinance && (
                    <div className="grid gap-5 xl:grid-cols-2">
                        <SectionFrame
                            eyebrow="Monitoring"
                            title="Jaringan & isolir"
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <DashboardPanelSurface accent="violet" className="border-orange-100 bg-orange-50">
                                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">Monitoring perangkat</p>
                                    <p className="mt-3 text-4xl font-black">{loading ? '...' : (stats.online_customers || 0)}</p>
                                    <p className="mt-1 text-sm text-orange-700/80">dari {loading ? '...' : (stats.total_customers || 0)} pelanggan terpantau</p>
                                    <a href="/monitoring" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600">
                                        Lihat Monitoring
                                        <ArrowRight size={16} />
                                    </a>
                                </DashboardPanelSurface>
                                <DashboardPanelSurface accent="rose" className="border-rose-100 bg-rose-50">
                                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">Perangkat isolir</p>
                                    <p className="mt-3 text-4xl font-black">{isolatedCountLoading ? '...' : isolatedCount}</p>
                                    <p className="mt-1 text-sm text-rose-700/80">perangkat dibatasi karena lewat jatuh tempo</p>
                                    <a href="/isolir" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700">
                                        Lihat Detail
                                        <ArrowRight size={16} />
                                    </a>
                                </DashboardPanelSurface>
                            </div>
                        </SectionFrame>

                        <SectionFrame
                            eyebrow="KPI"
                            title="Kartu ringkas"
                        >
                            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isFinance ? 'xl:grid-cols-3' : ''}`}>
                                {headlineMetrics.map((item) => (
                                    <DataTile
                                        key={item.key}
                                        icon={item.icon}
                                        label={item.label}
                                        value={item.value}
                                        helper={item.helper}
                                        accent={item.accent}
                                    />
                                ))}
                            </div>
                        </SectionFrame>
                    </div>
                )}

                {employeePayroll?.enabled && (
                    <SectionFrame
                        eyebrow="Payroll"
                        title="Ringkasan payroll karyawan"
                        aside={(
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-right">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Total gaji payroll</p>
                                <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(employeePayroll?.salary_total || 0)}</p>
                            </div>
                        )}
                    >
                        {employeePayroll?.warning && (
                            <Alert
                                type="warning"
                                title="Perhatian"
                                message={employeePayroll.warning}
                                className="border-amber-200 bg-amber-50 text-amber-800 shadow-none"
                            />
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <DataTile icon={TrendingUp} label="Sudah Dibayar" value={formatCurrency(employeePayroll?.salary_paid || 0)} accent="cyan" />
                            <DataTile icon={TrendingDown} label="Sisa Gaji" value={formatCurrency(employeePayroll?.salary_unpaid || 0)} accent="amber" />
                        </div>

                        <div className="mt-6">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Riwayat proyek payroll</h3>
                                {hasMoreEmployeePayrollHistory && (
                                    <button
                                        type="button"
                                        onClick={() => setVisibleEmployeeHistoryCount((prev) => prev + 3)}
                                        className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
                                    >
                                        Lihat Lebih Banyak
                                    </button>
                                )}
                            </div>

                            {visibleEmployeePayrollHistory.length === 0 ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                                    Belum ada riwayat proyek payroll.
                                </div>
                            ) : (
                                <DashboardPanelSurface accent="cyan" className="p-2">
                                    <ResponsiveDataView
                                        rows={visibleEmployeePayrollHistory.map((item, index) => ({
                                            ...item,
                                            __rowKey: `${item.project_id}-${item.tanggal}-${index}`,
                                        }))}
                                        columns={employeePayrollColumns}
                                        keyField="__rowKey"
                                        priorityFields={['tanggal', 'project', 'status', 'bagian']}
                                        tableClassName="w-full text-sm md:min-w-[720px]"
                                        headClassName="bg-slate-50"
                                        bodyClassName="divide-y divide-slate-100"
                                        rowHoverClassName="hover:bg-orange-50/50"
                                        emptyDesktopClassName="px-4 py-8 text-center text-slate-500"
                                        mobileCardClassName="border border-slate-200 bg-white"
                                        mobileLabelClassName="text-slate-500"
                                        mobileValueClassName="text-slate-900"
                                    />
                                </DashboardPanelSurface>
                            )}
                        </div>
                    </SectionFrame>
                )}

                {!isTeknisi && (
                    <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
                        <SectionFrame
                            eyebrow="Finansial"
                            title="Pemasukan vs pengeluaran"
                            aside={(
                                <div className="flex items-center gap-4 text-sm">
                                    <span className="flex items-center gap-2 text-slate-600"><span className="h-3 w-3 rounded-full bg-emerald-500" />Pemasukan</span>
                                    <span className="flex items-center gap-2 text-slate-600"><span className="h-3 w-3 rounded-full bg-rose-500" />Pengeluaran</span>
                                </div>
                            )}
                        >
                                <DashboardPanelSurface accent="emerald">
                                    <div className="h-[320px]">
                                        <Bar data={financeChartData} options={financeChartOptions} />
                                    </div>
                                </DashboardPanelSurface>
                            </SectionFrame>

                        <SectionFrame
                            eyebrow="Pelanggan"
                            title="Status pelanggan"
                        >
                            <DashboardPanelSurface accent="violet">
                                <div className="relative h-[280px]">
                                    <Doughnut data={customerStatusData} options={doughnutOptions} />
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <div className="text-center">
                                            <p className="text-4xl font-black text-slate-900">{totalCustomerCount}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-500">Total</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-5 grid grid-cols-2 gap-3">
                                    <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Aktif ({activeCustomerCount})</div>
                                    <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Tidak Aktif ({inactiveCustomerCount})</div>
                                </div>
                            </DashboardPanelSurface>
                        </SectionFrame>
                    </div>
                )}

                {!isTeknisi && (
                    <SectionFrame
                        eyebrow="Paket"
                        title="Distribusi paket layanan"
                    >
                        <div className="grid gap-5 xl:grid-cols-2">
                            {[
                                {
                                    key: 'total',
                                    title: 'Total Pelanggan',
                                    totalLabel: 'Total pelanggan dengan paket',
                                    totalValue: packageDistributionTotal,
                                    items: packageDistribution,
                                    data: packageDistributionData,
                                    options: packageDoughnutOptions,
                                    emptyText: 'Belum ada data paket layanan.',
                                },
                                {
                                    key: 'active',
                                    title: 'Pelanggan Aktif',
                                    totalLabel: 'Total pelanggan aktif dengan paket',
                                    totalValue: activePackageDistributionTotal,
                                    items: activePackageDistribution,
                                    data: activePackageDistributionData,
                                    options: activePackageDoughnutOptions,
                                    emptyText: 'Belum ada pelanggan aktif dengan paket.',
                                },
                            ].map((card) => (
                                <DashboardPanelSurface key={card.key} accent={card.key === 'active' ? 'emerald' : 'cyan'} className="p-5">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                                        </div>
                                        <div className="text-right text-sm text-slate-600">
                                            {card.totalLabel}: <span className="font-semibold text-slate-900">{card.totalValue}</span>
                                        </div>
                                    </div>

                                    {card.items.length === 0 ? (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-500">
                                            {card.emptyText}
                                        </div>
                                    ) : (
                                        <div className="grid gap-5">
                                            <div className="relative h-[280px] rounded-lg border border-slate-100 bg-slate-50 p-3">
                                                <Doughnut data={card.data} options={card.options} />
                                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                    <div className="text-center">
                                                        <p className="text-3xl font-black text-slate-900">{card.items.length}</p>
                                                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Jenis Paket</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                {card.items.map((item, index) => {
                                                    const color = packagePalette[index % packagePalette.length];
                                                    return (
                                                        <div key={`${card.key}-${item.label}-${index}`} className="rounded-lg border border-slate-100 bg-white p-4">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="flex min-w-0 items-center gap-3">
                                                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                                                    <div className="min-w-0">
                                                                        <p className="truncate font-semibold text-slate-900">{item.label}</p>
                                                                        <p className="text-xs text-slate-500">{item.count} pelanggan</p>
                                                                    </div>
                                                                </div>
                                                                <span className="text-sm font-semibold text-slate-900">{formatPercent(item.percentage)}</span>
                                                            </div>
                                                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                                                <div
                                                                    className="h-full rounded-full"
                                                                    style={{ width: `${Math.min(100, Number(item.percentage || 0))}%`, backgroundColor: color }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </DashboardPanelSurface>
                            ))}
                        </div>
                    </SectionFrame>
                )}

                <div className={`grid gap-5 ${!isFinance ? 'xl:grid-cols-[1.45fr_1fr]' : ''}`}>
                    {!isFinance ? (
                        <>
                            <SectionFrame
                                eyebrow="Aktivasi"
                                title="Pemasangan baru"
                            >
                                <DashboardPanelSurface accent="violet">
                                    <div className="h-[300px]">
                                        <Bar data={installationChartData} options={barChartOptions} />
                                    </div>
                                </DashboardPanelSurface>
                            </SectionFrame>

                            <SectionFrame
                                eyebrow="Shortcut"
                                title="Aksi cepat"
                            >
                                <div className="grid gap-3">
                                    {quickActions.map((item) => (
                                        <ActionTile
                                            key={item.href}
                                            href={item.href}
                                            icon={item.icon}
                                            label={item.label}
                                            accent={item.accent}
                                        />
                                    ))}
                                </div>
                            </SectionFrame>
                        </>
                    ) : (
                        <SectionFrame
                            eyebrow="Shortcut"
                            title="Aksi cepat keuangan"
                        >
                            <div className="grid gap-3 md:grid-cols-3">
                                <ActionTile href="/penagihan" icon={DollarSign} label="Kelola Tagihan" />
                                <ActionTile href="/pengeluaran" icon={FileText} label="Catat Pengeluaran" />
                                <ActionTile href="/laporan" icon={Activity} label="Laporan Keuangan" />
                            </div>
                        </SectionFrame>
                    )}
                </div>

                {!isTeknisi && (
                    <SectionFrame
                        eyebrow="Ledger"
                        title="Transaksi keuangan terintegrasi"
                    >
                        {transactionsLoading ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                                Memuat transaksi...
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                                Belum ada transaksi.
                            </div>
                        ) : (
                            <DashboardPanelSurface accent="amber" className="p-2">
                                <ResponsiveDataView
                                    rows={transactions.slice(0, 5)}
                                    columns={dashboardTransactionColumns}
                                    keyField="id"
                                    priorityFields={['transaction_date', 'type', 'amount', 'source']}
                                    tableClassName="w-full text-sm md:min-w-[800px]"
                                    headClassName="bg-slate-50"
                                    bodyClassName="divide-y divide-slate-100"
                                    rowHoverClassName="hover:bg-orange-50/50"
                                    emptyDesktopClassName="px-4 py-8 text-center text-slate-500"
                                    mobileCardClassName="border border-slate-200 bg-white"
                                    mobileLabelClassName="text-slate-500"
                                    mobileValueClassName="text-slate-900"
                                />
                            </DashboardPanelSurface>
                        )}
                    </SectionFrame>
                )}

                {borrowerDebts.length > 0 && (
                    <SectionFrame eyebrow="Pinjaman" title="Hutang Saya ke Perusahaan">
                        <div className="grid gap-4">
                            {borrowerDebts.map((item) => (
                                <DashboardPanelSurface key={item.id} accent="amber">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">{item.invoice?.invoice_link || 'Tanpa invoice'}</p>
                                            <p className="text-xs text-slate-500">Status: {item.status}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-amber-700">{formatCurrency(item.outstanding_amount || 0)}</p>
                                            <a href="/pinjaman" className="text-xs text-blue-600 hover:underline">Lihat detail hutang</a>
                                        </div>
                                    </div>
                                </DashboardPanelSurface>
                            ))}
                        </div>
                    </SectionFrame>
                )}
            </div>

            <Modal
                isOpen={showAdjustModal}
                onClose={() => setShowAdjustModal(false)}
                title="Penyesuaian Saldo"
                theme="dashboard"
            >
                <form onSubmit={handleAdjustBalance} className="space-y-5">
                    <DashboardPanelSurface accent="amber" className="border-amber-100 bg-amber-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Panduan</p>
                        <p className="mt-2 text-sm leading-6 text-amber-800">
                            Gunakan nilai positif untuk menambah saldo dan nilai negatif untuk mengurangi saldo.
                        </p>
                    </DashboardPanelSurface>

                    <DashboardField label="Deskripsi">
                        <input
                            type="text"
                            value={adjustForm.description}
                            onChange={(e) => setAdjustForm((prev) => ({ ...prev, description: e.target.value }))}
                            className={dashboardInputClassName}
                            required
                        />
                    </DashboardField>

                    <DashboardField label="Nominal (+/-)" hint="contoh: 50000 atau -50000">
                        <input
                            type="number"
                            value={adjustForm.amount}
                            onChange={(e) => setAdjustForm((prev) => ({ ...prev, amount: e.target.value }))}
                            className={dashboardInputClassName}
                            required
                        />
                    </DashboardField>

                    <DashboardField label="Tanggal Transaksi">
                        <input
                            type="date"
                            value={adjustForm.transaction_date}
                            onChange={(e) => setAdjustForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                            className={dashboardInputClassName}
                            required
                        />
                    </DashboardField>

                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setShowAdjustModal(false)}
                            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-orange-200"
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={adjustSubmitting}
                            className="border-transparent bg-orange-500 text-white shadow-sm hover:bg-orange-600 focus:ring-orange-200"
                        >
                            {adjustSubmitting ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={showManualIncomeModal}
                onClose={() => setShowManualIncomeModal(false)}
                title="Tambah Pemasukan Manual"
                theme="dashboard"
            >
                <form onSubmit={handleManualIncome} className="space-y-5">
                    <DashboardPanelSurface accent="emerald" className="border-emerald-100 bg-emerald-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Input cepat</p>
                        <p className="mt-2 text-sm leading-6 text-emerald-800">
                            Catatan pemasukan ini langsung ikut ke ringkasan finansial dan ledger dashboard.
                        </p>
                    </DashboardPanelSurface>

                    <DashboardField label="Sumber">
                        <select
                            value={manualIncomeForm.source}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, source: e.target.value }))}
                            className={dashboardSelectClassName}
                        >
                            <option value="manual">Manual</option>
                            <option value="pemasangan">Pemasangan</option>
                            <option value="pembayaran">Pembayaran</option>
                        </select>
                    </DashboardField>

                    <DashboardField label="Deskripsi">
                        <input
                            type="text"
                            value={manualIncomeForm.description}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, description: e.target.value }))}
                            className={dashboardInputClassName}
                            required
                        />
                    </DashboardField>

                    <DashboardField label="Nominal">
                        <input
                            type="number"
                            value={manualIncomeForm.amount}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, amount: e.target.value }))}
                            className={dashboardInputClassName}
                            required
                        />
                    </DashboardField>

                    <DashboardField label="Tanggal">
                        <input
                            type="date"
                            value={manualIncomeForm.transaction_date}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                            className={dashboardInputClassName}
                            required
                        />
                    </DashboardField>

                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setShowManualIncomeModal(false)}
                            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-orange-200"
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={manualIncomeSubmitting}
                            className="border-transparent bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus:ring-emerald-200"
                        >
                            {manualIncomeSubmitting ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </DashboardShell>
    );
}

export default Dashboard;

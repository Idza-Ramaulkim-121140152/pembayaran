import { useEffect, useMemo, useState } from 'react';
import {
    Calendar,
    DollarSign,
    FileText,
    Plus,
    Settings,
    Wallet,
    Zap,
} from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
};

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
    const packageDistribution = Array.isArray(stats?.package_distribution) ? stats.package_distribution : [];
    const activePackageDistribution = Array.isArray(stats?.active_package_distribution) ? stats.active_package_distribution : [];
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
                borderColor: ['#fff', '#fff'],
                borderWidth: 4,
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
                borderColor: '#fff',
                borderWidth: 3,
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
                borderColor: '#fff',
                borderWidth: 3,
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
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => `Rp ${Number(context.raw || 0).toLocaleString('id-ID')}`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(156, 163, 175, 0.1)', drawBorder: false },
                ticks: {
                    color: '#9ca3af',
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
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context) => `${context.raw} pelanggan baru`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
            y: { beginAtZero: true, grid: { color: 'rgba(156, 163, 175, 0.1)', drawBorder: false }, ticks: { color: '#9ca3af', stepSize: 1 } },
        },
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
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
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
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
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
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
            actions.push({ href: '/customers/create', label: 'Aktivasi Pelanggan', desc: 'Tambah pelanggan baru', icon: Plus, color: 'bg-blue-500' });
        }

        if (!isTeknisi) {
            actions.push({ href: '/pengeluaran', label: 'Catat Pengeluaran', desc: 'Input pengeluaran baru', icon: FileText, color: 'bg-emerald-500' });
            actions.push({ href: '/penagihan', label: 'Kelola Tagihan', desc: 'Lihat & kelola invoice', icon: DollarSign, color: 'bg-violet-500' });
        }

        if (!isFinance) {
            actions.push({ href: '/odp', label: 'Kelola ODP', desc: 'Pengaturan titik distribusi', icon: Settings, color: 'bg-orange-500' });
        }

        return actions;
    }, [isFinance, isTeknisi]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-500 mt-1 flex items-center gap-2">
                        <Calendar size={16} />
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    {!isFinance && (
                        <a
                            href="/customer-verification"
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl transition font-medium shadow-lg shadow-blue-500/25"
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
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl transition font-medium shadow-lg shadow-emerald-500/25"
                            >
                                <Plus size={18} />
                                Pemasukan Manual
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAdjustModal(true)}
                                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl transition font-medium shadow-lg shadow-amber-500/25"
                            >
                                <Wallet size={18} />
                                Penyesuaian Saldo
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <Alert type="error" title="Error" message={error} onClose={() => setError(null)} />
            )}

            {loading && (
                <Alert type="info" title="Memuat Dashboard" message="Ringkasan utama sedang diproses." />
            )}

            {canViewBalance && (
                <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl p-4 md:p-5 text-white shadow-lg shadow-slate-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
                            <Wallet className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-bold">Saldo Saat Ini</h2>
                            <p className="text-slate-100 text-xs">Ringkasan kas pemasukan dan pengeluaran</p>
                        </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                        <p className="text-2xl md:text-3xl font-bold">{loading ? 'Memuat...' : formatCurrency(financeSummary.balance)}</p>
                        <p className="text-sm text-slate-100 mt-1 font-medium">
                            {loading
                                ? 'Menghitung ringkasan kas...'
                                : `Masuk ${formatCurrency(financeSummary.total_income)} | Keluar ${formatCurrency(financeSummary.total_expense)}`}
                        </p>
                    </div>
                </div>
            )}

            {!isFinance && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
                        <h2 className="text-xl font-bold mb-1">Monitoring Perangkat</h2>
                        <p className="text-sm text-purple-100">Status perangkat PPPoE real-time</p>
                        <div className="mt-4 flex items-end gap-2">
                            <span className="text-4xl font-bold">{loading ? '...' : (stats.online_customers || 0)}</span>
                            <span className="text-xl text-purple-200">/ {loading ? '...' : (stats.total_customers || 0)}</span>
                        </div>
                        <p className="text-sm mt-1">Status: <span className="font-semibold">Live</span></p>
                        <a href="/monitoring" className="inline-flex mt-4 bg-white text-purple-600 hover:bg-purple-50 px-4 py-2 rounded-lg font-semibold text-sm">
                            Lihat Monitoring
                        </a>
                    </div>

                    <div className="bg-gradient-to-br from-red-600 to-orange-600 rounded-2xl p-6 text-white">
                        <h2 className="text-xl font-bold mb-1">Perangkat Isolir</h2>
                        <p className="text-sm text-red-100">Terbatas karena lewat jatuh tempo</p>
                        <div className="mt-4 flex items-end gap-2">
                            <span className="text-4xl font-bold">{isolatedCountLoading ? '...' : isolatedCount}</span>
                            <span className="text-sm text-red-200">perangkat</span>
                        </div>
                        <p className="text-sm mt-1">Status: <span className="font-semibold">{isolatedCount > 0 ? 'Warning' : 'Normal'}</span></p>
                        <a href="/isolir" className="inline-flex mt-4 bg-white text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-semibold text-sm">
                            Lihat Detail
                        </a>
                    </div>
                </div>
            )}

            <div className={`grid grid-cols-2 ${isFinance ? 'lg:grid-cols-3' : isTeknisi ? 'lg:grid-cols-4' : 'lg:grid-cols-6'} gap-4`}>
                {!isFinance && (
                    <div className="bg-blue-600 rounded-2xl p-5 text-white">
                        <p className="text-sm text-blue-100">Total Pelanggan</p>
                        <p className="text-3xl font-bold mt-1">{loading ? '...' : totalCustomerCount}</p>
                    </div>
                )}
                {!isFinance && (
                    <div className="bg-emerald-600 rounded-2xl p-5 text-white">
                        <p className="text-sm text-emerald-100">Pelanggan Aktif</p>
                        <p className="text-3xl font-bold mt-1">{loading ? '...' : activeCustomerCount}</p>
                        <p className="text-xs text-emerald-100 mt-1">Di luar pelanggan lewat jatuh tempo atau isolir</p>
                    </div>
                )}
                {!isTeknisi && (
                    <div className="bg-violet-600 rounded-2xl p-5 text-white">
                        <p className="text-sm text-violet-100">Pendapatan Bulan Ini</p>
                        <p className="text-2xl font-bold mt-1">{loading ? '...' : `Rp ${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.monthly_revenue || 0)}`}</p>
                    </div>
                )}
                {!isFinance && (
                    <div className="bg-cyan-600 rounded-2xl p-5 text-white">
                        <p className="text-sm text-cyan-100">Pemasangan Bulan Ini</p>
                        <p className="text-3xl font-bold mt-1">{loading ? '...' : monthlyInstallations}</p>
                    </div>
                )}
                {!isTeknisi && (
                    <div className="bg-orange-600 rounded-2xl p-5 text-white">
                        <p className="text-sm text-orange-100">Invoice Tertunda</p>
                        <p className="text-3xl font-bold mt-1">{loading ? '...' : (stats.pending_invoices || 0)}</p>
                    </div>
                )}
                {!isFinance && (
                    <div className="bg-pink-600 rounded-2xl p-5 text-white">
                        <p className="text-sm text-pink-100">Aduan Aktif</p>
                        <p className="text-3xl font-bold mt-1">{loading ? '...' : (stats.total_active_complaints || 0)}</p>
                    </div>
                )}
            </div>

            {!isTeknisi && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Pemasukan vs Pengeluaran</h2>
                                <p className="text-sm text-gray-500">Semua pemasukan termasuk pemasangan dan pembayaran, dibandingkan dengan pengeluaran</p>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <span className="flex items-center gap-2 text-gray-600"><span className="w-3 h-3 bg-emerald-500 rounded-full"></span>Pemasukan</span>
                                <span className="flex items-center gap-2 text-gray-600"><span className="w-3 h-3 bg-red-500 rounded-full"></span>Pengeluaran</span>
                            </div>
                        </div>
                        <div className="h-[300px]">
                            <Bar data={financeChartData} options={financeChartOptions} />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-gray-900">Status Pelanggan</h2>
                            <p className="text-sm text-gray-500">Distribusi aktif dan tidak aktif (lewat jatuh tempo atau isolir)</p>
                        </div>
                        <div className="h-[200px] relative">
                            <Doughnut data={customerStatusData} options={doughnutOptions} />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-gray-900">{totalCustomerCount}</p>
                                    <p className="text-xs text-gray-500">Total</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-center gap-6 mt-6">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                                <span className="text-sm text-gray-600">Aktif ({activeCustomerCount})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                <span className="text-sm text-gray-600">Tidak Aktif ({inactiveCustomerCount})</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!isTeknisi && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Persentase Paket Layanan</h2>
                            <p className="text-sm text-gray-500">Perbandingan paket pada seluruh pelanggan dan pelanggan aktif saja</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {[
                            {
                                key: 'total',
                                title: 'Total Pelanggan',
                                subtitle: 'Distribusi paket dari seluruh pelanggan',
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
                                subtitle: 'Distribusi paket dari pelanggan aktif saja',
                                totalLabel: 'Total pelanggan aktif dengan paket',
                                totalValue: activePackageDistributionTotal,
                                items: activePackageDistribution,
                                data: activePackageDistributionData,
                                options: activePackageDoughnutOptions,
                                emptyText: 'Belum ada pelanggan aktif dengan paket.',
                            },
                        ].map((card) => (
                            <div key={card.key} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5">
                                <div className="flex items-center justify-between gap-3 mb-5">
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">{card.title}</h3>
                                        <p className="text-sm text-gray-500">{card.subtitle}</p>
                                    </div>
                                    <div className="text-sm text-gray-600 text-right">
                                        {card.totalLabel}: <span className="font-semibold text-gray-900">{card.totalValue}</span>
                                    </div>
                                </div>

                                {card.items.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-gray-500">
                                        {card.emptyText}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-5">
                                        <div className="h-[280px] relative bg-white rounded-xl border border-gray-100">
                                            <Doughnut data={card.data} options={card.options} />
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="text-center">
                                                    <p className="text-3xl font-bold text-gray-900">{card.items.length}</p>
                                                    <p className="text-xs text-gray-500">Jenis Paket</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {card.items.map((item, index) => {
                                                const color = packagePalette[index % packagePalette.length];
                                                return (
                                                    <div key={`${card.key}-${item.label}-${index}`} className="rounded-xl border border-gray-100 bg-white p-4">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }}></span>
                                                                <div className="min-w-0">
                                                                    <p className="font-semibold text-gray-900 truncate">{item.label}</p>
                                                                    <p className="text-xs text-gray-500">{item.count} pelanggan</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-sm font-semibold text-gray-900">{formatPercent(item.percentage)}</span>
                                                        </div>
                                                        <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full"
                                                                style={{ width: `${Math.min(100, Number(item.percentage || 0))}%`, backgroundColor: color }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!isFinance ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Pemasangan Baru</h2>
                                <p className="text-sm text-gray-500">Statistik aktivasi per bulan</p>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></span>
                                <span className="text-gray-600">Pelanggan Baru</span>
                            </div>
                        </div>
                        <div className="h-[280px]">
                            <Bar data={installationChartData} options={barChartOptions} />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Zap size={20} className="text-yellow-400" />
                                Aksi Cepat
                            </h2>
                            <p className="text-sm text-gray-400 mt-1">Pintasan menu utama</p>
                        </div>
                        <div className="space-y-3">
                            {quickActions.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <a
                                        key={item.href}
                                        href={item.href}
                                        className="flex items-center gap-3 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition group"
                                    >
                                        <div className={`${item.color} p-2 rounded-lg group-hover:scale-110 transition`}>
                                            <Icon size={18} />
                                        </div>
                                        <div>
                                            <p className="font-medium">{item.label}</p>
                                            <p className="text-xs text-gray-400">{item.desc}</p>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
                    <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                        <Zap size={20} className="text-yellow-400" />
                        Aksi Cepat Keuangan
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <a href="/penagihan" className="flex items-center gap-3 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition">
                            <DollarSign size={18} className="text-violet-300" />
                            <span>Kelola Tagihan</span>
                        </a>
                        <a href="/pengeluaran" className="flex items-center gap-3 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition">
                            <FileText size={18} className="text-emerald-300" />
                            <span>Catat Pengeluaran</span>
                        </a>
                    </div>
                </div>
            )}

            {!isTeknisi && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-gray-900">Transaksi Keuangan Terintegrasi</h2>
                        <p className="text-sm text-gray-500">Pemasukan, pengeluaran, payroll, dan adjustment dalam satu ledger</p>
                    </div>

                    {transactionsLoading ? (
                        <p className="text-sm text-gray-500">Memuat transaksi...</p>
                    ) : transactions.length === 0 ? (
                        <p className="text-sm text-gray-500">Belum ada transaksi.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[800px]">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="text-left px-3 py-2">Tanggal</th>
                                        <th className="text-left px-3 py-2">Jenis</th>
                                        <th className="text-left px-3 py-2">Sumber</th>
                                        <th className="text-left px-3 py-2">Deskripsi</th>
                                        <th className="text-right px-3 py-2">Nominal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.slice(0, 5).map((item) => {
                                        const amount = Number(item.amount || 0);
                                        const isIncome = item.type === 'income';
                                        return (
                                            <tr key={item.id} className="border-t border-gray-100">
                                                <td className="px-3 py-2 text-gray-600">{item.transaction_date || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{item.type || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{item.source || '-'}</td>
                                                <td className="px-3 py-2 text-gray-800">{item.description || '-'}</td>
                                                <td className={`px-3 py-2 text-right font-semibold ${isIncome ? 'text-emerald-700' : 'text-red-700'}`}>
                                                    {isIncome ? '+' : '-'}{formatCurrency(amount)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <Modal
                isOpen={showAdjustModal}
                onClose={() => setShowAdjustModal(false)}
                title="Penyesuaian Saldo"
            >
                <form onSubmit={handleAdjustBalance} className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        Gunakan nilai positif untuk menambah saldo dan nilai negatif untuk mengurangi saldo.
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                        <input
                            type="text"
                            value={adjustForm.description}
                            onChange={(e) => setAdjustForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (+/-)</label>
                        <input
                            type="number"
                            value={adjustForm.amount}
                            onChange={(e) => setAdjustForm((prev) => ({ ...prev, amount: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Transaksi</label>
                        <input
                            type="date"
                            value={adjustForm.transaction_date}
                            onChange={(e) => setAdjustForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowAdjustModal(false)}>
                            Batal
                        </Button>
                        <Button type="submit" variant="primary" disabled={adjustSubmitting}>
                            {adjustSubmitting ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={showManualIncomeModal}
                onClose={() => setShowManualIncomeModal(false)}
                title="Tambah Pemasukan Manual"
            >
                <form onSubmit={handleManualIncome} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sumber</label>
                        <select
                            value={manualIncomeForm.source}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, source: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="manual">Manual</option>
                            <option value="pemasangan">Pemasangan</option>
                            <option value="pembayaran">Pembayaran</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                        <input
                            type="text"
                            value={manualIncomeForm.description}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
                        <input
                            type="number"
                            value={manualIncomeForm.amount}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, amount: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                        <input
                            type="date"
                            value={manualIncomeForm.transaction_date}
                            onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowManualIncomeModal(false)}>
                            Batal
                        </Button>
                        <Button type="submit" variant="primary" disabled={manualIncomeSubmitting}>
                            {manualIncomeSubmitting ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default Dashboard;

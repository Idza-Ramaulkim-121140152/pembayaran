import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    Brain,
    Calendar,
    FileText,
    MessageSquare,
    Receipt,
    TrendingDown,
    TrendingUp,
    Users,
    Wallet,
} from 'lucide-react';
import Alert from '../components/common/Alert';
import apiClient from '../services/api';

const DEFAULT_STATS = {
    total_customers: 0,
    active_customers: 0,
    inactive_customers: 0,
    overdue_customers: 0,
    isolated_customers: 0,
    online_customers: 0,
    monthly_revenue: 0,
    monthly_expense: 0,
    monthly_net: 0,
    pending_invoices: 0,
    total_active_complaints: 0,
    monthly_finance: {
        current_month: {
            label: '',
            income: 0,
            expense: 0,
            adjustment: 0,
            net: 0,
        },
        previous_month: {
            label: '',
            income: 0,
            expense: 0,
            adjustment: 0,
            net: 0,
        },
        ratio_income_to_expense: null,
        comparison: {
            income_change_percentage: 0,
            expense_change_percentage: 0,
            net_change_percentage: 0,
        },
    },
};

function Dashboard() {
    const userRole = window.appUserRole || 'admin';
    const isTeknisi = userRole === 'teknisi';
    const isFinance = userRole === 'finance';

    const [stats, setStats] = useState(DEFAULT_STATS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardStats = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/dashboard');
            const payload = response.data?.data || {};
            setStats((prev) => ({
                ...prev,
                ...payload,
                monthly_finance: {
                    ...prev.monthly_finance,
                    ...(payload.monthly_finance || {}),
                },
            }));
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat ringkasan dashboard.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardStats();
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(Number(amount || 0));
    };

    const formatPercent = (value) => {
        const numeric = Number(value || 0);
        const prefix = numeric > 0 ? '+' : '';
        return `${prefix}${numeric.toFixed(1)}%`;
    };

    const monthlyFinance = stats?.monthly_finance || DEFAULT_STATS.monthly_finance;
    const currentMonth = monthlyFinance.current_month || DEFAULT_STATS.monthly_finance.current_month;
    const previousMonth = monthlyFinance.previous_month || DEFAULT_STATS.monthly_finance.previous_month;
    const financeComparison = monthlyFinance.comparison || DEFAULT_STATS.monthly_finance.comparison;

    const incomeValue = Number(currentMonth.income ?? stats.monthly_revenue ?? 0);
    const expenseValue = Number(currentMonth.expense ?? stats.monthly_expense ?? 0);
    const currentNet = Number(currentMonth.net ?? stats.monthly_net ?? (incomeValue - expenseValue));

    const chartBase = Math.max(incomeValue, expenseValue, 1);
    const incomeBarWidth = Math.max(8, Math.round((incomeValue / chartBase) * 100));
    const expenseBarWidth = Math.max(8, Math.round((expenseValue / chartBase) * 100));

    const shortcuts = useMemo(() => {
        const items = [];

        if (!isTeknisi) {
            items.push({ label: 'Penagihan', href: '/penagihan', icon: FileText, desc: 'Kelola invoice pelanggan' });
            items.push({ label: 'Pengeluaran', href: '/pengeluaran', icon: Receipt, desc: 'Catat biaya operasional' });
            items.push({ label: 'Mutasi', href: '/mutasi', icon: Wallet, desc: 'Monitor arus kas' });
            items.push({ label: 'Prediksi', href: '/dashboard/prediksi', icon: Brain, desc: 'Analisa KPI dan proyeksi' });
        }

        if (!isFinance) {
            items.push({ label: 'Pelanggan', href: '/customers', icon: Users, desc: 'Data pelanggan aktif' });
            items.push({ label: 'Monitoring', href: '/monitoring', icon: Activity, desc: 'Status jaringan real-time' });
            items.push({ label: 'Aduan', href: '/complaints', icon: MessageSquare, desc: 'Tindak lanjuti komplain' });
        }

        return items;
    }, [isFinance, isTeknisi]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard Ringkasan</h1>
                    <p className="text-gray-500 mt-1 flex items-center gap-2">
                        <Calendar size={16} />
                        {new Date().toLocaleDateString('id-ID', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        })}
                    </p>
                </div>
            </div>

            {error && (
                <Alert
                    type="error"
                    title="Error"
                    message={error}
                    onClose={() => setError(null)}
                />
            )}

            {loading && (
                <Alert
                    type="info"
                    title="Memuat Dashboard"
                    message="Mengambil ringkasan terbaru pelanggan dan keuangan..."
                />
            )}

            <div className={`grid grid-cols-1 ${isTeknisi ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'} gap-4`}>
                {!isFinance && (
                    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white">
                        <p className="text-sm text-blue-100">Total Pelanggan</p>
                        <p className="text-3xl font-bold mt-2">{loading ? '...' : Number(stats.total_customers || 0)}</p>
                    </div>
                )}

                {!isFinance && (
                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white">
                        <p className="text-sm text-emerald-100">Pelanggan Aktif</p>
                        <p className="text-3xl font-bold mt-2">{loading ? '...' : Number(stats.active_customers || 0)}</p>
                    </div>
                )}

                {!isTeknisi && (
                    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-white">
                        <p className="text-sm text-violet-100">Pemasukan Bulan Ini</p>
                        <p className="text-2xl font-bold mt-2">{loading ? '...' : formatCurrency(incomeValue)}</p>
                        <p className="text-xs text-violet-100 mt-1">{currentMonth.label || '-'}</p>
                    </div>
                )}

                {!isTeknisi && (
                    <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-500 to-red-600 p-5 text-white">
                        <p className="text-sm text-rose-100">Pengeluaran Bulan Ini</p>
                        <p className="text-2xl font-bold mt-2">{loading ? '...' : formatCurrency(expenseValue)}</p>
                        <p className="text-xs text-rose-100 mt-1">{currentMonth.label || '-'}</p>
                    </div>
                )}

                {!isTeknisi && (
                    <div className={`rounded-2xl border p-5 ${currentNet >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-600">Selisih Bulan Ini</p>
                            {currentNet >= 0 ? <TrendingUp size={18} className="text-emerald-600" /> : <TrendingDown size={18} className="text-red-600" />}
                        </div>
                        <p className={`text-2xl font-bold mt-2 ${currentNet >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {loading ? '...' : formatCurrency(currentNet)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Net = pemasukan - pengeluaran (+/- penyesuaian)</p>
                    </div>
                )}

                {!isTeknisi && (
                    <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-orange-700">Invoice Tertunda</p>
                            <AlertCircle size={18} className="text-orange-600" />
                        </div>
                        <p className="text-3xl font-bold text-orange-800 mt-2">{loading ? '...' : Number(stats.pending_invoices || 0)}</p>
                    </div>
                )}

                {!isFinance && (
                    <div className="rounded-2xl border border-pink-100 bg-pink-50 p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-pink-700">Aduan Aktif</p>
                            <MessageSquare size={18} className="text-pink-600" />
                        </div>
                        <p className="text-3xl font-bold text-pink-800 mt-2">{loading ? '...' : Number(stats.total_active_complaints || 0)}</p>
                    </div>
                )}
            </div>

            {!isTeknisi && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Perbandingan Pemasukan vs Pengeluaran</h2>
                            <p className="text-sm text-gray-500">Fokus bulan berjalan: {currentMonth.label || '-'}</p>
                        </div>
                        <div className="text-sm text-gray-600">
                            Rasio pemasukan/pengeluaran:{' '}
                            <span className="font-semibold text-gray-900">
                                {monthlyFinance.ratio_income_to_expense === null
                                    ? '-'
                                    : `${Number(monthlyFinance.ratio_income_to_expense || 0).toFixed(2)}x`}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-700 font-medium">Pemasukan</span>
                                <span className="font-semibold text-emerald-700">{formatCurrency(incomeValue)}</span>
                            </div>
                            <div className="h-3 rounded-full bg-emerald-100 overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${incomeBarWidth}%` }} />
                            </div>
                            <p className={`text-xs mt-1 inline-flex items-center gap-1 ${Number(financeComparison.income_change_percentage || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                {Number(financeComparison.income_change_percentage || 0) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {formatPercent(financeComparison.income_change_percentage)} vs {previousMonth.label || 'bulan lalu'}
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-700 font-medium">Pengeluaran</span>
                                <span className="font-semibold text-rose-700">{formatCurrency(expenseValue)}</span>
                            </div>
                            <div className="h-3 rounded-full bg-rose-100 overflow-hidden">
                                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${expenseBarWidth}%` }} />
                            </div>
                            <p className={`text-xs mt-1 inline-flex items-center gap-1 ${Number(financeComparison.expense_change_percentage || 0) <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {Number(financeComparison.expense_change_percentage || 0) <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                                {formatPercent(financeComparison.expense_change_percentage)} vs {previousMonth.label || 'bulan lalu'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">Pemasukan Bulan Lalu</p>
                            <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(previousMonth.income || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">Pengeluaran Bulan Lalu</p>
                            <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(previousMonth.expense || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">Net Bulan Lalu</p>
                            <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(previousMonth.net || 0)}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Shortcut Cepat</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {shortcuts.map((item) => {
                        const Icon = item.icon;
                        return (
                            <a
                                key={item.href}
                                href={item.href}
                                className="rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 p-4 transition"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                                        <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                                    </div>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;

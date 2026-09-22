import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    Brain,
    Calendar,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    DollarSign,
    Filter,
    RefreshCw,
    Search,
    Sparkles,
    TrendingDown,
    TrendingUp,
    Wallet,
    Wifi,
    Wrench,
    Users,
    Building2,
    Package,
    Zap
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LinearScale,
    LineElement,
    PointElement,
    Title,
    Tooltip
} from 'chart.js';
import LoadingSpinner from '../components/common/LoadingSpinner';
import apiClient from '../services/api';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatRupiah(val, compact) {
    const n = Math.round(Number(val) || 0);
    if (compact) {
        if (Math.abs(n) >= 1000000000) return 'Rp ' + (n / 1000000000).toFixed(1) + 'M';
        if (Math.abs(n) >= 1000000)    return 'Rp ' + (n / 1000000).toFixed(1) + 'Jt';
        if (Math.abs(n) >= 1000)       return 'Rp ' + (n / 1000).toFixed(0) + 'rb';
    }
    return 'Rp ' + n.toLocaleString('id-ID');
}

function pct(part, total) {
    if (!total) return 0;
    return Math.min(100, Math.round((part / total) * 100));
}

function shortDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function monthLabel(ym) {
    if (!ym) return '';
    const parts = ym.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return names[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
}

function prevMonth(ym) {
    const parts = ym.split('-').map(Number);
    if (parts[1] === 1) return (parts[0] - 1) + '-12';
    return parts[0] + '-' + String(parts[1] - 1).padStart(2, '0');
}

function nextMonth(ym) {
    const parts = ym.split('-').map(Number);
    if (parts[1] === 12) return (parts[0] + 1) + '-01';
    return parts[0] + '-' + String(parts[1] + 1).padStart(2, '0');
}

function todayYM() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, iconColor, label, value, sub, subColor, compact }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <Icon size={14} className={iconColor} />
                {label}
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                {formatRupiah(value, compact)}
            </div>
            {sub && (
                <div className={'text-xs ' + (subColor || 'text-gray-500 dark:text-gray-400')}>{sub}</div>
            )}
        </div>
    );
}

function CategoryBar({ label, icon: Icon, iconBg, amount, total, color }) {
    const pctVal = pct(amount, total);
    return (
        <div className="flex items-center gap-3">
            <div className={'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ' + iconBg}>
                <Icon size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-600 dark:text-gray-400 truncate">{label}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 ml-2 flex-shrink-0">
                        {formatRupiah(amount, true)}
                    </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                        className={color + ' h-1.5 rounded-full transition-all duration-500'}
                        style={{ width: pctVal + '%' }}
                    />
                </div>
            </div>
        </div>
    );
}

function ForecastCard({ card }) {
    const conf = card.confidence || 0;
    const confColor = conf >= 80 ? 'text-green-600' : conf >= 60 ? 'text-yellow-600' : 'text-red-500';
    const bgColor   = conf >= 80
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
        : conf >= 60
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700';
    return (
        <div className={'flex-shrink-0 w-28 rounded-xl border p-3 text-center ' + bgColor}>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">{card.day_name}</div>
            <div className="text-xs text-gray-400 mb-1">{shortDate(card.date)}</div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">
                {formatRupiah(card.predicted_revenue, true)}
            </div>
            <div className={'text-xs font-medium ' + confColor}>{conf}% conf.</div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardPredictionPage() {
    const [selectedMonth, setSelectedMonth] = useState(todayYM());
    const [data, setData]     = useState(null);
    const [txData, setTxData] = useState(null);
    const [loading, setLoading]     = useState(true);
    const [txLoading, setTxLoading] = useState(false);
    const [error, setError]   = useState(null);
    const [txFilter, setTxFilter]   = useState('all');
    const [txKeyword, setTxKeyword] = useState('');
    const [txPage, setTxPage]       = useState(1);
    const [showTxHistory, setShowTxHistory] = useState(false);
    const abortRef = useRef(null);

    const loadData = useCallback(async (month) => {
        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get('/dashboard/cashflow-daily', {
                params: { month },
                signal: ctrl.signal,
            });
            setData(res.data);
        } catch (e) {
            if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') {
                setError((e.response && e.response.data && e.response.data.message) || 'Gagal memuat data cashflow.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(selectedMonth); }, [selectedMonth, loadData]);

    const loadTx = useCallback(async () => {
        setTxLoading(true);
        try {
            const parts = selectedMonth.split('-');
            const startDate = parts[0] + '-' + parts[1] + '-01';
            const lastDay   = new Date(parseInt(parts[0]), parseInt(parts[1]), 0).getDate();
            const endDate   = parts[0] + '-' + parts[1] + '-' + lastDay;
            const params = { start_date: startDate, end_date: endDate, per_page: 30, page: txPage };
            if (txFilter !== 'all') params.type = txFilter;
            if (txKeyword.trim()) params.keyword = txKeyword.trim();
            const res = await apiClient.get('/finance/transactions', { params });
            setTxData(res.data);
        } catch (_) {
            setTxData(null);
        } finally {
            setTxLoading(false);
        }
    }, [selectedMonth, txFilter, txKeyword, txPage]);

    useEffect(() => { if (showTxHistory) loadTx(); }, [showTxHistory, loadTx]);

    const dailyChartData = useMemo(() => {
        if (!data || !data.daily_series) return null;
        const labels   = data.daily_series.map(function(d) { return shortDate(d.date); });
        const income   = data.daily_series.map(function(d) { return d.is_future ? null : (d.income || 0); });
        const expense  = data.daily_series.map(function(d) { return d.is_future ? null : (d.expense || 0); });
        const forecast = data.daily_series.map(function(d) { return d.is_future ? (d.forecast_income || 0) : null; });
        return {
            labels,
            datasets: [
                {
                    label: 'Pemasukan',
                    data: income,
                    backgroundColor: data.daily_series.map(function(d) {
                        return d.is_today ? 'rgba(16,185,129,0.95)' : 'rgba(16,185,129,0.55)';
                    }),
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 2,
                },
                {
                    label: 'Pengeluaran',
                    data: expense,
                    backgroundColor: data.daily_series.map(function(d) {
                        return d.is_today ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.45)';
                    }),
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 2,
                },
                {
                    label: 'Prediksi AI',
                    data: forecast,
                    backgroundColor: 'rgba(99,102,241,0.35)',
                    borderColor: 'rgba(99,102,241,0.7)',
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false,
                    order: 1,
                },
            ],
        };
    }, [data]);

    const dailyChartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label: function(ctx) { return ctx.dataset.label + ': ' + formatRupiah(ctx.raw); },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: function(v) { return formatRupiah(v, true); }, font: { size: 10 } },
            },
        },
    }), []);

    const trendChartData = useMemo(() => {
        if (!data || !data.six_month_trend) return null;
        return {
            labels:  data.six_month_trend.map(function(t) { return t.month; }),
            datasets: [
                {
                    label: 'Pemasukan',
                    data: data.six_month_trend.map(function(t) { return t.income; }),
                    backgroundColor: 'rgba(16,185,129,0.7)',
                    borderRadius: 5,
                    borderSkipped: false,
                },
                {
                    label: 'Pengeluaran',
                    data: data.six_month_trend.map(function(t) { return t.expense; }),
                    backgroundColor: 'rgba(239,68,68,0.6)',
                    borderRadius: 5,
                    borderSkipped: false,
                },
            ],
        };
    }, [data]);

    const trendChartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
                callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + formatRupiah(ctx.raw); } },
            },
        },
        scales: {
            x: { grid: { display: false } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: function(v) { return formatRupiah(v, true); }, font: { size: 10 } },
            },
        },
    }), []);

    const today     = (data && data.today)     || {};
    const yesterday = (data && data.yesterday) || {};
    const mi        = (data && data.monthly_income)  || {};
    const me        = (data && data.monthly_expense) || {};
    const net       = (data && data.monthly_net != null) ? data.monthly_net : 0;
    const loans     = (data && data.loans_outstanding != null) ? data.loans_outstanding : 0;
    const isCurrentMonth = data ? data.is_current_month : true;
    const incomeVsYesterday = (today.income_total || 0) - (yesterday.income_total || 0);
    const marginPct = mi.total > 0 ? Math.round((net / mi.total) * 100) : 0;
    const expPct    = mi.total > 0 ? Math.round(((me.total || 0) / mi.total) * 100) : 0;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
                        <Brain size={22} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                            Financial Cashflow Intelligence
                        </h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Prediksi &amp; proyeksi keuangan berbasis AI
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={function() { setSelectedMonth(prevMonth(selectedMonth)); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 min-w-[110px] text-center">
                        {monthLabel(selectedMonth)}
                    </div>
                    <button onClick={function() { setSelectedMonth(nextMonth(selectedMonth)); }}
                        disabled={selectedMonth >= todayYM()}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30">
                        <ChevronRight size={16} />
                    </button>
                    {selectedMonth !== todayYM() && (
                        <button onClick={function() { setSelectedMonth(todayYM()); }}
                            className="text-xs px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium">
                            Bulan Ini
                        </button>
                    )}
                    <button onClick={function() { loadData(selectedMonth); }} disabled={loading}
                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300">
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-red-600 dark:text-red-400 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-20"><LoadingSpinner /></div>
            ) : !data ? null : (
                <>
                    {/* Today Snapshot */}
                    {isCurrentMonth && (
                        <div>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                Snapshot Hari Ini
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <KpiCard icon={TrendingUp} iconColor="text-emerald-500" label="Pemasukan Hari Ini"
                                    value={today.income_total} compact
                                    sub={incomeVsYesterday >= 0
                                        ? ('+ Rp ' + Math.abs(incomeVsYesterday).toLocaleString('id-ID') + ' vs kemarin')
                                        : ('- Rp ' + Math.abs(incomeVsYesterday).toLocaleString('id-ID') + ' vs kemarin')}
                                    subColor={incomeVsYesterday >= 0 ? 'text-emerald-600' : 'text-red-500'} />
                                <KpiCard icon={TrendingDown} iconColor="text-red-500" label="Pengeluaran Hari Ini"
                                    value={today.expense_total} compact
                                    sub={'Kemarin: ' + formatRupiah(yesterday.expense_total, true)} />
                                <KpiCard icon={Activity} iconColor={today.net >= 0 ? 'text-emerald-500' : 'text-red-500'}
                                    label="Net Hari Ini" value={today.net} compact
                                    sub={today.net >= 0 ? 'Cashflow positif ✓' : 'Cashflow negatif ⚠'}
                                    subColor={today.net >= 0 ? 'text-emerald-600' : 'text-red-500'} />
                                <KpiCard icon={CreditCard} iconColor="text-orange-500" label="Pinjaman Outstanding"
                                    value={loans} compact
                                    sub={loans > 0 ? 'Total hutang aktif' : 'Tidak ada hutang 🎉'}
                                    subColor={loans > 0 ? 'text-orange-600' : 'text-emerald-600'} />
                            </div>
                        </div>
                    )}

                    {/* Daily Chart */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="mb-4">
                            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <BarChart3 size={16} className="text-indigo-500" />
                                Pendapatan Harian
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Histori harian bulan ini + 7 hari prediksi AI (ungu)
                            </p>
                        </div>
                        <div className="h-56">
                            {dailyChartData
                                ? <Bar data={dailyChartData} options={dailyChartOptions} />
                                : <div className="flex items-center justify-center h-full text-gray-400 text-sm">Tidak ada data</div>}
                        </div>
                    </div>

                    {/* Monthly Breakdown */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <ArrowUpRight size={16} className="text-emerald-500" />
                                    Pemasukan {monthLabel(selectedMonth)}
                                </h2>
                                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatRupiah(mi.total, true)}
                                </span>
                            </div>
                            <div className="space-y-3">
                                <CategoryBar label="Tagihan Pelanggan (Invoice)" icon={DollarSign}
                                    iconBg="bg-emerald-500" amount={mi.invoice} total={mi.total || 1} color="bg-emerald-400" />
                                <CategoryBar label="Biaya Pemasangan Baru" icon={Zap}
                                    iconBg="bg-teal-500" amount={mi.installation} total={mi.total || 1} color="bg-teal-400" />
                                {(mi.manual > 0) && <CategoryBar label="Pemasukan Manual" icon={Wallet}
                                    iconBg="bg-cyan-500" amount={mi.manual} total={mi.total || 1} color="bg-cyan-400" />}
                                {(mi.other > 0) && <CategoryBar label="Lainnya" icon={Activity}
                                    iconBg="bg-gray-400" amount={mi.other} total={mi.total || 1} color="bg-gray-300" />}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <ArrowDownRight size={16} className="text-red-500" />
                                    Pengeluaran {monthLabel(selectedMonth)}
                                </h2>
                                <span className="text-base font-bold text-red-600 dark:text-red-400">
                                    {formatRupiah(me.total, true)}
                                </span>
                            </div>
                            <div className="space-y-3">
                                <CategoryBar label="Bandwidth ISP" icon={Wifi}
                                    iconBg="bg-blue-500" amount={me.bandwidth} total={me.total || 1} color="bg-blue-400" />
                                <CategoryBar label="Gaji Karyawan" icon={Users}
                                    iconBg="bg-purple-500" amount={me.gaji} total={me.total || 1} color="bg-purple-400" />
                                <CategoryBar label="Cicilan Pinjaman" icon={Building2}
                                    iconBg="bg-orange-500" amount={me.pinjaman} total={me.total || 1} color="bg-orange-400" />
                                <CategoryBar label="Belanja Alat & Ops" icon={Wrench}
                                    iconBg="bg-rose-500" amount={me.alat} total={me.total || 1} color="bg-rose-400" />
                                {(me.other > 0) && <CategoryBar label="Pengeluaran Lainnya" icon={Package}
                                    iconBg="bg-gray-400" amount={me.other} total={me.total || 1} color="bg-gray-300" />}
                            </div>
                        </div>
                    </div>

                    {/* Net Cashflow Bar */}
                    <div className={'rounded-xl p-5 shadow-sm border ' + (net >= 0
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700')}>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div>
                                <h2 className={'text-sm font-bold flex items-center gap-2 ' + (net >= 0
                                    ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300')}>
                                    {net >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                                    Net Cashflow {monthLabel(selectedMonth)}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Pemasukan: {formatRupiah(mi.total, true)} &nbsp;·&nbsp; Pengeluaran: {formatRupiah(me.total, true)}
                                </p>
                            </div>
                            <div className={'text-2xl font-bold ' + (net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                                {net >= 0 ? '+' : ''}{formatRupiah(net)}
                            </div>
                        </div>
                        <div className="w-full bg-white/60 dark:bg-gray-700/60 rounded-full h-3 overflow-hidden">
                            <div
                                className={'h-3 rounded-full transition-all duration-700 ' + (net >= 0 ? 'bg-emerald-500' : 'bg-red-500')}
                                style={{ width: Math.max(2, Math.min(100, pct(me.total || 0, mi.total || 1))) + '%' }}
                            />
                        </div>
                        <div className="flex justify-between text-xs mt-1 text-gray-500 dark:text-gray-400">
                            <span>Margin: {marginPct}%</span>
                            <span>Pengeluaran: {expPct}% dari pemasukan</span>
                        </div>
                    </div>

                    {/* AI Forecast Cards */}
                    {isCurrentMonth && data.forecast_cards && data.forecast_cards.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-4">
                                <Sparkles size={16} className="text-indigo-500" />
                                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                    Prediksi AI — 7 Hari ke Depan
                                </h2>
                                <span className="text-xs text-gray-400 ml-auto">Berbasis pola historis</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {data.forecast_cards.map(function(card) {
                                    return <ForecastCard key={card.date} card={card} />;
                                })}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 flex items-center gap-1">
                                <AlertTriangle size={10} />
                                Prediksi berdasarkan pola historis. Nilai aktual bisa berbeda.
                            </p>
                        </div>
                    )}

                    {/* 6-Month Trend */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <Activity size={16} className="text-indigo-500" />
                            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                Tren Cashflow 6 Bulan
                            </h2>
                        </div>
                        <div className="h-48">
                            {trendChartData
                                ? <Bar data={trendChartData} options={trendChartOptions} />
                                : <div className="flex items-center justify-center h-full text-gray-400 text-sm">Tidak ada data</div>}
                        </div>
                        {data.six_month_trend && data.six_month_trend.length > 0 && (
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-400">
                                            <th className="text-left py-1 font-medium">Bulan</th>
                                            <th className="text-right py-1 font-medium text-emerald-600">Pemasukan</th>
                                            <th className="text-right py-1 font-medium text-red-500">Pengeluaran</th>
                                            <th className="text-right py-1 font-medium">Net</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.six_month_trend.map(function(t) {
                                            return (
                                                <tr key={t.month_key} className="border-t border-gray-100 dark:border-gray-700">
                                                    <td className="py-1.5 text-gray-600 dark:text-gray-400">{t.month}</td>
                                                    <td className="py-1.5 text-right text-emerald-600 dark:text-emerald-400 font-medium">{formatRupiah(t.income, true)}</td>
                                                    <td className="py-1.5 text-right text-red-500 dark:text-red-400">{formatRupiah(t.expense, true)}</td>
                                                    <td className={'py-1.5 text-right font-bold ' + (t.net >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                                        {t.net >= 0 ? '+' : ''}{formatRupiah(t.net, true)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Transaction History */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <button
                            onClick={function() { setShowTxHistory(function(v) { return !v; }); setTxPage(1); }}
                            className="w-full flex items-center justify-between p-4 text-left">
                            <div className="flex items-center gap-2">
                                <Filter size={15} className="text-gray-500" />
                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Histori Transaksi</span>
                            </div>
                            <ChevronRight size={16} className={'text-gray-400 transition-transform ' + (showTxHistory ? 'rotate-90' : '')} />
                        </button>

                        {showTxHistory && (
                            <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex flex-wrap gap-2 mt-3 mb-3">
                                    {['all', 'income', 'expense'].map(function(f) {
                                        return (
                                            <button key={f}
                                                onClick={function() { setTxFilter(f); setTxPage(1); }}
                                                className={'px-3 py-1 rounded-full text-xs font-medium transition-colors ' + (txFilter === f
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300')}>
                                                {f === 'all' ? 'Semua' : f === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                                            </button>
                                        );
                                    })}
                                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1 flex-1 min-w-[140px] max-w-xs">
                                        <Search size={12} className="text-gray-400 flex-shrink-0" />
                                        <input type="text" placeholder="Cari transaksi..."
                                            value={txKeyword}
                                            onChange={function(e) { setTxKeyword(e.target.value); setTxPage(1); }}
                                            className="bg-transparent text-xs outline-none w-full text-gray-700 dark:text-gray-300" />
                                    </div>
                                    <button onClick={function() { loadTx(); }} disabled={txLoading}
                                        className="px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 text-xs">
                                        <RefreshCw size={11} className={txLoading ? 'animate-spin' : ''} />
                                    </button>
                                </div>

                                {txData && txData.summary && (
                                    <div className="flex gap-4 text-xs mb-3 p-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
                                        <span className="text-emerald-600 font-medium">Pemasukan: {formatRupiah(txData.summary.income, true)}</span>
                                        <span className="text-red-500 font-medium">Pengeluaran: {formatRupiah(txData.summary.expense, true)}</span>
                                        <span className={'font-bold ' + (txData.summary.net >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                            Net: {txData.summary.net >= 0 ? '+' : ''}{formatRupiah(txData.summary.net, true)}
                                        </span>
                                    </div>
                                )}

                                {txLoading ? (
                                    <div className="flex justify-center py-6"><LoadingSpinner /></div>
                                ) : txData && txData.data && txData.data.data && txData.data.data.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                                    <th className="text-left py-2 font-medium">Tanggal</th>
                                                    <th className="text-left py-2 font-medium">Keterangan</th>
                                                    <th className="text-left py-2 font-medium">Kategori</th>
                                                    <th className="text-right py-2 font-medium">Nominal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {txData.data.data.map(function(tx) {
                                                    return (
                                                        <tr key={tx.id} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                            <td className="py-1.5 text-gray-500 whitespace-nowrap">{shortDate(tx.transaction_date)}</td>
                                                            <td className="py-1.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{tx.description}</td>
                                                            <td className="py-1.5">
                                                                <span className={'px-1.5 py-0.5 rounded text-xs ' + (tx.type === 'income'
                                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                                    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400')}>
                                                                    {tx.category || tx.source}
                                                                </span>
                                                            </td>
                                                            <td className={'py-1.5 text-right font-semibold ' + (tx.type === 'income' ? 'text-emerald-600' : 'text-red-500')}>
                                                                {tx.type === 'income' ? '+' : '-'}{formatRupiah(tx.amount, true)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {txData.data.last_page > 1 && (
                                            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                                                <span>Hal {txData.data.current_page} / {txData.data.last_page}</span>
                                                <div className="flex gap-1">
                                                    <button onClick={function() { setTxPage(function(p) { return Math.max(1, p - 1); }); }}
                                                        disabled={txData.data.current_page <= 1}
                                                        className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-30">
                                                        <ChevronLeft size={12} />
                                                    </button>
                                                    <button onClick={function() { setTxPage(function(p) { return p + 1; }); }}
                                                        disabled={txData.data.current_page >= txData.data.last_page}
                                                        className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-30">
                                                        <ChevronRight size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-sm text-gray-400">Tidak ada transaksi ditemukan.</div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

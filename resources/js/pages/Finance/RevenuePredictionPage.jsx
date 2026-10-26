import { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    Calendar,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    DollarSign,
    Filter,
    HelpCircle,
    Info,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Users,
    Zap,
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
    Tooltip,
} from 'chart.js';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import revenuePredictionService from '../../services/revenuePredictionService';

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

function formatCurrency(val, compact = false) {
    const num = Math.round(Number(val) || 0);
    if (compact) {
        if (Math.abs(num) >= 1_000_000_000) return 'Rp ' + (num / 1_000_000_000).toFixed(1) + 'M';
        if (Math.abs(num) >= 1_000_000) return 'Rp ' + (num / 1_000_000).toFixed(1) + 'Jt';
        if (Math.abs(num) >= 1_000) return 'Rp ' + (num / 1_000).toFixed(0) + 'rb';
        return 'Rp ' + num;
    }
    return 'Rp ' + num.toLocaleString('id-ID');
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '-';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        return dateStr;
    } catch {
        return dateStr;
    }
}

function getCurrentMonthString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function RevenuePredictionPage() {
    const [month, setMonth] = useState(getCurrentMonthString());
    const [rangeMode, setRangeMode] = useState('month'); // 'month' or 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recalculating, setRecalculating] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filter list pelanggan
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSegment, setFilterSegment] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [sortBy, setSortBy] = useState('estimated_date'); // 'estimated_date', 'amount_desc', 'name'
    const [showInfoModal, setShowInfoModal] = useState(false);

    const fetchData = async (forceRecalculate = false) => {
        try {
            if (forceRecalculate) {
                setRecalculating(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const params = {};
            if (rangeMode === 'custom' && customStartDate && customEndDate) {
                params.start_date = customStartDate;
                params.end_date = customEndDate;
            } else {
                params.month = month;
            }

            let response;
            if (forceRecalculate) {
                response = await revenuePredictionService.recalculate(params);
                setSuccessMessage(response.data?.message || 'Model prediksi berhasil disinkronisasi ulang.');
                setTimeout(() => setSuccessMessage(null), 4000);
            } else {
                response = await revenuePredictionService.get(params);
            }

            if (response.data?.success) {
                setData(response.data.data);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data prediksi pendapatan.');
        } finally {
            setLoading(false);
            setRecalculating(false);
        }
    };

    useEffect(() => {
        fetchData(false);
    }, [month, rangeMode]);

    const handleApplyCustomRange = (e) => {
        e.preventDefault();
        if (!customStartDate || !customEndDate) {
            setError('Pilih tanggal mulai dan tanggal selesai terlebih dahulu.');
            return;
        }
        fetchData(false);
    };

    const handlePrevMonth = () => {
        const [y, m] = month.split('-').map(Number);
        const prev = new Date(y, m - 2, 1);
        const newY = prev.getFullYear();
        const newM = String(prev.getMonth() + 1).padStart(2, '0');
        setMonth(`${newY}-${newM}`);
    };

    const handleNextMonth = () => {
        const [y, m] = month.split('-').map(Number);
        const next = new Date(y, m, 1);
        const newY = next.getFullYear();
        const newM = String(next.getMonth() + 1).padStart(2, '0');
        setMonth(`${newY}-${newM}`);
    };

    const handleCurrentMonth = () => {
        setMonth(getCurrentMonthString());
        setRangeMode('month');
    };

    // Filter dan sort breakdown pelanggan
    const filteredCustomers = useMemo(() => {
        if (!data?.customer_breakdown) return [];

        return data.customer_breakdown.filter((item) => {
            const matchesSearch =
                !searchQuery ||
                item.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.pppoe_username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.phone?.includes(searchQuery);

            const matchesSegment = filterSegment === 'all' || item.behavior_segment === filterSegment;
            const matchesStatus = filterStatus === 'all' || item.status === filterStatus;

            return matchesSearch && matchesSegment && matchesStatus;
        }).sort((a, b) => {
            if (sortBy === 'amount_desc') {
                return (b.amount || 0) - (a.amount || 0);
            }
            if (sortBy === 'name') {
                return a.customer_name.localeCompare(b.customer_name);
            }
            // default 'estimated_date'
            return (a.estimated_payment_date || '').localeCompare(b.estimated_payment_date || '');
        });
    }, [data?.customer_breakdown, searchQuery, filterSegment, filterStatus, sortBy]);

    // Data grafik gabungan (Bar Realisasi & Prediksi + Line Akumulasi)
    const chartConfig = useMemo(() => {
        if (!data?.chart_data || data.chart_data.length === 0) return null;

        const labels = data.chart_data.map((c) => c.label);
        const actualData = data.chart_data.map((c) => c.actual);
        const predictedData = data.chart_data.map((c) => c.predicted);
        const cumulativeProjectedData = data.chart_data.map((c) => c.cumulative_projected);

        return {
            data: {
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Garis Tren Akumulasi Target',
                        data: cumulativeProjectedData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        yAxisID: 'y1',
                        tension: 0.3,
                        order: 1,
                    },
                    {
                        type: 'bar',
                        label: 'Realisasi Pemasukan (Lunas)',
                        data: actualData,
                        backgroundColor: '#10b981', // emerald-500
                        borderRadius: 6,
                        stack: 'daily',
                        yAxisID: 'y',
                        order: 2,
                    },
                    {
                        type: 'bar',
                        label: 'Prediksi Pendapatan AI (Akan Masuk)',
                        data: predictedData,
                        backgroundColor: '#8b5cf6', // purple-500
                        borderRadius: 6,
                        stack: 'daily',
                        yAxisID: 'y',
                        order: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 8,
                            font: { size: 12, weight: '500' },
                            padding: 16,
                        },
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        cornerRadius: 10,
                        callbacks: {
                            label: function (ctx) {
                                if (ctx.dataset.yAxisID === 'y1') {
                                    return ` Akumulasi Target: ${formatCurrency(ctx.raw)}`;
                                }
                                return ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`;
                            },
                            afterBody: function (items) {
                                const dayTotal = items.reduce((sum, item) => {
                                    if (item.dataset.yAxisID !== 'y1') {
                                        return sum + (Number(item.raw) || 0);
                                    }
                                    return sum;
                                }, 0);
                                return `\nTotal Tanggal Ini: ${formatCurrency(dayTotal)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 16 },
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(243, 244, 246, 1)' },
                        ticks: {
                            font: { size: 10 },
                            callback: (v) => formatCurrency(v, true),
                        },
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { display: false },
                        ticks: {
                            font: { size: 10 },
                            callback: (v) => formatCurrency(v, true),
                        },
                    },
                },
            },
        };
    }, [data?.chart_data]);

    const summary = data?.summary || {};
    const meta = data?.meta || {};

    const monthLabel = useMemo(() => {
        try {
            const [y, m] = month.split('-').map(Number);
            const d = new Date(y, m - 1, 1);
            return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        } catch {
            return month;
        }
    }, [month]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header & Title */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
                                <TrendingUp size={22} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold text-gray-900">Prediksi Pendapatan</h1>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                        <Sparkles size={12} /> Model Pintar AI
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Perhitungan proyeksi pemasukan berbasis tanggal jatuh tempo dan pola ketepatan bayar pelanggan
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Actions & Range Switcher */}
                    <div className="flex flex-wrap items-center gap-2">
                        {rangeMode === 'month' ? (
                            <div className="inline-flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200">
                                <button
                                    type="button"
                                    onClick={handlePrevMonth}
                                    className="p-1.5 rounded-lg hover:bg-white text-gray-600 hover:text-gray-900 transition"
                                    title="Bulan Sebelumnya"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="px-3 text-sm font-semibold text-gray-800 min-w-[130px] text-center">
                                    {monthLabel}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNextMonth}
                                    className="p-1.5 rounded-lg hover:bg-white text-gray-600 hover:text-gray-900 transition"
                                    title="Bulan Berikutnya"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        ) : null}

                        <button
                            type="button"
                            onClick={handleCurrentMonth}
                            className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${
                                rangeMode === 'month' && month === getCurrentMonthString()
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            Bulan Ini
                        </button>

                        <button
                            type="button"
                            onClick={() => setRangeMode(rangeMode === 'month' ? 'custom' : 'month')}
                            className="px-3 py-2 rounded-xl text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition inline-flex items-center gap-1.5"
                        >
                            <Calendar size={14} />
                            {rangeMode === 'month' ? 'Rentang Tanggal' : 'Pilih Bulan'}
                        </button>

                        <button
                            type="button"
                            onClick={() => fetchData(true)}
                            disabled={recalculating || loading}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition inline-flex items-center gap-1.5 disabled:opacity-50"
                            title="Hitung ulang profiling kepatuhan dan proyeksi"
                        >
                            <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
                            {recalculating ? 'Menghitung...' : 'Perbarui Model'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowInfoModal(true)}
                            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                            title="Cara Kerja Model Prediksi"
                        >
                            <HelpCircle size={18} />
                        </button>
                    </div>
                </div>

                {/* Custom Date Range Picker form */}
                {rangeMode === 'custom' && (
                    <form onSubmit={handleApplyCustomRange} className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-600">Dari:</label>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500"
                                required
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-600">Sampai:</label>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
                        >
                            Terapkan Rentang
                        </button>
                    </form>
                )}
            </div>

            {/* Notification alert */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {successMessage && <Alert type="success" message={successMessage} onClose={() => setSuccessMessage(null)} />}

            {loading ? (
                <div className="py-24 flex flex-col items-center justify-center space-y-3">
                    <LoadingSpinner />
                    <p className="text-sm text-gray-500">Menganalisis histori tagihan dan memproses model prediksi...</p>
                </div>
            ) : (
                <>
                    {/* 4 Kartu KPI Ringkasan */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* KPI 1: Total Ekspektasi Pendapatan */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Total Ekspektasi Pendapatan
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                                    <Sparkles size={18} />
                                </div>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-2xl font-bold text-gray-900">
                                    {formatCurrency(summary.total_expected_revenue)}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                    <span>Potensi Penuh: {formatCurrency(summary.potential_total_revenue)}</span>
                                </p>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                                <span>Total Pelanggan Siklus Ini</span>
                                <span className="font-semibold text-gray-900">{summary.total_customers || 0} Pelanggan</span>
                            </div>
                        </div>

                        {/* KPI 2: Realisasi Pemasukan (Lunas) */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                                    Pemasukan Masuk (Lunas)
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <CheckCircle2 size={18} />
                                </div>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-2xl font-bold text-emerald-600">
                                    {formatCurrency(summary.realized_revenue)}
                                </h3>
                                <div className="w-full bg-gray-100 h-2 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, summary.realization_rate || 0)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                                <span>Tercapai {summary.realization_rate || 0}%</span>
                                <span className="font-semibold text-emerald-700">{summary.paid_customers || 0} Lunas</span>
                            </div>
                        </div>

                        {/* KPI 3: Sisa Proyeksi Akan Masuk */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">
                                    Prediksi Akan Masuk
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                                    <Clock size={18} />
                                </div>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-2xl font-bold text-purple-600">
                                    {formatCurrency(summary.predicted_remaining_revenue)}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Estimasi dari {summary.pending_customers || 0} tagihan berjalan
                                </p>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                                <span>Menunggu Pembayaran</span>
                                <span className="font-semibold text-purple-700">{summary.pending_customers || 0} Pelanggan</span>
                            </div>
                        </div>

                        {/* KPI 4: Skor Pola Pelanggan */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                                    Profil Kepatuhan
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <ShieldCheck size={18} />
                                </div>
                            </div>
                            <div className="mt-3 space-y-1.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 flex items-center gap-1">
                                        <Zap size={13} className="text-emerald-500" /> Bayar Cepat
                                    </span>
                                    <span className="font-bold text-gray-900">{summary.segments_count?.early_payer || 0} Org</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 flex items-center gap-1">
                                        <CheckCircle2 size={13} className="text-blue-500" /> Tepat Waktu
                                    </span>
                                    <span className="font-bold text-gray-900">{summary.segments_count?.ontime_payer || 0} Org</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 flex items-center gap-1">
                                        <Clock size={13} className="text-amber-500" /> Toleransi / Telat
                                    </span>
                                    <span className="font-bold text-gray-900">
                                        {(summary.segments_count?.grace_payer || 0) + (summary.segments_count?.late_payer || 0)} Org
                                    </span>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400">
                                Diperbarui: {meta.calculated_at ? new Date(meta.calculated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </div>
                        </div>
                    </div>

                    {/* Grafik Interaktif Pemasukan Harian vs Prediksi */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                            <div>
                                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <TrendingUp size={18} className="text-purple-600" />
                                    Grafik Arus Pemasukan Tagihan (Harian & Akumulasi)
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Perbandingan uang riil yang sudah masuk (hijau) vs prediksi AI tanggal uang masuk berikutnya (ungu)
                                </p>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Realisasi
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Prediksi AI
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 bg-amber-500 inline-block" /> Akumulasi Target
                                </span>
                            </div>
                        </div>

                        <div className="h-80 w-full">
                            {chartConfig ? (
                                <Bar data={chartConfig.data} options={chartConfig.options} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                                    Tidak ada data untuk grafik pada periode ini.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Breakdown & Tabel Pelanggan */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-gray-100">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Users size={18} className="text-blue-600" />
                                        Rincian Tagihan & Pola Pembayaran Pelanggan
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Menampilkan {filteredCustomers.length} dari {data?.customer_breakdown?.length || 0} pelanggan pada siklus ini
                                    </p>
                                </div>

                                {/* Filters */}
                                <div className="flex flex-wrap items-center gap-2.5">
                                    {/* Search */}
                                    <div className="relative min-w-[200px]">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Cari nama, pppoe, no wa..."
                                            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>

                                    {/* Filter Status */}
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="text-xs py-1.5 px-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="all">Semua Status</option>
                                        <option value="paid">Sudah Lunas</option>
                                        <option value="pending">Menunggu Bayar</option>
                                    </select>

                                    {/* Filter Segmen */}
                                    <select
                                        value={filterSegment}
                                        onChange={(e) => setFilterSegment(e.target.value)}
                                        className="text-xs py-1.5 px-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="all">Semua Pola Bayar</option>
                                        <option value="early_payer">Bayar Cepat</option>
                                        <option value="ontime_payer">Tepat Waktu</option>
                                        <option value="grace_payer">Toleransi (1-3 Hari)</option>
                                        <option value="late_payer">Sering Terlambat</option>
                                        <option value="new_customer">Pelanggan Baru</option>
                                    </select>

                                    {/* Sort By */}
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="text-xs py-1.5 px-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="estimated_date">Urutkan: Tanggal Bayar</option>
                                        <option value="amount_desc">Urutkan: Tagihan Terbesar</option>
                                        <option value="name">Urutkan: Nama Pelanggan</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Tabel Data */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-700">
                                <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500 border-b border-gray-100">
                                    <tr>
                                        <th className="px-5 py-3.5">Pelanggan</th>
                                        <th className="px-4 py-3.5">Paket & Tagihan</th>
                                        <th className="px-4 py-3.5">Jatuh Tempo</th>
                                        <th className="px-4 py-3.5">Estimasi Tanggal Masuk</th>
                                        <th className="px-4 py-3.5">Pola Historis</th>
                                        <th className="px-4 py-3.5 text-center">Akurasi / Probabilitas</th>
                                        <th className="px-5 py-3.5 text-right">Status Periode Ini</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredCustomers.length > 0 ? (
                                        filteredCustomers.map((c) => (
                                            <tr key={c.customer_id} className="hover:bg-gray-50/80 transition">
                                                <td className="px-5 py-3.5">
                                                    <div className="font-semibold text-gray-900">{c.customer_name}</div>
                                                    <div className="text-xs text-gray-500 font-mono">
                                                        {c.pppoe_username || c.phone || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="font-medium text-gray-900">{formatCurrency(c.amount)}</div>
                                                    <div className="text-xs text-gray-500">{c.package_name}</div>
                                                </td>
                                                <td className="px-4 py-3.5 text-xs text-gray-700">
                                                    {formatDateDisplay(c.due_date)}
                                                </td>
                                                <td className="px-4 py-3.5 text-xs">
                                                    <span className={`font-semibold ${
                                                        c.status === 'paid' ? 'text-emerald-700' : 'text-purple-700'
                                                    }`}>
                                                        {formatDateDisplay(c.estimated_payment_date)}
                                                    </span>
                                                    {c.is_early && (
                                                        <span className="block text-[10px] text-emerald-600 font-medium">
                                                            (Lebih awal dari jatuh tempo)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                                                        c.behavior_badge?.bg || 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {c.behavior_badge?.label || 'Tepat Waktu'}
                                                    </span>
                                                    <div className="text-[11px] text-gray-400 mt-0.5">
                                                        {c.avg_delta_days < 0
                                                            ? `Rata-rata bayar ${Math.abs(c.avg_delta_days).toFixed(0)} hari lebih awal`
                                                            : c.avg_delta_days > 0
                                                            ? `Rata-rata bayar +${c.avg_delta_days.toFixed(0)} hari`
                                                            : 'Rata-rata tepat tanggal jatuh tempo'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800">
                                                        {Math.round(c.payment_probability * 100)}%
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-right">
                                                    {c.status === 'paid' ? (
                                                        <div>
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                <CheckCircle2 size={12} /> Sudah Lunas
                                                            </span>
                                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                                {c.paid_at ? new Date(c.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                                                <Clock size={12} /> Menunggu
                                                            </span>
                                                            <div className="text-[11px] text-purple-600 font-semibold mt-0.5">
                                                                Exp: {formatCurrency(c.expected_amount)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                                                Tidak ada pelanggan yang sesuai dengan filter.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Modal Info Penjelasan Model Cerdas */}
            {showInfoModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowInfoModal(false)}
                >
                    <div
                        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <Sparkles size={18} className="text-purple-600" />
                                Cara Kerja Model Prediksi Pendapatan
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowInfoModal(false)}
                                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
                            <p>
                                <strong>1. Titik Jangkar Jatuh Tempo Pelanggan:</strong><br />
                                Setiap pelanggan aktif memiliki tanggal jatuh tempo bulanan. Sistem memetakan tagihan bulanan pelanggan yang jatuh tempo pada rentang waktu yang dipilih.
                            </p>
                            <p>
                                <strong>2. Analisis Perilaku Pembayaran Historis:</strong><br />
                                Sistem menganalisa seluruh riwayat pembayaran pelanggan di masa lalu dengan membandingkan waktu aktual bayar (<code className="text-purple-700">paid_at</code>) terhadap tanggal jatuh tempo (<code className="text-purple-700">due_date</code>).
                            </p>
                            <p>
                                <strong>3. Prediksi Pelanggan Bayar Lebih Cepat:</strong><br />
                                Jika pelanggan memiliki riwayat konsisten bayar 2–3 hari sebelum jatuh tempo, maka estimasi uang masuk dimajukan sesuai kebiasaannya.
                            </p>
                            <p>
                                <strong>4. Eksklusi Biaya Pelanggan Baru:</strong><br />
                                Hanya pembayaran tagihan bulanan rutin yang dimasukkan ke model prediksi. Biaya pemasangan atau registrasi pelanggan baru secara ketat dikecualikan.
                            </p>
                            <p>
                                <strong>5. Penyimpanan Konsisten:</strong><br />
                                Hasil profiling dan proyeksi disimpan ke database sehingga tampilan konsisten dan cepat saat diakses kembali.
                            </p>
                        </div>

                        <div className="pt-3 border-t border-gray-100 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowInfoModal(false)}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition"
                            >
                                Mengerti
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RevenuePredictionPage;

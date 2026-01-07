import { useEffect, useState } from 'react';
import { 
    Users, DollarSign, TrendingUp, AlertCircle, Plus, FileText, Settings,
    ArrowUpRight, ArrowDownRight, Wallet, Activity, Calendar, Zap, MessageSquare
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
    Filler
} from 'chart.js';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Alert from '../components/common/Alert';
import apiClient from '../services/api';

// Register ChartJS components
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

function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [monthLabels, setMonthLabels] = useState([]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await apiClient.get('/dashboard');
                const data = response.data.data;
                setStats(data);

                // Generate month labels (6 bulan terakhir)
                const now = new Date();
                const labels = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }));
                }
                setMonthLabels(labels);
            } catch (err) {
                setError('Gagal memuat dashboard');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner text="Memuat dashboard..." />
            </div>
        );
    }

    // Generate 6 months revenue data dari API
    const revenueChartData = {
        labels: monthLabels,
        datasets: [
            {
                label: 'Pemasukan',
                data: stats?.revenue_by_month || [0, 0, 0, 0, 0, 0],
                borderColor: '#8b5cf6',
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
                    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
                    return gradient;
                },
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#fff',
                pointBorderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#8b5cf6',
                pointHoverBorderWidth: 3,
            }
        ]
    };

    // Generate new installations by month data dari API
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
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: 12,
                borderSkipped: false,
            }
        ]
    };

    // Customer status doughnut chart
    const customerStatusData = {
        labels: ['Aktif', 'Nonaktif'],
        datasets: [
            {
                data: [stats?.active_customers || 0, (stats?.total_customers || 0) - (stats?.active_customers || 0)],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.9)',
                    'rgba(239, 68, 68, 0.9)',
                ],
                borderColor: ['#fff', '#fff'],
                borderWidth: 4,
                hoverOffset: 10,
            }
        ]
    };

    const revenueChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 16,
                cornerRadius: 12,
                displayColors: false,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                callbacks: {
                    title: (items) => items[0].label,
                    label: (context) => 'Rp ' + context.raw.toLocaleString('id-ID'),
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { 
                    color: '#9ca3af',
                    font: { size: 12, weight: '500' }
                }
            },
            y: {
                beginAtZero: true,
                grid: { 
                    color: 'rgba(156, 163, 175, 0.1)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#9ca3af',
                    font: { size: 11 },
                    callback: (value) => {
                        if (value >= 1000000) return (value / 1000000).toFixed(1) + 'jt';
                        if (value >= 1000) return (value / 1000).toFixed(0) + 'rb';
                        return value;
                    }
                }
            }
        },
        interaction: {
            intersect: false,
            mode: 'index',
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
                padding: 16,
                cornerRadius: 12,
                displayColors: false,
                callbacks: {
                    label: (context) => context.raw + ' pelanggan baru',
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { 
                    color: '#9ca3af',
                    font: { size: 12, weight: '500' }
                }
            },
            y: {
                beginAtZero: true,
                grid: { 
                    color: 'rgba(156, 163, 175, 0.1)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#9ca3af',
                    font: { size: 11 },
                    stepSize: 1,
                }
            }
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
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                    label: (context) => context.label + ': ' + context.raw + ' pelanggan',
                }
            }
        },
    };

    // Calculate percentage change (mock for now)
    const getPercentageChange = () => {
        const revenueData = stats?.revenue_by_month || [];
        if (revenueData.length >= 2) {
            const current = revenueData[revenueData.length - 1] || 0;
            const previous = revenueData[revenueData.length - 2] || 1;
            return ((current - previous) / previous * 100).toFixed(1);
        }
        return 0;
    };

    const percentageChange = getPercentageChange();
    const isPositive = percentageChange >= 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-500 mt-1 flex items-center gap-2">
                        <Calendar size={16} />
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
                <div className="flex gap-3">
                    <a
                        href="/customers/create"
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl transition font-medium shadow-lg shadow-blue-500/25"
                    >
                        <Plus size={18} />
                        Aktivasi Baru
                    </a>
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

            {/* Fast Menu - Monitoring */}
            {stats && (
                <div className="bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 rounded-2xl p-6 md:p-8 text-white shadow-2xl shadow-purple-500/30 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
                    
                    <div className="relative">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl md:text-3xl font-bold">Monitoring Perangkat</h2>
                                        <p className="text-purple-100 text-sm mt-1">Status perangkat PPPoE real-time</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-6 mt-6">
                                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex-1">
                                        <p className="text-purple-100 text-sm font-medium mb-2">Perangkat Online</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl md:text-5xl font-bold">{stats.online_customers || 0}</span>
                                            <span className="text-2xl text-purple-200">/ {stats.total_customers || 0}</span>
                                        </div>
                                        <div className="mt-3 w-full bg-white/20 rounded-full h-2">
                                            <div 
                                                className="bg-white h-2 rounded-full transition-all duration-500" 
                                                style={{ width: `${stats.total_customers > 0 ? ((stats.online_customers / stats.total_customers) * 100) : 0}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                                        <p className="text-purple-100 text-sm font-medium mb-2">Status</p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                            <span className="text-lg font-semibold">Live</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex-shrink-0">
                                <a
                                    href="/monitoring"
                                    className="flex items-center justify-center gap-3 bg-white text-purple-600 hover:bg-purple-50 px-8 py-4 rounded-xl transition font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 duration-200"
                                >
                                    <span className="text-lg">Lihat Monitoring</span>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                                    </svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                    {/* Total Customers */}
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-blue-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                    <Users size={22} />
                                </div>
                            </div>
                            <p className="text-blue-100 text-sm font-medium">Total Pelanggan</p>
                            <p className="text-3xl md:text-4xl font-bold mt-1">
                                {stats.total_customers || 0}
                            </p>
                        </div>
                    </div>

                    {/* Active Customers */}
                    <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-emerald-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                    <Activity size={22} />
                                </div>
                            </div>
                            <p className="text-emerald-100 text-sm font-medium">Pelanggan Aktif</p>
                            <p className="text-3xl md:text-4xl font-bold mt-1">
                                {stats.active_customers || 0}
                            </p>
                        </div>
                    </div>

                    {/* Monthly Revenue */}
                    <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-violet-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative">
                            <div className="flex items-center justify-between mb-3">
                                <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                    <Wallet size={22} />
                                </div>
                                <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${isPositive ? 'bg-white/20' : 'bg-red-400/30'}`}>
                                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(percentageChange)}%
                                </span>
                            </div>
                            <p className="text-violet-100 text-sm font-medium">Pendapatan Bulan Ini</p>
                            <p className="text-2xl md:text-3xl font-bold mt-1">
                                Rp {new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.monthly_revenue || 0)}
                            </p>
                        </div>
                    </div>

                    {/* Pending Invoices */}
                    <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-orange-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                    <AlertCircle size={22} />
                                </div>
                            </div>
                            <p className="text-orange-100 text-sm font-medium">Invoice Tertunda</p>
                            <p className="text-3xl md:text-4xl font-bold mt-1">
                                {stats.pending_invoices || 0}
                            </p>
                        </div>
                    </div>

                    {/* Active Complaints */}
                    <a 
                        href="/complaints"
                        className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-pink-500/30 relative overflow-hidden hover:from-pink-600 hover:to-rose-700 transition-all"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                    <MessageSquare size={22} />
                                </div>
                            </div>
                            <p className="text-pink-100 text-sm font-medium">Aduan Aktif</p>
                            <p className="text-3xl md:text-4xl font-bold mt-1">
                                {stats.total_active_complaints || 0}
                            </p>
                            {stats.pending_complaints > 0 && (
                                <p className="text-pink-200 text-xs mt-1">
                                    {stats.pending_complaints} menunggu ditangani
                                </p>
                            )}
                        </div>
                    </a>
                </div>
            )}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Chart - Takes 2 columns */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Tren Pemasukan</h2>
                            <p className="text-sm text-gray-500">6 bulan terakhir</p>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="w-3 h-3 bg-violet-500 rounded-full"></span>
                            <span className="text-gray-600">Pemasukan</span>
                        </div>
                    </div>
                    <div className="h-[300px]">
                        <Line data={revenueChartData} options={revenueChartOptions} />
                    </div>
                </div>

                {/* Customer Status Doughnut */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-gray-900">Status Pelanggan</h2>
                        <p className="text-sm text-gray-500">Distribusi aktif/nonaktif</p>
                    </div>
                    <div className="h-[200px] relative">
                        <Doughnut data={customerStatusData} options={doughnutOptions} />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-3xl font-bold text-gray-900">{stats?.total_customers || 0}</p>
                                <p className="text-xs text-gray-500">Total</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-center gap-6 mt-6">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                            <span className="text-sm text-gray-600">Aktif ({stats?.active_customers || 0})</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                            <span className="text-sm text-gray-600">Nonaktif ({(stats?.total_customers || 0) - (stats?.active_customers || 0)})</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Installation Chart & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Installation Bar Chart */}
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

                {/* Quick Actions */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Zap size={20} className="text-yellow-400" />
                            Aksi Cepat
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">Pintasan menu utama</p>
                    </div>
                    <div className="space-y-3">
                        <a
                            href="/customers/create"
                            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                        >
                            <div className="bg-blue-500 p-2 rounded-lg group-hover:scale-110 transition">
                                <Plus size={18} />
                            </div>
                            <div>
                                <p className="font-medium">Aktivasi Pelanggan</p>
                                <p className="text-xs text-gray-400">Tambah pelanggan baru</p>
                            </div>
                        </a>
                        <a
                            href="/pengeluaran/create"
                            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                        >
                            <div className="bg-emerald-500 p-2 rounded-lg group-hover:scale-110 transition">
                                <FileText size={18} />
                            </div>
                            <div>
                                <p className="font-medium">Catat Pengeluaran</p>
                                <p className="text-xs text-gray-400">Input pengeluaran baru</p>
                            </div>
                        </a>
                        <a
                            href="/billing"
                            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                        >
                            <div className="bg-violet-500 p-2 rounded-lg group-hover:scale-110 transition">
                                <DollarSign size={18} />
                            </div>
                            <div>
                                <p className="font-medium">Kelola Tagihan</p>
                                <p className="text-xs text-gray-400">Lihat & kelola invoice</p>
                            </div>
                        </a>
                        <a
                            href="/odp"
                            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                        >
                            <div className="bg-orange-500 p-2 rounded-lg group-hover:scale-110 transition">
                                <Settings size={18} />
                            </div>
                            <div>
                                <p className="font-medium">Kelola ODP</p>
                                <p className="text-xs text-gray-400">Pengaturan titik distribusi</p>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;

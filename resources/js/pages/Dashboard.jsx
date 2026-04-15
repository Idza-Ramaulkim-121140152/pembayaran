import { useEffect, useState } from 'react';
import { 
    Users, DollarSign, TrendingUp, AlertCircle, Plus, FileText, Settings,
    ArrowUpRight, ArrowDownRight, Wallet, Activity, Calendar, Zap, MessageSquare, AlertTriangle, Edit2, Trash2, Brain, Target, RefreshCw
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
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';

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

function formatDateInputLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMonthInputLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function getCurrentMonthValue() {
    return formatMonthInputLocal(new Date());
}

function getMonthRangeFromMonthValue(monthValue) {
    const [yearString, monthString] = String(monthValue || '').split('-');
    const year = Number(yearString);
    const month = Number(monthString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        const fallback = new Date();
        return {
            start_date: formatDateInputLocal(new Date(fallback.getFullYear(), fallback.getMonth(), 1)),
            end_date: formatDateInputLocal(new Date(fallback.getFullYear(), fallback.getMonth() + 1, 0)),
        };
    }

    return {
        start_date: formatDateInputLocal(new Date(year, month - 1, 1)),
        end_date: formatDateInputLocal(new Date(year, month, 0)),
    };
}

function formatMonthLabel(monthValue) {
    const [yearString, monthString] = String(monthValue || '').split('-');
    const year = Number(yearString);
    const month = Number(monthString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return '-';
    }

    return new Date(year, month - 1, 1).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
    });
}

function getDefaultForecastRange() {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);

    return {
        start_date: formatDateInputLocal(today),
        end_date: formatDateInputLocal(end),
    };
}

function getDefaultKpiRange() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);

    return {
        start_date: formatDateInputLocal(start),
        end_date: formatDateInputLocal(today),
    };
}

function getDefaultFinancialProjectionRange() {
    return getMonthRangeFromMonthValue(getCurrentMonthValue());
}

function Dashboard() {
    const userRole = window.appUserRole || 'admin';
    const canEditMutations = !!window.appCanEditMutations;
    const isTeknisi = userRole === 'teknisi';
    const isFinance = userRole === 'finance';
    const isSuperAdmin = userRole === 'superadmin';
    const canViewBalance = !isTeknisi;
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [monthLabels, setMonthLabels] = useState([]);
    const [isolatedCount, setIsolatedCount] = useState(0);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustSubmitting, setAdjustSubmitting] = useState(false);
    const [adjustForm, setAdjustForm] = useState({
        description: '',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
    });
    const [showManualIncomeModal, setShowManualIncomeModal] = useState(false);
    const [manualIncomeSubmitting, setManualIncomeSubmitting] = useState(false);
    const [manualIncomeForm, setManualIncomeForm] = useState({
        source: 'manual',
        description: '',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
    });
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [editTransactionModal, setEditTransactionModal] = useState({ open: false, item: null });
    const [editTransactionSubmitting, setEditTransactionSubmitting] = useState(false);
    const [editTransactionForm, setEditTransactionForm] = useState({
        description: '',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
    });
    const [kpiRange, setKpiRange] = useState(getDefaultKpiRange());
    const [kpiData, setKpiData] = useState(null);
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpiError, setKpiError] = useState(null);
    const [forecastRange, setForecastRange] = useState(getDefaultForecastRange());
    const [forecastData, setForecastData] = useState(null);
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastError, setForecastError] = useState(null);
    const [financialProjectionMonth, setFinancialProjectionMonth] = useState(getCurrentMonthValue());
    const [financialProjectionRange, setFinancialProjectionRange] = useState(getDefaultFinancialProjectionRange());
    const [financialProjectionData, setFinancialProjectionData] = useState(null);
    const [financialProjectionLoading, setFinancialProjectionLoading] = useState(false);
    const [financialProjectionError, setFinancialProjectionError] = useState(null);
    const [financialTargets, setFinancialTargets] = useState([]);
    const [financialTargetsLoading, setFinancialTargetsLoading] = useState(false);
    const [mandatoryActionLoadingKey, setMandatoryActionLoadingKey] = useState(null);
    const [targetSubmitting, setTargetSubmitting] = useState(false);
    const [targetModal, setTargetModal] = useState({ open: false, mode: 'create', item: null });
    const [targetForm, setTargetForm] = useState({
        type: 'mandatory_expense',
        name: '',
        description: '',
        amount: '',
        target_date: '',
        start_date: '',
        end_date: '',
        monthly_day: String(new Date().getDate()),
        is_recurring_monthly: false,
        recurrence_until: '',
        recurrence_forever: false,
        is_active: true,
        priority: 100,
    });

    const fetchManagementKpis = async (range = kpiRange) => {
        try {
            setKpiLoading(true);
            setKpiError(null);

            const response = await apiClient.get('/dashboard/management-kpis', {
                params: {
                    start_date: range.start_date,
                    end_date: range.end_date,
                },
            });

            setKpiData(response.data?.data || null);
        } catch (err) {
            setKpiError(err.response?.data?.message || 'Gagal memuat KPI manajemen.');
        } finally {
            setKpiLoading(false);
        }
    };

    const fetchRevenueForecast = async (range = forecastRange) => {
        try {
            setForecastLoading(true);
            setForecastError(null);

            const response = await apiClient.get('/dashboard/revenue-forecast', {
                params: {
                    start_date: range.start_date,
                    end_date: range.end_date,
                },
            });

            setForecastData(response.data?.data || null);
        } catch (err) {
            setForecastError(err.response?.data?.message || 'Gagal memuat prediksi pendapatan.');
        } finally {
            setForecastLoading(false);
        }
    };

    const fetchFinancialProjection = async (range = financialProjectionRange) => {
        try {
            setFinancialProjectionLoading(true);
            setFinancialProjectionError(null);

            const response = await apiClient.get('/dashboard/financial-projection', {
                params: {
                    start_date: range.start_date,
                    end_date: range.end_date,
                },
            });

            setFinancialProjectionData(response.data?.data || null);
        } catch (err) {
            setFinancialProjectionError(err.response?.data?.message || 'Gagal memuat prediksi keuangan lanjutan.');
        } finally {
            setFinancialProjectionLoading(false);
        }
    };

    const fetchFinancialTargets = async (includeInactive = false) => {
        try {
            setFinancialTargetsLoading(true);

            const response = await apiClient.get('/dashboard/financial-targets', {
                params: {
                    include_inactive: includeInactive,
                },
            });

            setFinancialTargets(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat target keuangan.');
        } finally {
            setFinancialTargetsLoading(false);
        }
    };

    const resetTargetForm = () => {
        setTargetForm({
            type: 'mandatory_expense',
            name: '',
            description: '',
            amount: '',
            target_date: '',
            start_date: '',
            end_date: '',
            monthly_day: String(new Date().getDate()),
            is_recurring_monthly: false,
            recurrence_until: '',
            recurrence_forever: false,
            is_active: true,
            priority: 100,
        });
    };

    const openCreateTargetModal = () => {
        resetTargetForm();
        setTargetModal({ open: true, mode: 'create', item: null });
    };

    const openEditTargetModal = (item) => {
        const fallbackMonthlyDay = item.end_date ? String(Number(String(item.end_date).split('-')[2] || 1)) : '';

        setTargetForm({
            type: item.type || 'mandatory_expense',
            name: item.name || '',
            description: item.description || '',
            amount: item.amount ? String(Math.round(Number(item.amount))) : '',
            target_date: item.target_date || '',
            start_date: item.start_date || '',
            end_date: item.end_date || '',
            monthly_day: item?.meta?.monthly_day ? String(item.meta.monthly_day) : fallbackMonthlyDay,
            is_recurring_monthly: !!item.is_recurring_monthly,
            recurrence_until: item.recurrence_until || '',
            recurrence_forever: !!item.recurrence_forever,
            is_active: item.is_active !== false,
            priority: item.priority || 100,
        });
        setTargetModal({ open: true, mode: 'edit', item });
    };

    const closeTargetModal = () => {
        setTargetModal({ open: false, mode: 'create', item: null });
        resetTargetForm();
    };

    const handleSaveTarget = async (event) => {
        event.preventDefault();

        const payload = {
            type: targetForm.type,
            name: targetForm.name,
            description: targetForm.description || null,
            amount: Number(targetForm.amount || 0),
            target_date: targetForm.target_date || null,
            start_date: targetForm.start_date || null,
            end_date: targetForm.end_date || null,
            monthly_day: targetForm.monthly_day ? Number(targetForm.monthly_day) : null,
            is_recurring_monthly: !!targetForm.is_recurring_monthly,
            recurrence_until: targetForm.recurrence_until || null,
            recurrence_forever: !!targetForm.recurrence_forever,
            is_active: !!targetForm.is_active,
            priority: Number(targetForm.priority || 100),
        };

        if (!payload.amount || payload.amount <= 0) {
            setError('Nominal target harus lebih dari 0.');
            return;
        }

        if (
            payload.type === 'mandatory_expense'
            && payload.is_recurring_monthly
            && payload.recurrence_forever
            && (!payload.monthly_day || payload.monthly_day < 1 || payload.monthly_day > 31)
        ) {
            setError('Tanggal setiap bulan wajib diisi (1-31) untuk mode bulanan selamanya.');
            return;
        }

        try {
            setTargetSubmitting(true);
            setError(null);

            if (targetModal.mode === 'edit' && targetModal.item) {
                await apiClient.put(`/dashboard/financial-targets/${targetModal.item.id}`, payload);
            } else {
                await apiClient.post('/dashboard/financial-targets', payload);
            }

            closeTargetModal();
            await fetchFinancialTargets(isSuperAdmin);
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            const fallback = targetModal.mode === 'edit'
                ? 'Gagal memperbarui target keuangan.'
                : 'Gagal menambah target keuangan.';
            setError(err.response?.data?.message || fallback);
        } finally {
            setTargetSubmitting(false);
        }
    };

    const handleDeleteTarget = async (item) => {
        if (!window.confirm(`Hapus target "${item.name}"?`)) return;

        try {
            await apiClient.delete(`/dashboard/financial-targets/${item.id}`);
            await fetchFinancialTargets(isSuperAdmin);
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus target keuangan.');
        }
    };

    const refreshPostMandatoryAction = async () => {
        const dashboardResponse = await apiClient.get('/dashboard');
        setStats(dashboardResponse.data?.data || null);

        const trxResponse = await apiClient.get('/finance/transactions');
        setTransactions(trxResponse.data?.data?.data || []);

        await fetchFinancialProjection(financialProjectionRange);
    };

    const handleConfirmMandatoryExecution = async (row) => {
        if (!row?.target_id || !row?.due_date) return;
        if (!window.confirm(`Konfirmasi pengeluaran wajib "${row.name}" untuk jatuh tempo ${row.due_date} sebagai terlaksana?`)) {
            return;
        }

        const actionKey = `confirm-${row.event_id}`;

        try {
            setMandatoryActionLoadingKey(actionKey);
            setError(null);

            await apiClient.post('/dashboard/financial-projection/mandatory-events/confirm', {
                target_id: Number(row.target_id),
                due_date: row.due_date,
                actual_date: formatDateInputLocal(new Date()),
                amount: Number(row.amount || 0),
            });

            await refreshPostMandatoryAction();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengonfirmasi pengeluaran wajib.');
        } finally {
            setMandatoryActionLoadingKey(null);
        }
    };

    const handleRevokeMandatoryExecution = async (row) => {
        if (!row?.target_id || !row?.due_date) return;
        if (!window.confirm(`Batalkan konfirmasi pengeluaran wajib "${row.name}" untuk jatuh tempo ${row.due_date}?`)) {
            return;
        }

        const actionKey = `revoke-${row.event_id}`;

        try {
            setMandatoryActionLoadingKey(actionKey);
            setError(null);

            await apiClient.delete('/dashboard/financial-projection/mandatory-events/confirm', {
                data: {
                    target_id: Number(row.target_id),
                    due_date: row.due_date,
                },
            });

            await refreshPostMandatoryAction();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal membatalkan konfirmasi pengeluaran wajib.');
        } finally {
            setMandatoryActionLoadingKey(null);
        }
    };

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await apiClient.get('/dashboard');
                const data = response.data.data;
                setStats(data);

                if (!isTeknisi) {
                    setTransactionsLoading(true);
                    try {
                        const trxRes = await apiClient.get('/finance/transactions');
                        const trxData = trxRes.data?.data?.data || [];
                        setTransactions(trxData);
                    } catch (trxErr) {
                        console.error('Failed to fetch finance transactions:', trxErr);
                    } finally {
                        setTransactionsLoading(false);
                    }
                }

                // Generate month labels (6 bulan terakhir)
                const now = new Date();
                const labels = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }));
                }
                setMonthLabels(labels);
                
                if (!isFinance) {
                    // Fetch isolated devices count
                    try {
                        const isolirResponse = await apiClient.get('/isolir');
                        setIsolatedCount(isolirResponse.data.count || 0);
                    } catch (isolirErr) {
                        console.error('Failed to fetch isolated count:', isolirErr);
                    }
                }
            } catch (err) {
                setError('Gagal memuat dashboard');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        if (!isTeknisi) {
            fetchManagementKpis(getDefaultKpiRange());
            fetchRevenueForecast(getDefaultForecastRange());
            fetchFinancialProjection(getDefaultFinancialProjectionRange());
            fetchFinancialTargets(isSuperAdmin);
        }
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

    const activeCustomerCount = Number(stats?.active_customers || 0);
    const totalCustomerCount = Number(stats?.total_customers || 0);
    const inactiveCustomerCount = Number(
        stats?.inactive_customers ?? Math.max(0, totalCustomerCount - activeCustomerCount)
    );

    // Customer status doughnut chart
    const customerStatusData = {
        labels: ['Aktif', 'Tidak Aktif'],
        datasets: [
            {
                data: [activeCustomerCount, inactiveCustomerCount],
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

    const forecastChartData = {
        labels: forecastData?.daily_forecast?.map((item) =>
            new Date(`${item.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
        ) || [],
        datasets: [
            {
                label: 'Prediksi Pendapatan',
                data: forecastData?.daily_forecast?.map((item) => item.predicted_revenue) || [],
                borderColor: '#0f766e',
                backgroundColor: 'rgba(15, 118, 110, 0.18)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#0f766e',
                pointRadius: 4,
                pointHoverRadius: 6,
            },
        ],
    };

    const forecastChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => `Rp ${Number(context.raw || 0).toLocaleString('id-ID')}`,
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#6b7280',
                    font: { size: 11, weight: '500' },
                },
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(148, 163, 184, 0.15)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#6b7280',
                    callback: (value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}jt`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}rb`;
                        return value;
                    },
                },
            },
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
    const financeSummary = stats?.finance_summary || { total_income: 0, total_expense: 0, adjustment_net: 0, balance: 0 };
    const kpiSummary = kpiData?.summary || null;
    const kpiAging = kpiData?.aging || null;
    const kpiVariance = kpiData?.variance || null;
    const kpiCustomerHealth = kpiData?.customer_health || null;
    const kpiHealthSummary = kpiCustomerHealth?.summary || null;
    const kpiHealthDistribution = kpiCustomerHealth?.distribution || [];
    const kpiHealthTopRiskCustomers = kpiCustomerHealth?.top_risk_customers || [];
    const kpiHealthFactorAverages = kpiCustomerHealth?.factor_averages || [];
    const kpiHealthRecommendations = kpiCustomerHealth?.recommendations || [];
    const forecastSummary = forecastData?.summary || null;
    const forecastContext = forecastData?.historical_context || null;
    const projectionSummary = financialProjectionData?.summary || null;
    const projectionForecastContext = financialProjectionData?.forecast_context || null;
    const projectionAssistant = financialProjectionData?.ai_assistant || null;
    const mandatoryProjectionRows = financialProjectionData?.mandatory_expense_projection || [];
    const purchaseGoalRows = financialProjectionData?.purchase_goals || [];
    const monthlyInstallations = Number(
        stats?.monthly_installations ?? stats?.new_installations?.[stats?.new_installations?.length - 1] ?? 0
    );

    const kpiAgingAmountChartData = {
        labels: (kpiAging?.buckets || []).map((bucket) => bucket.label),
        datasets: [
            {
                label: 'Nilai Piutang',
                data: (kpiAging?.buckets || []).map((bucket) => Number(bucket.amount || 0)),
                backgroundColor: [
                    'rgba(14, 165, 233, 0.85)',
                    'rgba(34, 197, 94, 0.85)',
                    'rgba(245, 158, 11, 0.85)',
                    'rgba(249, 115, 22, 0.85)',
                    'rgba(239, 68, 68, 0.85)',
                ],
                borderRadius: 10,
                borderSkipped: false,
            },
        ],
    };

    const kpiVarianceChartData = {
        labels: (kpiVariance?.daily || []).map((item) =>
            new Date(`${item.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
        ),
        datasets: [
            {
                label: 'Forecast',
                data: (kpiVariance?.daily || []).map((item) => Number(item.predicted_revenue || 0)),
                borderColor: '#0f766e',
                backgroundColor: 'rgba(15, 118, 110, 0.12)',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
            },
            {
                label: 'Realisasi',
                data: (kpiVariance?.daily || []).map((item) => Number(item.actual_revenue || 0)),
                borderColor: '#1d4ed8',
                backgroundColor: 'rgba(29, 78, 216, 0.12)',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
            },
        ],
    };

    const kpiHealthDistributionChartData = {
        labels: kpiHealthDistribution.map((item) => item.label),
        datasets: [
            {
                data: kpiHealthDistribution.map((item) => Number(item.count || 0)),
                backgroundColor: [
                    'rgba(16, 185, 129, 0.9)',
                    'rgba(245, 158, 11, 0.9)',
                    'rgba(249, 115, 22, 0.9)',
                    'rgba(239, 68, 68, 0.9)',
                ],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#ffffff'],
                borderWidth: 3,
                hoverOffset: 10,
            },
        ],
    };

    const kpiHealthDoughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    boxWidth: 10,
                    color: '#4b5563',
                    font: { size: 11 },
                },
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                    label: (context) => `${context.label}: ${context.raw} pelanggan`,
                },
            },
        },
    };

    const kpiBarCurrencyOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => `Rp ${Number(context.raw || 0).toLocaleString('id-ID')}`,
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#6b7280',
                    font: { size: 11, weight: '500' },
                },
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(148, 163, 184, 0.15)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#6b7280',
                    callback: (value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}jt`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}rb`;
                        return value;
                    },
                },
            },
        },
    };

    const kpiLineCurrencyOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    boxWidth: 12,
                    color: '#4b5563',
                },
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => `${context.dataset.label}: Rp ${Number(context.raw || 0).toLocaleString('id-ID')}`,
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#6b7280',
                    font: { size: 11, weight: '500' },
                },
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(148, 163, 184, 0.15)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#6b7280',
                    callback: (value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}jt`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}rb`;
                        return value;
                    },
                },
            },
        },
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(Number(amount || 0));
    };

    const formatPercent = (value, digits = 1) => {
        const numericValue = Number(value || 0);
        return `${numericValue.toFixed(digits)}%`;
    };

    const getMandatoryIndicatorBadge = (indicator) => {
        switch (indicator) {
            case 'terlaksana':
                return 'bg-indigo-100 text-indigo-700';
            case 'aman':
                return 'bg-emerald-100 text-emerald-700';
            case 'waspada':
                return 'bg-blue-100 text-blue-700';
            case 'risiko':
                return 'bg-amber-100 text-amber-700';
            default:
                return 'bg-red-100 text-red-700';
        }
    };

    const getMandatoryIndicatorLabel = (indicator) => {
        switch (indicator) {
            case 'terlaksana':
                return 'Terlaksana';
            case 'aman':
                return 'Aman';
            case 'waspada':
                return 'Waspada';
            case 'risiko':
                return 'Risiko';
            default:
                return 'Kritis';
        }
    };

    const getPurchaseIndicatorBadge = (indicator) => {
        if (indicator === 'siap') return 'bg-emerald-100 text-emerald-700';
        if (indicator === 'menunggu') return 'bg-amber-100 text-amber-700';
        if (indicator === 'tertahan_wajib') return 'bg-rose-100 text-rose-700';
        return 'bg-red-100 text-red-700';
    };

    const getPurchaseIndicatorLabel = (indicator) => {
        if (indicator === 'siap') return 'Siap';
        if (indicator === 'menunggu') return 'Menunggu';
        if (indicator === 'tertahan_wajib') return 'Tertahan Wajib';
        return 'Belum';
    };

    const getAssistantRiskBadge = (riskLevel) => {
        if (riskLevel === 'rendah') return 'bg-emerald-100 text-emerald-700';
        if (riskLevel === 'sedang') return 'bg-blue-100 text-blue-700';
        if (riskLevel === 'tinggi') return 'bg-amber-100 text-amber-700';
        return 'bg-red-100 text-red-700';
    };

    const getCustomerHealthRiskBadge = (riskLevel) => {
        if (riskLevel === 'sehat') return 'bg-emerald-100 text-emerald-700';
        if (riskLevel === 'waspada') return 'bg-amber-100 text-amber-700';
        if (riskLevel === 'tinggi') return 'bg-orange-100 text-orange-700';
        return 'bg-red-100 text-red-700';
    };

    const getCustomerHealthRiskLabel = (riskLevel) => {
        if (riskLevel === 'sehat') return 'Sehat';
        if (riskLevel === 'waspada') return 'Waspada';
        if (riskLevel === 'tinggi') return 'Tinggi';
        return 'Kritis';
    };

    const formatDurationFromSeconds = (seconds) => {
        const totalSeconds = Number(seconds || 0);
        if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
            return '-';
        }

        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (days > 0) {
            return `${days} hari ${hours} jam`;
        }

        if (hours > 0) {
            return `${hours}j ${minutes}m`;
        }

        return `${minutes}m`;
    };

    const handleApplyKpiRange = async () => {
        if (!kpiRange.start_date || !kpiRange.end_date) {
            setKpiError('Rentang tanggal KPI wajib diisi.');
            return;
        }

        const start = new Date(`${kpiRange.start_date}T00:00:00`);
        const end = new Date(`${kpiRange.end_date}T00:00:00`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            setKpiError('Format tanggal KPI tidak valid.');
            return;
        }

        if (start > end) {
            setKpiError('Tanggal mulai KPI tidak boleh melebihi tanggal akhir.');
            return;
        }

        const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (totalDays > 120) {
            setKpiError('Rentang KPI maksimal 120 hari.');
            return;
        }

        await fetchManagementKpis(kpiRange);
    };

    const handleResetKpiRange = async () => {
        const defaultRange = getDefaultKpiRange();
        setKpiRange(defaultRange);
        await fetchManagementKpis(defaultRange);
    };

    const handleApplyForecastRange = async () => {
        if (!forecastRange.start_date || !forecastRange.end_date) {
            setForecastError('Rentang tanggal prediksi wajib diisi.');
            return;
        }

        const start = new Date(`${forecastRange.start_date}T00:00:00`);
        const end = new Date(`${forecastRange.end_date}T00:00:00`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            setForecastError('Format tanggal tidak valid.');
            return;
        }

        if (start > end) {
            setForecastError('Tanggal mulai tidak boleh melebihi tanggal akhir.');
            return;
        }

        const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (totalDays > 60) {
            setForecastError('Rentang prediksi maksimal 60 hari.');
            return;
        }

        await fetchRevenueForecast(forecastRange);
    };

    const handleResetForecastRange = async () => {
        const defaultRange = getDefaultForecastRange();
        setForecastRange(defaultRange);
        await fetchRevenueForecast(defaultRange);
    };

    const handleApplyFinancialProjectionRange = async () => {
        if (!/^\d{4}-\d{2}$/.test(financialProjectionMonth)) {
            setFinancialProjectionError('Format bulan tidak valid.');
            return;
        }

        const nextRange = getMonthRangeFromMonthValue(financialProjectionMonth);
        setFinancialProjectionRange(nextRange);
        await fetchFinancialProjection(nextRange);
    };

    const handleResetFinancialProjectionRange = async () => {
        const defaultMonth = getCurrentMonthValue();
        const defaultRange = getMonthRangeFromMonthValue(defaultMonth);
        setFinancialProjectionMonth(defaultMonth);
        setFinancialProjectionRange(defaultRange);
        await fetchFinancialProjection(defaultRange);
    };

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
                transaction_date: new Date().toISOString().split('T')[0],
            });

            const refreshed = await apiClient.get('/dashboard');
            setStats(refreshed.data.data);
            const trxRes = await apiClient.get('/finance/transactions');
            setTransactions(trxRes.data?.data?.data || []);
            await fetchManagementKpis(kpiRange);
            await fetchFinancialProjection(financialProjectionRange);
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
                transaction_date: new Date().toISOString().split('T')[0],
            });

            const refreshed = await apiClient.get('/dashboard');
            setStats(refreshed.data.data);
            const trxRes = await apiClient.get('/finance/transactions');
            setTransactions(trxRes.data?.data?.data || []);
            await fetchManagementKpis(kpiRange);
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah pemasukan manual');
        } finally {
            setManualIncomeSubmitting(false);
        }
    };

    const openEditTransaction = (item) => {
        setEditTransactionModal({ open: true, item });
        setEditTransactionForm({
            description: item.description || '',
            amount: item.amount,
            transaction_date: item.transaction_date,
        });
    };

    const handleEditTransaction = async (e) => {
        e.preventDefault();
        if (!editTransactionModal.item) return;

        try {
            setEditTransactionSubmitting(true);
            await apiClient.put(`/finance/transactions/${editTransactionModal.item.id}`, {
                description: editTransactionForm.description,
                amount: Number(editTransactionForm.amount),
                transaction_date: editTransactionForm.transaction_date,
                category: editTransactionModal.item.category,
            });

            setEditTransactionModal({ open: false, item: null });
            const refreshed = await apiClient.get('/dashboard');
            setStats(refreshed.data.data);
            const trxRes = await apiClient.get('/finance/transactions');
            setTransactions(trxRes.data?.data?.data || []);
            await fetchManagementKpis(kpiRange);
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui transaksi');
        } finally {
            setEditTransactionSubmitting(false);
        }
    };

    const handleDeleteTransaction = async (item) => {
        if (!window.confirm('Hapus transaksi ini?')) return;

        try {
            await apiClient.delete(`/finance/transactions/${item.id}`);
            const refreshed = await apiClient.get('/dashboard');
            setStats(refreshed.data.data);
            const trxRes = await apiClient.get('/finance/transactions');
            setTransactions(trxRes.data?.data?.data || []);
            await fetchManagementKpis(kpiRange);
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus transaksi');
        }
    };

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
                {!isFinance && (
                    <div className="flex gap-3">
                        <a
                            href="/customer-verification"
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl transition font-medium shadow-lg shadow-blue-500/25"
                        >
                            <Plus size={18} />
                            Aktivasi Baru
                        </a>
                    </div>
                )}
                {canEditMutations && (
                    <div className="flex gap-3">
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
                    </div>
                )}
            </div>

            {error && (
                <Alert
                    type="error"
                    title="Error"
                    message={error}
                    onClose={() => setError(null)}
                />
            )}

            {canViewBalance && (
                <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl p-4 md:p-5 text-white shadow-lg shadow-slate-500/30 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative">
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
                            <p className="text-2xl md:text-3xl font-bold leading-tight">{formatCurrency(financeSummary.balance)}</p>
                            <p className="text-sm text-slate-100 mt-1 font-medium">
                                Masuk {formatCurrency(financeSummary.total_income)} • Keluar {formatCurrency(financeSummary.total_expense)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Fast Menu - Monitoring */}
            {stats && !isFinance && (
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

            {/* Fast Menu - Isolir */}
            {stats && !isFinance && (
                <div className="bg-gradient-to-br from-red-600 via-orange-600 to-red-600 rounded-xl p-3 md:p-4 text-white shadow-lg shadow-red-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    
                    <div className="relative">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="bg-white/20 backdrop-blur-sm p-1.5 rounded-lg">
                                        <AlertTriangle className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-base md:text-lg font-bold">Perangkat Isolir</h2>
                                        <p className="text-red-100 text-xs">Terbatas karena lewat jatuh tempo</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2.5 flex-1">
                                        <p className="text-red-100 text-xs font-medium mb-1">Total Isolir</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-xl md:text-2xl font-bold">{isolatedCount}</span>
                                            <span className="text-sm text-red-200">perangkat</span>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2.5">
                                        <p className="text-red-100 text-xs font-medium mb-1">Status</p>
                                        <div className="flex items-center gap-1.5">
                                            {isolatedCount > 0 ? (
                                                <>
                                                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                                                    <span className="text-sm font-semibold">Warning</span>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                                    <span className="text-sm font-semibold">Normal</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex-shrink-0">
                                <a
                                    href="/isolir"
                                    className="flex items-center justify-center gap-2 bg-white text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition font-semibold text-sm shadow hover:shadow-md transform hover:-translate-y-0.5 duration-200"
                                >
                                    <span>Lihat Detail</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className={`grid grid-cols-2 ${isFinance ? 'lg:grid-cols-3' : isTeknisi ? 'lg:grid-cols-4' : 'lg:grid-cols-6'} gap-4 md:gap-6`}>
                    {/* Total Customers */}
                    {!isFinance && (
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
                    )}

                    {/* Active Customers */}
                    {!isFinance && (
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
                                    {activeCustomerCount}
                                </p>
                                <p className="text-emerald-100 text-xs mt-1">Di luar pelanggan lewat jatuh tempo atau isolir</p>
                            </div>
                        </div>
                    )}

                    {!isTeknisi && (
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
                    )}

                    {!isFinance && (
                        <div className="bg-gradient-to-br from-cyan-500 to-sky-600 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-cyan-500/30 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                            <div className="relative">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                        <TrendingUp size={22} />
                                    </div>
                                </div>
                                <p className="text-cyan-100 text-sm font-medium">Pemasangan Bulan Ini</p>
                                <p className="text-3xl md:text-4xl font-bold mt-1">
                                    {monthlyInstallations}
                                </p>
                            </div>
                        </div>
                    )}

                    {!isTeknisi && (
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
                    )}

                    {/* Active Complaints */}
                    {!isFinance && (
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
                    )}
                </div>
            )}

            {!isTeknisi && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Target size={20} className="text-blue-700" />
                                KPI Manajemen
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Collection rate, aging piutang, churn, ARPU, dan variance forecast vs realisasi.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Mulai</label>
                                <input
                                    type="date"
                                    value={kpiRange.start_date}
                                    onChange={(e) => setKpiRange((prev) => ({ ...prev, start_date: e.target.value }))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Akhir</label>
                                <input
                                    type="date"
                                    value={kpiRange.end_date}
                                    onChange={(e) => setKpiRange((prev) => ({ ...prev, end_date: e.target.value }))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleApplyKpiRange}
                                disabled={kpiLoading}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                            >
                                {kpiLoading ? 'Memproses...' : 'Terapkan'}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetKpiRange}
                                disabled={kpiLoading}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
                            >
                                <RefreshCw size={14} className={kpiLoading ? 'animate-spin' : ''} />
                                30 Hari Default
                            </button>
                        </div>
                    </div>

                    {kpiError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                            {kpiError}
                        </div>
                    )}

                    {kpiLoading && !kpiSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Memproses KPI manajemen berdasarkan data invoice dan pelanggan...
                        </div>
                    )}

                    {!kpiLoading && !kpiError && !kpiSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Data KPI belum tersedia. Pilih rentang tanggal lalu klik Terapkan.
                        </div>
                    )}

                    {kpiSummary && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                                <div className="rounded-xl bg-green-50 border border-green-100 p-4">
                                    <p className="text-xs font-medium text-green-700">Collection Rate</p>
                                    <p className="text-2xl font-bold text-green-900 mt-1">
                                        {formatPercent(kpiSummary.collection_rate, 2)}
                                    </p>
                                    <p className={`text-xs mt-1 ${Number(kpiSummary.collection_rate_delta_vs_previous || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        Delta: {Number(kpiSummary.collection_rate_delta_vs_previous || 0) >= 0 ? '+' : ''}{formatPercent(kpiSummary.collection_rate_delta_vs_previous, 2)}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                                    <p className="text-xs font-medium text-amber-700">Aging Overdue</p>
                                    <p className="text-2xl font-bold text-amber-900 mt-1">
                                        {formatCurrency(kpiSummary.aging_total_overdue_amount)}
                                    </p>
                                    <p className="text-xs text-amber-700 mt-1">
                                        {kpiSummary.aging_total_overdue_invoices || 0} invoice overdue
                                    </p>
                                </div>

                                <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                                    <p className="text-xs font-medium text-rose-700">Churn (Pembayaran)</p>
                                    <p className="text-2xl font-bold text-rose-900 mt-1">
                                        {formatPercent(kpiSummary.churn_rate, 2)}
                                    </p>
                                    <p className="text-xs text-rose-700 mt-1">
                                        {kpiSummary.churned_customers || 0} pelanggan churn
                                    </p>
                                </div>

                                <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                                    <p className="text-xs font-medium text-indigo-700">ARPU (Pelanggan Bayar)</p>
                                    <p className="text-2xl font-bold text-indigo-900 mt-1">
                                        {formatCurrency(kpiSummary.arpu_paid_customer)}
                                    </p>
                                    <p className={`text-xs mt-1 ${Number(kpiSummary.arpu_delta_vs_previous || 0) >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>
                                        Delta: {Number(kpiSummary.arpu_delta_vs_previous || 0) >= 0 ? '+' : ''}{formatCurrency(kpiSummary.arpu_delta_vs_previous)}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-xs font-medium text-slate-600">Variance Forecast</p>
                                    <p className={`text-2xl font-bold mt-1 ${Number(kpiSummary.variance_percentage || 0) >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
                                        {kpiSummary.variance_available
                                            ? `${Number(kpiSummary.variance_percentage || 0) >= 0 ? '+' : ''}${formatPercent(kpiSummary.variance_percentage, 2)}`
                                            : '-'}
                                    </p>
                                    <p className="text-xs text-slate-600 mt-1">
                                        {kpiSummary.variance_available
                                            ? `Akurasi ${formatPercent(kpiSummary.variance_accuracy_score, 1)}`
                                            : 'Data realisasi historis belum cukup'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="border border-gray-100 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">Aging Piutang (Nilai)</p>
                                            <p className="text-xs text-gray-500">Snapshot per {kpiAging?.as_of_date || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="h-[240px]">
                                        <Bar data={kpiAgingAmountChartData} options={kpiBarCurrencyOptions} />
                                    </div>
                                </div>

                                <div className="border border-gray-100 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">Forecast vs Realisasi</p>
                                            <p className="text-xs text-gray-500">
                                                {(kpiVariance?.range?.start_date && kpiVariance?.range?.end_date)
                                                    ? `${kpiVariance.range.start_date} s.d. ${kpiVariance.range.end_date}`
                                                    : 'Belum ada data backtest'}
                                            </p>
                                        </div>
                                    </div>
                                    {kpiSummary.variance_available && (kpiVariance?.daily || []).length > 0 ? (
                                        <div className="h-[240px]">
                                            <Line data={kpiVarianceChartData} options={kpiLineCurrencyOptions} />
                                        </div>
                                    ) : (
                                        <div className="h-[240px] rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-500">
                                            Data variance belum tersedia untuk rentang yang dipilih.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                                    <p className="text-xs font-medium text-gray-600">Piutang Outstanding</p>
                                    <p className="text-xl font-bold text-gray-900 mt-1">
                                        {formatCurrency(kpiSummary.aging_total_outstanding_amount)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Total piutang (termasuk belum jatuh tempo)</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                                    <p className="text-xs font-medium text-gray-600">Pendapatan Realisasi (Invoice + Pemasangan)</p>
                                    <p className="text-xl font-bold text-gray-900 mt-1">
                                        {formatCurrency(kpiSummary.realized_revenue)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Invoice: {formatCurrency(kpiSummary.invoice_revenue)} | Pemasangan: {formatCurrency(kpiSummary.installation_income)}
                                    </p>
                                    <p className={`text-xs mt-1 ${Number(kpiSummary.revenue_growth_vs_previous || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        Growth: {Number(kpiSummary.revenue_growth_vs_previous || 0) >= 0 ? '+' : ''}{formatPercent(kpiSummary.revenue_growth_vs_previous, 2)}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                                    <p className="text-xs font-medium text-gray-600">Pelanggan Bayar</p>
                                    <p className="text-xl font-bold text-gray-900 mt-1">
                                        {kpiSummary.paid_customers || 0}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Basis perhitungan ARPU periode ini</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {!isTeknisi && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Brain size={20} className="text-teal-700" />
                                Prediksi Pendapatan
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Analisis invoice paid historis dengan default rentang 7 hari ke depan.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Mulai</label>
                                <input
                                    type="date"
                                    value={forecastRange.start_date}
                                    onChange={(e) => setForecastRange((prev) => ({ ...prev, start_date: e.target.value }))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Akhir</label>
                                <input
                                    type="date"
                                    value={forecastRange.end_date}
                                    onChange={(e) => setForecastRange((prev) => ({ ...prev, end_date: e.target.value }))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleApplyForecastRange}
                                disabled={forecastLoading}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                            >
                                {forecastLoading ? 'Menganalisis...' : 'Terapkan'}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetForecastRange}
                                disabled={forecastLoading}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
                            >
                                <RefreshCw size={14} className={forecastLoading ? 'animate-spin' : ''} />
                                7 Hari Default
                            </button>
                        </div>
                    </div>

                    {forecastError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                            {forecastError}
                        </div>
                    )}

                    {forecastLoading && !forecastSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Memproses prediksi pendapatan berdasarkan histori invoice...
                        </div>
                    )}

                    {!forecastLoading && !forecastError && !forecastSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Data prediksi belum tersedia. Silakan pilih rentang tanggal lalu klik Terapkan.
                        </div>
                    )}

                    {forecastSummary && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                <div className="rounded-xl bg-teal-50 border border-teal-100 p-4">
                                    <p className="text-xs font-medium text-teal-700">Total Prediksi Rentang</p>
                                    <p className="text-2xl font-bold text-teal-900 mt-1">
                                        {formatCurrency(forecastSummary.predicted_total_revenue)}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-xs font-medium text-slate-600">Rata-Rata Prediksi / Hari</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">
                                        {formatCurrency(forecastSummary.predicted_daily_average)}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                                    <p className="text-xs font-medium text-blue-700">Tren 6 Bulan</p>
                                    <p className={`text-2xl font-bold mt-1 ${forecastSummary.trend_percentage_6m >= 0 ? 'text-blue-900' : 'text-red-700'}`}>
                                        {forecastSummary.trend_percentage_6m >= 0 ? '+' : ''}{forecastSummary.trend_percentage_6m}%
                                    </p>
                                </div>
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                                    <p className="text-xs font-medium text-emerald-700">Confidence Rata-Rata</p>
                                    <p className="text-2xl font-bold text-emerald-900 mt-1">
                                        {forecastSummary.average_confidence}%
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                <div className="xl:col-span-2 border border-gray-100 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">Grafik Prediksi Harian</p>
                                            <p className="text-xs text-gray-500">
                                                {forecastData?.range?.start_date} s.d. {forecastData?.range?.end_date}
                                            </p>
                                        </div>
                                        <div className="text-xs text-gray-500 inline-flex items-center gap-1">
                                            <Target size={14} />
                                            Berbasis histori 12 bulan
                                        </div>
                                    </div>
                                    <div className="h-[250px]">
                                        <Line data={forecastChartData} options={forecastChartOptions} />
                                    </div>
                                </div>

                                <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                                    <p className="text-sm font-semibold text-gray-900">Insight Analisis</p>
                                    <div className="text-xs text-gray-600 space-y-1">
                                        <p>Rata-rata historis harian: <span className="font-semibold text-gray-900">{formatCurrency(forecastSummary.historical_daily_average)}</span></p>
                                        <p>Rata-rata 30 hari terakhir: <span className="font-semibold text-gray-900">{formatCurrency(forecastSummary.recent_30d_daily_average)}</span></p>
                                        <p>Hari terkuat: <span className="font-semibold text-gray-900">{forecastSummary.best_weekday}</span></p>
                                        <p>Invoice paid historis: <span className="font-semibold text-gray-900">{forecastSummary.historical_paid_invoices}</span></p>
                                        <p>Volatilitas: <span className="font-semibold text-gray-900">{forecastContext?.volatility_index ?? 0}%</span></p>
                                    </div>

                                    <div className="pt-2 border-t border-gray-100">
                                        <p className="text-xs font-semibold text-gray-700 mb-2">Catatan Prediksi</p>
                                        <ul className="space-y-2 text-xs text-gray-600">
                                            {(forecastSummary.analysis_notes || []).map((note, index) => (
                                                <li key={index} className="flex gap-2">
                                                        <span className="text-teal-600 font-bold">-</span>
                                                    <span>{note}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-600 text-left">
                                        <tr>
                                            <th className="px-4 py-3">Tanggal</th>
                                            <th className="px-4 py-3">Hari</th>
                                            <th className="px-4 py-3 text-right">Prediksi</th>
                                            <th className="px-4 py-3 text-right">Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(forecastData?.daily_forecast || []).map((item) => (
                                            <tr key={item.date} className="border-t border-gray-100">
                                                <td className="px-4 py-2.5">{item.date}</td>
                                                <td className="px-4 py-2.5">{item.day_name}</td>
                                                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                                                    {formatCurrency(item.predicted_revenue)}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-teal-100 text-teal-700 font-medium">
                                                        {item.confidence}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {!isTeknisi && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Target size={20} className="text-indigo-700" />
                                Prediksi Keuangan, Pengeluaran Wajib, dan Target Pembelian
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Fokus bulanan: ringkasan kelayakan pengeluaran wajib dan target pembelian per bulan.
                            </p>
                            <p className="text-xs text-indigo-600 mt-1">Periode aktif: {formatMonthLabel(financialProjectionMonth)}</p>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Bulan</label>
                                <input
                                    type="month"
                                    value={financialProjectionMonth}
                                    onChange={(e) => setFinancialProjectionMonth(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleApplyFinancialProjectionRange}
                                disabled={financialProjectionLoading}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                            >
                                {financialProjectionLoading ? 'Memproses...' : 'Tampilkan Bulan'}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetFinancialProjectionRange}
                                disabled={financialProjectionLoading}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
                            >
                                <RefreshCw size={14} className={financialProjectionLoading ? 'animate-spin' : ''} />
                                Bulan Ini
                            </button>
                            {isSuperAdmin && (
                                <button
                                    type="button"
                                    onClick={openCreateTargetModal}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
                                >
                                    <Plus size={14} />
                                    Tambah Target
                                </button>
                            )}
                        </div>
                    </div>

                    {financialProjectionError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                            {financialProjectionError}
                        </div>
                    )}

                    {financialProjectionLoading && !projectionSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Memproses prediksi gabungan pendapatan dan pengeluaran wajib...
                        </div>
                    )}

                    {projectionSummary && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-xs font-medium text-slate-600">Saldo Awal Proyeksi</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(projectionSummary.opening_balance)}</p>
                                </div>
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 xl:col-span-2">
                                    <p className="text-xs font-medium text-emerald-700">Prediksi Pendapatan</p>
                                    <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(projectionSummary.predicted_income)}</p>
                                    <p className="text-xs text-emerald-700 mt-1">
                                        Aktual: {formatCurrency(projectionSummary.income_actual_to_date)} | Sisa Forecast: {formatCurrency(projectionSummary.income_forecast_remaining)}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                                    <p className="text-xs font-medium text-rose-700">Total Pengeluaran Wajib</p>
                                    <p className="text-2xl font-bold text-rose-900 mt-1">{formatCurrency(projectionSummary.mandatory_expense)}</p>
                                </div>
                                <div className={`rounded-xl border p-4 ${Number(projectionSummary.mandatory_shortfall_total || 0) > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                    <p className={`text-xs font-medium ${Number(projectionSummary.mandatory_shortfall_total || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>Shortfall Wajib</p>
                                    <p className={`text-2xl font-bold mt-1 ${Number(projectionSummary.mandatory_shortfall_total || 0) > 0 ? 'text-red-900' : 'text-emerald-900'}`}>
                                        {formatCurrency(projectionSummary.mandatory_shortfall_total)}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-4">
                                    <p className="text-xs font-medium text-cyan-700">Budget Operasional Aman</p>
                                    <p className="text-2xl font-bold text-cyan-900 mt-1">{formatCurrency(projectionSummary.operational_spending_budget)}</p>
                                    <p className="text-xs text-cyan-700 mt-1">
                                        Saran pakai: {formatCurrency(projectionSummary.recommended_operational_spending_budget)}
                                    </p>
                                    <p className="text-[11px] text-cyan-700 mt-1">
                                        Berlaku mulai {projectionSummary.operational_budget_as_of_date || '-'}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                                    <p className="text-xs font-medium text-indigo-700">Sisa Setelah Wajib</p>
                                    <p className="text-2xl font-bold text-indigo-900 mt-1">{formatCurrency(projectionSummary.net_after_mandatory)}</p>
                                </div>
                                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                                    <p className="text-xs font-medium text-amber-700">Estimasi Saldo Akhir</p>
                                    <p className="text-2xl font-bold text-amber-900 mt-1">{formatCurrency(projectionSummary.projected_ending_balance)}</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 text-sm">
                                <p className="text-indigo-900 font-medium">
                                    Metode hitung: {projectionSummary.calculation_mode === 'hybrid_actual_forecast' ? 'Hybrid (aktual + forecast)' : 'Forecast penuh'}
                                </p>
                                <p className="text-indigo-700">
                                    Confidence model: {formatPercent(projectionForecastContext?.average_confidence || 0, 0)} | Volatilitas: {formatPercent(projectionForecastContext?.volatility_index || 0, 1)}
                                </p>
                            </div>

                            {projectionAssistant && (
                                <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gradient-to-r from-slate-50 to-blue-50/40">
                                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                                <Brain size={16} className="text-indigo-700" />
                                                Asisten AI Proyeksi
                                            </p>
                                            <p className="text-xs text-gray-600 mt-1">{projectionAssistant.headline}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getAssistantRiskBadge(projectionAssistant.risk_level)}`}>
                                                Risiko {projectionAssistant.risk_level}
                                            </span>
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                                                Skor {projectionAssistant.score}/100
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-700 mb-2">Temuan Kunci</p>
                                            <ul className="space-y-1 text-xs text-gray-600">
                                                {(projectionAssistant.key_findings || []).map((item, index) => (
                                                    <li key={index} className="flex gap-2">
                                                        <span className="text-indigo-600 font-bold">-</span>
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-700 mb-2">Rekomendasi Aksi</p>
                                            <div className="space-y-2">
                                                {(projectionAssistant.recommended_actions || []).map((action, index) => (
                                                    <div key={index} className="rounded-lg border border-gray-200 bg-white/80 p-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-xs font-semibold text-gray-900">{action.title}</p>
                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${action.priority === 'tinggi' ? 'bg-red-100 text-red-700' : action.priority === 'menengah' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                {action.priority}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-600 mt-1">{action.detail}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-gray-900">Indikator Pengeluaran Wajib</p>
                                        <span className="text-xs text-gray-500">
                                            Coverage event: {projectionSummary.mandatory_covered_events || 0}/{projectionSummary.mandatory_total_events || 0}
                                            {' | '}
                                            Coverage nominal: {formatPercent(projectionSummary.mandatory_coverage_amount_rate || 0, 1)}
                                            {' | '}
                                            Terkonfirmasi: {projectionSummary.mandatory_confirmed_events || 0}
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                        <table className="w-full text-sm min-w-[1100px]">
                                            <thead className="bg-gray-50 text-gray-600 text-left">
                                                <tr>
                                                    <th className="px-3 py-2">Nama Target</th>
                                                    <th className="px-3 py-2">Periode</th>
                                                    <th className="px-3 py-2">Jatuh Tempo</th>
                                                    <th className="px-3 py-2 text-right">Nominal</th>
                                                    <th className="px-3 py-2 text-right">Saldo Sebelum</th>
                                                    <th className="px-3 py-2 text-right">Coverage</th>
                                                    <th className="px-3 py-2 text-right">Shortfall</th>
                                                    <th className="px-3 py-2 text-center">Indikator</th>
                                                    <th className="px-3 py-2 text-right">Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mandatoryProjectionRows.length === 0 ? (
                                                    <tr>
                                                        <td className="px-3 py-4 text-center text-gray-500" colSpan={9}>
                                                            Belum ada kejadian pengeluaran wajib pada rentang ini.
                                                        </td>
                                                    </tr>
                                                ) : mandatoryProjectionRows.map((row) => (
                                                    <tr key={row.event_id} className="border-t border-gray-100">
                                                        <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-3 py-2 text-gray-600">{row.period_start} s.d. {row.period_end}</td>
                                                        <td className="px-3 py-2 text-gray-600">{row.due_date}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(row.amount)}</td>
                                                        <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(row.available_before)}</td>
                                                        <td className="px-3 py-2 text-right text-gray-700">{formatPercent(row.coverage_ratio || 0, 1)}</td>
                                                        <td className={`px-3 py-2 text-right font-semibold ${Number(row.shortfall || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                            {formatCurrency(row.shortfall || 0)}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getMandatoryIndicatorBadge(row.indicator)}`}>
                                                                {getMandatoryIndicatorLabel(row.indicator)}
                                                            </span>
                                                            {row.is_confirmed && row.confirmed_transaction_date && (
                                                                <p className="text-[11px] text-indigo-600 mt-1">
                                                                    Tercatat: {row.confirmed_transaction_date}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            {row.is_confirmed ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRevokeMandatoryExecution(row)}
                                                                    disabled={mandatoryActionLoadingKey === `revoke-${row.event_id}`}
                                                                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-60"
                                                                >
                                                                    {mandatoryActionLoadingKey === `revoke-${row.event_id}` ? 'Membatalkan...' : 'Batalkan'}
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleConfirmMandatoryExecution(row)}
                                                                    disabled={mandatoryActionLoadingKey === `confirm-${row.event_id}`}
                                                                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-60"
                                                                >
                                                                    {mandatoryActionLoadingKey === `confirm-${row.event_id}` ? 'Menyimpan...' : 'Konfirmasi'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-gray-900">Target Pembelian / Keinginan</p>
                                        <span className="text-xs text-gray-500">
                                            Tercapai di rentang: {projectionSummary.purchase_targets_reachable || 0}/{projectionSummary.purchase_targets_total || 0}
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                        <table className="w-full text-sm min-w-[680px]">
                                            <thead className="bg-gray-50 text-gray-600 text-left">
                                                <tr>
                                                    <th className="px-3 py-2">Target</th>
                                                    <th className="px-3 py-2 text-right">Nominal</th>
                                                    <th className="px-3 py-2">Target Tanggal</th>
                                                    <th className="px-3 py-2">Prediksi Bisa Dibeli</th>
                                                    <th className="px-3 py-2 text-center">Indikator</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {purchaseGoalRows.length === 0 ? (
                                                    <tr>
                                                        <td className="px-3 py-4 text-center text-gray-500" colSpan={5}>
                                                            Belum ada target pembelian aktif.
                                                        </td>
                                                    </tr>
                                                ) : purchaseGoalRows.map((row) => (
                                                    <tr key={row.id} className="border-t border-gray-100">
                                                        <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(row.amount)}</td>
                                                        <td className="px-3 py-2 text-gray-600">{row.desired_date || '-'}</td>
                                                        <td className="px-3 py-2 text-gray-600">
                                                            {row.predicted_buy_date || 'Belum tercapai di rentang'}
                                                            {row.blocked_by_mandatory && (
                                                                <p className="text-[11px] text-rose-600 mt-0.5">Tertahan karena coverage wajib belum aman</p>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getPurchaseIndicatorBadge(row.indicator)}`}>
                                                                {getPurchaseIndicatorLabel(row.indicator)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900">Daftar Target Keuangan</p>
                            <span className="text-xs text-gray-500">Bisa dibuat/diubah hanya oleh superadmin</span>
                        </div>

                        {financialTargetsLoading ? (
                            <div className="text-sm text-gray-500 py-4">Memuat daftar target keuangan...</div>
                        ) : (
                            <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                <table className="w-full text-sm min-w-[820px]">
                                    <thead className="bg-gray-50 text-gray-600 text-left">
                                        <tr>
                                            <th className="px-3 py-2">Nama</th>
                                            <th className="px-3 py-2">Tipe</th>
                                            <th className="px-3 py-2 text-right">Nominal</th>
                                            <th className="px-3 py-2">Periode/Tanggal Target</th>
                                            <th className="px-3 py-2">Status</th>
                                            {isSuperAdmin && <th className="px-3 py-2 text-right">Aksi</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {financialTargets.length === 0 ? (
                                            <tr>
                                                <td className="px-3 py-4 text-center text-gray-500" colSpan={isSuperAdmin ? 6 : 5}>
                                                    Belum ada target keuangan.
                                                </td>
                                            </tr>
                                        ) : financialTargets.map((item) => (
                                            <tr key={item.id} className="border-t border-gray-100">
                                                <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
                                                <td className="px-3 py-2 text-gray-600">{item.type === 'mandatory_expense' ? 'Pengeluaran Wajib' : 'Target Pembelian'}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(item.amount)}</td>
                                                <td className="px-3 py-2 text-gray-600">
                                                    {item.type === 'mandatory_expense'
                                                        ? (item.is_recurring_monthly && item.recurrence_forever
                                                            ? `Setiap tanggal ${item?.meta?.monthly_day || '-'} tiap bulan (Selamanya)`
                                                            : `${item.start_date || '-'} s.d. ${item.end_date || '-'}${item.is_recurring_monthly ? ` (Bulanan${item.recurrence_forever ? ' - Selamanya' : item.recurrence_until ? ` sampai ${item.recurrence_until}` : ''})` : ''}`)
                                                        : (item.target_date || '-')}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>
                                                        {item.is_active ? 'Aktif' : 'Nonaktif'}
                                                    </span>
                                                </td>
                                                {isSuperAdmin && (
                                                    <td className="px-3 py-2 text-right">
                                                        <div className="inline-flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                                onClick={() => openEditTargetModal(item)}
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                                onClick={() => handleDeleteTarget(item)}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!isTeknisi && (
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
                            <p className="text-sm text-gray-500">Distribusi aktif dan tidak aktif (lewat jatuh tempo atau isolir)</p>
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

            {/* Installation Chart & Quick Actions */}
            {!isFinance ? (
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
                        {!isTeknisi && (
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
                        )}
                        {!isTeknisi && (
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
                        )}
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
                        {isTeknisi && (
                            <a
                                href="/monitoring"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-purple-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <Activity size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Monitoring Perangkat</p>
                                    <p className="text-xs text-gray-400">Pantau status PPPoE real-time</p>
                                </div>
                            </a>
                        )}
                        {isTeknisi && (
                            <a
                                href="/isolir"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-red-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Perangkat Isolir</p>
                                    <p className="text-xs text-gray-400">Kelola pelanggan terisolir</p>
                                </div>
                            </a>
                        )}
                        {isTeknisi && (
                            <a
                                href="/complaints"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-pink-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <MessageSquare size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Aduan Pelanggan</p>
                                    <p className="text-xs text-gray-400">Tindak lanjut gangguan pelanggan</p>
                                </div>
                            </a>
                        )}
                    </div>
                </div>
            </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Zap size={20} className="text-yellow-400" />
                                Aksi Cepat Keuangan
                            </h2>
                            <p className="text-sm text-gray-400 mt-1">Pintasan menu untuk tim finance</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <a
                                href="/penagihan"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-violet-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <DollarSign size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Kelola Tagihan</p>
                                    <p className="text-xs text-gray-400">Lihat dan proses invoice</p>
                                </div>
                            </a>
                            <a
                                href="/pengeluaran"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-emerald-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Pengeluaran</p>
                                    <p className="text-xs text-gray-400">Kelola biaya operasional</p>
                                </div>
                            </a>
                            <a
                                href="/payroll"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-blue-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <Wallet size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Payroll</p>
                                    <p className="text-xs text-gray-400">Kelola pembayaran payroll</p>
                                </div>
                            </a>
                            <a
                                href="/settings/payment-methods"
                                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3.5 rounded-xl transition group"
                            >
                                <div className="bg-orange-500 p-2 rounded-lg group-hover:scale-110 transition">
                                    <Settings size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Metode Pembayaran</p>
                                    <p className="text-xs text-gray-400">Atur channel pembayaran</p>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {canViewBalance && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Transaksi Keuangan Terintegrasi</h2>
                            <p className="text-sm text-gray-500">Pemasukan, pengeluaran, payroll, dan adjustment dalam satu ledger</p>
                        </div>
                    </div>
                    {transactionsLoading ? (
                        <div className="py-6 text-center text-gray-500">Memuat transaksi...</div>
                    ) : transactions.length === 0 ? (
                        <div className="py-6 text-center text-gray-500">Belum ada transaksi.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-gray-500 border-b">
                                    <tr>
                                        <th className="py-2 pr-2">Tanggal</th>
                                        <th className="py-2 pr-2">Jenis</th>
                                        <th className="py-2 pr-2">Sumber</th>
                                        <th className="py-2 pr-2">Deskripsi</th>
                                        <th className="py-2 pr-2 text-right">Nominal</th>
                                        {canEditMutations && <th className="py-2 pr-2 text-right">Aksi</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.slice(0, 5).map((item) => (
                                        <tr key={item.id} className="border-b last:border-0">
                                            <td className="py-2 pr-2">{item.transaction_date}</td>
                                            <td className="py-2 pr-2">
                                                <span className={`px-2 py-0.5 rounded-full text-xs ${item.type === 'income' ? 'bg-green-100 text-green-700' : item.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {item.type}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-2">{item.source}</td>
                                            <td className="py-2 pr-2">{item.description || '-'}</td>
                                            <td className={`py-2 pr-2 text-right font-semibold ${item.type === 'expense' ? 'text-red-600' : 'text-green-700'}`}>
                                                {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
                                            </td>
                                            {canEditMutations && (
                                                <td className="py-2 pr-2">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                            onClick={() => openEditTransaction(item)}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                            onClick={() => handleDeleteTransaction(item)}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {!isTeknisi && kpiHealthSummary && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-emerald-900">Health Score Pelanggan</h2>
                            <p className="text-sm text-emerald-700 mt-1">
                                Kombinasi sinyal telat bayar, keluhan, isolir, kualitas koneksi, dan gangguan area ODP.
                            </p>
                        </div>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            As of {kpiCustomerHealth?.as_of_date || '-'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                            <p className="text-xs text-emerald-700 font-medium">Skor Kesehatan Rata-rata</p>
                            <p className="text-2xl font-bold text-emerald-900 mt-1">
                                {Number(kpiHealthSummary.average_health_score || 0).toFixed(1)}
                            </p>
                        </div>
                        <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3">
                            <p className="text-xs text-orange-700 font-medium">Pelanggan Risiko Tinggi</p>
                            <p className="text-2xl font-bold text-orange-900 mt-1">
                                {kpiHealthSummary.high_risk_customers || 0}
                            </p>
                        </div>
                        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                            <p className="text-xs text-red-700 font-medium">Pelanggan Kritis</p>
                            <p className="text-2xl font-bold text-red-900 mt-1">
                                {kpiHealthSummary.critical_customers || 0}
                            </p>
                        </div>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-3">
                            <p className="text-xs text-cyan-700 font-medium">Faktor Dominan</p>
                            <p className="text-base font-semibold text-cyan-900 mt-2">
                                {kpiHealthSummary.dominant_risk_factor_label || kpiSummary.customer_health_dominant_factor || '-'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <div className="border border-emerald-100 rounded-lg bg-white p-4 space-y-3">
                            <p className="text-sm font-semibold text-gray-900">Distribusi Risiko</p>
                            <div className="h-[220px]">
                                <Doughnut data={kpiHealthDistributionChartData} options={kpiHealthDoughnutOptions} />
                            </div>
                        </div>

                        <div className="border border-emerald-100 rounded-lg bg-white p-4 space-y-3">
                            <p className="text-sm font-semibold text-gray-900">Tekanan Faktor Risiko</p>
                            <div className="space-y-3">
                                {(kpiHealthFactorAverages || []).map((factor) => (
                                    <div key={`health-factor-${factor.key}`}>
                                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                            <span>{factor.label}</span>
                                            <span>{Number(factor.average_pressure || 0).toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full"
                                                style={{ width: `${Math.min(100, Number(factor.average_pressure || 0))}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="border border-emerald-100 rounded-lg bg-white p-4 space-y-3">
                            <p className="text-sm font-semibold text-gray-900">Rekomendasi Retensi</p>
                            <ul className="space-y-2 text-xs text-gray-700 list-disc list-inside">
                                {(kpiHealthRecommendations || []).slice(0, 4).map((item, index) => (
                                    <li key={`health-reco-${index}`}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="border border-emerald-100 rounded-lg bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-gray-900">Pelanggan Prioritas Intervensi</p>
                            <span className="text-xs text-gray-500">Top {Math.min(6, kpiHealthTopRiskCustomers.length)} dari {kpiHealthSummary.total_customers || 0} pelanggan</span>
                        </div>

                        {(kpiHealthTopRiskCustomers || []).length > 0 ? (
                            <div className="space-y-3">
                                {(kpiHealthTopRiskCustomers || []).slice(0, 6).map((row) => (
                                    <div key={`health-risk-${row.customer_id}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{row.customer_name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {row.pppoe_username ? `PPPoE: ${row.pppoe_username}` : 'PPPoE: -'}
                                                    {' • '}
                                                    {row.odp ? `ODP: ${row.odp}` : 'ODP: belum diisi'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-gray-900">{row.health_score}</span>
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getCustomerHealthRiskBadge(row.risk_level)}`}>
                                                    {getCustomerHealthRiskLabel(row.risk_level)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 mt-3 text-xs">
                                            <div className="rounded-md bg-white border border-gray-200 px-2 py-1.5 text-gray-700">
                                                Faktor Dominan: <span className="font-semibold">{row.dominant_factor?.label || '-'}</span>
                                            </div>
                                            <div className="rounded-md bg-white border border-gray-200 px-2 py-1.5 text-gray-700">
                                                Overdue: <span className="font-semibold">{row.signals?.days_overdue || 0} hari</span> | Aduan Aktif: <span className="font-semibold">{row.signals?.open_complaints || 0}</span>
                                            </div>
                                            <div className="rounded-md bg-white border border-gray-200 px-2 py-1.5 text-gray-700">
                                                Koneksi: <span className="font-semibold">{row.signals?.connection_data_available ? (row.signals?.is_online ? `online (${formatDurationFromSeconds(row.signals?.connection_uptime_seconds)})` : 'offline') : 'data tidak tersedia'}</span>
                                            </div>
                                        </div>

                                        <p className="text-xs text-gray-600 mt-2">
                                            {Array.isArray(row.priority_reasons) && row.priority_reasons.length > 0 ? row.priority_reasons[0] : row.recommended_action}
                                        </p>
                                        <p className="text-xs text-emerald-700 mt-1 font-medium">Aksi: {row.recommended_action}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Belum ada pelanggan yang terdeteksi berisiko pada rentang ini.
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Modal
                isOpen={targetModal.open}
                onClose={closeTargetModal}
                title={targetModal.mode === 'edit' ? 'Edit Target Keuangan' : 'Tambah Target Keuangan'}
                size="lg"
            >
                <form onSubmit={handleSaveTarget} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Target</label>
                        <select
                            value={targetForm.type}
                            onChange={(e) => setTargetForm((prev) => ({ ...prev, type: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        >
                            <option value="mandatory_expense">Pengeluaran Wajib</option>
                            <option value="purchase_target">Target Pembelian / Keinginan</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Target</label>
                            <input
                                type="text"
                                value={targetForm.name}
                                onChange={(e) => setTargetForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
                            <input
                                type="number"
                                value={targetForm.amount}
                                onChange={(e) => setTargetForm((prev) => ({ ...prev, amount: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                min={1}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi (opsional)</label>
                        <textarea
                            value={targetForm.description}
                            onChange={(e) => setTargetForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            rows={3}
                        />
                    </div>

                    {targetForm.type === 'mandatory_expense' ? (
                        <>
                            <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={targetForm.is_recurring_monthly}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setTargetForm((prev) => ({
                                                ...prev,
                                                is_recurring_monthly: checked,
                                                recurrence_forever: checked ? prev.recurrence_forever : false,
                                                recurrence_until: checked ? prev.recurrence_until : '',
                                            }));
                                        }}
                                    />
                                    Ulangi setiap bulan
                                </label>

                                {targetForm.is_recurring_monthly && (
                                    <>
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={targetForm.recurrence_forever}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setTargetForm((prev) => ({
                                                        ...prev,
                                                        recurrence_forever: checked,
                                                        start_date: checked ? '' : prev.start_date,
                                                        end_date: checked ? '' : prev.end_date,
                                                        monthly_day: checked ? (prev.monthly_day || String(new Date().getDate())) : prev.monthly_day,
                                                    }));
                                                }}
                                            />
                                            Ulangi selamanya
                                        </label>

                                        {!targetForm.recurrence_forever && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Ulangi sampai bulan</label>
                                                <input
                                                    type="date"
                                                    value={targetForm.recurrence_until}
                                                    onChange={(e) => setTargetForm((prev) => ({ ...prev, recurrence_until: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                        )}

                                        {targetForm.recurrence_forever && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal setiap bulan</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={31}
                                                    value={targetForm.monthly_day}
                                                    onChange={(e) => setTargetForm((prev) => ({ ...prev, monthly_day: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                    placeholder="Contoh: 10"
                                                    required
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Tagihan wajib akan jatuh setiap tanggal ini tiap bulan.</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {!(targetForm.is_recurring_monthly && targetForm.recurrence_forever) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                                        <input
                                            type="date"
                                            value={targetForm.start_date}
                                            onChange={(e) => setTargetForm((prev) => ({ ...prev, start_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Akhir</label>
                                        <input
                                            type="date"
                                            value={targetForm.end_date}
                                            onChange={(e) => setTargetForm((prev) => ({ ...prev, end_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target Tanggal Pembelian (opsional)</label>
                            <input
                                type="date"
                                value={targetForm.target_date}
                                onChange={(e) => setTargetForm((prev) => ({ ...prev, target_date: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Prioritas (lebih kecil didahulukan)</label>
                            <input
                                type="number"
                                value={targetForm.priority}
                                onChange={(e) => setTargetForm((prev) => ({ ...prev, priority: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                min={1}
                                max={1000}
                            />
                        </div>
                        <div className="flex items-end">
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={targetForm.is_active}
                                    onChange={(e) => setTargetForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                />
                                Target aktif
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeTargetModal}>
                            Batal
                        </Button>
                        <Button type="submit" variant="primary" disabled={targetSubmitting}>
                            {targetSubmitting ? 'Menyimpan...' : 'Simpan Target'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={showAdjustModal}
                onClose={() => setShowAdjustModal(false)}
                title="Penyesuaian Saldo"
            >
                <form onSubmit={handleAdjustBalance} className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        Fitur ini hanya untuk superadmin. Gunakan nilai positif untuk menambah saldo dan nilai negatif untuk mengurangi saldo.
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

            <Modal
                isOpen={editTransactionModal.open}
                onClose={() => setEditTransactionModal({ open: false, item: null })}
                title="Edit Transaksi"
            >
                {editTransactionModal.item && (
                    <form onSubmit={handleEditTransaction} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                            <input
                                type="text"
                                value={editTransactionForm.description}
                                onChange={(e) => setEditTransactionForm((prev) => ({ ...prev, description: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
                            <input
                                type="number"
                                value={editTransactionForm.amount}
                                onChange={(e) => setEditTransactionForm((prev) => ({ ...prev, amount: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                            <input
                                type="date"
                                value={editTransactionForm.transaction_date}
                                onChange={(e) => setEditTransactionForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={() => setEditTransactionModal({ open: false, item: null })}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={editTransactionSubmitting}>
                                {editTransactionSubmitting ? 'Menyimpan...' : 'Simpan'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}

export default Dashboard;

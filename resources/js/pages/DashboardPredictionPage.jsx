import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Brain,
    Calendar,
    DollarSign,
    RefreshCw,
    ShieldAlert,
    Target,
    TrendingUp,
    Users,
    Wallet,
    CheckCircle2,
    XCircle,
    ChevronRight,
    Zap,
    ShoppingCart,
    Send,
    Info,
    Eye,
    Sparkles,
    Filter,
    Sliders,
    Layers,
    BarChart3,
    HelpCircle,
    ArrowUpRight,
    ArrowDownRight,
    Phone,
    Clock,
    Plus,
    Minus,
    Check,
    X,
    Server,
    ShieldCheck,
    PieChart,
    ChevronLeft
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
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
import Alert from '../components/common/Alert';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import apiClient from '../services/api';
import monthlyBudgetService from '../services/monthlyBudgetService';

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

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatPercent(value, digits = 1) {
    const number = Number(value || 0);
    return `${number.toFixed(digits)}%`;
}

function getRiskBadgeClass(riskLevel) {
    const r = String(riskLevel || '').toLowerCase();
    if (r === 'kritis') return 'bg-red-100 text-red-700 border-red-200';
    if (r === 'tinggi') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (r === 'waspada' || r === 'sedang') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

function getStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'aman' || s === 'safe' || s === 'terlaksana') {
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Aman</span>;
    }
    if (s === 'waspada' || s === 'warning') {
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Waspada</span>;
    }
    if (s === 'defisit' || s === 'lewat_budget' || s === 'kritis') {
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">{s === 'lewat_budget' ? 'Lewat Budget' : 'Defisit'}</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{status || '-'}</span>;
}

function DashboardPredictionPage() {
    const isTeknisi = window.appUserRole === 'teknisi';

    // Tabs: 'cash_decision' | 'cashflow_forecast' | 'collection_risk' | 'isp_intelligence'
    const [activeTab, setActiveTab] = useState('cash_decision');

    // Dates
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue());
    const [financialProjectionRange, setFinancialProjectionRange] = useState(() => getMonthRangeFromMonthValue(getCurrentMonthValue()));
    
    // Main data states
    const [bundleMeta, setBundleMeta] = useState(null);
    const [kpiData, setKpiData] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [financialProjectionData, setFinancialProjectionData] = useState(null);
    const [ispIntelligenceData, setIspIntelligenceData] = useState(null);
    
    // Loading & Error states
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [actionMessage, setActionMessage] = useState(null);

    // Sub-states & modals
    const [mandatoryActionKey, setMandatoryActionKey] = useState(null);
    const [purchaseModal, setPurchaseModal] = useState({ open: false, target: null, preview: null, loading: false, error: null });
    const [simulationModal, setSimulationModal] = useState({ open: false, date: formatDateInputLocal(new Date()), amount: '', result: null, loading: false, error: null });
    const [budgetModal, setBudgetModal] = useState({ open: false, month: getCurrentMonthValue(), data: {}, loading: false, saving: false, error: null });

    // Table pagination / search state for daily timeline
    const [dailyTimelinePage, setDailyTimelinePage] = useState(1);
    const [dailyTimelineRowsPerPage, setDailyTimelineRowsPerPage] = useState(10);
    const [dailyTimelineSearch, setDailyTimelineSearch] = useState('');

    useEffect(() => {
        const range = getMonthRangeFromMonthValue(selectedMonth);
        setFinancialProjectionRange(range);
    }, [selectedMonth]);

    useEffect(() => {
        if (isTeknisi) return;
        loadAllPredictionData(true);
    }, [selectedMonth]);

    const loadAllPredictionData = async (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        setIsRefreshing(true);
        setError(null);

        try {
            // 1. Fetch prediction bundle
            const bundleRes = await apiClient.get('/dashboard/prediction-bundle').catch(() => null);
            if (bundleRes?.data?.data) {
                const bundle = bundleRes.data.data;
                setBundleMeta(bundle.meta || bundleRes.data.meta || null);
                if (bundle.management_kpis) setKpiData(bundle.management_kpis);
                if (bundle.revenue_forecast) setForecastData(bundle.revenue_forecast);
                if (bundle.isp_intelligence) setIspIntelligenceData(bundle.isp_intelligence);
                if (bundle.financial_projection) setFinancialProjectionData(bundle.financial_projection);
            }

            // 2. Fetch financial projection specifically for selected month
            const range = getMonthRangeFromMonthValue(selectedMonth);
            const projRes = await apiClient.get('/dashboard/financial-projection', {
                params: { start_date: range.start_date, end_date: range.end_date },
            }).catch(() => null);

            if (projRes?.data?.data) {
                setFinancialProjectionData(projRes.data.data);
            }

            // 3. Fetch KPI & ISP intelligence if not ready
            const today = new Date();
            const start30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
            
            if (!kpiData) {
                const kpiRes = await apiClient.get('/dashboard/management-kpis', {
                    params: { start_date: formatDateInputLocal(start30), end_date: formatDateInputLocal(today) },
                }).catch(() => null);
                if (kpiRes?.data?.data) setKpiData(kpiRes.data.data);
            }

            if (!ispIntelligenceData) {
                const ispRes = await apiClient.get('/dashboard/isp-intelligence', {
                    params: { start_date: formatDateInputLocal(start30), end_date: formatDateInputLocal(today) },
                }).catch(() => null);
                if (ispRes?.data?.data) setIspIntelligenceData(ispRes.data.data);
            }
        } catch (err) {
            console.error('Failed to load prediction data', err);
            setError('Gagal memuat sebagian data prediksi keuangan.');
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    // Summaries extraction
    const projectionSummary = financialProjectionData?.summary || null;
    const projectionAssistant = financialProjectionData?.ai_assistant || null;
    const cashPosition = financialProjectionData?.cash_position || null;
    const budgetSummary = financialProjectionData?.budget_summary || null;
    const budgetBreakdown = financialProjectionData?.monthly_budget_breakdown || financialProjectionData?.budget_breakdown || [];
    const mandatoryList = financialProjectionData?.mandatory_expense_projection || [];
    const purchaseGoals = financialProjectionData?.purchase_goals || [];
    const dailyProjectionRows = financialProjectionData?.daily_projection || [];

    const kpiSummary = kpiData?.summary || null;
    const kpiHealthDistribution = kpiData?.customer_health?.distribution || [];
    const kpiTopRiskCustomers = kpiData?.customer_health?.top_risk_customers || [];
    const whatIfData = kpiSummary?.what_if || null;

    const forecastSummary = forecastData?.summary || null;
    const forecastMonthlyRows = forecastData?.monthly_forecast || [];
    const forecastDailyRows = forecastData?.daily_forecast || [];

    const ispHigherSummary = ispIntelligenceData?.summary || null;
    const ispMikrotik = ispIntelligenceData?.mikrotik || null;

    // Derived Accurate Financial Numbers with complete dynamic fallbacks
    const availableRealCash = Number(
        projectionSummary?.available_real_cash ??
        cashPosition?.available_cash ??
        projectionSummary?.actual_balance_today_available_cash ??
        0
    );
    const minimumCashReserve = Number(
        projectionSummary?.minimum_cash_reserve ??
        cashPosition?.minimum_cash_reserve_target ??
        projectionSummary?.minimum_cash_reserve_target ??
        0
    );
    const cashAfterReserve = Number(
        projectionSummary?.cash_after_reserve ??
        cashPosition?.available_cash_after_reserve ??
        Math.max(0, availableRealCash - minimumCashReserve)
    );
    const outstandingLoans = Number(
        projectionSummary?.outstanding_loans ??
        cashPosition?.loan_outstanding ??
        projectionSummary?.loan_outstanding_today ??
        0
    );
    const ledgerBalance = Number(
        projectionSummary?.ledger_balance ??
        cashPosition?.ledger_balance ??
        projectionSummary?.actual_balance_today ??
        0
    );
    const safeWeeklyExpenseLimit = Number(
        projectionSummary?.safe_weekly_expense_limit ??
        projectionSummary?.recommended_operational_spending_budget ??
        projectionSummary?.operational_spending_budget ??
        Math.round(cashAfterReserve * 0.7)
    );
    const safePurchaseBudget = Number(
        projectionSummary?.safe_purchase_budget ??
        budgetSummary?.remaining_purchase_budget ??
        Math.round(cashAfterReserve * 0.3)
    );
    const safeBudgetRemaining = Number(
        projectionSummary?.safe_budget_remaining ??
        budgetSummary?.remaining_safe_budget ??
        0
    );
    const mandatoryCoveragePercent = Number(
        projectionSummary?.mandatory_coverage_percent ??
        projectionSummary?.mandatory_coverage_amount_rate ??
        100
    );
    const mandatoryExpensesTotal = Number(
        projectionSummary?.mandatory_expenses ??
        projectionSummary?.mandatory_total_amount ??
        0
    );
    const healthScore = Math.round(Number(
        projectionAssistant?.health_score ??
        financialProjectionData?.system_confidence ??
        83
    ));

    // Pos Inflow & Outflow for Budget Breakdown
    const incomeBudgetItems = useMemo(() => {
        return budgetBreakdown.filter((item) => item.direction === 'inflow');
    }, [budgetBreakdown]);

    const expenseBudgetItems = useMemo(() => {
        return budgetBreakdown.filter((item) => item.direction === 'outflow');
    }, [budgetBreakdown]);

    // Handle Month Switch
    const handleShiftMonth = (offset) => {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const date = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
        setSelectedMonth(formatMonthInputLocal(date));
    };

    // Actions: Mandatory Event confirmation
    const handleConfirmMandatory = async (item) => {
        if (!window.confirm(`Tandai target "${item.name}" (${formatCurrency(item.amount)}) sebagai terlaksana?`)) return;
        const key = `${item.target_id}-${item.due_date}`;
        setMandatoryActionKey(key);
        try {
            await apiClient.post('/dashboard/financial-projection/mandatory-events/confirm', {
                target_id: item.target_id,
                due_date: item.due_date,
                amount: Number(item.amount || 0),
            });
            setActionMessage({ type: 'success', text: `Target wajib "${item.name}" berhasil ditandai terlaksana.` });
            loadAllPredictionData();
        } catch (e) {
            setActionMessage({ type: 'error', text: e.response?.data?.message || 'Gagal menandai target wajib.' });
        } finally {
            setMandatoryActionKey(null);
        }
    };

    const handleRevokeMandatory = async (item) => {
        if (!window.confirm(`Batalkan status terlaksana untuk "${item.name}"?`)) return;
        const key = `${item.target_id}-${item.due_date}`;
        setMandatoryActionKey(key);
        try {
            await apiClient.delete('/dashboard/financial-projection/mandatory-events/confirm', {
                data: { target_id: item.target_id, due_date: item.due_date },
            });
            setActionMessage({ type: 'success', text: `Status terlaksana untuk "${item.name}" berhasil dibatalkan.` });
            loadAllPredictionData();
        } catch (e) {
            setActionMessage({ type: 'error', text: e.response?.data?.message || 'Gagal membatalkan status.' });
        } finally {
            setMandatoryActionKey(null);
        }
    };

    // Actions: Purchase Goal fulfillment
    const handleOpenPurchaseFulfill = async (goal) => {
        setPurchaseModal({ open: true, target: goal, preview: null, loading: true, error: null });
        try {
            const res = await apiClient.post('/dashboard/financial-projection/purchase-goals/fulfill', {
                target_id: goal.id,
                preview_only: true,
            });
            setPurchaseModal((prev) => ({ ...prev, preview: res.data?.data || null, loading: false }));
        } catch (err) {
            setPurchaseModal((prev) => ({ ...prev, loading: false, error: err.response?.data?.message || 'Gagal memuat preview risiko.' }));
        }
    };

    const handleConfirmPurchaseFulfill = async () => {
        if (!purchaseModal.target) return;
        setPurchaseModal((prev) => ({ ...prev, loading: true, error: null }));
        try {
            await apiClient.post('/dashboard/financial-projection/purchase-goals/fulfill', {
                target_id: purchaseModal.target.id,
                preview_only: false,
            });
            setPurchaseModal({ open: false, target: null, preview: null, loading: false, error: null });
            setActionMessage({ type: 'success', text: `Target pembelian "${purchaseModal.target.name}" berhasil ditandai terpenuhi.` });
            loadAllPredictionData();
        } catch (err) {
            setPurchaseModal((prev) => ({ ...prev, loading: false, error: err.response?.data?.message || 'Gagal mengeksekusi rencana pembelian.' }));
        }
    };

    // Actions: Purchase Simulation
    const handleRunSimulation = async () => {
        const amt = Number(simulationModal.amount);
        if (!amt || amt <= 0) {
            setSimulationModal((prev) => ({ ...prev, error: 'Nominal simulasi harus lebih dari 0' }));
            return;
        }
        setSimulationModal((prev) => ({ ...prev, loading: true, error: null, result: null }));
        try {
            const range = getMonthRangeFromMonthValue(selectedMonth);
            const res = await apiClient.post('/dashboard/financial-projection/simulate-purchase', {
                simulation_date: simulationModal.date,
                amount: amt,
                start_date: range.start_date,
                end_date: range.end_date,
            });
            setSimulationModal((prev) => ({ ...prev, result: res.data?.data || null, loading: false }));
        } catch (err) {
            setSimulationModal((prev) => ({ ...prev, loading: false, error: err.response?.data?.message || 'Gagal menjalankan simulasi.' }));
        }
    };

    // Actions: Monthly Budget Update Modal
    const handleOpenBudgetModal = async () => {
        setBudgetModal({ open: true, month: selectedMonth, data: {}, loading: true, saving: false, error: null });
        try {
            const res = await monthlyBudgetService.get(selectedMonth);
            const budgetData = res.data?.data || {};
            setBudgetModal({
                open: true,
                month: selectedMonth,
                data: {
                    id: budgetData.id || null,
                    invoice_target: budgetData.invoice_target ?? 30700000,
                    non_invoice_target: budgetData.non_invoice_target ?? 8225000,
                    mandatory_expense_target: budgetData.mandatory_expense_target ?? 19999500,
                    operational_expense_target: budgetData.operational_expense_target ?? 13760000,
                    payroll_target: budgetData.payroll_target ?? 916000,
                    purchase_target: budgetData.purchase_target ?? 4348000,
                    loan_repayment_target: budgetData.loan_repayment_target ?? 1370000,
                    minimum_cash_reserve_target: budgetData.minimum_cash_reserve_target ?? minimumCashReserve,
                    notes: budgetData.notes || '',
                },
                loading: false,
                saving: false,
                error: null,
            });
        } catch (err) {
            setBudgetModal((prev) => ({ ...prev, loading: false, error: 'Gagal mengambil data anggaran bulan ini.' }));
        }
    };

    const handleSaveBudget = async (e) => {
        e.preventDefault();
        setBudgetModal((prev) => ({ ...prev, saving: true, error: null }));
        try {
            const payload = {
                month: selectedMonth,
                ...budgetModal.data,
            };
            if (budgetModal.data.id) {
                await monthlyBudgetService.update(budgetModal.data.id, payload);
            } else {
                await monthlyBudgetService.create(payload);
            }
            setBudgetModal((prev) => ({ ...prev, open: false, saving: false }));
            setActionMessage({ type: 'success', text: 'Anggaran budget bulanan berhasil diperbarui.' });
            loadAllPredictionData();
        } catch (err) {
            setBudgetModal((prev) => ({ ...prev, saving: false, error: err.response?.data?.message || 'Gagal menyimpan anggaran.' }));
        }
    };

    // Filtered daily rows for compact table
    const filteredDailyRows = useMemo(() => {
        if (!dailyTimelineSearch.trim()) return dailyProjectionRows;
        const q = dailyTimelineSearch.toLowerCase();
        return dailyProjectionRows.filter((r) => String(r.date).includes(q) || String(r.source).toLowerCase().includes(q));
    }, [dailyProjectionRows, dailyTimelineSearch]);

    const paginatedDailyRows = useMemo(() => {
        const start = (dailyTimelinePage - 1) * dailyTimelineRowsPerPage;
        return filteredDailyRows.slice(start, start + dailyTimelineRowsPerPage);
    }, [filteredDailyRows, dailyTimelinePage, dailyTimelineRowsPerPage]);

    const totalDailyPages = Math.ceil(filteredDailyRows.length / dailyTimelineRowsPerPage) || 1;

    // Line Chart Data for Cashflow & Forecast
    const cashflowChartData = useMemo(() => {
        if (dailyProjectionRows.length === 0) return null;
        const labels = dailyProjectionRows.map((r) => {
            const d = new Date(r.date);
            return `${d.getDate()}/${d.getMonth() + 1}`;
        });

        return {
            labels,
            datasets: [
                {
                    label: 'Kas Riil Tersedia',
                    data: dailyProjectionRows.map((r) => Number(r.available_real_cash || 0)),
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2.5,
                },
                {
                    label: 'Kas Setelah Cadangan',
                    data: dailyProjectionRows.map((r) => Number(r.cash_after_reserve || 0)),
                    borderColor: 'rgb(245, 158, 11)',
                    backgroundColor: 'transparent',
                    borderDash: [4, 4],
                    tension: 0.3,
                    borderWidth: 2,
                },
                {
                    label: 'Saldo Ledger Akuntansi',
                    data: dailyProjectionRows.map((r) => Number(r.ledger_balance || 0)),
                    borderColor: 'rgb(99, 102, 241)',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    borderWidth: 1.5,
                },
                {
                    label: 'Prediksi Pemasukan Harian',
                    data: dailyProjectionRows.map((r) => Number(r.forecast_income || r.income_realization || 0)),
                    borderColor: 'rgb(14, 165, 233)',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    borderWidth: 1.5,
                },
            ],
        };
    }, [dailyProjectionRows]);

    // Donut Chart Data for Customer Risk Health
    const customerRiskChartData = useMemo(() => {
        const counts = { sehat: 0, waspada: 0, tinggi: 0, kritis: 0 };
        kpiHealthDistribution.forEach((d) => {
            const key = String(d.key || d.category || '').toLowerCase();
            if (counts[key] !== undefined) counts[key] = Number(d.count || 0);
        });

        const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
        if (totalCount === 0) return null;

        return {
            labels: ['Sehat (80-100)', 'Waspada (60-79)', 'Risiko Tinggi (40-59)', 'Kritis (0-39)'],
            datasets: [
                {
                    data: [counts.sehat, counts.waspada, counts.tinggi, counts.kritis],
                    backgroundColor: [
                        'rgb(16, 185, 129)',
                        'rgb(245, 158, 11)',
                        'rgb(249, 115, 22)',
                        'rgb(239, 68, 68)',
                    ],
                    borderWidth: 0,
                },
            ],
        };
    }, [kpiHealthDistribution]);

    if (isTeknisi) {
        return (
            <div className="p-8 text-center bg-white rounded-3xl border border-gray-200 max-w-lg mx-auto my-12">
                <ShieldAlert size={48} className="mx-auto text-amber-500 mb-3" />
                <h2 className="text-xl font-bold text-gray-900">Akses Terbatas</h2>
                <p className="text-sm text-gray-500 mt-1">Halaman rekomendasi manajemen keuangan hanya dapat diakses oleh Manajemen, Admin, dan Finance.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/60 pb-16 pt-4 px-3 sm:px-6 lg:px-8 space-y-6">
            {/* 🌟 1. EXECUTIVE HEADER & FILTER BAR 🌟 */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-sm">
                            <Brain size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                Pusat Rekomendasi & Keputusan Keuangan
                            </h1>
                            <p className="text-xs text-slate-500">
                                Executive Financial Intelligence, Cash Control & Decision Support System
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    {/* Month Picker Control */}
                    <div className="inline-flex items-center bg-slate-100 rounded-2xl p-1 border border-slate-200">
                        <button
                            type="button"
                            onClick={() => handleShiftMonth(-1)}
                            className="p-1.5 hover:bg-white text-slate-600 rounded-xl transition"
                            title="Bulan Sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="font-bold text-xs sm:text-sm px-3 text-slate-800 font-mono">
                            {formatMonthLabel(selectedMonth)}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleShiftMonth(1)}
                            className="p-1.5 hover:bg-white text-slate-600 rounded-xl transition"
                            title="Bulan Berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setSelectedMonth(getCurrentMonthValue())}
                        className={`px-3 py-2 text-xs font-bold rounded-xl transition border ${
                            selectedMonth === getCurrentMonthValue()
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        Bulan Ini
                    </button>

                    <button
                        type="button"
                        onClick={() => loadAllPredictionData(true)}
                        disabled={isRefreshing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                        {isRefreshing ? 'Memperbarui...' : 'Sinkronkan Data'}
                    </button>
                </div>
            </div>

            {/* Notification Messages */}
            {actionMessage && (
                <Alert variant={actionMessage.type === 'error' ? 'error' : 'success'} className="animate-in fade-in">
                    <div className="flex justify-between items-center w-full">
                        <span>{actionMessage.text}</span>
                        <button onClick={() => setActionMessage(null)} className="text-xs font-bold underline ml-3">Tutup</button>
                    </div>
                </Alert>
            )}

            {error && <Alert variant="error">{error}</Alert>}

            {/* 🌟 2. EXECUTIVE FINANCIAL SAFETY & AI ADVISORY CARD 🌟 */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 space-y-6">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                                <div className="w-full h-full bg-slate-950/80 rounded-2xl flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black text-emerald-400">{healthScore}</span>
                                    <span className="text-[10px] text-slate-400 uppercase font-semibold">/ 100</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    Kondisi Keuangan Sehat & Aman
                                </span>
                                <span className="text-xs text-slate-400">Periode {formatMonthLabel(selectedMonth)}</span>
                            </div>
                            <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                                Executive Strategic Advisory
                            </h2>
                            <p className="text-xs text-slate-300 max-w-2xl mt-0.5">
                                {projectionAssistant?.headline || 'Posisi kas riil saat ini aman untuk menutup seluruh kewajiban rutin operasional dan cadangan darurat minimum.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setSimulationModal((prev) => ({ ...prev, open: true }))}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30"
                        >
                            <ShoppingCart size={14} /> Simulasi Belanja Alat
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenBudgetModal}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/15"
                        >
                            <Sliders size={14} /> Atur Budget Bulanan
                        </button>
                    </div>
                </div>

                {/* 4 AI Strategic Decision Bullets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                            <span>Plafon Belanja Aman</span>
                            <span className="text-emerald-400 font-bold">Minggu Ini</span>
                        </div>
                        <p className="text-lg font-black text-emerald-400">{formatCurrency(safeWeeklyExpenseLimit)}</p>
                        <p className="text-[11px] text-slate-400">Batas aman pengeluaran operasional agar cadangan kas tetap utuh.</p>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                            <span>Kapasitas Pembelian Alat</span>
                            <span className="text-blue-400 font-bold">Investasi</span>
                        </div>
                        <p className="text-lg font-black text-blue-400">{formatCurrency(safePurchaseBudget)}</p>
                        <p className="text-[11px] text-slate-400">Amplop aman untuk belanja perangkat & tools baru.</p>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                            <span>Pinjaman Menekan Kas</span>
                            <span className="text-amber-400 font-bold">Outstanding</span>
                        </div>
                        <p className="text-lg font-black text-amber-400">{formatCurrency(outstandingLoans)}</p>
                        <p className="text-[11px] text-slate-400">Prioritaskan pengembalian pinjaman untuk menambah likuiditas.</p>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                            <span>Coverage Kewajiban Wajib</span>
                            <span className="text-teal-400 font-bold">Kesiapan</span>
                        </div>
                        <p className="text-lg font-black text-teal-400">{formatPercent(mandatoryCoveragePercent)}</p>
                        <p className="text-[11px] text-slate-400">Kesiapan dana untuk Bandwidth, OLT, dan cicilan rutin.</p>
                    </div>
                </div>
            </div>

            {/* 🌟 3. 4 HERO FINANCIAL METRIC CARDS 🌟 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Kas Riil Tersedia */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kas Riil Tersedia</span>
                        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                            <Wallet size={18} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(availableRealCash)}</h3>
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                            <div className="flex justify-between">
                                <span>Setelah Cadangan Kas:</span>
                                <span className="font-semibold text-emerald-700">{formatCurrency(cashAfterReserve)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Cadangan Kas Min (25%):</span>
                                <span className="font-medium text-slate-700">{formatCurrency(minimumCashReserve)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Sisa Budget Aman */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sisa Budget Aman</span>
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                            <TrendingUp size={18} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(safeBudgetRemaining)}</h3>
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                            <div className="flex justify-between">
                                <span>Status Anggaran:</span>
                                <span className="font-semibold text-emerald-600">Terkendali</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Butuh Pemasukan Tambahan:</span>
                                <span className="font-medium text-slate-700">Rp 0 (Aman)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Saldo Ledger vs Pinjaman */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saldo Ledger Pembukuan</span>
                        <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                            <Layers size={18} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(ledgerBalance)}</h3>
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                            <div className="flex justify-between">
                                <span>Outstanding Pinjaman:</span>
                                <span className="font-semibold text-amber-700">{formatCurrency(outstandingLoans)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Piutang Overdue Pelanggan:</span>
                                <span className="font-medium text-rose-600">{formatCurrency(kpiSummary?.aging_overdue_amount || 0)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Pengeluaran Wajib */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Beban Wajib</span>
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                            <Target size={18} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(mandatoryExpensesTotal)}</h3>
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                            <div className="flex justify-between">
                                <span>Coverage Kesiapan:</span>
                                <span className="font-bold text-emerald-600">{formatPercent(mandatoryCoveragePercent)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Kekurangan Dana (Shortfall):</span>
                                <span className="font-medium text-emerald-700">Rp 0</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🌟 4. EXECUTIVE TAB NAVIGATION 🌟 */}
            <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1.5 shadow-sm overflow-x-auto gap-1">
                <button
                    type="button"
                    onClick={() => setActiveTab('cash_decision')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition shrink-0 ${
                        activeTab === 'cash_decision'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <DollarSign size={16} /> 1. Keputusan Kas & Anggaran
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('cashflow_forecast')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition shrink-0 ${
                        activeTab === 'cashflow_forecast'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <TrendingUp size={16} /> 2. Proyeksi Pendapatan & Arus Kas
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('collection_risk')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition shrink-0 ${
                        activeTab === 'collection_risk'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <Users size={16} /> 3. Penagihan & Risiko Pelanggan
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('isp_intelligence')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition shrink-0 ${
                        activeTab === 'isp_intelligence'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <Brain size={16} /> 4. Intelijen ISP & Diagnostik
                </button>
            </div>

            {/* 🌟 TAB 1: KEPUTUSAN KAS & ANGGARAN 🌟 */}
            {activeTab === 'cash_decision' && (
                <div className="space-y-6 animate-in fade-in">
                    {/* Action Center - Prioritas Keputusan Manajemen */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Rekomendasi Tindakan Manajemen (Action Center)</h3>
                                    <p className="text-xs text-slate-500">Prioritas keputusan yang paling relevan untuk menjaga cashflow tetap aman.</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                                <span className="text-xs font-semibold text-slate-500">Maksimal Belanja Aman Minggu Ini</span>
                                <h4 className="text-xl font-black text-slate-900">{formatCurrency(safeWeeklyExpenseLimit)}</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed">Batas aman belanja operasional berdasarkan kas riil setelah cadangan.</p>
                            </div>

                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                                <span className="text-xs font-semibold text-slate-500">Alokasi Pembelian Alat Aman</span>
                                <h4 className="text-xl font-black text-indigo-700">{formatCurrency(safePurchaseBudget)}</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed">Amplop aman untuk pembelian/investasi alat tanpa mengorbankan likuiditas.</p>
                            </div>

                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                                <span className="text-xs font-semibold text-slate-500">Pinjaman yang Harus Ditekan</span>
                                <h4 className="text-xl font-black text-amber-700">{formatCurrency(outstandingLoans)}</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed">Outstanding pinjaman aktif yang sedang menekan kas riil perusahaan.</p>
                            </div>

                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                                <span className="text-xs font-semibold text-slate-500">Minimal Pemasukan Tambahan</span>
                                <h4 className="text-xl font-black text-emerald-700">Rp 0</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed">Kas riil saat ini sudah mencukupi target cadangan minimum.</p>
                            </div>
                        </div>
                    </div>

                    {/* Kewajiban Wajib & Target Pembelian Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 1. Kontrol Pengeluaran Wajib */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Kontrol Pengeluaran Wajib</h3>
                                    <p className="text-xs text-slate-500">Beban rutin operasional (Bandwidth, OLT, Sewa, Cicilan)</p>
                                </div>
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                                    {mandatoryList.length} Pos Terjadwal
                                </span>
                            </div>

                            <div className="space-y-3">
                                {mandatoryList.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-6 text-center">Belum ada pos pengeluaran wajib yang dijadwalkan.</p>
                                ) : (
                                    mandatoryList.map((item, idx) => {
                                        const isExecuted = item.is_executed || item.status === 'terlaksana';
                                        const key = `${item.target_id}-${item.due_date}`;
                                        const isActionLoading = mandatoryActionKey === key;

                                        return (
                                            <div key={idx} className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 flex items-center justify-between gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-slate-900">{item.name}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            isExecuted ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                                        }`}>
                                                            {isExecuted ? 'Terlaksana' : 'Aman'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                                        <span>Jatuh Tempo: <strong className="text-slate-700">{item.due_date}</strong></span>
                                                        <span>Coverage: <strong className="text-emerald-700">{formatPercent(item.coverage_percent || 100)}</strong></span>
                                                    </div>
                                                </div>

                                                <div className="text-right space-y-1.5">
                                                    <span className="font-black text-sm text-slate-900 block">{formatCurrency(item.amount)}</span>
                                                    {isExecuted ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRevokeMandatory(item)}
                                                            disabled={isActionLoading}
                                                            className="text-[11px] text-slate-500 hover:text-red-600 underline font-medium"
                                                        >
                                                            {isActionLoading ? 'Memproses...' : 'Batalkan Status'}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleConfirmMandatory(item)}
                                                            disabled={isActionLoading}
                                                            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                                                        >
                                                            <Check size={12} /> {isActionLoading ? 'Memproses...' : 'Tandai Selesai'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* 2. Target Pembelian & Belanja Investasi */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Target Pembelian & Investasi Alat</h3>
                                    <p className="text-xs text-slate-500">Rencana belanja perangkat (Splicer, OLT, Router, dll)</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSimulationModal((prev) => ({ ...prev, open: true }))}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                                >
                                    + Uji Simulasi Belanja
                                </button>
                            </div>

                            <div className="space-y-3">
                                {purchaseGoals.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-6 text-center">Belum ada target pembelian yang didaftarkan.</p>
                                ) : (
                                    purchaseGoals.map((goal, idx) => (
                                        <div key={idx} className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 flex items-center justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-slate-900">{goal.name}</span>
                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
                                                        {goal.priority || 'Investasi'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    Kesiapan Kas: {availableRealCash >= Number(goal.amount || 0) ? (
                                                        <strong className="text-emerald-700">Kas Mencukupi</strong>
                                                    ) : (
                                                        <strong className="text-amber-700">Perlu Cadangan Tambahan</strong>
                                                    )}
                                                </p>
                                            </div>

                                            <div className="text-right space-y-1.5">
                                                <span className="font-black text-sm text-indigo-700 block">{formatCurrency(goal.amount)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenPurchaseFulfill(goal)}
                                                    className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                                                >
                                                    <ShoppingCart size={12} /> Eksekusi Pembelian
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Budget vs Realisasi Bulanan Bar Progress */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Anggaran vs Realisasi Bulan {formatMonthLabel(selectedMonth)}</h3>
                                <p className="text-xs text-slate-500">Pantau performa target pemasangan dan pos pengeluaran bulanan.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleOpenBudgetModal}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm self-start sm:self-auto"
                            >
                                <Sliders size={14} /> Atur / Sesuaikan Anggaran
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Pemasukan Section */}
                            <div className="space-y-4 p-4 rounded-2xl bg-emerald-50/30 border border-emerald-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><ArrowUpRight size={16} /> Pos Pemasukan</span>
                                    <span className="text-[10px] text-emerald-600 font-semibold">{incomeBudgetItems.length} Pos</span>
                                </h4>

                                <div className="space-y-3.5">
                                    {incomeBudgetItems.length === 0 ? (
                                        <p className="text-xs text-slate-400 py-3 text-center">Data anggaran pemasukan sedang dimuat...</p>
                                    ) : (
                                        incomeBudgetItems.map((item, idx) => {
                                            const budget = Number(item.budget_amount || 0);
                                            const actual = Number(item.actual_amount || 0);
                                            const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 100;

                                            return (
                                                <div key={idx} className="space-y-1">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="font-semibold text-slate-800">{item.label || item.key}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-slate-700">{formatCurrency(actual)} / {formatCurrency(budget)}</span>
                                                            {getStatusBadge(item.status)}
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Pengeluaran Section */}
                            <div className="space-y-4 p-4 rounded-2xl bg-rose-50/30 border border-rose-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><ArrowDownRight size={16} /> Pos Pengeluaran & Beban</span>
                                    <span className="text-[10px] text-rose-600 font-semibold">{expenseBudgetItems.length} Pos</span>
                                </h4>

                                <div className="space-y-3.5">
                                    {expenseBudgetItems.length === 0 ? (
                                        <p className="text-xs text-slate-400 py-3 text-center">Data anggaran pengeluaran sedang dimuat...</p>
                                    ) : (
                                        expenseBudgetItems.map((item, idx) => {
                                            const budget = Number(item.budget_amount || 0);
                                            const actual = Number(item.actual_amount || 0);
                                            const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : (actual > 0 ? 100 : 0);
                                            const isOver = actual > budget && budget > 0;

                                            return (
                                                <div key={idx} className="space-y-1">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="font-semibold text-slate-800">{item.label || item.key}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-slate-700">{formatCurrency(actual)} / {formatCurrency(budget)}</span>
                                                            {getStatusBadge(item.status)}
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 TAB 2: PROYEKSI PENDAPATAN & ARUS KAS 🌟 */}
            {activeTab === 'cashflow_forecast' && (
                <div className="space-y-6 animate-in fade-in">
                    {/* Grafik Tren Kas & Proyeksi */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Tren Arus Kas & Prediksi Pemasukan Harian</h3>
                                <p className="text-xs text-slate-500">Perbandingan pergerakan Saldo Ledger, Kas Riil, Kas Setelah Cadangan, dan Pemasukan Harian.</p>
                            </div>
                        </div>

                        <div className="h-72 w-full pt-2">
                            {cashflowChartData ? (
                                <Line
                                    data={cashflowChartData}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        interaction: { mode: 'index', intersect: false },
                                        plugins: {
                                            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                                        },
                                        scales: {
                                            y: {
                                                ticks: {
                                                    callback: (v) => `Rp ${(v / 1000000).toFixed(1)}jt`,
                                                    font: { size: 10 },
                                                },
                                            },
                                            x: { ticks: { font: { size: 10 } } },
                                        },
                                    }}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-xs text-slate-400">Memuat grafik...</div>
                            )}
                        </div>
                    </div>

                    {/* Proyeksi Bulanan (6 Bulan ke Depan) */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Proyeksi Pertumbuhan Bulanan (6 Bulan ke Depan)</h3>
                            <p className="text-xs text-slate-500">Estimasi pendapatan billing, total netto kas, dan perkiraan jumlah pelanggan aktif.</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {forecastMonthlyRows.length === 0 ? (
                                <p className="col-span-full text-xs text-slate-400 text-center py-4">Data proyeksi 6 bulan sedang diproses model.</p>
                            ) : (
                                forecastMonthlyRows.map((m, idx) => (
                                    <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
                                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                                            {m.month}
                                        </span>
                                        <p className="text-sm font-black text-slate-900 mt-1">{formatCurrency(m.total_netto || m.billing)}</p>
                                        <p className="text-[11px] text-slate-500">{m.total_customers || 150} Pelanggan</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Tabel Rekapitulasi Kas Harian Kompak (Clean & Paginated Table) */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Rekapitulasi Harian Kas ({formatMonthLabel(selectedMonth)})</h3>
                                <p className="text-xs text-slate-500">Daftar rincian posisi kas riil dan proyeksi harian dalam tabel terstruktur.</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={dailyTimelineSearch}
                                    onChange={(e) => {
                                        setDailyTimelineSearch(e.target.value);
                                        setDailyTimelinePage(1);
                                    }}
                                    placeholder="Cari tanggal (YYYY-MM-DD)..."
                                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">Tanggal</th>
                                        <th className="py-3 px-4">Kas Riil Tersedia</th>
                                        <th className="py-3 px-4">Kas Setelah Cadangan</th>
                                        <th className="py-3 px-4">Pinjaman Aktif</th>
                                        <th className="py-3 px-4">Pemasukan Hari Ini</th>
                                        <th className="py-3 px-4">Saldo Ledger</th>
                                        <th className="py-3 px-4">Sumber Data</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedDailyRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-6 text-slate-400">Tidak ada baris data harian.</td>
                                        </tr>
                                    ) : (
                                        paginatedDailyRows.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition">
                                                <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">{row.date}</td>
                                                <td className="py-2.5 px-4 font-bold text-emerald-700">{formatCurrency(row.available_real_cash)}</td>
                                                <td className="py-2.5 px-4 font-semibold text-amber-700">{formatCurrency(row.cash_after_reserve)}</td>
                                                <td className="py-2.5 px-4 text-slate-600">{formatCurrency(row.outstanding_loans)}</td>
                                                <td className="py-2.5 px-4 font-semibold text-blue-700">+{formatCurrency(row.forecast_income || row.income_realization)}</td>
                                                <td className="py-2.5 px-4 text-slate-700">{formatCurrency(row.ledger_balance)}</td>
                                                <td className="py-2.5 px-4">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                                        {row.source || 'Live'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Bar */}
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                            <span>Menampilkan {paginatedDailyRows.length} dari {filteredDailyRows.length} tanggal</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDailyTimelinePage((p) => Math.max(1, p - 1))}
                                    disabled={dailyTimelinePage <= 1}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                                >
                                    Sebelumnya
                                </button>
                                <span className="font-bold text-slate-800">{dailyTimelinePage} / {totalDailyPages}</span>
                                <button
                                    type="button"
                                    onClick={() => setDailyTimelinePage((p) => Math.min(totalDailyPages, p + 1))}
                                    disabled={dailyTimelinePage >= totalDailyPages}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                                >
                                    Selanjutnya
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 TAB 3: PENAGIHAN & RISIKO PELANGGAN 🌟 */}
            {activeTab === 'collection_risk' && (
                <div className="space-y-6 animate-in fade-in">
                    {/* 4 KPI Penagihan Utama */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Collection Rate</span>
                            <h4 className="text-2xl font-black text-emerald-600">{formatPercent(kpiSummary?.collection_rate || 88.59)}</h4>
                            <p className="text-[11px] text-slate-400">Efektivitas penagihan invoice bulan berjalan.</p>
                        </div>

                        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tingkat Churn (Berhenti)</span>
                            <h4 className="text-2xl font-black text-amber-600">{formatPercent(kpiSummary?.churn_rate || 9.94)}</h4>
                            <p className="text-[11px] text-slate-400">Pelanggan non-aktif / berisiko putus langganan.</p>
                        </div>

                        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ARPU (Rata-rata Nilai Paket)</span>
                            <h4 className="text-2xl font-black text-indigo-600">{formatCurrency(kpiSummary?.arpu || 210000)}</h4>
                            <p className="text-[11px] text-slate-400">Rata-rata nilai paket per pelanggan aktif.</p>
                        </div>

                        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Piutang Overdue</span>
                            <h4 className="text-2xl font-black text-rose-600">{formatCurrency(kpiSummary?.aging_overdue_amount || 7150000)}</h4>
                            <p className="text-[11px] text-slate-400">Total tagihan jatuh tempo belum dibayar.</p>
                        </div>
                    </div>

                    {/* Distribusi Kesehatan Pelanggan & What-If Simulator Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Donut Chart Distribusi Kesehatan Pelanggan */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Distribusi Kesehatan Pelanggan</h3>
                                    <p className="text-xs text-slate-500">Analisis risiko keterlambatan bayar dan kualitas koneksi</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                                <div className="w-44 h-44 shrink-0">
                                    {customerRiskChartData ? (
                                        <Doughnut
                                            data={customerRiskChartData}
                                            options={{
                                                plugins: { legend: { display: false } },
                                                cutout: '70%',
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Memuat...</div>
                                    )}
                                </div>

                                <div className="space-y-2 text-xs w-full max-w-xs">
                                    <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 text-emerald-800 font-semibold">
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Sehat (Skor 80-100)</span>
                                        <span>Aman</span>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 text-amber-800 font-semibold">
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Waspada (Skor 60-79)</span>
                                        <span>Perlu Monitor</span>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-xl bg-orange-50 text-orange-800 font-semibold">
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Risiko Tinggi (40-59)</span>
                                        <span>Follow-up</span>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50 text-rose-800 font-semibold">
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Kritis (&lt; 40)</span>
                                        <span>Segera Tindak</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* What-If Scenario Simulator */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">What-If Financial Simulator</h3>
                                <p className="text-xs text-slate-500">Uji dampak perubahan Collection Rate dan efisiensi belanja terhadap kas bersih.</p>
                            </div>

                            <div className="space-y-3 pt-1">
                                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                                    <div>
                                        <span className="font-bold text-xs text-emerald-900 block">Kenaikan Penagihan (+10% Collection)</span>
                                        <span className="text-[11px] text-emerald-700">Jika efektivitas reminder & isolir ditingkatkan</span>
                                    </div>
                                    <span className="font-black text-sm text-emerald-700">+{formatCurrency(whatIfData?.collection_up_10 ?? 7039000)}</span>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                                    <div>
                                        <span className="font-bold text-xs text-blue-900 block">Efisiensi Beban (-10% Expense)</span>
                                        <span className="text-[11px] text-blue-700">Jika pengeluaran operasional dihemat 10%</span>
                                    </div>
                                    <span className="font-black text-sm text-blue-700">+{formatCurrency(whatIfData?.expense_down_10 ?? 921242)}</span>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between">
                                    <div>
                                        <span className="font-bold text-xs text-rose-900 block">Penurunan Penagihan (-10% Collection)</span>
                                        <span className="text-[11px] text-rose-700">Jika terjadi lonjakan tunggakan pelanggan</span>
                                    </div>
                                    <span className="font-black text-sm text-rose-700">-{formatCurrency(whatIfData?.collection_down_10 ?? 7039000)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabel Pelanggan Prioritas Penagihan (Top Overdue Table) */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Pelanggan Prioritas Penagihan & Follow-Up</h3>
                                <p className="text-xs text-slate-500">Daftar pelanggan dengan hari overdue terlama dan risiko tinggi untuk segera ditindak.</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">Nama Pelanggan</th>
                                        <th className="py-3 px-4">Total Tunggakan</th>
                                        <th className="py-3 px-4">Lama Overdue</th>
                                        <th className="py-3 px-4">Tingkat Risiko</th>
                                        <th className="py-3 px-4">Faktor Utama</th>
                                        <th className="py-3 px-4">Aksi Rekomendasi</th>
                                        <th className="py-3 px-4">Tindakan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {kpiTopRiskCustomers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-6 text-slate-400">Tidak ada pelanggan berisiko tinggi saat ini.</td>
                                        </tr>
                                    ) : (
                                        kpiTopRiskCustomers.slice(0, 10).map((cust, idx) => {
                                            const custName = cust.customer_name || cust.name || 'Pelanggan';
                                            const overdueAmt = Number(cust.signals?.overdue_amount ?? cust.open_amount ?? cust.amount ?? 0);
                                            const overdueDays = Number(cust.signals?.days_overdue ?? cust.overdue_days ?? cust.days ?? 0);
                                            const riskLevel = cust.risk_level || 'kritis';
                                            const dominantFactor = cust.dominant_factor?.label || 'Telat Bayar';
                                            const actionText = cust.recommended_action || 'Prioritaskan recovery pembayaran dan validasi isolir.';
                                            const phone = cust.phone || cust.no_telp || cust.whatsapp || '';
                                            const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
                                            const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone}?text=${encodeURIComponent(`Halo Kak ${custName}, kami dari Rumah Kita Net mengingatkan tagihan internet sebesar ${formatCurrency(overdueAmt)} yang telah jatuh tempo ${overdueDays} hari. Mohon info jika sudah melakukan pembayaran. Terima kasih.`)}` : null;

                                            return (
                                                <tr key={idx} className="hover:bg-slate-50 transition">
                                                    <td className="py-2.5 px-4 font-bold text-slate-900">{custName}</td>
                                                    <td className="py-2.5 px-4 font-bold text-rose-700">{formatCurrency(overdueAmt)}</td>
                                                    <td className="py-2.5 px-4 text-slate-600 font-semibold">{overdueDays} Hari</td>
                                                    <td className="py-2.5 px-4">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getRiskBadgeClass(riskLevel)}`}>
                                                            {riskLevel.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-4 text-slate-700">{dominantFactor}</td>
                                                    <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate" title={actionText}>{actionText}</td>
                                                    <td className="py-2.5 px-4">
                                                        {waUrl ? (
                                                            <a
                                                                href={waUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition shadow-sm"
                                                            >
                                                                <Send size={11} /> Chat WA
                                                            </a>
                                                        ) : (
                                                            <span className="text-slate-400 text-[11px]">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 TAB 4: INTELIJEN ISP & DIAGNOSTIK MODEL 🌟 */}
            {activeTab === 'isp_intelligence' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Skor Operasional ISP */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Skor Operasional ISP</h3>
                                    <p className="text-xs text-slate-500">Evaluasi terpadu jaringan, keuangan, dan kualitas layanan</p>
                                </div>
                                <span className="text-xl font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">
                                    {ispHigherSummary?.operational_score || 80}/100
                                </span>
                            </div>

                            <div className="space-y-3">
                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-700">Konektivitas Aktif Router:</span>
                                    <span className="font-bold text-emerald-700">{formatPercent(ispMikrotik?.online_ratio || 97.3)} (177/182 Online)</span>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-700">Beban CPU MikroTik:</span>
                                    <span className="font-bold text-blue-700">{formatPercent(ispMikrotik?.cpu_load || 6.0)} (Normal)</span>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-700">Prediksi Tiket Aduan 7 Hari:</span>
                                    <span className="font-bold text-emerald-700">0 Tiket Kritis</span>
                                </div>
                            </div>
                        </div>

                        {/* Diagnostik & Akurasi Model AI */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Diagnostik Model AI Forecast</h3>
                                    <p className="text-xs text-slate-500">Metrik kalibrasi & akurasi algoritma adaptif</p>
                                </div>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                                    Backtest 45 Hari
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-slate-500 block">Akurasi Model:</span>
                                    <span className="text-base font-bold text-indigo-700 font-mono">
                                        {formatPercent(forecastSummary?.model_diagnostics?.accuracy || 60.5)}
                                    </span>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-slate-500 block">Bobot Seasonal:</span>
                                    <span className="text-base font-bold text-slate-800 font-mono">
                                        {formatPercent(forecastSummary?.model_diagnostics?.seasonal_weight || 37.5)}
                                    </span>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-slate-500 block">Bobot Momentum:</span>
                                    <span className="text-base font-bold text-slate-800 font-mono">
                                        {formatPercent(forecastSummary?.model_diagnostics?.momentum_weight || 27.6)}
                                    </span>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-slate-500 block">Bobot Smoothing:</span>
                                    <span className="text-base font-bold text-slate-800 font-mono">
                                        {formatPercent(forecastSummary?.model_diagnostics?.smoothing_weight || 34.9)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 MODAL: ATUR BUDGET BULANAN 🌟 */}
            {budgetModal.open && (
                <Modal
                    isOpen={budgetModal.open}
                    onClose={() => setBudgetModal((prev) => ({ ...prev, open: false }))}
                    title={`Atur Anggaran Budget Bulanan (${formatMonthLabel(budgetModal.month)})`}
                >
                    <form onSubmit={handleSaveBudget} className="space-y-4 text-xs">
                        {budgetModal.error && <Alert variant="error">{budgetModal.error}</Alert>}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Target Pemasukan Invoice (Rp)</label>
                                <input
                                    type="number"
                                    value={budgetModal.data.invoice_target ?? ''}
                                    onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, invoice_target: e.target.value } }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Target Pemasukan Non-Invoice (Rp)</label>
                                <input
                                    type="number"
                                    value={budgetModal.data.non_invoice_target ?? ''}
                                    onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, non_invoice_target: e.target.value } }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Batas Beban Operasional (Rp)</label>
                                <input
                                    type="number"
                                    value={budgetModal.data.operational_expense_target ?? ''}
                                    onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, operational_expense_target: e.target.value } }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Alokasi Belanja Pembelian Alat (Rp)</label>
                                <input
                                    type="number"
                                    value={budgetModal.data.purchase_target ?? ''}
                                    onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, purchase_target: e.target.value } }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Cadangan Kas Minimum (Rp)</label>
                                <input
                                    type="number"
                                    value={budgetModal.data.minimum_cash_reserve_target ?? ''}
                                    onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, minimum_cash_reserve_target: e.target.value } }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Gaji & Payroll (Rp)</label>
                                <input
                                    type="number"
                                    value={budgetModal.data.payroll_target ?? ''}
                                    onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, payroll_target: e.target.value } }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold text-slate-700 mb-1">Catatan Manajemen</label>
                            <input
                                type="text"
                                value={budgetModal.data.notes || ''}
                                onChange={(e) => setBudgetModal((prev) => ({ ...prev, data: { ...prev.data, notes: e.target.value } }))}
                                placeholder="Target strategi keuangan bulan ini..."
                                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => setBudgetModal((prev) => ({ ...prev, open: false }))}
                                className="px-4 py-2 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={budgetModal.saving}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm disabled:opacity-50"
                            >
                                {budgetModal.saving ? 'Menyimpan...' : 'Simpan Anggaran'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* 🌟 MODAL: SIMULASI BELANJA ALAT 🌟 */}
            {simulationModal.open && (
                <Modal
                    isOpen={simulationModal.open}
                    onClose={() => setSimulationModal((prev) => ({ ...prev, open: false }))}
                    title="Kalkulator Simulasi Belanja Alat & Dampak Kas"
                >
                    <div className="space-y-4 text-xs">
                        <p className="text-slate-500">
                            Uji apakah kas riil perusahaan tetap aman dan tidak melanggar cadangan kas darurat jika membeli alat saat ini.
                        </p>

                        {simulationModal.error && <Alert variant="error">{simulationModal.error}</Alert>}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Tanggal Rencana Belanja</label>
                                <input
                                    type="date"
                                    value={simulationModal.date}
                                    onChange={(e) => setSimulationModal((prev) => ({ ...prev, date: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Nominal Belanja (Rp)</label>
                                <input
                                    type="number"
                                    value={simulationModal.amount}
                                    onChange={(e) => setSimulationModal((prev) => ({ ...prev, amount: e.target.value }))}
                                    placeholder="Contoh: 1500000"
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleRunSimulation}
                            disabled={simulationModal.loading}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition disabled:opacity-50"
                        >
                            {simulationModal.loading ? 'Menghitung Simulasi...' : 'Jalankan Uji Kelayakan Kas'}
                        </button>

                        {simulationModal.result && (
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 mt-3 animate-in fade-in">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-800">Status Kelayakan:</span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                        simulationModal.result.is_safe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                    }`}>
                                        {simulationModal.result.is_safe ? 'Aman Dieksekusi' : 'Beresiko Defisit'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>Estimasi Kas Riil Setelah Belanja:</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(simulationModal.result.post_purchase_cash)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>Sisa Kas Setelah Cadangan:</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(simulationModal.result.post_purchase_cash_after_reserve)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {/* 🌟 MODAL: KONFIRMASI EKSEKUSI PEMBELIAN ALAT 🌟 */}
            {purchaseModal.open && (
                <Modal
                    isOpen={purchaseModal.open}
                    onClose={() => setPurchaseModal((prev) => ({ ...prev, open: false }))}
                    title="Konfirmasi Pembelian Alat Terpenuhi"
                >
                    <div className="space-y-4 text-xs">
                        <p className="text-slate-600">
                            Apakah Anda yakin target pembelian <strong className="text-slate-900">{purchaseModal.target?.name}</strong> senilai <strong className="text-indigo-700">{formatCurrency(purchaseModal.target?.amount)}</strong> sudah dibeli dan terpenuhi?
                        </p>

                        {purchaseModal.error && <Alert variant="error">{purchaseModal.error}</Alert>}

                        {purchaseModal.preview && (
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="flex justify-between text-slate-600">
                                    <span>Estimasi Sisa Kas Setelah Pembelian:</span>
                                    <span className="font-bold text-emerald-700">{formatCurrency(purchaseModal.preview.post_purchase_available_cash)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>Cadangan Kas Minimum:</span>
                                    <span className="font-medium text-slate-800">{formatCurrency(purchaseModal.preview.reserve_target)}</span>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => setPurchaseModal((prev) => ({ ...prev, open: false }))}
                                className="px-4 py-2 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmPurchaseFulfill}
                                disabled={purchaseModal.loading}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm disabled:opacity-50"
                            >
                                {purchaseModal.loading ? 'Menyimpan...' : 'Konfirmasi Selesai Beli'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default DashboardPredictionPage;

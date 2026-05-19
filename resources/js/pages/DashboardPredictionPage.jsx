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
    Filler,
} from 'chart.js';
import Alert from '../components/common/Alert';
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

function clampScore(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
}

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatPercent(value, digits = 1) {
    const number = Number(value || 0);
    return `${number.toFixed(digits)}%`;
}

function getRiskBadgeClass(riskLevel) {
    if (riskLevel === 'kritis') return 'bg-red-100 text-red-700';
    if (riskLevel === 'tinggi') return 'bg-orange-100 text-orange-700';
    if (riskLevel === 'waspada' || riskLevel === 'sedang') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
}

function getMandatoryIndicatorClass(indicator) {
    if (indicator === 'kritis') return 'bg-red-100 text-red-700';
    if (indicator === 'risiko') return 'bg-orange-100 text-orange-700';
    if (indicator === 'waspada') return 'bg-amber-100 text-amber-700';
    if (indicator === 'terlaksana') return 'bg-indigo-100 text-indigo-700';
    return 'bg-emerald-100 text-emerald-700';
}

function getChartBalanceSourceMeta(source) {
    if (source === 'snapshot') {
        return { label: 'Snapshot', className: 'bg-emerald-100 text-emerald-700' };
    }

    if (source === 'snapshot_fallback_ledger') {
        return { label: 'Ledger Fallback', className: 'bg-cyan-100 text-cyan-700' };
    }

    if (source === 'actual_today') {
        return { label: 'Aktual Hari Ini', className: 'bg-indigo-100 text-indigo-700' };
    }

    if (source === 'forecast') {
        return { label: 'Forecast', className: 'bg-amber-100 text-amber-700' };
    }

    return { label: 'Tidak diketahui', className: 'bg-gray-200 text-gray-700' };
}

function getSectionSourceMeta(source) {
    if (source === 'model') {
        return { label: 'Model', className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
    }

    if (source === 'fallback') {
        return { label: 'Fallback Laravel', className: 'bg-amber-100 text-amber-700 border border-amber-200' };
    }

    return { label: 'Tidak diketahui', className: 'bg-gray-100 text-gray-600 border border-gray-200' };
}

function getRiskLevelBadgeClass(level) {
    if (level === 'kritis') return 'bg-rose-100 text-rose-700';
    if (level === 'waspada') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
}

function DashboardPredictionPage() {
    const userRole = window.appUserRole || 'admin';
    const isTeknisi = userRole === 'teknisi';

    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [bundleMeta, setBundleMeta] = useState(null);

    const [kpiRange, setKpiRange] = useState(getDefaultKpiRange());
    const [kpiData, setKpiData] = useState(null);
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpiError, setKpiError] = useState(null);

    const [forecastRange, setForecastRange] = useState(getDefaultForecastRange());
    const [forecastData, setForecastData] = useState(null);
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastError, setForecastError] = useState(null);

    const [financialProjectionMonth, setFinancialProjectionMonth] = useState(getCurrentMonthValue());
    const [financialProjectionRange, setFinancialProjectionRange] = useState(getMonthRangeFromMonthValue(getCurrentMonthValue()));
    const [financialProjectionData, setFinancialProjectionData] = useState(null);
    const [financialProjectionLoading, setFinancialProjectionLoading] = useState(false);
    const [financialProjectionError, setFinancialProjectionError] = useState(null);
    const [financialProjectionSourceMode, setFinancialProjectionSourceMode] = useState('snapshot');
    const [financialProjectionActionMessage, setFinancialProjectionActionMessage] = useState(null);
    const [mandatoryActionLoadingKey, setMandatoryActionLoadingKey] = useState(null);
    const [purchaseActionLoadingId, setPurchaseActionLoadingId] = useState(null);
    const [mandatoryProjectionFilter, setMandatoryProjectionFilter] = useState('all');
    const [ispIntelligenceData, setIspIntelligenceData] = useState(null);
    const [ispIntelligenceLoading, setIspIntelligenceLoading] = useState(false);
    const [ispIntelligenceError, setIspIntelligenceError] = useState(null);
    const [riskAlarm24h, setRiskAlarm24h] = useState(null);
    const [collectionProbability, setCollectionProbability] = useState([]);
    const [whatIfSimulator, setWhatIfSimulator] = useState(null);
    const [customerGrowthForecastMonthly, setCustomerGrowthForecastMonthly] = useState(null);
    const [monthlyTotalRevenueForecast, setMonthlyTotalRevenueForecast] = useState(null);
    const [purchaseSimulationDate, setPurchaseSimulationDate] = useState(formatDateInputLocal(new Date()));
    const [purchaseSimulationAmount, setPurchaseSimulationAmount] = useState('');
    const [purchaseSimulationLoading, setPurchaseSimulationLoading] = useState(false);
    const [purchaseSimulationResult, setPurchaseSimulationResult] = useState(null);
    const [purchaseSimulationError, setPurchaseSimulationError] = useState(null);
    const [purchaseRiskPreview, setPurchaseRiskPreview] = useState(null);
    const [purchaseRiskModalOpen, setPurchaseRiskModalOpen] = useState(false);
    const [purchaseRiskConfirmLoading, setPurchaseRiskConfirmLoading] = useState(false);
    const [purchaseRiskModalError, setPurchaseRiskModalError] = useState(null);
    const projectionRequestSeqRef = useRef(0);

    const applyPredictionBundle = (bundle) => {
        setKpiData(bundle?.management_kpis || null);
        setForecastData(bundle?.revenue_forecast || null);
        setFinancialProjectionData(bundle?.financial_projection || null);
        setFinancialProjectionSourceMode('snapshot');
        setIspIntelligenceData(bundle?.isp_intelligence || null);
        setRiskAlarm24h(bundle?.risk_alarm_24h || null);
        setCollectionProbability(Array.isArray(bundle?.collection_probability) ? bundle.collection_probability : []);
        setWhatIfSimulator(bundle?.what_if_simulator || null);
        setCustomerGrowthForecastMonthly(bundle?.customer_growth_forecast_monthly || null);
        setMonthlyTotalRevenueForecast(bundle?.monthly_total_revenue_forecast || null);
        setBundleMeta(bundle?.meta || null);
    };

    const fetchPredictionBundle = async () => {
        const response = await apiClient.get('/dashboard/prediction-bundle');
        const bundle = response.data?.data || null;
        if (!bundle) return false;
        applyPredictionBundle(bundle);
        return true;
    };

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
            if (response.data?.meta) setBundleMeta(response.data.meta);
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
            if (response.data?.meta) setBundleMeta(response.data.meta);
        } catch (err) {
            setForecastError(err.response?.data?.message || 'Gagal memuat prediksi pendapatan.');
        } finally {
            setForecastLoading(false);
        }
    };

    const fetchFinancialProjection = async (range = financialProjectionRange, options = {}) => {
        const requestSeq = ++projectionRequestSeqRef.current;
        const sourceMode = options?.sourceMode || 'live';
        try {
            setFinancialProjectionLoading(true);
            setFinancialProjectionError(null);

            const response = await apiClient.get('/dashboard/financial-projection', {
                params: {
                    start_date: range.start_date,
                    end_date: range.end_date,
                },
            });

            if (requestSeq !== projectionRequestSeqRef.current) {
                return;
            }

            setFinancialProjectionData(response.data?.data || null);
            setFinancialProjectionSourceMode(sourceMode);
            if (response.data?.meta) setBundleMeta(response.data.meta);
        } catch (err) {
            if (requestSeq !== projectionRequestSeqRef.current) {
                return;
            }
            setFinancialProjectionError(err.response?.data?.message || 'Gagal memuat proyeksi keuangan.');
        } finally {
            if (requestSeq === projectionRequestSeqRef.current) {
                setFinancialProjectionLoading(false);
            }
        }
    };

    const fetchIspIntelligence = async (range = kpiRange) => {
        try {
            setIspIntelligenceLoading(true);
            setIspIntelligenceError(null);

            const response = await apiClient.get('/dashboard/isp-intelligence', {
                params: {
                    start_date: range.start_date,
                    end_date: range.end_date,
                },
            });

            setIspIntelligenceData(response.data?.data || null);
            if (response.data?.meta) setBundleMeta(response.data.meta);
        } catch (err) {
            setIspIntelligenceError(err.response?.data?.message || 'Gagal memuat intelijen operasional ISP.');
        } finally {
            setIspIntelligenceLoading(false);
        }
    };

    const loadAllPredictionData = async (showSpinner = false) => {
        try {
            if (showSpinner) {
                setIsRefreshing(true);
            }
            setError(null);
            let bundleLoaded = false;
            try {
                bundleLoaded = await fetchPredictionBundle();
            } catch (_) {
                bundleLoaded = false;
            }

            if (!bundleLoaded) {
                await Promise.allSettled([
                    fetchManagementKpis(kpiRange),
                    fetchRevenueForecast(forecastRange),
                    fetchFinancialProjection(financialProjectionRange),
                    fetchIspIntelligence(kpiRange),
                ]);
            } else {
                await fetchFinancialProjection(financialProjectionRange, { sourceMode: 'live' });
            }
        } catch (err) {
            setError('Terjadi kendala saat memuat semua data prediksi.');
        } finally {
            if (showSpinner) {
                setIsRefreshing(false);
            }
        }
    };

    useEffect(() => {
        if (isTeknisi) {
            return;
        }

        loadAllPredictionData();
    }, []);

    const kpiSummary = kpiData?.summary || null;
    const kpiVariance = kpiData?.variance || null;
    const kpiCustomerHealth = kpiData?.customer_health || null;
    const kpiHealthSummary = kpiCustomerHealth?.summary || null;
    const kpiHealthDistribution = kpiCustomerHealth?.distribution || [];
    const kpiHealthTopRiskCustomers = kpiCustomerHealth?.top_risk_customers || [];

    const forecastSummary = forecastData?.summary || null;
    const forecastContext = forecastData?.historical_context || null;
    const forecastValidation = forecastSummary?.validation || null;
    const forecastDailyRows = forecastData?.daily_forecast || [];

    const projectionSummary = financialProjectionData?.summary || null;
    const projectionAssistant = financialProjectionData?.ai_assistant || null;
    const projectionDailyRows = financialProjectionData?.daily_projection || [];
    const mandatoryProjectionRows = financialProjectionData?.mandatory_expense_projection || [];
    const purchaseGoalRows = financialProjectionData?.purchase_goals || [];
    const projectionForecastContext = financialProjectionData?.forecast_context || null;
    const ispSummary = ispIntelligenceData?.summary || null;
    const ispMikrotik = ispIntelligenceData?.mikrotik || null;
    const ispRiskMatrix = ispIntelligenceData?.risk_matrix || [];
    const ispServiceForecast = ispIntelligenceData?.service_forecast || null;
    const ispFinancialForecast = ispIntelligenceData?.financial_forecast || null;
    const ispRecommendations = ispIntelligenceData?.recommendations || [];
    const sectionSources = bundleMeta?.section_sources || {};
    const bundleWarnings = Array.isArray(bundleMeta?.bundle_warnings) ? bundleMeta.bundle_warnings : [];

    const sectionWarningMap = useMemo(() => {
        const map = {};
        bundleWarnings.forEach((warning) => {
            const key = String(warning?.section || '').trim();
            if (!key) {
                return;
            }
            map[key] = String(warning?.reason || 'fallback_active');
        });
        return map;
    }, [bundleWarnings]);

    const resolveSectionSource = (sectionKey, sectionData) => (
        sectionData?.meta?.source || sectionSources?.[sectionKey] || 'fallback'
    );

    const resolveSectionWarning = (sectionKey, sectionData) => (
        sectionData?.meta?.quality?.warning || sectionWarningMap?.[sectionKey] || null
    );

    const managementSectionSource = resolveSectionSource('management_kpis', kpiData);
    const managementSectionWarning = resolveSectionWarning('management_kpis', kpiData);
    const forecastSectionSource = resolveSectionSource('revenue_forecast', forecastData);
    const forecastSectionWarning = resolveSectionWarning('revenue_forecast', forecastData);
    const projectionSectionSource = resolveSectionSource('financial_projection', financialProjectionData);
    const projectionSectionWarning = resolveSectionWarning('financial_projection', financialProjectionData);
    const ispSectionSource = resolveSectionSource('isp_intelligence', ispIntelligenceData);
    const ispSectionWarning = resolveSectionWarning('isp_intelligence', ispIntelligenceData);

    const mandatoryProjectionCounters = useMemo(() => {
        const total = mandatoryProjectionRows.length;
        const confirmed = mandatoryProjectionRows.filter((row) => row?.is_confirmed === true).length;
        const pending = total - confirmed;

        return {
            total,
            confirmed,
            pending,
        };
    }, [mandatoryProjectionRows]);

    const filteredMandatoryRows = useMemo(() => {
        if (mandatoryProjectionFilter === 'confirmed') {
            return mandatoryProjectionRows.filter((row) => row?.is_confirmed === true);
        }
        if (mandatoryProjectionFilter === 'pending') {
            return mandatoryProjectionRows.filter((row) => row?.is_confirmed !== true);
        }
        return mandatoryProjectionRows;
    }, [mandatoryProjectionRows, mandatoryProjectionFilter]);

    const scoreSummary = useMemo(() => {
        const modelAccuracyScore = clampScore(
            forecastValidation?.accuracy?.ensemble_equal
            ?? forecastSummary?.average_confidence
            ?? 0
        );

        const volatility = Number(
            forecastContext?.volatility_index
            ?? projectionForecastContext?.volatility_index
            ?? 0
        );
        const revenueStabilityScore = clampScore(100 - volatility);

        const collectionScore = clampScore(kpiSummary?.collection_rate || 0);
        const customerHealthScore = clampScore(
            kpiSummary?.customer_health_average_score
            ?? kpiHealthSummary?.average_health_score
            ?? 0
        );

        const mandatoryCoverageScore = clampScore(projectionSummary?.mandatory_coverage_amount_rate || 0);
        const shortfall = Number(projectionSummary?.mandatory_shortfall_total || 0);
        const shortfallPenalty = shortfall > 0 ? Math.min(30, Math.log10(shortfall + 1) * 8) : 0;
        const cashDirectionBonus = Number(projectionSummary?.projected_ending_balance || 0) >= 0 ? 10 : -10;
        const liquidityScore = clampScore(mandatoryCoverageScore - shortfallPenalty + cashDirectionBonus);
        const ispOperationalScore = clampScore(ispSummary?.isp_operational_score || 0);

        const baseScore = clampScore(
            (modelAccuracyScore * 0.28)
            + (revenueStabilityScore * 0.16)
            + (collectionScore * 0.18)
            + (customerHealthScore * 0.18)
            + (liquidityScore * 0.20)
        );

        const overallScore = Math.round(
            ispOperationalScore > 0
                ? clampScore((baseScore * 0.75) + (ispOperationalScore * 0.25))
                : baseScore
        );

        return {
            overallScore,
            modelAccuracyScore,
            revenueStabilityScore,
            collectionScore,
            customerHealthScore,
            liquidityScore,
            ispOperationalScore,
        };
    }, [
        forecastValidation,
        forecastSummary,
        forecastContext,
        projectionForecastContext,
        kpiSummary,
        kpiHealthSummary,
        projectionSummary,
        ispSummary,
    ]);

    const smartRecommendations = useMemo(() => {
        const recommendations = [];

        if ((projectionAssistant?.recommended_actions || []).length > 0) {
            (projectionAssistant.recommended_actions || []).slice(0, 3).forEach((item) => {
                recommendations.push({
                    source: 'AI Proyeksi Keuangan',
                    priority: item.priority || 'menengah',
                    title: item.title,
                    detail: item.detail,
                });
            });
        }

        (kpiCustomerHealth?.recommendations || []).slice(0, 2).forEach((item) => {
            recommendations.push({
                source: 'Health Score Pelanggan',
                priority: 'menengah',
                title: 'Retensi Pelanggan',
                detail: item,
            });
        });

        (forecastSummary?.analysis_notes || []).slice(0, 2).forEach((item) => {
            recommendations.push({
                source: 'Forecast Pendapatan',
                priority: 'rendah',
                title: 'Catatan Model Pendapatan',
                detail: item,
            });
        });

        ispRecommendations.slice(0, 3).forEach((item) => {
            recommendations.push({
                source: 'Intelijen Operasional ISP',
                priority: 'menengah',
                title: 'Rekomendasi ISP',
                detail: item,
            });
        });

        return recommendations.slice(0, 7);
    }, [projectionAssistant, kpiCustomerHealth, forecastSummary, ispRecommendations]);

    const predictionBundleStatus = useMemo(() => {
        const status = String(bundleMeta?.snapshot_status || '');
        const warnings = Array.isArray(bundleMeta?.bundle_warnings) ? bundleMeta.bundle_warnings : [];
        const completeness = bundleMeta?.section_completeness || null;
        const missing = Array.isArray(completeness?.missing_sections) ? completeness.missing_sections : [];

        if (status === 'ready_complete' && warnings.length === 0) {
            return {
                label: 'Data lengkap',
                className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                detail: completeness ? `Kelengkapan ${completeness.percent || 100}%` : 'Semua section model tersedia.',
            };
        }

        if (status === 'ready_rehydrated') {
            return {
                label: 'Data direhydrate',
                className: 'border-blue-200 bg-blue-50 text-blue-700',
                detail: warnings.length > 0
                    ? `Section dipulihkan: ${warnings.map((w) => w?.section).filter(Boolean).join(', ')}`
                    : 'Sebagian section dipulihkan dari snapshot valid lain.',
            };
        }

        return {
            label: 'Fallback aktif',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            detail: missing.length > 0
                ? `Section belum penuh: ${missing.join(', ')}`
                : (warnings.length > 0 ? warnings.map((w) => `${w?.section || 'bundle'}: ${w?.reason || 'warning'}`).join(' | ') : 'Sumber data campuran fallback.'),
        };
    }, [bundleMeta]);

    const forecastChartData = useMemo(() => ({
        labels: forecastDailyRows.map((item) => item.date),
        datasets: [
            {
                label: 'Prediksi Pendapatan',
                data: forecastDailyRows.map((item) => Number(item.predicted_revenue || 0)),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.16)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                yAxisID: 'y',
            },
            {
                label: 'Confidence',
                data: forecastDailyRows.map((item) => Number(item.confidence || 0)),
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.14)',
                borderWidth: 2,
                fill: false,
                tension: 0.2,
                yAxisID: 'y1',
            },
        ],
    }), [forecastDailyRows]);

    const forecastChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        if (context.dataset.yAxisID === 'y1') {
                            return `${context.dataset.label}: ${Number(context.raw || 0).toFixed(1)}%`;
                        }
                        return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                    },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#6b7280', maxRotation: 0 } },
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#6b7280',
                    callback: (value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}jt`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}rb`;
                        return value;
                    },
                },
            },
            y1: {
                position: 'right',
                beginAtZero: true,
                max: 100,
                grid: { drawOnChartArea: false },
                ticks: { color: '#6b7280', callback: (value) => `${value}%` },
            },
        },
    };

    const projectionChartData = useMemo(() => ({
        labels: projectionDailyRows.map((row) => row.date),
        datasets: [
            {
                type: 'bar',
                label: 'Pengeluaran per Tanggal',
                data: projectionDailyRows.map((row) => Number(row.daily_total_expense || 0)),
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                borderColor: '#dc2626',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 10,
                order: 3,
            },
            {
                type: 'line',
                label: 'Pendapatan Real Harian',
                data: projectionDailyRows.map((row) => (
                    row.income_source === 'actual'
                        ? Number(row.predicted_income || 0)
                        : null
                )),
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.15)',
                fill: false,
                borderWidth: 3,
                pointRadius: 3,
                pointHoverRadius: 5,
                spanGaps: false,
                tension: 0.2,
                order: 1,
            },
            {
                label: 'Saldo Proyeksi',
                data: projectionDailyRows.map((row) => Number(
                    row.chart_balance ?? row.projected_balance ?? 0
                )),
                borderColor: '#7c3aed',
                backgroundColor: 'rgba(124, 58, 237, 0.15)',
                fill: true,
                borderWidth: 3,
                tension: 0.3,
            },
            {
                label: 'Saldo Bebas',
                data: projectionDailyRows.map((row) => Math.max(0, Number(
                    row.discretionary_balance_display ?? 0
                ))),
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                fill: false,
                borderWidth: 2,
                tension: 0.2,
            },
        ],
    }), [projectionDailyRows]);

    const projectionChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#6b7280', maxRotation: 0 } },
            y: {
                ticks: {
                    color: '#6b7280',
                    callback: (value) => {
                        if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}jt`;
                        if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}rb`;
                        return value;
                    },
                },
            },
        },
    };

    const varianceChartData = useMemo(() => ({
        labels: (kpiVariance?.daily || []).map((item) => item.date),
        datasets: [
            {
                label: 'Forecast',
                data: (kpiVariance?.daily || []).map((item) => Number(item.predicted_revenue || 0)),
                borderColor: '#1d4ed8',
                backgroundColor: 'rgba(29, 78, 216, 0.14)',
                borderWidth: 2,
                fill: false,
                tension: 0.25,
            },
            {
                label: 'Realisasi',
                data: (kpiVariance?.daily || []).map((item) => Number(item.actual_revenue || 0)),
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.12)',
                borderWidth: 2,
                fill: false,
                tension: 0.25,
            },
        ],
    }), [kpiVariance]);

    const varianceChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#6b7280', maxRotation: 0 } },
            y: {
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

    const healthDistributionChartData = useMemo(() => ({
        labels: kpiHealthDistribution.map((item) => item.label),
        datasets: [
            {
                data: kpiHealthDistribution.map((item) => Number(item.count || 0)),
                backgroundColor: ['#22c55e', '#f59e0b', '#f97316', '#ef4444'],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#ffffff'],
                borderWidth: 3,
                hoverOffset: 8,
            },
        ],
    }), [kpiHealthDistribution]);

    const healthDistributionOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    color: '#374151',
                    boxWidth: 8,
                },
            },
            tooltip: {
                callbacks: {
                    label: (context) => `${context.label}: ${context.raw} pelanggan`,
                },
            },
        },
    };

    const handleApplyKpiRange = async () => {
        if (!kpiRange.start_date || !kpiRange.end_date) {
            setKpiError('Tanggal KPI wajib diisi.');
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

        const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
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
            setForecastError('Tanggal prediksi wajib diisi.');
            return;
        }

        const start = new Date(`${forecastRange.start_date}T00:00:00`);
        const end = new Date(`${forecastRange.end_date}T00:00:00`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            setForecastError('Format tanggal prediksi tidak valid.');
            return;
        }

        if (start > end) {
            setForecastError('Tanggal mulai prediksi tidak boleh melebihi tanggal akhir.');
            return;
        }

        const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
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

    const handleConfirmMandatoryExecution = async (row) => {
        if (!row || !row.target_id || !row.due_date) return;
        if (!window.confirm(`Tandai target "${row.name}" jatuh tempo ${row.due_date} sebagai terlaksana?`)) return;

        const actionKey = String(row.event_id || `${row.target_id}-${row.due_date}`);
        try {
            setMandatoryActionLoadingKey(actionKey);
            setFinancialProjectionActionMessage(null);

            await apiClient.post('/dashboard/financial-projection/mandatory-events/confirm', {
                target_id: row.target_id,
                due_date: row.due_date,
                amount: Number(row.amount || 0),
            });

            setFinancialProjectionActionMessage({
                type: 'success',
                text: `Target wajib "${row.name}" berhasil ditandai terlaksana.`,
            });
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setFinancialProjectionActionMessage({
                type: 'error',
                text: err.response?.data?.message || 'Gagal menandai target wajib sebagai terlaksana.',
            });
        } finally {
            setMandatoryActionLoadingKey(null);
        }
    };

    const handleRevokeMandatoryExecution = async (row) => {
        if (!row || !row.target_id || !row.due_date) return;
        if (!window.confirm(`Batalkan status terlaksana untuk target "${row.name}" jatuh tempo ${row.due_date}?`)) return;

        const actionKey = String(row.event_id || `${row.target_id}-${row.due_date}`);
        try {
            setMandatoryActionLoadingKey(actionKey);
            setFinancialProjectionActionMessage(null);

            await apiClient.delete('/dashboard/financial-projection/mandatory-events/confirm', {
                data: {
                    target_id: row.target_id,
                    due_date: row.due_date,
                },
            });

            setFinancialProjectionActionMessage({
                type: 'success',
                text: `Status terlaksana untuk "${row.name}" berhasil dibatalkan.`,
            });
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setFinancialProjectionActionMessage({
                type: 'error',
                text: err.response?.data?.message || 'Gagal membatalkan status terlaksana.',
            });
        } finally {
            setMandatoryActionLoadingKey(null);
        }
    };

    const handleFulfillPurchaseGoal = async (row) => {
        if (!row || !row.id) return;

        try {
            setPurchaseActionLoadingId(Number(row.id));
            setFinancialProjectionActionMessage(null);
            setPurchaseRiskModalError(null);
            setPurchaseRiskPreview(null);

            const previewResponse = await apiClient.post('/dashboard/financial-projection/purchase-goals/fulfill', {
                target_id: row.id,
                preview_only: true,
            });

            setPurchaseRiskPreview(previewResponse.data?.data || null);
            setPurchaseRiskModalOpen(true);
        } catch (err) {
            setFinancialProjectionActionMessage({
                type: 'error',
                text: err.response?.data?.message || 'Gagal memuat preview risiko pembelian.',
            });
        } finally {
            setPurchaseActionLoadingId(null);
        }
    };

    const handleConfirmFulfillPurchaseGoal = async () => {
        const targetId = Number(purchaseRiskPreview?.target_id || 0);
        const targetName = String(purchaseRiskPreview?.target_name || 'Target pembelian');
        if (!targetId) return;

        try {
            setPurchaseRiskConfirmLoading(true);
            setPurchaseRiskModalError(null);
            setFinancialProjectionActionMessage(null);

            await apiClient.post('/dashboard/financial-projection/purchase-goals/fulfill', {
                target_id: targetId,
                preview_only: false,
            });

            setPurchaseRiskModalOpen(false);
            setPurchaseRiskPreview(null);
            setFinancialProjectionActionMessage({
                type: 'success',
                text: `Target pembelian "${targetName}" berhasil ditandai terpenuhi dan dinonaktifkan.`,
            });
            await fetchFinancialProjection(financialProjectionRange);
        } catch (err) {
            setPurchaseRiskModalError(err.response?.data?.message || 'Gagal mengeksekusi rencana pembelian.');
        } finally {
            setPurchaseRiskConfirmLoading(false);
        }
    };

    const handleSimulatePurchase = async () => {
        const parsedAmount = Number(purchaseSimulationAmount);

        if (!purchaseSimulationDate) {
            setPurchaseSimulationError('Tanggal simulasi wajib diisi.');
            return;
        }

        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            setPurchaseSimulationError('Nominal simulasi harus lebih dari 0.');
            return;
        }

        try {
            setPurchaseSimulationLoading(true);
            setPurchaseSimulationError(null);
            setPurchaseSimulationResult(null);

            const response = await apiClient.post('/dashboard/financial-projection/simulate-purchase', {
                simulation_date: purchaseSimulationDate,
                amount: parsedAmount,
                start_date: financialProjectionRange.start_date,
                end_date: financialProjectionRange.end_date,
            });

            setPurchaseSimulationResult(response.data?.data || null);
        } catch (err) {
            setPurchaseSimulationError(err.response?.data?.message || 'Gagal menjalankan simulasi pembelian.');
        } finally {
            setPurchaseSimulationLoading(false);
        }
    };

    if (isTeknisi) {
        return (
            <div className="space-y-4 min-w-0">
                <div className="flex items-center gap-2 text-gray-700">
                    <Calendar size={16} />
                    <p className="text-sm">
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <Alert
                    type="info"
                    title="Akses Prediksi"
                    message="Halaman prediksi keuangan tersedia untuk tim finance/superadmin."
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 min-w-0">
            <div className="app-section-header flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Prediksi Multi-Aspek</h1>
                    <p className="text-gray-500 mt-1 flex items-center gap-2">
                        <Calendar size={16} />
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                        Fokus halaman ini hanya untuk analitik prediksi operasional dan keuangan, tanpa tombol operasional dashboard.
                    </p>
                    {bundleMeta?.snapshot_generated_at && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                                Update terakhir: {new Date(bundleMeta.snapshot_generated_at).toLocaleString('id-ID')}
                            </span>
                            <span className={`inline-flex px-2 py-1 rounded-full ${
                                bundleMeta?.is_stale ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {bundleMeta?.is_stale ? 'Stale snapshot' : 'Snapshot fresh'}
                            </span>
                            {bundleMeta?.model_version && (
                                <span className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                                    Model: {bundleMeta.model_version}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => loadAllPredictionData(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                    disabled={isRefreshing}
                >
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    {isRefreshing ? 'Memuat Ulang...' : 'Muat Ulang Semua Prediksi'}
                </button>
            </div>

            {error && (
                <Alert
                    type="error"
                    title="Error"
                    message={error}
                    onClose={() => setError(null)}
                />
            )}

            {bundleMeta && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${predictionBundleStatus.className}`}>
                    <p className="font-semibold">{predictionBundleStatus.label}</p>
                    <p className="mt-1 text-xs opacity-90">{predictionBundleStatus.detail}</p>
                </div>
            )}

            {financialProjectionActionMessage && (
                <Alert
                    type={financialProjectionActionMessage.type}
                    title={financialProjectionActionMessage.type === 'success' ? 'Berhasil' : 'Error'}
                    message={financialProjectionActionMessage.text}
                    onClose={() => setFinancialProjectionActionMessage(null)}
                />
            )}

            <Modal
                isOpen={purchaseRiskModalOpen}
                onClose={() => {
                    if (purchaseRiskConfirmLoading) return;
                    setPurchaseRiskModalOpen(false);
                    setPurchaseRiskPreview(null);
                    setPurchaseRiskModalError(null);
                }}
                title="Risiko Eksekusi Target Pembelian"
                size="2xl"
            >
                <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm text-slate-700">
                            Target: <span className="font-semibold text-slate-900">{purchaseRiskPreview?.target_name || '-'}</span>
                        </p>
                        <p className="text-sm text-slate-700 mt-1">
                            Nominal: <span className="font-semibold text-slate-900">{formatCurrency(purchaseRiskPreview?.target_amount || 0)}</span>
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                            Horizon risiko: {purchaseRiskPreview?.horizon_start_date || '-'} s.d. {purchaseRiskPreview?.horizon_end_date || '-'}
                        </p>
                    </div>

                    <div className="border border-gray-100 rounded-lg p-2">
                        <ResponsiveDataView
                            rows={purchaseRiskPreview?.risk_rows || []}
                            keyField="due_date"
                            priorityFields={['due_date', 'risk_level', 'mandatory_amount', 'free_balance_after_purchase']}
                            emptyMessage="Tidak ada data pengeluaran wajib pada horizon ini."
                            tableClassName="w-full text-sm md:min-w-[1180px]"
                            columns={[
                                { key: 'due_date', label: 'Tanggal Wajib', cellClassName: 'px-3 py-2 text-gray-700' },
                                { key: 'mandatory_amount', label: 'Nominal Wajib', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-900 font-semibold', render: (row) => formatCurrency(row.mandatory_amount || 0) },
                                { key: 'status_label', label: 'Status Wajib', cellClassName: 'px-3 py-2 text-gray-700', render: (row) => row.status_label || '-' },
                                { key: 'total_balance_before', label: 'Total Saldo Sebelum', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.total_balance_before || 0) },
                                { key: 'total_balance_after_purchase', label: 'Total Saldo Setelah - Nominal', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold', render: (row) => <span className={Number(row.total_balance_after_purchase || 0) < 0 ? 'text-rose-700' : 'text-gray-900'}>{formatCurrency(row.total_balance_after_purchase || 0)}</span> },
                                { key: 'free_balance_before', label: 'Saldo Bebas Sebelum', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.free_balance_before || 0) },
                                { key: 'free_balance_after_purchase', label: 'Saldo Bebas Setelah - Nominal', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold', render: (row) => <span className={Number(row.free_balance_after_purchase || 0) < 0 ? 'text-rose-700' : 'text-gray-900'}>{formatCurrency(row.free_balance_after_purchase || 0)}</span> },
                                { key: 'risk_level', label: 'Risiko', render: (row) => <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getRiskLevelBadgeClass(row.risk_level)}`}>{row.risk_level || 'aman'}</span> },
                            ]}
                        />
                    </div>

                    {purchaseRiskModalError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {purchaseRiskModalError}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (purchaseRiskConfirmLoading) return;
                                setPurchaseRiskModalOpen(false);
                                setPurchaseRiskPreview(null);
                                setPurchaseRiskModalError(null);
                            }}
                            className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60"
                            disabled={purchaseRiskConfirmLoading}
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmFulfillPurchaseGoal}
                            className="px-3 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
                            disabled={purchaseRiskConfirmLoading}
                        >
                            {purchaseRiskConfirmLoading ? 'Memproses...' : 'Tetap Jalankan'}
                        </button>
                    </div>
                </div>
            </Modal>

            <div className="bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Brain size={20} className="text-cyan-300" />
                            Ringkasan Prediksi Menyeluruh
                        </h2>
                        <p className="text-sm text-slate-200 mt-1">Skor gabungan dari akurasi model, stabilitas pendapatan, kesehatan pelanggan, collection, dan kesiapan kas.</p>
                    </div>
                    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                        scoreSummary.overallScore >= 80
                            ? 'bg-emerald-300/20 text-emerald-200'
                            : scoreSummary.overallScore >= 65
                                ? 'bg-amber-300/20 text-amber-200'
                                : 'bg-red-300/20 text-red-200'
                    }`}>
                        Skor Menyeluruh: {scoreSummary.overallScore}/100
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Akurasi Model</p>
                        <p className="text-2xl font-bold mt-1">{scoreSummary.modelAccuracyScore.toFixed(1)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Stabilitas Pendapatan</p>
                        <p className="text-2xl font-bold mt-1">{scoreSummary.revenueStabilityScore.toFixed(1)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Collection</p>
                        <p className="text-2xl font-bold mt-1">{scoreSummary.collectionScore.toFixed(1)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Kesehatan Pelanggan</p>
                        <p className="text-2xl font-bold mt-1">{scoreSummary.customerHealthScore.toFixed(1)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Kesiapan Kas</p>
                        <p className="text-2xl font-bold mt-1">{scoreSummary.liquidityScore.toFixed(1)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Volatilitas</p>
                        <p className="text-2xl font-bold mt-1">{formatPercent(forecastContext?.volatility_index || projectionForecastContext?.volatility_index || 0, 1)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-slate-200">Skor Operasional ISP</p>
                        <p className="text-2xl font-bold mt-1">{scoreSummary.ispOperationalScore.toFixed(1)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="app-card p-5 space-y-3">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <ShieldAlert size={16} className="text-rose-600" />
                        Risk Alarm 24h
                    </h3>
                    {!riskAlarm24h ? (
                        <p className="text-sm text-gray-500">Risk alarm belum tersedia.</p>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    riskAlarm24h.risk_level === 'critical'
                                        ? 'bg-rose-100 text-rose-700'
                                        : riskAlarm24h.risk_level === 'warning'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                    {riskAlarm24h.risk_level || 'normal'}
                                </span>
                                <span className="text-sm text-gray-700">Score: {Number(riskAlarm24h.risk_score || 0).toFixed(1)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                <div className="rounded-lg bg-gray-50 p-2">Overdue rate: {formatPercent(riskAlarm24h?.top_drivers?.overdue_rate || 0, 1)}</div>
                                <div className="rounded-lg bg-gray-50 p-2">Overdue amount: {formatCurrency(riskAlarm24h?.top_drivers?.overdue_amount || 0)}</div>
                                <div className="rounded-lg bg-gray-50 p-2">Waiting confirm: {formatCurrency(riskAlarm24h?.top_drivers?.waiting_confirmation_amount || 0)}</div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    Prediksi 24h: {formatCurrency(
                                        riskAlarm24h?.top_drivers?.predicted_revenue_24h
                                        ?? riskAlarm24h?.top_drivers?.predicted_net_24h
                                        ?? 0
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="app-card p-5 space-y-3">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <DollarSign size={16} className="text-teal-600" />
                        What-if Simulator
                    </h3>
                    {!whatIfSimulator ? (
                        <p className="text-sm text-gray-500">Data simulasi belum tersedia.</p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                Baseline net bulan: <span className="font-semibold text-gray-900">{formatCurrency(whatIfSimulator.baseline_month_net || 0)}</span>
                            </p>
                            <div className="space-y-2">
                                {(whatIfSimulator.scenarios || []).map((scenario) => (
                                    <div key={scenario.key} className="rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{scenario.label}</p>
                                            <p className="text-xs text-gray-500">Net baru: {formatCurrency(scenario.new_net_estimate || 0)}</p>
                                        </div>
                                        <span className={`text-sm font-semibold ${(scenario.estimated_delta_net || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {(scenario.estimated_delta_net || 0) >= 0 ? '+' : ''}{formatCurrency(scenario.estimated_delta_net || 0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="app-card p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Target size={18} className="text-amber-600" />
                        Rekomendasi Prioritas
                    </h2>
                    <span className="text-xs text-gray-500">Diambil dari seluruh aspek prediksi</span>
                </div>
                {smartRecommendations.length === 0 ? (
                    <p className="text-sm text-gray-500">Rekomendasi akan muncul setelah data prediksi tersedia.</p>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {smartRecommendations.map((item, index) => (
                            <div key={`smart-reco-${index}`} className="border border-gray-200 rounded-xl p-3 bg-gray-50/60">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                        item.priority === 'tinggi'
                                            ? 'bg-red-100 text-red-700'
                                            : item.priority === 'menengah'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {item.priority}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">{item.detail}</p>
                                <p className="text-[11px] text-gray-500 mt-2">Sumber: {item.source}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="app-card p-5 space-y-3 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Users size={16} className="text-blue-600" />
                        Collection Probability per Pelanggan
                    </h3>
                    <div className="border border-gray-100 rounded-lg p-2">
                        <ResponsiveDataView
                            rows={collectionProbability.slice(0, 10)}
                            keyField="customer_id"
                            priorityFields={['name', 'collection_probability_pct', 'open_invoice_amount']}
                            emptyMessage="Data collection probability belum tersedia."
                            tableClassName="w-full text-sm md:min-w-[620px]"
                            columns={[
                                { key: 'name', label: 'Pelanggan', cellClassName: 'px-3 py-2 text-gray-900 font-medium' },
                                {
                                    key: 'collection_probability_pct',
                                    label: 'Probabilitas',
                                    headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider',
                                    cellClassName: 'px-3 py-2 text-right',
                                    render: (row) => (
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            Number(row.collection_probability_pct || 0) < 45
                                                ? 'bg-rose-100 text-rose-700'
                                                : Number(row.collection_probability_pct || 0) < 70
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-emerald-100 text-emerald-700'
                                        }`}>
                                            {Number(row.collection_probability_pct || 0).toFixed(1)}%
                                        </span>
                                    ),
                                },
                                { key: 'open_invoice_amount', label: 'Open Amount', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.open_invoice_amount || 0) },
                                { key: 'days_overdue', label: 'Overdue (hari)', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => row.days_overdue || 0 },
                            ]}
                        />
                    </div>
                </div>

                <div className="app-card p-5 space-y-3 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Wallet size={16} className="text-violet-600" />
                        Forecast Bulanan (Pelanggan + Pendapatan)
                    </h3>
                    <div className="border border-gray-100 rounded-lg p-2">
                        <ResponsiveDataView
                            rows={monthlyTotalRevenueForecast?.months || []}
                            keyField="month"
                            priorityFields={['month', 'net_total', 'billing_recurring']}
                            emptyMessage="Forecast bulanan belum tersedia."
                            tableClassName="w-full text-sm md:min-w-[740px]"
                            columns={[
                                { key: 'month', label: 'Bulan', cellClassName: 'px-3 py-2 font-medium text-gray-900' },
                                { key: 'predicted_total_customers', label: 'Total Pelanggan', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => ((customerGrowthForecastMonthly?.months || []).find((g) => g.month === row.month)?.predicted_total_customers ?? '-') },
                                { key: 'billing_recurring', label: 'Billing', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.billing_recurring || 0) },
                                { key: 'installation', label: 'Pemasangan', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.installation || 0) },
                                { key: 'other_financial_income', label: 'Pendapatan Lain', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.other_financial_income || 0) },
                                { key: 'net_total', label: 'Total Netto', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold', render: (row) => <span className={(row.net_total || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatCurrency(row.net_total || 0)}</span> },
                            ]}
                        />
                    </div>
                </div>
            </div>

            <div className="app-card p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Activity size={18} className="text-cyan-700" />
                            Intelijen Operasional ISP
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Analisis gabungan data pelanggan, invoice, aduan, gangguan, transaksi, dan API MikroTik untuk kebutuhan operasional ISP.</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getSectionSourceMeta(ispSectionSource).className}`}>
                                Sumber: {getSectionSourceMeta(ispSectionSource).label}
                            </span>
                            {ispSectionWarning && (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Warning: {ispSectionWarning}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="text-xs text-gray-500">
                        Periode analisis: {kpiRange.start_date} s.d. {kpiRange.end_date}
                    </span>
                </div>

                {ispIntelligenceError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{ispIntelligenceError}</div>
                )}

                {ispIntelligenceLoading && !ispSummary && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                        Memproses intelijen operasional ISP...
                    </div>
                )}

                {!ispIntelligenceLoading && !ispIntelligenceError && !ispSummary && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                        Data intelijen operasional ISP belum tersedia.
                    </div>
                )}

                {ispSummary && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-4">
                                <p className="text-xs font-medium text-cyan-700">Skor Operasional ISP</p>
                                <p className="text-2xl font-bold text-cyan-900 mt-1">{ispSummary.isp_operational_score || 0}</p>
                                <p className="text-xs text-cyan-700 mt-1">Network {ispSummary.network_readiness_score || 0} | Finance {ispSummary.finance_readiness_score || 0} | Service {ispSummary.service_readiness_score || 0}</p>
                            </div>
                            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                                <p className="text-xs font-medium text-blue-700">Konektivitas Aktif</p>
                                <p className="text-2xl font-bold text-blue-900 mt-1">{formatPercent(ispSummary.online_ratio || 0, 1)}</p>
                                <p className="text-xs text-blue-700 mt-1">Online {ispSummary.online_active_customers || 0}/{ispSummary.active_customers || 0}</p>
                            </div>
                            <div className="rounded-xl bg-violet-50 border border-violet-100 p-4">
                                <p className="text-xs font-medium text-violet-700">Prediksi Tiket 7 Hari</p>
                                <p className="text-2xl font-bold text-violet-900 mt-1">{ispSummary.predicted_tickets_next_7d || 0}</p>
                                <p className="text-xs text-violet-700 mt-1">Prioritas tinggi: {ispSummary.predicted_high_priority_tickets_next_7d || 0}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                                <p className="text-xs font-medium text-emerald-700">Prediksi Pemasukan 7 Hari</p>
                                <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(ispSummary.predicted_income_next_7d || 0)}</p>
                                <p className="text-xs text-emerald-700 mt-1">Collection: {formatPercent(ispSummary.collection_rate || 0, 1)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/70">
                                <p className="text-sm font-semibold text-gray-900 mb-2">MikroTik Live Signals</p>
                                <div className="space-y-1 text-sm text-gray-700">
                                    <p>Router: <span className="font-semibold">{ispMikrotik?.identity || '-'}</span></p>
                                    <p>Status data live: <span className="font-semibold">{ispMikrotik?.available ? 'Tersedia' : 'Tidak tersedia'}</span></p>
                                    <p>CPU Load: <span className="font-semibold">{formatPercent(ispMikrotik?.cpu_load || 0, 1)}</span></p>
                                    <p>Memory Usage: <span className="font-semibold">{ispMikrotik?.memory_usage_ratio === null ? '-' : formatPercent(ispMikrotik?.memory_usage_ratio || 0, 1)}</span></p>
                                    <p>Interface Running: <span className="font-semibold">{ispMikrotik?.interfaces_running || 0}/{ispMikrotik?.interfaces_total || 0}</span></p>
                                    <p>Sesi PPPoE matched: <span className="font-semibold">{ispMikrotik?.active_pppoe_sessions_matched || 0}</span></p>
                                    {ispMikrotik?.error && (
                                        <p className="text-xs text-amber-700">Catatan: {ispMikrotik.error}</p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/70">
                                <p className="text-sm font-semibold text-gray-900 mb-2">Pressure Forecast (7 Hari)</p>
                                <div className="space-y-1 text-sm text-gray-700">
                                    <p>Baseline aduan harian: <span className="font-semibold">{ispServiceForecast?.daily_ticket_baseline ?? 0}</span></p>
                                    <p>Pressure gangguan: <span className="font-semibold">{ispServiceForecast?.disturbance_pressure ?? 0}</span></p>
                                    <p>Rasio instabilitas jaringan: <span className="font-semibold">{formatPercent(ispServiceForecast?.network_instability_ratio || 0, 2)}</span></p>
                                    <p>Kapasitas tiket/hari disarankan: <span className="font-semibold">{ispSummary.recommended_daily_ticket_capacity || 0}</span></p>
                                    <p>Piutang overdue: <span className="font-semibold">{formatCurrency(ispSummary.overdue_invoice_amount || 0)}</span></p>
                                    <p>Tagihan jatuh tempo 7 hari: <span className="font-semibold">{formatCurrency(ispFinancialForecast?.due_next_7d_amount || 0)}</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-2">
                            <ResponsiveDataView
                                rows={ispRiskMatrix}
                                keyField="key"
                                priorityFields={['label', 'status', 'score']}
                                emptyMessage="Data matriks risiko belum tersedia."
                                tableClassName="w-full text-sm md:min-w-[700px]"
                                columns={[
                                    { key: 'label', label: 'Aspek', cellClassName: 'px-3 py-2 font-medium text-gray-900' },
                                    { key: 'score', label: 'Skor', cellClassName: 'px-3 py-2 text-gray-700' },
                                    { key: 'status', label: 'Status', render: (row) => <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getRiskBadgeClass(row.status)}`}>{row.status}</span> },
                                    { key: 'reason', label: 'Alasan', cellClassName: 'px-3 py-2 text-gray-700' },
                                ]}
                            />
                        </div>
                    </>
                )}
            </div>

            <div className="app-card p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <TrendingUp size={18} className="text-blue-600" />
                            Prediksi Pendapatan Harian
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Model ensemble seasonal + momentum + smoothing dengan kalibrasi otomatis.</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getSectionSourceMeta(forecastSectionSource).className}`}>
                                Sumber: {getSectionSourceMeta(forecastSectionSource).label}
                            </span>
                            {forecastSectionWarning && (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Warning: {forecastSectionWarning}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Mulai</label>
                            <input
                                type="date"
                                value={forecastRange.start_date}
                                onChange={(e) => setForecastRange((prev) => ({ ...prev, start_date: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Akhir</label>
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
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                        >
                            {forecastLoading ? 'Memproses...' : 'Terapkan'}
                        </button>
                        <button
                            type="button"
                            onClick={handleResetForecastRange}
                            disabled={forecastLoading}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold disabled:opacity-60"
                        >
                            7 Hari
                        </button>
                    </div>
                </div>

                {forecastError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{forecastError}</div>
                )}

                {forecastLoading && !forecastSummary && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                        Memproses prediksi pendapatan...
                    </div>
                )}

                {!forecastLoading && !forecastError && !forecastSummary && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                        Data prediksi pendapatan belum tersedia.
                    </div>
                )}

                {forecastSummary && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                                <p className="text-xs font-medium text-blue-700">Total Prediksi</p>
                                <p className="text-2xl font-bold text-blue-900 mt-1">{formatCurrency(forecastSummary.predicted_total_revenue)}</p>
                            </div>
                            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                                <p className="text-xs font-medium text-indigo-700">Rata-rata Harian</p>
                                <p className="text-2xl font-bold text-indigo-900 mt-1">{formatCurrency(forecastSummary.predicted_daily_average)}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                                <p className="text-xs font-medium text-emerald-700">Confidence Rata-rata</p>
                                <p className="text-2xl font-bold text-emerald-900 mt-1">{formatPercent(forecastSummary.average_confidence || 0, 1)}</p>
                            </div>
                            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                                <p className="text-xs font-medium text-amber-700">Tren 6 Bulan</p>
                                <p className={`text-2xl font-bold mt-1 ${Number(forecastSummary.trend_percentage_6m || 0) >= 0 ? 'text-amber-900' : 'text-red-700'}`}>
                                    {Number(forecastSummary.trend_percentage_6m || 0) >= 0 ? '+' : ''}{formatPercent(forecastSummary.trend_percentage_6m || 0, 2)}
                                </p>
                            </div>
                        </div>

                        <div className="h-[320px]">
                            <Line data={forecastChartData} options={forecastChartOptions} />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/70">
                                <p className="text-sm font-semibold text-gray-900 mb-2">Diagnostik Model</p>
                                <div className="space-y-1 text-sm text-gray-700">
                                    <p>Bobot Seasonal: <span className="font-semibold">{formatPercent((forecastSummary?.ensemble_weights?.seasonal || 0) * 100, 2)}</span></p>
                                    <p>Bobot Momentum: <span className="font-semibold">{formatPercent((forecastSummary?.ensemble_weights?.momentum || 0) * 100, 2)}</span></p>
                                    <p>Bobot Smoothing: <span className="font-semibold">{formatPercent((forecastSummary?.ensemble_weights?.smoothing || 0) * 100, 2)}</span></p>
                                    <p>WMAPE Ensemble: <span className="font-semibold">{forecastValidation?.wmape?.ensemble_equal ?? '-'}%</span></p>
                                    <p>Akurasi Ensemble: <span className="font-semibold">{forecastValidation?.accuracy?.ensemble_equal ?? '-'}%</span></p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/70">
                                <p className="text-sm font-semibold text-gray-900 mb-2">Konteks Historis</p>
                                <div className="space-y-1 text-sm text-gray-700">
                                    <p>Rata-rata historis harian: <span className="font-semibold">{formatCurrency(forecastSummary.historical_daily_average)}</span></p>
                                    <p>Rata-rata 30 hari terakhir: <span className="font-semibold">{formatCurrency(forecastSummary.recent_30d_daily_average)}</span></p>
                                    <p>Hari terkuat: <span className="font-semibold">{forecastSummary.best_weekday || '-'}</span></p>
                                    <p>Volatilitas: <span className="font-semibold">{formatPercent(forecastContext?.volatility_index || 0, 2)}</span></p>
                                    <p>Invoice paid historis: <span className="font-semibold">{forecastSummary.historical_paid_invoices || 0}</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-2">
                            <ResponsiveDataView
                                rows={forecastDailyRows.slice(0, 15)}
                                keyField="date"
                                priorityFields={['date', 'predicted_revenue', 'confidence']}
                                emptyMessage="Tidak ada data prediksi harian."
                                tableClassName="w-full text-sm md:min-w-[760px]"
                                columns={[
                                    { key: 'date', label: 'Tanggal', cellClassName: 'px-3 py-2 text-gray-700' },
                                    { key: 'day_name', label: 'Hari', cellClassName: 'px-3 py-2 text-gray-700', render: (row) => row.day_name || '-' },
                                    { key: 'predicted_revenue', label: 'Prediksi', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold text-gray-900', render: (row) => formatCurrency(row.predicted_revenue) },
                                    { key: 'confidence', label: 'Confidence', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatPercent(row.confidence || 0, 1) },
                                    { key: 'spread', label: 'Spread Model', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatPercent(row?.components?.model_spread_ratio || 0, 2) },
                                ]}
                            />
                        </div>
                    </>
                )}
            </div>

            <div className="app-card p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Wallet size={18} className="text-violet-600" />
                            Proyeksi Keuangan Bulanan
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Prediksi pendapatan vs kewajiban wajib, termasuk peluang eksekusi target pembelian.</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getSectionSourceMeta(projectionSectionSource).className}`}>
                                Sumber: {getSectionSourceMeta(projectionSectionSource).label}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                financialProjectionSourceMode === 'live'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                                Proyeksi: {financialProjectionSourceMode === 'live' ? 'Live' : 'Snapshot'}
                            </span>
                            {projectionSectionWarning && (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Warning: {projectionSectionWarning}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Bulan</label>
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
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                        >
                            {financialProjectionLoading ? 'Memproses...' : 'Terapkan'}
                        </button>
                        <button
                            type="button"
                            onClick={handleResetFinancialProjectionRange}
                            disabled={financialProjectionLoading}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold disabled:opacity-60"
                        >
                            Bulan Ini
                        </button>
                    </div>
                </div>

                <div className="text-xs text-gray-500">
                    Periode aktif: {financialProjectionRange.start_date} s.d. {financialProjectionRange.end_date} ({formatMonthLabel(financialProjectionMonth)})
                </div>

                {financialProjectionError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{financialProjectionError}</div>
                )}

                {financialProjectionLoading && !projectionSummary && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                        Memproses proyeksi keuangan...
                    </div>
                )}

                {!financialProjectionLoading && !financialProjectionError && !projectionSummary && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                        Data proyeksi keuangan belum tersedia.
                    </div>
                )}

                {projectionSummary && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                                <p className="text-xs font-medium text-slate-600">Saldo Awal</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(projectionSummary.opening_balance)}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                                <p className="text-xs font-medium text-emerald-700">Prediksi Pemasukan</p>
                                <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(projectionSummary.predicted_income)}</p>
                                <p className="text-xs text-emerald-700 mt-1">Aktual: {formatCurrency(projectionSummary.income_actual_to_date)} | Sisa: {formatCurrency(projectionSummary.income_forecast_remaining)}</p>
                            </div>
                            <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                                <p className="text-xs font-medium text-rose-700">Pengeluaran Wajib</p>
                                <p className="text-2xl font-bold text-rose-900 mt-1">{formatCurrency(projectionSummary.mandatory_expense)}</p>
                                <p className="text-xs text-rose-700 mt-1">Shortfall: {formatCurrency(projectionSummary.mandatory_shortfall_total)}</p>
                            </div>
                            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                                <p className="text-xs font-medium text-amber-700">Saldo Akhir Proyeksi</p>
                                <p className={`text-2xl font-bold mt-1 ${Number(projectionSummary.projected_ending_balance || 0) >= 0 ? 'text-amber-900' : 'text-red-700'}`}>
                                    {formatCurrency(projectionSummary.projected_ending_balance)}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-4">
                                <p className="text-xs font-medium text-cyan-700">Coverage Wajib (Nominal)</p>
                                <p className="text-2xl font-bold text-cyan-900 mt-1">{formatPercent(projectionSummary.mandatory_coverage_amount_rate || 0, 1)}</p>
                                <p className="text-xs text-cyan-700 mt-1">
                                    Event ter-cover: {projectionSummary.mandatory_covered_events || 0}/{projectionSummary.mandatory_total_events || 0}
                                </p>
                            </div>
                            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                                <p className="text-xs font-medium text-indigo-700">Budget Operasional Aman</p>
                                <p className="text-2xl font-bold text-indigo-900 mt-1">{formatCurrency(projectionSummary.operational_spending_budget)}</p>
                                <p className="text-xs text-indigo-700 mt-1">Saran pakai: {formatCurrency(projectionSummary.recommended_operational_spending_budget)}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                                <p className="text-xs font-medium text-gray-700">Konteks Model</p>
                                <p className="text-sm text-gray-700 mt-2">Mode: {projectionSummary.calculation_mode === 'hybrid_actual_forecast' ? 'Hybrid aktual + forecast' : 'Forecast penuh'}</p>
                                <p className="text-sm text-gray-700 mt-1">Confidence: {formatPercent(projectionForecastContext?.average_confidence || 0, 0)}</p>
                                <p className="text-sm text-gray-700 mt-1">Volatilitas: {formatPercent(projectionForecastContext?.volatility_index || 0, 1)}</p>
                            </div>
                        </div>

                        {projectionAssistant && (
                            <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-slate-50 to-blue-50 p-4">
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                            <Brain size={16} className="text-indigo-700" />
                                            Asisten AI Proyeksi Keuangan
                                        </p>
                                        <p className="text-xs text-gray-600 mt-1">{projectionAssistant.headline}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getRiskBadgeClass(projectionAssistant.risk_level)}`}>
                                            Risiko {projectionAssistant.risk_level}
                                        </span>
                                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                                            Skor {projectionAssistant.score}/100
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="h-[320px]">
                            <Line data={projectionChartData} options={projectionChartOptions} />
                        </div>

                        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900">Riwayat Total Saldo (Harian - {formatMonthLabel(financialProjectionMonth)})</p>
                                <div className="flex items-end gap-2">
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Bulan Riwayat</label>
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
                                        className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold disabled:opacity-60"
                                    >
                                        Terapkan
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Pemilih bulan ini sinkron dengan filter Proyeksi Keuangan Bulanan.</p>
                            <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                {financialProjectionLoading && projectionDailyRows.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-gray-500 text-sm">Memuat riwayat saldo...</div>
                                ) : financialProjectionError ? (
                                    <div className="px-3 py-4 text-center text-red-700 text-sm">{financialProjectionError}</div>
                                ) : (
                                    <ResponsiveDataView
                                        rows={projectionDailyRows}
                                        keyField="date"
                                        priorityFields={['date', 'chart_balance', 'chart_balance_source', 'discretionary_balance_display']}
                                        emptyMessage={`Belum ada data riwayat saldo di bulan ${formatMonthLabel(financialProjectionMonth)}.`}
                                        tableClassName="w-full text-sm md:min-w-[980px]"
                                        columns={[
                                            { key: 'date', label: 'Tanggal', cellClassName: 'px-3 py-2 text-gray-700' },
                                            {
                                                key: 'chart_balance',
                                                label: 'Total Saldo',
                                                headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider',
                                                cellClassName: 'px-3 py-2 text-right font-semibold',
                                                render: (row) => {
                                                    const totalSaldo = Number(row.chart_balance ?? row.projected_balance ?? 0);
                                                    return <span className={totalSaldo >= 0 ? 'text-gray-900' : 'text-red-700'}>{formatCurrency(totalSaldo)}</span>;
                                                },
                                            },
                                            {
                                                key: 'chart_balance_source',
                                                label: 'Sumber',
                                                render: (row) => {
                                                    const sourceMeta = getChartBalanceSourceMeta(row.chart_balance_source);
                                                    return (
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sourceMeta.className}`}>
                                                            {sourceMeta.label}
                                                        </span>
                                                    );
                                                },
                                            },
                                            { key: 'predicted_income', label: 'Prediksi Pemasukan', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.predicted_income || 0) },
                                            { key: 'mandatory_expense', label: 'Pengeluaran Wajib', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(row.mandatory_expense || 0) },
                                            { key: 'discretionary_balance_display', label: 'Saldo Bebas', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatCurrency(Math.max(0, Number(row.discretionary_balance_display ?? 0))) },
                                        ]}
                                    />
                                )}
                            </div>
                        </div>

                    </>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-semibold text-gray-900">Prediksi Pengeluaran Wajib</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMandatoryProjectionFilter('all')}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                                        mandatoryProjectionFilter === 'all'
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                >
                                    Semua ({mandatoryProjectionCounters.total})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMandatoryProjectionFilter('confirmed')}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                                        mandatoryProjectionFilter === 'confirmed'
                                            ? 'bg-indigo-700 text-white'
                                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                    }`}
                                >
                                    Sudah Terlaksana ({mandatoryProjectionCounters.confirmed})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMandatoryProjectionFilter('pending')}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                                        mandatoryProjectionFilter === 'pending'
                                            ? 'bg-emerald-700 text-white'
                                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    }`}
                                >
                                    Belum Terlaksana ({mandatoryProjectionCounters.pending})
                                </button>
                            </div>
                        </div>
                        <div className="border border-gray-100 rounded-lg p-2">
                            {financialProjectionLoading && mandatoryProjectionRows.length === 0 ? (
                                <div className="px-3 py-4 text-center text-gray-500 text-sm">Memuat proyeksi pengeluaran wajib...</div>
                            ) : mandatoryProjectionRows.length === 0 ? (
                                <div className="px-3 py-4 text-center text-gray-500 text-sm">Tidak ada kejadian pengeluaran wajib pada periode ini.</div>
                            ) : filteredMandatoryRows.length === 0 ? (
                                <div className="px-3 py-4 text-center text-gray-500 text-sm">Tidak ada data untuk filter yang dipilih.</div>
                            ) : (
                                <ResponsiveDataView
                                    rows={filteredMandatoryRows}
                                    keyField="event_id"
                                    priorityFields={['name', 'due_date', 'amount', 'indicator', 'shortfall']}
                                    tableClassName="w-full text-sm md:min-w-[860px]"
                                    columns={[
                                        { key: 'name', label: 'Target', cellClassName: 'px-3 py-2 font-medium text-gray-900' },
                                        { key: 'due_date', label: 'Jatuh Tempo', cellClassName: 'px-3 py-2 text-gray-700' },
                                        { key: 'amount', label: 'Nominal', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold text-gray-900', render: (row) => formatCurrency(row.amount) },
                                        { key: 'coverage_ratio', label: 'Coverage', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right text-gray-700', render: (row) => formatPercent(row.coverage_ratio || 0, 1) },
                                        { key: 'shortfall', label: 'Shortfall', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold', render: (row) => <span className={Number(row.shortfall || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCurrency(row.shortfall || 0)}</span> },
                                        { key: 'indicator', label: 'Status', render: (row) => <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getMandatoryIndicatorClass(row.indicator)}`}>{row.indicator || '-'}</span> },
                                    ]}
                                    actions={(row) => (
                                        <div className="flex flex-col items-center gap-1">
                                            {row.is_confirmed ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled
                                                        className="px-2 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-700 cursor-not-allowed"
                                                    >
                                                        Sudah Terlaksana
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRevokeMandatoryExecution(row)}
                                                        disabled={mandatoryActionLoadingKey === String(row.event_id || `${row.target_id}-${row.due_date}`)}
                                                        className="px-2 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                    >
                                                        {mandatoryActionLoadingKey === String(row.event_id || `${row.target_id}-${row.due_date}`) ? 'Memproses...' : 'Batalkan'}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConfirmMandatoryExecution(row)}
                                                    disabled={mandatoryActionLoadingKey === String(row.event_id || `${row.target_id}-${row.due_date}`) || row.is_actionable === false}
                                                    className="px-2 py-1 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                                                >
                                                    {mandatoryActionLoadingKey === String(row.event_id || `${row.target_id}-${row.due_date}`) ? 'Memproses...' : 'Tandai Terlaksana'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                />
                            )}
                        </div>
                    </div>

                    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-semibold text-gray-900">Prediksi Kesiapan Target Pembelian</p>
                        <div className="border border-gray-100 rounded-lg p-2">
                            {financialProjectionLoading && purchaseGoalRows.length === 0 ? (
                                <div className="px-3 py-4 text-center text-gray-500 text-sm">Memuat proyeksi target pembelian...</div>
                            ) : (
                                <ResponsiveDataView
                                    rows={purchaseGoalRows}
                                    keyField="id"
                                    priorityFields={['name', 'amount', 'predicted_buy_date', 'indicator']}
                                    emptyMessage="Belum ada target pembelian aktif."
                                    tableClassName="w-full text-sm md:min-w-[700px]"
                                    columns={[
                                        { key: 'name', label: 'Target', cellClassName: 'px-3 py-2 font-medium text-gray-900' },
                                        { key: 'amount', label: 'Nominal', headerClassName: 'px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider', cellClassName: 'px-3 py-2 text-right font-semibold text-gray-900', render: (row) => formatCurrency(row.amount) },
                                        { key: 'desired_date', label: 'Target Tanggal', render: (row) => row.desired_date || '-' },
                                        { key: 'predicted_buy_date', label: 'Prediksi Bisa Dibeli', render: (row) => row.predicted_buy_date || 'Belum tercapai di rentang' },
                                        {
                                            key: 'indicator',
                                            label: 'Status',
                                            render: (row) => (
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    row.indicator === 'siap'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : row.indicator === 'menunggu'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : row.indicator === 'tertahan_wajib'
                                                                ? 'bg-rose-100 text-rose-700'
                                                                : 'bg-gray-200 text-gray-700'
                                                }`}>
                                                    {row.indicator || '-'}
                                                </span>
                                            ),
                                        },
                                    ]}
                                    actions={(row) => (
                                        <div className="flex flex-col items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleFulfillPurchaseGoal(row)}
                                                disabled={purchaseActionLoadingId === Number(row.id)}
                                                className="px-2 py-1 rounded-md text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
                                            >
                                                {purchaseActionLoadingId === Number(row.id) ? 'Memproses...' : 'Rencana Terpenuhi'}
                                            </button>
                                            {row.can_execute_now !== true && (
                                                <span className="text-[11px] text-amber-700">Risiko akan ditampilkan sebelum eksekusi</span>
                                            )}
                                        </div>
                                    )}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">Simulasi Pembelian vs Coverage Wajib</p>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                            projectionSummary?.coverage_status_now === false
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                        }`}>
                            {projectionSummary?.coverage_status_now === false ? 'Coverage Saat Ini: Tidak Aman' : 'Coverage Saat Ini: Aman'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div className="md:col-span-2">
                            <label className="block text-xs text-gray-600 mb-1">Tanggal Simulasi</label>
                            <input
                                type="date"
                                value={purchaseSimulationDate}
                                onChange={(e) => setPurchaseSimulationDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs text-gray-600 mb-1">Nominal Pembelian</label>
                            <input
                                type="number"
                                min="1"
                                value={purchaseSimulationAmount}
                                onChange={(e) => setPurchaseSimulationAmount(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="Contoh: 1500000"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleSimulatePurchase}
                            disabled={purchaseSimulationLoading}
                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
                        >
                            {purchaseSimulationLoading ? 'Memproses...' : 'Simulasikan'}
                        </button>
                    </div>

                    {purchaseSimulationError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                            {purchaseSimulationError}
                        </div>
                    )}

                    {purchaseSimulationResult && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs text-gray-600">Status</p>
                                <p className={`text-sm font-bold mt-1 ${
                                    purchaseSimulationResult?.is_covered ? 'text-emerald-700' : 'text-rose-700'
                                }`}>
                                    {purchaseSimulationResult?.is_covered ? 'Aman' : 'Tidak Aman'}
                                </p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs text-gray-600">Tanggal Gagal Pertama</p>
                                <p className="text-sm font-semibold text-gray-900 mt-1">
                                    {purchaseSimulationResult?.first_failure_date || '-'}
                                </p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs text-gray-600">Minimum Saldo</p>
                                <p className="text-sm font-semibold text-gray-900 mt-1">
                                    {formatCurrency(purchaseSimulationResult?.minimum_balance || 0)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="app-card p-6 space-y-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <DollarSign size={18} className="text-emerald-600" />
                                KPI Manajemen Prediktif
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">Collection, churn, ARPU, aging, dan akurasi backtest forecast.</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getSectionSourceMeta(managementSectionSource).className}`}>
                                    Sumber: {getSectionSourceMeta(managementSectionSource).label}
                                </span>
                                {managementSectionWarning && (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                        Warning: {managementSectionWarning}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Mulai</label>
                                <input
                                    type="date"
                                    value={kpiRange.start_date}
                                    onChange={(e) => setKpiRange((prev) => ({ ...prev, start_date: e.target.value }))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Akhir</label>
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
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                            >
                                {kpiLoading ? 'Memproses...' : 'Terapkan'}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetKpiRange}
                                disabled={kpiLoading}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold disabled:opacity-60"
                            >
                                30 Hari
                            </button>
                        </div>
                    </div>

                    {kpiError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{kpiError}</div>
                    )}

                    {kpiLoading && !kpiSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Memproses KPI manajemen...
                        </div>
                    )}

                    {!kpiLoading && !kpiError && !kpiSummary && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Data KPI belum tersedia.
                        </div>
                    )}

                    {kpiSummary && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                                    <p className="text-xs font-medium text-emerald-700">Collection Rate</p>
                                    <p className="text-2xl font-bold text-emerald-900 mt-1">{formatPercent(kpiSummary.collection_rate, 2)}</p>
                                    <p className={`text-xs mt-1 ${Number(kpiSummary.collection_rate_delta_vs_previous || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        Delta: {Number(kpiSummary.collection_rate_delta_vs_previous || 0) >= 0 ? '+' : ''}{formatPercent(kpiSummary.collection_rate_delta_vs_previous, 2)}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                                    <p className="text-xs font-medium text-rose-700">Churn Pembayaran</p>
                                    <p className="text-2xl font-bold text-rose-900 mt-1">{formatPercent(kpiSummary.churn_rate, 2)}</p>
                                    <p className="text-xs text-rose-700 mt-1">{kpiSummary.churned_customers || 0} pelanggan churn</p>
                                </div>
                                <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                                    <p className="text-xs font-medium text-indigo-700">ARPU Paid Customer</p>
                                    <p className="text-2xl font-bold text-indigo-900 mt-1">{formatCurrency(kpiSummary.arpu_paid_customer)}</p>
                                    <p className="text-xs text-indigo-700 mt-1">Growth revenue: {Number(kpiSummary.revenue_growth_vs_previous || 0) >= 0 ? '+' : ''}{formatPercent(kpiSummary.revenue_growth_vs_previous || 0, 2)}</p>
                                </div>
                                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                                    <p className="text-xs font-medium text-amber-700">Aging Overdue</p>
                                    <p className="text-2xl font-bold text-amber-900 mt-1">{formatCurrency(kpiSummary.aging_total_overdue_amount)}</p>
                                    <p className="text-xs text-amber-700 mt-1">{kpiSummary.aging_total_overdue_invoices || 0} invoice overdue</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/70">
                                <div className="flex items-center justify-between mb-3 gap-2">
                                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                        <Activity size={16} className="text-blue-700" />
                                        Backtest Forecast vs Realisasi
                                    </p>
                                    <span className="text-xs text-gray-500">
                                        {kpiSummary.variance_available ? `Akurasi ${formatPercent(kpiSummary.variance_accuracy_score, 1)}` : 'Data belum cukup'}
                                    </span>
                                </div>
                                {kpiSummary.variance_available && (kpiVariance?.daily || []).length > 0 ? (
                                    <div className="h-[260px]">
                                        <Line data={varianceChartData} options={varianceChartOptions} />
                                    </div>
                                ) : (
                                    <div className="h-[200px] rounded-lg bg-white border border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-500">
                                        Data variance belum tersedia untuk rentang ini.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="app-card p-6 space-y-5">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Users size={18} className="text-teal-600" />
                            Prediksi Risiko Pelanggan
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Menganalisis sinyal telat bayar, aduan, isolir, kualitas koneksi, dan gangguan area.</p>
                    </div>

                    {kpiHealthSummary ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-teal-50 border border-teal-100 p-4">
                                    <p className="text-xs font-medium text-teal-700">Skor Kesehatan Rata-rata</p>
                                    <p className="text-2xl font-bold text-teal-900 mt-1">{Number(kpiHealthSummary.average_health_score || 0).toFixed(1)}</p>
                                </div>
                                <div className="rounded-xl bg-orange-50 border border-orange-100 p-4">
                                    <p className="text-xs font-medium text-orange-700">Pelanggan Risiko Tinggi</p>
                                    <p className="text-2xl font-bold text-orange-900 mt-1">{kpiHealthSummary.high_risk_customers || 0}</p>
                                </div>
                                <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                                    <p className="text-xs font-medium text-red-700">Pelanggan Kritis</p>
                                    <p className="text-2xl font-bold text-red-900 mt-1">{kpiHealthSummary.critical_customers || 0}</p>
                                </div>
                                <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-4">
                                    <p className="text-xs font-medium text-cyan-700">Faktor Dominan</p>
                                    <p className="text-sm font-semibold text-cyan-900 mt-2">{kpiHealthSummary.dominant_risk_factor_label || '-'}</p>
                                </div>
                            </div>

                            <div className="h-[250px]">
                                <Doughnut data={healthDistributionChartData} options={healthDistributionOptions} />
                            </div>

                            <div className="border border-gray-100 rounded-lg p-2">
                                <ResponsiveDataView
                                    rows={kpiHealthTopRiskCustomers.slice(0, 8)}
                                    keyField="customer_id"
                                    priorityFields={['customer_name', 'risk_level', 'health_score']}
                                    emptyMessage="Tidak ada data pelanggan risiko."
                                    tableClassName="w-full text-sm md:min-w-[780px]"
                                    columns={[
                                        { key: 'customer_name', label: 'Pelanggan', cellClassName: 'px-3 py-2 font-medium text-gray-900' },
                                        { key: 'health_score', label: 'Skor', cellClassName: 'px-3 py-2 text-gray-700' },
                                        { key: 'risk_level', label: 'Level Risiko', render: (row) => <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getRiskBadgeClass(row.risk_level)}`}>{row.risk_level}</span> },
                                        { key: 'dominant_factor', label: 'Faktor Dominan', render: (row) => row?.dominant_factor?.label || '-' },
                                        { key: 'recommended_action', label: 'Aksi Disarankan', render: (row) => row.recommended_action || '-' },
                                    ]}
                                />
                            </div>

                            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/70">
                                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <ShieldAlert size={16} className="text-amber-600" />
                                    Rekomendasi Retensi
                                </p>
                                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                                    {(kpiCustomerHealth?.recommendations || []).slice(0, 4).map((item, index) => (
                                        <li key={`retensi-${index}`}>- {item}</li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 text-center">
                            Data risiko pelanggan belum tersedia.
                        </div>
                    )}
                </div>
            </div>

            <div className="app-card p-6">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-red-500" />
                    Ringkasan Risiko Cepat
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                    <div className="rounded-xl border border-gray-200 p-4">
                        <p className="text-xs text-gray-500">Akurasi Prediksi (Backtest)</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                            {kpiSummary?.variance_available
                                ? formatPercent(kpiSummary.variance_accuracy_score, 1)
                                : formatPercent(forecastValidation?.accuracy?.ensemble_equal || forecastSummary?.average_confidence || 0, 1)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                        <p className="text-xs text-gray-500">Coverage Wajib</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{formatPercent(projectionSummary?.mandatory_coverage_amount_rate || 0, 1)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                        <p className="text-xs text-gray-500">Pelanggan Risiko Tinggi/Kritis</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                            {kpiHealthSummary ? `${kpiHealthSummary.high_risk_customers || 0}/${kpiHealthSummary.total_customers || 0}` : '-'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                        <p className="text-xs text-gray-500">Status AI Proyeksi</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                            {projectionAssistant ? `${projectionAssistant.score}/100` : '-'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DashboardPredictionPage;

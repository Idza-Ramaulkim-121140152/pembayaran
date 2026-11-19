import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    ClipboardList,
    DollarSign,
    FileText,
    FolderKanban,
    MessageSquare,
} from 'lucide-react';

const ReportsPage = lazy(() => import('./ReportsPage'));
const CustomerIncomeReportPage = lazy(() => import('./CustomerIncomeReportPage'));
const InstallationReportPage = lazy(() => import('./InstallationReportPage'));
const InactiveCustomerReportPage = lazy(() => import('./InactiveCustomerReportPage'));
const ProjectReportPage = lazy(() => import('./ProjectReportPage'));

const REPORT_TABS = [
    {
        id: 'keuangan',
        label: 'Keuangan',
        description: 'Laba rugi, arus kas, neraca & kontrol budget',
        icon: FileText,
    },
    {
        id: 'income-pelanggan',
        label: 'Profit Pelanggan',
        description: 'Lifetime income vs biaya pasang per pelanggan',
        icon: DollarSign,
    },
    {
        id: 'pemasangan',
        label: 'Pemasangan',
        description: 'Audit pasang baru, material & performa teknisi',
        icon: ClipboardList,
    },
    {
        id: 'tunggakan',
        label: 'Tunggakan & Isolir',
        description: 'Pelanggan lewat jatuh tempo & prioritas tagih',
        icon: AlertTriangle,
    },
    {
        id: 'project',
        label: 'Project Area',
        description: 'P&L project per wilayah & rincian material',
        icon: FolderKanban,
    },
];

function TabLoading() {
    return (
        <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
    );
}

export default function ReportsHubPage({ defaultTab = 'keuangan' }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const requestedTab = searchParams.get('tab') || defaultTab;
    const activeTab = useMemo(() => {
        if (REPORT_TABS.some((t) => t.id === requestedTab)) {
            return requestedTab;
        }
        return 'keuangan';
    }, [requestedTab]);

    useEffect(() => {
        if (location.pathname === '/laporan' && searchParams.get('tab') !== activeTab) {
            if (activeTab !== 'keuangan' || searchParams.has('tab')) {
                setSearchParams({ tab: activeTab }, { replace: true });
            }
        }
    }, [activeTab, location.pathname, searchParams, setSearchParams]);

    const handleSelectTab = (tabId) => {
        if (location.pathname !== '/laporan') {
            navigate(`/laporan?tab=${tabId}`);
            return;
        }
        setSearchParams({ tab: tabId });
    };

    return (
        <div className="space-y-5">
            <div className="no-print rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        {REPORT_TABS.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleSelectTab(tab.id)}
                                    className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-all ${
                                        isActive
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                                    }`}
                                >
                                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-indigo-600'}`} />
                                    <div>
                                        <div className="text-xs font-bold leading-tight sm:text-sm">{tab.label}</div>
                                        <div className={`hidden text-[11px] xl:block ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                            {tab.description}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <Link
                        to="/settings/executive-reports"
                        className="inline-flex items-center gap-1.5 self-start rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 lg:self-center shrink-0"
                    >
                        <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Laporan WA Owner</span>
                    </Link>
                </div>
            </div>

            <Suspense fallback={<TabLoading />}>
                {activeTab === 'keuangan' && <ReportsPage />}
                {activeTab === 'income-pelanggan' && <CustomerIncomeReportPage />}
                {activeTab === 'pemasangan' && <InstallationReportPage />}
                {activeTab === 'tunggakan' && <InactiveCustomerReportPage />}
                {activeTab === 'project' && <ProjectReportPage />}
            </Suspense>
        </div>
    );
}

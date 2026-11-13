import { Suspense, lazy, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, MapPin, Wifi } from 'lucide-react';

const Monitoring = lazy(() => import('./Monitoring'));
const MonitoringMaps = lazy(() => import('./MonitoringMaps'));
const MonitoringGenieAcsPage = lazy(() => import('./MonitoringGenieAcsPage'));

const TABS = [
    {
        id: 'mikrotik',
        label: 'MikroTik & PPPoE',
        description: 'Status server MikroTik, sesi PPPoE aktif, & wilayah',
        icon: Activity,
        permissionKey: 'monitoring.view',
    },
    {
        id: 'maps',
        label: 'Monitoring Maps',
        description: 'Peta sebaran lokasi pelanggan & titik ODP',
        icon: MapPin,
        permissionKey: 'monitoring.maps.view',
    },
    {
        id: 'genieacs',
        label: 'Monitoring GenieACS',
        description: 'Status ONT TR-069, redaman RX, & klien WiFi',
        icon: Wifi,
        permissionKey: 'monitoring.view',
    },
];

function TabFallback() {
    return (
        <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
    );
}

export default function MonitoringHubPage({ defaultTab = 'mikrotik' }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const availableTabs = TABS;

    const requestedTab = searchParams.get('tab') || defaultTab;
    const activeTab = useMemo(() => {
        if (availableTabs.some((t) => t.id === requestedTab)) {
            return requestedTab;
        }
        return availableTabs[0]?.id || 'mikrotik';
    }, [availableTabs, requestedTab]);

    useEffect(() => {
        if (location.pathname === '/monitoring' && searchParams.get('tab') !== activeTab) {
            if (activeTab !== 'mikrotik' || searchParams.has('tab')) {
                setSearchParams({ tab: activeTab }, { replace: true });
            }
        }
    }, [activeTab, location.pathname, searchParams, setSearchParams]);

    const handleSelectTab = (tabId) => {
        if (location.pathname !== '/monitoring') {
            navigate(`/monitoring?tab=${tabId}`);
            return;
        }
        setSearchParams({ tab: tabId });
    };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    {availableTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => handleSelectTab(tab.id)}
                                className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-left transition-all ${
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-indigo-600'}`} />
                                <div>
                                    <div className="text-xs font-bold leading-tight sm:text-sm">{tab.label}</div>
                                    <div className={`hidden text-[11px] sm:block ${isActive ? 'text-indigo-100' : 'text-gray-500'}`}>
                                        {tab.description}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <Suspense fallback={<TabFallback />}>
                {activeTab === 'mikrotik' && <Monitoring />}
                {activeTab === 'maps' && <MonitoringMaps />}
                {activeTab === 'genieacs' && <MonitoringGenieAcsPage />}
            </Suspense>
        </div>
    );
}

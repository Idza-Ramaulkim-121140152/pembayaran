import { useEffect, useMemo, useRef, useState } from 'react';
import {
    DollarSign,
    Menu,
    X,
    ChevronDown,
    User,
    LogOut,
    MapPin,
    CreditCard,
    Megaphone,
    MessageSquare,
    AlertTriangle,
    Send,
    Activity,
    Package,
    Shield,
    Users,
    Wallet,
    GitBranch,
    FileText,
    Brain,
    Target,
    Home,
    Settings2,
    FolderKanban,
	Wrench,
	ClipboardList,
	Landmark,
	Wifi,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import accessControlService from '../../services/accessControlService';

const ACCESS = {
    dashboard: ['superadmin', 'admin', 'teknisi', 'finance'],
    dashboardPrediction: ['superadmin', 'admin', 'finance'],
    reports: ['superadmin', 'admin', 'finance'],
    reportsFinancial: ['superadmin', 'admin', 'finance'],
    reportsCustomerIncome: ['superadmin', 'admin', 'finance'],
    reportsInstallations: ['superadmin', 'admin', 'finance'],
    reportsInactiveCustomers: ['superadmin', 'admin', 'finance'],
    reportsProject: ['superadmin', 'admin', 'finance'],
    penagihan: ['superadmin', 'admin', 'finance'],
    pelanggan: ['superadmin', 'admin', 'teknisi'],
    verifikasi: ['superadmin', 'admin', 'teknisi'],
    customerPackageManagement: ['superadmin', 'admin', 'teknisi', 'finance'],
    customerPackageMigration: ['superadmin'],
    customerAccountMapping: ['superadmin'],
    inventory: ['superadmin', 'admin', 'teknisi', 'finance'],
    inventoryMaster: ['superadmin'],
    installationPricing: ['superadmin'],
    pengeluaran: ['superadmin', 'admin', 'finance'],
    payroll: ['superadmin', 'admin', 'finance'],
    mutasi: ['superadmin', 'admin', 'finance'],
    cashCalendar: ['superadmin', 'admin', 'finance'],
    reconciliation: ['superadmin', 'admin', 'finance'],
    pinjaman: ['superadmin', 'admin', 'finance'],
    odp: ['superadmin', 'admin', 'teknisi'],
    odpMapping: ['superadmin', 'admin', 'teknisi'],
    distributionRoute: ['superadmin', 'admin', 'teknisi'],
    installation: ['superadmin', 'admin', 'teknisi'],
    incidents: ['superadmin', 'admin', 'teknisi'],
    monitoring: ['superadmin', 'admin', 'teknisi'],
    monitoringMaps: ['superadmin', 'admin', 'teknisi'],
    monitoringGenieAcs: ['superadmin', 'admin', 'teknisi'],
    isolir: ['superadmin', 'admin', 'teknisi'],
    complaints: ['superadmin', 'admin', 'teknisi'],
    networkNotices: ['superadmin', 'admin', 'teknisi'],
    waNotification: ['superadmin', 'admin', 'teknisi'],
    paymentMethods: ['superadmin', 'admin', 'finance'],
    paymentReceipts: ['superadmin', 'admin', 'finance'],
    ipaymuIntegration: ['superadmin', 'admin', 'finance'],
    masterData: ['superadmin', 'admin', 'finance'],
    masterWilayah: ['superadmin', 'admin'],
    masterMikrotik: ['superadmin', 'admin'],
    customerWifiLinks: ['superadmin', 'admin'],
    packages: ['superadmin', 'admin'],
    promo: ['superadmin', 'admin'],
    userManagement: ['superadmin'],
    invoiceManagement: ['superadmin'],
    paymentVerification: ['superadmin', 'admin'],
    financialTargets: ['superadmin'],
    accessPolicyMaster: ['superadmin'],
    systemLogs: ['superadmin'],
    systemHealth: ['superadmin'],
    profile: ['superadmin', 'admin', 'teknisi', 'finance'],
};

const MENU_PERMISSION_MAP = {
    dashboard: 'dashboard.view',
    dashboardPrediction: 'dashboard.prediction.view',
    reports: 'report.view',
    reportsFinancial: 'report.view',
    reportsCustomerIncome: 'report.view',
    reportsInstallations: 'report.view',
    reportsInactiveCustomers: 'report.view',
    reportsProject: 'report.view',
    penagihan: 'billing.invoice.view',
    pelanggan: 'customer.view',
    verifikasi: 'customer.verification',
    customerPackageManagement: 'customer.package_audit.view',
    customerPackageMigration: 'customer.package_migration.manage',
    customerAccountMapping: 'customer.account.manage',
    inventory: 'inventory.view',
    inventoryMaster: 'inventory.master.manage',
    installationPricing: 'inventory.master.manage',
    pengeluaran: 'finance.expense.manage',
    payroll: 'payroll.view',
    mutasi: 'finance.mutation.view',
    cashCalendar: 'finance.mutation.view',
    reconciliation: 'finance.mutation.view',
    pinjaman: 'finance.mutation.view',
    odp: 'odp.view',
    odpMapping: 'odp.mapping.view',
    distributionRoute: 'odp.mapping.view',
    installation: 'installation.view',
    incidents: 'incident.view',
    monitoring: 'monitoring.view',
    monitoringMaps: 'monitoring.maps.view',
    monitoringGenieAcs: 'monitoring.view',
    isolir: 'isolir.view',
    complaints: 'complaint.view',
    networkNotices: 'master.network_notice.manage',
    waNotification: 'master.network_notice.manage',
    paymentMethods: 'master.payment.manage',
    paymentReceipts: 'master.payment.manage',
    ipaymuIntegration: 'master.payment.manage',
    masterData: 'masterdata.view',
    masterWilayah: 'master.wilayah.manage',
    masterMikrotik: 'master.mikrotik.manage',
    customerWifiLinks: 'master.customer_wifi_links.manage',
    packages: 'master.package.manage',
    promo: 'master.promo.manage',
    userManagement: 'user.manage',
    invoiceManagement: 'billing.invoice.manage',
    paymentVerification: 'billing.payment_capture.review',
    financialTargets: 'financial_target.manage',
    accessPolicyMaster: 'access_policy.manage',
    systemLogs: 'access_policy.manage',
    systemHealth: 'access_policy.manage',
    profile: 'dashboard.view',
};

const MENU_GROUPS = [
    {
        key: 'operasional',
        label: 'Operasional',
        icon: Wrench,
        items: [
            { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: Home, match: (p) => p === '/dashboard' },
            { key: 'dashboardPrediction', label: 'Prediksi', to: '/dashboard/prediksi', icon: Brain, match: (p) => p === '/dashboard/prediksi' },
            { key: 'pelanggan', label: 'Pelanggan', to: '/customers', icon: Users, match: (p) => p.startsWith('/customers') || p.startsWith('/pelanggan') },
            { key: 'verifikasi', label: 'Verifikasi', to: '/customer-verification', icon: ClipboardList, match: (p) => p.startsWith('/customer-verification') || p.startsWith('/customer-prospects') },
            { key: 'odpMapping', label: 'Pemetaan ODP', to: '/odp-mapping', icon: MapPin, match: (p) => p.startsWith('/odp-mapping') },
            { key: 'odp', label: 'Kelola ODP', to: '/odp', icon: FolderKanban, match: (p) => p.startsWith('/odp') && !p.startsWith('/odp-mapping') },
            { key: 'distributionRoute', label: 'Jalur Distribusi', to: '/jalur-distribusi', icon: GitBranch, match: (p) => p.startsWith('/jalur-distribusi') },
            { key: 'installation', label: 'Instalasi', to: '/instalasi', icon: Settings2, match: (p) => p.startsWith('/instalasi') },
            { key: 'complaints', label: 'Aduan', to: '/complaints', icon: MessageSquare, match: (p) => p.startsWith('/complaints') || p.startsWith('/aduan') },
            { key: 'incidents', label: 'Incident Center', to: '/incidents', icon: AlertTriangle, match: (p) => p.startsWith('/incidents') },
            { key: 'monitoring', label: 'Monitoring', to: '/monitoring', icon: Activity, match: (p) => p === '/monitoring' },
            { key: 'monitoringMaps', label: 'Monitoring Maps', to: '/monitoring-maps', icon: MapPin, match: (p) => p === '/monitoring-maps' },
            { key: 'monitoringGenieAcs', label: 'Monitoring GenieACS', to: '/monitoring-genieacs', icon: Wifi, match: (p) => p.startsWith('/monitoring-genieacs') || p.startsWith('/genieacs') },
            { key: 'isolir', label: 'Isolir', to: '/isolir', icon: AlertTriangle, match: (p) => p.startsWith('/isolir') },
        ],
    },
    {
        key: 'keuangan',
        label: 'Keuangan',
        icon: Wallet,
        items: [
            { key: 'penagihan', label: 'Penagihan', to: '/penagihan', icon: CreditCard, match: (p) => p.startsWith('/penagihan') || p.startsWith('/billing') },
            { key: 'cashCalendar', label: 'Kalender Kas', to: '/kalender-kas', icon: Landmark, match: (p) => p.startsWith('/kalender-kas') },
            { key: 'reconciliation', label: 'Rekonsiliasi', to: '/rekonsiliasi', icon: Shield, match: (p) => p.startsWith('/rekonsiliasi') },
            { key: 'pengeluaran', label: 'Pengeluaran', to: '/pengeluaran', icon: Wallet, match: (p) => p.startsWith('/pengeluaran') },
            { key: 'payroll', label: 'Payroll', to: '/payroll', icon: Users, match: (p) => p.startsWith('/payroll') },
            { key: 'mutasi', label: 'Mutasi', to: '/mutasi', icon: FileText, match: (p) => p.startsWith('/mutasi') },
            { key: 'pinjaman', label: 'Pinjaman', to: '/pinjaman', icon: Wallet, match: (p) => p.startsWith('/pinjaman') },
            { key: 'inventory', label: 'Inventori', to: '/inventori', icon: Package, match: (p) => p === '/inventori' },
            { key: 'inventoryMaster', label: 'Master Inventori', to: '/inventori/master', icon: Package, match: (p) => p.startsWith('/inventori/master') },
        ],
    },
    {
        key: 'laporan',
        label: 'Laporan',
        icon: FileText,
        items: [
            { key: 'reportsFinancial', label: 'Laporan Keuangan', to: '/laporan', icon: FileText, match: (p) => p === '/laporan' },
            { key: 'reportsCustomerIncome', label: 'Laporan Income Pelanggan', to: '/laporan/income-pelanggan', icon: DollarSign, match: (p) => p.startsWith('/laporan/income-pelanggan') },
            { key: 'reportsInstallations', label: 'Laporan Pemasangan', to: '/laporan/pemasangan', icon: ClipboardList, match: (p) => p.startsWith('/laporan/pemasangan') },
            { key: 'reportsInactiveCustomers', label: 'Laporan Pelanggan Nonaktif', to: '/laporan/pelanggan-nonaktif', icon: AlertTriangle, match: (p) => p.startsWith('/laporan/pelanggan-nonaktif') },
            { key: 'reportsProject', label: 'Laporan Project', to: '/laporan/project', icon: FolderKanban, match: (p) => p.startsWith('/laporan/project') },
        ],
    },
    {
        key: 'master',
        label: 'Master',
        icon: FolderKanban,
        items: [
            { key: 'masterData', label: 'Master Data', to: '/settings/master-data', icon: Settings2, match: (p) => p === '/settings/master-data' },
            { key: 'installationPricing', label: 'Harga Instalasi', to: '/settings/installation-pricing', icon: Package, match: (p) => p === '/settings/installation-pricing' },
            { key: 'customerPackageManagement', label: 'Audit Paket Pelanggan', to: '/settings/customer-package-management', icon: Package, match: (p) => p === '/settings/customer-package-management' },
            { key: 'customerPackageMigration', label: 'Migrasi PPPoE Pelanggan', to: '/settings/customer-package-migration', icon: Activity, match: (p) => p === '/settings/customer-package-migration' },
            { key: 'customerAccountMapping', label: 'Mapping Akun Pelanggan', to: '/settings/customer-accounts', icon: Users, match: (p) => p === '/settings/customer-accounts' },
            { key: 'paymentMethods', label: 'Metode Pembayaran', to: '/settings/payment-methods', icon: CreditCard, match: (p) => p === '/settings/payment-methods' },
            { key: 'paymentReceipts', label: 'Receipt Pembayaran', to: '/settings/payment-receipts', icon: CreditCard, match: (p) => p === '/settings/payment-receipts' },
            { key: 'ipaymuIntegration', label: 'Payment Gateway iPaymu', to: '/settings/ipaymu-integration', icon: CreditCard, match: (p) => p.startsWith('/settings/ipaymu-integration') || p.startsWith('/settings/payment-gateway') },
            { key: 'packages', label: 'Paket Internet', to: '/settings/packages', icon: Package, match: (p) => p === '/settings/packages' },
            { key: 'promo', label: 'Promosi', to: '/settings/promo', icon: Megaphone, match: (p) => p === '/settings/promo' },
            { key: 'masterWilayah', label: 'Master Wilayah', to: '/settings/master-wilayah', icon: MapPin, match: (p) => p === '/settings/master-wilayah' },
            { key: 'masterMikrotik', label: 'Master Mikrotik', to: '/settings/master-mikrotik', icon: Activity, match: (p) => p === '/settings/master-mikrotik' },
            { key: 'customerWifiLinks', label: 'Link WiFi Pelanggan', to: '/settings/customer-wifi-links', icon: Wifi, match: (p) => p === '/settings/customer-wifi-links' },
            { key: 'networkNotices', label: 'Info Gangguan', to: '/settings/network-notices', icon: AlertTriangle, match: (p) => p === '/settings/network-notices' },
            { key: 'waNotification', label: 'Notifikasi WA', to: '/settings/send-notification', icon: Send, match: (p) => p === '/settings/send-notification' },
        ],
    },
    {
        key: 'sistem',
        label: 'Sistem',
        icon: Shield,
        items: [
            { key: 'profile', label: 'Profil Saya', to: '/profile', icon: User, match: (p) => p === '/profile' },
            { key: 'userManagement', label: 'Kelola Akun', to: '/settings/users', icon: Users, match: (p) => p === '/settings/users' },
            { key: 'invoiceManagement', label: 'Manajemen Invoice', to: '/settings/invoice-management', icon: FileText, match: (p) => p === '/settings/invoice-management' },
            { key: 'paymentVerification', label: 'Verifikasi Pembayaran AI', to: '/settings/payment-verification', icon: Brain, match: (p) => p === '/settings/payment-verification' },
            { key: 'financialTargets', label: 'Target Keuangan', to: '/settings/financial-targets', icon: Target, match: (p) => p === '/settings/financial-targets' },
            { key: 'accessPolicyMaster', label: 'Akses & Policy', to: '/settings/access-policy', icon: Shield, match: (p) => p === '/settings/access-policy' },
            { key: 'systemLogs', label: 'Log Aktivitas', to: '/settings/system-logs', icon: Activity, match: (p) => p === '/settings/system-logs' },
            { key: 'systemHealth', label: 'System Health', to: '/settings/system-health', icon: Activity, match: (p) => p === '/settings/system-health' },
        ],
    },
];

function can(menu) {
    const role = window.appUserRole || 'admin';
    const permissionKey = MENU_PERMISSION_MAP[menu];

    if (permissionKey && window.appCapabilities && Object.prototype.hasOwnProperty.call(window.appCapabilities, permissionKey)) {
        return !!window.appCapabilities[permissionKey];
    }

    return ACCESS[menu]?.includes(role) ?? false;
}

function itemChildren(item) {
    return (item.children || []).filter((child) => can(child.key));
}

function Navbar() {
    const location = useLocation();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [openDesktopGroup, setOpenDesktopGroup] = useState(null);
    const [openMobileGroups, setOpenMobileGroups] = useState({});
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [capVersion, setCapVersion] = useState(0);
    const [userName, setUserName] = useState('User');
    const [userRole, setUserRole] = useState('');
    const navRef = useRef(null);
    const profileRef = useRef(null);

    useEffect(() => {
        setUserName(window.appUser || localStorage.getItem('appUserName') || 'User');
        setUserRole(window.appUserRole || 'admin');
    }, []);

    useEffect(() => {
        let mounted = true;
        accessControlService.me()
            .then((response) => {
                if (!mounted) return;
                window.appCapabilities = response?.data?.data?.capabilities || {};
                setCapVersion((prev) => prev + 1);
            })
            .catch(() => {});

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const handleOutside = (event) => {
            if (navRef.current && !navRef.current.contains(event.target)) {
                setOpenDesktopGroup(null);
            }
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setIsProfileOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const groupedMenus = useMemo(() => {
        return MENU_GROUPS.map((group) => ({
            ...group,
            items: group.items
                .map((item) => ({
                    ...item,
                    children: itemChildren(item),
                }))
                .filter((item) => can(item.key) || (item.children || []).length > 0),
        })).filter((group) => group.items.length > 0);
    }, [location.pathname, capVersion]);

    const isItemActive = (item) => {
        if ((item.children || []).some((child) => isItemActive(child))) {
            return true;
        }

        return item.match ? item.match(location.pathname) : location.pathname === item.to;
    };

    const activeGroupKey = useMemo(() => {
        for (const group of groupedMenus) {
            if (group.items.some((item) => isItemActive(item))) {
                return group.key;
            }
        }
        return null;
    }, [groupedMenus, location.pathname]);

    const roleLabel = {
        superadmin: 'Super Admin',
        admin: 'Administrator',
        teknisi: 'Teknisi',
        finance: 'Finance',
    }[userRole] || 'User';

    const toggleMobileGroup = (groupKey) => {
        setOpenMobileGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };

    return (
        <nav className="sticky top-0 z-50 border-b border-[var(--app-border)] bg-white/90 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.08)]" ref={navRef}>
            <div className="w-full max-w-none px-4 md:px-6">
                <div className="h-16 flex items-center justify-between gap-4">
                    <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
                        <img src="/logo_baru.png" alt="Rumah Kita Net" className="h-9 w-auto" />
                        <div className="min-w-0 hidden sm:block">
                            <p className="font-bold text-slate-800 truncate">Rumah Kita Net</p>
                            <p className="text-xs text-slate-500 truncate">ISP Management Console</p>
                        </div>
                    </Link>

                    <div className="hidden lg:flex items-center gap-2">
                        {groupedMenus.map((group) => {
                            const Icon = group.icon;
                            const isOpen = openDesktopGroup === group.key;
                            const isActive = activeGroupKey === group.key;
                            return (
                                <div key={group.key} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setOpenDesktopGroup((prev) => (prev === group.key ? null : group.key))}
                                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                                            isOpen || isActive
                                                ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary)] shadow-sm'
                                                : 'text-slate-700 hover:bg-slate-100'
                                        }`}
                                    >
                                        <Icon size={16} />
                                        <span>{group.label}</span>
                                        <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isOpen && (
                                        <div className="absolute right-0 mt-2 min-w-[260px] rounded-2xl border border-[var(--app-border)] bg-white shadow-2xl p-2 animate-[fadeIn_.18s_ease-out]">
                                            {group.items.map((item) => {
                                                const ItemIcon = item.icon;
                                                const active = isItemActive(item);
                                                const children = item.children || [];

                                                if (children.length > 0) {
                                                    return (
                                                        <div key={item.key} className="rounded-xl px-2 py-2">
                                                            <div className={`flex items-center gap-3 px-1 py-1 text-sm ${active ? 'text-[var(--app-primary)] font-semibold' : 'text-slate-500'}`}>
                                                                <ItemIcon size={16} />
                                                                <span className="truncate">{item.label}</span>
                                                            </div>
                                                            <div className="mt-1 space-y-1 pl-7">
                                                                {children.map((child) => {
                                                                    const ChildIcon = child.icon;
                                                                    const childActive = isItemActive(child);

                                                                    return (
                                                                        <Link
                                                                            key={child.key}
                                                                            to={child.to}
                                                                            onClick={() => setOpenDesktopGroup(null)}
                                                                            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                                                                                childActive
                                                                                    ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary)] font-semibold'
                                                                                    : 'text-slate-700 hover:bg-slate-100'
                                                                            }`}
                                                                        >
                                                                            <ChildIcon size={15} />
                                                                            <span className="truncate">{child.label}</span>
                                                                        </Link>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <Link
                                                        key={item.key}
                                                        to={item.to}
                                                        onClick={() => setOpenDesktopGroup(null)}
                                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                                                            active
                                                                ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary)] font-semibold'
                                                                : 'text-slate-700 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        <ItemIcon size={16} />
                                                        <span className="truncate">{item.label}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="hidden lg:flex items-center" ref={profileRef}>
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileOpen((prev) => !prev)}
                                className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-100 transition"
                            >
                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-semibold grid place-items-center">
                                    {(userName || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-semibold text-slate-800 leading-none max-w-[130px] truncate">{userName}</p>
                                    <p className="text-[11px] text-slate-500 leading-none mt-1">{roleLabel}</p>
                                </div>
                                <ChevronDown size={15} className={`text-slate-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isProfileOpen && (
                                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[var(--app-border)] bg-white shadow-2xl p-2 animate-[fadeIn_.18s_ease-out]">
                                    {can('profile') && (
                                        <Link to="/profile" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-slate-100">
                                            <User size={16} /> Profil Saya
                                        </Link>
                                    )}
                                    <form method="POST" action="/logout" className="pt-1 border-t border-slate-100 mt-1">
                                        <input type="hidden" name="_token" value={document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')} />
                                        <button type="submit" className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-rose-600 hover:bg-rose-50">
                                            <LogOut size={16} /> Keluar
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="lg:hidden h-10 w-10 grid place-items-center rounded-xl border border-slate-200 text-slate-700"
                        onClick={() => setIsMobileOpen((prev) => !prev)}
                    >
                        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {isMobileOpen && (
                <div className="lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 space-y-3 max-h-[calc(100vh-64px)] overflow-y-auto">
                    {groupedMenus.map((group) => {
                        const Icon = group.icon;
                        const isOpen = !!openMobileGroups[group.key];
                        const isActive = activeGroupKey === group.key;
                        return (
                            <div key={group.key} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                                <button
                                    type="button"
                                    className={`w-full flex items-center justify-between px-3 py-2.5 ${isActive ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary)]' : 'text-slate-800'}`}
                                    onClick={() => toggleMobileGroup(group.key)}
                                >
                                    <span className="inline-flex items-center gap-2 font-semibold text-sm">
                                        <Icon size={16} /> {group.label}
                                    </span>
                                    <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isOpen && (
                                    <div className="border-t border-slate-200 p-2 space-y-1">
                                        {group.items.map((item) => {
                                            const ItemIcon = item.icon;
                                            const active = isItemActive(item);
                                            const children = item.children || [];

                                            if (children.length > 0) {
                                                return (
                                                    <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                                                        <div className={`flex items-center gap-2 px-2 py-1 text-sm ${active ? 'text-[var(--app-primary)] font-semibold' : 'text-slate-600'}`}>
                                                            <ItemIcon size={15} />
                                                            <span>{item.label}</span>
                                                        </div>
                                                        <div className="mt-1 space-y-1 pl-4">
                                                            {children.map((child) => {
                                                                const ChildIcon = child.icon;
                                                                const childActive = isItemActive(child);

                                                                return (
                                                                    <Link
                                                                        key={child.key}
                                                                        to={child.to}
                                                                        onClick={() => setIsMobileOpen(false)}
                                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${childActive ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary)] font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                                                                    >
                                                                        <ChildIcon size={14} />
                                                                        <span>{child.label}</span>
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <Link
                                                    key={item.key}
                                                    to={item.to}
                                                    onClick={() => setIsMobileOpen(false)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${active ? 'bg-[var(--app-primary-soft)] text-[var(--app-primary)] font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                                                >
                                                    <ItemIcon size={15} />
                                                    <span>{item.label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <div className="rounded-xl border border-slate-200 bg-white p-2">
                        {can('profile') && (
                            <Link to="/profile" onClick={() => setIsMobileOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100">
                                <User size={15} /> Profil Saya
                            </Link>
                        )}
                        <form method="POST" action="/logout" className="pt-2 mt-1 border-t border-slate-200">
                            <input type="hidden" name="_token" value={document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')} />
                            <button type="submit" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50">
                                <LogOut size={15} /> Keluar
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </nav>
    );
}

export default Navbar;

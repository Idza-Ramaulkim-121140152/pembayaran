import { useEffect, useState, useMemo } from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    Eye,
    EyeOff,
    FileText,
    HelpCircle,
    Laptop,
    Link as LinkIcon,
    Lock,
    MapPin,
    Phone,
    Power,
    Radio,
    RefreshCw,
    Router,
    Search,
    ShieldCheck,
    Smartphone,
    Sparkles,
    User,
    UserCheck,
    UserMinus,
    UserPlus,
    Users,
    Wifi,
    WifiOff,
    X,
    Filter,
    Layers,
    ExternalLink,
} from 'lucide-react';
import Modal from '../components/common/Modal';
import genieAcsService from '../services/genieAcsService';

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const parts = new Intl.DateTimeFormat('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Jakarta',
        }).formatToParts(date);

        const map = {};
        parts.forEach((p) => {
            map[p.type] = p.value;
        });

        return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} WIB`;
    } catch {
        return dateStr;
    }
}

export default function MonitoringGenieAcsPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [stats, setStats] = useState({
        total_customers: 0,
        total_devices_in_acs: 0,
        customers_with_acs: 0,
        customers_without_acs: 0,
        online_devices: 0,
        offline_devices: 0,
        unassigned_devices: 0,
        total_connected_clients: 0,
        safe_capacity_count: 0,
        warning_capacity_count: 0,
        critical_capacity_count: 0,
        overlimit_capacity_count: 0,
        critical_rx_count: 0,
        warning_rx_count: 0,
        cached_at: null,
    });
    const [packages, setPackages] = useState([]);
    const [devices, setDevices] = useState([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'with_acs' | 'without_acs' | 'online' | 'offline' | 'critical_rx' | 'unassigned'
    const [capacityFilter, setCapacityFilter] = useState('all'); // 'all' | 'safe' | 'warning' | 'critical' | 'overlimit' | 'no_limit'
    const [packageFilter, setPackageFilter] = useState('all'); // 'all' | package_id or name

    // Modal: Ganti WiFi
    const [wifiModalDevice, setWifiModalDevice] = useState(null);
    const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [copiedCurrentPassword, setCopiedCurrentPassword] = useState(false);
    const [savingWifi, setSavingWifi] = useState(false);

    // Modal: Detail & Klien Terhubung
    const [detailModalDevice, setDetailModalDevice] = useState(null);
    const [deviceDetailData, setDeviceDetailData] = useState(null);
    const [showDetailWifiPassword, setShowDetailWifiPassword] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Modal: Portal Akses Mandiri Pelanggan (Action Mata)
    const [portalModalDevice, setPortalModalDevice] = useState(null);
    const [copiedPortalUrl, setCopiedPortalUrl] = useState(false);

    // Modal: Reboot
    const [rebootModalDevice, setRebootModalDevice] = useState(null);
    const [rebooting, setRebooting] = useState(false);

    // Modal: Tautkan Pelanggan Manual (Untuk Router yang belum tertaut)
    const [assignModalDevice, setAssignModalDevice] = useState(null);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [searchingCustomer, setSearchingCustomer] = useState(false);
    const [assigningCustomer, setAssigningCustomer] = useState(false);

    // Modal: Tautkan Router ke Pelanggan (Untuk Pelanggan yang belum punya GenieACS)
    const [linkRouterCustomer, setLinkRouterCustomer] = useState(null);
    const [availableAcsDevices, setAvailableAcsDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [linkingRouter, setLinkingRouter] = useState(false);

    // Fetch Devices & Customers
    const loadDevices = async (fresh = false) => {
        try {
            setError('');
            if (fresh) {
                setSyncing(true);
            } else {
                setRefreshing(true);
            }

            const response = await genieAcsService.getDevices({
                fresh: fresh ? 1 : 0,
                status: statusFilter !== 'all' ? statusFilter : undefined,
                capacity: capacityFilter !== 'all' ? capacityFilter : undefined,
                package: packageFilter !== 'all' ? packageFilter : undefined,
                search: searchQuery.trim() || undefined,
            });

            setStats(response.data?.stats || {});
            setPackages(response.data?.packages || []);
            setDevices(response.data?.devices || []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memuat data monitoring perangkat GenieACS.');
        } finally {
            setLoading(false);
            setRefreshing(false);
            setSyncing(false);
        }
    };

    useEffect(() => {
        loadDevices(false);
    }, [statusFilter, capacityFilter, packageFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadDevices(false);
    };

    const handleResetFilters = () => {
        setSearchQuery('');
        setStatusFilter('all');
        setCapacityFilter('all');
        setPackageFilter('all');
    };

    const isFiltered = statusFilter !== 'all' || capacityFilter !== 'all' || packageFilter !== 'all' || searchQuery.trim() !== '';

    // Open WiFi Modal
    const handleOpenWifiModal = (device) => {
        setWifiModalDevice(device);
        setWifiForm({
            ssid: device.ssid || '',
            password: '',
        });
        setShowPassword(false);
        setShowCurrentPassword(false);
        setCopiedCurrentPassword(false);
    };

    // Submit Ganti WiFi
    const handleSaveWifi = async (e) => {
        e.preventDefault();
        if (!wifiModalDevice) return;

        if (!wifiForm.ssid && !wifiForm.password) {
            setError('Nama SSID atau Password minimal salah satu harus diisi.');
            return;
        }

        if (wifiForm.password && wifiForm.password.length < 8) {
            setError('Password WiFi minimal 8 karakter.');
            return;
        }

        try {
            setSavingWifi(true);
            setError('');
            setMessage('');

            const res = await genieAcsService.updateWifi(wifiModalDevice.device_id, {
                ssid: wifiForm.ssid ? wifiForm.ssid.trim() : undefined,
                password: wifiForm.password ? wifiForm.password.trim() : undefined,
            });

            setMessage(res.data?.message || 'Pengaturan WiFi berhasil dikirim ke router!');
            setWifiModalDevice(null);
            loadDevices(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengirim konfigurasi WiFi.');
        } finally {
            setSavingWifi(false);
        }
    };

    // Open Detail Modal
    const handleOpenDetailModal = async (device) => {
        setDetailModalDevice(device);
        setDeviceDetailData(null);
        setShowDetailWifiPassword(false);
        setLoadingDetail(true);
        try {
            const res = await genieAcsService.getDevice(device.device_id);
            setDeviceDetailData(res.data?.data || null);
        } catch (err) {
            console.error('Failed to load device details', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    // Submit Reboot
    const handleConfirmReboot = async () => {
        if (!rebootModalDevice) return;

        try {
            setRebooting(true);
            setError('');
            setMessage('');

            const res = await genieAcsService.rebootDevice(rebootModalDevice.device_id);
            setMessage(res.data?.message || 'Perintah reboot router berhasil dikirim.');
            setRebootModalDevice(null);
            loadDevices(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengirim perintah reboot.');
        } finally {
            setRebooting(false);
        }
    };

    // Refresh Parameter Task
    const handleRefreshParam = async (deviceId) => {
        try {
            setRefreshing(true);
            setError('');
            setMessage('');

            const res = await genieAcsService.refreshDevice(deviceId);
            setMessage(res.data?.message || 'Perintah sinkronisasi parameter berhasil dikirim ke router.');

            await loadDevices(true);

            if (wifiModalDevice && wifiModalDevice.device_id === deviceId) {
                try {
                    const detailRes = await genieAcsService.getDevice(deviceId);
                    if (detailRes.data?.data) {
                        setWifiModalDevice((prev) => ({
                            ...prev,
                            wifi_password: detailRes.data.data.wifi_password || prev.wifi_password,
                            ssid: detailRes.data.data.ssid || prev.ssid,
                        }));
                    }
                } catch {
                    // Ignore background detail refresh error
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengirim perintah sinkronisasi.');
        } finally {
            setRefreshing(false);
        }
    };

    // Search Customers for Assignment
    const handleSearchCustomers = async (query) => {
        setCustomerQuery(query);
        if (!query || query.trim().length < 2) {
            setCustomerResults([]);
            return;
        }

        try {
            setSearchingCustomer(true);
            const res = await genieAcsService.getCustomers({ search: query.trim(), per_page: 8 });
            const list = res.data?.data || res.data || [];
            setCustomerResults(Array.isArray(list) ? list : (list.data || []));
        } catch (err) {
            console.error('Customer search error', err);
        } finally {
            setSearchingCustomer(false);
        }
    };

    // Assign Customer Submit
    const handleAssignCustomerSubmit = async (customerId) => {
        if (!assignModalDevice) return;

        try {
            setAssigningCustomer(true);
            setError('');
            setMessage('');

            const res = await genieAcsService.assignCustomer(assignModalDevice.device_id, customerId);
            setMessage(res.data?.message || 'Perangkat berhasil ditautkan ke pelanggan.');
            setAssignModalDevice(null);
            loadDevices(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menautkan pelanggan ke perangkat.');
        } finally {
            setAssigningCustomer(false);
        }
    };

    // Open Link Router Modal (For customer without GenieACS)
    const handleOpenLinkRouterModal = (row) => {
        setLinkRouterCustomer(row.customer);
        const unassigned = devices.filter((d) => d.is_unassigned && d.device_id);
        setAvailableAcsDevices(unassigned);
        setSelectedDeviceId(unassigned[0]?.device_id || '');
    };

    // Submit Link Router to Customer
    const handleLinkRouterSubmit = async (e) => {
        e.preventDefault();
        if (!linkRouterCustomer || !selectedDeviceId) return;

        try {
            setLinkingRouter(true);
            setError('');
            setMessage('');

            const res = await genieAcsService.assignCustomer(selectedDeviceId, linkRouterCustomer.id);
            setMessage(res.data?.message || 'Router berhasil ditautkan ke pelanggan.');
            setLinkRouterCustomer(null);
            loadDevices(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menautkan router ke pelanggan.');
        } finally {
            setLinkingRouter(false);
        }
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 sm:text-3xl">
                        <Router className="h-8 w-8 text-emerald-600" />
                        Monitoring Perangkat & Pelanggan (GenieACS)
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Pantau perangkat ONT/Router pelanggan, total klien terhubung, kepatuhan batas paket (Aman, Siaga, Kritis), redaman optik, dan remote setting WiFi.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => loadDevices(true)}
                        disabled={syncing || refreshing}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition"
                    >
                        <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Menyinkronkan...' : 'Sinkronkan dari ACS (Force Sync)'}
                    </button>
                    <button
                        type="button"
                        onClick={() => loadDevices(false)}
                        disabled={refreshing || syncing}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
                    >
                        <RefreshCw size={16} className={refreshing && !syncing ? 'animate-spin text-emerald-600' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Alert Messages */}
            {message && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>{message}</span>
                    </div>
                    <button type="button" onClick={() => setMessage('')} className="text-emerald-600 hover:text-emerald-800">
                        <X size={16} />
                    </button>
                </div>
            )}
            {error && (
                <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="text-red-600 hover:text-red-800">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Stats Summary Cards (Include Total Perangkat Terhubung) */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {/* Total Pelanggan */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Pelanggan</p>
                        <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                            <Users size={18} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{stats.total_customers || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Database Pelanggan</p>
                </div>

                {/* Total Perangkat Terhubung (Klien Aktif) */}
                <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Total Klien Terhubung</p>
                        <div className="rounded-xl bg-emerald-600 p-2 text-white shadow-xs">
                            <Smartphone size={18} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                        {stats.total_connected_clients || 0} <span className="text-sm font-semibold text-emerald-600">Perangkat</span>
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold">
                        <span className="text-emerald-700 bg-emerald-100/80 px-1 rounded">Aman: {stats.safe_capacity_count || 0}</span>
                        <span className="text-amber-800 bg-amber-100 px-1 rounded">Siaga: {stats.warning_capacity_count || 0}</span>
                        <span className="text-rose-700 bg-rose-100 px-1 rounded">Kritis: {stats.critical_capacity_count || 0}</span>
                    </div>
                </div>

                {/* Ada GenieACS */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ada GenieACS</p>
                        <div className="rounded-xl bg-purple-50 p-2 text-purple-600">
                            <UserCheck size={18} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-purple-700">{stats.customers_with_acs || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Router Terdaftar</p>
                </div>

                {/* Router Online */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Router Online</p>
                        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                            <Wifi size={18} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-emerald-600">{stats.online_devices || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Inform &lt; 15 menit</p>
                </div>

                {/* Redaman Kritis */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Redaman Kritis</p>
                        <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                            <AlertCircle size={18} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-rose-600">{stats.critical_rx_count || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Sinyal &lt; -27 dBm</p>
                </div>

                {/* Belum Ada GenieACS */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Belum Ada ACS</p>
                        <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                            <UserMinus size={18} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-amber-600">{stats.customers_without_acs || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Perlu Didaftarkan</p>
                </div>
            </div>

            {/* Filter & Search Navigation */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                {/* Status Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                        { key: 'all', label: `Semua (${(stats.total_customers || 0) + (stats.unassigned_devices || 0)})`, icon: Users },
                        { key: 'with_acs', label: `Ada GenieACS (${stats.customers_with_acs || 0})`, icon: UserCheck },
                        { key: 'without_acs', label: `Belum Ada GenieACS (${stats.customers_without_acs || 0})`, icon: UserMinus },
                        { key: 'online', label: `Online (${stats.online_devices || 0})`, icon: Wifi },
                        { key: 'offline', label: `Offline (${stats.offline_devices || 0})`, icon: WifiOff },
                        { key: 'critical_rx', label: `Redaman Kritis (${stats.critical_rx_count || 0})`, icon: AlertTriangle },
                        { key: 'unassigned', label: `ACS Belum Tertaut (${stats.unassigned_devices || 0})`, icon: Router },
                    ].map((t) => {
                        const Icon = t.icon;
                        const isActive = statusFilter === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setStatusFilter(t.key)}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold transition ${
                                    isActive
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                <Icon size={14} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {/* Secondary Filters: Dropdown Kapasitas Perangkat, Dropdown Paket, Search Box */}
                <div className="grid gap-3 pt-2 border-t border-gray-100 sm:grid-cols-2 lg:grid-cols-4 items-center">
                    {/* Dropdown 1: Status Kapasitas Perangkat */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1">
                            <Smartphone size={12} className="text-emerald-600" />
                            Kapasitas Perangkat Terhubung:
                        </label>
                        <select
                            value={capacityFilter}
                            onChange={(e) => setCapacityFilter(e.target.value)}
                            className="w-full text-xs rounded-xl border border-gray-200 bg-gray-50/70 p-2 font-medium text-gray-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                            <option value="all">⚡ Semua Status Kapasitas</option>
                            <option value="safe">🟢 Aman (PT ≤ Batas Paket)</option>
                            <option value="warning">🟡 Siaga (Lebih 1 Perangkat)</option>
                            <option value="critical">🔴 Kritis (Melebihi &gt; 1 Perangkat)</option>
                            <option value="overlimit">⚠️ Semua Melebihi Batas (Siaga + Kritis)</option>
                            <option value="no_limit">⚪ Tanpa Batas / Belum Disetel</option>
                        </select>
                    </div>

                    {/* Dropdown 2: Paket Layanan */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1">
                            <Layers size={12} className="text-emerald-600" />
                            Paket Layanan:
                        </label>
                        <select
                            value={packageFilter}
                            onChange={(e) => setPackageFilter(e.target.value)}
                            className="w-full text-xs rounded-xl border border-gray-200 bg-gray-50/70 p-2 font-medium text-gray-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                            <option value="all">📦 Semua Paket Layanan</option>
                            {packages.map((pkg) => (
                                <option key={pkg.id} value={pkg.name}>
                                    {pkg.name} {pkg.device_count ? `(Maks ${pkg.device_count} Perangkat)` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Search Form */}
                    <div className="lg:col-span-2">
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                            Pencarian Cepat Pelanggan / Router:
                        </label>
                        <div className="flex items-center gap-2">
                            <form onSubmit={handleSearchSubmit} className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari nama, WA, PPPoE, SSID, SN, IP, Paket..."
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-10 pr-4 py-2 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </form>
                            {isFiltered && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 shrink-0"
                                    title="Reset Semua Filter"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Unified Devices & Customers List Table */}
            {loading ? (
                <div className="flex min-h-[300px] items-center justify-center rounded-2xl bg-white p-12 text-center shadow-sm">
                    <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
                        <p className="text-sm font-medium text-gray-500">Memuat sinkronisasi pelanggan dan GenieACS...</p>
                    </div>
                </div>
            ) : devices.length === 0 ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
                    <Router className="h-12 w-12 text-gray-300" />
                    <p className="mt-3 text-base font-semibold text-gray-700">Tidak ada data yang sesuai filter.</p>
                    <p className="mt-1 text-xs text-gray-400">Coba ubah kata kunci pencarian atau dropdown filter di atas.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-gray-600">
                            <thead className="bg-gray-50/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3.5">Pelanggan & Paket</th>
                                    <th className="px-4 py-3.5">Status GenieACS</th>
                                    <th className="px-4 py-3.5">Perangkat & IP</th>
                                    <th className="px-4 py-3.5">Redaman (RX Power)</th>
                                    <th className="px-4 py-3.5">WiFi & Kapasitas Klien</th>
                                    <th className="px-4 py-3.5 text-right">Aksi Jarak Jauh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {devices.map((row, idx) => {
                                    const hasAcs = row.has_genieacs;
                                    const isUnassigned = row.is_unassigned;
                                    const isOnline = row.is_online;
                                    const cust = row.customer;
                                    const rx = row.rx_power;
                                    const clientsCount = row.wifi_clients_count || 0;
                                    const maxDev = row.max_devices;
                                    const capStatus = row.capacity_status; // 'safe' | 'warning' | 'critical' | 'no_limit'

                                    return (
                                        <tr
                                            key={row.device_id || `cust-${cust?.id || idx}`}
                                            className={`transition ${!hasAcs ? 'bg-amber-50/20 hover:bg-amber-50/50' : 'hover:bg-gray-50/70'}`}
                                        >
                                            {/* Pelanggan & Paket */}
                                            <td className="px-4 py-3.5">
                                                {cust ? (
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-gray-900 text-xs">{cust.name}</span>
                                                            {!cust.is_active && (
                                                                <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold">Nonaktif</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                                            <span>📱 {cust.phone || '-'}</span>
                                                            {cust.phone && (
                                                                <a
                                                                    href={`https://wa.me/${cust.phone.replace(/[^0-9]/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-emerald-600 hover:text-emerald-700"
                                                                    title="Chat WhatsApp"
                                                                >
                                                                    <Phone size={11} />
                                                                </a>
                                                            )}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                                            {/* Paket Badge */}
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-2 py-0.5">
                                                                <Layers size={10} className="text-emerald-600" />
                                                                {cust.package_name || 'Paket -'}
                                                                {cust.package_max_devices ? (
                                                                    <span className="text-emerald-600 font-semibold">(Maks {cust.package_max_devices} Perangkat)</span>
                                                                ) : null}
                                                            </span>
                                                            {cust.pppoe_username && (
                                                                <span className="text-[10px] font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                    PPPoE: {cust.pppoe_username}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {cust.address && (
                                                            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-xs flex items-center gap-1">
                                                                <MapPin size={10} className="shrink-0" />
                                                                {cust.address}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <span className="text-[11px] font-semibold text-purple-800 bg-purple-50 border border-purple-200 rounded px-2 py-0.5 inline-block">
                                                            Router di ACS Tanpa Pelanggan
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setAssignModalDevice(row);
                                                                setCustomerQuery(row.pppoe_username || '');
                                                                handleSearchCustomers(row.pppoe_username || '');
                                                            }}
                                                            className="block mt-1 text-[11px] font-bold text-blue-600 hover:underline"
                                                        >
                                                            + Tautkan ke Pelanggan
                                                        </button>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Status GenieACS */}
                                            <td className="px-4 py-3.5">
                                                {hasAcs ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5">
                                                            {isOnline ? (
                                                                <>
                                                                    <span className="relative flex h-2.5 w-2.5">
                                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                                                    </span>
                                                                    <span className="font-bold text-emerald-700 text-xs">Online</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="inline-flex rounded-full h-2.5 w-2.5 bg-gray-300"></span>
                                                                    <span className="font-semibold text-gray-500 text-xs">Offline</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 flex items-center gap-1 font-medium">
                                                            <Clock size={10} className="shrink-0" />
                                                            {formatDateTime(row.last_inform_at)}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800">
                                                            <AlertTriangle size={12} className="text-amber-600" />
                                                            Belum Ada GenieACS
                                                        </span>
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            Router belum didaftarkan di ACS
                                                        </p>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Perangkat & IP */}
                                            <td className="px-4 py-3.5">
                                                {hasAcs ? (
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-gray-900">{row.product_class || 'ONT Router'}</span>
                                                            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                {row.manufacturer || 'ONT'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] font-mono text-gray-500 mt-0.5">
                                                            SN: <strong>{row.serial_number || row.device_id?.split('-')[2] || '-'}</strong>
                                                        </p>
                                                        {row.ip_address && (
                                                            <p className="text-[10px] font-mono text-gray-600 mt-0.5">
                                                                IP: <strong>{row.ip_address}</strong>
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-[11px] italic">-</span>
                                                )}
                                            </td>

                                            {/* Optical RX Power */}
                                            <td className="px-4 py-3.5">
                                                {hasAcs && rx !== null ? (
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                                                            row.rx_status === 'normal'
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : row.rx_status === 'warning'
                                                                ? 'bg-amber-100 text-amber-800'
                                                                : 'bg-rose-100 text-rose-800'
                                                        }`}
                                                    >
                                                        <Radio size={12} />
                                                        {rx} dBm
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-[11px]">-</span>
                                                )}
                                            </td>

                                            {/* WiFi & Kapasitas Klien Terhubung */}
                                            <td className="px-4 py-3.5">
                                                {hasAcs ? (
                                                    <div>
                                                        <p className="font-bold text-gray-900 flex items-center gap-1">
                                                            <Wifi size={13} className="text-emerald-600" />
                                                            {row.ssid || 'SSID Default'}
                                                        </p>
                                                        
                                                        {/* Status Kapasitas Perangkat Terhubung */}
                                                        {capStatus === 'safe' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenDetailModal(row)}
                                                                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                                                                title="Jumlah perangkat aman sesuai batas paket"
                                                            >
                                                                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                                                                {clientsCount} {maxDev ? `/ ${maxDev}` : ''} Klien (Aman)
                                                            </button>
                                                        ) : capStatus === 'warning' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenDetailModal(row)}
                                                                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                                                                title="Perangkat terhubung lebih banyak 1 dari batas paket"
                                                            >
                                                                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                                                                {clientsCount} / {maxDev} Klien · Siaga (+1)
                                                            </button>
                                                        ) : capStatus === 'critical' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenDetailModal(row)}
                                                                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-300 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs animate-pulse"
                                                                title={`Perangkat terhubung melebihi batas paket sebanyak +${row.capacity_diff} perangkat`}
                                                            >
                                                                <AlertTriangle size={12} className="text-rose-600 shrink-0" />
                                                                {clientsCount} / {maxDev} Klien · Kritis (+{row.capacity_diff})
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenDetailModal(row)}
                                                                className="mt-1 inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
                                                            >
                                                                <Users size={12} />
                                                                {clientsCount} Klien Terhubung
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-[11px]">-</span>
                                                )}
                                            </td>

                                            {/* Aksi Jarak Jauh */}
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Action Mata: Portal Akses Mandiri Pelanggan (Tanpa Login) */}
                                                    {row.portal_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setPortalModalDevice(row);
                                                                setCopiedPortalUrl(false);
                                                            }}
                                                            title="Portal Akses Mandiri Pelanggan (Tanpa Login)"
                                                            className="rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
                                                        >
                                                            <Eye size={15} />
                                                        </button>
                                                    )}

                                                    {hasAcs ? (
                                                        <>
                                                            {/* Ganti Sandi WiFi */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenWifiModal(row)}
                                                                title="Ganti Sandi & SSID WiFi"
                                                                className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100 transition"
                                                            >
                                                                <Lock size={15} />
                                                            </button>

                                                            {/* Detail & Klien */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenDetailModal(row)}
                                                                title="Detail Perangkat & Klien"
                                                                className="rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50 transition"
                                                            >
                                                                <Activity size={15} />
                                                            </button>

                                                            {/* Reboot Router */}
                                                            <button
                                                                type="button"
                                                                onClick={() => setRebootModalDevice(row)}
                                                                title="Reboot Router ONT"
                                                                className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 transition"
                                                            >
                                                                <Power size={15} />
                                                            </button>

                                                            {/* Refresh Parameter */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRefreshParam(row.device_id)}
                                                                title="Sync / Refresh Parameter"
                                                                className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 transition"
                                                            >
                                                                <RefreshCw size={15} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenLinkRouterModal(row)}
                                                            className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition shadow-sm"
                                                        >
                                                            <LinkIcon size={13} />
                                                            + Tautkan Router
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL 1: GANTI SANDI & SSID WIFI */}
            <Modal
                isOpen={Boolean(wifiModalDevice)}
                onClose={() => setWifiModalDevice(null)}
                title="Ganti Password & SSID WiFi Router"
            >
                {wifiModalDevice && (
                    <form onSubmit={handleSaveWifi} className="space-y-4">
                        {/* Current Device & WiFi Summary */}
                        <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-emerald-50/40 border border-emerald-200/80 p-3.5 text-xs space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">
                                        {wifiModalDevice.customer?.name || wifiModalDevice.pppoe_username || wifiModalDevice.product_class}
                                    </p>
                                    <p className="text-gray-500 font-mono text-[11px] mt-0.5">
                                        Model: {wifiModalDevice.product_class} · SN: {wifiModalDevice.serial_number || wifiModalDevice.device_id}
                                    </p>
                                </div>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${wifiModalDevice.is_online ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
                                    {wifiModalDevice.is_online ? '● Online' : '○ Offline'}
                                </span>
                            </div>

                            {/* Password Saat Ini */}
                            <div className="pt-2 border-t border-emerald-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div>
                                    <p className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                                        <Lock size={12} className="text-emerald-600" />
                                        Password WiFi Saat Ini (Aktif di Router):
                                    </p>
                                    {wifiModalDevice.wifi_password ? (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="font-mono text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1 select-all">
                                                {showCurrentPassword ? wifiModalDevice.wifi_password : '••••••••••••'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition"
                                                title={showCurrentPassword ? 'Sembunyikan password' : 'Lihat password'}
                                            >
                                                {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(wifiModalDevice.wifi_password);
                                                    setCopiedCurrentPassword(true);
                                                    setTimeout(() => setCopiedCurrentPassword(false), 2000);
                                                }}
                                                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition flex items-center gap-1 text-[11px]"
                                                title="Salin password"
                                            >
                                                {copiedCurrentPassword ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                                <span>{copiedCurrentPassword ? 'Tersalin' : 'Salin'}</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-gray-500 italic mt-0.5">
                                            Password tersimpan di router (Terenkripsi / Belum di-inform).
                                        </p>
                                    )}
                                </div>

                                {wifiModalDevice.device_id && (
                                    <button
                                        type="button"
                                        onClick={() => handleRefreshParam(wifiModalDevice.device_id)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline self-start sm:self-auto"
                                        title="Tarik pembaruan parameter dari router"
                                    >
                                        <RefreshCw size={11} />
                                        Tarik dari Router
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                                Nama SSID WiFi
                            </label>
                            <input
                                type="text"
                                value={wifiForm.ssid}
                                onChange={(e) => setWifiForm((p) => ({ ...p, ssid: e.target.value }))}
                                placeholder="Contoh: Rumah Kita Net - Hasan"
                                className="w-full text-xs rounded-xl border border-gray-300 p-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                                Kata Sandi WiFi Baru (Minimal 8 Karakter)
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={wifiForm.password}
                                    onChange={(e) => setWifiForm((p) => ({ ...p, password: e.target.value }))}
                                    placeholder="Masukkan password WiFi baru..."
                                    className="w-full text-xs rounded-xl border border-gray-300 pr-10 p-2.5 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">
                                Kosongkan jika hanya ingin mengganti Nama SSID saja tanpa mengubah sandi.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setWifiModalDevice(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={savingWifi}
                                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
                            >
                                {savingWifi ? (
                                    <>
                                        <RefreshCw size={13} className="animate-spin" />
                                        Mengirim Task ke Router...
                                    </>
                                ) : (
                                    'Kirim Perubahan ke Router'
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* MODAL 2: DETAIL PERANGKAT & KLIEN TERHUBUNG */}
            <Modal
                isOpen={Boolean(detailModalDevice)}
                onClose={() => setDetailModalDevice(null)}
                title="Detail Perangkat & Klien Terhubung"
            >
                {detailModalDevice && (
                    <div className="space-y-4">
                        {loadingDetail ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center">
                                <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 mb-2" />
                                <p className="text-xs text-gray-500">Memuat telemetri router...</p>
                            </div>
                        ) : (
                            <>
                                {/* Status Kapasitas Banner */}
                                {detailModalDevice.max_devices && (
                                    <div
                                        className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                                            detailModalDevice.capacity_status === 'safe'
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                                : detailModalDevice.capacity_status === 'warning'
                                                ? 'bg-amber-50 border-amber-300 text-amber-900'
                                                : 'bg-rose-50 border-rose-300 text-rose-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {detailModalDevice.capacity_status === 'safe' ? (
                                                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertTriangle size={18} className={detailModalDevice.capacity_status === 'warning' ? 'text-amber-600 shrink-0' : 'text-rose-600 shrink-0'} />
                                            )}
                                            <div>
                                                <p className="font-bold">
                                                    Status Kapasitas: {detailModalDevice.capacity_label}
                                                </p>
                                                <p className="text-[11px] opacity-80">
                                                    Paket: {detailModalDevice.customer?.package_name || '-'} (Batas Maksimal: {detailModalDevice.max_devices} Perangkat)
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Telemetry Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                        <p className="text-[11px] text-gray-500 font-medium">Model / Tipe</p>
                                        <p className="font-bold text-gray-900 mt-0.5">{detailModalDevice.product_class}</p>
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                        <p className="text-[11px] text-gray-500 font-medium">WAN IP Address</p>
                                        <p className="font-bold text-gray-900 font-mono mt-0.5">{detailModalDevice.ip_address || '-'}</p>
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                        <p className="text-[11px] text-gray-500 font-medium">Redaman RX Power</p>
                                        <p className="font-bold text-emerald-700 mt-0.5">{detailModalDevice.rx_power ? `${detailModalDevice.rx_power} dBm` : '-'}</p>
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                        <p className="text-[11px] text-gray-500 font-medium">Klien Terhubung</p>
                                        <p className="font-bold text-blue-700 mt-0.5">{detailModalDevice.wifi_clients_count} Perangkat</p>
                                    </div>
                                </div>

                                {/* WiFi Summary Card */}
                                <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div>
                                        <p className="text-[11px] text-gray-600 font-semibold flex items-center gap-1">
                                            <Wifi size={13} className="text-emerald-600" />
                                            Nama SSID: <span className="font-bold text-gray-900">{deviceDetailData?.ssid || detailModalDevice.ssid || 'SSID Default'}</span>
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[11px] text-gray-600 font-semibold flex items-center gap-1">
                                                <Lock size={12} className="text-emerald-600" />
                                                Password WiFi:
                                            </span>
                                            {(deviceDetailData?.wifi_password || detailModalDevice.wifi_password) ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded px-2 py-0.5 select-all">
                                                        {showDetailWifiPassword ? (deviceDetailData?.wifi_password || detailModalDevice.wifi_password) : '••••••••••••'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowDetailWifiPassword(!showDetailWifiPassword)}
                                                        className="p-1 rounded border border-gray-200 bg-white text-gray-500 hover:text-gray-700"
                                                        title={showDetailWifiPassword ? 'Sembunyikan' : 'Lihat password'}
                                                    >
                                                        {showDetailWifiPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic text-[11px]">Tersimpan di router</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
                                            <Users size={12} />
                                            {detailModalDevice.wifi_clients_count} Klien Aktif Terhubung
                                        </span>
                                    </div>
                                </div>

                                {/* Connected Devices List */}
                                <div>
                                    <h4 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                                        <Laptop size={14} className="text-emerald-600" />
                                        Daftar Perangkat (HP / Laptop / TV) yang Terkoneksi ke Router ({deviceDetailData?.lan_hosts?.length || 0}):
                                    </h4>

                                    {deviceDetailData?.lan_hosts && deviceDetailData.lan_hosts.length > 0 ? (
                                        <div className="max-h-72 overflow-y-auto rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-xs">
                                            {deviceDetailData.lan_hosts.map((h, i) => (
                                                <div key={i} className={`flex items-center justify-between p-3 text-xs transition ${h.is_active ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-gray-50'}`}>
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`p-2 rounded-xl ${h.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                            {h.type?.toLowerCase().includes('lan') ? <Laptop size={16} /> : <Smartphone size={16} />}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="font-bold text-gray-900">{h.name || `Perangkat ${i + 1}`}</p>
                                                                {h.is_active && (
                                                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded">
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                                                        Aktif
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] font-mono text-gray-500 mt-0.5">
                                                                IP: <strong className="text-gray-700">{h.ip_address || '-'}</strong> · MAC: <strong className="text-gray-700">{h.mac_address || '-'}</strong>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                                                        h.is_active
                                                            ? 'text-emerald-800 bg-emerald-100 border border-emerald-200'
                                                            : h.type?.toLowerCase().includes('lan')
                                                            ? 'text-blue-800 bg-blue-50 border border-blue-200'
                                                            : 'text-gray-600 bg-gray-100'
                                                    }`}>
                                                        {h.type || 'WiFi'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-400 bg-gray-50/50">
                                            <Smartphone size={24} className="mx-auto mb-2 text-gray-300" />
                                            <p className="font-semibold text-gray-600">Tidak ada rincian klien spesifik yang dilaporkan router.</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                Total {detailModalDevice.wifi_clients_count} klien dilaporkan aktif melalui parameter TR-069 router.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setDetailModalDevice(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL 3: REBOOT CONFIRMATION */}
            <Modal
                isOpen={Boolean(rebootModalDevice)}
                onClose={() => setRebootModalDevice(null)}
                title="Konfirmasi Reboot Router ONT"
            >
                {rebootModalDevice && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Apakah Anda yakin ingin me-restart router ini?</p>
                                <p className="mt-1 text-amber-800">
                                    Router pelanggan <strong>{rebootModalDevice.customer?.name || rebootModalDevice.pppoe_username}</strong> akan mati sesaat dan memulai ulang sistem (reboot). Koneksi internet pelanggan akan terputus selama 1-2 menit.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setRebootModalDevice(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReboot}
                                disabled={rebooting}
                                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-60 flex items-center gap-1.5"
                            >
                                {rebooting ? (
                                    <>
                                        <RefreshCw size={13} className="animate-spin" />
                                        Mengirim Perintah Reboot...
                                    </>
                                ) : (
                                    'Ya, Reboot Router Sekarang'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL 4: TAUTKAN PELANGGAN MANUAL KE ROUTER BELUM TERTAUT */}
            <Modal
                isOpen={Boolean(assignModalDevice)}
                onClose={() => setAssignModalDevice(null)}
                title="Tautkan Router ke Pelanggan"
            >
                {assignModalDevice && (
                    <div className="space-y-4">
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs">
                            <p className="font-bold text-gray-900">Device ID: {assignModalDevice.device_id}</p>
                            <p className="text-gray-500 font-mono text-[11px] mt-0.5">
                                Model: {assignModalDevice.product_class} · PPPoE Terbaca: {assignModalDevice.pppoe_username || '-'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                                Cari Pelanggan di Database (Ketik Nama / No. WA / PPPoE)
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input
                                    type="text"
                                    value={customerQuery}
                                    onChange={(e) => handleSearchCustomers(e.target.value)}
                                    placeholder="Ketik minimal 2 huruf..."
                                    className="w-full text-xs rounded-xl border border-gray-300 pl-10 p-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                        </div>

                        {searchingCustomer ? (
                            <div className="text-center py-4 text-xs text-gray-500 flex items-center justify-center gap-2">
                                <RefreshCw size={14} className="animate-spin text-emerald-600" />
                                Mencari pelanggan...
                            </div>
                        ) : customerResults.length > 0 ? (
                            <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                                {customerResults.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between p-3 text-xs hover:bg-gray-50">
                                        <div>
                                            <p className="font-bold text-gray-900">{c.name}</p>
                                            <p className="text-[11px] text-gray-500">
                                                📱 {c.phone || '-'} · PPPoE: <span className="font-mono">{c.pppoe_username || '-'}</span>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleAssignCustomerSubmit(c.id)}
                                            disabled={assigningCustomer}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60"
                                        >
                                            {assigningCustomer ? 'Menautkan...' : 'Pilih & Tautkan'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : customerQuery.trim().length >= 2 ? (
                            <p className="text-xs text-center text-gray-400 py-3">
                                Tidak ditemukan pelanggan dengan kata kunci tersebut.
                            </p>
                        ) : null}

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setAssignModalDevice(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL 5: TAUTKAN ROUTER KE PELANGGAN YANG BELUM MEMILIKI GENIEACS */}
            <Modal
                isOpen={Boolean(linkRouterCustomer)}
                onClose={() => setLinkRouterCustomer(null)}
                title="Tautkan Router GenieACS ke Pelanggan"
            >
                {linkRouterCustomer && (
                    <form onSubmit={handleLinkRouterSubmit} className="space-y-4">
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs space-y-1 text-amber-900">
                            <p className="font-bold">{linkRouterCustomer.name}</p>
                            <p className="text-amber-800 text-[11px]">
                                PPPoE: {linkRouterCustomer.pppoe_username || '-'} · Telp: {linkRouterCustomer.phone || '-'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                                Pilih Router GenieACS yang Tersedia / Belum Tertaut:
                            </label>
                            {availableAcsDevices.length > 0 ? (
                                <select
                                    value={selectedDeviceId}
                                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                                    className="w-full text-xs rounded-xl border border-gray-300 p-2.5 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                >
                                    {availableAcsDevices.map((d) => (
                                        <option key={d.device_id} value={d.device_id}>
                                            {d.product_class} ({d.manufacturer || 'ONT'}) - SN: {d.serial_number || d.device_id} {d.pppoe_username ? `[PPPoE: ${d.pppoe_username}]` : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                                    <p className="font-semibold">Tidak ada router GenieACS yang belum tertaut.</p>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Pastikan router ONT pelanggan sudah di-setting Inform URL TR-069 dan terhubung ke server GenieACS.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setLinkRouterCustomer(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={linkingRouter || availableAcsDevices.length === 0}
                                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {linkingRouter ? (
                                    <>
                                        <RefreshCw size={13} className="animate-spin" />
                                        Menautkan...
                                    </>
                                ) : (
                                    'Tautkan Router Sekarang'
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* MODAL 6: PORTAL AKSES MANDIRI PELANGGAN (ACTION MATA 👁️) */}
            <Modal
                isOpen={Boolean(portalModalDevice)}
                onClose={() => setPortalModalDevice(null)}
                title="Portal Akses Mandiri Pelanggan (Tanpa Login)"
            >
                {portalModalDevice && (
                    <div className="space-y-4 text-left">
                        {/* Header info */}
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 text-xs text-indigo-950 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <p className="font-extrabold text-sm text-indigo-900 flex items-center gap-1.5">
                                    <User size={15} />
                                    {portalModalDevice.customer?.name || portalModalDevice.pppoe_username}
                                </p>
                                <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-indigo-200/70 text-indigo-900 border border-indigo-300">
                                    {portalModalDevice.customer?.package_name || 'Pelanggan Aktif'}
                                </span>
                            </div>
                            <p className="text-[11px] text-indigo-700 leading-relaxed">
                                Setiap pelanggan memiliki link akses unik khusus. Link ini dapat dibuka langsung oleh pelanggan melalui HP tanpa perlu login.
                            </p>
                        </div>

                        {/* Link Box */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700">
                                Tautan Akses Portal Pelanggan:
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={portalModalDevice.portal_url || ''}
                                    className="w-full text-xs font-mono rounded-xl bg-gray-50 border border-gray-300 p-2.5 text-gray-700 select-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (portalModalDevice.portal_url) {
                                            navigator.clipboard.writeText(portalModalDevice.portal_url);
                                            setCopiedPortalUrl(true);
                                            setTimeout(() => setCopiedPortalUrl(false), 2500);
                                        }
                                    }}
                                    className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shrink-0 shadow-xs ${
                                        copiedPortalUrl
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-gray-900 hover:bg-gray-800 text-white'
                                    }`}
                                    title="Salin Tautan"
                                >
                                    {copiedPortalUrl ? <Check size={14} /> : <Copy size={14} />}
                                    <span>{copiedPortalUrl ? 'Tersalin!' : 'Salin'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (portalModalDevice.portal_url) {
                                        window.open(portalModalDevice.portal_url, '_blank');
                                    }
                                }}
                                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-indigo-900/20"
                            >
                                <ExternalLink size={15} />
                                Buka Portal di Tab Baru
                            </button>

                            {portalModalDevice.customer?.phone && (
                                <a
                                    href={`https://wa.me/${portalModalDevice.customer.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                        `Halo Kak ${portalModalDevice.customer.name}, berikut adalah link portal mandiri WiFi Rumah Kita Net Anda untuk melihat & ganti password WiFi, melihat perangkat yang terhubung, dan cek tagihan:\n\n${portalModalDevice.portal_url}\n\n(Dapat dibuka langsung tanpa login)`
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-900/20"
                                >
                                    <Phone size={14} />
                                    Kirim Link ke WhatsApp
                                </a>
                            )}
                        </div>

                        {/* Feature preview list */}
                        <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-[11px] text-gray-600 space-y-1.5">
                            <p className="font-bold text-gray-800 text-xs">Fitur yang Tersedia pada Portal Pelanggan:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-gray-600">
                                <p className="flex items-center gap-1">✅ Lihat & Ganti Password WiFi</p>
                                <p className="flex items-center gap-1">✅ Daftar Perangkat HP/Laptop Terhubung</p>
                                <p className="flex items-center gap-1">✅ Fitur Blokir Perangkat Asing (MAC)</p>
                                <p className="flex items-center gap-1">✅ Indikator Kapasitas Paket (Aman/Kritis)</p>
                                <p className="flex items-center gap-1">✅ Status Masa Aktif & Tagihan Pembayaran</p>
                                <p className="flex items-center gap-1">✅ Kontak CS (Aman: Tanpa NIK/KTP)</p>
                            </div>
                        </div>

                        <div className="flex justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => setPortalModalDevice(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

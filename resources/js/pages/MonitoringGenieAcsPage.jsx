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
    Lock,
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
    Users,
    Wifi,
    WifiOff,
    X,
    ExternalLink,
    Phone,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import genieAcsService from '../../services/genieAcsService';

export default function MonitoringGenieAcsPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [stats, setStats] = useState({
        total_devices: 0,
        online_devices: 0,
        offline_devices: 0,
        matched_customers: 0,
        critical_rx_count: 0,
        warning_rx_count: 0,
        cached_at: null,
    });
    const [devices, setDevices] = useState([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'online' | 'offline' | 'critical_rx' | 'unmatched'

    // Modal: Ganti WiFi
    const [wifiModalDevice, setWifiModalDevice] = useState(null);
    const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [savingWifi, setSavingWifi] = useState(false);

    // Modal: Detail & Klien Terhubung
    const [detailModalDevice, setDetailModalDevice] = useState(null);
    const [deviceDetailData, setDeviceDetailData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Modal: Reboot
    const [rebootModalDevice, setRebootModalDevice] = useState(null);
    const [rebooting, setRebooting] = useState(false);

    // Modal: Tautkan Pelanggan Manual
    const [assignModalDevice, setAssignModalDevice] = useState(null);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [searchingCustomer, setSearchingCustomer] = useState(false);
    const [assigningCustomer, setAssigningCustomer] = useState(false);

    // Fetch Devices
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
                search: searchQuery.trim() || undefined,
            });

            setStats(response.data?.stats || {});
            setDevices(response.data?.devices || []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memuat monitoring perangkat GenieACS.');
        } finally {
            setLoading(false);
            setRefreshing(false);
            setSyncing(false);
        }
    };

    useEffect(() => {
        loadDevices(false);
    }, [statusFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadDevices(false);
    };

    // Open WiFi Modal
    const handleOpenWifiModal = (device) => {
        setWifiModalDevice(device);
        setWifiForm({
            ssid: device.ssid || '',
            password: '',
        });
        setShowPassword(false);
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
            setMessage(res.data?.message || 'Perintah sinkronisasi parameter berhasil dikirim.');
            loadDevices(true);
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

    const filteredDevices = useMemo(() => {
        return devices;
    }, [devices]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 sm:text-3xl">
                        <Router className="h-8 w-8 text-emerald-600" />
                        Monitoring Perangkat (GenieACS)
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Manajemen TR-069 ONT Router pelanggan, pemantauan status online, level redaman optik (RX Power), WiFi aktif, klien terhubung, dan ganti sandi jarak jauh.
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

            {/* Stats Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Router</p>
                        <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                            <Router size={20} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{stats.total_devices || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Terdaftar di GenieACS</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Router Online</p>
                        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                            <Wifi size={20} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-emerald-600">{stats.online_devices || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Inform dalam 15 menit</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Router Offline</p>
                        <div className="rounded-xl bg-gray-100 p-2 text-gray-600">
                            <WifiOff size={20} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-gray-700">{stats.offline_devices || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Tidak ada kontak &gt; 15 menit</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tertaut Pelanggan</p>
                        <div className="rounded-xl bg-purple-50 p-2 text-purple-600">
                            <UserCheck size={20} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-purple-700">{stats.matched_customers || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Dari database sistem</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Redaman Kritis</p>
                        <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                            <AlertCircle size={20} />
                        </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-rose-600">{stats.critical_rx_count || 0}</p>
                    <p className="mt-1 text-[11px] text-gray-400">Sinyal &lt; -27 dBm</p>
                </div>
            </div>

            {/* Filter & Search Navigation */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {/* Status Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {[
                            { key: 'all', label: 'Semua Router', icon: Router },
                            { key: 'online', label: 'Online', icon: Wifi },
                            { key: 'offline', label: 'Offline', icon: WifiOff },
                            { key: 'critical_rx', label: 'Redaman Kritis', icon: AlertTriangle },
                            { key: 'unmatched', label: 'Belum Tertaut', icon: User },
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

                    {/* Search Form */}
                    <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari pelanggan, PPPoE, SSID, SN, IP..."
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                    </form>
                </div>
            </div>

            {/* Devices List Table */}
            {loading ? (
                <div className="flex min-h-[300px] items-center justify-center rounded-2xl bg-white p-12 text-center shadow-sm">
                    <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
                        <p className="text-sm font-medium text-gray-500">Memuat data router GenieACS...</p>
                    </div>
                </div>
            ) : filteredDevices.length === 0 ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
                    <Router className="h-12 w-12 text-gray-300" />
                    <p className="mt-3 text-base font-semibold text-gray-700">Tidak ada perangkat yang sesuai filter.</p>
                    <p className="mt-1 text-xs text-gray-400">Coba ubah kata kunci pencarian atau tab filter di atas.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-gray-600">
                            <thead className="bg-gray-50/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3.5">Status & Device</th>
                                    <th className="px-4 py-3.5">Pelanggan Terhubung</th>
                                    <th className="px-4 py-3.5">IP & PPPoE</th>
                                    <th className="px-4 py-3.5">Redaman (RX Power)</th>
                                    <th className="px-4 py-3.5">WiFi & Klien</th>
                                    <th className="px-4 py-3.5 text-right">Aksi Jarak Jauh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredDevices.map((dev) => {
                                    const isOnline = dev.is_online;
                                    const cust = dev.customer;
                                    const rx = dev.rx_power;

                                    return (
                                        <tr key={dev.device_id} className="hover:bg-gray-50/70 transition">
                                            {/* Status & Device ID */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="mt-1 shrink-0">
                                                        {isOnline ? (
                                                            <span className="relative flex h-3 w-3">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex rounded-full h-3 w-3 bg-gray-300"></span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-gray-900">{dev.product_class || 'ONT Router'}</span>
                                                            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                {dev.manufacturer || 'ONT'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] font-mono text-gray-500 mt-0.5" title={dev.device_id}>
                                                            SN: <strong>{dev.serial_number || dev.device_id?.split('-')[2] || '-'}</strong>
                                                        </p>
                                                        {dev.mac_address && (
                                                            <p className="text-[10px] font-mono text-gray-400">
                                                                MAC: {dev.mac_address}
                                                            </p>
                                                        )}
                                                        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                                            <Clock size={10} />
                                                            Inform: {dev.last_inform_at ? dev.last_inform_at.slice(0, 16).replace('T', ' ') : '-'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Customer Info */}
                                            <td className="px-4 py-3.5">
                                                {cust ? (
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-xs">{cust.name}</p>
                                                        <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                                            <span>📱 {cust.phone || '-'}</span>
                                                            {cust.phone && (
                                                                <a
                                                                    href={`https://wa.me/${cust.phone.replace(/[^0-9]/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-emerald-600 hover:text-emerald-700"
                                                                    title="Hubungi WhatsApp"
                                                                >
                                                                    <Phone size={11} />
                                                                </a>
                                                            )}
                                                        </p>
                                                        <span className="inline-block mt-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.2">
                                                            Paket: {cust.package_name}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">
                                                            Belum Tertaut
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setAssignModalDevice(dev);
                                                                setCustomerQuery(dev.pppoe_username || '');
                                                                handleSearchCustomers(dev.pppoe_username || '');
                                                            }}
                                                            className="block mt-1 text-[11px] font-bold text-blue-600 hover:underline"
                                                        >
                                                            + Hubungkan Pelanggan
                                                        </button>
                                                    </div>
                                                )}
                                            </td>

                                            {/* IP & PPPoE */}
                                            <td className="px-4 py-3.5">
                                                <div>
                                                    <p className="font-bold font-mono text-gray-800">{dev.pppoe_username || '-'}</p>
                                                    <p className="font-mono text-[11px] text-gray-500 mt-0.5">
                                                        IP: <strong>{dev.ip_address || '-'}</strong>
                                                    </p>
                                                </div>
                                            </td>

                                            {/* RX Optical Power */}
                                            <td className="px-4 py-3.5">
                                                {rx !== null ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                                                                dev.rx_status === 'normal'
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : dev.rx_status === 'warning'
                                                                    ? 'bg-amber-100 text-amber-800'
                                                                    : 'bg-rose-100 text-rose-800'
                                                            }`}
                                                        >
                                                            <Radio size={12} />
                                                            {rx} dBm
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-[11px]">Tidak Terbaca</span>
                                                )}
                                            </td>

                                            {/* WiFi & Clients */}
                                            <td className="px-4 py-3.5">
                                                <div>
                                                    <p className="font-bold text-gray-900 flex items-center gap-1">
                                                        <Wifi size={13} className="text-emerald-600" />
                                                        {dev.ssid || 'SSID Default'}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDetailModal(dev)}
                                                        className="mt-1 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition"
                                                    >
                                                        <Users size={12} />
                                                        {dev.wifi_clients_count} Klien Terhubung
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Action Buttons */}
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Ganti Sandi WiFi */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenWifiModal(dev)}
                                                        title="Ganti Sandi & SSID WiFi"
                                                        className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100 transition"
                                                    >
                                                        <Lock size={15} />
                                                    </button>

                                                    {/* Detail & Klien */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDetailModal(dev)}
                                                        title="Detail Perangkat & Klien"
                                                        className="rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50 transition"
                                                    >
                                                        <Activity size={15} />
                                                    </button>

                                                    {/* Reboot Router */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setRebootModalDevice(dev)}
                                                        title="Reboot Router ONT"
                                                        className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 transition"
                                                    >
                                                        <Power size={15} />
                                                    </button>

                                                    {/* Refresh Parameter */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRefreshParam(dev.device_id)}
                                                        title="Sync / Refresh Parameter"
                                                        className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 transition"
                                                    >
                                                        <RefreshCw size={15} />
                                                    </button>
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
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
                            <p className="font-bold text-gray-900">
                                {wifiModalDevice.customer?.name || wifiModalDevice.pppoe_username || wifiModalDevice.product_class}
                            </p>
                            <p className="text-gray-500 font-mono text-[11px]">
                                Device: {wifiModalDevice.product_class} · SN: {wifiModalDevice.serial_number || wifiModalDevice.device_id}
                            </p>
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

                                {/* Connected Devices List */}
                                <div>
                                    <h4 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                                        <Laptop size={14} className="text-emerald-600" />
                                        Daftar Perangkat (HP / Laptop) yang Terkoneksi ke Router:
                                    </h4>

                                    {deviceDetailData?.lan_hosts && deviceDetailData.lan_hosts.length > 0 ? (
                                        <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                                            {deviceDetailData.lan_hosts.map((h, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Smartphone size={16} className="text-gray-400" />
                                                        <div>
                                                            <p className="font-bold text-gray-900">{h.name || `Perangkat ${i + 1}`}</p>
                                                            <p className="text-[11px] font-mono text-gray-500">
                                                                IP: {h.ip_address || '-'} · MAC: {h.mac_address || '-'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                                        {h.type || 'WiFi'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-xl border border-dashed border-gray-200 text-center text-xs text-gray-400">
                                            Tidak ada rincian nama klien yang dilaporkan pada Inform terakhir.
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

            {/* MODAL 4: TAUTKAN PELANGGAN MANUAL */}
            <Modal
                isOpen={Boolean(assignModalDevice)}
                onClose={() => setAssignModalDevice(null)}
                title="Tautkan Perangkat ke Pelanggan"
            >
                {assignModalDevice && (
                    <div className="space-y-4 text-xs">
                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Cari Pelanggan (Nama / Nomor WA / Username PPPoE)
                            </label>
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={customerQuery}
                                    onChange={(e) => handleSearchCustomers(e.target.value)}
                                    placeholder="Ketik nama atau nomor pelanggan..."
                                    className="w-full text-xs rounded-xl border border-gray-300 pl-9 pr-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                        </div>

                        {searchingCustomer && (
                            <p className="text-gray-400 italic">Mencari pelanggan...</p>
                        )}

                        {customerResults.length > 0 && (
                            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm">
                                {customerResults.map((c) => (
                                    <div
                                        key={c.id}
                                        onClick={() => handleAssignCustomerSubmit(c.id)}
                                        className="flex items-center justify-between p-2.5 hover:bg-emerald-50 cursor-pointer transition"
                                    >
                                        <div>
                                            <p className="font-bold text-gray-900">{c.name}</p>
                                            <p className="text-[11px] text-gray-500">
                                                WA: {c.phone || '-'} {c.pppoe_username && `· PPPoE: ${c.pppoe_username}`}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={assigningCustomer}
                                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-[11px]"
                                        >
                                            Pilih & Tautkan
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

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
        </div>
    );
}

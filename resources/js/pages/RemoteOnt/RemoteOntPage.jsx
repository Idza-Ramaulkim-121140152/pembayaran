import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import {
    Router,
    Wifi,
    WifiOff,
    Search,
    RefreshCw,
    ExternalLink,
    Activity,
    CheckCircle2,
    XCircle,
    AlertCircle,
    X,
    Globe,
    Clock,
    User,
    Phone,
    MapPin,
    Zap,
    Key,
    Copy,
    Check,
    Eye,
    ShieldCheck,
    Maximize2,
} from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';

export default function RemoteOntPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [devices, setDevices] = useState([]);
    const [stats, setStats] = useState({ total_online: 0, total_devices: 0 });

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'online' | 'offline'
    const [vendorFilter, setVendorFilter] = useState('all');

    // Quick Connect Box State
    const [manualIp, setManualIp] = useState('');
    const [manualPort, setManualPort] = useState('80');
    const [pingLoading, setPingLoading] = useState(false);
    const [pingResult, setPingResult] = useState(null);

    // Selected Ports per Device (remote_ip -> port number)
    const [selectedPorts, setSelectedPorts] = useState({});

    // Inline Ping States (ip -> { loading: bool, online: bool, latency_ms: number, message: string })
    const [inlinePings, setInlinePings] = useState({});
    const [batchPingLoading, setBatchPingLoading] = useState(false);

    // Copy Notification State
    const [copiedKey, setCopiedKey] = useState(null);

    // Default Login Modal / Popover State
    const [activeLoginModal, setActiveLoginModal] = useState(null);

    // Embedded In-App Modal State
    const [activeModalOnt, setActiveModalOnt] = useState(null);
    const iframeRef = useRef(null);

    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async (forceRefresh = false) => {
        try {
            if (forceRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const response = await axios.get('/api/remote-ont/list', {
                params: forceRefresh ? { refresh: 1 } : {},
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const data = response.data;
            const devList = data.data || [];
            setDevices(devList);
            setStats({
                total_online: data.total_online ?? devList.filter(d => d.is_online).length,
                total_devices: data.total_devices ?? devList.length,
            });

            // Initialize default ports
            const initialPorts = {};
            devList.forEach(d => {
                initialPorts[d.remote_ip] = d.router_port || 80;
            });
            setSelectedPorts(prev => ({ ...initialPorts, ...prev }));
        } catch (err) {
            console.error('Failed to fetch remote ONT devices:', err);
            setError(err.response?.data?.message || err.message || 'Gagal memuat daftar perangkat ONT dari MikroTik.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const getDevicePort = (device) => {
        return selectedPorts[device.remote_ip] || device.router_port || 80;
    };

    const handlePortChange = (ip, port) => {
        setSelectedPorts(prev => ({
            ...prev,
            [ip]: parseInt(port, 10) || 80,
        }));
    };

    const handleOpenGatewayTab = (ip, port = 80) => {
        if (!ip) return;
        const targetPort = parseInt(port, 10) || 80;
        let url = `/ont-gateway/${encodeURIComponent(ip)}`;
        if (targetPort !== 80) {
            url += `?__port=${targetPort}`;
        }
        window.open(url, '_blank');
    };

    const handleOpenGatewayModal = (device, customPort = null) => {
        const port = customPort || getDevicePort(device);
        setActiveModalOnt({
            device,
            ip: device.remote_ip,
            port,
            url: `/ont-gateway/${encodeURIComponent(device.remote_ip)}${port !== 80 ? `?__port=${port}` : ''}`,
        });
    };

    const handleCopy = (text, key) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleTestManualPing = async () => {
        const ip = manualIp.trim();
        const port = parseInt(manualPort, 10) || 80;
        if (!ip) {
            alert('Silakan masukkan target IP ONT terlebih dahulu.');
            return;
        }

        try {
            setPingLoading(true);
            setPingResult(null);

            const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await axios.post('/api/remote-ont/check-ping', { ip, port }, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': token,
                },
            });

            setPingResult(response.data);
        } catch (err) {
            setPingResult({
                online: false,
                latency_ms: null,
                message: err.response?.data?.message || err.message || 'Gagal melakukan tes ping.',
            });
        } finally {
            setPingLoading(false);
        }
    };

    const handleInlinePing = async (ip, port = 80) => {
        if (!ip) return;
        const targetPort = parseInt(port, 10) || 80;

        setInlinePings(prev => ({
            ...prev,
            [ip]: { loading: true, online: false, latency_ms: null },
        }));

        try {
            const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await axios.post('/api/remote-ont/check-ping', { ip, port: targetPort }, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': token,
                },
            });

            setInlinePings(prev => ({
                ...prev,
                [ip]: {
                    loading: false,
                    online: response.data.online,
                    latency_ms: response.data.latency_ms,
                    message: response.data.message,
                },
            }));
        } catch (err) {
            setInlinePings(prev => ({
                ...prev,
                [ip]: {
                    loading: false,
                    online: false,
                    latency_ms: null,
                    message: 'Timeout',
                },
            }));
        }
    };

    const handleBatchPing = async () => {
        if (batchPingLoading || filteredDevices.length === 0) return;
        setBatchPingLoading(true);

        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        const queue = filteredDevices.slice(0, 30); // batch test first 30 visible

        for (const dev of queue) {
            const ip = dev.remote_ip;
            const port = getDevicePort(dev);
            setInlinePings(prev => ({
                ...prev,
                [ip]: { loading: true, online: false, latency_ms: null },
            }));

            try {
                const response = await axios.post('/api/remote-ont/check-ping', { ip, port }, {
                    headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': token },
                });
                setInlinePings(prev => ({
                    ...prev,
                    [ip]: {
                        loading: false,
                        online: response.data.online,
                        latency_ms: response.data.latency_ms,
                        message: response.data.message,
                    },
                }));
            } catch (e) {
                setInlinePings(prev => ({
                    ...prev,
                    [ip]: { loading: false, online: false, latency_ms: null, message: 'Timeout' },
                }));
            }
        }

        setBatchPingLoading(false);
    };

    const vendorOptions = useMemo(() => {
        const vSet = new Set();
        devices.forEach(d => {
            if (d.vendor) vSet.add(d.vendor);
        });
        return Array.from(vSet).sort();
    }, [devices]);

    const filteredDevices = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return devices.filter(device => {
            const matchesQuery = !q ||
                (device.username && device.username.toLowerCase().includes(q)) ||
                (device.customer_name && device.customer_name.toLowerCase().includes(q)) ||
                (device.remote_ip && device.remote_ip.includes(q)) ||
                (device.caller_id && device.caller_id.toLowerCase().includes(q)) ||
                (device.odp && device.odp.toLowerCase().includes(q)) ||
                (device.customer_package && device.customer_package.toLowerCase().includes(q));

            let matchesStatus = true;
            if (statusFilter === 'online') {
                matchesStatus = device.is_online;
            } else if (statusFilter === 'offline') {
                matchesStatus = !device.is_online;
            }

            let matchesVendor = true;
            if (vendorFilter !== 'all') {
                matchesVendor = (device.vendor === vendorFilter);
            }

            return matchesQuery && matchesStatus && matchesVendor;
        });
    }, [devices, searchQuery, statusFilter, vendorFilter]);

    const getVendorBadgeColor = (vendor) => {
        const v = (vendor || '').toLowerCase();
        if (v.includes('zte')) {
            return 'bg-blue-50 text-blue-700 border-blue-200';
        }
        if (v.includes('huawei')) {
            return 'bg-rose-50 text-rose-700 border-rose-200';
        }
        if (v.includes('fiberhome')) {
            return 'bg-purple-50 text-purple-700 border-purple-200';
        }
        if (v.includes('vsol') || v.includes('realtek')) {
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        }
        if (v.includes('c-data')) {
            return 'bg-amber-50 text-amber-700 border-amber-200';
        }
        if (v.includes('tp-link') || v.includes('totolink')) {
            return 'bg-cyan-50 text-cyan-700 border-cyan-200';
        }
        return 'bg-slate-100 text-slate-700 border-slate-200';
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat perangkat ONT dari MikroTik & Database..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2.5">
                        <Router className="text-blue-600 h-7 w-7 sm:h-8 sm:w-8" />
                        Remote ONT Web Gateway
                    </h1>
                    <p className="text-gray-600 text-sm mt-1">
                        Akses langsung web interface ONT pelanggan dari internal server & MikroTik PPPoE tanpa port forwarding publik.
                    </p>
                </div>
                <button
                    onClick={() => fetchDevices(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm shadow-sm transition disabled:opacity-50"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin text-blue-600' : 'text-gray-500'} />
                    <span>{refreshing ? 'Memperbarui...' : 'Refresh MikroTik Data'}</span>
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

            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Terdaftar</span>
                        <div className="text-3xl font-extrabold text-gray-900 mt-1">{stats.total_devices}</div>
                        <span className="text-xs text-gray-400">Secret & Sesi PPPoE</span>
                    </div>
                    <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
                        <Router size={24} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">ONT Online</span>
                        <div className="text-3xl font-extrabold text-emerald-700 mt-1">{stats.total_online}</div>
                        <span className="text-xs text-emerald-600/80">Koneksi Aktif di MikroTik</span>
                    </div>
                    <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
                        <Wifi size={24} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ONT Offline</span>
                        <div className="text-3xl font-extrabold text-gray-600 mt-1">
                            {Math.max(0, stats.total_devices - stats.total_online)}
                        </div>
                        <span className="text-xs text-gray-400">Belum Ada Sesi Aktif</span>
                    </div>
                    <div className="p-3.5 bg-gray-100 text-gray-500 rounded-xl">
                        <WifiOff size={24} />
                    </div>
                </div>
            </div>

            {/* Quick Remote Box (Manual IP Input) */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-lg">
                <div className="max-w-4xl">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/30 text-blue-200 border border-blue-400/30">
                            Akses Cepat
                        </span>
                        <span className="text-xs text-blue-200">Koneksi Langsung Lewat Reverse Proxy Server</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5">
                        Buka Web Interface ONT Secara Manual
                    </h3>
                    <p className="text-xs sm:text-sm text-blue-100/90 mb-5">
                        Masukkan IP target ONT (contoh: <code className="bg-blue-950/60 px-1.5 py-0.5 rounded font-mono text-xs text-blue-200">10.1.0.80</code> atau <code className="bg-blue-950/60 px-1.5 py-0.5 rounded font-mono text-xs text-blue-200">10.1.5.185</code>). Server akan membukakan web manajemen ONT untuk Anda.
                    </p>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleOpenGatewayTab(manualIp, manualPort);
                        }}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                    >
                        <div className="sm:col-span-5">
                            <label className="block text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1.5">
                                Target IP ONT
                            </label>
                            <div className="relative">
                                <Globe className="h-4 w-4 text-blue-300 absolute left-3 top-3.5" />
                                <input
                                    type="text"
                                    placeholder="Contoh: 10.1.5.185"
                                    value={manualIp}
                                    onChange={(e) => setManualIp(e.target.value)}
                                    required
                                    className="w-full pl-9 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/60 focus:bg-white/20 focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm font-mono transition"
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1.5">
                                Port
                            </label>
                            <input
                                type="number"
                                value={manualPort}
                                onChange={(e) => setManualPort(e.target.value)}
                                min="1"
                                max="65535"
                                required
                                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/60 focus:bg-white/20 focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm font-mono transition text-center"
                            />
                        </div>

                        <div className="sm:col-span-5 flex gap-2">
                            <button
                                type="button"
                                onClick={handleTestManualPing}
                                disabled={pingLoading || !manualIp.trim()}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white/15 hover:bg-white/25 border border-white/30 rounded-xl text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                            >
                                <Activity size={16} className={pingLoading ? 'animate-spin' : ''} />
                                <span>{pingLoading ? 'Mengecek...' : 'Tes Ping'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleOpenGatewayModal({ customer_name: 'Manual ONT', remote_ip: manualIp }, manualPort)}
                                disabled={!manualIp.trim()}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-md transition active:scale-95 disabled:opacity-50"
                            >
                                <Eye size={15} />
                                <span>Pop-up</span>
                            </button>
                            <button
                                type="submit"
                                disabled={!manualIp.trim()}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-sm font-semibold shadow-md transition active:scale-95 disabled:opacity-50"
                            >
                                <span>Tab Baru</span>
                                <ExternalLink size={15} />
                            </button>
                        </div>
                    </form>

                    {/* Ping Result Alert */}
                    {pingResult && (
                        <div
                            className={`mt-4 p-3 rounded-xl text-xs sm:text-sm flex items-center gap-2.5 border ${
                                pingResult.online
                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                                    : 'bg-red-500/20 text-red-200 border-red-400/30'
                            }`}
                        >
                            {pingResult.online ? (
                                <>
                                    <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                                    <div>
                                        <strong>Port {manualPort} Terbuka & Aktif!</strong> Latensi: {pingResult.latency_ms} ms. Web ONT siap diakses.
                                    </div>
                                </>
                            ) : (
                                <>
                                    <AlertCircle size={18} className="text-red-400 shrink-0" />
                                    <div>
                                        <strong>Tidak Ada Respon di Port {manualPort}.</strong> {pingResult.message || 'Perangkat mungkin mati atau memblokir port HTTP.'}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* PPPoE Customer List Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Table Controls */}
                <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
                        {/* Search Input */}
                        <div className="relative w-full sm:w-80">
                            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
                            <input
                                type="text"
                                placeholder="Cari nama, PPPoE, IP, MAC, ODP..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {/* Status Filter Tabs */}
                        <div className="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('all')}
                                className={`px-3 py-1.5 rounded-lg transition ${
                                    statusFilter === 'all'
                                        ? 'bg-white shadow-sm text-blue-600 font-bold'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Semua ({devices.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('online')}
                                className={`px-3 py-1.5 rounded-lg transition ${
                                    statusFilter === 'online'
                                        ? 'bg-white shadow-sm text-emerald-600 font-bold'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Online ({stats.total_online})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('offline')}
                                className={`px-3 py-1.5 rounded-lg transition ${
                                    statusFilter === 'offline'
                                        ? 'bg-white shadow-sm text-gray-700 font-bold'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Offline ({Math.max(0, stats.total_devices - stats.total_online)})
                            </button>
                        </div>

                        {/* Vendor Dropdown Filter */}
                        {vendorOptions.length > 0 && (
                            <select
                                value={vendorFilter}
                                onChange={(e) => setVendorFilter(e.target.value)}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="all">Semua Tipe Vendor</option>
                                {vendorOptions.map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleBatchPing}
                            disabled={batchPingLoading || filteredDevices.length === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                            <Zap size={14} className={batchPingLoading ? 'animate-spin text-indigo-600' : ''} />
                            <span>{batchPingLoading ? 'Mengecek...' : 'Tes Ping Halaman Ini'}</span>
                        </button>
                    </div>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50/75 text-xs uppercase font-semibold text-gray-500 tracking-wider border-b border-gray-100">
                            <tr>
                                <th className="py-3.5 px-4">Status</th>
                                <th className="py-3.5 px-4">Pelanggan & PPPoE</th>
                                <th className="py-3.5 px-4">Tipe / Vendor</th>
                                <th className="py-3.5 px-4">IP Remote & Port</th>
                                <th className="py-3.5 px-4">MAC / Caller ID</th>
                                <th className="py-3.5 px-4">Profile</th>
                                <th className="py-3.5 px-4">Uptime</th>
                                <th className="py-3.5 px-4 text-center">Aksi Buka Web</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredDevices.map((device, idx) => {
                                const currentPort = getDevicePort(device);
                                const ping = inlinePings[device.remote_ip];
                                const isCopiedIp = copiedKey === `ip-${device.remote_ip}`;
                                const isCopiedUser = copiedKey === `user-${device.username}`;

                                return (
                                    <tr
                                        key={idx}
                                        className="hover:bg-blue-50/40 transition duration-150"
                                    >
                                        {/* Status */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            {device.is_online ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Online
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                                    Offline
                                                </span>
                                            )}
                                        </td>

                                        {/* Customer Name & Secret */}
                                        <td className="py-3.5 px-4">
                                            <div className="font-bold text-gray-900 flex items-center gap-1.5">
                                                <span>{device.customer_name || device.username}</span>
                                            </div>
                                            <div className="text-xs font-mono text-gray-500 flex items-center gap-1.5 mt-0.5">
                                                <User size={12} className="text-gray-400" />
                                                <span>{device.username}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(device.username, `user-${device.username}`)}
                                                    className="p-0.5 hover:text-blue-600 transition"
                                                    title="Salin PPPoE Username"
                                                >
                                                    {isCopiedUser ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                                </button>
                                            </div>
                                            {(device.odp || device.customer_package) && (
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    {device.odp && (
                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                            ODP: {device.odp}
                                                        </span>
                                                    )}
                                                    {device.customer_package && (
                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                                            {device.customer_package}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {device.customer_address && (
                                                <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                                    <MapPin size={11} className="text-gray-400 shrink-0" />
                                                    <span className="truncate max-w-xs">{device.customer_address}</span>
                                                </div>
                                            )}
                                        </td>

                                        {/* Vendor / Type & Default Password Button */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getVendorBadgeColor(device.vendor)}`}>
                                                    {device.vendor || 'ONT'}
                                                </span>
                                                {device.default_logins && device.default_logins.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveLoginModal(device)}
                                                        className="p-1 text-amber-600 hover:bg-amber-50 rounded-lg border border-amber-200 transition"
                                                        title="Lihat Password Default Pabrik"
                                                    >
                                                        <Key size={13} />
                                                    </button>
                                                )}
                                            </div>
                                            {device.router_type && device.router_type !== device.vendor && (
                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                    Model: {device.router_type}
                                                </div>
                                            )}
                                        </td>

                                        {/* Remote IP & Port & Ping */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200 flex items-center gap-1">
                                                    {device.remote_ip}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(device.remote_ip, `ip-${device.remote_ip}`)}
                                                        className="hover:text-blue-600 transition ml-0.5"
                                                        title="Salin IP"
                                                    >
                                                        {isCopiedIp ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                                    </button>
                                                </span>

                                                {/* Port Selector */}
                                                <select
                                                    value={currentPort}
                                                    onChange={(e) => handlePortChange(device.remote_ip, e.target.value)}
                                                    className="text-xs font-mono py-0.5 px-1.5 bg-gray-50 border border-gray-200 rounded font-semibold text-gray-700 focus:outline-none"
                                                    title="Target Port HTTP"
                                                >
                                                    <option value={80}>:80</option>
                                                    <option value={8080}>:8080</option>
                                                    <option value={443}>:443</option>
                                                    <option value={8000}>:8000</option>
                                                </select>

                                                {/* Ping Test Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleInlinePing(device.remote_ip, currentPort)}
                                                    disabled={ping?.loading}
                                                    title={`Tes Ping port ${currentPort}`}
                                                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition disabled:opacity-50"
                                                >
                                                    <Zap size={14} className={ping?.loading ? 'animate-spin text-blue-600' : ''} />
                                                </button>
                                            </div>

                                            {ping && !ping.loading && (
                                                <div className="mt-1">
                                                    {ping.online ? (
                                                        <span className="text-[11px] font-mono text-emerald-600 font-semibold">
                                                            ● Aktif ({ping.latency_ms} ms)
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] font-mono text-red-500">
                                                            ✕ Port {currentPort} tertutup
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* MAC / Caller ID */}
                                        <td className="py-3.5 px-4 whitespace-nowrap text-xs font-mono text-gray-500">
                                            {device.caller_id ? (
                                                <div className="flex items-center gap-1">
                                                    <span>{device.caller_id}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(device.caller_id, `mac-${device.caller_id}`)}
                                                        className="hover:text-blue-600 transition"
                                                        title="Salin MAC"
                                                    >
                                                        {copiedKey === `mac-${device.caller_id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                                    </button>
                                                </div>
                                            ) : '-'}
                                        </td>

                                        {/* Profile */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                {device.profile || 'default'}
                                            </span>
                                        </td>

                                        {/* Uptime */}
                                        <td className="py-3.5 px-4 whitespace-nowrap text-xs text-gray-500">
                                            {device.uptime || '-'}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                                            <div className="inline-flex items-center gap-1.5">
                                                {/* Open in In-App Modal */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenGatewayModal(device)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
                                                    title="Buka langsung di pop-up modal"
                                                >
                                                    <Eye size={13} />
                                                    <span>Pop-up</span>
                                                </button>

                                                {/* Open in New Tab */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenGatewayTab(device.remote_ip, currentPort)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
                                                    title="Buka di tab browser baru"
                                                >
                                                    <span>Tab Baru</span>
                                                    <ExternalLink size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {filteredDevices.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <Router size={36} className="mx-auto mb-2 text-gray-300" />
                            <p className="font-semibold text-sm">Tidak ada perangkat yang sesuai.</p>
                            <p className="text-xs text-gray-400 mt-1">Coba sesuaikan kata kunci pencarian atau ganti filter status.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* In-App Live ONT Modal (Full Iframe Console) */}
            {activeModalOnt && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
                    <div className="bg-white w-full h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
                        {/* Modal Header Control Bar */}
                        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                                    <Router size={18} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm sm:text-base truncate">
                                            {activeModalOnt.device?.customer_name || activeModalOnt.ip}
                                        </h3>
                                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800 text-blue-300 border border-gray-700">
                                            {activeModalOnt.ip}:{activeModalOnt.port}
                                        </span>
                                        {activeModalOnt.device?.vendor && (
                                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-200 border border-indigo-700 hidden sm:inline-block">
                                                {activeModalOnt.device.vendor}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate hidden sm:block">
                                        PPPoE: <code className="text-gray-300">{activeModalOnt.device?.username || '-'}</code> | MAC: {activeModalOnt.device?.caller_id || '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Modal Action Controls */}
                            <div className="flex items-center gap-2 shrink-0">
                                {activeModalOnt.device?.default_logins && activeModalOnt.device.default_logins.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveLoginModal(activeModalOnt.device)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded-xl text-xs font-semibold transition"
                                        title="Bantuan Password Default"
                                    >
                                        <Key size={14} />
                                        <span className="hidden sm:inline">Info Password</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (iframeRef.current) {
                                            iframeRef.current.src = activeModalOnt.url;
                                        }
                                    }}
                                    className="p-2 hover:bg-gray-800 rounded-xl text-gray-300 hover:text-white transition"
                                    title="Reload Halaman ONT"
                                >
                                    <RefreshCw size={16} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleOpenGatewayTab(activeModalOnt.ip, activeModalOnt.port)}
                                    className="p-2 hover:bg-gray-800 rounded-xl text-gray-300 hover:text-white transition"
                                    title="Buka di Tab Baru"
                                >
                                    <ExternalLink size={16} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setActiveModalOnt(null)}
                                    className="p-2 hover:bg-red-900/60 text-gray-300 hover:text-red-200 rounded-xl transition"
                                    title="Tutup Modal"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Iframe Body */}
                        <div className="flex-1 bg-gray-100 relative overflow-hidden">
                            <iframe
                                ref={iframeRef}
                                src={activeModalOnt.url}
                                title={`ONT Console - ${activeModalOnt.ip}`}
                                className="w-full h-full border-0"
                                sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Default Password Helper Modal */}
            {activeLoginModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 border border-gray-200 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                    <Key size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-base">
                                        Password Default Pabrik
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        Vendor: <strong className="text-gray-700">{activeLoginModal.vendor}</strong>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveLoginModal(null)}
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs text-gray-600">
                            Berikut adalah kombinasi akun default bawaan pabrik untuk tipe ONT ini. Klik tombol salin untuk menyalin ke clipboard:
                        </p>

                        <div className="space-y-2.5 max-h-60 overflow-y-auto">
                            {(activeLoginModal.default_logins || []).map((cred, i) => (
                                <div
                                    key={i}
                                    className="p-3 bg-gray-50 hover:bg-blue-50/50 rounded-xl border border-gray-200 flex items-center justify-between gap-3 text-xs"
                                >
                                    <div>
                                        <div className="font-semibold text-gray-500 text-[11px] mb-0.5">
                                            {cred.desc}
                                        </div>
                                        <div className="font-mono">
                                            User: <strong className="text-gray-900">{cred.user}</strong> | Pass: <strong className="text-blue-700">{cred.pass}</strong>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(cred.user, `cred-u-${i}`)}
                                            className="px-2 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-semibold"
                                            title="Salin Username"
                                        >
                                            {copiedKey === `cred-u-${i}` ? <Check size={12} className="text-emerald-600" /> : 'User'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(cred.pass, `cred-p-${i}`)}
                                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                                            title="Salin Password"
                                        >
                                            {copiedKey === `cred-p-${i}` ? <Check size={12} className="text-white" /> : 'Pass'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 text-right">
                            <button
                                type="button"
                                onClick={() => setActiveLoginModal(null)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
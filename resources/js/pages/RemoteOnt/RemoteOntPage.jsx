import { useEffect, useState, useMemo } from 'react';
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

    // Quick Connect Box State
    const [manualIp, setManualIp] = useState('');
    const [manualPort, setManualPort] = useState('80');
    const [pingLoading, setPingLoading] = useState(false);
    const [pingResult, setPingResult] = useState(null);

    // Inline Ping States (ip -> { loading: bool, online: bool, latency_ms: number, message: string })
    const [inlinePings, setInlinePings] = useState({});

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
        } catch (err) {
            console.error('Failed to fetch remote ONT devices:', err);
            setError(err.response?.data?.message || err.message || 'Gagal memuat daftar perangkat ONT dari MikroTik.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleOpenGateway = (ip, port = 80) => {
        if (!ip) return;
        const targetPort = parseInt(port, 10) || 80;
        let url = `/ont-gateway/${encodeURIComponent(ip)}`;
        if (targetPort !== 80) {
            url += `?__port=${targetPort}`;
        }
        window.open(url, '_blank');
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

    const handleInlinePing = async (ip) => {
        if (!ip) return;
        setInlinePings(prev => ({
            ...prev,
            [ip]: { loading: true, online: false, latency_ms: null },
        }));

        try {
            const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await axios.post('/api/remote-ont/check-ping', { ip, port: 80 }, {
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

    const filteredDevices = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return devices.filter(device => {
            const matchesQuery = !q ||
                (device.username && device.username.toLowerCase().includes(q)) ||
                (device.customer_name && device.customer_name.toLowerCase().includes(q)) ||
                (device.remote_ip && device.remote_ip.includes(q)) ||
                (device.caller_id && device.caller_id.toLowerCase().includes(q));

            let matchesStatus = true;
            if (statusFilter === 'online') {
                matchesStatus = device.is_online;
            } else if (statusFilter === 'offline') {
                matchesStatus = !device.is_online;
            }

            return matchesQuery && matchesStatus;
        });
    }, [devices, searchQuery, statusFilter]);

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
                        Masukkan IP target ONT (contoh: <code className="bg-blue-950/60 px-1.5 py-0.5 rounded font-mono text-xs text-blue-200">10.1.0.80</code> atau <code className="bg-blue-950/60 px-1.5 py-0.5 rounded font-mono text-xs text-blue-200">10.1.0.10</code>). Server Ubuntu akan membuka halaman web manajemen ONT untuk Anda.
                    </p>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleOpenGateway(manualIp, manualPort);
                        }}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                    >
                        <div className="sm:col-span-6">
                            <label className="block text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1.5">
                                Target IP ONT
                            </label>
                            <div className="relative">
                                <Globe className="h-4 w-4 text-blue-300 absolute left-3 top-3.5" />
                                <input
                                    type="text"
                                    placeholder="Contoh: 10.1.0.80"
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

                        <div className="sm:col-span-4 flex gap-2">
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
                                type="submit"
                                disabled={!manualIp.trim()}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-sm font-semibold shadow-md transition active:scale-95 disabled:opacity-50"
                            >
                                <span>Buka Web</span>
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
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
                            <input
                                type="text"
                                placeholder="Cari nama, PPPoE, IP, atau MAC..."
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
                    </div>

                    <div className="text-xs text-gray-500 flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>Klik <strong>"Buka Web ONT"</strong> untuk membuka halaman ONT lewat reverse proxy server</span>
                    </div>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50/75 text-xs uppercase font-semibold text-gray-500 tracking-wider border-b border-gray-100">
                            <tr>
                                <th className="py-3.5 px-4">Status</th>
                                <th className="py-3.5 px-4">Pelanggan / PPPoE Secret</th>
                                <th className="py-3.5 px-4">IP Remote ONT</th>
                                <th className="py-3.5 px-4">MAC / Caller ID</th>
                                <th className="py-3.5 px-4">Profile</th>
                                <th className="py-3.5 px-4">Uptime</th>
                                <th className="py-3.5 px-4 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredDevices.map((device, idx) => {
                                const ping = inlinePings[device.remote_ip];

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
                                            <div className="font-bold text-gray-900">
                                                {device.customer_name || device.username}
                                            </div>
                                            <div className="text-xs font-mono text-gray-500 flex items-center gap-1 mt-0.5">
                                                <User size={12} className="text-gray-400" />
                                                {device.username}
                                            </div>
                                            {device.customer_address && (
                                                <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                                    <MapPin size={11} className="text-gray-400 shrink-0" />
                                                    <span className="truncate max-w-xs">{device.customer_address}</span>
                                                </div>
                                            )}
                                        </td>

                                        {/* Remote IP & Ping Button */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200">
                                                    {device.remote_ip}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleInlinePing(device.remote_ip)}
                                                    disabled={ping?.loading}
                                                    title="Tes Ping port 80"
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
                                                            ✕ Port tertutup
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* MAC / Caller ID */}
                                        <td className="py-3.5 px-4 whitespace-nowrap text-xs font-mono text-gray-500">
                                            {device.caller_id || '-'}
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
                                            <button
                                                type="button"
                                                onClick={() => handleOpenGateway(device.remote_ip)}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
                                            >
                                                <span>Buka Web ONT</span>
                                                <ExternalLink size={13} />
                                            </button>
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
        </div>
    );
}
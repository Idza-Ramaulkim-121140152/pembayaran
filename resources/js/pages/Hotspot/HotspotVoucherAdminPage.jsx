import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    Download,
    Edit3,
    ExternalLink,
    FileCode2,
    Gauge,
    MapPin,
    MessageCircle,
    Plus,
    RefreshCw,
    Router,
    Search,
    Ticket,
    Trash2,
    Users,
    Wallet,
    Wifi,
    X,
} from 'lucide-react';

const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Number(val || 0));

const formatDateTime = (iso) => {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
};

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

const splitDuration = (minutes) => {
    const mins = Number(minutes || 60);
    if (mins % 1440 === 0) return { value: mins / 1440, unit: 'days' };
    if (mins % 60 === 0) return { value: mins / 60, unit: 'hours' };
    return { value: mins, unit: 'minutes' };
};

export default function HotspotVoucherAdminPage() {
    const [activeTab, setActiveTab] = useState('orders'); // orders | packages | mikrotik
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({
        total_sold: 0,
        total_revenue: 0,
        today_sold: 0,
        today_revenue: 0,
        pending_orders: 0,
        failed_sync_orders: 0,
        active_packages: 0,
    });
    const [packages, setPackages] = useState([]);
    const [orders, setOrders] = useState([]);
    const [qrisReady, setQrisReady] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('all');
    const [packageFilter, setPackageFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Feedback banner
    const [notice, setNotice] = useState(null); // { type: 'success'|'error', text }
    const [busyOrderId, setBusyOrderId] = useState(null);
    const [busyPackageId, setBusyPackageId] = useState(null);

    // Package Modal
    const [pkgModalOpen, setPkgModalOpen] = useState(false);
    const [editingPkg, setEditingPkg] = useState(null);
    const [pkgForm, setPkgForm] = useState({
        name: '',
        price: 5000,
        duration_value: 24,
        duration_unit: 'hours',
        max_devices: 1,
        rate_limit: '',
        description: '',
        sort_order: 0,
        is_active: true,
    });
    const [savingPkg, setSavingPkg] = useState(false);

    // Manual Voucher Modal
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [manualForm, setManualForm] = useState({
        package_id: '',
        customer_phone: '',
        customer_name: '',
        send_whatsapp: true,
    });
    const [generatingManual, setGeneratingManual] = useState(false);
    const [lastGeneratedVoucher, setLastGeneratedVoucher] = useState(null);

    // MikroTik Template Tab
    const [templateData, setTemplateData] = useState(null);
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [copiedKey, setCopiedKey] = useState('');

    // Hotspot Locations Tab (Titik WiFi dari koordinat pelanggan, tampil publik tanpa nama pelanggan)
    const [locationsList, setLocationsList] = useState([]);
    const [locationCustomers, setLocationCustomers] = useState([]);
    const [locationSearch, setLocationSearch] = useState('');
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [busyLocationKey, setBusyLocationKey] = useState(null);
    const [editingLabelMap, setEditingLabelMap] = useState({});

    const showNotice = (type, text) => {
        setNotice({ type, text });
        setTimeout(() => setNotice(null), 6000);
    };

    const loadDashboard = useCallback(async (forceSync = false) => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (packageFilter !== 'all') params.set('package_id', packageFilter);
            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            if (forceSync) params.set('force_sync', '1');

            const res = await fetch(`/api/admin/hotspot/dashboard?${params.toString()}`, {
                headers: { Accept: 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                setSummary(data.summary || {});
                setPackages(Array.isArray(data.packages) ? data.packages : []);
                setOrders(Array.isArray(data.orders) ? data.orders : []);
                setQrisReady(data.qris_ready !== false);
            }
        } catch {
            showNotice('error', 'Gagal memuat data voucher hotspot.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, packageFilter, searchQuery]);

    const loadMikrotikTemplate = useCallback(async () => {
        if (templateData) return;
        try {
            setLoadingTemplate(true);
            const res = await fetch('/api/admin/hotspot/mikrotik-template', {
                headers: { Accept: 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                setTemplateData(data);
            }
        } catch {
            showNotice('error', 'Gagal memuat template MikroTik.');
        } finally {
            setLoadingTemplate(false);
        }
    }, [templateData]);

    const loadLocations = useCallback(async (searchText = '') => {
        try {
            setLoadingLocations(true);
            const params = new URLSearchParams();
            if (searchText.trim()) params.set('search', searchText.trim());
            const res = await fetch(`/api/admin/hotspot/locations?${params.toString()}`, {
                headers: { Accept: 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                const locs = Array.isArray(data.locations) ? data.locations : [];
                setLocationsList(locs);
                setLocationCustomers(Array.isArray(data.customers) ? data.customers : []);
                const nextLabels = {};
                locs.forEach((l) => {
                    nextLabels[l.id] = l.label || '';
                });
                setEditingLabelMap(nextLabels);
            }
        } catch {
            showNotice('error', 'Gagal memuat data titik WiFi Hotspot.');
        } finally {
            setLoadingLocations(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        if (activeTab === 'mikrotik') {
            loadMikrotikTemplate();
        }
        if (activeTab === 'locations') {
            loadLocations(locationSearch);
        }
    }, [activeTab, loadMikrotikTemplate, loadLocations, locationSearch]);

    const handleToggleCustomerLocation = async (customer, enabled) => {
        try {
            setBusyLocationKey(`cust-${customer.id}`);
            const res = await fetch('/api/admin/hotspot/locations/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify({
                    customer_id: customer.id,
                    enabled,
                }),
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Status titik WiFi diperbarui.');
            loadLocations(locationSearch);
        } finally {
            setBusyLocationKey(null);
        }
    };

    const handleSaveLocationLabel = async (loc) => {
        try {
            setBusyLocationKey(`loc-${loc.id}`);
            const res = await fetch(`/api/admin/hotspot/locations/${loc.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify({
                    label: editingLabelMap[loc.id] ?? loc.label,
                    is_active: loc.is_active,
                }),
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Label titik WiFi disimpan.');
            loadLocations(locationSearch);
        } finally {
            setBusyLocationKey(null);
        }
    };

    const handleDeleteLocation = async (loc) => {
        if (!window.confirm('Hapus titik WiFi ini dari peta publik?')) return;
        try {
            setBusyLocationKey(`loc-${loc.id}`);
            const res = await fetch(`/api/admin/hotspot/locations/${loc.id}`, {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Titik WiFi dihapus.');
            loadLocations(locationSearch);
        } finally {
            setBusyLocationKey(null);
        }
    };

    const copyText = async (text, key) => {
        try {
            await navigator.clipboard.writeText(String(text));
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(''), 2000);
        } catch {
            // ignore
        }
    };

    // Package CRUD handlers
    const openCreatePackage = () => {
        setEditingPkg(null);
        setPkgForm({
            name: '',
            price: 5000,
            duration_value: 24,
            duration_unit: 'hours',
            max_devices: 1,
            rate_limit: '',
            description: '',
            sort_order: packages.length,
            is_active: true,
        });
        setPkgModalOpen(true);
    };

    const openEditPackage = (pkg) => {
        const dur = splitDuration(pkg.duration_minutes);
        setEditingPkg(pkg);
        setPkgForm({
            name: pkg.name || '',
            price: pkg.price || 0,
            duration_value: dur.value,
            duration_unit: dur.unit,
            max_devices: pkg.max_devices || 1,
            rate_limit: pkg.rate_limit || '',
            description: pkg.description || '',
            sort_order: pkg.sort_order || 0,
            is_active: pkg.is_active !== false,
        });
        setPkgModalOpen(true);
    };

    const handleSavePackage = async (e) => {
        e.preventDefault();
        try {
            setSavingPkg(true);
            const url = editingPkg
                ? `/api/admin/hotspot/packages/${editingPkg.id}`
                : '/api/admin/hotspot/packages';
            const method = editingPkg ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify(pkgForm),
            });
            const data = await res.json();
            if (!res.ok) {
                showNotice('error', data.message || 'Gagal menyimpan paket voucher.');
                return;
            }
            const syncMsg = data.mikrotik_sync?.success
                ? ' & tersinkron ke MikroTik.'
                : ' (catatan: sinkron MikroTik bisa dicoba ulang lewat tombol Sync).';
            showNotice('success', (data.message || 'Paket tersimpan') + syncMsg);
            setPkgModalOpen(false);
            loadDashboard();
        } catch {
            showNotice('error', 'Terjadi kesalahan saat menyimpan paket.');
        } finally {
            setSavingPkg(false);
        }
    };

    const handleDeletePackage = async (pkg) => {
        if (!window.confirm(`Hapus / nonaktifkan paket "${pkg.name}"?`)) return;
        try {
            setBusyPackageId(pkg.id);
            const res = await fetch(`/api/admin/hotspot/packages/${pkg.id}`, {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Selesai.');
            loadDashboard();
        } finally {
            setBusyPackageId(null);
        }
    };

    const handleSyncPackage = async (pkg) => {
        try {
            setBusyPackageId(pkg.id);
            const res = await fetch(`/api/admin/hotspot/packages/${pkg.id}/sync`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Sinkronisasi selesai.');
        } finally {
            setBusyPackageId(null);
        }
    };

    // Order Actions
    const handleConfirmManual = async (order) => {
        if (!window.confirm(`Konfirmasi pembayaran manual untuk order ${order.order_code} (${formatCurrency(order.qris_expected_amount || order.base_amount)})?`)) {
            return;
        }
        try {
            setBusyOrderId(order.id);
            const res = await fetch(`/api/admin/hotspot/orders/${order.id}/confirm`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Konfirmasi selesai.');
            loadDashboard();
        } finally {
            setBusyOrderId(null);
        }
    };

    const handleResendWa = async (order) => {
        try {
            setBusyOrderId(order.id);
            const res = await fetch(`/api/admin/hotspot/orders/${order.id}/resend-wa`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Pengiriman WA selesai.');
            loadDashboard();
        } finally {
            setBusyOrderId(null);
        }
    };

    const handleRetryMikrotik = async (order) => {
        try {
            setBusyOrderId(order.id);
            const res = await fetch(`/api/admin/hotspot/orders/${order.id}/retry-mikrotik`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            showNotice(res.ok ? 'success' : 'error', data.message || 'Retry MikroTik selesai.');
            loadDashboard();
        } finally {
            setBusyOrderId(null);
        }
    };

    // Manual Voucher Generation
    const openManualVoucherModal = () => {
        setLastGeneratedVoucher(null);
        setManualForm({
            package_id: packages[0]?.id || '',
            customer_phone: '',
            customer_name: '',
            send_whatsapp: true,
        });
        setManualModalOpen(true);
    };

    const handleGenerateManual = async (e) => {
        e.preventDefault();
        try {
            setGeneratingManual(true);
            const res = await fetch('/api/admin/hotspot/orders/manual-generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify(manualForm),
            });
            const data = await res.json();
            if (!res.ok) {
                showNotice('error', data.message || 'Gagal membuat voucher manual.');
                return;
            }
            setLastGeneratedVoucher(data.result || null);
            showNotice('success', data.message || 'Voucher manual berhasil dibuat.');
            loadDashboard();
        } finally {
            setGeneratingManual(false);
        }
    };

    const statusBadge = (status) => {
        switch (status) {
            case 'paid':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Lunas</span>;
            case 'pending':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Menunggu QRIS</span>;
            case 'expired':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">Kedaluwarsa</span>;
            default:
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-1">
                        Hotspot Self-Service &amp; MikroTik
                    </p>
                    <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
                        <Wifi className="w-7 h-7 text-orange-500" />
                        Manajemen Voucher Hotspot
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Kelola paket voucher (durasi, harga, batas perangkat), pantau penjualan mandiri QRIS, dan ambil template landing page MikroTik.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <a
                        href="/hotspot/beli"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Buka Halaman Beli
                    </a>
                    <button
                        type="button"
                        onClick={openManualVoucherModal}
                        disabled={packages.length === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-50"
                    >
                        <Ticket className="w-4 h-4" />
                        Buat Voucher Manual
                    </button>
                    <button
                        type="button"
                        onClick={openCreatePackage}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-sm transition"
                    >
                        <Plus className="w-4 h-4" />
                        Tambah Paket
                    </button>
                </div>
            </div>

            {!qrisReady && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                    <span>
                        Payload QRIS dinamis belum dikonfigurasi. Lengkapi di menu <b>Pengaturan QRIS</b> agar pelanggan bisa membeli voucher mandiri.
                    </span>
                </div>
            )}

            {notice && (
                <div
                    className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between gap-3 ${
                        notice.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                >
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="app-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Voucher Terjual</span>
                        <Ticket className="w-5 h-5 text-indigo-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900">{summary.total_sold || 0}</p>
                    <p className="text-xs text-slate-500 mt-1">Hari ini: <b>{summary.today_sold || 0}</b> voucher</p>
                </div>

                <div className="app-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Pendapatan</span>
                        <Wallet className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-emerald-600">{formatCurrency(summary.total_revenue)}</p>
                    <p className="text-xs text-slate-500 mt-1">Hari ini: <b>{formatCurrency(summary.today_revenue)}</b></p>
                </div>

                <div className="app-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Menunggu Bayar</span>
                        <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-amber-600">{summary.pending_orders || 0}</p>
                    <p className="text-xs text-slate-500 mt-1">Order QRIS aktif saat ini</p>
                </div>

                <div className="app-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Paket &amp; Sync MikroTik</span>
                        <Router className="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900">{summary.active_packages || 0} Paket</p>
                    <p className={`text-xs mt-1 ${(summary.failed_sync_orders || 0) > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        Gagal sync MikroTik: {summary.failed_sync_orders || 0}
                    </p>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
                {[
                    { id: 'orders', label: 'Riwayat Pembelian', icon: Ticket },
                    { id: 'packages', label: `Paket Voucher (${packages.length})`, icon: Wifi },
                    {
                        id: 'locations',
                        label: `Titik WiFi Hotspot (${locationsList.length || summary.active_locations || 0})`,
                        icon: MapPin,
                    },
                    { id: 'mikrotik', label: 'Template MikroTik & Walled Garden', icon: FileCode2 },
                ].map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl border-b-2 whitespace-nowrap transition ${
                                active
                                    ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: ORDERS HISTORY */}
            {activeTab === 'orders' && (
                <div className="app-card p-5 space-y-4">
                    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari kode voucher, order, no WA..."
                                    className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-64 outline-none focus:border-blue-500"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                            >
                                <option value="all">Semua Status</option>
                                <option value="paid">Lunas</option>
                                <option value="pending">Menunggu QRIS</option>
                                <option value="expired">Kedaluwarsa</option>
                            </select>
                            <select
                                value={packageFilter}
                                onChange={(e) => setPackageFilter(e.target.value)}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                            >
                                <option value="all">Semua Paket</option>
                                {packages.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={() => loadDashboard(true)}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Muat Ulang
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-y border-slate-200">
                                <tr>
                                    <th className="py-3 px-3">Order &amp; Waktu</th>
                                    <th className="py-3 px-3">Paket</th>
                                    <th className="py-3 px-3">Pelanggan (WA)</th>
                                    <th className="py-3 px-3">Nominal QRIS</th>
                                    <th className="py-3 px-3">Kode Voucher</th>
                                    <th className="py-3 px-3">Pemakaian Voucher</th>
                                    <th className="py-3 px-3">Status &amp; Sync</th>
                                    <th className="py-3 px-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-10 text-center text-slate-400">
                                            Memuat riwayat pembelian voucher...
                                        </td>
                                    </tr>
                                ) : orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-10 text-center text-slate-400">
                                            Belum ada transaksi pembelian voucher hotspot.
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map((o) => (
                                        <tr key={o.id} className="hover:bg-slate-50/70">
                                            <td className="py-3 px-3">
                                                <div className="font-mono font-bold text-slate-900 text-xs">{o.order_code}</div>
                                                <div className="text-xs text-slate-500">{formatDateTime(o.created_at)}</div>
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="font-semibold text-slate-900">{o.package_name || '-'}</div>
                                                <div className="text-xs text-slate-500">
                                                    {o.duration_label || '-'} &bull; Maks {o.max_devices || 1} HP
                                                </div>
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="font-semibold text-slate-800">{o.customer_phone || '-'}</div>
                                                {o.customer_name && (
                                                    <div className="text-xs text-slate-500">{o.customer_name}</div>
                                                )}
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="font-bold text-slate-900">
                                                    {formatCurrency(o.qris_expected_amount || o.base_amount)}
                                                </div>
                                                {o.qris_unique_code > 0 && (
                                                    <div className="text-[11px] text-slate-500">
                                                        Pokok {formatCurrency(o.base_amount)} (+{o.qris_unique_code})
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-3">
                                                {o.voucher_code ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => copyText(o.voucher_code, `vc-${o.id}`)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-amber-400 font-mono font-bold text-xs"
                                                        title="Salin kode voucher"
                                                    >
                                                        {o.voucher_code}
                                                        {copiedKey === `vc-${o.id}` ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : (
                                                            <Copy className="w-3 h-3 text-slate-400" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-3">
                                                {o.status !== 'paid' ? (
                                                    <span className="text-xs text-slate-400">-</span>
                                                ) : o.usage_status === 'expired' ? (
                                                    <div className="space-y-0.5">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                                                            Waktu Habis
                                                        </span>
                                                        {o.first_login_label && (
                                                            <div className="text-[11px] text-slate-500">
                                                                Dipakai: <b>{o.first_login_label}</b>
                                                            </div>
                                                        )}
                                                        {o.expires_label && (
                                                            <div className="text-[11px] text-rose-600">
                                                                Habis: {o.expires_label}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : o.usage_status === 'active' ? (
                                                    <div className="space-y-0.5">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                                                            Sudah Digunakan (Aktif)
                                                        </span>
                                                        {o.first_login_label && (
                                                            <div className="text-[11px] text-slate-600">
                                                                Dipakai: <b>{o.first_login_label}</b>
                                                            </div>
                                                        )}
                                                        {o.remaining_label && (
                                                            <div className="text-[11px] text-emerald-700 font-semibold">
                                                                Sisa: {o.remaining_label}
                                                            </div>
                                                        )}
                                                        {o.expires_label && (
                                                            <div className="text-[10px] text-slate-400">
                                                                s/d {o.expires_label}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-0.5">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700">
                                                            Belum Digunakan
                                                        </span>
                                                        <div className="text-[11px] text-slate-400">
                                                            Menunggu login pertama
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-3 space-y-1">
                                                <div>{statusBadge(o.status)}</div>
                                                {o.status === 'paid' && (
                                                    <div className="flex flex-wrap gap-1">
                                                        <span
                                                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                                o.mikrotik_synced
                                                                    ? 'bg-blue-50 text-blue-700'
                                                                    : 'bg-red-50 text-red-700'
                                                            }`}
                                                            title={o.mikrotik_error || ''}
                                                        >
                                                            {o.mikrotik_synced ? 'MikroTik OK' : 'MikroTik Gagal'}
                                                        </span>
                                                        <span
                                                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                                o.whatsapp_sent_at
                                                                    ? 'bg-emerald-50 text-emerald-700'
                                                                    : 'bg-amber-50 text-amber-700'
                                                            }`}
                                                        >
                                                            {o.whatsapp_sent_at ? 'WA Terkirim' : 'WA Belum'}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                <div className="inline-flex items-center gap-1.5 justify-end">
                                                    {o.status === 'pending' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleConfirmManual(o)}
                                                            disabled={busyOrderId === o.id}
                                                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                                                            title="Konfirmasi lunas manual (fallback jika MacroDroid timeout)"
                                                        >
                                                            Konfirmasi
                                                        </button>
                                                    )}
                                                    {o.status === 'paid' && !o.mikrotik_synced && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRetryMikrotik(o)}
                                                            disabled={busyOrderId === o.id}
                                                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                                                            title="Coba daftarkan ulang ke MikroTik"
                                                        >
                                                            Retry MikroTik
                                                        </button>
                                                    )}
                                                    {o.status === 'paid' && o.customer_phone && o.customer_phone !== '-' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResendWa(o)}
                                                            disabled={busyOrderId === o.id}
                                                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50"
                                                            title="Kirim ulang kode voucher ke WhatsApp"
                                                        >
                                                            <MessageCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: PACKAGES MANAGEMENT */}
            {activeTab === 'packages' && (
                <div className="space-y-4">
                    {packages.length === 0 ? (
                        <div className="app-card p-10 text-center space-y-3">
                            <Wifi className="w-10 h-10 mx-auto text-slate-300" />
                            <h3 className="font-bold text-slate-800">Belum Ada Paket Voucher</h3>
                            <p className="text-sm text-slate-500">
                                Buat paket voucher pertama Anda (misal: 3 Jam Rp 3.000, 1 Hari Rp 5.000, 7 Hari Rp 25.000). Profil otomatis disinkronkan ke MikroTik User Profiles.
                            </p>
                            <button
                                type="button"
                                onClick={openCreatePackage}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold"
                            >
                                <Plus className="w-4 h-4" /> Tambah Paket Voucher
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {packages.map((pkg) => (
                                <div
                                    key={pkg.id}
                                    className={`app-card p-5 flex flex-col justify-between border-2 ${
                                        pkg.is_active ? 'border-transparent' : 'border-dashed border-slate-200 opacity-70'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h3 className="font-extrabold text-slate-900 text-base">{pkg.name}</h3>
                                                <p className="text-xs font-mono text-slate-400 mt-0.5">
                                                    Profil MikroTik: {pkg.mikrotik_profile}
                                                </p>
                                            </div>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                    pkg.is_active
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {pkg.is_active ? 'Aktif' : 'Nonaktif'}
                                            </span>
                                        </div>

                                        <p className="text-2xl font-black text-orange-600 mt-3">
                                            {formatCurrency(pkg.price)}
                                        </p>

                                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                            <div className="p-2.5 rounded-xl bg-slate-50 flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                                                <div>
                                                    <div className="text-slate-400">Durasi</div>
                                                    <div className="font-bold text-slate-800">{pkg.duration_label}</div>
                                                </div>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-slate-50 flex items-center gap-2">
                                                <Users className="w-4 h-4 text-emerald-500 shrink-0" />
                                                <div>
                                                    <div className="text-slate-400">Maks Perangkat</div>
                                                    <div className="font-bold text-slate-800">{pkg.max_devices} Perangkat</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                                            <span className="inline-flex items-center gap-1">
                                                <Gauge className="w-3.5 h-3.5" />
                                                Speed: <b>{pkg.rate_limit || 'Default MikroTik'}</b>
                                            </span>
                                            <span>
                                                Terjual: <b>{pkg.paid_orders_count || 0}</b>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleSyncPackage(pkg)}
                                            disabled={busyPackageId === pkg.id}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${busyPackageId === pkg.id ? 'animate-spin' : ''}`} />
                                            Sync MikroTik
                                        </button>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => openEditPackage(pkg)}
                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                                                title="Edit Paket"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeletePackage(pkg)}
                                                disabled={busyPackageId === pkg.id}
                                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                                                title="Hapus / Nonaktifkan"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: HOTSPOT LOCATIONS (TITIK WIFI VOUCHER) */}
            {activeTab === 'locations' && (
                <div className="space-y-5">
                    <div className="app-card p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <h3 className="font-bold text-slate-900">Pilih Titik Lokasi dari Pelanggan Terpasang</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Pilih pelanggan yang lokasinya sudah dipasangi WiFi Voucher Hotspot. Koordinat diambil otomatis dari data pelanggan dan <b>nama pelanggan tidak ditampilkan ke publik</b>.
                                </p>
                            </div>
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={locationSearch}
                                    onChange={(e) => setLocationSearch(e.target.value)}
                                    placeholder="Cari nama pelanggan / PPPoE / alamat..."
                                    className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-72 outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-y border-slate-200 sticky top-0 z-10">
                                    <tr>
                                        <th className="py-2.5 px-3">Pelanggan (Hanya Terlihat Admin)</th>
                                        <th className="py-2.5 px-3">Wilayah (Label Publik Default)</th>
                                        <th className="py-2.5 px-3">Koordinat</th>
                                        <th className="py-2.5 px-3 text-right">Tampilkan di Peta Voucher</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loadingLocations ? (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-slate-400">
                                                Memuat daftar titik pelanggan...
                                            </td>
                                        </tr>
                                    ) : locationCustomers.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-slate-400">
                                                Tidak ditemukan pelanggan dengan koordinat GPS.
                                            </td>
                                        </tr>
                                    ) : (
                                        locationCustomers.map((c) => (
                                            <tr key={c.id} className="hover:bg-slate-50/70">
                                                <td className="py-2.5 px-3">
                                                    <div className="font-semibold text-slate-900">{c.name}</div>
                                                    {c.pppoe_username && (
                                                        <div className="text-xs font-mono text-slate-400">{c.pppoe_username}</div>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-xs text-slate-600">{c.wilayah || '-'}</td>
                                                <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                                                    {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <button
                                                        type="button"
                                                        disabled={busyLocationKey === `cust-${c.id}`}
                                                        onClick={() => handleToggleCustomerLocation(c, !c.is_hotspot_installed)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-50 ${
                                                            c.is_hotspot_installed
                                                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                                : 'bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-700'
                                                        }`}
                                                    >
                                                        {c.is_hotspot_installed ? 'Terpasang (Aktif)' : '+ Pilih Titik Ini'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="app-card p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-orange-500" />
                                    Titik WiFi Hotspot Aktif di Halaman Beli ({locationsList.length})
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Titik di bawah ini tampil di halaman <b>/hotspot/beli</b> dan otomatis diurutkan terdekat dari lokasi pengunjung. <b>Nama pelanggan TIDAK pernah ditampilkan ke publik</b> — hanya label area/titik.
                                </p>
                            </div>
                        </div>

                        {locationsList.length === 0 ? (
                            <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-sm text-slate-500">
                                Belum ada titik WiFi yang dipilih. Pilih titik pelanggan yang sudah dipasang AP Hotspot pada daftar di atas.
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                                {locationsList.map((loc) => (
                                    <div
                                        key={loc.id}
                                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center gap-3 justify-between"
                                    >
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                                                    Tampil Publik
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    Ref. Internal Admin: <b>{loc.customer_name || 'Manual'}</b> ({loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={editingLabelMap[loc.id] ?? ''}
                                                    onChange={(e) =>
                                                        setEditingLabelMap((prev) => ({
                                                            ...prev,
                                                            [loc.id]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Label publik (contoh: Area Dusun 01, Dekat Masjid)"
                                                    className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveLocationLabel(loc)}
                                                    disabled={busyLocationKey === `loc-${loc.id}`}
                                                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                                                >
                                                    Simpan Label
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteLocation(loc)}
                                                    disabled={busyLocationKey === `loc-${loc.id}`}
                                                    className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600"
                                                    title="Hapus dari peta publik"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: MIKROTIK TEMPLATE & WALLED GARDEN */}
            {activeTab === 'mikrotik' && (
                <div className="space-y-5">
                    {loadingTemplate ? (
                        <div className="app-card p-10 text-center text-slate-400">
                            Memuat file template MikroTik...
                        </div>
                    ) : templateData ? (
                        <>
                            <div className="app-card p-5 space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div>
                                        <h3 className="font-bold text-slate-900">1. Script Walled Garden MikroTik (RouterOS v7)</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Paste perintah berikut di WinBox &rarr; <b>New Terminal</b> agar halaman pembelian voucher di <b>{templateData.app_host}</b> bisa dibuka pelanggan sebelum login WiFi.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => copyText(templateData.walled_garden_cli, 'wg-cli')}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                                    >
                                        {copiedKey === 'wg-cli' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                        {copiedKey === 'wg-cli' ? 'Tersalin!' : 'Salin Script CLI'}
                                    </button>
                                </div>
                                <pre className="p-4 rounded-2xl bg-slate-900 text-emerald-300 text-xs font-mono overflow-x-auto leading-relaxed">
                                    {templateData.walled_garden_cli}
                                </pre>
                            </div>

                            <div className="app-card p-5 space-y-4">
                                <div>
                                    <h3 className="font-bold text-slate-900">2. File Landing Page Hotspot (1 Kolom Voucher + Tombol Beli QRIS)</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Unduh file di bawah lalu drag &amp; drop ke WinBox &rarr; menu <b>Files</b> &rarr; folder <b>hotspot/</b> (timpa file lama).
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {(templateData.files || []).map((f) => (
                                        <div key={f.name} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                                            <div>
                                                <div className="font-mono font-bold text-sm text-slate-900">{f.name}</div>
                                                <div className="text-[11px] text-slate-500">
                                                    {f.exists ? 'Siap diunggah ke MikroTik' : 'Belum tersedia'}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => copyText(f.content, `file-${f.name}`)}
                                                    className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
                                                    title="Salin kode HTML"
                                                >
                                                    {copiedKey === `file-${f.name}` ? (
                                                        <Check className="w-4 h-4 text-emerald-600" />
                                                    ) : (
                                                        <Copy className="w-4 h-4" />
                                                    )}
                                                </button>
                                                <a
                                                    href={f.download_url}
                                                    download={f.name}
                                                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                                                    title="Unduh file"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* MODAL: CREATE / EDIT PACKAGE */}
            {pkgModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-extrabold text-slate-900">
                                {editingPkg ? 'Edit Paket Voucher' : 'Tambah Paket Voucher'}
                            </h3>
                            <button type="button" onClick={() => setPkgModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSavePackage} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Nama Paket *</label>
                                <input
                                    type="text"
                                    required
                                    value={pkgForm.name}
                                    onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                                    placeholder="Contoh: Voucher 1 Hari"
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Harga (Rp) *</label>
                                    <input
                                        type="number"
                                        min={500}
                                        step={500}
                                        required
                                        value={pkgForm.price}
                                        onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Maks Perangkat *</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        required
                                        value={pkgForm.max_devices}
                                        onChange={(e) => setPkgForm({ ...pkgForm, max_devices: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Durasi Masa Aktif *</label>
                                    <input
                                        type="number"
                                        min={1}
                                        required
                                        value={pkgForm.duration_value}
                                        onChange={(e) => setPkgForm({ ...pkgForm, duration_value: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Satuan Durasi</label>
                                    <select
                                        value={pkgForm.duration_unit}
                                        onChange={(e) => setPkgForm({ ...pkgForm, duration_unit: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
                                    >
                                        <option value="minutes">Menit</option>
                                        <option value="hours">Jam</option>
                                        <option value="days">Hari</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Rate Limit (Opsional)</label>
                                    <input
                                        type="text"
                                        value={pkgForm.rate_limit}
                                        onChange={(e) => setPkgForm({ ...pkgForm, rate_limit: e.target.value })}
                                        placeholder="Kosong / misal 3M/3M"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Urutan Tampil</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={pkgForm.sort_order}
                                        onChange={(e) => setPkgForm({ ...pkgForm, sort_order: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Keterangan Singkat (Opsional)</label>
                                <input
                                    type="text"
                                    value={pkgForm.description}
                                    onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                                    placeholder="Misal: Cocok untuk browsing & streaming harian"
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={pkgForm.is_active}
                                    onChange={(e) => setPkgForm({ ...pkgForm, is_active: e.target.checked })}
                                    className="rounded border-slate-300 text-orange-500"
                                />
                                Tampilkan paket di halaman pembelian mandiri
                            </label>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPkgModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingPkg}
                                    className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50"
                                >
                                    {savingPkg ? 'Menyimpan...' : 'Simpan & Sync MikroTik'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: GENERATE MANUAL VOUCHER */}
            {manualModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-extrabold text-slate-900">Buat Voucher Manual (Tunai)</h3>
                            <button type="button" onClick={() => setManualModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {lastGeneratedVoucher ? (
                            <div className="text-center space-y-4">
                                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
                                <p className="text-sm text-slate-600">Voucher berhasil dibuat &amp; dicatat ke pembukuan:</p>
                                <div className="p-4 rounded-2xl bg-slate-900 text-amber-400 font-mono text-3xl font-black tracking-[0.2em]">
                                    {lastGeneratedVoucher.voucher_code}
                                </div>
                                <div className="flex justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => copyText(lastGeneratedVoucher.voucher_code, 'manual-vc')}
                                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold inline-flex items-center gap-1.5"
                                    >
                                        {copiedKey === 'manual-vc' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                        Salin Kode
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setManualModalOpen(false)}
                                        className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
                                    >
                                        Tutup
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleGenerateManual} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Pilih Paket *</label>
                                    <select
                                        required
                                        value={manualForm.package_id}
                                        onChange={(e) => setManualForm({ ...manualForm, package_id: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
                                    >
                                        {packages.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} — {formatCurrency(p.price)} ({p.duration_label})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Nomor WhatsApp (Opsional)</label>
                                    <input
                                        type="tel"
                                        value={manualForm.customer_phone}
                                        onChange={(e) => setManualForm({ ...manualForm, customer_phone: e.target.value })}
                                        placeholder="08xxxxxxxxxx (isi jika ingin dikirim via WA)"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Nama Pembeli (Opsional)</label>
                                    <input
                                        type="text"
                                        value={manualForm.customer_name}
                                        onChange={(e) => setManualForm({ ...manualForm, customer_name: e.target.value })}
                                        placeholder="Contoh: Pembeli Tunai"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={manualForm.send_whatsapp}
                                        onChange={(e) => setManualForm({ ...manualForm, send_whatsapp: e.target.checked })}
                                        className="rounded border-slate-300"
                                    />
                                    Kirim kode voucher ke WhatsApp jika nomor diisi
                                </label>
                                <div className="pt-2 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setManualModalOpen(false)}
                                        className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={generatingManual}
                                        className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
                                    >
                                        {generatingManual ? 'Membuat...' : 'Generate Voucher'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

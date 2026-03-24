import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    Calendar,
    CheckCircle,
    ChevronUp,
    Clock,
    CreditCard,
    Download,
    FileText,
    Globe,
    Home,
    LogOut,
    MapPin,
    MessageSquare,
    Phone,
    RefreshCw,
    Send,
    Server,
    Upload,
    User,
    Wifi,
    XCircle,
} from 'lucide-react';
import NetworkNoticePopup from '../../components/NetworkNoticePopup';

const toneStyles = {
    orange: {
        card: 'bg-orange-50 border-orange-200',
        icon: 'bg-orange-100 text-orange-600',
        value: 'text-orange-700',
    },
    green: {
        card: 'bg-green-50 border-green-200',
        icon: 'bg-green-100 text-green-600',
        value: 'text-green-700',
    },
    blue: {
        card: 'bg-blue-50 border-blue-200',
        icon: 'bg-blue-100 text-blue-600',
        value: 'text-blue-700',
    },
    amber: {
        card: 'bg-amber-50 border-amber-200',
        icon: 'bg-amber-100 text-amber-600',
        value: 'text-amber-700',
    },
    slate: {
        card: 'bg-slate-50 border-slate-200',
        icon: 'bg-slate-100 text-slate-600',
        value: 'text-slate-700',
    },
    red: {
        card: 'bg-red-50 border-red-200',
        icon: 'bg-red-100 text-red-600',
        value: 'text-red-700',
    },
};

function formatPrice(price) {
    if (price === null || price === undefined || price === '') {
        return '-';
    }

    return new Intl.NumberFormat('id-ID').format(Number(price));
}

function formatDate(date) {
    if (!date) return '-';

    return new Date(date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function formatDateTime(date) {
    if (!date) return '-';

    return new Date(date).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || bytes === '') {
        return '-';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Number(bytes);
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    return `${index === 0 ? Math.round(value) : value.toFixed(2)} ${units[index]}`;
}

function getInvoiceStatusConfig(status) {
    const configs = {
        paid: { color: 'bg-green-100 text-green-700', text: 'Lunas', icon: CheckCircle },
        pending: { color: 'bg-yellow-100 text-yellow-700', text: 'Menunggu', icon: Clock },
        unpaid: { color: 'bg-yellow-100 text-yellow-700', text: 'Belum Bayar', icon: Clock },
        overdue: { color: 'bg-red-100 text-red-700', text: 'Jatuh Tempo', icon: AlertCircle },
        cancelled: { color: 'bg-gray-100 text-gray-700', text: 'Dibatalkan', icon: XCircle },
    };

    return configs[status] || configs.unpaid;
}

function getComplaintStatusConfig(status) {
    const configs = {
        pending: { color: 'bg-yellow-100 text-yellow-700', text: 'Menunggu' },
        in_progress: { color: 'bg-blue-100 text-blue-700', text: 'Diproses' },
        resolved: { color: 'bg-green-100 text-green-700', text: 'Selesai' },
        closed: { color: 'bg-gray-100 text-gray-700', text: 'Ditutup' },
    };

    return configs[status] || configs.pending;
}

function getCategoryLabel(category) {
    const labels = {
        gangguan: 'Gangguan Jaringan',
        pembayaran: 'Pembayaran',
        layanan: 'Layanan',
        lainnya: 'Lainnya',
    };

    return labels[category] || category || '-';
}

function getConnectionStatusConfig(status) {
    const configs = {
        online: {
            badge: 'bg-green-100 text-green-700',
            panel: 'bg-green-50 border-green-200',
            label: 'Online',
            helper: 'Router rumah sedang aktif di jaringan kami.',
        },
        offline: {
            badge: 'bg-red-100 text-red-700',
            panel: 'bg-red-50 border-red-200',
            label: 'Offline',
            helper: 'Akun PPPoE ada, tetapi router rumah belum terkoneksi.',
        },
        isolated: {
            badge: 'bg-amber-100 text-amber-700',
            panel: 'bg-amber-50 border-amber-200',
            label: 'Diisolir',
            helper: 'Layanan sedang dibatasi sampai verifikasi atau pembayaran selesai.',
        },
        inactive: {
            badge: 'bg-slate-100 text-slate-700',
            panel: 'bg-slate-50 border-slate-200',
            label: 'Nonaktif',
            helper: 'Akun layanan sedang tidak aktif.',
        },
        provisioning: {
            badge: 'bg-blue-100 text-blue-700',
            panel: 'bg-blue-50 border-blue-200',
            label: 'Menunggu Aktivasi',
            helper: 'Akun PPPoE belum ditemukan di router pusat.',
        },
        not_configured: {
            badge: 'bg-gray-100 text-gray-700',
            panel: 'bg-gray-50 border-gray-200',
            label: 'Belum Terkonfigurasi',
            helper: 'Username PPPoE belum tersedia.',
        },
        unknown: {
            badge: 'bg-yellow-100 text-yellow-700',
            panel: 'bg-yellow-50 border-yellow-200',
            label: 'Status Tidak Tersedia',
            helper: 'Portal belum bisa membaca router MikroTik saat ini.',
        },
    };

    return configs[status] || configs.unknown;
}

function getDueDateCopy(daysUntilDue) {
    if (daysUntilDue === null || daysUntilDue === undefined) {
        return 'Tanggal jatuh tempo belum ditentukan';
    }

    if (daysUntilDue < 0) {
        return `Terlambat ${Math.abs(daysUntilDue)} hari`;
    }

    if (daysUntilDue === 0) {
        return 'Jatuh tempo hari ini';
    }

    return `${daysUntilDue} hari lagi`;
}

function getNoticeTone(notice) {
    if (notice.type === 'maintenance') {
        return 'bg-blue-50 border-blue-200 text-blue-700';
    }

    if (notice.severity === 'critical' || notice.severity === 'high') {
        return 'bg-red-50 border-red-200 text-red-700';
    }

    return 'bg-amber-50 border-amber-200 text-amber-700';
}

function SummaryCard({ icon: Icon, tone = 'orange', label, value, helper }) {
    const styles = toneStyles[tone] || toneStyles.orange;

    return (
        <div className={`rounded-2xl border p-4 ${styles.card}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{label}</p>
                    <p className={`mt-3 text-2xl font-bold ${styles.value}`}>{value}</p>
                    {helper && <p className="mt-2 text-sm text-gray-600">{helper}</p>}
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${styles.icon}`}>
                    <Icon size={20} />
                </div>
            </div>
        </div>
    );
}

function DetailCard({ icon: Icon, label, value, helper }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 shadow-sm">
                    <Icon size={18} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{label}</p>
                    <p className="mt-2 break-words text-sm font-semibold text-gray-900">{value || '-'}</p>
                    {helper && <p className="mt-2 text-xs text-gray-500">{helper}</p>}
                </div>
            </div>
        </div>
    );
}

function CustomerDashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [networkNotices, setNetworkNotices] = useState([]);
    const [showNoticePopup, setShowNoticePopup] = useState(false);
    const [showComplaintForm, setShowComplaintForm] = useState(false);
    const [complaintForm, setComplaintForm] = useState({
        subject: '',
        message: '',
        category: 'gangguan',
    });
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);

    const clearCustomerSession = () => {
        localStorage.removeItem('customer_logged_in');
        localStorage.removeItem('customer_name');
        localStorage.removeItem('customer_id');
    };

    const fetchNetworkNotices = async (customerOdp = null) => {
        try {
            const query = customerOdp ? `?odp=${encodeURIComponent(customerOdp)}` : '';
            const response = await fetch(`/api/network-notices/customer${query}`, {
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            const result = await response.json();

            if (result.success && Array.isArray(result.data)) {
                setNetworkNotices(result.data);
                setShowNoticePopup(result.data.length > 0);
            }
        } catch (err) {
            console.error('Failed to fetch network notices', err);
        }
    };

    const fetchDashboard = async ({ silent = false, withNotices = true } = {}) => {
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/dashboard', {
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
            const result = await response.json();

            if (result.success) {
                setData(result);

                if (withNotices) {
                    await fetchNetworkNotices(result.customer?.odp || null);
                }

                return result;
            }

            if (response.status === 401) {
                clearCustomerSession();
                navigate('/customer/login');
                return null;
            }

            setError(result.message || 'Gagal memuat data pelanggan.');
            return null;
        } catch (err) {
            setError('Gagal memuat data portal pelanggan.');
            console.error(err);
            return null;
        } finally {
            if (silent) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const isLoggedIn = localStorage.getItem('customer_logged_in');

        if (!isLoggedIn) {
            navigate('/customer/login');
            return undefined;
        }

        fetchDashboard();

        const interval = setInterval(() => {
            fetchDashboard({ silent: true, withNotices: false });
        }, 30000);

        return () => clearInterval(interval);
    }, [navigate]);

    const handleLogout = async () => {
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            await fetch('/api/customer/logout', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
        } catch (err) {
            console.error(err);
        }

        clearCustomerSession();
        navigate('/customer/login');
    };

    const handleRefresh = async () => {
        setError(null);
        await fetchDashboard({ silent: true, withNotices: true });
    };

    const handleComplaintSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/complaint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(complaintForm),
            });
            const result = await response.json();

            if (result.success) {
                setSuccessMessage('Aduan berhasil dikirim. Tim kami akan segera menindaklanjuti.');
                setComplaintForm({ subject: '', message: '', category: 'gangguan' });
                setShowComplaintForm(false);
                await fetchDashboard({ silent: true, withNotices: false });
            } else {
                setError(result.message || 'Aduan belum berhasil dikirim.');
            }
        } catch (err) {
            setError('Gagal mengirim aduan.');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
                    <p className="text-gray-600">Memuat portal pelanggan V2...</p>
                </div>
            </div>
        );
    }

    const customer = data?.customer || {};
    const invoices = data?.invoices || [];
    const complaints = data?.complaints || [];
    const accountSummary = data?.account_summary || {};
    const connection = data?.connection || {};
    const homeRouter = connection.home_router || {};
    const usage = data?.usage || {};
    const household = data?.household || {};
    const supportSummary = data?.support_summary || {};
    const portalMeta = data?.portal_meta || {};
    const capabilities = portalMeta.capabilities || {};
    const connectionStatus = getConnectionStatusConfig(connection.status);
    const dueDateCopy = getDueDateCopy(accountSummary.days_until_due);
    const latestInvoice = invoices[0];
    const latestInvoiceStatus = latestInvoice
        ? getInvoiceStatusConfig(latestInvoice.status)
        : getInvoiceStatusConfig('unpaid');
    const LatestInvoiceIcon = latestInvoiceStatus.icon;

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
            {showNoticePopup && networkNotices.length > 0 && (
                <NetworkNoticePopup
                    notices={networkNotices}
                    autoHideDelay={4000}
                    showOnlyFirst={true}
                    onClose={() => setShowNoticePopup(false)}
                />
            )}

            <header className="sticky top-0 z-50 bg-white/90 shadow-sm backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
                    <div className="flex items-center gap-3">
                        <a href="/" className="flex items-center gap-3">
                            <img src="/logo_baru.png" alt="Logo" className="h-10" />
                            <div className="hidden sm:block">
                                <p className="font-bold text-gray-900">Rumah Kita Net</p>
                                <p className="text-xs text-gray-500">Portal Pelanggan V2</p>
                            </div>
                        </a>
                    </div>

                    <div className="flex items-center gap-3">
                        <a href="/" className="text-gray-600 transition hover:text-gray-900">
                            <Home size={20} />
                        </a>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-red-600 transition hover:text-red-700"
                        >
                            <LogOut size={20} />
                            <span className="hidden sm:inline">Keluar</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
                {successMessage && (
                    <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-700">
                        <CheckCircle size={20} />
                        <span>{successMessage}</span>
                        <button
                            type="button"
                            onClick={() => setSuccessMessage(null)}
                            className="ml-auto text-sm font-semibold text-green-700 transition hover:text-green-900"
                        >
                            Tutup
                        </button>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                        <AlertCircle size={20} />
                        <span>{error}</span>
                        <button
                            type="button"
                            onClick={() => setError(null)}
                            className="ml-auto text-sm font-semibold text-red-700 transition hover:text-red-900"
                        >
                            Tutup
                        </button>
                    </div>
                )}

                {networkNotices.length > 0 && (
                    <section className="rounded-3xl bg-white p-6 shadow-lg">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    Info Jaringan Aktif
                                </p>
                                <h2 className="mt-2 text-xl font-bold text-gray-900">
                                    Ada {networkNotices.length} informasi yang relevan untuk area Anda
                                </h2>
                            </div>
                            <a
                                href="/status-jaringan"
                                className="rounded-full border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-600 transition hover:bg-orange-50"
                            >
                                Lihat semua info
                            </a>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {networkNotices.slice(0, 3).map((notice) => (
                                <div
                                    key={notice.id}
                                    className={`rounded-2xl border p-4 ${getNoticeTone(notice)}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-semibold">{notice.title}</p>
                                        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">
                                            {notice.type === 'maintenance' ? 'Maintenance' : 'Gangguan'}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm">
                                        {notice.message || 'Ada informasi jaringan baru yang perlu diperhatikan.'}
                                    </p>
                                    <p className="mt-3 text-xs opacity-80">
                                        Mulai: {formatDateTime(notice.start_time || notice.created_at)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-xl shadow-orange-500/20">
                    <div className="grid gap-6 p-6 lg:grid-cols-[1.45fr,0.95fr] lg:p-8">
                        <div>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/75">
                                        Status Layanan Rumah
                                    </p>
                                    <h1 className="mt-3 text-3xl font-bold">
                                        {customer.nama || localStorage.getItem('customer_name') || 'Pelanggan'}
                                    </h1>
                                    <p className="mt-3 max-w-2xl text-sm text-white/85">
                                        Portal V2 menampilkan kondisi layanan internet rumah Anda secara real-time
                                        dari jaringan pusat kami.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRefresh}
                                    disabled={refreshing}
                                    className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                                    {refreshing ? 'Memperbarui...' : 'Refresh'}
                                </button>
                            </div>

                            <div className={`mt-6 rounded-3xl border p-5 ${connectionStatus.panel}`}>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${connectionStatus.badge}`}>
                                        {connection.status_label || connectionStatus.label}
                                    </span>
                                    <span className="text-sm font-medium text-gray-700">
                                        Dicek: {formatDateTime(portalMeta.refreshed_at || connection.last_checked_at)}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm text-gray-700">
                                    {connection.status_note || connectionStatus.helper}
                                </p>
                                {connection.availability_note && (
                                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                                        {connection.availability_note}
                                    </p>
                                )}
                            </div>

                            <div className="mt-6 flex flex-wrap gap-2">
                                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                    {capabilities.realtime_connection ? 'Realtime status aktif' : 'Realtime status belum siap'}
                                </span>
                                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                    {capabilities.session_traffic ? 'Traffic sesi tersedia' : 'Traffic sesi menunggu counter router'}
                                </span>
                                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                    {capabilities.home_device_count ? 'Hitung perangkat tersedia' : 'Hitung perangkat butuh integrasi router rumah'}
                                </span>
                                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                    {capabilities.customer_router_monitoring ? 'Monitoring router rumah aktif' : 'Monitoring router rumah belum aktif'}
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                            <SummaryCard
                                icon={Wifi}
                                tone={connection.status === 'online' ? 'green' : connection.status === 'isolated' ? 'amber' : 'red'}
                                label="Status Layanan"
                                value={connection.status_label || connectionStatus.label}
                                helper={connection.is_online ? 'Router rumah sedang aktif' : 'Pantau kembali setelah refresh'}
                            />
                            <SummaryCard
                                icon={CreditCard}
                                tone={accountSummary.days_until_due !== null && accountSummary.days_until_due < 0 ? 'red' : 'orange'}
                                label="Jatuh Tempo"
                                value={accountSummary.due_date ? formatDate(accountSummary.due_date) : '-'}
                                helper={dueDateCopy}
                            />
                            <SummaryCard
                                icon={Activity}
                                tone="blue"
                                label="Paket Aktif"
                                value={customer.paket || '-'}
                                helper={customer.harga ? `Rp ${formatPrice(customer.harga)} per bulan` : 'Harga belum tercatat'}
                            />
                            <SummaryCard
                                icon={MessageSquare}
                                tone={supportSummary.active_count > 0 ? 'amber' : 'green'}
                                label="Aduan Aktif"
                                value={String(supportSummary.active_count || 0)}
                                helper={supportSummary.latest_subject || 'Belum ada aduan aktif'}
                            />
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                    <div className="rounded-3xl bg-white p-6 shadow-lg">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    Koneksi Real-Time
                                </p>
                                <h2 className="mt-2 text-2xl font-bold text-gray-900">Status internet rumah Anda</h2>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${connectionStatus.badge}`}>
                                {connection.status_label || connectionStatus.label}
                            </span>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <DetailCard
                                icon={User}
                                label="Username PPPoE"
                                value={connection.pppoe_username || customer.user_pppoe || '-'}
                                helper="Dipakai untuk identitas koneksi rumah Anda"
                            />
                            <DetailCard
                                icon={Server}
                                label="Router Pusat"
                                value={connection.router_identity || '-'}
                                helper={connection.router_version ? `RouterOS ${connection.router_version}` : 'Nama router belum tersedia'}
                            />
                            <DetailCard
                                icon={Globe}
                                label="IP Aktif"
                                value={connection.session?.ip_address || connection.ip_address || '-'}
                                helper="IP yang sedang aktif untuk sesi saat ini"
                            />
                            <DetailCard
                                icon={Wifi}
                                label="Profile Layanan"
                                value={connection.secret?.profile || connection.configured_profile || customer.mikrotik_profile || '-'}
                                helper="Profile bandwidth yang terpasang di MikroTik"
                            />
                            <DetailCard
                                icon={Activity}
                                label="Uptime Sesi"
                                value={connection.session?.uptime || connection.uptime || '-'}
                                helper="Lama koneksi rumah tersambung tanpa putus"
                            />
                            <DetailCard
                                icon={Phone}
                                label="Caller ID"
                                value={connection.session?.caller_id || connection.caller_id || '-'}
                                helper="Identitas perangkat yang terlihat dari PPPoE"
                            />
                        </div>

                        <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                                            Router Rumah
                                        </p>
                                        <h3 className="mt-1 text-lg font-bold text-gray-900">
                                            {homeRouter.identity || 'Monitoring router pelanggan'}
                                        </h3>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${homeRouter.reachable ? 'bg-green-100 text-green-700' : homeRouter.enabled ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                        {homeRouter.status_label || (homeRouter.reachable ? 'Terhubung' : homeRouter.enabled ? 'Belum terjangkau' : 'Belum siap')}
                                    </span>
                                </div>
                                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                                    <DetailCard
                                        icon={Server}
                                        label="Router Rumah"
                                        value={homeRouter.identity || homeRouter.type_label || '-'}
                                        helper={homeRouter.version ? `RouterOS ${homeRouter.version}` : homeRouter.type_label || 'Identity router rumah belum terbaca'}
                                    />
                                    <DetailCard
                                        icon={Globe}
                                        label="Host Router"
                                        value={homeRouter.host || '-'}
                                        helper={homeRouter.host_source_label || 'Host manajemen router rumah'}
                                    />
                                    <DetailCard
                                        icon={Globe}
                                        label="Interface WAN"
                                        value={homeRouter.wan_interface || '-'}
                                        helper={homeRouter.traffic_source || (homeRouter.management_mode === 'web' ? 'Router ini dipantau lewat panel web admin' : 'Portal akan pakai interface ini untuk membaca traffic')}
                                    />
                                    <DetailCard
                                        icon={Activity}
                                        label="Uptime WAN"
                                        value={homeRouter.wan_uptime || '-'}
                                        helper={homeRouter.device_source || 'Dipakai saat router rumah mengirim uptime WAN'}
                                    />
                                </div>
                                {homeRouter.availability_note && (
                                    <p className="mt-4 text-sm text-gray-600">{homeRouter.availability_note}</p>
                                )}
                        </div>
                    </div>

                    <div className="rounded-3xl bg-white p-6 shadow-lg">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                Insight V2
                            </p>
                            <h2 className="mt-2 text-2xl font-bold text-gray-900">Traffic dan rumah</h2>
                            <p className="mt-2 text-sm text-gray-600">{usage.note}</p>
                            {usage.source_label && (
                                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                    Sumber: {usage.source_label}
                                </p>
                            )}
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <SummaryCard
                                icon={Download}
                                tone="blue"
                                label="Download Sesi"
                                value={usage.download_label || formatBytes(usage.download_bytes)}
                                helper={usage.source_label ? `Counter dari ${usage.source_label.toLowerCase()}` : 'Counter sesi yang sedang aktif'}
                            />
                            <SummaryCard
                                icon={Upload}
                                tone="orange"
                                label="Upload Sesi"
                                value={usage.upload_label || formatBytes(usage.upload_bytes)}
                                helper={usage.source_label ? `Counter dari ${usage.source_label.toLowerCase()}` : 'Counter sesi yang sedang aktif'}
                            />
                            <SummaryCard
                                icon={Activity}
                                tone="green"
                                label="Total Traffic"
                                value={usage.total_label || formatBytes(usage.total_bytes)}
                                helper={usage.available ? (usage.source_label ? `Akumulasi upload + download dari ${usage.source_label.toLowerCase()}` : 'Akumulasi upload + download sesi aktif') : 'Menunggu counter router'}
                            />
                            <SummaryCard
                                icon={Wifi}
                                tone={connection.session?.active ? 'green' : 'slate'}
                                label="Sesi Rumah Aktif"
                                value={String(household.active_household_sessions || 0)}
                                helper={household.active_household_sessions_note}
                            />
                        </div>

                        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                Perangkat Di Rumah
                            </p>
                            <p className="mt-3 text-2xl font-bold text-gray-900">
                                {household.home_device_count_available ? household.home_device_count : 'Belum tersedia'}
                            </p>
                            {household.home_device_source_label && (
                                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                    Sumber: {household.home_device_source_label}
                                </p>
                            )}
                            <p className="mt-2 text-sm text-gray-600">{household.home_device_note}</p>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl bg-white p-6 shadow-lg">
                        <div className="mb-5">
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                Profil Pelanggan
                            </p>
                            <h2 className="mt-2 text-2xl font-bold text-gray-900">Informasi akun dan lokasi</h2>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <DetailCard icon={MapPin} label="Alamat" value={customer.alamat || '-'} />
                            <DetailCard icon={Phone} label="No. Telepon" value={customer.no_telp || '-'} />
                            <DetailCard icon={Calendar} label="Aktivasi" value={formatDate(customer.activation_date || accountSummary.activation_date)} />
                            <DetailCard icon={Server} label="ODP" value={customer.odp || '-'} />
                        </div>
                    </div>

                    <div className="rounded-3xl bg-white p-6 shadow-lg">
                        <div className="mb-5 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    Snapshot Penagihan
                                </p>
                                <h2 className="mt-2 text-2xl font-bold text-gray-900">Ringkasan tagihan Anda</h2>
                            </div>
                            {latestInvoice && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${latestInvoiceStatus.color}`}>
                                    <LatestInvoiceIcon size={14} />
                                    {latestInvoiceStatus.text}
                                </span>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <SummaryCard
                                icon={CreditCard}
                                tone={accountSummary.open_invoice_count > 0 ? 'amber' : 'green'}
                                label="Tagihan Terbuka"
                                value={String(accountSummary.open_invoice_count || 0)}
                                helper="Jumlah tagihan yang belum lunas"
                            />
                            <SummaryCard
                                icon={CheckCircle}
                                tone="green"
                                label="Tagihan Lunas"
                                value={String(accountSummary.paid_invoice_count || 0)}
                                helper="Total pembayaran yang sudah tercatat"
                            />
                            <SummaryCard
                                icon={Calendar}
                                tone="blue"
                                label="Pembayaran Terakhir"
                                value={accountSummary.last_payment_at ? formatDate(accountSummary.last_payment_at) : '-'}
                                helper={accountSummary.last_paid_amount ? `Rp ${formatPrice(accountSummary.last_paid_amount)}` : 'Belum ada pembayaran tercatat'}
                            />
                            <SummaryCard
                                icon={FileText}
                                tone="orange"
                                label="Invoice Terbaru"
                                value={accountSummary.latest_invoice_amount ? `Rp ${formatPrice(accountSummary.latest_invoice_amount)}` : '-'}
                                helper={accountSummary.latest_invoice_due_date ? `Jatuh tempo ${formatDate(accountSummary.latest_invoice_due_date)}` : 'Belum ada invoice'}
                            />
                        </div>
                    </div>
                </section>

                <section className="rounded-3xl bg-white p-6 shadow-lg">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                            <CreditCard size={20} className="text-orange-500" />
                            Riwayat Pembayaran
                        </h2>
                    </div>

                    {invoices.length > 0 ? (
                        <div className="space-y-3">
                            {invoices.map((invoice) => {
                                const status = getInvoiceStatusConfig(invoice.status);
                                const StatusIcon = status.icon;

                                return (
                                    <div
                                        key={invoice.id}
                                        className="flex flex-col gap-4 rounded-2xl bg-gray-50 p-4 transition hover:bg-gray-100 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                                                <FileText size={20} className="text-gray-400" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">
                                                    Tagihan{' '}
                                                    {new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('id-ID', {
                                                        month: 'long',
                                                        year: 'numeric',
                                                    })}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    Rp {formatPrice(invoice.amount || 0)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-left sm:text-right">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${status.color}`}>
                                                <StatusIcon size={12} />
                                                {status.text}
                                            </span>
                                            <p className="mt-2 text-xs text-gray-500">
                                                Dibayar: {formatDate(invoice.paid_at)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-gray-500">
                            <CreditCard size={48} className="mx-auto mb-4 text-gray-300" />
                            <p>Belum ada riwayat pembayaran.</p>
                        </div>
                    )}
                </section>

                <section className="rounded-3xl bg-white p-6 shadow-lg">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                            <MessageSquare size={20} className="text-orange-500" />
                            Aduan dan Dukungan
                        </h2>
                        <button
                            type="button"
                            onClick={() => setShowComplaintForm((current) => !current)}
                            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
                        >
                            {showComplaintForm ? (
                                <>
                                    <ChevronUp size={18} />
                                    Tutup Form
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Buat Aduan
                                </>
                            )}
                        </button>
                    </div>

                    {showComplaintForm && (
                        <form onSubmit={handleComplaintSubmit} className="mb-6 space-y-4 rounded-2xl bg-orange-50 p-6">
                            <h3 className="font-semibold text-gray-900">Form aduan baru</h3>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Kategori</label>
                                <select
                                    value={complaintForm.category}
                                    onChange={(event) =>
                                        setComplaintForm((current) => ({
                                            ...current,
                                            category: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="gangguan">Gangguan Jaringan</option>
                                    <option value="pembayaran">Pembayaran</option>
                                    <option value="layanan">Layanan</option>
                                    <option value="lainnya">Lainnya</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Judul Aduan</label>
                                <input
                                    type="text"
                                    value={complaintForm.subject}
                                    onChange={(event) =>
                                        setComplaintForm((current) => ({
                                            ...current,
                                            subject: event.target.value,
                                        }))
                                    }
                                    required
                                    placeholder="Contoh: Internet lambat sejak pagi"
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Detail Aduan</label>
                                <textarea
                                    value={complaintForm.message}
                                    onChange={(event) =>
                                        setComplaintForm((current) => ({
                                            ...current,
                                            message: event.target.value,
                                        }))
                                    }
                                    required
                                    rows={4}
                                    placeholder="Jelaskan kondisi yang Anda alami dengan detail."
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-3 font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            >
                                {submitting ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Mengirim...
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        Kirim Aduan
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {complaints.length > 0 ? (
                        <div className="space-y-3">
                            {complaints.map((complaint) => {
                                const complaintStatus = getComplaintStatusConfig(complaint.status);

                                return (
                                    <div key={complaint.id} className="rounded-2xl bg-gray-50 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="font-medium text-gray-900">{complaint.subject}</h4>
                                                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${complaintStatus.color}`}>
                                                        {complaintStatus.text}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm text-gray-600">{complaint.message}</p>
                                                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                                                    <span>{getCategoryLabel(complaint.category)}</span>
                                                    <span>{formatDate(complaint.created_at)}</span>
                                                </div>

                                                {complaint.admin_response && (
                                                    <div className="mt-3 rounded-xl bg-blue-50 p-3">
                                                        <p className="text-xs font-medium text-blue-700">Balasan Admin</p>
                                                        <p className="mt-1 text-sm text-blue-900">{complaint.admin_response}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-gray-500">
                            <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
                            <p>Belum ada aduan.</p>
                            <p className="mt-1 text-sm">Gunakan form di atas jika Anda membutuhkan bantuan tim kami.</p>
                        </div>
                    )}
                </section>
            </main>

            <footer className="mt-12 border-t border-gray-200 bg-white py-6">
                <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-500">
                    <p>(c) {new Date().getFullYear()} Rumah Kita Network. Portal Pelanggan V2.</p>
                </div>
            </footer>
        </div>
    );
}

export default CustomerDashboard;

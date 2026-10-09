import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Ban,
    Calendar,
    Check,
    CheckCircle,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    Copy,
    CreditCard,
    Download,
    FileText,
    Home,
    Info,
    Laptop,
    Lock,
    LogOut,
    MapPin,
    MessageSquare,
    Eye,
    EyeOff,
    ExternalLink,
    Phone,
    RefreshCw,
    Server,
    Send,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Tv,
    Upload,
    User,
    Wifi,
    XCircle,
} from 'lucide-react';
import NetworkNoticePopup from '../../components/NetworkNoticePopup';

const WIFI_PASSWORD_VERIFICATION_INTERVAL_MS = 5000;
const WIFI_PASSWORD_VERIFICATION_TIMEOUT_MS = 60000;
const WIFI_PASSWORD_VERIFICATION_TERMINAL_STATUSES = ['verified', 'partial', 'failed'];

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
            helper: 'Internet rumah sedang aktif.',
        },
        offline: {
            badge: 'bg-red-100 text-red-700',
            panel: 'bg-red-50 border-red-200',
            label: 'Offline',
            helper: 'Internet rumah sedang tidak aktif.',
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
            helper: 'Layanan internet rumah sedang disiapkan.',
        },
        not_configured: {
            badge: 'bg-gray-100 text-gray-700',
            panel: 'bg-gray-50 border-gray-200',
            label: 'Belum Terkonfigurasi',
            helper: 'Router rumah belum siap dipantau untuk akun ini.',
        },
        unknown: {
            badge: 'bg-yellow-100 text-yellow-700',
            panel: 'bg-yellow-50 border-yellow-200',
            label: 'Status Tidak Tersedia',
            helper: 'Status internet rumah belum bisa dibaca saat ini.',
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

function PasswordField({
    value,
    onChange,
    placeholder,
    visible,
    onToggle,
    minLength = 6,
    required = true,
}) {
    return (
        <div className="relative">
            <input
                type={visible ? 'text' : 'password'}
                required={required}
                minLength={minLength}
                value={value}
                onChange={onChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11"
                placeholder={placeholder}
            />
            <button
                type="button"
                onClick={onToggle}
                className="absolute inset-y-0 right-1 my-1 inline-flex w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                title={visible ? 'Sembunyikan sandi' : 'Lihat sandi'}
            >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
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
    const [paymentForm, setPaymentForm] = useState({
        invoice_id: '',
        paid_amount: '',
        bukti_pembayaran: null,
    });
    const [showPaymentConfirmationForm, setShowPaymentConfirmationForm] = useState(false);
    const [paymentHistoryPage, setPaymentHistoryPage] = useState(1);
    const [profileForm, setProfileForm] = useState({ phone: '' });
    const [passwordForm, setPasswordForm] = useState({
        current_password: '',
        new_password: '',
        new_password_confirmation: '',
    });
    const [passwordVisibility, setPasswordVisibility] = useState({
        current_password: false,
        new_password: false,
        new_password_confirmation: false,
    });
    const [showCurrentWifiPassword, setShowCurrentWifiPassword] = useState(false);
    const [copiedCurrentWifiPassword, setCopiedCurrentWifiPassword] = useState(false);
    const [showChangeWifiModal, setShowChangeWifiModal] = useState(false);
    const [wifiChangeForm, setWifiChangeForm] = useState({
        ssid: '',
        password: '',
    });
    const [showNewWifiPassword, setShowNewWifiPassword] = useState(false);
    const [savingWifiChange, setSavingWifiChange] = useState(false);
    const [wifiActionSuccess, setWifiActionSuccess] = useState('');
    const [wifiActionError, setWifiActionError] = useState('');
    const [blockingMac, setBlockingMac] = useState(null);
    const [blockModalTarget, setBlockModalTarget] = useState(null);
    const [blockReason, setBlockReason] = useState('');
    const [submittingBlock, setSubmittingBlock] = useState(false);
    const [autoMessageDisabled, setAutoMessageDisabled] = useState(false);
    const [showDisableAutoMessageModal, setShowDisableAutoMessageModal] = useState(false);
    const [submittingProfile, setSubmittingProfile] = useState(false);
    const [submittingPassword, setSubmittingPassword] = useState(false);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [savingAutoMessage, setSavingAutoMessage] = useState(false);
    const [dismissingNoticeId, setDismissingNoticeId] = useState(null);

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
                setProfileForm({ phone: result.customer?.no_telp || '' });
                setAutoMessageDisabled(Boolean(result.customer?.billing_auto_disabled));

                if (Array.isArray(result.network_notices)) {
                    setNetworkNotices(result.network_notices);
                    setShowNoticePopup(result.network_notices.length > 0);
                } else if (withNotices) {
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

        return () => {
            clearInterval(interval);
        };
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

    const handleProfileUpdate = async (event) => {
        event.preventDefault();
        setSubmittingProfile(true);
        setError(null);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({ phone: profileForm.phone }),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal memperbarui nomor telepon.');
            }
            setSuccessMessage(result.message || 'Profil berhasil diperbarui.');
            await fetchDashboard({ silent: true, withNotices: false });
        } catch (err) {
            setError(err.message || 'Gagal memperbarui profil.');
        } finally {
            setSubmittingProfile(false);
        }
    };

    const handlePasswordUpdate = async (event) => {
        event.preventDefault();
        setSubmittingPassword(true);
        setError(null);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/password', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(passwordForm),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal memperbarui password.');
            }
            setSuccessMessage(result.message || 'Password berhasil diperbarui.');
            setPasswordForm({
                current_password: '',
                new_password: '',
                new_password_confirmation: '',
            });
            await fetchDashboard({ silent: true, withNotices: false });
        } catch (err) {
            setError(err.message || 'Gagal memperbarui password.');
        } finally {
            setSubmittingPassword(false);
        }
    };

    const togglePasswordVisibility = (field) => {
        setPasswordVisibility((prev) => ({
            ...prev,
            [field]: !prev[field],
        }));
    };

    const updateAutoMessagePreference = async (disabled) => {
        setSavingAutoMessage(true);
        setError(null);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/auto-message', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({ billing_auto_disabled: disabled }),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal mengubah preferensi pesan otomatis.');
            }
            setAutoMessageDisabled(disabled);
            setSuccessMessage(result.message || 'Preferensi pesan otomatis diperbarui.');
            await fetchDashboard({ silent: true, withNotices: false });
            return true;
        } catch (err) {
            setError(err.message || 'Gagal mengubah preferensi pesan otomatis.');
            return false;
        } finally {
            setSavingAutoMessage(false);
        }
    };

    const handleEnableAutoMessage = async () => {
        await updateAutoMessagePreference(false);
    };

    const handleDisableAutoMessageRequest = () => {
        setShowDisableAutoMessageModal(true);
    };

    const handleConfirmDisableAutoMessage = async () => {
        const success = await updateAutoMessagePreference(true);

        if (success) {
            setShowDisableAutoMessageModal(false);
        }
    };

    const handlePaymentConfirm = async (event) => {
        event.preventDefault();
        setSubmittingPayment(true);
        setError(null);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const formData = new FormData();
            formData.append('invoice_id', paymentForm.invoice_id);
            if (paymentForm.paid_amount) {
                formData.append('paid_amount', paymentForm.paid_amount);
            }
            if (paymentForm.bukti_pembayaran) {
                formData.append('bukti_pembayaran', paymentForm.bukti_pembayaran);
            }

            const response = await fetch('/api/customer/payments/confirm', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: formData,
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal mengirim konfirmasi pembayaran.');
            }
            setSuccessMessage(result.message || 'Konfirmasi pembayaran berhasil dikirim.');
            setPaymentForm({ invoice_id: '', paid_amount: '', bukti_pembayaran: null });
            setShowPaymentConfirmationForm(false);
            await fetchDashboard({ silent: true, withNotices: false });
        } catch (err) {
            setError(err.message || 'Gagal mengirim konfirmasi pembayaran.');
        } finally {
            setSubmittingPayment(false);
        }
    };

    const handleDismissNotice = async (noticeId) => {
        try {
            setDismissingNoticeId(noticeId);
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            await fetch(`/api/customer/network-notices/${noticeId}/read`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({ dismiss: true }),
            });
            setNetworkNotices((current) => current.filter((notice) => Number(notice.id) !== Number(noticeId)));
        } catch (err) {
            setError('Gagal menandai informasi gangguan.');
        } finally {
            setDismissingNoticeId(null);
        }
    };

    const handleSaveWifiCredentials = async (e) => {
        e?.preventDefault?.();
        if (!wifiChangeForm.ssid && !wifiChangeForm.password) {
            setWifiActionError('Masukkan Nama SSID atau Password baru.');
            return;
        }
        if (wifiChangeForm.password && wifiChangeForm.password.length < 8) {
            setWifiActionError('Password WiFi minimal 8 karakter.');
            return;
        }

        try {
            setSavingWifiChange(true);
            setWifiActionError('');
            setWifiActionSuccess('');
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/wifi/update', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    ssid: wifiChangeForm.ssid || null,
                    password: wifiChangeForm.password || null,
                }),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal mengubah konfigurasi WiFi.');
            }
            setWifiActionSuccess(result.message || 'Perubahan WiFi berhasil dikirim ke router! Estimasi penerapan 2 - 3 menit.');
            setShowChangeWifiModal(false);
            setWifiChangeForm((p) => ({ ...p, password: '' }));
            await fetchDashboard({ silent: true, withNotices: false });
        } catch (err) {
            setWifiActionError(err.message || 'Gagal mengubah konfigurasi WiFi.');
        } finally {
            setSavingWifiChange(false);
        }
    };

    const handleConfirmBlockDevice = async (e) => {
        e?.preventDefault?.();
        if (!blockModalTarget?.mac_address) return;

        try {
            setSubmittingBlock(true);
            setError(null);
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/wifi/block-device', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    mac_address: blockModalTarget.mac_address,
                    reason: blockReason || 'Diblokir oleh pemilik WiFi',
                }),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal memblokir perangkat.');
            }
            setSuccessMessage(result.message || `Perangkat ${blockModalTarget.mac_address} berhasil diblokir.`);
            setBlockModalTarget(null);
            setBlockReason('');
            await fetchDashboard({ silent: true, withNotices: false });
        } catch (err) {
            setError(err.message || 'Gagal memblokir perangkat.');
        } finally {
            setSubmittingBlock(false);
        }
    };

    const handleUnblockDevice = async (mac) => {
        if (!mac) return;
        try {
            setBlockingMac(mac);
            setError(null);
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/wifi/unblock-device', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({ mac_address: mac }),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal membuka blokir perangkat.');
            }
            setSuccessMessage(result.message || `Perangkat ${mac} berhasil dibuka blokirnya.`);
            await fetchDashboard({ silent: true, withNotices: false });
        } catch (err) {
            setError(err.message || 'Gagal membuka blokir perangkat.');
        } finally {
            setBlockingMac(null);
        }
    };

    const customer = data?.customer || {};
    const invoices = data?.invoices || [];
    const openInvoices = data?.open_invoices || [];
    const paymentMethods = data?.payment_methods || [];
    const complaints = data?.complaints || [];
    const tickets = data?.tickets || complaints;
    const paymentHistory = data?.payment_history || invoices.filter((invoice) => invoice.status === 'paid');
    const paymentHistoryPerPage = 5;
    const totalPaymentHistory = paymentHistory.length;
    const totalPaymentHistoryPages = Math.ceil(totalPaymentHistory / paymentHistoryPerPage) || 1;
    const paginatedPaymentHistory = useMemo(() => {
        const start = (paymentHistoryPage - 1) * paymentHistoryPerPage;
        return paymentHistory.slice(start, start + paymentHistoryPerPage);
    }, [paymentHistory, paymentHistoryPage]);
    const accountSummary = data?.account_summary || {};
    const connection = data?.connection || {};
    const usage = data?.usage || {};
    const household = data?.household || {};
    const billing = data?.billing || {};
    const portalMeta = data?.portal_meta || {};
    const portalSummary = portalMeta.summary || {};
    const genieAcsPortal = data?.genieacs_portal || {};
    const wifiData = data?.wifi || genieAcsPortal.wifi || {};
    const capacityData = data?.capacity || genieAcsPortal.capacity || {};
    const packageInfo = data?.package_info || genieAcsPortal.package_info || {};
    const connectedHosts = Array.isArray(wifiData.connected_hosts) ? wifiData.connected_hosts : [];
    const blockedDevices = Array.isArray(wifiData.blocked_devices) ? wifiData.blocked_devices : [];
    const blockedMacSet = useMemo(() => new Set(blockedDevices.map((b) => (b.mac_address || '').toUpperCase())), [blockedDevices]);

    useEffect(() => {
        if (wifiData.ssid && !wifiChangeForm.ssid) {
            setWifiChangeForm((prev) => ({ ...prev, ssid: wifiData.ssid }));
        }
    }, [wifiData.ssid]);
    const connectionStatus = getConnectionStatusConfig(connection.status);
    const connectionStatusTone = connection.status === 'online'
        ? 'green'
        : connection.status === 'offline'
            ? 'red'
            : connection.status === 'unknown'
                ? 'slate'
                : 'amber';
    const dueDateCopy = getDueDateCopy(accountSummary.days_until_due);
    const latestInvoice = invoices[0];
    const latestInvoiceStatus = latestInvoice
        ? getInvoiceStatusConfig(latestInvoice.status)
        : getInvoiceStatusConfig('unpaid');
    const LatestInvoiceIcon = latestInvoiceStatus.icon;
    const mustChangePassword = Boolean(data?.must_change_password || customer.must_change_password);
    const customerId = customer.id || null;
    const autoBillingEnabled = !autoMessageDisabled;
    const hasOpenInvoices = Boolean(billing.has_open_invoices ?? openInvoices.length > 0);
    const statusAvailable = Boolean(connection.status_available);
    const connectedDeviceCount = household.home_device_count_available
        ? household.home_device_count
        : null;
    const connectedWifiSsids = Array.isArray(household.connected_wifi_ssids)
        ? household.connected_wifi_ssids
        : [];
    const wifiManagementAvailable = Boolean(portalSummary.wifi_management_available);
    const wifiManagementNote = portalSummary.router_monitoring_note || household.home_device_note || null;
    const wifiLinkPortal = data?.wifi_link_portal || {};
    const wifiSettingLinks = Array.isArray(wifiLinkPortal.links) ? wifiLinkPortal.links : [];
    const wifiLinkIpAllowed = Boolean(wifiLinkPortal.ip_allowed);
    const wifiLinkMessage = wifiLinkPortal.message || 'Gunakan internet dari WiFi rumah Anda untuk membuka fitur ini.';
    const lastSeenAt = connection.last_seen_available
        ? (connection.last_inform_at || connection.home_router?.last_inform_at || null)
        : null;
    const deviceModel = connection.product_class || connection.home_router?.product_class || connection.router_identity || null;
    const deviceSerial = connection.serial_number || connection.home_router?.serial_number || null;
    const uptimeLabel = connection.uptime_label || connection.session?.uptime_label || connection.home_router?.wan_uptime_label || null;
    const hasConnectedDeviceCount = connectedDeviceCount !== null && connectedDeviceCount !== undefined;
    const showConnectedWifiSection = connectedWifiSsids.length > 0;
    const showUsageTrafficSection = Boolean(
        usage.cards_available
        || hasConnectedDeviceCount
        || showConnectedWifiSection
        || lastSeenAt
        || deviceModel
        || deviceSerial
        || uptimeLabel
        || connection.pppoe_username
    );

    useEffect(() => {
        if (!hasOpenInvoices) {
            setShowPaymentConfirmationForm(false);
            setPaymentForm({ invoice_id: '', paid_amount: '', bukti_pembayaran: null });
            return;
        }

        if (!paymentForm.invoice_id && openInvoices.length === 1) {
            setPaymentForm((prev) => ({
                ...prev,
                invoice_id: String(openInvoices[0].id),
            }));
        }
    }, [hasOpenInvoices, openInvoices, paymentForm.invoice_id]);

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 overflow-x-hidden">
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

            <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 min-w-0">
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

                {mustChangePassword && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                        <p className="font-semibold">Pengingat keamanan akun</p>
                        <p className="mt-1 text-sm">
                            Password akun portal Anda masih memakai sandi awal atau sandi lama. Segera perbarui demi keamanan yang lebih baik.
                        </p>
                    </div>
                )}

                <nav className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">
                    {[
                        ['#ringkasan', 'Ringkasan'],
                        ['#perangkat-rumah', 'Perangkat & WiFi'],
                        ['#tagihan', 'Tagihan'],
                        ['#histori-pembayaran', 'Histori Pembayaran'],
                        ['#tiket-saya', 'Tiket Saya'],
                        ['#gangguan', 'Gangguan'],
                        ['#ubah-password', 'Keamanan'],
                    ].filter(Boolean).map(([href, label]) => (
                        <a key={href} href={href} className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-orange-50 hover:text-orange-700">
                            {label}
                        </a>
                    ))}
                </nav>

                {networkNotices.length > 0 && (
                    <section id="gangguan" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-lg">
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
                                    <button
                                        type="button"
                                        onClick={() => handleDismissNotice(notice.id)}
                                        disabled={dismissingNoticeId === notice.id}
                                        className="mt-3 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:bg-white disabled:opacity-60"
                                    >
                                        {dismissingNoticeId === notice.id ? 'Menyimpan...' : 'Tandai dibaca'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section id="ringkasan" className="scroll-mt-24 overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-xl shadow-orange-500/20">
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
                                        Lihat informasi penting rumah Anda dengan lebih ringkas: koneksi internet, perangkat yang terhubung, tagihan, dan bantuan layanan.
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

                            <div className="mt-6 flex flex-wrap gap-2">
                                {(connection.pppoe_username || customer.user_pppoe) && (
                                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                        ID Internet: {connection.pppoe_username || customer.user_pppoe}
                                    </span>
                                )}
                                {customer.paket && (
                                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                        Paket: {customer.paket}
                                    </span>
                                )}
                                {accountSummary.due_date && (
                                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                        Jatuh tempo: {formatDate(accountSummary.due_date)}
                                    </span>
                                )}
                                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                                    Dicek: {formatDateTime(portalMeta.refreshed_at || connection.last_checked_at)}
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                            {statusAvailable && (
                                <SummaryCard
                                    icon={Wifi}
                                    tone={connectionStatusTone}
                                    label="Status Internet"
                                    value={connection.status_label}
                                    helper={connection.status_note || connectionStatus.helper}
                                />
                            )}
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
                            {hasConnectedDeviceCount && (
                                <SummaryCard
                                    icon={Wifi}
                                    tone="green"
                                    label="Perangkat Terhubung"
                                    value={String(connectedDeviceCount)}
                                    helper={wifiManagementNote}
                                />
                            )}
                            {lastSeenAt && (
                                <SummaryCard
                                    icon={Clock}
                                    tone="blue"
                                    label="Update Terakhir"
                                    value={formatDateTime(lastSeenAt)}
                                    helper="Pembaruan terakhir dari perangkat rumah"
                                />
                            )}
                        </div>
                    </div>
                </section>

                {/* GENIEACS ROUTER, WIFI & CONNECTED DEVICES PORTAL */}
                <section id="perangkat-rumah" className="scroll-mt-24 space-y-6">
                    {/* ACTION MESSAGE BANNER */}
                    {wifiActionSuccess && (
                        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-sm">
                            <div className="flex items-center gap-2.5">
                                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                <span className="text-sm font-medium">{wifiActionSuccess}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setWifiActionSuccess('')}
                                className="text-emerald-700 hover:text-emerald-900 font-bold text-xs ml-2"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {wifiActionError && (
                        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 shadow-sm">
                            <div className="flex items-center gap-2.5">
                                <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                                <span className="text-sm font-medium">{wifiActionError}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setWifiActionError('')}
                                className="text-rose-700 hover:text-rose-900 font-bold text-xs ml-2"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* 1. WIFI & KATA SANDI CARD */}
                    <div className="rounded-3xl bg-white p-6 shadow-lg space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                                    <Wifi size={22} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Pengaturan WiFi & Sandi</h3>
                                    <p className="text-xs text-gray-500">Informasi nama WiFi dan kata sandi router rumah Anda</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                        !wifiData.has_router
                                            ? 'bg-amber-100 text-amber-700'
                                            : wifiData.is_online
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-rose-100 text-rose-700'
                                    }`}
                                >
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            !wifiData.has_router ? 'bg-amber-500' : wifiData.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                                        }`}
                                    />
                                    {!wifiData.has_router ? 'Router Belum Tertaut' : wifiData.is_online ? 'Router Online' : 'Router Offline'}
                                </span>

                                {wifiData.has_router && (
                                    <button
                                        type="button"
                                        onClick={() => setShowChangeWifiModal((p) => !p)}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                                    >
                                        <Lock size={14} />
                                        {showChangeWifiModal ? 'Tutup Form' : 'Ganti Sandi WiFi'}
                                        {showChangeWifiModal ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* WIFI CREDENTIALS BOX */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                            {/* SSID */}
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
                                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                                    <Wifi size={14} className="text-emerald-600" />
                                    Nama Jaringan WiFi (SSID):
                                </p>
                                <p className="text-base font-bold text-gray-900 mt-1 font-mono break-all">
                                    {wifiData.ssid || 'Rumah Kita Net WiFi'}
                                </p>
                            </div>

                            {/* Password */}
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
                                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                                    <Lock size={14} className="text-emerald-600" />
                                    Kata Sandi WiFi Saat Ini:
                                </p>
                                {wifiData.password ? (
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="font-mono text-base font-bold text-emerald-700 tracking-wider select-all">
                                            {showCurrentWifiPassword ? wifiData.password : '••••••••••••'}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentWifiPassword((p) => !p)}
                                                className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-2xs"
                                                title={showCurrentWifiPassword ? 'Sembunyikan' : 'Lihat kata sandi'}
                                            >
                                                {showCurrentWifiPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(wifiData.password);
                                                    setCopiedCurrentWifiPassword(true);
                                                    setTimeout(() => setCopiedCurrentWifiPassword(false), 2000);
                                                }}
                                                className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition flex items-center gap-1 text-xs shadow-2xs"
                                                title="Salin kata sandi"
                                            >
                                                {copiedCurrentWifiPassword ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                                <span>{copiedCurrentWifiPassword ? 'Tersalin' : 'Salin'}</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-amber-700 mt-1">
                                        Kata sandi terenkripsi internal router. Gunakan tombol <strong>Ganti Sandi WiFi</strong> untuk memperbarui.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* COLLAPSIBLE GANTI PASSWORD FORM */}
                        {showChangeWifiModal && (
                            <form onSubmit={handleSaveWifiCredentials} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-4 transition-all">
                                <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                                    <Lock size={16} className="text-emerald-600" />
                                    Formulir Penggantian Kata Sandi & Nama WiFi
                                </h4>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            Nama SSID WiFi (Opsional)
                                        </label>
                                        <input
                                            type="text"
                                            value={wifiChangeForm.ssid}
                                            onChange={(e) => setWifiChangeForm((p) => ({ ...p, ssid: e.target.value }))}
                                            placeholder="Nama WiFi..."
                                            className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            Kata Sandi Baru (Min. 8 Karakter) <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showNewWifiPassword ? 'text' : 'password'}
                                                value={wifiChangeForm.password}
                                                onChange={(e) => setWifiChangeForm((p) => ({ ...p, password: e.target.value }))}
                                                placeholder="Minimal 8 karakter..."
                                                required
                                                className="w-full rounded-xl border border-gray-300 bg-white pr-10 p-2.5 font-mono text-gray-900 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewWifiPassword((p) => !p)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                                            >
                                                {showNewWifiPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                        <Clock size={14} className="text-emerald-600" />
                                        <span>Estimasi proses pembaruan router: 2 - 3 Menit</span>
                                    </p>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowChangeWifiModal(false)}
                                            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                        >
                                            Batal
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingWifiChange}
                                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {savingWifiChange ? (
                                                <>
                                                    <RefreshCw size={13} className="animate-spin" />
                                                    Menerapkan ke Router...
                                                </>
                                            ) : (
                                                'Simpan Sandi Baru'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* 2. STATUS KAPASITAS & PAKET INTERNET CARD */}
                    <div className="rounded-3xl bg-white p-6 shadow-lg space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                                    <Shield size={22} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Kapasitas & Layanan Paket</h3>
                                    <p className="text-xs text-gray-500">Status penggunaan perangkat dan batas kuota langganan</p>
                                </div>
                            </div>

                            <span
                                className={`rounded-full px-3 py-1 text-xs font-bold border ${
                                    capacityData.status === 'safe'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : capacityData.status === 'warning'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : capacityData.status === 'critical'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-gray-100 text-gray-700 border-gray-200'
                                }`}
                            >
                                {capacityData.label || 'Kapasitas Aman'}
                            </span>
                        </div>

                        {/* 4 STATS GRID */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3.5">
                                <p className="text-[11px] font-semibold text-gray-500">Perangkat Terhubung</p>
                                <p className="text-lg font-bold text-gray-900 mt-0.5">
                                    {capacityData.connected_count ?? connectedHosts.length} <span className="text-xs font-normal text-gray-500">Unit</span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3.5">
                                <p className="text-[11px] font-semibold text-gray-500">Batas Maksimal Paket</p>
                                <p className="text-lg font-bold text-emerald-600 mt-0.5">
                                    {capacityData.max_devices ? `${capacityData.max_devices} Perangkat` : (capacityData.max_devices_label || 'Tanpa Batas')}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3.5">
                                <p className="text-[11px] font-semibold text-gray-500">Kecepatan Paket</p>
                                <p className="text-lg font-bold text-cyan-600 mt-0.5">
                                    {packageInfo.speed || customer.paket || '20 Mbps'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3.5">
                                <p className="text-[11px] font-semibold text-gray-500">Status Langganan</p>
                                <p className="text-lg font-bold text-emerald-600 mt-0.5">
                                    {packageInfo.active_status || 'Aktif'}
                                </p>
                            </div>
                        </div>

                        {/* EXPLANATION ALERT */}
                        {capacityData.status === 'safe' && (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                <span>Perangkat yang terhubung saat ini sesuai dengan kapasitas paket langganan Anda.</span>
                            </div>
                        )}
                        {capacityData.status === 'warning' && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                                <span>Jumlah perangkat terhubung melebihi kuota 1 unit. Pertimbangkan untuk upgrade paket jika koneksi melambat.</span>
                            </div>
                        )}
                        {capacityData.status === 'critical' && (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center gap-2">
                                <ShieldAlert size={16} className="text-rose-600 shrink-0" />
                                <span>Jumlah perangkat terhubung melebihi batas kuota paket (+{capacityData.diff} perangkat). Blokir perangkat yang tidak dikenal di bawah ini.</span>
                            </div>
                        )}
                    </div>

                    {/* 3. DAFTAR PERANGKAT TERHUBUNG & FITUR BLOKIR */}
                    <div className="rounded-3xl bg-white p-6 shadow-lg space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                                    <Smartphone size={22} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Daftar Perangkat Terhubung</h3>
                                    <p className="text-xs text-gray-500">HP, Laptop, atau Smart TV yang menggunakan WiFi Anda</p>
                                </div>
                            </div>

                            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 border border-purple-200">
                                {connectedHosts.length} Perangkat
                            </span>
                        </div>

                        {connectedHosts.length > 0 ? (
                            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 overflow-hidden">
                                {connectedHosts.map((h, idx) => {
                                    const isBlocked = blockedMacSet.has((h.mac_address || '').toUpperCase());
                                    const isLan = h.type?.toLowerCase().includes('lan');

                                    return (
                                        <div
                                            key={idx}
                                            className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs transition ${
                                                h.is_active ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`p-2.5 rounded-xl shrink-0 ${
                                                        h.is_active
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-gray-100 text-gray-500'
                                                    }`}
                                                >
                                                    {isLan ? <Laptop size={18} /> : <Smartphone size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-gray-900 text-sm truncate">
                                                            {h.name || `Perangkat ${idx + 1}`}
                                                        </p>
                                                        {h.is_active && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                Aktif
                                                            </span>
                                                        )}
                                                        {isBlocked && (
                                                            <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                                                                Diblokir
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-mono text-gray-500 mt-1">
                                                        IP: <strong className="text-gray-700">{h.ip_address || '-'}</strong> · MAC:{' '}
                                                        <strong className="text-gray-700">{h.mac_address || '-'}</strong>
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                                <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                                                    {h.type || 'WiFi'}
                                                </span>

                                                {h.mac_address && !isBlocked && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setBlockModalTarget(h)}
                                                        disabled={blockingMac === h.mac_address}
                                                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs transition flex items-center gap-1.5"
                                                    >
                                                        <Ban size={13} />
                                                        Blokir
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-xs text-gray-500 bg-gray-50 space-y-1">
                                <Smartphone size={28} className="mx-auto text-gray-400 mb-2" />
                                <p className="font-semibold text-gray-700">Belum ada rincian perangkat terhubung yang dilaporkan router.</p>
                                <p className="text-[11px]">Perangkat Anda akan muncul otomatis saat aktif tersambung ke jaringan WiFi rumah.</p>
                            </div>
                        )}

                        {/* BLOCKED DEVICES LIST */}
                        {blockedDevices.length > 0 && (
                            <div className="pt-3 border-t border-gray-100 space-y-2">
                                <h4 className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                                    <Ban size={14} />
                                    Perangkat yang Sedang Diblokir ({blockedDevices.length}):
                                </h4>
                                <div className="rounded-2xl border border-rose-200 bg-rose-50/50 divide-y divide-rose-100 overflow-hidden">
                                    {blockedDevices.map((b, bIdx) => (
                                        <div key={bIdx} className="p-3.5 flex items-center justify-between text-xs">
                                            <div>
                                                <p className="font-mono font-bold text-rose-900">{b.mac_address}</p>
                                                <p className="text-[11px] text-gray-500">{b.reason || 'Diblokir oleh pemilik WiFi'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUnblockDevice(b.mac_address)}
                                                disabled={blockingMac === b.mac_address}
                                                className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold text-xs transition shadow-2xs"
                                            >
                                                {blockingMac === b.mac_address ? 'Membuka...' : 'Buka Blokir'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* TRAFFIC ACTIVITY CARD */}
                    {(usage.download_bytes !== null || usage.upload_bytes !== null || usage.total_bytes !== null) && (
                        <div className="rounded-3xl bg-white p-6 shadow-lg">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    Aktivitas Penggunaan
                                </p>
                                <h3 className="mt-2 text-xl font-bold text-gray-900">Pemakaian Kuota & Trafik Internet</h3>
                            </div>

                            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                                {usage.download_bytes !== null && (
                                    <SummaryCard
                                        icon={Download}
                                        tone="blue"
                                        label="Download"
                                        value={usage.download_label || formatBytes(usage.download_bytes)}
                                        helper="Pemakaian download dari router rumah"
                                    />
                                )}
                                {usage.upload_bytes !== null && (
                                    <SummaryCard
                                        icon={Upload}
                                        tone="orange"
                                        label="Upload"
                                        value={usage.upload_label || formatBytes(usage.upload_bytes)}
                                        helper="Pemakaian upload dari router rumah"
                                    />
                                )}
                                {usage.total_bytes !== null && (
                                    <SummaryCard
                                        icon={Activity}
                                        tone="green"
                                        label="Total Traffic"
                                        value={usage.total_label || formatBytes(usage.total_bytes)}
                                        helper="Akumulasi trafik dari router rumah"
                                    />
                                )}
                            </div>
                        </div>
                    )}
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

                <section id="histori-pembayaran" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-lg">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <CreditCard size={20} className="text-orange-500" />
                            <h2 className="text-lg font-bold text-gray-900">
                                Riwayat Pembayaran
                            </h2>
                            {totalPaymentHistory > 0 && (
                                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                                    {totalPaymentHistory} Data
                                </span>
                            )}
                        </div>
                        {totalPaymentHistoryPages > 1 && (
                            <p className="text-xs text-gray-500">
                                Halaman <span className="font-bold text-gray-700">{paymentHistoryPage}</span> dari {totalPaymentHistoryPages}
                            </p>
                        )}
                    </div>

                    {totalPaymentHistory > 0 ? (
                        <>
                            <div className="space-y-3">
                                {paginatedPaymentHistory.map((invoice) => {
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

                            {/* Pagination Controls */}
                            {totalPaymentHistoryPages > 1 && (
                                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                                    <p className="text-xs text-gray-500">
                                        Menampilkan <span className="font-semibold text-gray-700">{((paymentHistoryPage - 1) * paymentHistoryPerPage) + 1}</span> - <span className="font-semibold text-gray-700">{Math.min(paymentHistoryPage * paymentHistoryPerPage, totalPaymentHistory)}</span> dari <span className="font-semibold text-gray-700">{totalPaymentHistory}</span> data
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentHistoryPage((p) => Math.max(1, p - 1))}
                                            disabled={paymentHistoryPage === 1}
                                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition"
                                        >
                                            <ChevronLeft size={14} />
                                            Sebelumnya
                                        </button>

                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: totalPaymentHistoryPages }, (_, idx) => idx + 1).map((page) => (
                                                <button
                                                    key={page}
                                                    type="button"
                                                    onClick={() => setPaymentHistoryPage(page)}
                                                    className={`h-8 w-8 rounded-xl text-xs font-bold transition ${
                                                        paymentHistoryPage === page
                                                            ? 'bg-orange-500 text-white shadow-xs'
                                                            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    {page}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setPaymentHistoryPage((p) => Math.min(totalPaymentHistoryPages, p + 1))}
                                            disabled={paymentHistoryPage === totalPaymentHistoryPages}
                                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition"
                                        >
                                            Berikutnya
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-12 text-center text-gray-500">
                            <CreditCard size={48} className="mx-auto mb-4 text-gray-300" />
                            <p>Belum ada riwayat pembayaran.</p>
                        </div>
                    )}
                </section>

                <section id="tagihan" className="scroll-mt-24 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl bg-white p-6 shadow-lg space-y-5">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Tagihan Aktif</p>
                            <h2 className="mt-2 text-2xl font-bold text-gray-900">Bayar & Konfirmasi Pembayaran</h2>
                        </div>

                        <div className="space-y-3">
                            {hasOpenInvoices ? openInvoices.map((invoice) => (
                                <div key={invoice.id} className="rounded-2xl border border-gray-200 p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="font-semibold text-gray-900">Invoice #{invoice.id}</p>
                                            <p className="mt-1 text-sm text-gray-600">Jatuh tempo: {formatDate(invoice.due_date)}</p>
                                        </div>
                                        <div className="text-left sm:text-right">
                                            <span className="text-sm font-semibold text-orange-600">Rp {formatPrice(invoice.amount || 0)}</span>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {invoice.invoice_link && (
                                            <a
                                                href={`/invoice/${invoice.invoice_link}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
                                            >
                                                <CreditCard size={16} />
                                                Bayar Invoice
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowPaymentConfirmationForm((prev) => !prev);
                                                setPaymentForm((prev) => ({
                                                    ...prev,
                                                    invoice_id: prev.invoice_id || String(invoice.id),
                                                }));
                                            }}
                                            className="inline-flex items-center gap-2 rounded-lg border border-orange-200 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
                                        >
                                            <Send size={15} />
                                            Saya sudah bayar
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                                    Saat ini tidak ada tagihan yang perlu dibayar.
                                </div>
                            )}
                        </div>

                        {hasOpenInvoices && (
                            <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-gray-900">Konfirmasi Pembayaran</h3>
                                        <p className="mt-1 text-sm text-gray-600">
                                            Kirim bukti pembayaran setelah Anda menyelesaikan transfer atau pembayaran invoice.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentConfirmationForm((prev) => !prev)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
                                    >
                                        <ChevronUp size={15} className={showPaymentConfirmationForm ? '' : 'rotate-180'} />
                                        {showPaymentConfirmationForm ? 'Tutup Form' : 'Buka Form'}
                                    </button>
                                </div>

                                {showPaymentConfirmationForm && (
                                    <form onSubmit={handlePaymentConfirm} className="mt-4 space-y-3">
                                        <select
                                            required
                                            value={paymentForm.invoice_id}
                                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, invoice_id: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                        >
                                            <option value="">Pilih invoice</option>
                                            {openInvoices.map((invoice) => (
                                                <option key={invoice.id} value={invoice.id}>
                                                    #{invoice.id} - Rp {formatPrice(invoice.amount || 0)}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            min="1"
                                            value={paymentForm.paid_amount}
                                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_amount: e.target.value }))}
                                            placeholder="Nominal dibayar (opsional)"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                        />
                                        <label className="block rounded-xl border border-dashed border-orange-300 bg-white px-4 py-4 text-sm text-gray-600">
                                            <span className="mb-2 flex items-center gap-2 font-medium text-gray-800">
                                                <Upload size={16} className="text-orange-500" />
                                                Upload bukti pembayaran
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                onChange={(e) => setPaymentForm((prev) => ({ ...prev, bukti_pembayaran: e.target.files?.[0] || null }))}
                                                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-3 file:py-2 file:font-medium file:text-white hover:file:bg-orange-600"
                                            />
                                            <span className="mt-2 block text-xs text-gray-500">
                                                {paymentForm.bukti_pembayaran?.name || 'Belum ada file yang dipilih'}
                                            </span>
                                        </label>
                                        <button
                                            type="submit"
                                            disabled={submittingPayment}
                                            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60"
                                        >
                                            <Upload size={16} />
                                            {submittingPayment ? 'Mengirim...' : 'Kirim Konfirmasi'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}

                        {paymentMethods.length > 0 && (
                            <div className="rounded-2xl border border-gray-200 p-4">
                                <p className="text-sm font-semibold text-gray-900">Metode Pembayaran Aktif</p>
                                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                                    {paymentMethods.slice(0, 5).map((method) => (
                                        <li key={method.id}>{method.name} {method.account_number ? `- ${method.account_number}` : ''}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div id="ubah-password" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-lg space-y-5">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Profil & Keamanan</p>
                            <h2 className="mt-2 text-2xl font-bold text-gray-900">Pengaturan Akun dan WiFi Rumah</h2>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                            <form onSubmit={handleProfileUpdate} className="rounded-2xl border border-gray-200 p-4 space-y-3">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Ubah Nomor Telepon</h3>
                                    <p className="mt-1 text-sm text-gray-600">Perbarui nomor yang dipakai untuk komunikasi layanan.</p>
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={profileForm.phone}
                                    onChange={(e) => setProfileForm({ phone: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                    placeholder="Nomor telepon"
                                />
                                <button type="submit" disabled={submittingProfile} className="rounded-lg bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60">
                                    {submittingProfile ? 'Menyimpan...' : 'Simpan Nomor'}
                                </button>
                            </form>

                            <form onSubmit={handlePasswordUpdate} className="rounded-2xl border border-gray-200 p-4 space-y-3">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Ubah Password Akun Portal</h3>
                                    <p className="mt-1 text-sm text-gray-600">Password ini dipakai untuk login ke portal pelanggan Rumah Kita Net.</p>
                                </div>
                                <PasswordField
                                    value={passwordForm.current_password}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))}
                                    placeholder="Password akun saat ini"
                                    visible={passwordVisibility.current_password}
                                    onToggle={() => togglePasswordVisibility('current_password')}
                                />
                                <PasswordField
                                    value={passwordForm.new_password}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
                                    placeholder="Password akun baru"
                                    visible={passwordVisibility.new_password}
                                    onToggle={() => togglePasswordVisibility('new_password')}
                                />
                                <PasswordField
                                    value={passwordForm.new_password_confirmation}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password_confirmation: e.target.value }))}
                                    placeholder="Konfirmasi password akun baru"
                                    visible={passwordVisibility.new_password_confirmation}
                                    onToggle={() => togglePasswordVisibility('new_password_confirmation')}
                                />
                                <button type="submit" disabled={submittingPassword} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60">
                                    <Lock size={16} />
                                    {submittingPassword ? 'Menyimpan...' : 'Simpan Password'}
                                </button>
                            </form>
                        </div>

	                        <div className="rounded-2xl border border-gray-200 p-4 space-y-4">
	                            <div>
	                                <h3 className="font-semibold text-gray-900">Ubah Password WiFi Rumah</h3>
	                                <p className="mt-1 text-sm text-gray-600">
	                                    Pilih link pengaturan WiFi yang tersedia. Link hanya aktif jika Anda membuka portal dari internet WiFi rumah.
	                                </p>
	                            </div>

	                            <div className={`rounded-xl border px-3 py-3 text-sm ${wifiLinkIpAllowed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
	                                <p className="font-semibold">{wifiLinkIpAllowed ? 'Akses valid dari WiFi rumah' : 'Akses perlu dari WiFi rumah'}</p>
	                                <p className="mt-1">{wifiLinkMessage}</p>
	                                {wifiLinkPortal.client_ip && (
	                                    <p className="mt-2 text-xs opacity-80">IP terdeteksi: {wifiLinkPortal.client_ip}</p>
	                                )}
	                            </div>

	                            {wifiSettingLinks.length === 0 ? (
	                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
	                                    Fitur ubah password WiFi belum dikonfigurasi.
	                                </div>
	                            ) : (
	                                <div className="grid gap-3 sm:grid-cols-2">
	                                    {wifiSettingLinks.map((link) => (
	                                        <div key={link.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
	                                            <div className="flex items-start gap-3">
	                                                <div className="rounded-xl bg-white p-2 text-orange-600 shadow-sm">
	                                                    <Wifi size={18} />
	                                                </div>
	                                                <div className="min-w-0 flex-1">
	                                                    <p className="font-semibold text-gray-900">{link.title}</p>
	                                                    {link.description && <p className="mt-1 text-sm text-gray-600">{link.description}</p>}
	                                                    {wifiLinkIpAllowed ? (
	                                                        <a
	                                                            href={link.url}
	                                                            target="_blank"
	                                                            rel="noreferrer"
	                                                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
	                                                        >
	                                                            Buka Link
	                                                            <ExternalLink size={15} />
	                                                        </a>
	                                                    ) : (
	                                                        <button
	                                                            type="button"
	                                                            disabled
	                                                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500"
	                                                        >
	                                                            Buka dari WiFi Rumah
	                                                        </button>
	                                                    )}
	                                                </div>
	                                            </div>
	                                        </div>
	                                    ))}
	                                </div>
	                            )}
	                        </div>

                        <div className={`rounded-2xl border p-4 space-y-4 ${autoBillingEnabled ? 'border-green-200 bg-green-50/80' : 'border-red-200 bg-red-50/80'}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Preferensi Pesan Otomatis Billing</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Atur apakah Anda ingin menerima pengingat tagihan otomatis dari sistem.
                                    </p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${autoBillingEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {autoBillingEnabled ? 'Aktif' : 'Nonaktif'}
                                </span>
                            </div>

                            <div className={`rounded-xl border px-4 py-3 ${autoBillingEnabled ? 'border-green-200 bg-white/80' : 'border-red-200 bg-white/80'}`}>
                                <p className={`text-sm font-medium ${autoBillingEnabled ? 'text-green-800' : 'text-red-800'}`}>
                                    {autoBillingEnabled
                                        ? 'Pengingat tagihan otomatis sedang aktif untuk akun Anda.'
                                        : 'Pengingat tagihan rutin sedang nonaktif untuk akun Anda.'}
                                </p>
                                <p className="mt-2 text-xs text-gray-600">
                                    {autoBillingEnabled
                                        ? 'Anda akan menerima informasi tagihan dan pengingat pembayaran secara otomatis.'
                                        : 'Anda tidak akan menerima informasi tagihan rutin. Sistem hanya akan mengirim informasi isolir atau masa aktif habis.'}
                                </p>
                            </div>

                            <ul className="space-y-2 text-sm text-gray-700">
                                {autoBillingEnabled ? (
                                    <>
                                        <li>Anda menerima pengingat tagihan otomatis.</li>
                                        <li>Informasi pembayaran dikirim lebih konsisten.</li>
                                    </>
                                ) : (
                                    <>
                                        <li>Anda tidak menerima informasi tagihan rutin.</li>
                                        <li>Anda hanya menerima informasi isolir.</li>
                                        <li>Anda hanya menerima informasi masa aktif habis.</li>
                                    </>
                                )}
                            </ul>

                            <div className="flex flex-wrap gap-3">
                                {autoBillingEnabled ? (
                                    <button
                                        type="button"
                                        disabled={savingAutoMessage}
                                        onClick={handleDisableAutoMessageRequest}
                                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                                    >
                                        <AlertCircle size={16} />
                                        {savingAutoMessage ? 'Menyimpan...' : 'Nonaktifkan Pengingat Tagihan'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={savingAutoMessage}
                                        onClick={handleEnableAutoMessage}
                                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
                                    >
                                        <CheckCircle size={16} />
                                        {savingAutoMessage ? 'Menyimpan...' : 'Aktifkan Pengingat Tagihan'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {showDisableAutoMessageModal && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6">
                        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                                    <AlertCircle size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-gray-900">Nonaktifkan pengingat tagihan?</h3>
                                    <p className="mt-2 text-sm text-gray-600">
                                        Jika dinonaktifkan, Anda tidak akan menerima pengingat tagihan otomatis dari sistem.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                                <p className="text-sm font-semibold text-red-800">Risiko jika dinonaktifkan</p>
                                <ul className="mt-3 space-y-2 text-sm text-red-900">
                                    <li>Pelanggan tidak menerima informasi tagihan.</li>
                                    <li>Pelanggan hanya menerima informasi isolir.</li>
                                    <li>Pelanggan hanya menerima informasi masa aktif habis.</li>
                                </ul>
                            </div>

                            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowDisableAutoMessageModal(false)}
                                    disabled={savingAutoMessage}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmDisableAutoMessage}
                                    disabled={savingAutoMessage}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                                >
                                    <AlertCircle size={16} />
                                    {savingAutoMessage ? 'Menyimpan...' : 'Tetap Nonaktifkan'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL KONFIRMASI BLOKIR PERANGKAT */}
                {blockModalTarget && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6">
                        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                                    <Ban size={22} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-gray-900">Blokir Perangkat WiFi?</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Perangkat dengan MAC Address ini akan diputus dan dilarang terhubung kembali ke router WiFi rumah Anda.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Nama Perangkat:</span>
                                    <span className="font-bold text-gray-900">{blockModalTarget.name || 'Perangkat Tanpa Nama'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">MAC Address:</span>
                                    <span className="font-mono font-bold text-rose-700">{blockModalTarget.mac_address}</span>
                                </div>
                                {blockModalTarget.ip_address && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 font-medium">IP Address:</span>
                                        <span className="font-mono text-gray-700">{blockModalTarget.ip_address}</span>
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleConfirmBlockDevice} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Alasan Pemblokiran (Opsional)
                                    </label>
                                    <input
                                        type="text"
                                        value={blockReason}
                                        onChange={(e) => setBlockReason(e.target.value)}
                                        placeholder="Contoh: Perangkat tidak dikenal / HP tetangga"
                                        className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-xs text-gray-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                                    />
                                </div>

                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBlockModalTarget(null);
                                            setBlockReason('');
                                        }}
                                        disabled={submittingBlock}
                                        className="rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submittingBlock}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-60"
                                    >
                                        <Ban size={14} />
                                        {submittingBlock ? 'Memproses Blokir...' : 'Ya, Blokir Sekarang'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <section id="tiket-saya" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-lg">
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

                    {tickets.length > 0 ? (
                        <div className="space-y-3">
                            {tickets.map((complaint) => {
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

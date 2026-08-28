import { useEffect, useRef, useState } from 'react';
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
    Home,
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
    const [wifiPasswordForm, setWifiPasswordForm] = useState({
        password: '',
        password_confirmation: '',
    });
    const [wifiPanel, setWifiPanel] = useState({
        checking: false,
        submitting: false,
        device: null,
        verification: null,
        visibleNewPasswordFields: {},
        lookupError: null,
    });
    const [autoMessageDisabled, setAutoMessageDisabled] = useState(false);
    const [showDisableAutoMessageModal, setShowDisableAutoMessageModal] = useState(false);
    const [submittingProfile, setSubmittingProfile] = useState(false);
    const [submittingPassword, setSubmittingPassword] = useState(false);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [savingAutoMessage, setSavingAutoMessage] = useState(false);
    const [dismissingNoticeId, setDismissingNoticeId] = useState(null);
    const wifiVerificationPollRef = useRef(null);
    const wifiVerificationStartedAtRef = useRef(null);
    const wifiAutoLoadCustomerIdRef = useRef(null);

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
            clearWifiVerificationPolling();
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

    function clearWifiVerificationPolling() {
        if (wifiVerificationPollRef.current) {
            clearInterval(wifiVerificationPollRef.current);
            wifiVerificationPollRef.current = null;
        }
        wifiVerificationStartedAtRef.current = null;
    }

    const handleWifiPasswordFieldChange = (field, value) => {
        clearWifiVerificationPolling();
        setWifiPanel((prev) => ({
            ...prev,
            verification: null,
        }));
        setWifiPasswordForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const toggleWifiNewPasswordFieldVisibility = (field) => {
        setWifiPanel((prev) => ({
            ...prev,
            visibleNewPasswordFields: {
                ...prev.visibleNewPasswordFields,
                [field]: !prev.visibleNewPasswordFields?.[field],
            },
        }));
    };

    const handleCheckWifiDevice = async ({ showGlobalError = true } = {}) => {
        if (showGlobalError) {
            setError(null);
        }

        try {
            setWifiPanel((prev) => ({
                ...prev,
                checking: true,
                device: prev.device,
                lookupError: null,
            }));
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/wifi/device', {
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Gagal mengecek perangkat WiFi rumah.');
            }

            setWifiPanel((prev) => ({
                ...prev,
                checking: false,
                device: result.data || null,
                lookupError: null,
            }));
        } catch (err) {
            const message = err.message || 'Gagal mengecek perangkat WiFi rumah.';

            setWifiPanel((prev) => ({
                ...prev,
                checking: false,
                lookupError: message,
            }));

            if (showGlobalError) {
                setError(message);
            }
        }
    };

    const updateWifiVerificationState = (data, extra = {}) => {
        setWifiPanel((prev) => ({
            ...prev,
            verification: {
                ...(prev.verification || {}),
                id: data?.verification_id || prev.verification?.id || null,
                status: data?.status || prev.verification?.status || 'pending',
                message: data?.message || prev.verification?.message || 'Menunggu verifikasi perubahan sandi WiFi.',
                verified_ssid_count: data?.verified_ssid_count ?? prev.verification?.verified_ssid_count ?? 0,
                target_ssid_count: data?.target_ssid_count ?? prev.verification?.target_ssid_count ?? 0,
                ssids: data?.ssids || prev.verification?.ssids || [],
                polling: extra.polling ?? prev.verification?.polling ?? false,
                timedOut: extra.timedOut ?? prev.verification?.timedOut ?? false,
            },
        }));
    };

    const pollWifiPasswordVerification = async (verificationId) => {
        if (!verificationId) return;

        const startedAt = wifiVerificationStartedAtRef.current || Date.now();
        if (Date.now() - startedAt >= WIFI_PASSWORD_VERIFICATION_TIMEOUT_MS) {
            clearWifiVerificationPolling();
            updateWifiVerificationState({
                status: 'pending',
                message: 'Perubahan sandi sudah dikirim, tetapi hasilnya belum terverifikasi. Coba cek lagi beberapa saat lagi.',
            }, {
                polling: false,
                timedOut: true,
            });
            return;
        }

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch(`/api/customer/wifi/password-verifications/${verificationId}`, {
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Gagal mengecek status verifikasi password WiFi.');
            }

            const data = result.data || {};
            const isTerminal = WIFI_PASSWORD_VERIFICATION_TERMINAL_STATUSES.includes(data.status);

            updateWifiVerificationState(data, {
                polling: !isTerminal,
                timedOut: false,
            });

            if (isTerminal) {
                clearWifiVerificationPolling();
                if (data.status === 'verified') {
                    setWifiPasswordForm({
                        password: '',
                        password_confirmation: '',
                    });
                    setWifiPanel((prev) => ({
                        ...prev,
                        visibleNewPasswordFields: {},
                    }));
                }
            }
        } catch (err) {
            clearWifiVerificationPolling();
            updateWifiVerificationState({
                status: 'failed',
                message: err.message || 'Gagal mengecek status verifikasi password WiFi.',
            }, {
                polling: false,
                timedOut: false,
            });
        }
    };

    const startWifiVerificationPolling = (verificationId) => {
        clearWifiVerificationPolling();
        wifiVerificationStartedAtRef.current = Date.now();
        wifiVerificationPollRef.current = setInterval(() => {
            pollWifiPasswordVerification(verificationId);
        }, WIFI_PASSWORD_VERIFICATION_INTERVAL_MS);
        pollWifiPasswordVerification(verificationId);
    };

    const handleRetryWifiVerification = () => {
        const verificationId = wifiPanel.verification?.id;
        if (!verificationId) return;

        setWifiPanel((prev) => ({
            ...prev,
            verification: {
                ...(prev.verification || {}),
                status: 'pending',
                message: 'Memverifikasi ulang perubahan sandi WiFi.',
                polling: true,
                timedOut: false,
            },
        }));
        startWifiVerificationPolling(verificationId);
    };

    const handleWifiPasswordUpdate = async (event) => {
        event.preventDefault();
        setError(null);

        if (wifiPasswordForm.password.length < 8 || wifiPasswordForm.password.length > 63) {
            setError('Password WiFi harus 8 sampai 63 karakter.');
            return;
        }

        if (wifiPasswordForm.password !== wifiPasswordForm.password_confirmation) {
            setError('Konfirmasi password WiFi tidak cocok.');
            return;
        }

        try {
            setWifiPanel((prev) => ({
                ...prev,
                submitting: true,
                verification: {
                    id: null,
                    status: 'pending',
                    message: 'Mengirim perubahan sandi WiFi.',
                    verified_ssid_count: 0,
                    target_ssid_count: prev.device?.ssids?.length || 0,
                    ssids: [],
                    polling: true,
                    timedOut: false,
                },
            }));

            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/wifi/password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    password: wifiPasswordForm.password,
                    password_confirmation: wifiPasswordForm.password_confirmation,
                }),
            });
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Gagal mengubah password WiFi rumah.');
            }

            const verification = result.data || {};
            setWifiPanel((prev) => ({
                ...prev,
                submitting: false,
                verification: {
                    id: verification.verification_id || null,
                    status: verification.verification_status || 'pending',
                    message: 'Perubahan sandi dikirim. Sistem sedang memastikan sandi WiFi terbaru sudah aktif.',
                    verified_ssid_count: verification.verified_ssid_count || 0,
                    target_ssid_count: verification.target_ssid_count || 0,
                    ssids: verification.ssids || [],
                    polling: true,
                    timedOut: false,
                },
                visibleNewPasswordFields: {},
            }));

            setSuccessMessage(result.message || 'Task ubah password WiFi berhasil dikirim.');

            if (verification.verification_id) {
                startWifiVerificationPolling(verification.verification_id);
            }
        } catch (err) {
            setWifiPanel((prev) => ({
                ...prev,
                submitting: false,
                verification: {
                    ...(prev.verification || {}),
                    status: 'failed',
                    message: err.message || 'Gagal mengubah password WiFi rumah.',
                    polling: false,
                    timedOut: false,
                },
            }));
            setError(err.message || 'Gagal mengubah password WiFi rumah.');
        }
    };

    const getWifiVerificationPresentation = (verification) => {
        if (!verification) {
            return null;
        }

        if (verification.timedOut) {
            return {
                title: 'Belum terverifikasi',
                className: 'border-amber-200 bg-amber-50 text-amber-900',
                icon: <Clock size={17} className="text-amber-600" />,
            };
        }

        if (verification.status === 'verified') {
            return {
                title: 'Berhasil diverifikasi',
                className: 'border-green-200 bg-green-50 text-green-800',
                icon: <CheckCircle size={17} className="text-green-600" />,
            };
        }

        if (verification.status === 'partial') {
            return {
                title: 'Sebagian berhasil',
                className: 'border-amber-200 bg-amber-50 text-amber-900',
                icon: <Clock size={17} className="text-amber-600" />,
            };
        }

        if (verification.status === 'failed') {
            return {
                title: 'Verifikasi gagal',
                className: 'border-red-200 bg-red-50 text-red-800',
                icon: <XCircle size={17} className="text-red-600" />,
            };
        }

        return {
            title: verification.polling ? 'Memverifikasi perubahan' : 'Menunggu verifikasi',
            className: 'border-blue-200 bg-blue-50 text-blue-800',
            icon: verification.polling
                ? <RefreshCw size={17} className="animate-spin text-blue-600" />
                : <Clock size={17} className="text-blue-600" />,
        };
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

    const customer = data?.customer || {};
    const invoices = data?.invoices || [];
    const openInvoices = data?.open_invoices || [];
    const paymentMethods = data?.payment_methods || [];
    const complaints = data?.complaints || [];
    const tickets = data?.tickets || complaints;
    const paymentHistory = data?.payment_history || invoices.filter((invoice) => invoice.status === 'paid');
    const accountSummary = data?.account_summary || {};
    const connection = data?.connection || {};
    const usage = data?.usage || {};
    const household = data?.household || {};
    const billing = data?.billing || {};
    const portalMeta = data?.portal_meta || {};
    const portalSummary = portalMeta.summary || {};
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
    const wifiDeviceReady = Boolean(wifiPanel.device && Array.isArray(wifiPanel.device.ssids) && wifiPanel.device.ssids.length > 0);
    const wifiVerificationPresentation = getWifiVerificationPresentation(wifiPanel.verification);

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
                        showUsageTrafficSection ? ['#perangkat-rumah', 'Perangkat Rumah'] : null,
                        showConnectedWifiSection ? ['#wifi-rumah', 'Perangkat WiFi'] : null,
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

                {showUsageTrafficSection && (
                <section id="perangkat-rumah" className="scroll-mt-24 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                    <div className="rounded-3xl bg-white p-6 shadow-lg">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    Perangkat Rumah
                                </p>
                                <h2 className="mt-2 text-2xl font-bold text-gray-900">Informasi perangkat rumah</h2>
                            </div>
                            {statusAvailable && (
                                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${connectionStatus.badge}`}>
                                    {connection.status_label}
                                </span>
                            )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {(connection.pppoe_username || customer.user_pppoe) && (
                                <DetailCard
                                    icon={User}
                                    label="ID Internet"
                                    value={connection.pppoe_username || customer.user_pppoe}
                                    helper="ID layanan internet rumah Anda"
                                />
                            )}
                            {deviceModel && (
                                <DetailCard
                                    icon={Wifi}
                                    label="Perangkat Router"
                                    value={deviceModel}
                                    helper={deviceSerial || 'Model router rumah yang terbaca'}
                                />
                            )}
                            {lastSeenAt && (
                                <DetailCard
                                    icon={Clock}
                                    label="Update Perangkat Terakhir"
                                    value={formatDateTime(lastSeenAt)}
                                    helper="Pembaruan terakhir dari perangkat rumah"
                                />
                            )}
                            {uptimeLabel && (
                                <DetailCard
                                    icon={Activity}
                                    label="Uptime Koneksi"
                                    value={uptimeLabel}
                                    helper="Durasi koneksi internet rumah"
                                />
                            )}
                        </div>

                        {hasConnectedDeviceCount && (
                            <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                                            Perangkat Rumah
                                        </p>
                                        <h3 className="mt-1 text-lg font-bold text-gray-900">
                                            {connectedDeviceCount} perangkat terhubung
                                        </h3>
                                    </div>
                                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                                        Data perangkat tersedia
                                    </span>
                                </div>
                                {wifiManagementNote && <p className="mt-4 text-sm text-gray-700">{wifiManagementNote}</p>}
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl bg-white p-6 shadow-lg">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                Aktivitas Rumah
                            </p>
                            <h2 className="mt-2 text-2xl font-bold text-gray-900">Pemakaian internet dan perangkat</h2>
                            {(usage.note || wifiManagementNote) && (
                                <p className="mt-2 text-sm text-gray-600">{usage.note || wifiManagementNote}</p>
                            )}
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            {usage.download_bytes !== null && (
                                <SummaryCard
                                    icon={Download}
                                    tone="blue"
                                    label="Download"
                                    value={usage.download_label || formatBytes(usage.download_bytes)}
                                    helper="Pemakaian download dari perangkat rumah"
                                />
                            )}
                            {usage.upload_bytes !== null && (
                                <SummaryCard
                                    icon={Upload}
                                    tone="orange"
                                    label="Upload"
                                    value={usage.upload_label || formatBytes(usage.upload_bytes)}
                                    helper="Pemakaian upload dari perangkat rumah"
                                />
                            )}
                            {usage.total_bytes !== null && (
                                <SummaryCard
                                    icon={Activity}
                                    tone="green"
                                    label="Total Traffic"
                                    value={usage.total_label || formatBytes(usage.total_bytes)}
                                    helper="Akumulasi upload dan download yang terbaca dari perangkat rumah"
                                />
                            )}
                            {hasConnectedDeviceCount && (
                                <SummaryCard
                                    icon={Home}
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
                )}

                {showConnectedWifiSection && (
                    <section id="wifi-rumah" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-lg">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    Perangkat WiFi
                                </p>
                                <h2 className="mt-2 text-2xl font-bold text-gray-900">Perangkat WiFi Tersambung</h2>
                                <p className="mt-2 text-sm text-gray-600">
                                    Lihat perangkat yang sedang tersambung ke WiFi rumah Anda, dikelompokkan per nama WiFi.
                                </p>
                            </div>
                            {hasConnectedDeviceCount && (
                                <span className="rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700">
                                    {connectedDeviceCount} perangkat aktif
                                </span>
                            )}
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            {connectedWifiSsids.map((group, groupIndex) => (
                                <div key={`${group.ssid || 'ssid'}-${groupIndex}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">SSID</p>
                                            <h3 className="mt-1 text-lg font-bold text-gray-900">{group.ssid || `WiFi ${groupIndex + 1}`}</h3>
                                        </div>
                                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                                            {(group.devices || []).length} perangkat
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {(group.devices || []).map((device, deviceIndex) => (
                                            <div
                                                key={`${group.ssid || 'ssid'}-${device.mac_address || deviceIndex}`}
                                                className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold text-gray-900">{device.name || `Perangkat ${deviceIndex + 1}`}</p>
                                                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                                                            {device.ip_address && <span>IP: {device.ip_address}</span>}
                                                            {device.mac_address && <span>MAC: {String(device.mac_address).toUpperCase()}</span>}
                                                        </div>
                                                    </div>
                                                    {device.type && (
                                                        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                                                            {device.type}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

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
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                            <CreditCard size={20} className="text-orange-500" />
                            Riwayat Pembayaran
                        </h2>
                    </div>

                    {paymentHistory.length > 0 ? (
                        <div className="space-y-3">
                            {paymentHistory.map((invoice) => {
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

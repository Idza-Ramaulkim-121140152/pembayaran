import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    Bot,
    Building2,
    Calendar,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Download,
    ExternalLink,
    FileText,
    Plus,
    QrCode,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Sliders,
    Sparkles,
    Trash2,
    UploadCloud,
    User,
    UserCheck,
    Users,
    X,
    XCircle,
    ZoomIn,
    Phone,
    HelpCircle,
    CheckCircle,
    Eye,
    EyeOff,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import paymentVerificationService from '../../services/paymentVerificationService';

const emptyWhitelist = {
    qris: [],
    transfer_bank: [],
};

function createRecipient() {
    return {
        id: `recipient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        phone: '',
        is_active: true,
        receive_auto_approved: true,
        receive_needs_review: true,
    };
}

export default function PaymentVerificationPage() {
    const capabilities = window.appCapabilities || {};
    const canManage = Object.prototype.hasOwnProperty.call(capabilities, 'billing.payment_capture.manage')
        ? Boolean(capabilities['billing.payment_capture.manage'])
        : ['superadmin', 'admin'].includes(window.appUserRole || 'admin');

    const [activeTab, setActiveTab] = useState('needs_review'); // 'needs_review' | 'approved' | 'unmatched' | 'settings'
    const [config, setConfig] = useState(null);
    const [captures, setCaptures] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [datePreset, setDatePreset] = useState('all'); // 'all' | 'today' | 'last7' | 'thisMonth' | 'custom'
    const [currentPage, setCurrentPage] = useState(1);

    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showOpenAiKey, setShowOpenAiKey] = useState(false);

    // Whitelist raw JSON editor toggle
    const [showJsonWhitelist, setShowJsonWhitelist] = useState(false);
    const [whitelistText, setWhitelistText] = useState(JSON.stringify(emptyWhitelist, null, 2));

    // Modals
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadPreview, setUploadPreview] = useState(null);
    const [uploadCaption, setUploadCaption] = useState('');
    const [uploading, setUploading] = useState(false);

    // Zoom Image Modal
    const [previewImageUrl, setPreviewImageUrl] = useState(null);

    // Add/Edit Whitelist Bank Modal
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [editingBankIndex, setEditingBankIndex] = useState(null);
    const [bankForm, setBankForm] = useState({ name: '', account_number: '', bank_name: '', aliases: '', active: true });

    // Add/Edit Whitelist QRIS Modal
    const [isQrisModalOpen, setIsQrisModalOpen] = useState(false);
    const [editingQrisIndex, setEditingQrisIndex] = useState(null);
    const [qrisForm, setQrisForm] = useState({ name: '', merchant_id: '', aliases: '', active: true });

    // Selected candidate invoice per capture
    const [selectedCandidate, setSelectedCandidate] = useState({});

    // Manual Customer Assignment state
    const [customerSearchQueries, setCustomerSearchQueries] = useState({});
    const [customerSearchResults, setCustomerSearchResults] = useState({});
    const [isSearchingCustomer, setIsSearchingCustomer] = useState({});
    const [showCustomerSearch, setShowCustomerSearch] = useState({});

    // Load initial data
    const loadData = async (
        targetTab = activeTab,
        page = currentPage,
        search = searchQuery,
        startDate = fromDate,
        endDate = toDate
    ) => {
        try {
            setError('');
            setRefreshing(true);

            let statusParam = targetTab;
            if (targetTab === 'settings') {
                statusParam = 'all';
            }

            const [configResponse, capturesResponse] = await Promise.all([
                paymentVerificationService.getConfig(),
                paymentVerificationService.getCaptures({
                    status: statusParam,
                    page,
                    per_page: 20,
                    search: search.trim() || undefined,
                    from_date: startDate || undefined,
                    to_date: endDate || undefined,
                }),
            ]);

            const nextConfig = configResponse.data?.data || null;
            const capturePayload = capturesResponse.data?.data || {};

            setConfig(nextConfig);
            setWhitelistText(JSON.stringify(nextConfig?.destination_whitelist || emptyWhitelist, null, 2));
            setCaptures(capturePayload.data || []);
            setPagination(capturePayload);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memuat payment verification.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData(activeTab, 1, searchQuery, fromDate, toDate);
    }, [activeTab]);

    const handleSearch = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        loadData(activeTab, 1, searchQuery, fromDate, toDate);
    };

    const handleDatePresetChange = (preset) => {
        setDatePreset(preset);
        setCurrentPage(1);

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        let start = '';
        let end = '';

        if (preset === 'today') {
            start = todayStr;
            end = todayStr;
        } else if (preset === 'last7') {
            const past7 = new Date();
            past7.setDate(now.getDate() - 7);
            const pY = past7.getFullYear();
            const pM = String(past7.getMonth() + 1).padStart(2, '0');
            const pD = String(past7.getDate()).padStart(2, '0');
            start = `${pY}-${pM}-${pD}`;
            end = todayStr;
        } else if (preset === 'thisMonth') {
            start = `${yyyy}-${mm}-01`;
            end = todayStr;
        }

        setFromDate(start);
        setToDate(end);
        loadData(activeTab, 1, searchQuery, start, end);
    };

    const handlePageChange = (page) => {
        setCurrentPage(page);
        loadData(activeTab, page, searchQuery, fromDate, toDate);
    };

    // Save Configuration
    const handleSaveConfig = async (overrideConfig = null) => {
        if (!canManage) return;

        try {
            setSaving(true);
            setError('');
            setMessage('');

            let payload = overrideConfig || config;
            if (showJsonWhitelist) {
                try {
                    const parsedWhitelist = JSON.parse(whitelistText);
                    payload = {
                        ...payload,
                        destination_whitelist: parsedWhitelist,
                    };
                } catch (parseErr) {
                    setError('Format JSON Whitelist tidak valid.');
                    setSaving(false);
                    return;
                }
            }

            const response = await paymentVerificationService.updateConfig(payload);
            const savedData = response.data?.data || payload;
            setConfig(savedData);
            setWhitelistText(JSON.stringify(savedData.destination_whitelist || emptyWhitelist, null, 2));
            setMessage('Konfigurasi verifikasi pembayaran berhasil disimpan.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal menyimpan konfigurasi.');
        } finally {
            setSaving(false);
        }
    };

    // Resolve Capture (Approve / Reject)
    const handleResolve = async (captureId, decision, candidateInvoiceId = null) => {
        try {
            setRefreshing(true);
            setError('');
            setMessage('');

            const selectedInvId = candidateInvoiceId || selectedCandidate[captureId] || null;

            await paymentVerificationService.resolveCapture(captureId, {
                decision,
                candidate_invoice_id: selectedInvId,
            });

            setMessage(decision === 'approve' ? 'Pembayaran berhasil dikonfirmasi dan tagihan dilunaskan.' : 'Pembayaran ditolak.');
            await loadData(activeTab, currentPage, searchQuery, fromDate, toDate);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memproses verifikasi capture.');
        } finally {
            setRefreshing(false);
        }
    };

    // Re-analyze Capture
    const handleReanalyze = async (captureId) => {
        try {
            setRefreshing(true);
            setError('');
            setMessage('');
            const res = await paymentVerificationService.reanalyzeCapture(captureId);
            setMessage(res.data?.message || `Capture #${captureId} berhasil dianalisis ulang.`);
            await loadData(activeTab, currentPage, searchQuery, fromDate, toDate);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal menganalisis ulang bukti pembayaran.');
        } finally {
            setRefreshing(false);
        }
    };

    // Search Customer for Manual Assignment
    const handleSearchCustomer = async (captureId, query) => {
        setCustomerSearchQueries((prev) => ({ ...prev, [captureId]: query }));
        if (!query || query.trim().length < 2) {
            setCustomerSearchResults((prev) => ({ ...prev, [captureId]: [] }));
            return;
        }

        try {
            setIsSearchingCustomer((prev) => ({ ...prev, [captureId]: true }));
            const res = await paymentVerificationService.getCustomers({ search: query.trim(), per_page: 8 });
            const list = res.data?.data || res.data || [];
            setCustomerSearchResults((prev) => ({ ...prev, [captureId]: Array.isArray(list) ? list : (list.data || []) }));
        } catch (err) {
            console.error('Failed to search customers', err);
        } finally {
            setIsSearchingCustomer((prev) => ({ ...prev, [captureId]: false }));
        }
    };

    // Assign Customer Manually
    const handleAssignCustomer = async (captureId, customerId) => {
        try {
            setRefreshing(true);
            setError('');
            setMessage('');
            await paymentVerificationService.assignCustomer(captureId, customerId);
            setMessage(`Pelanggan berhasil ditautkan ke Capture #${captureId}.`);
            setShowCustomerSearch((prev) => ({ ...prev, [captureId]: false }));
            await loadData(activeTab, currentPage, searchQuery, fromDate, toDate);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menautkan pelanggan ke capture.');
        } finally {
            setRefreshing(false);
        }
    };

    // Manual Upload & Scan
    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!uploadFile) {
            setError('Pilih file bukti transfer terlebih dahulu.');
            return;
        }

        try {
            setUploading(true);
            setError('');
            setMessage('');

            const formData = new FormData();
            formData.append('file', uploadFile);
            if (uploadCaption.trim()) {
                formData.append('caption', uploadCaption.trim());
            }

            await paymentVerificationService.uploadAndAnalyze(formData);
            setMessage('Bukti pembayaran berhasil diunggah dan dianalisis AI.');
            setIsUploadModalOpen(false);
            setUploadFile(null);
            setUploadPreview(null);
            setUploadCaption('');

            setActiveTab('needs_review');
            await loadData('needs_review', 1, '', '', '');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal mengunggah dan menganalisis bukti pembayaran.');
        } finally {
            setUploading(false);
        }
    };

    // Whitelist Bank Handlers
    const handleSaveBank = () => {
        if (!bankForm.account_number.trim() || !bankForm.name.trim()) {
            setError('Nama pemilik rekening dan nomor rekening wajib diisi.');
            return;
        }

        const aliasList = bankForm.aliases
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        const newBankItem = {
            name: bankForm.name.trim(),
            bank_name: bankForm.bank_name.trim() || 'Bank Transfer',
            account_number: bankForm.account_number.trim(),
            aliases: aliasList,
            active: Boolean(bankForm.active),
        };

        const currentBanks = [...(config?.destination_whitelist?.transfer_bank || [])];
        if (editingBankIndex !== null) {
            currentBanks[editingBankIndex] = newBankItem;
        } else {
            currentBanks.push(newBankItem);
        }

        const nextConfig = {
            ...config,
            destination_whitelist: {
                ...(config?.destination_whitelist || emptyWhitelist),
                transfer_bank: currentBanks,
            },
        };

        setConfig(nextConfig);
        setIsBankModalOpen(false);
        setEditingBankIndex(null);
        handleSaveConfig(nextConfig);
    };

    const handleDeleteBank = (index) => {
        const currentBanks = [...(config?.destination_whitelist?.transfer_bank || [])].filter((_, i) => i !== index);
        const nextConfig = {
            ...config,
            destination_whitelist: {
                ...(config?.destination_whitelist || emptyWhitelist),
                transfer_bank: currentBanks,
            },
        };
        setConfig(nextConfig);
        handleSaveConfig(nextConfig);
    };

    // Whitelist QRIS Handlers
    const handleSaveQris = () => {
        if (!qrisForm.name.trim() || !qrisForm.merchant_id.trim()) {
            setError('Nama QRIS dan Merchant ID / NMID wajib diisi.');
            return;
        }

        const aliasList = qrisForm.aliases
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        const newQrisItem = {
            name: qrisForm.name.trim(),
            merchant_id: qrisForm.merchant_id.trim(),
            aliases: aliasList,
            active: Boolean(qrisForm.active),
        };

        const currentQris = [...(config?.destination_whitelist?.qris || [])];
        if (editingQrisIndex !== null) {
            currentQris[editingQrisIndex] = newQrisItem;
        } else {
            currentQris.push(newQrisItem);
        }

        const nextConfig = {
            ...config,
            destination_whitelist: {
                ...(config?.destination_whitelist || emptyWhitelist),
                qris: currentQris,
            },
        };

        setConfig(nextConfig);
        setIsQrisModalOpen(false);
        setEditingQrisIndex(null);
        handleSaveConfig(nextConfig);
    };

    const handleDeleteQris = (index) => {
        const currentQris = [...(config?.destination_whitelist?.qris || [])].filter((_, i) => i !== index);
        const nextConfig = {
            ...config,
            destination_whitelist: {
                ...(config?.destination_whitelist || emptyWhitelist),
                qris: currentQris,
            },
        };
        setConfig(nextConfig);
        handleSaveConfig(nextConfig);
    };

    // Recipients
    const recipients = config?.notification_recipients || [];

    const handleAddRecipient = () => {
        setConfig((prev) => ({
            ...prev,
            notification_recipients: [...(prev?.notification_recipients || []), createRecipient()],
        }));
    };

    const handleUpdateRecipient = (index, patch) => {
        setConfig((prev) => {
            const nextList = [...(prev?.notification_recipients || [])];
            nextList[index] = { ...nextList[index], ...patch };
            return { ...prev, notification_recipients: nextList };
        });
    };

    const handleDeleteRecipient = (index) => {
        setConfig((prev) => ({
            ...prev,
            notification_recipients: (prev?.notification_recipients || []).filter((_, i) => i !== index),
        }));
    };

    if (loading && !config) {
        return (
            <div className="flex min-h-[400px] items-center justify-center rounded-2xl bg-white p-12 text-center shadow-sm">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
                    <p className="text-sm font-medium text-gray-500">Memuat data Payment Verification AI...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 sm:text-3xl">
                        <ShieldCheck className="h-8 w-8 text-emerald-600" />
                        Payment Verification AI
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Verifikasi otomatis bukti transfer via WhatsApp & Web, pencocokan nomor WA pengirim ke data pelanggan, dan auto-pelunasan tagihan.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsUploadModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                    >
                        <UploadCloud size={17} />
                        + Upload & Scan Bukti Bayar
                    </button>
                    <button
                        type="button"
                        onClick={() => loadData(activeTab, currentPage, searchQuery, fromDate, toDate)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin text-emerald-600' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Alert Notifications */}
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

            {/* Tabs Navigation */}
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
                <button
                    type="button"
                    onClick={() => setActiveTab('needs_review')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeTab === 'needs_review'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-gray-200'
                    }`}
                >
                    <AlertTriangle size={16} />
                    Perlu Review Manual
                    {activeTab === 'needs_review' && pagination?.total > 0 && (
                        <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold text-white">
                            {pagination.total}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('approved')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeTab === 'approved'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-gray-200'
                    }`}
                >
                    <CheckCircle2 size={16} />
                    Terverifikasi (Lunas)
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('unmatched')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeTab === 'unmatched'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-gray-200'
                    }`}
                >
                    <XCircle size={16} />
                    Ditolak / Unmatched
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeTab === 'settings'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-gray-200'
                    }`}
                >
                    <Sliders size={16} />
                    Pengaturan Rekening & Notifikasi
                </button>
            </div>

            {/* TAB CONTENT */}
            {activeTab !== 'settings' ? (
                <div className="space-y-4">
                    {/* Filters Bar */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            {/* Search Form */}
                            <form onSubmit={handleSearch} className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari nama pelanggan, no WA, kode referensi, invoice link..."
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </form>

                            {/* Date Presets */}
                            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                                <span className="text-gray-400 font-medium whitespace-nowrap mr-1">Periode:</span>
                                {[
                                    { key: 'all', label: 'Semua' },
                                    { key: 'today', label: 'Hari Ini' },
                                    { key: 'last7', label: '7 Hari' },
                                    { key: 'thisMonth', label: 'Bulan Ini' },
                                ].map((p) => (
                                    <button
                                        key={p.key}
                                        type="button"
                                        onClick={() => handleDatePresetChange(p.key)}
                                        className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                                            datePreset === p.key
                                                ? 'bg-emerald-600 text-white font-semibold'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date Range Inputs */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                                <Calendar size={15} className="text-gray-400" />
                                <span className="font-medium text-gray-600">Dari Tanggal:</span>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => {
                                        setFromDate(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700"
                                />
                                <span className="font-medium text-gray-600">s/d:</span>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => {
                                        setToDate(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCurrentPage(1);
                                        loadData(activeTab, 1, searchQuery, fromDate, toDate);
                                    }}
                                    className="rounded-lg bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                                >
                                    Terapkan Filter
                                </button>
                            </div>

                            <span className="text-xs font-medium text-gray-500">
                                Ditemukan: <strong className="text-gray-800">{pagination?.total || 0}</strong> data
                            </span>
                        </div>
                    </div>

                    {/* Captures List */}
                    {captures.length === 0 ? (
                        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
                            <ShieldCheck className="h-12 w-12 text-gray-300" />
                            <p className="mt-3 text-base font-semibold text-gray-700">
                                {activeTab === 'needs_review'
                                    ? 'Tidak ada antrean pembayaran yang perlu direview.'
                                    : 'Tidak ada data bukti pembayaran pada rentang tanggal ini.'}
                            </p>
                            <p className="mt-1 text-sm text-gray-400">
                                {activeTab === 'needs_review'
                                    ? 'Semua bukti bayar yang masuk sudah terverifikasi otomatis atau telah diselesaikan.'
                                    : 'Coba ubah filter pencarian atau periode tanggal.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {captures.map((capture) => {
                                const analysis = capture.analysis || {};
                                const candidateInvoices = capture.match_reviews || [];
                                const isNeedsReview = capture.match_status === 'needs_review' || capture.match_status === 'pending';
                                const isApproved = capture.match_status === 'approved';
                                const isSearchingThisCapture = isSearchingCustomer[capture.id] || false;
                                const searchResultsForCapture = customerSearchResults[capture.id] || [];
                                const isSearchOpen = showCustomerSearch[capture.id] || false;

                                return (
                                    <div
                                        key={capture.id}
                                        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                                    >
                                        <div className="grid gap-6 p-5 lg:grid-cols-[240px_1fr]">
                                            {/* Proof Image Box */}
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="relative group w-full h-56 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                                                    {capture.proof_url ? (
                                                        <>
                                                            <img
                                                                src={capture.proof_url}
                                                                alt={`Bukti Bayar #${capture.id}`}
                                                                className="h-full w-full object-contain p-1"
                                                                onError={(e) => {
                                                                    e.currentTarget.style.display = 'none';
                                                                    const fallback = e.currentTarget.parentElement?.querySelector('.img-fallback');
                                                                    if (fallback) fallback.classList.remove('hidden');
                                                                }}
                                                            />
                                                            <div className="img-fallback hidden flex flex-col items-center justify-center text-center p-3 text-gray-400 text-xs">
                                                                <FileText size={32} className="text-gray-300 mb-1.5" />
                                                                <span className="font-semibold text-gray-600">Bukti Bayar #{capture.id}</span>
                                                                <span className="text-[11px] text-gray-400 mt-0.5">File gambar tidak ditemukan di server</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreviewImageUrl(capture.proof_url)}
                                                                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white font-medium text-xs gap-1.5"
                                                            >
                                                                <ZoomIn size={16} /> Perbesar Foto
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="flex flex-col items-center text-gray-400 text-xs text-center p-4">
                                                            <FileText size={28} className="text-gray-300 mb-1" />
                                                            <span>Bukti fisik tidak terlampir</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {capture.proof_url && (
                                                    <a
                                                        href={capture.proof_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
                                                    >
                                                        <Download size={13} /> Buka Tab Baru
                                                    </a>
                                                )}
                                            </div>

                                            {/* Details & Actions */}
                                            <div className="flex flex-col justify-between space-y-4">
                                                <div>
                                                    {/* Header Card with Dates & Status */}
                                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-bold text-gray-900">
                                                                Capture #{capture.id}
                                                            </h3>
                                                            <span
                                                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                                                    isApproved
                                                                        ? 'bg-emerald-100 text-emerald-800'
                                                                        : isNeedsReview
                                                                        ? 'bg-amber-100 text-amber-800'
                                                                        : 'bg-rose-100 text-rose-800'
                                                                }`}
                                                            >
                                                                {capture.match_status?.toUpperCase()}
                                                            </span>
                                                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                                Sumber: {capture.source}
                                                            </span>

                                                            {/* Tanggal & Jam Masuk / Upload */}
                                                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 font-medium">
                                                                <Clock size={12} className="text-gray-400" />
                                                                Masuk: {capture.created_at_display || capture.created_at?.slice(0, 16) || '-'}
                                                            </span>
                                                        </div>

                                                        {/* Action Buttons */}
                                                        {canManage && (
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReanalyze(capture.id)}
                                                                    disabled={refreshing}
                                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 shadow-sm"
                                                                >
                                                                    <RefreshCw size={13} /> Re-analyze AI
                                                                </button>

                                                                {isNeedsReview && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleResolve(capture.id, 'approve')}
                                                                            disabled={refreshing}
                                                                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                                                                        >
                                                                            <Check size={14} /> Konfirmasi & Lunaskan
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleResolve(capture.id, 'reject')}
                                                                            disabled={refreshing}
                                                                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
                                                                        >
                                                                            <X size={14} /> Tolak
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* OCR Extraction Grid */}
                                                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Nominal Terdeteksi</p>
                                                            <p className="mt-1 text-base font-bold text-gray-900">
                                                                Rp {Number(capture.amount || 0).toLocaleString('id-ID')}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Skor Kepercayaan AI</p>
                                                            <div className="mt-1 flex items-center gap-2">
                                                                <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                                                                    <div
                                                                        className={`h-full ${
                                                                            Number(capture.match_confidence || 0) >= 90
                                                                                ? 'bg-emerald-500'
                                                                                : Number(capture.match_confidence || 0) >= 70
                                                                                ? 'bg-amber-500'
                                                                                : 'bg-rose-500'
                                                                        }`}
                                                                        style={{ width: `${Math.min(100, Math.max(0, capture.match_confidence || 0))}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-sm font-bold text-gray-800">
                                                                    {Number(capture.match_confidence || 0).toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Tanggal Transfer (Struk)</p>
                                                            <p className="mt-1 text-xs font-bold text-gray-900 flex items-center gap-1">
                                                                <Calendar size={13} className="text-emerald-600" />
                                                                {capture.paid_date_display || capture.paid_date || (analysis.paid_date ? `${analysis.paid_date} ${analysis.paid_time || ''}` : '-')}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Bank & Tujuan</p>
                                                            <p className="mt-1 text-xs font-semibold text-gray-800 truncate">
                                                                {analysis.payment_channel || 'Transfer Bank / QRIS'} · {analysis.destination_identity?.name || analysis.destination_identity?.account_number || 'Rekening Perusahaan'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Linked Customer & Invoice Cards */}
                                                    <div className="mt-3 space-y-2.5">
                                                        {/* Customer Info Card */}
                                                        {capture.customer ? (
                                                            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
                                                                <div className="flex items-center gap-2.5 text-xs text-emerald-950">
                                                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                                                        <UserCheck size={18} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-bold text-sm text-gray-900">{capture.customer.name}</p>
                                                                        <p className="text-gray-600 text-[11px] flex items-center gap-2">
                                                                            <span>📱 WA: <strong>{capture.customer.phone || '-'}</strong></span>
                                                                            {capture.customer.pppoe_username && (
                                                                                <span>· PPPoE: <strong className="font-mono text-emerald-700">{capture.customer.pppoe_username}</strong></span>
                                                                            )}
                                                                            {capture.sender_phone && capture.sender_phone !== capture.customer.phone && (
                                                                                <span className="text-gray-400">· Pengirim: {capture.sender_phone}</span>
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                                                                    Pelanggan Teridentifikasi
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs">
                                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                    <div className="flex items-center gap-2 text-amber-900">
                                                                        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                                                                        <div>
                                                                            <span className="font-bold">Pelanggan belum terhubung secara otomatis.</span>
                                                                            {capture.sender_phone && (
                                                                                <span className="text-gray-600 ml-1">
                                                                                    (Nomor Pengirim WA: <strong>{capture.sender_phone}</strong>)
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {canManage && isNeedsReview && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowCustomerSearch((prev) => ({ ...prev, [capture.id]: !isSearchOpen }))}
                                                                            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition flex items-center gap-1 shadow-sm shrink-0"
                                                                        >
                                                                            <User size={13} />
                                                                            {isSearchOpen ? 'Tutup Pencarian' : 'Cari & Tautkan Pelanggan'}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Search Customer Inline Form */}
                                                                {isSearchOpen && (
                                                                    <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-2">
                                                                        <div className="relative">
                                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                            <input
                                                                                type="text"
                                                                                value={customerSearchQueries[capture.id] || ''}
                                                                                onChange={(e) => handleSearchCustomer(capture.id, e.target.value)}
                                                                                placeholder="Ketik nama pelanggan, nomor WhatsApp, atau username PPPoE..."
                                                                                className="w-full text-xs rounded-lg border border-amber-300 pl-8 pr-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                                            />
                                                                        </div>

                                                                        {isSearchingThisCapture && (
                                                                            <p className="text-[11px] text-gray-500 italic">Mencari pelanggan...</p>
                                                                        )}

                                                                        {searchResultsForCapture.length > 0 && (
                                                                            <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-white divide-y divide-gray-100 shadow-sm">
                                                                                {searchResultsForCapture.map((c) => (
                                                                                    <div
                                                                                        key={c.id}
                                                                                        className="flex items-center justify-between p-2 hover:bg-emerald-50/60 transition cursor-pointer"
                                                                                        onClick={() => handleAssignCustomer(capture.id, c.id)}
                                                                                    >
                                                                                        <div>
                                                                                            <span className="font-bold text-gray-900 text-xs">{c.name}</span>
                                                                                            <span className="text-gray-500 text-[11px] ml-2">WA: {c.phone || '-'}</span>
                                                                                            {c.pppoe_username && (
                                                                                                <span className="text-emerald-700 text-[11px] ml-1 font-mono">({c.pppoe_username})</span>
                                                                                            )}
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[11px]"
                                                                                        >
                                                                                            Pilih
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Attached Invoice */}
                                                        {capture.invoice && (
                                                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/50 border border-blue-200 text-xs">
                                                                <div className="flex items-center gap-2 text-blue-950">
                                                                    <FileText size={15} className="text-blue-600 shrink-0" />
                                                                    <span>
                                                                        <strong>Invoice Terpaut:</strong>{' '}
                                                                        <a
                                                                            href={`/invoice/${capture.invoice.invoice_link}`}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="text-blue-700 font-bold underline inline-flex items-center gap-0.5"
                                                                        >
                                                                            {capture.invoice.invoice_link} <ExternalLink size={11} />
                                                                        </a>
                                                                    </span>
                                                                    <span className="text-gray-600 font-medium">· Tagihan: Rp {Number(capture.invoice.amount || 0).toLocaleString('id-ID')}</span>
                                                                    {capture.invoice.due_date && (
                                                                        <span className="text-gray-500">· Jatuh Tempo: {capture.invoice.due_date}</span>
                                                                    )}
                                                                </div>
                                                                <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                                                                    Status: {capture.invoice.status}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {capture.reviewed_at_display && (
                                                            <p className="text-emerald-700 font-medium text-xs">
                                                                ✅ <strong>Selesai Direview:</strong> {capture.reviewed_at_display}
                                                            </p>
                                                        )}

                                                        {capture.failure_reason && (
                                                            <p className="text-rose-600 font-medium text-xs">
                                                                ⚠️ <strong>Catatan Validasi:</strong> {capture.failure_reason}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Candidate Invoices Selection */}
                                                    {candidateInvoices.length > 0 && isNeedsReview && (
                                                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
                                                            <p className="text-xs font-bold text-emerald-950 mb-2 flex items-center gap-1.5">
                                                                <Sparkles size={14} className="text-emerald-600" />
                                                                Rekomendasi Tagihan / Invoice yang Cocok untuk Dilunaskan:
                                                            </p>
                                                            <div className="space-y-2">
                                                                {candidateInvoices.map((rev) => {
                                                                    const inv = rev.candidate_invoice || rev.candidateInvoice;
                                                                    if (!inv) return null;
                                                                    const isSelected = (selectedCandidate[capture.id] || candidateInvoices[0]?.candidate_invoice_id) === inv.id;

                                                                    return (
                                                                        <label
                                                                            key={rev.id || inv.id}
                                                                            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border p-2.5 cursor-pointer text-xs transition ${
                                                                                isSelected
                                                                                    ? 'border-emerald-500 bg-white shadow-sm ring-1 ring-emerald-500 text-emerald-950 font-medium'
                                                                                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-2.5">
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`candidate_${capture.id}`}
                                                                                    checked={isSelected}
                                                                                    onChange={() => setSelectedCandidate((prev) => ({ ...prev, [capture.id]: inv.id }))}
                                                                                    className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                                                />
                                                                                <div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-bold font-mono text-gray-900">{inv.invoice_link}</span>
                                                                                        {inv.customer && (
                                                                                            <span className="text-gray-600">({inv.customer.name})</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                                                                        Nominal Tagihan: <strong className="text-emerald-700">Rp {Number(inv.amount || 0).toLocaleString('id-ID')}</strong>
                                                                                        {inv.due_date && <span className="ml-2">· Jatuh Tempo: {inv.due_date}</span>}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <span className="self-start sm:self-auto rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 font-bold text-[11px]">
                                                                                Kecocokan: {rev.score}%
                                                                            </span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination && pagination.last_page > 1 && (
                        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                            <button
                                type="button"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage <= 1}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                <ChevronLeft size={14} /> Sebelumnya
                            </button>
                            <span className="text-xs font-medium text-gray-600">
                                Halaman {pagination.current_page} dari {pagination.last_page}
                            </span>
                            <button
                                type="button"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage >= pagination.last_page}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Selanjutnya <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                /* TAB 4: SETTINGS */
                <div className="space-y-6">
                    {/* AI Vision & OCR Engine Card */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-emerald-600" />
                                <div>
                                    <h3 className="font-bold text-gray-900">Konfigurasi AI Vision & OCR Bukti Pembayaran</h3>
                                    <p className="text-xs text-gray-500">Membaca otomatis nominal, tanggal, nomor rekening, dan status lunas dari foto screenshot pelanggan.</p>
                                </div>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 w-fit">
                                <Sparkles size={13} /> Gemini & OpenAI Vision
                            </span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Penyedia AI (AI Provider)
                                </label>
                                <select
                                    value={config?.ai_provider || 'auto'}
                                    onChange={(e) => setConfig((p) => ({ ...p, ai_provider: e.target.value }))}
                                    className="w-full text-xs rounded-xl border border-gray-300 p-2.5 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                >
                                    <option value="auto">Otomatis (Coba Gemini, lalu OpenAI)</option>
                                    <option value="gemini">Google Gemini Vision (Gratis & Direkomendasikan)</option>
                                    <option value="openai">OpenAI (GPT-4o Mini)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Model Gemini Vision
                                </label>
                                <select
                                    value={config?.gemini_model || 'gemini-1.5-flash'}
                                    onChange={(e) => setConfig((p) => ({ ...p, gemini_model: e.target.value }))}
                                    className="w-full text-xs rounded-xl border border-gray-300 p-2.5 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                >
                                    <option value="gemini-1.5-flash">gemini-1.5-flash (Cepat & Hemat Kuota)</option>
                                    <option value="gemini-2.0-flash">gemini-2.0-flash (Generasi Terbaru)</option>
                                    <option value="gemini-1.5-pro">gemini-1.5-pro (Akurasi Maksimal)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Google Gemini API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showGeminiKey ? 'text' : 'password'}
                                        value={config?.gemini_api_key || ''}
                                        onChange={(e) => setConfig((p) => ({ ...p, gemini_api_key: e.target.value }))}
                                        placeholder="Masukkan API Key (AIzaSy...)"
                                        className="w-full text-xs rounded-xl border border-gray-300 pr-10 p-2.5 font-mono bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Dapatkan API Key gratis di <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-600 font-semibold hover:underline">Google AI Studio</a>
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    OpenAI API Key (Opsional)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showOpenAiKey ? 'text' : 'password'}
                                        value={config?.openai_api_key || ''}
                                        onChange={(e) => setConfig((p) => ({ ...p, openai_api_key: e.target.value }))}
                                        placeholder="Masukkan OpenAI API Key (sk-...)"
                                        className="w-full text-xs rounded-xl border border-gray-300 pr-10 p-2.5 font-mono bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showOpenAiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Model: <span className="font-mono text-gray-700">{config?.openai_model || 'gpt-4o-mini'}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Settings Sections */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Whitelist Bank */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-emerald-600" />
                                    <h3 className="font-bold text-gray-900">Whitelist Rekening Bank Perusahaan</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingBankIndex(null);
                                        setBankForm({ name: '', account_number: '', bank_name: 'BCA / BRI / Mandiri', aliases: '', active: true });
                                        setIsBankModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                    <Plus size={13} /> Tambah Rekening
                                </button>
                            </div>

                            <div className="space-y-2">
                                {(config?.destination_whitelist?.transfer_bank || []).map((b, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
                                        <div>
                                            <p className="font-bold text-xs text-gray-900">{b.name}</p>
                                            <p className="text-xs text-gray-500 font-mono">{b.account_number} ({b.bank_name || 'Bank'})</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingBankIndex(idx);
                                                    setBankForm({
                                                        name: b.name || '',
                                                        account_number: b.account_number || '',
                                                        bank_name: b.bank_name || '',
                                                        aliases: Array.isArray(b.aliases) ? b.aliases.join(', ') : '',
                                                        active: b.active ?? true,
                                                    });
                                                    setIsBankModalOpen(true);
                                                }}
                                                className="text-xs font-semibold text-blue-600 hover:underline"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteBank(idx)}
                                                className="text-xs font-semibold text-rose-600 hover:underline"
                                            >
                                                Hapus
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Whitelist QRIS */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <QrCode className="h-5 w-5 text-emerald-600" />
                                    <h3 className="font-bold text-gray-900">Whitelist QRIS Perusahaan</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingQrisIndex(null);
                                        setQrisForm({ name: '', merchant_id: '', aliases: '', active: true });
                                        setIsQrisModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                    <Plus size={13} /> Tambah QRIS
                                </button>
                            </div>

                            <div className="space-y-2">
                                {(config?.destination_whitelist?.qris || []).map((q, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
                                        <div>
                                            <p className="font-bold text-xs text-gray-900">{q.name}</p>
                                            <p className="text-xs text-gray-500 font-mono">NMID: {q.merchant_id}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingQrisIndex(idx);
                                                    setQrisForm({
                                                        name: q.name || '',
                                                        merchant_id: q.merchant_id || '',
                                                        aliases: Array.isArray(q.aliases) ? q.aliases.join(', ') : '',
                                                        active: q.active ?? true,
                                                    });
                                                    setIsQrisModalOpen(true);
                                                }}
                                                className="text-xs font-semibold text-blue-600 hover:underline"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteQris(idx)}
                                                className="text-xs font-semibold text-rose-600 hover:underline"
                                            >
                                                Hapus
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Notification Recipients */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-emerald-600" />
                                <h3 className="font-bold text-gray-900">Penerima Notifikasi WhatsApp Admin</h3>
                            </div>
                            <button
                                type="button"
                                onClick={handleAddRecipient}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                                <Plus size={13} /> Tambah Penerima
                            </button>
                        </div>

                        <div className="space-y-3">
                            {recipients.map((rec, idx) => (
                                <div key={rec.id || idx} className="grid gap-3 sm:grid-cols-4 p-3 rounded-xl border border-gray-100 bg-gray-50 items-center">
                                    <input
                                        type="text"
                                        placeholder="Nama Admin"
                                        value={rec.name}
                                        onChange={(e) => handleUpdateRecipient(idx, { name: e.target.value })}
                                        className="text-xs rounded-lg border border-gray-200 px-3 py-1.5 bg-white"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Nomor WA (0812...)"
                                        value={rec.phone}
                                        onChange={(e) => handleUpdateRecipient(idx, { phone: e.target.value })}
                                        className="text-xs rounded-lg border border-gray-200 px-3 py-1.5 bg-white font-mono"
                                    />
                                    <div className="flex items-center gap-3 text-xs">
                                        <label className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                checked={rec.receive_needs_review}
                                                onChange={(e) => handleUpdateRecipient(idx, { receive_needs_review: e.target.checked })}
                                                className="rounded text-emerald-600"
                                            />
                                            Review
                                        </label>
                                        <label className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                checked={rec.receive_auto_approved}
                                                onChange={(e) => handleUpdateRecipient(idx, { receive_auto_approved: e.target.checked })}
                                                className="rounded text-emerald-600"
                                            />
                                            Auto-Approve
                                        </label>
                                    </div>
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRecipient(idx)}
                                            className="text-rose-600 hover:text-rose-800 p-1"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => handleSaveConfig()}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                            >
                                <Save size={16} />
                                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: UPLOAD & SCAN */}
            <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Upload Bukti Transfer Manual">
                <form onSubmit={handleUploadSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Pilih File Foto Bukti Transfer (JPG, PNG, PDF) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            required
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setUploadFile(file);
                                    setUploadPreview(URL.createObjectURL(file));
                                }
                            }}
                            className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                        />
                        {uploadPreview && (
                            <img src={uploadPreview} alt="Preview" className="mt-2 h-44 w-full object-contain rounded-xl border border-gray-200 bg-gray-50" />
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Catatan / Keterangan WhatsApp (Opsional)
                        </label>
                        <textarea
                            rows={2}
                            value={uploadCaption}
                            onChange={(e) => setUploadCaption(e.target.value)}
                            placeholder="Contoh: Pembayaran invoice Budi Santoso / no wa 0812345678"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsUploadModalOpen(false)}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={uploading}
                            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
                        >
                            {uploading ? (
                                <>
                                    <RefreshCw size={13} className="animate-spin" />
                                    Menganalisis...
                                </>
                            ) : (
                                'Unggah & Analisis AI'
                            )}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL: PREVIEW IMAGE ZOOM */}
            {previewImageUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setPreviewImageUrl(null)}
                >
                    <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2">
                        <img
                            src={previewImageUrl}
                            alt="Bukti Transfer Zoom"
                            className="max-h-[85vh] max-w-[85vw] object-contain rounded-xl"
                        />
                        <button
                            type="button"
                            onClick={() => setPreviewImageUrl(null)}
                            className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black transition"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL: BANK WHITELIST */}
            <Modal isOpen={isBankModalOpen} onClose={() => setIsBankModalOpen(false)} title={editingBankIndex !== null ? 'Edit Rekening Bank' : 'Tambah Rekening Bank'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nama Pemilik Rekening <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={bankForm.name}
                            onChange={(e) => setBankForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Contoh: M ABDUL ROHMAN"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5 uppercase"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nomor Rekening <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={bankForm.account_number}
                            onChange={(e) => setBankForm((p) => ({ ...p, account_number: e.target.value }))}
                            placeholder="Contoh: 0847566563"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nama Bank</label>
                        <input
                            type="text"
                            value={bankForm.bank_name}
                            onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))}
                            placeholder="Contoh: BCA / BRI / Mandiri"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Alias / Variasi Penulisan (Dipisah Koma)</label>
                        <input
                            type="text"
                            value={bankForm.aliases}
                            onChange={(e) => setBankForm((p) => ({ ...p, aliases: e.target.value }))}
                            placeholder="Contoh: abdulrohman, abdul rohman, rumah kita"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setIsBankModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100">Batal</button>
                        <button type="button" onClick={handleSaveBank} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">Simpan</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: QRIS WHITELIST */}
            <Modal isOpen={isQrisModalOpen} onClose={() => setIsQrisModalOpen(false)} title={editingQrisIndex !== null ? 'Edit QRIS Perusahaan' : 'Tambah QRIS Perusahaan'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nama Merchant QRIS <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={qrisForm.name}
                            onChange={(e) => setQrisForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Contoh: Rumah Kita Network"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Merchant ID / NMID <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={qrisForm.merchant_id}
                            onChange={(e) => setQrisForm((p) => ({ ...p, merchant_id: e.target.value }))}
                            placeholder="Contoh: G141935892"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Alias / Variasi Penulisan (Dipisah Koma)</label>
                        <input
                            type="text"
                            value={qrisForm.aliases}
                            onChange={(e) => setQrisForm((p) => ({ ...p, aliases: e.target.value }))}
                            placeholder="Contoh: rumahkitanetwork, mabdulrohman"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setIsQrisModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100">Batal</button>
                        <button type="button" onClick={handleSaveQris} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">Simpan</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bot,
    Building2,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
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
    Users,
    X,
    XCircle,
    ZoomIn,
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
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [showJsonWhitelist, setShowJsonWhitelist] = useState(false);
    const [whitelistText, setWhitelistText] = useState(JSON.stringify(emptyWhitelist, null, 2));

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadPreview, setUploadPreview] = useState(null);
    const [uploadCaption, setUploadCaption] = useState('');
    const [uploading, setUploading] = useState(false);

    const [previewImageUrl, setPreviewImageUrl] = useState(null);

    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [editingBankIndex, setEditingBankIndex] = useState(null);
    const [bankForm, setBankForm] = useState({ name: '', account_number: '', bank_name: '', aliases: '', active: true });

    const [isQrisModalOpen, setIsQrisModalOpen] = useState(false);
    const [editingQrisIndex, setEditingQrisIndex] = useState(null);
    const [qrisForm, setQrisForm] = useState({ name: '', merchant_id: '', aliases: '', active: true });

    const [selectedCandidate, setSelectedCandidate] = useState({});

    const loadData = async (targetTab = activeTab, page = currentPage, search = searchQuery) => {
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
        loadData(activeTab, 1, searchQuery);
    }, [activeTab]);

    const handleSearch = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        loadData(activeTab, 1, searchQuery);
    };

    const handlePageChange = (page) => {
        setCurrentPage(page);
        loadData(activeTab, page, searchQuery);
    };

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

            setMessage(decision === 'approve' ? 'Pembayaran berhasil dikonfirmasi dan dilunaskan.' : 'Pembayaran ditolak.');
            await loadData(activeTab, currentPage, searchQuery);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memproses verifikasi capture.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleReanalyze = async (captureId) => {
        try {
            setRefreshing(true);
            setError('');
            setMessage('');
            await paymentVerificationService.reanalyzeCapture(captureId);
            setMessage(`Capture #${captureId} dijadwalkan untuk dianalisis ulang AI.`);
            await loadData(activeTab, currentPage, searchQuery);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memicu analisis ulang.');
        } finally {
            setRefreshing(false);
        }
    };

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
            await loadData('needs_review', 1, '');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal mengunggah dan menganalisis bukti pembayaran.');
        } finally {
            setUploading(false);
        }
    };

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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 sm:text-3xl">
                        <ShieldCheck className="h-8 w-8 text-emerald-600" />
                        Payment Verification AI
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Verifikasi otomatis bukti transfer via WhatsApp & Web, validasi rekening perusahaan, dan auto-pelunasan tagihan.
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
                        onClick={() => loadData(activeTab, currentPage, searchQuery)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin text-emerald-600' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

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
                    Riwayat Terverifikasi
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
                    Ditolak / Tidak Cocok
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
                    ⚙️ Pengaturan
                </button>
            </div>

            {activeTab !== 'settings' && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <form onSubmit={handleSearch} className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                            <input
                                type="text"
                                placeholder="Cari nama pelanggan, no WA, kode referensi..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            />
                        </form>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <span className="text-xs font-medium text-gray-500">
                                Total: <strong className="text-gray-800">{pagination?.total || 0}</strong> data
                            </span>
                        </div>
                    </div>

                    {captures.length === 0 ? (
                        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
                            <ShieldCheck className="h-12 w-12 text-gray-300" />
                            <p className="mt-3 text-base font-semibold text-gray-700">Tidak ada data pembayaran.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {captures.map((capture) => {
                                const analysis = capture.analysis || {};
                                const candidateInvoices = capture.match_reviews || [];
                                const isNeedsReview = capture.match_status === 'needs_review' || capture.match_status === 'pending';
                                const isApproved = capture.match_status === 'approved';

                                return (
                                    <div
                                        key={capture.id}
                                        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                                    >
                                        <div className="grid gap-6 p-5 lg:grid-cols-[240px_1fr]">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="relative group w-full h-56 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                                                    {capture.proof_url ? (
                                                        <>
                                                            <img
                                                                src={capture.proof_url}
                                                                alt={`Bukti Bayar #${capture.id}`}
                                                                className="h-full w-full object-contain p-1"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreviewImageUrl(capture.proof_url)}
                                                                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white font-medium text-xs gap-1.5"
                                                            >
                                                                <ZoomIn size={16} /> Perbesar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="flex flex-col items-center text-gray-400 text-xs">
                                                            <FileText size={28} className="text-gray-300" />
                                                            <span className="mt-1">Tidak ada bukti</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col justify-between space-y-4">
                                                <div>
                                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-bold text-gray-900">Capture #{capture.id}</h3>
                                                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isApproved ? 'bg-emerald-100 text-emerald-800' : isNeedsReview ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                                                                {capture.match_status?.toUpperCase()}
                                                            </span>
                                                        </div>

                                                        {canManage && (
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReanalyze(capture.id)}
                                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                                >
                                                                    <RefreshCw size={13} /> Re-analyze
                                                                </button>
                                                                {isNeedsReview && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleResolve(capture.id, 'approve')}
                                                                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                                                                        >
                                                                            <Check size={14} /> Konfirmasi
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleResolve(capture.id, 'reject')}
                                                                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                                                                        >
                                                                            <X size={14} /> Tolak
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Nominal</p>
                                                            <p className="mt-1 text-base font-bold text-gray-900">Rp {Number(capture.amount || 0).toLocaleString('id-ID')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Confidence</p>
                                                            <p className="mt-1 text-base font-bold text-gray-900">{Number(capture.match_confidence || 0).toFixed(0)}%</p>
                                                        </div>
                                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Metode</p>
                                                            <p className="mt-1 text-sm font-semibold text-gray-800 truncate">{analysis.payment_channel || 'Bank'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Tujuan</p>
                                                            <p className="mt-1 text-xs font-semibold text-gray-800 truncate">{analysis.destination_identity?.name || '-'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-6">
                    {/* AI Vision Engine Settings */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                                    <Bot className="h-5 w-5 text-emerald-600" />
                                    Mesin AI Vision & Parameter Verifikasi
                                </h2>
                                <p className="text-xs text-gray-500">
                                    Atur model AI Vision (Gemini / OpenAI), ambang batas skor kepercayaan (*confidence threshold*), dan auto-approve.
                                </p>
                            </div>

                            {canManage && (
                                <button
                                    type="button"
                                    onClick={() => handleSaveConfig()}
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition"
                                >
                                    <Save size={16} />
                                    {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                                </button>
                            )}
                        </div>

                        <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-700">Penyedia AI Vision</span>
                                <select
                                    value={config?.ai_provider || 'auto'}
                                    disabled={!canManage}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, ai_provider: e.target.value }))}
                                    className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:ring-emerald-500"
                                >
                                    <option value="auto">✨ Auto Fallback (Gemini + OpenAI)</option>
                                    <option value="gemini">Google Gemini 1.5 Flash (Sangat Cepat & Hemat)</option>
                                    <option value="openai">OpenAI GPT-4o-mini Vision</option>
                                </select>
                            </label>

                            <label className="block">
                                <span className="text-xs font-semibold text-gray-700">Threshold Auto-Approve (%)</span>
                                <div className="mt-1.5 flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="70"
                                        max="100"
                                        value={config?.confidence_thresholds?.auto_approve ?? 95}
                                        disabled={!canManage}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                confidence_thresholds: {
                                                    ...(prev?.confidence_thresholds || {}),
                                                    auto_approve: Number(e.target.value),
                                                },
                                            }))
                                        }
                                        className="flex-1 accent-emerald-600"
                                    />
                                    <span className="w-12 text-right text-sm font-bold text-emerald-700">
                                        {config?.confidence_thresholds?.auto_approve ?? 95}%
                                    </span>
                                </div>
                                <span className="text-[11px] text-gray-400">Skor minimum agar pembayaran langsung lunas otomatis.</span>
                            </label>

                            <label className="block">
                                <span className="text-xs font-semibold text-gray-700">Threshold Review Manual (%)</span>
                                <div className="mt-1.5 flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="50"
                                        max="90"
                                        value={config?.confidence_thresholds?.manual_review ?? 70}
                                        disabled={!canManage}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                confidence_thresholds: {
                                                    ...(prev?.confidence_thresholds || {}),
                                                    manual_review: Number(e.target.value),
                                                },
                                            }))
                                        }
                                        className="flex-1 accent-amber-500"
                                    />
                                    <span className="w-12 text-right text-sm font-bold text-amber-700">
                                        {config?.confidence_thresholds?.manual_review ?? 70}%
                                    </span>
                                </div>
                                <span className="text-[11px] text-gray-400">Di bawah skor ini akan ditandai sebagai Tidak Cocok.</span>
                            </label>
                        </div>
                    </div>

                    {/* Visual Whitelist Management */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                                    <Building2 className="h-5 w-5 text-emerald-600" />
                                    Whitelist Tujuan Pembayaran Resmi
                                </h2>
                                <p className="text-xs text-gray-500">
                                    AI hanya akan menyetujui pembayaran yang ditransfer ke rekening bank atau QRIS resmi berikut.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowJsonWhitelist(!showJsonWhitelist)}
                                className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline"
                            >
                                {showJsonWhitelist ? 'Sembunyikan Mode JSON' : '⚙️ Tampilkan Editor JSON'}
                            </button>
                        </div>

                        {showJsonWhitelist ? (
                            <div className="mt-4">
                                <textarea
                                    rows={10}
                                    value={whitelistText}
                                    onChange={(e) => setWhitelistText(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-slate-950 p-4 font-mono text-xs text-emerald-400"
                                />
                            </div>
                        ) : (
                            <div className="mt-6 space-y-6">
                                {/* Bank Accounts Section */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                            <Building2 size={16} className="text-blue-600" />
                                            Rekening Bank Transfer ({config?.destination_whitelist?.transfer_bank?.length || 0})
                                        </h3>
                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBankForm({ name: '', account_number: '', bank_name: 'BCA', aliases: '', active: true });
                                                    setEditingBankIndex(null);
                                                    setIsBankModalOpen(true);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                                            >
                                                <Plus size={14} /> Tambah Rekening Bank
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {(config?.destination_whitelist?.transfer_bank || []).map((bank, idx) => (
                                            <div
                                                key={idx}
                                                className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 flex flex-col justify-between"
                                            >
                                                <div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                                                            {bank.bank_name || 'Bank Transfer'}
                                                        </span>
                                                        <span
                                                            className={`h-2 w-2 rounded-full ${
                                                                bank.active ? 'bg-emerald-500' : 'bg-gray-300'
                                                            }`}
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-base font-bold text-gray-900 font-mono tracking-wider">
                                                        {bank.account_number}
                                                    </p>
                                                    <p className="text-xs font-medium text-gray-600 mt-0.5">
                                                        A/N: <strong>{bank.name}</strong>
                                                    </p>
                                                    {bank.aliases?.length > 0 && (
                                                        <p className="text-[11px] text-gray-400 mt-1 truncate">
                                                            Alias: {bank.aliases.join(', ')}
                                                        </p>
                                                    )}
                                                </div>

                                                {canManage && (
                                                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setBankForm({
                                                                    name: bank.name,
                                                                    bank_name: bank.bank_name || 'Bank Transfer',
                                                                    account_number: bank.account_number,
                                                                    aliases: (bank.aliases || []).join(', '),
                                                                    active: bank.active ?? true,
                                                                });
                                                                setEditingBankIndex(idx);
                                                                setIsBankModalOpen(true);
                                                            }}
                                                            className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteBank(idx)}
                                                            className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                                                        >
                                                            Hapus
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {(!config?.destination_whitelist?.transfer_bank || config.destination_whitelist.transfer_bank.length === 0) && (
                                            <div className="col-span-full rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                                                Belum ada rekening bank yang didaftarkan.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* QRIS Merchants Section */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                            <QrCode size={16} className="text-emerald-600" />
                                            QRIS Merchant ({config?.destination_whitelist?.qris?.length || 0})
                                        </h3>
                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setQrisForm({ name: '', merchant_id: '', aliases: '', active: true });
                                                    setEditingQrisIndex(null);
                                                    setIsQrisModalOpen(true);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                                            >
                                                <Plus size={14} /> Tambah QRIS
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {(config?.destination_whitelist?.qris || []).map((qris, idx) => (
                                            <div
                                                key={idx}
                                                className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 flex flex-col justify-between"
                                            >
                                                <div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                                            QRIS Official
                                                        </span>
                                                        <span
                                                            className={`h-2 w-2 rounded-full ${
                                                                qris.active ? 'bg-emerald-500' : 'bg-gray-300'
                                                            }`}
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-base font-bold text-gray-900">
                                                        {qris.name}
                                                    </p>
                                                    <p className="text-xs font-medium text-gray-600 font-mono mt-0.5">
                                                        ID: {qris.merchant_id}
                                                    </p>
                                                    {qris.aliases?.length > 0 && (
                                                        <p className="text-[11px] text-gray-400 mt-1 truncate">
                                                            Alias: {qris.aliases.join(', ')}
                                                        </p>
                                                    )}
                                                </div>

                                                {canManage && (
                                                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setQrisForm({
                                                                    name: qris.name,
                                                                    merchant_id: qris.merchant_id,
                                                                    aliases: (qris.aliases || []).join(', '),
                                                                    active: qris.active ?? true,
                                                                });
                                                                setEditingQrisIndex(idx);
                                                                setIsQrisModalOpen(true);
                                                            }}
                                                            className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteQris(idx)}
                                                            className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                                                        >
                                                            Hapus
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {(!config?.destination_whitelist?.qris || config.destination_whitelist.qris.length === 0) && (
                                            <div className="col-span-full rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                                                Belum ada QRIS yang didaftarkan.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notification Recipients */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                                    <Users className="h-5 w-5 text-emerald-600" />
                                    Penerima Notifikasi WhatsApp
                                </h2>
                                <p className="text-xs text-gray-500">
                                    Nomor staf/admin yang menerima notifikasi real-time saat pembayaran lunas atau perlu review.
                                </p>
                            </div>

                            {canManage && (
                                <button
                                    type="button"
                                    onClick={handleAddRecipient}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                                >
                                    <Plus size={14} /> Tambah Penerima
                                </button>
                            )}
                        </div>

                        <div className="mt-4 space-y-3">
                            {recipients.map((rec, idx) => (
                                <div
                                    key={rec.id || idx}
                                    className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="grid gap-3 sm:grid-cols-2 flex-1">
                                        <input
                                            type="text"
                                            placeholder="Nama Penerima"
                                            value={rec.name || ''}
                                            disabled={!canManage}
                                            onChange={(e) => handleUpdateRecipient(idx, { name: e.target.value })}
                                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Nomor WA (contoh: 08123456789)"
                                            value={rec.phone || ''}
                                            disabled={!canManage}
                                            onChange={(e) => handleUpdateRecipient(idx, { phone: e.target.value })}
                                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(rec.receive_auto_approved)}
                                                disabled={!canManage}
                                                onChange={(e) => handleUpdateRecipient(idx, { receive_auto_approved: e.target.checked })}
                                                className="rounded text-emerald-600 focus:ring-emerald-500"
                                            />
                                            Auto-Approved
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(rec.receive_needs_review)}
                                                disabled={!canManage}
                                                onChange={(e) => handleUpdateRecipient(idx, { receive_needs_review: e.target.checked })}
                                                className="rounded text-amber-500 focus:ring-amber-500"
                                            />
                                            Perlu Review
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(rec.is_active)}
                                                disabled={!canManage}
                                                onChange={(e) => handleUpdateRecipient(idx, { is_active: e.target.checked })}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            Aktif
                                        </label>

                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteRecipient(idx)}
                                                className="p-1 text-rose-500 hover:text-rose-700"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {recipients.length === 0 && (
                                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                                    Belum ada nomor penerima notifikasi WhatsApp.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Upload & Scan Bukti Bayar */}
            <Modal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                title="Unggah & Scan Bukti Transfer AI"
                size="lg"
            >
                <form onSubmit={handleUploadSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                            Pilih Gambar / Struk Bukti Bayar (JPEG, PNG, WEBP, PDF)
                        </label>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setUploadFile(file);
                                    if (file.type.startsWith('image/')) {
                                        setUploadPreview(URL.createObjectURL(file));
                                    } else {
                                        setUploadPreview(null);
                                    }
                                }
                            }}
                            className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                        />
                    </div>

                    {uploadPreview && (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-2 flex justify-center">
                            <img src={uploadPreview} alt="Preview" className="max-h-48 rounded-lg object-contain" />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Catatan Tambahan (Opsional)
                        </label>
                        <input
                            type="text"
                            placeholder="Contoh: Bukti transfer dari Bpk Budi via WA pribadi"
                            value={uploadCaption}
                            onChange={(e) => setUploadCaption(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-emerald-500 focus:ring-emerald-500"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setIsUploadModalOpen(false)}
                            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={uploading || !uploadFile}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {uploading ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin" /> Menganalisis AI...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} /> Scan & Proses AI Sekarang
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL: Zoom Bukti Transfer */}
            {previewImageUrl && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setPreviewImageUrl(null)}
                >
                    <div className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setPreviewImageUrl(null)}
                            className="absolute top-4 right-4 rounded-full bg-slate-900/60 p-1.5 text-white hover:bg-slate-900"
                        >
                            <X size={20} />
                        </button>
                        <img
                            src={previewImageUrl}
                            alt="Bukti Transfer Zoom"
                            className="max-h-[80vh] w-auto object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}

            {/* MODAL: Tambah/Edit Rekening Bank */}
            <Modal
                isOpen={isBankModalOpen}
                onClose={() => setIsBankModalOpen(false)}
                title={editingBankIndex !== null ? 'Edit Rekening Bank' : 'Tambah Rekening Bank Resmi'}
                size="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nama Bank</label>
                        <input
                            type="text"
                            placeholder="Contoh: BCA, BRI, Mandiri, BNI"
                            value={bankForm.bank_name}
                            onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nomor Rekening</label>
                        <input
                            type="text"
                            placeholder="Nomor rekening tujuan transfer"
                            value={bankForm.account_number}
                            onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Atas Nama Pemilik</label>
                        <input
                            type="text"
                            placeholder="Nama pemilik rekening sesuai mutasi"
                            value={bankForm.name}
                            onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Alias Pencocokan (Pisahkan koma)</label>
                        <input
                            type="text"
                            placeholder="contoh: abdul, mabdulrohman, rkn"
                            value={bankForm.aliases}
                            onChange={(e) => setBankForm({ ...bankForm, aliases: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer pt-1">
                        <input
                            type="checkbox"
                            checked={bankForm.active}
                            onChange={(e) => setBankForm({ ...bankForm, active: e.target.checked })}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        Aktifkan Rekening Ini
                    </label>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setIsBankModalOpen(false)}
                            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveBank}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                            Simpan Rekening
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: Tambah/Edit QRIS */}
            <Modal
                isOpen={isQrisModalOpen}
                onClose={() => setIsQrisModalOpen(false)}
                title={editingQrisIndex !== null ? 'Edit QRIS Merchant' : 'Tambah QRIS Merchant Resmi'}
                size="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nama QRIS Merchant</label>
                        <input
                            type="text"
                            placeholder="Contoh: Rumah Kita Network"
                            value={qrisForm.name}
                            onChange={(e) => setQrisForm({ ...qrisForm, name: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Merchant ID / NMID</label>
                        <input
                            type="text"
                            placeholder="Contoh: G141935892 / NMID"
                            value={qrisForm.merchant_id}
                            onChange={(e) => setQrisForm({ ...qrisForm, merchant_id: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Alias Pencocokan (Pisahkan koma)</label>
                        <input
                            type="text"
                            placeholder="contoh: rumahkitanetwork, mabdulrohman"
                            value={qrisForm.aliases}
                            onChange={(e) => setQrisForm({ ...qrisForm, aliases: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer pt-1">
                        <input
                            type="checkbox"
                            checked={qrisForm.active}
                            onChange={(e) => setQrisForm({ ...qrisForm, active: e.target.checked })}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        Aktifkan QRIS Ini
                    </label>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setIsQrisModalOpen(false)}
                            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveQris}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                            Simpan QRIS
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

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
    Copy,
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
import { Link, useSearchParams } from 'react-router-dom';
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
    const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'whatsapp' | 'web_public' | 'admin_upload'
    const [confidenceFilter, setConfidenceFilter] = useState('all'); // 'all' | 'high' | 'medium' | 'low'
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkConfirmModal, setBulkConfirmModal] = useState({ open: false, minConfidence: 90 });

    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // Whitelist raw JSON editor toggle
    const [showJsonWhitelist, setShowJsonWhitelist] = useState(false);
    const [whitelistText, setWhitelistText] = useState(JSON.stringify(emptyWhitelist, null, 2));

    // AI API Keys visibility
    const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showOpenAiKey, setShowOpenAiKey] = useState(false);

    // Modals
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadPreview, setUploadPreview] = useState(null);
    const [uploadCaption, setUploadCaption] = useState('');
    const [uploading, setUploading] = useState(false);

    // Zoom Image Modal
    const [previewImageUrl, setPreviewImageUrl] = useState(null);

    // URL Query Params Deep Link for Direct Review Confirmation
    const [searchParams, setSearchParams] = useSearchParams();
    const reviewId = searchParams.get('review_id') || searchParams.get('capture_id');

    // Detail Bukti Bayar Modal
    const [selectedDetailCapture, setSelectedDetailCapture] = useState(null);
    const [showOcrRawText, setShowOcrRawText] = useState(false);
    const [copiedRef, setCopiedRef] = useState(false);

    const handleCloseDetailModal = () => {
        setSelectedDetailCapture(null);
        setShowOcrRawText(false);
        setCopiedRef(false);
        if (searchParams.has('review_id') || searchParams.has('capture_id')) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('review_id');
            nextParams.delete('capture_id');
            setSearchParams(nextParams, { replace: true });
        }
    };

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
        endDate = toDate,
        source = sourceFilter,
        confidence = confidenceFilter
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
                    source: source !== 'all' ? source : undefined,
                    confidence_level: confidence !== 'all' ? confidence : undefined,
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
        loadData(activeTab, 1, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
    }, [activeTab]);

    // Auto-open capture detail modal when review_id or capture_id is passed in query params
    useEffect(() => {
        if (!reviewId) return;

        let isMounted = true;
        const fetchReviewCapture = async () => {
            try {
                const response = await paymentVerificationService.getCapture(reviewId);
                const captureData = response.data?.data;
                if (captureData && isMounted) {
                    setSelectedDetailCapture(captureData);
                    if (captureData.match_status === 'approved') {
                        setActiveTab('approved');
                    } else if (captureData.match_status === 'unmatched') {
                        setActiveTab('unmatched');
                    } else {
                        setActiveTab('needs_review');
                    }
                }
            } catch (err) {
                console.error('Failed to load review capture from URL parameter', err);
            }
        };

        fetchReviewCapture();
        return () => {
            isMounted = false;
        };
    }, [reviewId]);

    const handleSearch = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        loadData(activeTab, 1, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
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
        loadData(activeTab, 1, searchQuery, start, end, sourceFilter, confidenceFilter);
    };

    const handlePageChange = (page) => {
        setCurrentPage(page);
        loadData(activeTab, page, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
    };

    const handleFilterChange = (newSource = sourceFilter, newConfidence = confidenceFilter) => {
        setSourceFilter(newSource);
        setConfidenceFilter(newConfidence);
        setCurrentPage(1);
        loadData(activeTab, 1, searchQuery, fromDate, toDate, newSource, newConfidence);
    };

    // Bulk Approve High Confidence Captures
    const handleBulkApprove = async (minConfidence = 90) => {
        try {
            setBulkLoading(true);
            setError('');
            setMessage('');
            const res = await paymentVerificationService.bulkResolve({ min_confidence: minConfidence });
            const data = res.data?.data || {};
            setMessage(res.data?.message || `Berhasil: ${data.approved_count || 0} pembayaran berhasil dikonfirmasi dan dilunaskan secara otomatis.`);
            setBulkConfirmModal({ open: false, minConfidence: 90 });
            await loadData(activeTab, 1, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memproses auto-konfirmasi massal.');
        } finally {
            setBulkLoading(false);
        }
    };

    // Direct WhatsApp Link Helper
    const getCustomerWhatsAppUrl = (customer, capture) => {
        const phone = customer?.phone || capture?.sender_phone;
        if (!phone) return null;
        let cleanPhone = String(phone).replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        }
        const amountStr = capture?.amount ? `Rp ${Number(capture.amount).toLocaleString('id-ID')}` : '';
        const custName = customer?.name || 'Pelanggan';
        const text = `Halo Kak ${custName},\n\nTerima kasih, bukti transfer pembayaran internet Anda sebesar ${amountStr} telah berhasil kami verifikasi. Tagihan Anda telah lunas dan layanan aktif normal. 🙏`;
        return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
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
            await loadData(activeTab, currentPage, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memproses verifikasi capture.');
        } finally {
            setRefreshing(false);
        }
    };

    // Re-analyze Capture (opsional dengan ganti file foto struk)
    const handleReanalyze = async (captureId, replaceFile = null) => {
        try {
            setRefreshing(true);
            setError('');
            setMessage('');
            let res;
            if (replaceFile) {
                const fd = new FormData();
                fd.append('file', replaceFile);
                res = await paymentVerificationService.reanalyzeCapture(captureId, fd);
            } else {
                res = await paymentVerificationService.reanalyzeCapture(captureId);
            }
            setMessage(res.data?.message || `Capture #${captureId} berhasil dianalisis ulang.`);
            if (selectedDetailCapture && selectedDetailCapture.id === captureId) {
                setSelectedDetailCapture(res.data?.data || null);
            }
            await loadData(activeTab, currentPage, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
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
            const res = await paymentVerificationService.assignCustomer(captureId, customerId);
            setMessage(
                customerId
                    ? `Pelanggan berhasil ditautkan ke Capture #${captureId}.`
                    : `Tautan pelanggan pada Capture #${captureId} berhasil dilepas.`
            );
            setShowCustomerSearch((prev) => ({ ...prev, [captureId]: false }));
            if (selectedDetailCapture && selectedDetailCapture.id === captureId) {
                setSelectedDetailCapture(res.data?.data || null);
            }
            await loadData(activeTab, currentPage, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengubah pelanggan pada capture.');
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
                    {canManage && activeTab === 'needs_review' && (
                        <button
                            type="button"
                            onClick={() => setBulkConfirmModal({ open: true, minConfidence: 90 })}
                            disabled={refreshing || bulkLoading || pagination?.total === 0}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 transition transform hover:-translate-y-0.5 active:translate-y-0"
                            title="Konfirmasi dan lunaskan semua capture yang memiliki skor AI minimal 90%"
                        >
                            <Sparkles size={16} className={bulkLoading ? 'animate-spin' : ''} />
                            <span>{bulkLoading ? 'Memproses Massal...' : '⚡ Auto-Konfirmasi (Skor ≥ 90%)'}</span>
                        </button>
                    )}
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
                        onClick={() => loadData(activeTab, currentPage, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter)}
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

            {/* AI Vision Inactive Notice Banner */}
            {!config?.gemini_api_key && !config?.openai_api_key && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-amber-900 shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-800">
                            <AlertTriangle size={18} />
                        </div>
                        <div>
                            <p className="text-xs sm:text-sm font-bold text-amber-900">
                                AI Vision (Google Gemini) Belum Aktif
                            </p>
                            <p className="mt-0.5 text-[11px] sm:text-xs text-amber-700">
                                Struk transfer buram/foto kamera HP dan struk SeaBank/BCA memerlukan Google Gemini AI Vision agar terbaca akurat (&gt;90%). Masukkan Gemini API Key gratis di tab Pengaturan.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setActiveTab('settings')}
                        className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition"
                    >
                        Buka Pengaturan AI →
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
                    Auto Konfirmasi Gagal (Ditolak)
                    {activeTab === 'unmatched' && pagination?.total > 0 && (
                        <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold text-white">
                            {pagination.total}
                        </span>
                    )}
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

                <Link
                    to="/settings/payment-verification/auto-history"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-sm"
                >
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Riwayat Konfirmasi Auto
                </Link>
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

                        {/* Secondary Filters: Source & AI Score */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs">
                            <div className="flex flex-wrap items-center gap-4">
                                {/* Source Filter */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 font-medium">Sumber:</span>
                                    <div className="flex items-center gap-1">
                                        {[
                                            { key: 'all', label: 'Semua' },
                                            { key: 'whatsapp', label: '📱 WA' },
                                            { key: 'web_public', label: '🌐 Web' },
                                            { key: 'admin_upload', label: '📤 Admin' },
                                        ].map((s) => (
                                            <button
                                                key={s.key}
                                                type="button"
                                                onClick={() => handleFilterChange(s.key, confidenceFilter)}
                                                className={`rounded-md px-2 py-1 font-medium transition ${
                                                    sourceFilter === s.key
                                                        ? 'bg-slate-800 text-white font-semibold'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Confidence Filter */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 font-medium">Skor AI:</span>
                                    <div className="flex items-center gap-1">
                                        {[
                                            { key: 'all', label: 'Semua' },
                                            { key: 'high', label: '🟢 Tinggi (≥90%)' },
                                            { key: 'medium', label: '🟡 Sedang (70-89%)' },
                                            { key: 'low', label: '🔴 Rendah (<70%)' },
                                        ].map((c) => (
                                            <button
                                                key={c.key}
                                                type="button"
                                                onClick={() => handleFilterChange(sourceFilter, c.key)}
                                                className={`rounded-md px-2 py-1 font-medium transition ${
                                                    confidenceFilter === c.key
                                                        ? 'bg-violet-700 text-white font-semibold'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
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
                                        loadData(activeTab, 1, searchQuery, fromDate, toDate, sourceFilter, confidenceFilter);
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

                                                {capture.proof_url ? (
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedDetailCapture(capture)}
                                                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                                                        >
                                                            <Eye size={13} /> Detail Bukti
                                                        </button>
                                                        <a
                                                            href={capture.proof_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
                                                        >
                                                            <Download size={13} /> Buka Tab Baru
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedDetailCapture(capture)}
                                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                                                    >
                                                        <Eye size={13} /> Lihat Detail
                                                    </button>
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
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedDetailCapture(capture)}
                                                                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 shadow-xs transition"
                                                                title="Lihat Detail Bukti Bayar Lengkap"
                                                            >
                                                                <Eye size={14} /> Lihat Detail
                                                            </button>

                                                            {canManage && (
                                                                <>
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
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Duplicate Receipt Warning Banner */}
                                                    {capture.duplicate_receipt_detected && (
                                                        <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-rose-900 shadow-xs">
                                                            <div className="flex items-center gap-2.5">
                                                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white font-bold text-sm shrink-0">⛔</span>
                                                                <div>
                                                                    <p className="font-extrabold text-xs text-rose-900 uppercase tracking-wide">
                                                                        Bukti bayar sudah pernah digunakan
                                                                    </p>
                                                                    <p className="text-[11px] text-rose-700 mt-0.5">
                                                                        Nomor transaksi ({capture.reference_code || capture.analysis?.reference_code || 'struk'}) atau berkas bukti bayar ini sudah pernah diverifikasi sebelumnya. Pembayaran otomatis ditolak untuk mencegah penggunaan bukti bayar ganda.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedDetailCapture(capture)}
                                                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700 transition shrink-0 ml-2"
                                                            >
                                                                <Eye size={13} /> Periksa Detail
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* OCR Extraction Grid */}
                                                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Nominal Terdeteksi</p>
                                                            <p className="mt-1 text-base font-bold text-gray-900">
                                                                Rp {Number(capture.amount || 0).toLocaleString('id-ID')}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <div className="flex items-center justify-between gap-1">
                                                                <p className="text-xs text-gray-500 font-medium">Skor Kepercayaan</p>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                                    capture.provider_used === 'openrouter'
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : capture.provider_used === 'gemini'
                                                                        ? 'bg-purple-100 text-purple-700'
                                                                        : capture.provider_used === 'openai'
                                                                        ? 'bg-blue-100 text-blue-700'
                                                                        : 'bg-gray-200 text-gray-700'
                                                                }`}>
                                                                    {capture.provider_used === 'openrouter'
                                                                        ? '⚡ OpenRouter AI'
                                                                        : capture.provider_used === 'gemini'
                                                                        ? '✨ Gemini AI'
                                                                        : capture.provider_used === 'openai'
                                                                        ? '🤖 OpenAI'
                                                                        : 'Mode Lokal'}
                                                                </span>
                                                            </div>
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
                                                            <p className="text-xs text-gray-500 font-medium">Tanggal & Jam di Struk</p>
                                                            <p className="mt-1 text-xs font-bold text-gray-900 flex items-center gap-1">
                                                                <Calendar size={13} className="text-emerald-600" />
                                                                {capture.receipt_time_display || capture.paid_date_display || capture.paid_date || (analysis.paid_date ? `${analysis.paid_date} ${analysis.paid_time ? analysis.paid_time.slice(0, 5) + ' WIB' : ''}` : '-')}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                                            <p className="text-xs text-gray-500 font-medium">Bank & Tujuan</p>
                                                            <p className="mt-1 text-xs font-semibold text-gray-800 truncate">
                                                                {analysis.payment_channel || 'Transfer Bank / QRIS'} · {analysis.destination_identity?.name || analysis.destination_identity?.account_number || 'Rekening Perusahaan'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* AI Quota / Error Notice */}
                                                    {analysis.ai_error && (
                                                        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 font-medium">
                                                            <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                                                            <span>{analysis.ai_error}</span>
                                                        </div>
                                                    )}

                                                    {/* Linked Customer & Invoice Cards */}
                                                    <div className="mt-3 space-y-2.5">
                                                        {/* Customer Info Card */}
                                                        {capture.customer ? (
                                                            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
                                                                <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                                                                    <div className="flex items-center gap-2.5 text-xs text-emerald-950 min-w-0">
                                                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                                                            <UserCheck size={18} />
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="font-bold text-sm text-gray-900 truncate">{capture.customer.name}</p>
                                                                            <p className="text-gray-600 text-[11px] flex items-center gap-2 flex-wrap">
                                                                                <span>📱 WA: <strong>{capture.customer.phone || '-'}</strong></span>
                                                                                {capture.customer.pppoe_username && (
                                                                                    <span>· PPPoE: <strong className="font-mono text-emerald-700">{capture.customer.pppoe_username}</strong></span>
                                                                                )}
                                                                                {capture.sender_name && (
                                                                                    <span>· Nama WA: <strong className="text-purple-700">"{capture.sender_name}"</strong></span>
                                                                                )}
                                                                                {capture.is_lid && (
                                                                                    <span className="font-mono text-gray-400">· (WA Multi-Device: {capture.sender_lid || capture.sender_phone})</span>
                                                                                )}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        {getCustomerWhatsAppUrl(capture.customer, capture) && (
                                                                            <a
                                                                                href={getCustomerWhatsAppUrl(capture.customer, capture)}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
                                                                                title="Kirim pesan konfirmasi langsung ke WhatsApp pelanggan"
                                                                            >
                                                                                <Phone size={13} />
                                                                                <span>Chat WA</span>
                                                                            </a>
                                                                        )}
                                                                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">
                                                                            Pelanggan Teridentifikasi
                                                                        </span>
                                                                        {canManage && isNeedsReview && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowCustomerSearch((prev) => ({ ...prev, [capture.id]: !isSearchOpen }))}
                                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition ${
                                                                                    isSearchOpen
                                                                                        ? 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300'
                                                                                        : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100/70'
                                                                                }`}
                                                                                title="Ubah pelanggan yang ditautkan ke bukti pembayaran ini"
                                                                            >
                                                                                <User size={13} />
                                                                                <span>{isSearchOpen ? 'Tutup Ubah Pelanggan' : 'Ubah Pelanggan'}</span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Change Customer Inline Form */}
                                                                {isSearchOpen && (
                                                                    <div className="mt-3 pt-3 border-t border-emerald-200 space-y-2">
                                                                        <div className="flex items-center justify-between text-xs">
                                                                            <span className="font-semibold text-emerald-950">
                                                                                Cari dan pilih pelanggan pengganti:
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAssignCustomer(capture.id, null)}
                                                                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1"
                                                                                title="Lepas tautan pelanggan saat ini agar kembali ke status belum terhubung"
                                                                            >
                                                                                <XCircle size={13} />
                                                                                <span>Lepas Tautan Pelanggan</span>
                                                                            </button>
                                                                        </div>

                                                                        {capture.sender_name && (
                                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                                <span className="text-gray-500">Saran:</span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        handleSearchCustomer(capture.id, capture.sender_name);
                                                                                        setCustomerSearchQueries((prev) => ({ ...prev, [capture.id]: capture.sender_name }));
                                                                                    }}
                                                                                    className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-semibold hover:bg-purple-100 transition inline-flex items-center gap-1"
                                                                                >
                                                                                    🔍 Cari nama profil "{capture.sender_name}"
                                                                                </button>
                                                                            </div>
                                                                        )}

                                                                        <div className="relative">
                                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                            <input
                                                                                type="text"
                                                                                value={customerSearchQueries[capture.id] || ''}
                                                                                onChange={(e) => handleSearchCustomer(capture.id, e.target.value)}
                                                                                placeholder="Ketik nama pelanggan, nomor WhatsApp, atau username PPPoE..."
                                                                                className="w-full text-xs rounded-lg border border-emerald-300 pl-8 pr-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                                            />
                                                                        </div>

                                                                        {isSearchingThisCapture && (
                                                                            <p className="text-[11px] text-gray-500 italic">Mencari pelanggan...</p>
                                                                        )}

                                                                        {searchResultsForCapture.length > 0 && (
                                                                            <div className="max-h-48 overflow-y-auto rounded-lg border border-emerald-200 bg-white divide-y divide-gray-100 shadow-sm">
                                                                                {searchResultsForCapture.map((c) => {
                                                                                    const isCurrent = capture.customer?.id === c.id;
                                                                                    return (
                                                                                        <div
                                                                                            key={c.id}
                                                                                            className={`flex items-center justify-between p-2.5 transition ${
                                                                                                isCurrent ? 'bg-emerald-50 font-semibold' : 'hover:bg-emerald-50/50 cursor-pointer'
                                                                                            }`}
                                                                                            onClick={() => !isCurrent && handleAssignCustomer(capture.id, c.id)}
                                                                                        >
                                                                                            <div>
                                                                                                <span className="font-bold text-gray-900 text-xs">{c.name}</span>
                                                                                                <span className="text-gray-500 text-[11px] ml-2">WA: {c.phone || '-'}</span>
                                                                                                {c.pppoe_username && (
                                                                                                    <span className="text-emerald-700 text-[11px] ml-1 font-mono">({c.pppoe_username})</span>
                                                                                                )}
                                                                                                {isCurrent && (
                                                                                                    <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                                                                                        Pelanggan Saat Ini
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <button
                                                                                                type="button"
                                                                                                disabled={isCurrent}
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    if (!isCurrent) handleAssignCustomer(capture.id, c.id);
                                                                                                }}
                                                                                                className={`px-2.5 py-1 rounded font-semibold text-[11px] transition ${
                                                                                                    isCurrent
                                                                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                                                                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                                                                                }`}
                                                                                            >
                                                                                                {isCurrent ? 'Terpilih' : 'Pilih & Ganti'}
                                                                                            </button>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs">
                                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                    <div className="flex items-center gap-2 text-amber-900">
                                                                        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                                                                        <div>
                                                                            <span className="font-bold">Pelanggan belum terhubung secara otomatis.</span>
                                                                            <div className="mt-0.5 text-gray-600 flex items-center gap-2 flex-wrap">
                                                                                {capture.is_lid ? (
                                                                                    <span>📱 ID Perangkat WA: <strong className="font-mono text-gray-800">{capture.sender_lid || capture.sender_phone}</strong> (Multi-Device)</span>
                                                                                ) : (
                                                                                    <span>📱 Nomor Pengirim WA: <strong>{capture.sender_phone}</strong></span>
                                                                                )}
                                                                                {capture.sender_name && (
                                                                                    <span>· Nama Profil WA: <strong className="text-purple-700">"{capture.sender_name}"</strong></span>
                                                                                )}
                                                                            </div>
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
                                                                        {capture.sender_name && (
                                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                                <span className="text-gray-500">Saran:</span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        handleSearchCustomer(capture.id, capture.sender_name);
                                                                                        setCustomerSearchQueries((prev) => ({ ...prev, [capture.id]: capture.sender_name }));
                                                                                    }}
                                                                                    className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-semibold hover:bg-purple-100 transition inline-flex items-center gap-1"
                                                                                >
                                                                                    🔍 Cari nama profil "{capture.sender_name}"
                                                                                </button>
                                                                            </div>
                                                                        )}
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
                                                                                            Tautkan & Ingat
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
                                                                    const isAlreadyPaid = inv.status === 'paid';

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
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <span className="font-bold font-mono text-gray-900">{inv.invoice_link}</span>
                                                                                        {inv.customer && (
                                                                                            <span className="text-gray-600">({inv.customer.name})</span>
                                                                                        )}
                                                                                        {isAlreadyPaid ? (
                                                                                            <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 font-bold text-[10px]">
                                                                                                Invoice Sudah Lunas
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 font-bold text-[10px]">
                                                                                                Status: {inv.status}
                                                                                            </span>
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
                    {/* Local Free Verification Engine Card */}
                    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40 p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                                    <ShieldCheck size={22} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">Engine Verifikasi Pembayaran Lokal (100% Gratis & Mandiri)</h3>
                                    <p className="text-xs text-gray-500">Berjalan langsung di server lokal tanpa memerlukan API Key berbayar, kuota eksternal, atau langganan pihak ketiga.</p>
                                </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 w-fit">
                                <CheckCircle2 size={13} /> Mesin Lokal Aktif
                            </span>
                        </div>

                        {/* Feature Badges */}
                        <div className="grid gap-3 sm:grid-cols-3 pt-1">
                            <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-xs">
                                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                    <UserCheck size={14} className="text-emerald-600" /> Resolusi Pelanggan Cerdas
                                </p>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Mendeteksi pelanggan otomatis via Nomor WhatsApp, Username PPPoE, & Tagihan Belum Lunas.
                                </p>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-xs">
                                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                    <Building2 size={14} className="text-emerald-600" /> Parsing Rekening & QRIS
                                </p>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Mengenali bukti transfer BCA, BRI, Mandiri, BNI, QRIS, DANA, OVO, GoPay, Seabank, dll.
                                </p>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-xs">
                                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-emerald-600" /> Local OCR & Pattern Matcher
                                </p>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Membaca teks dari gambar dan mencocokkan tagihan pelanggan dengan akurasi tinggi secara lokal.
                                </p>
                            </div>
                        </div>

                        {/* Auto-Approval & Threshold Controls */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-900">Persetujuan Otomatis (Auto-Approve)</p>
                                    <p className="text-[11px] text-gray-500">Otomatis menandai tagihan lunas jika nominal dan identitas pelanggan cocok 100%.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config?.auto_approve_enabled ?? true}
                                        onChange={(e) => setConfig((p) => ({ ...p, auto_approve_enabled: e.target.checked }))}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                </label>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-gray-100">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Ambang Batas Auto-Approve (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="50"
                                        max="100"
                                        value={config?.confidence_thresholds?.auto_approve ?? 95}
                                        onChange={(e) => setConfig((p) => ({
                                            ...p,
                                            confidence_thresholds: {
                                                ...p.confidence_thresholds,
                                                auto_approve: Number(e.target.value),
                                            },
                                        }))}
                                        className="w-full text-xs rounded-xl border border-gray-300 p-2 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Ambang Batas Review Manual (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="30"
                                        max="90"
                                        value={config?.confidence_thresholds?.manual_review ?? 70}
                                        onChange={(e) => setConfig((p) => ({
                                            ...p,
                                            confidence_thresholds: {
                                                ...p.confidence_thresholds,
                                                manual_review: Number(e.target.value),
                                            },
                                        }))}
                                        className="w-full text-xs rounded-xl border border-gray-300 p-2 bg-white"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Vision Engine Card */}
                    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/30 p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                                    <Bot size={22} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">AI Vision Engine (Gemini & OpenAI)</h3>
                                    <p className="text-xs text-gray-500">
                                        Menganalisis visual foto bukti transfer (SeaBank, QRIS, BCA, BRI, Mandiri, e-Wallet) dengan ketelitian membaca Tanggal, Jam, Nominal, No. Transaksi, dan Nama Pengirim.
                                    </p>
                                </div>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                (config?.gemini_api_key || config?.openai_api_key) ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                                <Sparkles size={13} />
                                {(config?.gemini_api_key || config?.openai_api_key) ? 'AI Vision Siap Digunakan' : 'Mode Fallback Pola Lokal'}
                            </span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 pt-1">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Penyedia AI Vision (AI Provider)
                                </label>
                                <select
                                    value={config?.ai_provider || 'openrouter'}
                                    onChange={(e) => setConfig((p) => ({ ...p, ai_provider: e.target.value }))}
                                    className="w-full text-xs rounded-xl border border-gray-300 p-2.5 bg-white font-medium"
                                >
                                    <option value="openrouter">⚡ OpenRouter AI (Direkomendasikan - Sangat Cepat & Akurat)</option>
                                    <option value="auto">Auto (OpenRouter &rarr; Gemini &rarr; OpenAI)</option>
                                    <option value="gemini">Google Gemini Vision</option>
                                    <option value="openai">OpenAI Direct (GPT-4o-mini)</option>
                                    <option value="local">Hanya Mesin Pola Lokal (Tanpa AI Cloud)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Model OpenRouter Vision
                                </label>
                                <input
                                    type="text"
                                    value={config?.openrouter_model || 'google/gemini-2.5-flash'}
                                    onChange={(e) => setConfig((p) => ({ ...p, openrouter_model: e.target.value }))}
                                    placeholder="google/gemini-2.5-flash"
                                    className="w-full text-xs rounded-xl border border-gray-300 p-2.5 bg-white font-mono"
                                />
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    Pilihan: <code className="bg-gray-100 px-1 rounded cursor-pointer" onClick={() => setConfig(p => ({ ...p, openrouter_model: 'google/gemini-2.5-flash' }))}>google/gemini-2.5-flash</code> (Rekomendasi), <code className="bg-gray-100 px-1 rounded cursor-pointer" onClick={() => setConfig(p => ({ ...p, openrouter_model: 'openai/gpt-4o-mini' }))}>openai/gpt-4o-mini</code>, <code className="bg-gray-100 px-1 rounded cursor-pointer" onClick={() => setConfig(p => ({ ...p, openrouter_model: 'google/gemini-3.5-flash' }))}>google/gemini-3.5-flash</code>
                                </p>
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 font-bold text-amber-700">
                                        ⚡ OpenRouter API Key (Aktif Digunakan)
                                    </span>
                                    <a
                                        href="https://openrouter.ai/keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-normal inline-flex items-center gap-1"
                                    >
                                        Buka Dashboard OpenRouter <ExternalLink size={11} />
                                    </a>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showOpenRouterKey ? 'text' : 'password'}
                                        value={config?.openrouter_api_key || ''}
                                        onChange={(e) => setConfig((p) => ({ ...p, openrouter_api_key: e.target.value }))}
                                        placeholder="sk-or-v1-..."
                                        className="w-full text-xs rounded-xl border border-amber-300 p-2.5 pr-10 bg-amber-50/30 font-mono focus:border-amber-500 focus:ring-amber-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                                        title={showOpenRouterKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                                    >
                                        {showOpenRouterKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    OpenRouter AI membaca bukti transfer WhatsApp dengan model Gemini 2.5 Flash / GPT-4o-mini yang sangat akurat membaca struk dark mode maupun blur.
                                </p>
                            </div>

                            <div className="sm:col-span-2 border-t border-gray-100 pt-3">
                                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                                    <span>Google Gemini API Key (Cadangan Langsung)</span>
                                    <a
                                        href="https://aistudio.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-normal inline-flex items-center gap-1"
                                    >
                                        Google AI Studio <ExternalLink size={11} />
                                    </a>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showGeminiKey ? 'text' : 'password'}
                                        value={config?.gemini_api_key || ''}
                                        onChange={(e) => setConfig((p) => ({ ...p, gemini_api_key: e.target.value }))}
                                        placeholder="AIzaSy... (Opsional sebagai cadangan)"
                                        className="w-full text-xs rounded-xl border border-gray-300 p-2.5 pr-10 bg-white font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                                        title={showGeminiKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                                    >
                                        {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                                    <span>OpenAI API Key (Cadangan Langsung)</span>
                                    <span className="text-xs text-gray-400 font-normal">GPT-4o-mini</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showOpenAiKey ? 'text' : 'password'}
                                        value={config?.openai_api_key || ''}
                                        onChange={(e) => setConfig((p) => ({ ...p, openai_api_key: e.target.value }))}
                                        placeholder="sk-proj-... (Opsional)"
                                        className="w-full text-xs rounded-xl border border-gray-300 p-2.5 pr-10 bg-white font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                                        title={showOpenAiKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                                    >
                                        {showOpenAiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => handleSaveConfig()}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-60"
                            >
                                <Save size={14} />
                                {saving ? 'Menyimpan...' : 'Simpan Pengaturan AI'}
                            </button>
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

            {/* MODAL: BULK APPROVE CONFIRMATION */}
            <Modal
                isOpen={bulkConfirmModal.open}
                onClose={() => setBulkConfirmModal({ open: false, minConfidence: 90 })}
                title="⚡ Konfirmasi Massal Pembayaran AI"
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-xs text-violet-900 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-sm text-violet-950">
                            <Sparkles size={18} className="text-violet-600 shrink-0" />
                            <span>Auto-Konfirmasi Pembayaran (Skor AI ≥ 90%)</span>
                        </div>
                        <p className="leading-relaxed">
                            Sistem akan secara otomatis menyetujui seluruh capture bukti transfer yang berada di antrean review manual dengan skor AI minimal <strong>90%</strong>.
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-700">
                            <li>Tagihan kandidat akan diupdate menjadi <strong>Lunas (Paid)</strong>.</li>
                            <li>Foto bukti transfer akan otomatis dilampirkan ke invoice.</li>
                            <li>Tanggal jatuh tempo pelanggan akan diperpanjang <strong>+30 hari</strong>.</li>
                            <li>Isolir MikroTik pelanggan akan dibuka otomatis.</li>
                            <li>Transaksi dicatat ke buku kas (Financial Ledger) & notifikasi WA dikirimkan.</li>
                        </ul>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setBulkConfirmModal({ open: false, minConfidence: 90 })}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={() => handleBulkApprove(bulkConfirmModal.minConfidence)}
                            disabled={bulkLoading}
                            className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
                        >
                            {bulkLoading ? (
                                <>
                                    <RefreshCw size={13} className="animate-spin" />
                                    <span>Memproses...</span>
                                </>
                            ) : (
                                <>
                                    <Check size={14} />
                                    <span>Ya, Konfirmasi Semua Sekarang</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: DETAIL BUKTI PEMBAYARAN */}
            <Modal
                isOpen={!!selectedDetailCapture}
                onClose={handleCloseDetailModal}
                title={selectedDetailCapture ? `Detail Bukti Pembayaran (Capture #${selectedDetailCapture.id})` : 'Detail Bukti Pembayaran'}
                size="2xl"
            >
                {selectedDetailCapture && (() => {
                    const c = selectedDetailCapture;
                    const analysis = c.analysis || {};
                    const isDuplicate = Boolean(c.duplicate_receipt_detected || c.failure_reason === 'duplicate_reference_code');
                    const refNumber = c.reference_code || analysis.reference_code;
                    const isNeedsReview = c.match_status === 'needs_review' || c.match_status === 'pending';

                    return (
                        <div className="space-y-4 text-slate-800">
                            {/* Duplicate Warning Banner */}
                            {isDuplicate && (
                                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-rose-900 shadow-xs">
                                    <div className="flex items-center gap-2 font-extrabold text-sm text-rose-800">
                                        <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                                        <span>⛔ Bukti bayar sudah pernah digunakan</span>
                                    </div>
                                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                                        Nomor transaksi ({refNumber || 'struk'}) atau berkas bukti pembayaran ini sudah pernah terverifikasi/disetujui pada tagihan sebelumnya. Sistem secara otomatis menolak pembayaran ini untuk mencegah kecurangan klaim struk ganda.
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-5 md:grid-cols-[230px_1fr]">
                                {/* Image Box */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative group w-full h-64 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shadow-xs">
                                        {c.proof_url ? (
                                            <>
                                                <img
                                                    src={c.proof_url}
                                                    alt={`Bukti Bayar #${c.id}`}
                                                    className="h-full w-full object-contain p-1.5"
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewImageUrl(c.proof_url)}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white font-medium text-xs gap-1.5"
                                                >
                                                    <ZoomIn size={16} /> Perbesar Foto
                                                </button>
                                            </>
                                        ) : (
                                            <div className="text-center p-4 text-slate-400 text-xs">
                                                <FileText size={32} className="mx-auto text-slate-300 mb-1" />
                                                <span>Bukti fisik tidak tersedia</span>
                                            </div>
                                        )}
                                    </div>

                                    {c.proof_url && (
                                        <div className="flex items-center gap-2 w-full">
                                            <button
                                                type="button"
                                                onClick={() => setPreviewImageUrl(c.proof_url)}
                                                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                                            >
                                                <ZoomIn size={13} /> Zoom
                                            </button>
                                            <a
                                                href={c.proof_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition shadow-xs"
                                            >
                                                <ExternalLink size={13} /> Buka Tab
                                            </a>
                                        </div>
                                    )}

                                    {/* Upload Ulang / Ganti Foto jika blur */}
                                    <div className="w-full mt-1">
                                        <input
                                            type="file"
                                            id={`replace-photo-${c.id}`}
                                            accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    handleReanalyze(c.id, file);
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                        <label
                                            htmlFor={`replace-photo-${c.id}`}
                                            className="cursor-pointer w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 hover:bg-amber-100/70 px-3 py-2 text-xs font-semibold text-amber-800 transition shadow-2xs text-center"
                                            title="Ganti foto struk dengan file asli yang lebih jernih"
                                        >
                                            <UploadCloud size={14} className="text-amber-600 shrink-0" />
                                            <span>Ganti / Upload Ulang Foto Struk</span>
                                        </label>
                                        <p className="text-[10px] text-slate-400 text-center mt-1">
                                            Upload foto asli jika bukti dari WA sebelumnya terpotong / blur.
                                        </p>
                                    </div>
                                </div>

                                {/* Information Box */}
                                <div className="space-y-3.5">
                                    {/* Receipt Extraction */}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5 shadow-xs">
                                        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                                <FileText size={14} className="text-emerald-600" />
                                                Rincian Transaksi di Struk
                                            </span>
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                c.match_status === 'approved'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : isDuplicate
                                                        ? 'bg-rose-100 text-rose-800'
                                                        : 'bg-amber-100 text-amber-800'
                                            }`}>
                                                {c.match_status?.toUpperCase()}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <span className="text-slate-500 block text-[11px]">Nominal Transfer:</span>
                                                <span className="text-base font-extrabold text-slate-900">
                                                    Rp {Number(c.amount || 0).toLocaleString('id-ID')}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block text-[11px]">Metode / Saluran:</span>
                                                <span className="font-bold text-slate-800">
                                                    {analysis.payment_channel || 'Transfer Bank / QRIS'}
                                                </span>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-slate-500 block text-[11px]">No. Transaksi / Referensi Unik:</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="font-mono text-xs font-bold bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-900">
                                                        {refNumber || '-'}
                                                    </span>
                                                    {refNumber && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(refNumber);
                                                                setCopiedRef(true);
                                                                setTimeout(() => setCopiedRef(false), 2000);
                                                            }}
                                                            className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 font-medium"
                                                            title="Salin No. Referensi"
                                                        >
                                                            <Copy size={12} />
                                                            <span>{copiedRef ? 'Tersalin!' : 'Salin'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block text-[11px]">Pengirim / Pemilik Rek:</span>
                                                <span className="font-semibold text-slate-800">
                                                    {analysis.sender_name || c.sender_phone || '-'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block text-[11px]">Waktu di Struk:</span>
                                                <span className="font-semibold text-slate-800">
                                                    {c.receipt_time_display || c.paid_date_display || c.paid_date || '-'}
                                                </span>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-slate-500 block text-[11px]">Tujuan / Rekening Perusahaan:</span>
                                                <span className="font-semibold text-slate-800">
                                                    {analysis.destination_identity?.name || analysis.destination_identity?.account_number || analysis.destination_identity?.merchant_id || 'Rekening Perusahaan'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Linked Customer & Invoice */}
                                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2 text-xs">
                                        <div className="flex items-center justify-between">
                                            <p className="font-bold text-blue-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                                <User size={13} className="text-blue-600" />
                                                Pelanggan & Tagihan Terhubung
                                            </p>
                                            {canManage && isNeedsReview && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCustomerSearch((prev) => ({ ...prev, [c.id]: !showCustomerSearch[c.id] }))}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 font-semibold text-[11px] transition shadow-xs"
                                                >
                                                    <User size={12} />
                                                    <span>{showCustomerSearch[c.id] ? 'Tutup Ubah' : (c.customer ? 'Ubah Pelanggan' : 'Tautkan Pelanggan')}</span>
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <span className="text-slate-500 block text-[11px]">Nama Pelanggan:</span>
                                                <span className="font-bold text-slate-900">
                                                    {c.customer?.name || 'Belum Terhubung'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block text-[11px]">No. WhatsApp:</span>
                                                <span className="font-semibold text-slate-800">
                                                    {c.customer?.phone || c.sender_phone || '-'}
                                                </span>
                                            </div>
                                            {c.customer?.pppoe_username && (
                                                <div>
                                                    <span className="text-slate-500 block text-[11px]">PPPoE Username:</span>
                                                    <span className="font-mono font-bold text-blue-700">
                                                        {c.customer.pppoe_username}
                                                    </span>
                                                </div>
                                            )}
                                            {c.invoice && (
                                                <div>
                                                    <span className="text-slate-500 block text-[11px]">Invoice Terpaut:</span>
                                                    <a
                                                        href={`/invoice/${c.invoice.invoice_link}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="font-bold text-blue-700 underline inline-flex items-center gap-0.5"
                                                    >
                                                        {c.invoice.invoice_link} <ExternalLink size={10} />
                                                    </a>
                                                    <span className="text-slate-500 block text-[10px]">
                                                        Rp {Number(c.invoice.amount || 0).toLocaleString('id-ID')} · {c.invoice.status}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Inline Customer Search inside Detail Modal */}
                                        {showCustomerSearch[c.id] && (
                                            <div className="mt-3 pt-3 border-t border-blue-200 space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-semibold text-blue-950">
                                                        {c.customer ? 'Cari & pilih pelanggan pengganti:' : 'Cari & tautkan pelanggan:'}
                                                    </span>
                                                    {c.customer && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAssignCustomer(c.id, null)}
                                                            className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1"
                                                            title="Lepas tautan pelanggan saat ini"
                                                        >
                                                            <XCircle size={12} />
                                                            <span>Lepas Tautan Pelanggan</span>
                                                        </button>
                                                    )}
                                                </div>

                                                {c.sender_name && (
                                                    <div className="flex items-center gap-2 text-[11px]">
                                                        <span className="text-gray-500">Saran:</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                handleSearchCustomer(c.id, c.sender_name);
                                                                setCustomerSearchQueries((prev) => ({ ...prev, [c.id]: c.sender_name }));
                                                            }}
                                                            className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-semibold hover:bg-purple-100 transition inline-flex items-center gap-1"
                                                        >
                                                            🔍 Cari nama profil "{c.sender_name}"
                                                        </button>
                                                    </div>
                                                )}

                                                <div className="relative">
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={customerSearchQueries[c.id] || ''}
                                                        onChange={(e) => handleSearchCustomer(c.id, e.target.value)}
                                                        placeholder="Ketik nama pelanggan, nomor WhatsApp, atau username PPPoE..."
                                                        className="w-full text-xs rounded-lg border border-blue-300 pl-8 pr-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </div>

                                                {isSearchingCustomer[c.id] && (
                                                    <p className="text-[11px] text-gray-500 italic">Mencari pelanggan...</p>
                                                )}

                                                {(customerSearchResults[c.id] || []).length > 0 && (
                                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-blue-200 bg-white divide-y divide-gray-100 shadow-sm">
                                                        {(customerSearchResults[c.id] || []).map((cust) => {
                                                            const isCurrent = c.customer?.id === cust.id;
                                                            return (
                                                                <div
                                                                    key={cust.id}
                                                                    className={`flex items-center justify-between p-2 text-xs transition ${
                                                                        isCurrent ? 'bg-blue-50' : 'hover:bg-blue-50/50 cursor-pointer'
                                                                    }`}
                                                                    onClick={() => !isCurrent && handleAssignCustomer(c.id, cust.id)}
                                                                >
                                                                    <div>
                                                                        <span className="font-bold text-gray-900">{cust.name}</span>
                                                                        <span className="text-gray-500 text-[11px] ml-2">WA: {cust.phone || '-'}</span>
                                                                        {cust.pppoe_username && (
                                                                            <span className="text-blue-700 text-[11px] ml-1 font-mono">({cust.pppoe_username})</span>
                                                                        )}
                                                                        {isCurrent && (
                                                                            <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                                                                Saat ini dipilih
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        disabled={isCurrent}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!isCurrent) handleAssignCustomer(c.id, cust.id);
                                                                        }}
                                                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                                                                            isCurrent
                                                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                                                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                                                        }`}
                                                                    >
                                                                        {isCurrent ? 'Terpilih' : 'Pilih'}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* AI Verification Score */}
                                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs shadow-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                                <Sparkles size={13} className="text-violet-600" />
                                                Verifikasi & Analisis AI
                                            </span>
                                            <span className="font-bold text-slate-800">
                                                Skor AI: {Number(c.match_confidence || 0).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                            <div
                                                className={`h-full ${
                                                    Number(c.match_confidence || 0) >= 90
                                                        ? 'bg-emerald-500'
                                                        : Number(c.match_confidence || 0) >= 70
                                                            ? 'bg-amber-500'
                                                            : 'bg-rose-500'
                                                }`}
                                                style={{ width: `${Math.min(100, Math.max(0, c.match_confidence || 0))}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[11px] text-slate-500">
                                            <span>Sumber: <strong>{c.source}</strong></span>
                                            <span>Masuk: <strong>{c.created_at_display || '-'}</strong></span>
                                        </div>
                                        {c.failure_reason && (
                                            <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded p-1.5">
                                                Catatan Validasi: {c.failure_reason}
                                            </p>
                                        )}
                                    </div>

                                    {/* Collapsible Raw OCR */}
                                    {analysis.ocr_raw_text && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setShowOcrRawText(!showOcrRawText)}
                                                className="flex w-full items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-900"
                                            >
                                                <span>Teks Mentah Hasil Scan OCR Struk</span>
                                                <span className="text-[11px] text-blue-600 font-bold">{showOcrRawText ? 'Sembunyikan ▲' : 'Lihat Teks ▼'}</span>
                                            </button>
                                            {showOcrRawText && (
                                                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white border border-slate-200 p-2.5 font-mono text-[11px] text-slate-700">
                                                    {analysis.ocr_raw_text}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                                <div className="flex items-center gap-2">
                                    {canManage && isNeedsReview && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleResolve(c.id, 'approve');
                                                    handleCloseDetailModal();
                                                }}
                                                disabled={refreshing}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition"
                                            >
                                                <Check size={14} /> Konfirmasi & Lunaskan
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleResolve(c.id, 'reject');
                                                    handleCloseDetailModal();
                                                }}
                                                disabled={refreshing}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60 transition"
                                            >
                                                <X size={14} /> Tolak Bukti Bayar
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCloseDetailModal}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>
        </div>
    );
}

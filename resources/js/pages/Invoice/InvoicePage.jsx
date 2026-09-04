import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
    Clock, Download, Upload, Phone, CheckCircle, AlertCircle, XCircle,
    QrCode, Building2, Copy, Check, CreditCard, ChevronRight, Wifi,
    Calendar, User, MapPin, FileText, Printer, Zap, Sparkles, ExternalLink,
    RefreshCw, ShieldCheck, ArrowRight
} from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';

function InvoicePage() {
    const { invoiceLink } = useParams();
    const [invoice, setInvoice] = useState(null);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [selectedMethod, setSelectedMethod] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Payment Gateway (iPaymu) State
    const [gatewayActive, setGatewayActive] = useState(false);
    const [paymentTab, setPaymentTab] = useState('gateway'); // 'gateway' | 'manual'
    const [gatewayChannel, setGatewayChannel] = useState('qris'); // 'qris' | 'va' | 'redirect'
    const [gatewayBank, setGatewayBank] = useState('bca');
    const [gatewayLoading, setGatewayLoading] = useState(false);
    const [gatewayData, setGatewayData] = useState(null);
    const [gatewayError, setGatewayError] = useState('');
    const [checkingStatus, setCheckingStatus] = useState(false);

    // Manual Payment Modal State
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [paidAmount, setPaidAmount] = useState('');
    const [file, setFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copiedField, setCopiedField] = useState(null);
    const [noProofIntent, setNoProofIntent] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [fileInfo, setFileInfo] = useState(null);

    const pollingRef = useRef(null);

    useEffect(() => {
        fetchData();
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [invoiceLink]);

    // Auto-poll status if gateway session is active and invoice is unpaid
    useEffect(() => {
        if (gatewayData && invoice && invoice.status !== 'paid') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = setInterval(async () => {
                try {
                    const res = await fetch(`/api/invoice/${invoiceLink}`);
                    if (res.ok) {
                        const json = await res.json();
                        if (json.data?.status === 'paid') {
                            setInvoice(json.data);
                            clearInterval(pollingRef.current);
                        }
                    }
                } catch (e) {
                    // ignore polling errors
                }
            }, 5000);
        }
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [gatewayData, invoice, invoiceLink]);

    const MAX_PROOF_SIZE = 2 * 1024 * 1024;
    const ALLOWED_PROOF_MIME_TYPES = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'application/pdf',
    ]);
    const ALLOWED_PROOF_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'pdf', 'webp', 'heic', 'heif']);

    const formatFileSize = (bytes) => {
        if (!bytes && bytes !== 0) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const getFileExtension = (name) => {
        if (!name) return '';
        const parts = name.split('.');
        if (parts.length < 2) return '';
        return parts[parts.length - 1].toLowerCase();
    };

    const validateProofFile = (selectedFile) => {
        if (!selectedFile) return { valid: false, message: 'File bukti pembayaran tidak ditemukan.' };

        if (selectedFile.size > MAX_PROOF_SIZE) {
            return { valid: false, message: 'Ukuran file melebihi 2MB. Gunakan file yang lebih kecil.' };
        }

        const extension = getFileExtension(selectedFile.name);
        const hasAllowedExtension = extension && ALLOWED_PROOF_EXTENSIONS.has(extension);
        const hasAllowedMime = selectedFile.type && ALLOWED_PROOF_MIME_TYPES.has(selectedFile.type);

        if (!hasAllowedMime && !hasAllowedExtension) {
            return { valid: false, message: 'Format file tidak didukung. Gunakan JPG, PNG, PDF, WEBP, HEIC, atau HEIF.' };
        }

        return { valid: true, message: '' };
    };

    const resetFileSelection = () => {
        if (filePreview) {
            URL.revokeObjectURL(filePreview);
        }
        setFile(null);
        setFilePreview(null);
        setFileInfo(null);
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [invoiceRes, methodsRes] = await Promise.all([
                fetch(`/api/invoice/${invoiceLink}`),
                fetch('/api/payment-methods/active')
            ]);
            
            if (!invoiceRes.ok) throw new Error('Invoice tidak ditemukan');
            
            const invoiceData = await invoiceRes.json();
            const methodsData = await methodsRes.json();
            
            setInvoice(invoiceData.data);
            setPaidAmount(invoiceData.data.amount);
            setPaymentMethods(methodsData);

            const isPgActive = invoiceData.payment_gateway?.is_active ?? false;
            setGatewayActive(isPgActive);
            setPaymentTab(isPgActive ? 'gateway' : 'manual');
            
            // Set default payment method for manual
            const defaultMethod = methodsData.find(m => m.is_default) || methodsData[0];
            if (defaultMethod) setSelectedMethod(defaultMethod);
        } catch (err) {
            setError('Invoice tidak ditemukan atau sudah tidak valid');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateIpaymuPayment = async (channelOverride = null, bankOverride = null) => {
        const methodToUse = channelOverride || gatewayChannel;
        const bankToUse = bankOverride || gatewayBank;

        setGatewayLoading(true);
        setGatewayError('');
        setGatewayData(null);

        try {
            const res = await fetch(`/api/invoice/${invoiceLink}/pay-ipaymu`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    payment_method: methodToUse,
                    va_bank: bankToUse,
                }),
            });

            const json = await res.json();
            if (json.success && json.response?.Data) {
                setGatewayData(json.response.Data);
            } else if (json.message) {
                setGatewayError(json.message);
            } else {
                setGatewayError('Gagal membuat sesi pembayaran online. Silakan coba metode lain.');
            }
        } catch (err) {
            setGatewayError('Koneksi ke server pembayaran terganggu. Silakan gunakan metode manual.');
        } finally {
            setGatewayLoading(false);
        }
    };

    const checkManualStatus = async () => {
        setCheckingStatus(true);
        try {
            const res = await fetch(`/api/invoice/${invoiceLink}`);
            if (res.ok) {
                const json = await res.json();
                setInvoice(json.data);
                if (json.data?.status === 'paid') {
                    setSuccess('Pembayaran Anda telah berhasil diverifikasi lunas!');
                }
            }
        } finally {
            setCheckingStatus(false);
        }
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        const validation = validateProofFile(selectedFile);
        if (!validation.valid) {
            resetFileSelection();
            setFieldErrors((prev) => ({ ...prev, bukti_pembayaran: validation.message }));
            e.target.value = '';
            return;
        }

        setFieldErrors((prev) => ({ ...prev, bukti_pembayaran: '' }));
        setNoProofIntent(false);
        setFile(selectedFile);
        setFileInfo({
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type || getFileExtension(selectedFile.name),
        });

        if (filePreview) URL.revokeObjectURL(filePreview);
        if (selectedFile.type?.startsWith('image/')) {
            setFilePreview(URL.createObjectURL(selectedFile));
        } else {
            setFilePreview(null);
        }
    };

    const openConfirmModal = () => {
        resetFileSelection();
        setNoProofIntent(false);
        setFieldErrors({});
        setFormError('');
        setShowConfirmModal(true);
    };

    const closeConfirmModal = () => {
        resetFileSelection();
        setNoProofIntent(false);
        setFieldErrors({});
        setFormError('');
        setShowConfirmModal(false);
    };

    const handleSubmitConfirmation = async (e) => {
        e.preventDefault();
        setFieldErrors({});
        setFormError('');

        if (!paidAmount || Number(paidAmount) <= 0) {
            setFieldErrors((prev) => ({ ...prev, paid_amount: 'Nominal pembayaran wajib diisi.' }));
            return;
        }

        if (!file && !noProofIntent) {
            setFieldErrors((prev) => ({
                ...prev,
                bukti_pembayaran: 'Unggah bukti pembayaran atau centang opsi kirim tanpa bukti.',
            }));
            return;
        }

        try {
            setSubmitting(true);
            const formData = new FormData();
            formData.append('paid_amount', paidAmount);
            formData.append('payment_method_id', selectedMethod?.id || '');
            formData.append('no_proof', noProofIntent ? '1' : '0');

            if (file) {
                formData.append('bukti_pembayaran', file);
            }

            const response = await fetch(`/invoice/${invoice.id}/konfirmasi`, {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json',
                },
                body: formData,
            });

            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            const isJson = contentType.includes('application/json');
            const payload = isJson ? await response.json() : null;

            if (!response.ok) {
                if (response.status === 422 && payload?.errors) {
                    const normalizedErrors = Object.entries(payload.errors).reduce((acc, [key, messages]) => {
                        acc[key] = Array.isArray(messages) ? messages[0] : messages;
                        return acc;
                    }, {});
                    setFieldErrors(normalizedErrors);
                    setFormError(payload?.message || 'Data konfirmasi pembayaran tidak valid.');
                    return;
                }

                setFormError(payload?.message || 'Gagal mengirim konfirmasi pembayaran.');
                return;
            }
            
            closeConfirmModal();
            await fetchData();
            setSuccess('Konfirmasi berhasil terkirim! Admin akan memeriksa pembayaran Anda.');
        } catch (err) {
            setFormError(err.message || 'Gagal mengirim konfirmasi pembayaran');
        } finally {
            setSubmitting(false);
        }
    };

    const copyToClipboard = (text, fieldName = null) => {
        navigator.clipboard.writeText(text);
        if (fieldName) {
            setCopiedField(fieldName);
            setTimeout(() => setCopiedField(null), 2000);
        } else {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handlePrintInvoice = () => {
        const printUrl = "/invoice/" + encodeURIComponent(invoiceLink) + "/print";
        const printWindow = window.open(printUrl, "_blank", "width=1200,height=800");
        if (!printWindow) {
            setError("Popup cetak diblokir browser. Izinkan popup lalu coba lagi.");
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const getTimeRemaining = (dueDate) => {
        if (!dueDate) return { text: '', isLate: false };
        const now = new Date();
        const due = new Date(dueDate);
        const diff = due - now;
        
        if (diff < 0) {
            const days = Math.abs(Math.floor(diff / (1000 * 60 * 60 * 24)));
            return { text: `Terlambat ${days} hari`, isLate: true };
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (days > 0) return { text: `${days} hari ${hours} jam lagi`, isLate: false };
        return { text: `${hours} jam lagi`, isLate: false };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 flex items-center justify-center p-4">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-14 w-14 border-4 border-emerald-400 border-t-transparent mx-auto"></div>
                    <p className="text-white/80 font-semibold text-sm">Memuat Tagihan Invoice...</p>
                </div>
            </div>
        );
    }

    if (error && !invoice) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center space-y-4">
                    <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
                        <XCircle className="text-rose-500" size={40} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Invoice Tidak Ditemukan</h1>
                    <p className="text-gray-600 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    const isPaid = invoice?.status === 'paid';
    const isCancelled = invoice?.status === 'cancelled';
    const isWaiting = invoice?.status === 'menunggu konfirmasi';
    const isRejected = invoice?.tolak_info;
    const timeRemaining = getTimeRemaining(invoice?.due_date);
    const canSubmit = !submitting && (file || noProofIntent);

    const qrString = gatewayData?.QrString || (gatewayData?.PaymentNo?.startsWith('000201') ? gatewayData.PaymentNo : null);
    const qrImageSrc = gatewayData?.qr_image_url || (qrString ? `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrString)}` : null);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 py-6 sm:py-10 px-3 sm:px-4 overflow-x-clip font-sans text-slate-100">
            <div className="max-w-xl mx-auto space-y-4">
                
                {/* Main Card */}
                <div className="bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
                    
                    {/* Header */}
                    <div className="pt-8 px-6 pb-6 relative overflow-hidden bg-gradient-to-b from-slate-50 to-white border-b border-gray-100">
                        <div className="text-center mb-5">
                            <img src="/logo_baru.png" alt="Rumah Kita Net" className="h-12 mx-auto mb-2.5" />
                            <h1 className="text-xl font-black text-gray-900 tracking-tight">Tagihan Layanan Internet</h1>
                            <p className="text-xs text-gray-500 font-mono font-semibold">
                                #{invoice?.invoice_number || invoiceLink.slice(0, 10).toUpperCase()}
                            </p>
                        </div>

                        {/* Status Badge */}
                        <div className="flex justify-center mb-4">
                            {isPaid ? (
                                <div className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full shadow-lg shadow-emerald-500/30">
                                    <CheckCircle size={18} />
                                    <span className="font-extrabold text-sm">LUNAS / PEMBAYARAN BERHASIL</span>
                                </div>
                            ) : isCancelled ? (
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-full shadow-md">
                                    <XCircle size={18} />
                                    <span className="font-semibold text-sm">Invoice Tidak Aktif</span>
                                </div>
                            ) : isWaiting ? (
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full shadow-md animate-pulse">
                                    <Clock size={18} />
                                    <span className="font-semibold text-sm">Menunggu Konfirmasi Admin</span>
                                </div>
                            ) : (
                                <div className={`inline-flex items-center gap-2 px-4 py-2 ${timeRemaining.isLate ? 'bg-rose-500 shadow-rose-500/30' : 'bg-amber-500 shadow-amber-500/30'} text-white rounded-full shadow-md`}>
                                    <Clock size={18} />
                                    <span className="font-bold text-sm">{timeRemaining.text}</span>
                                </div>
                            )}
                        </div>

                        {/* Success / Paid Notice */}
                        {isPaid && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1.5 animate-in fade-in">
                                <p className="text-sm font-extrabold text-emerald-800">
                                    ✅ Pembayaran Tagihan Telah Terkonfirmasi
                                </p>
                                <p className="text-xs text-emerald-700 leading-relaxed">
                                    Masa aktif layanan Anda telah diperpanjang. Jika sebelumnya perangkat/layanan mengalami isolir, sistem otomatis telah mencabut isolir tersebut.
                                </p>
                            </div>
                        )}

                        {/* Actions: Save PDF & Print */}
                        <div className="flex items-center justify-center gap-2.5 mt-4">
                            {invoice?.document_token && (
                                <a
                                    href={`/invoice-documents/${invoice.document_token}/download`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition shadow-xs"
                                >
                                    <Download size={14} />
                                    <span>Simpan / Unduh PDF</span>
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={handlePrintInvoice}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition shadow-xs"
                            >
                                <Printer size={14} />
                                <span>Cetak Invoice</span>
                            </button>
                        </div>

                        {/* Customer & Package Info */}
                        <div className="bg-gray-50 rounded-2xl p-4 mt-5 border border-gray-100 grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Pelanggan</p>
                                <p className="font-bold text-gray-900 truncate">{invoice?.customer?.name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Paket Layanan</p>
                                <p className="font-bold text-gray-900 truncate">{invoice?.customer?.package_type || '-'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Periode Tagihan</p>
                                <p className="font-bold text-gray-900">{formatDate(invoice?.invoice_date)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Jatuh Tempo</p>
                                <p className="font-bold text-rose-600">{formatDate(invoice?.due_date)}</p>
                            </div>
                        </div>

                        {/* Total Bill */}
                        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex items-center justify-between shadow-lg shadow-indigo-950/20">
                            <div>
                                <p className="text-[11px] text-slate-300 font-bold uppercase">Total Tagihan</p>
                                <p className="text-2xl sm:text-3xl font-black">{formatCurrency(invoice?.amount || 0)}</p>
                            </div>
                            {!isPaid && (
                                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold">
                                    Belum Dibayar
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Unpaid Payment Area */}
                    {!isPaid && !isCancelled && (
                        <div className="p-6 space-y-5 bg-white">
                            
                            {/* Tab Switcher if Gateway is Active */}
                            {gatewayActive && (
                                <div className="flex rounded-2xl bg-gray-100 p-1 border border-gray-200 text-xs font-bold">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentTab('gateway')}
                                        className={`flex-1 py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
                                            paymentTab === 'gateway'
                                                ? 'bg-emerald-600 text-white shadow-md'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        <Zap size={14} />
                                        <span>Bayar Instan Otomatis (QRIS &amp; VA)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentTab('manual')}
                                        className={`flex-1 py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
                                            paymentTab === 'manual'
                                                ? 'bg-slate-800 text-white shadow-md'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        <Building2 size={14} />
                                        <span>Transfer Manual</span>
                                    </button>
                                </div>
                            )}

                            {/* TAB 1: PAYMENT GATEWAY (iPaymu) */}
                            {gatewayActive && paymentTab === 'gateway' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                            Pilih Metode Pembayaran Online:
                                        </h3>
                                        <span className="text-[10px] text-emerald-600 bg-emerald-50 font-extrabold px-2 py-0.5 rounded-md border border-emerald-200">
                                            Verifikasi Otomatis
                                        </span>
                                    </div>

                                    {/* Channel Buttons */}
                                    <div className="grid grid-cols-3 gap-2.5 text-xs font-bold">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setGatewayChannel('qris');
                                                handleCreateIpaymuPayment('qris');
                                            }}
                                            className={`p-3 rounded-2xl border-2 transition flex flex-col items-center justify-center gap-1.5 ${
                                                gatewayChannel === 'qris'
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                                            }`}
                                        >
                                            <QrCode size={20} className={gatewayChannel === 'qris' ? 'text-emerald-600' : 'text-gray-400'} />
                                            <span>QRIS Instan</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setGatewayChannel('va');
                                                handleCreateIpaymuPayment('va', gatewayBank);
                                            }}
                                            className={`p-3 rounded-2xl border-2 transition flex flex-col items-center justify-center gap-1.5 ${
                                                gatewayChannel === 'va'
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                                            }`}
                                        >
                                            <CreditCard size={20} className={gatewayChannel === 'va' ? 'text-emerald-600' : 'text-gray-400'} />
                                            <span>Virtual Account</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setGatewayChannel('redirect');
                                                handleCreateIpaymuPayment('redirect');
                                            }}
                                            className={`p-3 rounded-2xl border-2 transition flex flex-col items-center justify-center gap-1.5 ${
                                                gatewayChannel === 'redirect'
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                                            }`}
                                        >
                                            <ExternalLink size={20} className={gatewayChannel === 'redirect' ? 'text-emerald-600' : 'text-gray-400'} />
                                            <span>Kasir iPaymu</span>
                                        </button>
                                    </div>

                                    {/* Bank Selector for VA */}
                                    {gatewayChannel === 'va' && (
                                        <div className="space-y-1 text-xs">
                                            <label className="block font-bold text-gray-700">Pilih Bank Virtual Account:</label>
                                            <div className="flex gap-2">
                                                <select
                                                    value={gatewayBank}
                                                    onChange={(e) => {
                                                        setGatewayBank(e.target.value);
                                                        handleCreateIpaymuPayment('va', e.target.value);
                                                    }}
                                                    className="w-full p-2.5 rounded-xl border border-gray-300 text-xs font-semibold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-gray-50 text-gray-900"
                                                >
                                                    <option value="bca">BCA Virtual Account</option>
                                                    <option value="mandiri">Mandiri Virtual Account</option>
                                                    <option value="bri">BRI Virtual Account</option>
                                                    <option value="bni">BNI Virtual Account</option>
                                                    <option value="bag">Bank Artha Graha (BAG)</option>
                                                    <option value="cimb">CIMB Niaga Virtual Account</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Loading State */}
                                    {gatewayLoading && (
                                        <div className="p-8 text-center space-y-3 bg-gray-50 rounded-2xl border border-gray-200">
                                            <RefreshCw size={28} className="animate-spin text-emerald-500 mx-auto" />
                                            <p className="text-xs font-bold text-gray-600">Menghubungkan ke Gateway iPaymu...</p>
                                        </div>
                                    )}

                                    {/* Error State */}
                                    {gatewayError && (
                                        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2.5">
                                            <AlertCircle size={18} className="shrink-0" />
                                            <span>{gatewayError}</span>
                                        </div>
                                    )}

                                    {/* Initial Prompt to generate payment */}
                                    {!gatewayData && !gatewayLoading && !gatewayError && (
                                        <div className="p-6 text-center space-y-3 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                                            <QrCode size={36} className="text-emerald-600 mx-auto" />
                                            <div className="space-y-1">
                                                <p className="font-extrabold text-sm text-gray-900">Siap Melakukan Pembayaran</p>
                                                <p className="text-xs text-gray-500">Klik tombol di bawah untuk menampilkan kode pembayaran instan Anda.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCreateIpaymuPayment()}
                                                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition inline-flex items-center gap-2"
                                            >
                                                <Zap size={15} />
                                                <span>Tampilkan Kode Pembayaran</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Payment Generated Display Box */}
                                    {gatewayData && !gatewayLoading && (
                                        <div className="p-5 rounded-3xl bg-slate-900 text-white border border-slate-800 space-y-4 shadow-xl">
                                            
                                            {/* QRIS Display */}
                                            {gatewayChannel === 'qris' && (
                                                <div className="text-center space-y-3">
                                                    <div className="inline-block p-4 rounded-2xl bg-white border-2 border-emerald-500 shadow-md">
                                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 text-slate-800 text-xs font-black">
                                                            <span>QRIS STANDAR</span>
                                                            <span className="text-[10px] text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-full">{gatewayData.Channel || 'MPM'}</span>
                                                        </div>
                                                        {qrImageSrc ? (
                                                            <img
                                                                src={qrImageSrc}
                                                                alt="QRIS Pembayaran"
                                                                className="w-56 h-56 mx-auto object-contain rounded-md"
                                                            />
                                                        ) : (
                                                            <div className="w-56 h-56 flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-semibold rounded-md">
                                                                QRIS Dimuat...
                                                            </div>
                                                        )}
                                                        <div className="pt-2 text-[11px] font-bold text-slate-700 border-t border-gray-100 mt-2 flex items-center justify-between">
                                                            <span>NMID: {gatewayData.NMID || 'ID2022173022171'}</span>
                                                            <span className="text-emerald-600 font-black">Rp {new Intl.NumberFormat('id-ID').format(gatewayData.Total || invoice?.amount)}</span>
                                                        </div>
                                                    </div>

                                                    <p className="text-xs text-slate-300">
                                                        Buka aplikasi e-wallet Anda (<strong>GoPay, OVO, DANA, ShopeePay, BCA, Livin, BRImo</strong>) lalu scan kode QR di atas.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Virtual Account Display */}
                                            {gatewayChannel === 'va' && (
                                                <div className="space-y-3 text-center">
                                                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Nomor Virtual Account {gatewayData.Channel || gatewayBank.toUpperCase()}:</p>
                                                        <div className="flex items-center justify-center gap-3">
                                                            <span className="font-mono text-2xl font-black text-emerald-400 tracking-wider">
                                                                {gatewayData.PaymentNo || gatewayData.Va || '-'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(gatewayData.PaymentNo || gatewayData.Va, 'va_no')}
                                                                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                                                                title="Salin Nomor VA"
                                                            >
                                                                {copiedField === 'va_no' ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-slate-400">
                                                            Total Bayar: <strong className="text-white">Rp {new Intl.NumberFormat('id-ID').format(gatewayData.Total || invoice?.amount)}</strong>
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Redirect / Kasir Link Display */}
                                            {gatewayData.Url && (
                                                <div className="pt-2 text-center">
                                                    <a
                                                        href={gatewayData.Url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs transition inline-flex items-center justify-center gap-2 shadow-lg"
                                                    >
                                                        <ExternalLink size={15} />
                                                        <span>Buka Halaman Pembayaran Kasir iPaymu &rarr;</span>
                                                    </a>
                                                </div>
                                            )}

                                            {/* Status Indicator & Live Check */}
                                            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                                    <span className="text-slate-300 text-[11px]">Menunggu pembayaran Anda...</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={checkManualStatus}
                                                    disabled={checkingStatus}
                                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
                                                >
                                                    <RefreshCw size={12} className={checkingStatus ? 'animate-spin text-emerald-400' : ''} />
                                                    <span>Cek Status</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: MANUAL TRANSFER / REKENING TOKO */}
                            {(!gatewayActive || paymentTab === 'manual') && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                            Pilih Rekening Tujuan Transfer:
                                        </h3>
                                    </div>

                                    <div className="space-y-2.5">
                                        {paymentMethods.map((method) => (
                                            <button
                                                key={method.id}
                                                type="button"
                                                onClick={() => setSelectedMethod(method)}
                                                className={`w-full p-4 rounded-2xl border-2 transition-all text-left flex items-center justify-between ${
                                                    selectedMethod?.id === method.id 
                                                        ? 'border-indigo-500 bg-indigo-50/70 shadow-sm' 
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                        method.type === 'qris' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                                                    }`}>
                                                        {method.type === 'qris' ? <QrCode size={20} /> : <Building2 size={20} />}
                                                    </div>
                                                    <div>
                                                        <p className="font-extrabold text-xs text-gray-900">
                                                            {method.type === 'qris' ? 'QRIS Toko' : method.bank_name}
                                                        </p>
                                                        <p className="text-[11px] text-gray-500 font-mono">
                                                            {method.type === 'qris' ? 'Scan Semua E-Wallet' : `${method.account_number} a.n ${method.account_name}`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                    selectedMethod?.id === method.id ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                                                }`}>
                                                    {selectedMethod?.id === method.id && <Check className="text-white" size={12} />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Manual Method Details */}
                                    {selectedMethod && (
                                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3 text-xs">
                                            {selectedMethod.type === 'qris' ? (
                                                <div className="text-center space-y-2">
                                                    <div className="p-3 bg-white rounded-xl inline-block border border-gray-200 shadow-xs">
                                                        <img 
                                                            src={selectedMethod.qris_image ? `/storage/${selectedMethod.qris_image}` : '/qr.jpg'} 
                                                            alt="QRIS Manual" 
                                                            className="w-48 h-48 object-contain mx-auto"
                                                        />
                                                    </div>
                                                    <p className="text-[11px] text-gray-600">Scan QRIS manual dan simpan bukti transfer.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-gray-200">
                                                        <div>
                                                            <p className="text-[10px] text-gray-500">Nomor Rekening {selectedMethod.bank_name}</p>
                                                            <p className="font-mono font-bold text-sm text-gray-900">{selectedMethod.account_number}</p>
                                                            <p className="text-[11px] text-gray-600">a.n {selectedMethod.account_name}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(selectedMethod.account_number, 'manual_rek')}
                                                            className="p-2 text-gray-500 hover:text-indigo-600 rounded-lg transition"
                                                        >
                                                            {copiedField === 'manual_rek' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={openConfirmModal}
                                                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-sm"
                                            >
                                                <Upload size={14} />
                                                <span>Konfirmasi Pembayaran Manual (Upload Bukti)</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>

            {/* Manual Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full text-slate-900 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                            <h3 className="font-extrabold text-base text-gray-900">Konfirmasi Pembayaran</h3>
                            <button
                                type="button"
                                onClick={closeConfirmModal}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitConfirmation} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Nominal yang Dibayar (Rp)</label>
                                <input
                                    type="number"
                                    required
                                    value={paidAmount}
                                    onChange={(e) => setPaidAmount(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-gray-300 font-mono text-sm bg-gray-50 text-gray-900 focus:border-indigo-500"
                                />
                                {fieldErrors?.paid_amount && (
                                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.paid_amount}</p>
                                )}
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Bukti Transfer (Foto / Screenshot)</label>
                                <div className="border-2 border-dashed border-gray-300 rounded-2xl p-4 text-center hover:border-indigo-500 transition cursor-pointer">
                                    {filePreview ? (
                                        <div className="space-y-2">
                                            <img src={filePreview} alt="Preview" className="max-h-36 mx-auto rounded-lg" />
                                            <button
                                                type="button"
                                                onClick={resetFileSelection}
                                                className="text-xs text-rose-600 font-bold hover:underline"
                                            >
                                                Ganti Foto
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer block space-y-1">
                                            <Upload size={24} className="mx-auto text-gray-400" />
                                            <p className="font-bold text-gray-700">Pilih Bukti Pembayaran</p>
                                            <p className="text-[10px] text-gray-400">JPG, PNG, PDF (max 2MB)</p>
                                            <input
                                                type="file"
                                                accept="image/*,application/pdf"
                                                onChange={handleFileChange}
                                                className="hidden"
                                            />
                                        </label>
                                    )}
                                </div>
                                {fieldErrors?.bukti_pembayaran && (
                                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.bukti_pembayaran}</p>
                                )}
                            </div>

                            {formError && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
                                    {formError}
                                </div>
                            )}

                            <div className="flex gap-2.5 pt-2">
                                <button
                                    type="button"
                                    onClick={closeConfirmModal}
                                    className="flex-1 py-3 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                                    <span>Kirim Bukti</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

export default InvoicePage;

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
    Clock, Download, Upload, Phone, CheckCircle, AlertCircle, XCircle,
    QrCode, Building2, Copy, Check, CreditCard, ChevronRight, Wifi,
    Calendar, User, MapPin, FileText, Printer
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
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [paidAmount, setPaidAmount] = useState('');
    const [file, setFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [noProofIntent, setNoProofIntent] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [fileInfo, setFileInfo] = useState(null);

    useEffect(() => {
        fetchData();
    }, [invoiceLink]);

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
            
            // Set default payment method
            const defaultMethod = methodsData.find(m => m.is_default) || methodsData[0];
            if (defaultMethod) setSelectedMethod(defaultMethod);
        } catch (err) {
            setError('Invoice tidak ditemukan atau sudah tidak valid');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) {
            return;
        }

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

        if (filePreview) {
            URL.revokeObjectURL(filePreview);
        }

        const isHeicType = (selectedFile.type || '').toLowerCase().includes('image/heic')
            || (selectedFile.type || '').toLowerCase().includes('image/heif');

        if (selectedFile.type.startsWith('image/') && !isHeicType) {
            setFilePreview(URL.createObjectURL(selectedFile));
        } else {
            setFilePreview(null);
        }
    };

    const closeConfirmModal = () => {
        setShowConfirmModal(false);
        setFormError('');
        setFieldErrors({});
        resetFileSelection();
        setNoProofIntent(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setFormError('');
        setFieldErrors({});

        if (!file && !noProofIntent) {
            setFieldErrors({
                bukti_pembayaran: 'Centang "Saya kirim tanpa bukti" jika Anda ingin melanjutkan tanpa file.',
            });
            return;
        }

        try {
            setSubmitting(true);
            setError(null);
            const formData = new FormData();
            formData.append('paid_amount', paidAmount);
            formData.append('without_proof', noProofIntent ? '1' : '0');
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
                    const normalizedErrors = Object.entries(payload.errors)
                        .reduce((acc, [key, messages]) => {
                            acc[key] = Array.isArray(messages) ? messages[0] : messages;
                            return acc;
                        }, {});
                    setFieldErrors(normalizedErrors);
                    setFormError(payload?.message || 'Data konfirmasi pembayaran tidak valid.');
                    return;
                }

                if (response.status === 419) {
                    setFormError('Sesi formulir sudah kedaluwarsa. Silakan muat ulang halaman lalu coba lagi.');
                    return;
                }

                if (response.status === 403) {
                    setFormError('Akses ditolak. Anda tidak diizinkan mengirim konfirmasi pembayaran.');
                    return;
                }

                setFormError(payload?.message || 'Gagal mengirim konfirmasi pembayaran.');
                return;
            }
            
            closeConfirmModal();
            await fetchData();
            const hasProof = payload?.data?.has_payment_proof === true;
            const successMessage = hasProof
                ? 'Status menunggu konfirmasi. Bukti pembayaran berhasil tersimpan.'
                : 'Status menunggu konfirmasi. Bukti pembayaran tidak tersedia (sesuai pilihan Anda).';
            setSuccess(successMessage);
        } catch (err) {
            setFormError(err.message || 'Gagal mengirim konfirmasi pembayaran');
        } finally {
            setSubmitting(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mx-auto mb-4"></div>
                    <p className="text-white/80">Memuat invoice...</p>
                </div>
            </div>
        );
    }

    if (error && !invoice) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <XCircle className="text-red-500" size={40} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoice Tidak Ditemukan</h1>
                    <p className="text-gray-600">{error}</p>
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 py-6 sm:py-8 px-3 sm:px-4 overflow-x-clip">
            <div className="max-w-lg mx-auto">
                {/* Header Card */}
                <div className="bg-white rounded-t-3xl pt-8 px-6 pb-6 relative overflow-hidden">
                    {/* Background Pattern */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-100 to-pink-100 rounded-full translate-y-1/2 -translate-x-1/2 opacity-50"></div>
                    
                    {/* Logo & Title */}
                    <div className="relative text-center mb-6">
                        <img src="/logo_baru.png" alt="Rumah Kita Net" className="h-14 mx-auto mb-3" />
                        <h1 className="text-xl font-bold text-gray-900">Invoice Pembayaran</h1>
                        <p className="text-sm text-gray-500">#{invoice?.invoice_number || invoiceLink.slice(0, 8).toUpperCase()}</p>
                        <button
                            type="button"
                            onClick={handlePrintInvoice}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium"
                        >
                            <Printer size={16} /> Cetak Invoice
                        </button>
                    </div>

                    {/* Status Badge */}
                    <div className="flex justify-center mb-6">
                        {isPaid ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full shadow-lg shadow-green-500/30">
                                <CheckCircle size={18} />
                                <span className="font-semibold">Lunas</span>
                            </div>
                        ) : isCancelled ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-500 to-gray-500 text-white rounded-full shadow-lg shadow-slate-500/30">
                                <XCircle size={18} />
                                <span className="font-semibold">Invoice Tidak Aktif</span>
                            </div>
                        ) : isWaiting ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full shadow-lg shadow-blue-500/30 animate-pulse">
                                <Clock size={18} />
                                <span className="font-semibold">Menunggu Konfirmasi</span>
                            </div>
                        ) : (
                            <div className={`inline-flex items-center gap-2 px-4 py-2 ${timeRemaining.isLate ? 'bg-gradient-to-r from-red-500 to-orange-500 shadow-red-500/30' : 'bg-gradient-to-r from-yellow-500 to-orange-500 shadow-yellow-500/30'} text-white rounded-full shadow-lg`}>
                                <Clock size={18} />
                                <span className="font-semibold">{timeRemaining.text}</span>
                            </div>
                        )}
                    </div>

                    {/* Rejection Notice */}
                    {isRejected && !isPaid && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                                <div>
                                    <p className="font-semibold text-red-700">Pembayaran Ditolak</p>
                                    <p className="text-sm text-red-600 mt-1">{invoice.tolak_info}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {isCancelled && (
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="text-gray-500 shrink-0 mt-0.5" size={20} />
                                <div>
                                    <p className="font-semibold text-gray-700">Invoice Sudah Dinonaktifkan</p>
                                    <p className="text-sm text-gray-600 mt-1">Tagihan ini sudah digantikan oleh invoice baru. Silakan gunakan link invoice terbaru dari admin.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Alerts */}
                    {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}
                    {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} className="mb-4" />}

                    {/* Customer Info */}
                    <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl p-4 mb-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                                    <User className="text-blue-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Pelanggan</p>
                                    <p className="font-semibold text-gray-900 text-sm break-words">{invoice?.customer?.name}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                                    <Wifi className="text-green-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Paket</p>
                                    <p className="font-semibold text-gray-900 text-sm">{invoice?.customer?.package_type || '-'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                                    <Calendar className="text-purple-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Periode</p>
                                    <p className="font-semibold text-gray-900 text-sm">{formatDate(invoice?.invoice_date)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                                    <Clock className="text-orange-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Jatuh Tempo</p>
                                    <p className="font-semibold text-gray-900 text-sm">{formatDate(invoice?.due_date)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Total Amount */}
                    <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-5 text-white text-center shadow-lg shadow-indigo-500/30">
                        <p className="text-sm text-white/80 mb-1">Total Tagihan</p>
                        <p className="text-3xl font-bold">{formatCurrency(invoice?.amount || 0)}</p>
                    </div>
                </div>

                {/* Payment Methods Section - Only show if not paid */}
                {!isPaid && !isCancelled && (
                    <div className="bg-gray-50 px-6 py-6">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <CreditCard size={20} className="text-indigo-600" />
                            Pilih Metode Pembayaran
                        </h3>
                        
                        <div className="space-y-3">
                            {paymentMethods.map((method) => (
                                <button
                                    key={method.id}
                                    onClick={() => setSelectedMethod(method)}
                                    className={`w-full p-4 rounded-2xl border-2 transition-all text-left ${
                                        selectedMethod?.id === method.id 
                                            ? 'border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-500/20' 
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                            method.type === 'qris' ? 'bg-purple-100' : 'bg-blue-100'
                                        }`}>
                                            {method.type === 'qris' 
                                                ? <QrCode className="text-purple-600" size={24} />
                                                : <Building2 className="text-blue-600" size={24} />
                                            }
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900">
                                                {method.type === 'qris' ? 'QRIS' : method.bank_name}
                                            </p>
                                            {method.type === 'bank_transfer' && (
                                                <p className="text-sm text-gray-500">{method.account_name}</p>
                                            )}
                                            {method.type === 'qris' && (
                                                <p className="text-sm text-gray-500">Semua aplikasi e-wallet</p>
                                            )}
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                            selectedMethod?.id === method.id
                                                ? 'border-indigo-500 bg-indigo-500'
                                                : 'border-gray-300'
                                        }`}>
                                            {selectedMethod?.id === method.id && (
                                                <Check className="text-white" size={14} />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Payment Details - Only show if not paid and method selected */}
                {!isPaid && !isCancelled && selectedMethod && (
                    <div className="bg-white px-6 py-6 border-t border-gray-100">
                        {selectedMethod.type === 'qris' ? (
                            <div className="text-center">
                                <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 inline-block shadow-lg mb-4">
                                    <img 
                                        src={selectedMethod.qris_image ? `/storage/${selectedMethod.qris_image}` : '/qr.jpg'} 
                                        alt="QRIS" 
                                        className="w-56 h-56 object-contain"
                                    />
                                </div>
                                <p className="text-sm text-gray-600 mb-4">
                                    Scan QR Code dengan aplikasi pembayaran favorit Anda
                                </p>
                                <a
                                    href={selectedMethod.qris_image ? `/storage/${selectedMethod.qris_image}` : '/qr.jpg'}
                                    download
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-semibold rounded-xl shadow-lg shadow-yellow-500/30 hover:shadow-xl transition-all"
                                >
                                    <Download size={20} />
                                    Unduh QRIS
                                </a>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4">
                                    <p className="text-sm text-gray-500 mb-1">Bank</p>
                                    <p className="text-xl font-bold text-gray-900">{selectedMethod.bank_name}</p>
                                </div>
                                <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl p-4">
                                    <p className="text-sm text-gray-500 mb-1">Nama Rekening</p>
                                    <p className="font-semibold text-gray-900">{selectedMethod.account_name}</p>
                                </div>
                                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4">
                                    <p className="text-sm text-gray-500 mb-1">Nomor Rekening</p>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xl font-bold font-mono text-gray-900">{selectedMethod.account_number}</p>
                                        <button
                                            onClick={() => copyToClipboard(selectedMethod.account_number)}
                                            className={`p-2 rounded-lg transition ${copied ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            {copied ? <Check size={20} /> : <Copy size={20} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Payment Instructions */}
                        {selectedMethod.instructions && (
                            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                                <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                                    <FileText size={18} />
                                    Panduan Pembayaran
                                </h4>
                                <p className="text-sm text-amber-700 whitespace-pre-line">{selectedMethod.instructions}</p>
                            </div>
                        )}

                        {/* Default Instructions */}
                        {!selectedMethod.instructions && (
                            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                                    <FileText size={18} />
                                    Cara Pembayaran
                                </h4>
                                {selectedMethod.type === 'qris' ? (
                                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                                        <li>Simpan atau screenshot kode QRIS di atas</li>
                                        <li>Buka aplikasi pembayaran (GoPay, OVO, Dana, LinkAja, dll)</li>
                                        <li>Pilih menu "Scan QR" lalu upload gambar QRIS</li>
                                        <li>Masukkan nominal sesuai tagihan</li>
                                        <li>Konfirmasi pembayaran setelah berhasil</li>
                                    </ol>
                                ) : (
                                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                                        <li>Salin nomor rekening di atas</li>
                                        <li>Buka aplikasi m-Banking atau ATM</li>
                                        <li>Pilih menu Transfer</li>
                                        <li>Masukkan nomor rekening dan nominal</li>
                                        <li>Konfirmasi pembayaran setelah berhasil</li>
                                    </ol>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Confirmation Button - Only show if not paid and method selected */}
                {!isPaid && !isCancelled && selectedMethod && (invoice?.status === 'unpaid' || isRejected) && (
                    <div className="bg-white px-6 pb-6">
                        <button
                            onClick={() => {
                                setFormError('');
                                setFieldErrors({});
                                setShowConfirmModal(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-xl transition-all"
                        >
                            <Upload size={20} />
                            Konfirmasi Pembayaran
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}

                {/* Footer */}
                <div className="bg-white rounded-b-3xl px-6 py-6 border-t border-gray-100">
                    <div className="text-center">
                        <p className="text-sm text-gray-500 mb-3">Butuh bantuan?</p>
                        <a
                            href="https://wa.me/6285158025553"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-green-500/30 hover:shadow-xl transition-all"
                        >
                            <Phone size={18} />
                            Hubungi CS
                        </a>
                    </div>
                    <p className="text-center text-xs text-gray-400 mt-4">
                        (c) {new Date().getFullYear()} Rumah Kita Net. All rights reserved.
                    </p>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-2 sm:p-4">
                    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5 text-white">
                            <h2 className="text-xl font-bold">Konfirmasi Pembayaran</h2>
                            <p className="text-sm text-white/80 mt-1">Kirim bukti pembayaran Anda</p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Nominal yang Dibayarkan
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                                    <input
                                        type="number"
                                        value={paidAmount}
                                        onChange={(e) => setPaidAmount(e.target.value)}
                                        min="1"
                                        required
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg font-semibold"
                                    />
                                </div>
                                {fieldErrors?.paid_amount && (
                                    <p className="text-xs text-red-600 mt-2">{fieldErrors.paid_amount}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Bukti Pembayaran (opsional)
                                </label>
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-indigo-400 transition cursor-pointer">
                                    {filePreview ? (
                                        <div className="space-y-3">
                                            <img src={filePreview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
                                            {fileInfo && (
                                                <p className="text-xs text-gray-500">
                                                    File terpilih: {fileInfo.name} • {formatFileSize(fileInfo.size)}
                                                </p>
                                            )}
                                            <button
                                                type="button"
                                                onClick={resetFileSelection}
                                                className="text-sm text-red-600 hover:underline"
                                            >
                                                Hapus gambar
                                            </button>
                                        </div>
                                    ) : file ? (
                                        <div className="space-y-2">
                                            <FileText className="mx-auto text-gray-400" size={32} />
                                            <p className="text-sm text-gray-600">{fileInfo?.name || file.name}</p>
                                            <p className="text-xs text-gray-500">{formatFileSize(fileInfo?.size || file.size)}</p>
                                            <button
                                                type="button"
                                                onClick={resetFileSelection}
                                                className="text-sm text-red-600 hover:underline"
                                            >
                                                Hapus file
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer">
                                            <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                                            <p className="text-sm text-gray-600">Klik untuk upload bukti pembayaran</p>
                                            <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF, WEBP, HEIC, HEIF (max 2MB)</p>
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.webp,.heic,.heif"
                                                onChange={handleFileChange}
                                                className="hidden"
                                            />
                                        </label>
                                    )}
                                </div>
                                {fieldErrors?.bukti_pembayaran && (
                                    <p className="text-xs text-red-600 mt-2">{fieldErrors.bukti_pembayaran}</p>
                                )}
                                <div className="mt-3 space-y-1">
                                    <label className="flex items-start gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={noProofIntent}
                                            disabled={!!file}
                                            onChange={(e) => setNoProofIntent(e.target.checked)}
                                            className="mt-1"
                                        />
                                        <span>Saya kirim tanpa bukti pembayaran</span>
                                    </label>
                                    {file && (
                                        <p className="text-xs text-gray-500">Hapus file jika ingin mengirim tanpa bukti.</p>
                                    )}
                                </div>
                            </div>

                            {formError && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                                    {formError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeConfirmModal}
                                    className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-xl disabled:opacity-50 transition flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                    ) : (
                                        <>
                                            <Check size={20} />
                                            Kirim
                                        </>
                                    )}
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

import { useState, useEffect } from 'react';
import { Search, FileText, Send, Check, X, Eye, Clock, AlertTriangle, Users, ChevronDown, ChevronUp, Copy, ExternalLink, ShieldAlert } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import billingService from '../../services/billingService';

function BillingPage() {
    const [customers, setCustomers] = useState({ late: [], almostLate: [], others: [], paid: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [search, setSearch] = useState('');
    const [isolationStatus, setIsolationStatus] = useState({});
    
    // Modal states
    const [createModal, setCreateModal] = useState({ open: false, customer: null });
    const [confirmModal, setConfirmModal] = useState({ open: false, invoice: null, customer: null });
    const [rejectModal, setRejectModal] = useState({ open: false, invoice: null });
    const [linkModal, setLinkModal] = useState({ open: false, invoice: null, customer: null });
    const [resultModal, setResultModal] = useState({ open: false, data: null });
    
    // Form states
    const [amount, setAmount] = useState('');
    const [paidAmount, setPaidAmount] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Collapsed sections
    const [collapsed, setCollapsed] = useState({ late: false, almostLate: false, others: true, paid: true });

    useEffect(() => {
        fetchBillingData();
    }, [search]);

    const fetchBillingData = async () => {
        try {
            setLoading(true);
            const response = await billingService.getAll({ search });
            setCustomers(response.data.data);
            
            // Isolation status is now included in the response
            if (response.data.data.isolationStatus) {
                setIsolationStatus(response.data.data.isolationStatus);
            }
        } catch (err) {
            setError('Gagal memuat data penagihan');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleIsolateCustomer = async (customerId) => {
        try {
            setSubmitting(true);
            await billingService.isolateCustomer(customerId);
            setSuccess('Pelanggan berhasil diisolir');
            
            // Refresh data to get updated isolation status
            await fetchBillingData();
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal melakukan isolir');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateInvoice = async (e) => {
        e.preventDefault();
        // Parse amount untuk mendapatkan angka murni (hapus semua titik/koma)
        const numericAmount = amount ? parseInt(amount.toString().replace(/[^\d]/g, ''), 10) : 0;
        
        if (!numericAmount || numericAmount <= 0) {
            setError('Nominal tagihan harus diisi');
            return;
        }
        
        try {
            setSubmitting(true);
            const response = await billingService.createInvoice(createModal.customer.id, numericAmount);
            setCreateModal({ open: false, customer: null });
            setAmount('');
            setResultModal({ open: true, data: response.data.data });
            fetchBillingData();
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal membuat tagihan');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmPayment = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            // Parse paidAmount untuk mendapatkan angka murni (hapus semua titik/koma)
            const numericAmount = paidAmount ? parseInt(paidAmount.toString().replace(/[^\d]/g, ''), 10) : confirmModal.invoice.amount;
            await billingService.confirmPayment(confirmModal.invoice.id, numericAmount);
            setConfirmModal({ open: false, invoice: null, customer: null });
            setPaidAmount('');
            setSuccess('Pembayaran berhasil dikonfirmasi');
            fetchBillingData();
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal mengkonfirmasi pembayaran');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectPayment = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await billingService.rejectPayment(rejectModal.invoice.id, rejectReason);
            setRejectModal({ open: false, invoice: null });
            setRejectReason('');
            setSuccess('Pembayaran berhasil ditolak');
            fetchBillingData();
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal menolak pembayaran');
        } finally {
            setSubmitting(false);
        }
    };

    const copyToClipboard = (text, type) => {
        navigator.clipboard.writeText(text);
        setSuccess(`${type} berhasil disalin!`);
        setTimeout(() => setSuccess(null), 2000);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    // Format angka dengan separator ribuan (titik untuk Indonesia)
    const formatNumberWithComma = (value) => {
        if (!value && value !== 0) return '';
        // Konversi ke number dulu untuk handle decimal dari database (misal 200000.00)
        let numericValue = parseFloat(value);
        if (isNaN(numericValue)) return '';
        // Bulatkan ke integer (hapus desimal)
        numericValue = Math.round(numericValue);
        // Format dengan locale Indonesia (menggunakan titik sebagai pemisah ribuan)
        return new Intl.NumberFormat('id-ID').format(numericValue);
    };

    // Parse angka dari format dengan titik kembali ke number string
    const parseFormattedNumber = (value) => {
        if (!value) return '';
        // Konversi ke number dulu untuk handle decimal
        const num = parseFloat(value);
        if (isNaN(num)) return value.toString().replace(/[^\d]/g, '');
        return Math.round(num).toString();
    };

    // Handler untuk input dengan format
    const handleAmountChange = (e, setter) => {
        const rawValue = e.target.value.replace(/[^\d]/g, '');
        setter(rawValue);
    };

    const generateTemplate = (customer, invoice) => {
        return `Yth. Bapak/Ibu ${customer.name.toUpperCase()}
Username PPPoE: ${customer.pppoe_username || '-'}

Terima kasih telah menjadi bagian dari pelanggan prioritas kami.
Layanan internet anda aktif sampai ${formatDate(customer.due_date)}.

> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:
${window.location.origin}/invoice/${invoice.invoice_link}

Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis.

Layanan Call Center 085158025553

Salam Hangat,
Tim Layanan Pelanggan Rumah Kita Net`;
    };

    const getWhatsAppLink = (customer, invoice) => {
        const phone = customer.phone?.replace(/[^0-9]/g, '');
        const template = generateTemplate(customer, invoice);
        return `https://wa.me/${phone}?text=${encodeURIComponent(template)}`;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data penagihan..." />
            </div>
        );
    }

    const CustomerTable = ({ title, data, icon: Icon, iconColor, defaultCollapsed = false }) => {
        const sectionKey = title.toLowerCase().replace(/[^a-z]/g, '');
        const isCollapsed = collapsed[sectionKey] ?? defaultCollapsed;
        
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                    onClick={() => setCollapsed(prev => ({ ...prev, [sectionKey]: !isCollapsed }))}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${iconColor}`}>
                            <Icon size={20} className="text-white" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold text-gray-900">{title}</h3>
                            <p className="text-sm text-gray-500">{data.length} pelanggan</p>
                        </div>
                    </div>
                    {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                </button>
                
                {!isCollapsed && (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-t border-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">No</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nama</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">PPPoE</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">Isolir</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Jatuh Tempo</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                            Tidak ada data
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((item, index) => (
                                        <CustomerRow 
                                            key={item.customer.id} 
                                            item={item} 
                                            index={index}
                                            onIsolate={handleIsolateCustomer}
                                            isolationStatus={isolationStatus[item.customer.id]}
                                            isLateCustomer={title === "Pelanggan Telat"}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const CustomerRow = ({ item, index, onIsolate, isolationStatus, isLateCustomer }) => {
        const { customer, invoice } = item;
        
        const getStatusBadge = () => {
            if (!invoice) {
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Belum Ada Tagihan</span>;
            }
            if (invoice.status === 'paid') {
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Sudah Bayar</span>;
            }
            if (invoice.status === 'menunggu konfirmasi') {
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">Menunggu Konfirmasi</span>;
            }
            return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Belum Bayar</span>;
        };

        const getIsolirButton = () => {
            // Only show for late customers
            if (!isLateCustomer) return null;
            
            const isIsolated = isolationStatus?.isolated;
            
            if (isIsolated) {
                return (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                        <ShieldAlert size={12} />
                        Sedang Isolir
                    </span>
                );
            }
            
            return (
                <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onIsolate(customer.id)}
                    disabled={submitting}
                >
                    <ShieldAlert size={14} className="mr-1" />
                    Lakukan Isolir
                </Button>
            );
        };

        return (
            <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500 md:hidden">{customer.pppoe_username}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{customer.pppoe_username || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{getIsolirButton()}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(customer.due_date)}</td>
                <td className="px-4 py-3">{getStatusBadge()}</td>
                <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                        {!invoice ? (
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={() => {
                                    setCreateModal({ open: true, customer });
                                    setAmount('');
                                }}
                            >
                                <FileText size={14} className="mr-1" />
                                <span className="hidden sm:inline">Buat Tagihan</span>
                                <span className="sm:hidden">Buat</span>
                            </Button>
                        ) : (
                            <>
                                {invoice.status !== 'paid' && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => setLinkModal({ open: true, invoice, customer })}
                                        >
                                            <Send size={14} className="mr-1" />
                                            <span className="hidden sm:inline">Kirim</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="warning"
                                            onClick={() => {
                                                setConfirmModal({ open: true, invoice, customer });
                                                // Parse amount dari invoice (handle decimal dari database)
                                                const amount = parseFloat(invoice.amount);
                                                setPaidAmount(isNaN(amount) ? '' : Math.round(amount).toString());
                                            }}
                                        >
                                            <Check size={14} className="mr-1" />
                                            <span className="hidden sm:inline">Konfirmasi</span>
                                        </Button>
                                    </>
                                )}
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => window.open(`/invoice/${invoice.invoice_link}`, '_blank')}
                                >
                                    <Eye size={14} className="mr-1" />
                                    <span className="hidden sm:inline">Lihat</span>
                                </Button>
                                {invoice.status === 'menunggu konfirmasi' && invoice.bukti_pembayaran && (
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => setRejectModal({ open: true, invoice })}
                                    >
                                        <X size={14} />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Menu Penagihan</h1>
                    <p className="text-gray-600 mt-1">Kelola tagihan dan pembayaran pelanggan</p>
                </div>
            </div>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Cari nama atau PPPoE..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                </div>
            </div>

            {/* Tables */}
            <div className="space-y-4">
                <CustomerTable
                    title="Pelanggan Telat"
                    data={customers.late}
                    icon={AlertTriangle}
                    iconColor="bg-red-500"
                />
                <CustomerTable
                    title="Pelanggan Hampir Telat (H-7)"
                    data={customers.almostLate}
                    icon={Clock}
                    iconColor="bg-orange-500"
                />
                <CustomerTable
                    title="Pelanggan Lainnya"
                    data={customers.others}
                    icon={Users}
                    iconColor="bg-blue-500"
                    defaultCollapsed={true}
                />
                <CustomerTable
                    title="Pelanggan Sudah Bayar"
                    data={customers.paid}
                    icon={Check}
                    iconColor="bg-green-500"
                    defaultCollapsed={true}
                />
            </div>

            {/* Create Invoice Modal */}
            <Modal
                isOpen={createModal.open}
                onClose={() => setCreateModal({ open: false, customer: null })}
                title="Buat Tagihan"
            >
                {createModal.customer && (
                    <form onSubmit={handleCreateInvoice} className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="font-semibold text-gray-900">{createModal.customer.name}</p>
                            <p className="text-sm text-gray-600">PPPoE: {createModal.customer.pppoe_username || '-'}</p>
                            <p className="text-sm text-gray-600">Paket: {createModal.customer.package_type || createModal.customer.custom_package || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                            <input
                                type="text"
                                value={formatNumberWithComma(amount)}
                                onChange={(e) => handleAmountChange(e, setAmount)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Masukkan nominal tagihan"
                            />
                            {amount && <p className="text-xs text-gray-500 mt-1">Rp {formatNumberWithComma(amount)}</p>}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={() => setCreateModal({ open: false, customer: null })}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={submitting}>
                                {submitting ? 'Memproses...' : 'Buat Tagihan'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Send Link Modal */}
            <Modal
                isOpen={linkModal.open}
                onClose={() => setLinkModal({ open: false, invoice: null, customer: null })}
                title="Kirim Link Penagihan"
            >
                {linkModal.invoice && linkModal.customer && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Link Invoice</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={`${window.location.origin}/invoice/${linkModal.invoice.invoice_link}`}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(`${window.location.origin}/invoice/${linkModal.invoice.invoice_link}`, 'Link')}
                                >
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template Pesan</label>
                            <textarea
                                readOnly
                                value={generateTemplate(linkModal.customer, linkModal.invoice)}
                                rows={8}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => copyToClipboard(generateTemplate(linkModal.customer, linkModal.invoice), 'Template')}
                            >
                                <Copy size={16} className="mr-1" /> Copy Template
                            </Button>
                            <a
                                href={getWhatsAppLink(linkModal.customer, linkModal.invoice)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <ExternalLink size={16} className="mr-1" /> Kirim via WhatsApp
                            </a>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Confirm Payment Modal */}
            <Modal
                isOpen={confirmModal.open}
                onClose={() => setConfirmModal({ open: false, invoice: null, customer: null })}
                title="Konfirmasi Pembayaran"
            >
                {confirmModal.invoice && (
                    <form onSubmit={handleConfirmPayment} className="space-y-4">
                        {confirmModal.invoice.bukti_pembayaran && (
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm text-blue-700 mb-2">Pelanggan telah mengupload bukti pembayaran</p>
                                <a
                                    href={`/storage/${confirmModal.invoice.bukti_pembayaran}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                                >
                                    <Eye size={14} /> Lihat Bukti Pembayaran
                                </a>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal Dibayarkan</label>
                            <input
                                type="text"
                                value={formatNumberWithComma(paidAmount)}
                                onChange={(e) => handleAmountChange(e, setPaidAmount)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-500 mt-1">Rp {formatNumberWithComma(paidAmount)} - Nominal default sesuai invoice, bisa diubah jika pembayaran berbeda.</p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={() => setConfirmModal({ open: false, invoice: null, customer: null })}>
                                Batal
                            </Button>
                            <Button type="submit" variant="warning" disabled={submitting}>
                                {submitting ? 'Memproses...' : 'Konfirmasi'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Reject Payment Modal */}
            <Modal
                isOpen={rejectModal.open}
                onClose={() => setRejectModal({ open: false, invoice: null })}
                title="Tolak Pembayaran"
            >
                <form onSubmit={handleRejectPayment} className="space-y-4">
                    <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                            Yakin ingin menolak bukti pembayaran ini? Pelanggan akan diminta upload ulang bukti pembayaran yang valid.
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Alasan Penolakan (opsional)</label>
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Masukkan alasan penolakan..."
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setRejectModal({ open: false, invoice: null })}>
                            Batal
                        </Button>
                        <Button type="submit" variant="danger" disabled={submitting}>
                            {submitting ? 'Memproses...' : 'Tolak'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Result Modal */}
            <Modal
                isOpen={resultModal.open}
                onClose={() => setResultModal({ open: false, data: null })}
                title="Tagihan Berhasil Dibuat"
            >
                {resultModal.data && (
                    <div className="space-y-4">
                        <div className="bg-green-50 rounded-lg p-4">
                            <p className="text-sm text-green-700">Tagihan berhasil dibuat! Kirim link ke pelanggan melalui WhatsApp.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Link Invoice</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={resultModal.data.invoice_link}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(resultModal.data.invoice_link, 'Link')}
                                >
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template Pesan</label>
                            <textarea
                                readOnly
                                value={resultModal.data.template}
                                rows={8}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button type="button" variant="secondary" onClick={() => setResultModal({ open: false, data: null })}>
                                Tutup
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default BillingPage;

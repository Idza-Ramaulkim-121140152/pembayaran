import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Pencil, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import billingService from '../../services/billingService';

const STATUS_OPTIONS = [
    { value: 'all', label: 'Semua Status' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'menunggu konfirmasi', label: 'Menunggu Konfirmasi' },
    { value: 'paid', label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'overdue', label: 'Overdue' },
];

const STATUS_BADGE_STYLES = {
    unpaid: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-700',
    'menunggu konfirmasi': 'bg-orange-100 text-orange-700',
    cancelled: 'bg-gray-200 text-gray-700',
    overdue: 'bg-red-100 text-red-700',
};

function InvoiceManagementPage() {
    const isSuperAdmin = (window.appUserRole || '') === 'superadmin';

    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [monthInput, setMonthInput] = useState('');
    const [month, setMonth] = useState('');
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({
        currentPage: 1,
        lastPage: 1,
        perPage: 20,
        total: 0,
    });

    const [editModal, setEditModal] = useState({ open: false, invoice: null });
    const [sendModal, setSendModal] = useState({ open: false, invoice: null });
    const [sendingInvoiceId, setSendingInvoiceId] = useState(null);
    const [formData, setFormData] = useState({
        invoice_date: '',
        due_date: '',
        amount: '',
        status: 'unpaid',
    });

    useEffect(() => {
        if (!isSuperAdmin) {
            setLoading(false);
            return;
        }

        fetchInvoices(page);
    }, [isSuperAdmin, page, search, status, month]);

    const fetchInvoices = async (targetPage = page) => {
        try {
            setLoading(true);
            setError(null);

            const response = await billingService.getInvoiceManagement({
                page: targetPage,
                per_page: pagination.perPage,
                search: search || undefined,
                status,
                month: month || undefined,
            });

            const payload = response.data?.data;
            const rows = Array.isArray(payload?.data) ? payload.data : [];

            setInvoices(rows);
            setPagination({
                currentPage: payload?.current_page || 1,
                lastPage: payload?.last_page || 1,
                perPage: payload?.per_page || 20,
                total: payload?.total || 0,
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data invoice.');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (value) => {
        if (!value) return '-';
        return new Date(value).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const formatCurrency = (amount) => {
        const numericAmount = Number(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(numericAmount);
    };

    const getInvoiceUrl = (invoice) => `${window.location.origin}/invoice/${invoice.invoice_link}`;

    const openEditModal = (invoice) => {
        const numericAmount = Number(invoice.amount || 0);

        setFormData({
            invoice_date: invoice.invoice_date ? String(invoice.invoice_date).slice(0, 10) : '',
            due_date: invoice.due_date ? String(invoice.due_date).slice(0, 10) : '',
            amount: Number.isFinite(numericAmount) ? Math.round(numericAmount).toString() : '',
            status: invoice.status || 'unpaid',
        });

        setEditModal({ open: true, invoice });
    };

    const closeEditModal = () => {
        setEditModal({ open: false, invoice: null });
        setFormData({
            invoice_date: '',
            due_date: '',
            amount: '',
            status: 'unpaid',
        });
    };

    const handleApplyFilters = (event) => {
        event.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
        setMonth(monthInput);
    };

    const handleResetFilters = () => {
        setSearchInput('');
        setSearch('');
        setMonthInput('');
        setMonth('');
        setStatus('all');
        setPage(1);
    };

    const handleRefresh = async () => {
        await fetchInvoices(page);
    };

    const handleUpdateInvoice = async (event) => {
        event.preventDefault();

        if (!editModal.invoice) {
            return;
        }

        const numericAmount = Number(formData.amount);
        if (!numericAmount || numericAmount <= 0) {
            setError('Nominal invoice harus lebih dari 0.');
            return;
        }

        try {
            setSubmitting(true);
            setError(null);
            setSuccess(null);

            const response = await billingService.updateManagedInvoice(editModal.invoice.id, {
                invoice_date: formData.invoice_date,
                due_date: formData.due_date,
                amount: numericAmount,
                status: formData.status,
            });

            setSuccess(response.data?.message || 'Invoice berhasil diperbarui.');
            closeEditModal();
            await fetchInvoices(page);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui invoice.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteInvoice = async (invoice) => {
        if (String(invoice.status).toLowerCase() !== 'unpaid') {
            setError('Invoice hanya bisa dihapus jika status unpaid.');
            return;
        }

        const confirmed = confirm(
            `Yakin ingin menghapus invoice #${invoice.id} untuk pelanggan ${invoice.customer?.name || '-'}?`
        );
        if (!confirmed) return;

        try {
            setSubmitting(true);
            setError(null);
            setSuccess(null);

            const response = await billingService.deleteManagedInvoice(invoice.id);
            setSuccess(response.data?.message || 'Invoice berhasil dihapus.');

            const targetPage = invoices.length === 1 && page > 1 ? page - 1 : page;
            if (targetPage !== page) {
                setPage(targetPage);
            } else {
                await fetchInvoices(targetPage);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus invoice.');
        } finally {
            setSubmitting(false);
        }
    };
    const isValidPhone = (phone) => {
        const digits = String(phone || '').replace(/\D/g, '');
        return digits.length >= 10 && digits.length <= 15;
    };

    const openSendModal = (invoice) => {
        setError(null);
        setSuccess(null);
        setSendModal({ open: true, invoice });
    };

    const closeSendModal = () => {
        if (sendingInvoiceId) return;
        setSendModal({ open: false, invoice: null });
    };

    const handleSendInvoice = async () => {
        const invoice = sendModal.invoice;
        if (!invoice || !isValidPhone(invoice.customer?.phone)) {
            setError('Nomor WhatsApp pelanggan tidak valid.');
            return;
        }

        try {
            setSendingInvoiceId(invoice.id);
            setError(null);
            setSuccess(null);

            const response = await billingService.sendManagedInvoiceWhatsApp(invoice.id);
            setSuccess(response.data?.message || 'Invoice PDF berhasil dikirim melalui WhatsApp.');
            setSendModal({ open: false, invoice: null });
            await fetchInvoices(page);
        } catch (err) {
            setError(err.response?.data?.result?.error || err.response?.data?.message || 'Gagal mengirim invoice PDF.');
        } finally {
            setSendingInvoiceId(null);
        }
    };

    const invoiceColumns = [
        {
            key: 'id',
            label: 'ID',
            render: (invoice) => <span className="text-sm font-semibold text-gray-900">#{invoice.id}</span>,
        },
        {
            key: 'customer',
            label: 'Pelanggan',
            render: (invoice) => (
                <div className="text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{invoice.customer?.name || '-'}</div>
                    <div className="text-xs text-gray-500">PPPoE: {invoice.customer?.pppoe_username || '-'}</div>
                </div>
            ),
        },
        {
            key: 'invoice_date',
            label: 'Tanggal',
            render: (invoice) => (
                <div className="text-sm text-gray-700">
                    <div>Invoice: {formatDate(invoice.invoice_date)}</div>
                    <div className="text-xs text-gray-500">Tempo: {formatDate(invoice.due_date)}</div>
                </div>
            ),
        },
        {
            key: 'amount',
            label: 'Nominal',
            render: (invoice) => <span className="text-sm font-medium text-gray-900">{formatCurrency(invoice.amount)}</span>,
        },
        {
            key: 'status',
            label: 'Status',
            render: (invoice) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_STYLES[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                    {invoice.status}
                </span>
            ),
        },
        {
            key: 'invoice_link',
            label: 'Link',
            render: (invoice) => (
                <a
                    href={getInvoiceUrl(invoice)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                >
                    Lihat
                    <ExternalLink size={14} />
                </a>
            ),
        },
    ];

    const startItem = pagination.total === 0
        ? 0
        : (pagination.currentPage - 1) * pagination.perPage + 1;
    const endItem = Math.min(pagination.currentPage * pagination.perPage, pagination.total);

    if (!isSuperAdmin) {
        return (
            <div className="max-w-3xl mx-auto">
                <Alert type="warning" message="Menu ini hanya tersedia untuk superadmin." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="text-blue-600" size={28} />
                        Manajemen Invoice
                    </h1>
                    <p className="text-gray-600 mt-1">Edit dan hapus invoice khusus superadmin.</p>
                </div>
                <Button
                    variant="secondary"
                    onClick={handleRefresh}
                    disabled={loading || submitting}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2"
                >
                    <RefreshCw size={16} />
                    Refresh
                </Button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <form onSubmit={handleApplyFilters} className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto_auto]">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder="Cari nama, PPPoE, link, status, atau ID invoice"
                            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <select
                        value={status}
                        onChange={(event) => {
                            setStatus(event.target.value);
                            setPage(1);
                        }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="month"
                        value={monthInput}
                        onChange={(event) => setMonthInput(event.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Button type="submit" className="inline-flex items-center justify-center gap-2">
                        <Search size={16} />
                        Terapkan
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleResetFilters}>
                        Reset
                    </Button>
                </form>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-gray-500">Memuat data invoice...</div>
                ) : invoices.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">Tidak ada invoice yang sesuai filter.</div>
                ) : (
                    <div className="p-4 md:p-0">
                        <ResponsiveDataView
                            rows={invoices}
                            columns={invoiceColumns}
                            keyField="id"
                            priorityFields={['id', 'customer', 'status', 'amount']}
                            tableClassName="w-full md:min-w-[980px]"
                            actions={(invoice) => {
                                const canDelete = String(invoice.status).toLowerCase() === 'unpaid';
                                return (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => openSendModal(invoice)}
                                            className="inline-flex items-center gap-1 w-full sm:w-auto"
                                            disabled={submitting || sendingInvoiceId === invoice.id}
                                            title="Kirim invoice PDF melalui WhatsApp"
                                        >
                                            <Send size={14} />
                                            {sendingInvoiceId === invoice.id ? 'Mengirim...' : 'Kirim'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => openEditModal(invoice)}
                                            className="inline-flex items-center gap-1 w-full sm:w-auto"
                                            disabled={submitting}
                                        >
                                            <Pencil size={14} />
                                            Edit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => handleDeleteInvoice(invoice)}
                                            disabled={!canDelete || submitting}
                                            className="inline-flex items-center gap-1 w-full sm:w-auto"
                                            title={canDelete ? 'Hapus invoice' : 'Hanya invoice status unpaid yang bisa dihapus'}
                                        >
                                            <Trash2 size={14} />
                                            Hapus
                                        </Button>
                                    </div>
                                );
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-600">
                    Menampilkan {startItem}-{endItem} dari {pagination.total} invoice
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={loading || pagination.currentPage <= 1}
                    >
                        Sebelumnya
                    </Button>
                    <span className="text-sm text-gray-600">
                        Halaman {pagination.currentPage} / {pagination.lastPage}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage((prev) => Math.min(pagination.lastPage, prev + 1))}
                        disabled={loading || pagination.currentPage >= pagination.lastPage}
                    >
                        Berikutnya
                    </Button>
                </div>
            </div>

            <Modal
                isOpen={sendModal.open}
                onClose={closeSendModal}
                title="Kirim Invoice PDF"
                size="md"
            >
                <div className="space-y-5">
                    <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
                        PDF akan dibuat dengan QR tanda tangan digital lalu dikirim melalui WhatsApp API.
                    </div>

                    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
                        <dt className="text-gray-500">Pelanggan</dt>
                        <dd className="font-medium text-gray-900">{sendModal.invoice?.customer?.name || '-'}</dd>
                        <dt className="text-gray-500">WhatsApp</dt>
                        <dd className="font-medium text-gray-900">{sendModal.invoice?.customer?.phone || '-'}</dd>
                        <dt className="text-gray-500">Nominal</dt>
                        <dd className="font-medium text-gray-900">{formatCurrency(sendModal.invoice?.amount)}</dd>
                        <dt className="text-gray-500">Status</dt>
                        <dd className="font-medium uppercase text-gray-900">{sendModal.invoice?.status || '-'}</dd>
                    </dl>

                    {sendModal.invoice && !isValidPhone(sendModal.invoice.customer?.phone) && (
                        <Alert type="error" message="Nomor WhatsApp pelanggan tidak valid. Perbarui data pelanggan terlebih dahulu." />
                    )}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="secondary" onClick={closeSendModal} disabled={!!sendingInvoiceId}>
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="success"
                            onClick={handleSendInvoice}
                            disabled={
                                !!sendingInvoiceId
                                || !sendModal.invoice
                                || !isValidPhone(sendModal.invoice.customer?.phone)
                            }
                        >
                            <Send size={16} />
                            {sendingInvoiceId ? 'Mengirim PDF...' : 'Kirim via WhatsApp'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={editModal.open}
                onClose={closeEditModal}
                title={editModal.invoice ? `Edit Invoice #${editModal.invoice.id}` : 'Edit Invoice'}
                size="lg"
            >
                <form onSubmit={handleUpdateInvoice} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Invoice</label>
                            <input
                                type="date"
                                value={formData.invoice_date}
                                onChange={(event) =>
                                    setFormData((prev) => ({ ...prev, invoice_date: event.target.value }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Jatuh Tempo</label>
                            <input
                                type="date"
                                value={formData.due_date}
                                onChange={(event) =>
                                    setFormData((prev) => ({ ...prev, due_date: event.target.value }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                            <input
                                type="number"
                                value={formData.amount}
                                min={1}
                                step={1}
                                onChange={(event) =>
                                    setFormData((prev) => ({ ...prev, amount: event.target.value }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                value={formData.status}
                                onChange={(event) =>
                                    setFormData((prev) => ({ ...prev, status: event.target.value }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            >
                                {STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm text-amber-800">
                            Penghapusan invoice hanya diizinkan jika status invoice adalah unpaid.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeEditModal}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default InvoiceManagementPage;

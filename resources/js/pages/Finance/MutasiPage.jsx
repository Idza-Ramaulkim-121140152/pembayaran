import { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Edit2, Trash2, Plus, CheckCircle2, XCircle, AlertCircle, Clock, Eye, ExternalLink, FileText, User, ArrowUpRight, ArrowDownLeft, Image as ImageIcon } from 'lucide-react';
import apiClient from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import {
    AdminConsoleActionRow,
    AdminConsoleField,
    AdminConsoleNotice,
    AdminConsoleSurface,
    adminConsoleButtonClassNames,
    adminConsoleInputClassName,
    adminConsoleSelectClassName,
} from '../../components/common/AdminConsoleUI';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
});

const monthFormatter = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
});

function toDateInputLocal(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function formatDateInputLabel(value) {
    const date = parseDateInput(value);
    return date ? dateFormatter.format(date) : '-';
}

function buildCalendarDays(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(year, month, 1 - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        return date;
    });
}

function MutasiPage() {
    const now = new Date();
    const currentMonthStart = toDateInputLocal(new Date(now.getFullYear(), now.getMonth(), 1));
    const currentMonthEnd = toDateInputLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const canEditMutations = !!window.appCanEditMutations;
    const canChoosePaymentReceiver = !!window.appCanChoosePaymentReceiver;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [items, setItems] = useState([]);
    const [paymentReceiptOptions, setPaymentReceiptOptions] = useState([]);
    const [paymentReceivers, setPaymentReceivers] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [confirmModalItem, setConfirmModalItem] = useState(null);
    const [confirmForm, setConfirmForm] = useState({
        payment_receiver_user_id: '',
        payment_receipt_option_id: '',
    });
    const [rejectModalItem, setRejectModalItem] = useState(null);
    const [detailModalItem, setDetailModalItem] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [pageSize, setPageSize] = useState(50);
    const [pageInfo, setPageInfo] = useState({ current: 1, last: 1, total: 0 });
    const [statementTotals, setStatementTotals] = useState({ income: 0, expense: 0 });
    const [filters, setFilters] = useState({
        type: '',
        status: '',
        source: '',
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
        keyword: '',
    });
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [rangeAnchor, setRangeAnchor] = useState(null);
    const [calendarMonth, setCalendarMonth] = useState(() => parseDateInput(currentMonthStart) || new Date());

    const [createForm, setCreateForm] = useState({
        source: 'manual',
        description: '',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
        payment_receipt_option_id: '',
        payment_receiver_user_id: '',
    });

    const [editForm, setEditForm] = useState({
        description: '',
        amount: '',
        status: 'confirmed',
        transaction_date: new Date().toISOString().split('T')[0],
        payment_receipt_option_id: '',
        payment_receiver_user_id: '',
    });

    const loadPaymentReceiptOptions = async () => {
        try {
            const res = await apiClient.get('/payment-receipt-options/active');
            setPaymentReceiptOptions(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setPaymentReceiptOptions([]);
        }
    };

    const loadPaymentReceivers = async () => {
        try {
            const res = await apiClient.get('/payment-receivers');
            setPaymentReceivers(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch (err) {
            setPaymentReceivers([]);
        }
    };

    const loadData = async (page = 1, filterOverride = null, pageSizeOverride = null) => {
        try {
            setLoading(true);
            const activeFilters = filterOverride || filters;
            const activePageSize = pageSizeOverride || pageSize;
            const params = { page, per_page: activePageSize };
            if (activeFilters.type) params.type = activeFilters.type;
            if (activeFilters.status) params.status = activeFilters.status;
            if (activeFilters.source) params.source = activeFilters.source;
            if (activeFilters.start_date) params.start_date = activeFilters.start_date;
            if (activeFilters.end_date) params.end_date = activeFilters.end_date;
            if (activeFilters.keyword?.trim()) params.keyword = activeFilters.keyword.trim();

            const res = await apiClient.get('/finance/transactions', { params });
            const list = res.data?.data?.data || [];
            const summary = res.data?.summary || {};
            setItems(list);
            setStatementTotals({
                income: Number(summary.income || 0),
                expense: Number(summary.expense || 0),
            });
            setPageInfo({
                current: res.data?.data?.current_page || 1,
                last: res.data?.data?.last_page || 1,
                total: res.data?.data?.total || 0,
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data mutasi');
            setItems([]);
            setStatementTotals({ income: 0, expense: 0 });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(1);
        loadPaymentReceiptOptions();
        loadPaymentReceivers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleItems = items;

    const pageTotals = visibleItems.reduce(
        (acc, item) => {
            const amount = Number(item.amount || 0);
            const isConfirmed = (item.status || 'confirmed') === 'confirmed';
            const isIncome = item.type === 'income' || (item.type === 'adjustment' && amount > 0);
            const isExpense = item.type === 'expense' || (item.type === 'adjustment' && amount < 0);

            if (!isConfirmed) {
                return acc;
            }

            if (isIncome) {
                acc.income += Math.abs(amount);
            }
            if (isExpense) {
                acc.expense += Math.abs(amount);
            }

            return acc;
        },
        { income: 0, expense: 0 }
    );

    const netMutation = statementTotals.income - statementTotals.expense;

    const getReceivedViaName = (item) => {
        const methodName = item?.meta?.received_via_name || '';
        const receiverName = item?.meta?.payment_receiver_name || '';

        if (methodName && receiverName) return `${methodName} - ${receiverName}`;
        if (methodName) return methodName;
        if (receiverName) return `Penerima: ${receiverName}`;

        return '-';
    };

    const getPaymentReceiverLabel = (receiver) => {
        if (!receiver) return '-';
        const role = receiver.role ? ` (${receiver.role})` : '';
        const companyTag = receiver.is_company_finance_receiver ? ' [Keuangan Perusahaan]' : '';
        return `${receiver.name || receiver.email || receiver.id}${role}${companyTag}`;
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(Number(amount || 0));
    };

    const formatDateTime = (value, fallback = null) => {
        const source = value || fallback;
        if (!source) return '-';
        const normalized = typeof source === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source)
            ? `${source}T00:00:00`
            : source;
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return source;

        return date.toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Jakarta',
        });
    };

    const openDetailModal = async (item) => {
        if (!item) return;
        setDetailModalItem(item);
        if (!item.id) return;
        try {
            setDetailLoading(true);
            const res = await apiClient.get(`/finance/transactions/${item.id}`);
            if (res.data?.data) {
                setDetailModalItem(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load transaction detail:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const mutationColumns = [
        {
            key: 'created_at',
            label: 'Waktu',
            render: (row) => formatDateTime(row.created_at, row.transaction_date),
        },
        {
            key: 'status',
            label: 'Status',
            render: (row) => {
                const status = row.status || 'confirmed';
                const palette = status === 'pending'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : status === 'rejected'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

                return (
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${palette}`}>
                        {status}
                    </span>
                );
            },
        },
        {
            key: 'type',
            label: 'Jenis',
            render: (row) => (
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    row.type === 'income'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : row.type === 'expense'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                    {row.type}
                </span>
            ),
        },
        { key: 'source', label: 'Sumber' },
        {
            key: 'description',
            label: 'Deskripsi',
            render: (row) => (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        openDetailModal(row);
                    }}
                    className="text-left font-medium text-slate-800 hover:text-blue-600 hover:underline transition-colors"
                >
                    {row.description || '-'}
                </button>
            ),
        },
        { key: 'received_via', label: 'Penerimaan Via', render: (row) => getReceivedViaName(row) },
        { key: 'creator_name', label: 'Penanggung Jawab', render: (row) => row.creator?.name || 'Sistem' },
        {
            key: 'income',
            label: 'Pemasukan',
            headerClassName: 'px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500',
            cellClassName: 'px-4 py-3 text-right font-semibold text-emerald-600',
            render: (row) => {
                const amount = Number(row.amount || 0);
                const isIncome = row.type === 'income' || (row.type === 'adjustment' && amount > 0);
                return isIncome ? formatCurrency(Math.abs(amount)) : '-';
            },
        },
        {
            key: 'expense',
            label: 'Pengeluaran',
            headerClassName: 'px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500',
            cellClassName: 'px-4 py-3 text-right font-semibold text-rose-600',
            render: (row) => {
                const amount = Number(row.amount || 0);
                const isExpense = row.type === 'expense' || (row.type === 'adjustment' && amount < 0);
                return isExpense ? formatCurrency(Math.abs(amount)) : '-';
            },
        },
    ];

    const themedMutationColumns = mutationColumns.map((column) => ({
        ...column,
        headerClassName: column.headerClassName || 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500',
        cellClassName: column.cellClassName || 'px-4 py-3 text-sm font-medium text-slate-700',
    }));

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            await apiClient.post('/finance/manual-income', {
                source: createForm.source,
                description: createForm.description,
                amount: Number(createForm.amount),
                transaction_date: createForm.transaction_date,
                payment_receipt_option_id: createForm.payment_receipt_option_id
                    ? Number(createForm.payment_receipt_option_id)
                    : null,
                ...(canChoosePaymentReceiver ? {
                    payment_receiver_user_id: createForm.payment_receiver_user_id
                        ? Number(createForm.payment_receiver_user_id)
                        : null,
                } : {}),
            });
            setSuccess('Mutasi pemasukan berhasil ditambahkan.');
            setShowCreateModal(false);
            setCreateForm({
                source: 'manual',
                description: '',
                amount: '',
                transaction_date: new Date().toISOString().split('T')[0],
                payment_receipt_option_id: '',
                payment_receiver_user_id: '',
            });
            loadData(pageInfo.current);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah mutasi');
        } finally {
            setSaving(false);
        }
    };

    const openEditModal = (item) => {
        setSelected(item);
        setEditForm({
            description: item.description || '',
            amount: item.amount,
            status: item.status || 'confirmed',
            transaction_date: item.transaction_date,
            payment_receipt_option_id: item?.meta?.received_via_id ? String(item.meta.received_via_id) : '',
            payment_receiver_user_id: item?.meta?.payment_receiver_user_id ? String(item.meta.payment_receiver_user_id) : '',
        });
        setShowEditModal(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        if (!selected) return;

        try {
            setSaving(true);
            await apiClient.put(`/finance/transactions/${selected.id}`, {
                description: editForm.description,
                amount: Number(editForm.amount),
                status: editForm.status,
                transaction_date: editForm.transaction_date,
                category: selected.category,
                payment_receipt_option_id: editForm.payment_receipt_option_id
                    ? Number(editForm.payment_receipt_option_id)
                    : null,
                ...(canChoosePaymentReceiver ? {
                    payment_receiver_user_id: editForm.payment_receiver_user_id
                        ? Number(editForm.payment_receiver_user_id)
                        : null,
                } : {}),
            });
            setSuccess('Mutasi berhasil diperbarui.');
            setShowEditModal(false);
            setSelected(null);
            loadData(pageInfo.current);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui mutasi');
        } finally {
            setSaving(false);
        }
    };

    const openConfirmModal = (item) => {
        setConfirmModalItem(item);
        const defaultReceiver = item?.meta?.payment_receiver_user_id
            ? String(item.meta.payment_receiver_user_id)
            : (item?.created_by ? String(item.created_by) : '');
        const defaultReceipt = item?.meta?.received_via_id
            ? String(item.meta.received_via_id)
            : '';
        setConfirmForm({
            payment_receiver_user_id: defaultReceiver,
            payment_receipt_option_id: defaultReceipt,
        });
    };

    const handleConfirmTransaction = async (item) => {
        if (!item) return;
        try {
            setActionLoading(true);
            const payload = {
                payment_receiver_user_id: confirmForm.payment_receiver_user_id
                    ? Number(confirmForm.payment_receiver_user_id)
                    : null,
                payment_receipt_option_id: confirmForm.payment_receipt_option_id
                    ? Number(confirmForm.payment_receipt_option_id)
                    : null,
            };
            const response = await apiClient.post(`/finance/transactions/${item.id}/confirm`, payload);
            setSuccess(response.data?.message || `Transaksi "${item.description || 'Pemasukan'}" berhasil dikonfirmasi.`);
            setConfirmModalItem(null);
            loadData(pageInfo.current);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengonfirmasi transaksi.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectTransaction = async (item) => {
        if (!item) return;
        try {
            setActionLoading(true);
            await apiClient.post(`/finance/transactions/${item.id}/reject`);
            setSuccess(`Transaksi "${item.description || 'Pemasukan'}" telah ditolak.`);
            setRejectModalItem(null);
            loadData(pageInfo.current);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menolak transaksi.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async (item) => {
        if (!window.confirm('Hapus mutasi ini?')) return;

        try {
            await apiClient.delete(`/finance/transactions/${item.id}`);
            setSuccess('Mutasi berhasil dihapus.');
            loadData(pageInfo.current);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus mutasi');
        }
    };

    const applyFilter = (e) => {
        e.preventDefault();
        setRangeAnchor(null);
        setDatePickerOpen(false);
        loadData(1);
    };

    const resetFilter = () => {
        const resetValues = {
            type: '',
            status: '',
            source: '',
            start_date: currentMonthStart,
            end_date: currentMonthEnd,
            keyword: '',
        };
        setFilters(resetValues);
        setRangeAnchor(null);
        setCalendarMonth(parseDateInput(currentMonthStart) || new Date());
        setDatePickerOpen(false);
        loadData(1, resetValues);
    };

    const handlePageSizeChange = (e) => {
        const nextPageSize = Number(e.target.value);
        setPageSize(nextPageSize);
        loadData(1, null, nextPageSize);
    };

    const selectDateRangeDay = (date) => {
        const selectedDate = toDateInputLocal(date);

        if (!rangeAnchor) {
            setRangeAnchor(selectedDate);
            setFilters((prev) => ({
                ...prev,
                start_date: selectedDate,
                end_date: selectedDate,
            }));
            return;
        }

        const nextStart = selectedDate < rangeAnchor ? selectedDate : rangeAnchor;
        const nextEnd = selectedDate < rangeAnchor ? rangeAnchor : selectedDate;

        setFilters((prev) => ({
            ...prev,
            start_date: nextStart,
            end_date: nextEnd,
        }));
        setRangeAnchor(null);
        setDatePickerOpen(false);
    };

    const shiftCalendarMonth = (direction) => {
        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

    const dateRangeLabel = filters.start_date && filters.end_date && filters.start_date !== filters.end_date
        ? `${formatDateInputLabel(filters.start_date)} - ${formatDateInputLabel(filters.end_date)}`
        : formatDateInputLabel(filters.start_date || filters.end_date);
    const calendarDays = buildCalendarDays(calendarMonth);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner text="Memuat mutasi..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Mutasi Keuangan</h1>
                    <p className="text-gray-500 mt-1">Riwayat transaksi pemasukan, pengeluaran, payroll, dan penyesuaian</p>
                </div>
                {canEditMutations && (
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-600 px-4 py-2.5 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
                    >
                        <Plus size={16} /> Tambah Mutasi
                    </button>
                )}
            </div>

            {!canEditMutations && (
                <AdminConsoleNotice tone="info">
                    Anda hanya memiliki akses lihat mutasi. Hubungi superadmin jika memerlukan hak edit.
                </AdminConsoleNotice>
            )}

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {canEditMutations && items.filter((it) => (it.status || 'confirmed') === 'pending').length > 0 && filters.status !== 'pending' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-amber-200/80 p-2 text-amber-800">
                            <Clock size={20} />
                        </div>
                        <div>
                            <p className="font-semibold text-amber-950">
                                Terdapat {items.filter((it) => (it.status || 'confirmed') === 'pending').length} transaksi berstatus Pending
                            </p>
                            <p className="text-xs text-amber-800">
                                Transaksi ini (seperti biaya pemasangan dari teknisi) menunggu konfirmasi penerimaan kantor sebelum masuk ke kas resmi.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const newFilters = { ...filters, status: 'pending' };
                            setFilters(newFilters);
                            loadData(1, newFilters);
                        }}
                        className="shrink-0 rounded-xl border border-amber-400/60 bg-amber-200/80 px-3 py-1.5 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
                    >
                        Filter Pending Saja
                    </button>
                </div>
            )}

            <AdminConsoleSurface accent="violet" className="relative z-20 overflow-visible p-4">
            <form onSubmit={applyFilter}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                    <AdminConsoleField label="Jenis">
                        <select
                            value={filters.type}
                            onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Semua</option>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                            <option value="adjustment">Adjustment</option>
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Status">
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Semua</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Sumber">
                        <select
                            value={filters.source}
                            onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Semua</option>
                            <option value="invoice_payment">Invoice Payment</option>
                            <option value="installation_income">Installation Income</option>
                            <option value="manual_income">Manual Income</option>
                            <option value="manual_payment_income">Manual Payment Income</option>
                            <option value="pengeluaran">Pengeluaran</option>
                            <option value="payroll">Payroll</option>
                            <option value="balance_adjustment">Balance Adjustment</option>
                        </select>
                    </AdminConsoleField>
                    <div className="block space-y-2 lg:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-700">Tanggal</span>
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    setDatePickerOpen((prev) => !prev);
                                    setCalendarMonth(parseDateInput(filters.start_date || filters.end_date) || new Date());
                                }}
                                className={`${adminConsoleInputClassName} flex items-center justify-between text-left`}
                            >
                                <span>{dateRangeLabel}</span>
                                <Calendar size={18} className="text-slate-500" />
                            </button>

                            {datePickerOpen && (
                                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-[min(22rem,calc(100vw-3rem))] rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/70">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={() => shiftCalendarMonth(-1)}
                                            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <div className="text-center">
                                            <p className="text-sm font-semibold text-slate-900">{monthFormatter.format(calendarMonth)}</p>
                                            <p className="text-xs text-slate-500">
                                                {rangeAnchor ? 'Klik tanggal kedua untuk membuat range.' : 'Klik satu tanggal untuk filter hari itu.'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => shiftCalendarMonth(1)}
                                            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day) => (
                                            <div key={day} className="py-1">{day}</div>
                                        ))}
                                    </div>
                                    <div className="mt-1 grid grid-cols-7 gap-1">
                                        {calendarDays.map((day) => {
                                            const value = toDateInputLocal(day);
                                            const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                                            const isSelected = value === filters.start_date || value === filters.end_date;
                                            const isInRange = filters.start_date && filters.end_date
                                                && value > filters.start_date
                                                && value < filters.end_date;
                                            const isToday = value === toDateInputLocal(new Date());

                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => selectDateRangeDay(day)}
                                                    className={[
                                                        'h-10 rounded-xl text-sm font-semibold transition',
                                                        isSelected ? 'bg-blue-600 text-white shadow-sm' : '',
                                                        !isSelected && isInRange ? 'bg-blue-50 text-blue-700' : '',
                                                        !isSelected && !isInRange && isCurrentMonth ? 'text-slate-700 hover:bg-slate-100' : '',
                                                        !isSelected && !isInRange && !isCurrentMonth ? 'text-slate-300 hover:bg-slate-50' : '',
                                                        isToday && !isSelected ? 'ring-1 ring-blue-200' : '',
                                                    ].filter(Boolean).join(' ')}
                                                >
                                                    {day.getDate()}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const today = toDateInputLocal(new Date());
                                                setRangeAnchor(null);
                                                setFilters((prev) => ({ ...prev, start_date: today, end_date: today }));
                                                setCalendarMonth(parseDateInput(today) || new Date());
                                            }}
                                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                        >
                                            Hari ini
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRangeAnchor(null);
                                                setDatePickerOpen(false);
                                            }}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                        >
                                            Selesai
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <AdminConsoleField label="Cari Cepat">
                        <input
                            type="text"
                            value={filters.keyword}
                            onChange={(e) => setFilters((p) => ({ ...p, keyword: e.target.value }))}
                            placeholder="deskripsi/sumber/jenis/penanggung jawab"
                            className={adminConsoleInputClassName}
                        />
                    </AdminConsoleField>
                </div>
                <AdminConsoleActionRow className="mt-4">
                    <Button type="button" variant="secondary" onClick={resetFilter} className={adminConsoleButtonClassNames.secondary}>Reset</Button>
                    <Button type="submit" variant="primary" className={adminConsoleButtonClassNames.primary}>Terapkan Filter</Button>
                </AdminConsoleActionRow>
            </form>
            </AdminConsoleSurface>

            <AdminConsoleSurface accent="emerald" className="overflow-hidden p-0">
                <div className="border-b border-slate-200 bg-slate-50 p-3 md:hidden">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Total Halaman Ini</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-700">Pemasukan</p>
                            <p className="text-sm font-bold text-emerald-700">{formatCurrency(pageTotals.income)}</p>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-rose-700">Pengeluaran</p>
                            <p className="text-sm font-bold text-rose-700">{formatCurrency(pageTotals.expense)}</p>
                        </div>
                    </div>
                </div>
                <ResponsiveDataView
                    rows={visibleItems}
                    columns={themedMutationColumns}
                    keyField="id"
                    onRowClick={(row) => openDetailModal(row)}
                    priorityFields={['created_at', 'type', 'source', 'income', 'expense']}
                    emptyMessage="Belum ada mutasi."
                    tableClassName="w-full text-sm md:min-w-[1180px]"
                    headClassName="border-b border-slate-200 bg-slate-50"
                    bodyClassName="divide-y divide-slate-100"
                    rowHoverClassName="hover:bg-blue-50/50"
                    emptyDesktopClassName="px-4 py-8 text-center text-slate-500"
                    mobileCardClassName="border border-slate-200 bg-white"
                    mobileLabelClassName="text-slate-500"
                    mobileValueClassName="text-slate-900"
                    mobileEmptyClassName="border border-slate-200 bg-white text-slate-500"
                    mobileActionBarClassName="border-slate-100 bg-slate-50 pt-3"
                    actionsHeaderClassName="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500"
                    actionsCellClassName="px-4 py-3 text-sm text-slate-700"
                    actions={(row) => {
                        const isPending = (row.status || 'confirmed') === 'pending';
                        return (
                            <div className="flex justify-end items-center gap-1.5" data-prevent-row-click="true">
                                <button
                                    type="button"
                                    title="Lihat Detail Mutasi"
                                    className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-blue-600"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openDetailModal(row);
                                    }}
                                >
                                    <Eye size={14} />
                                </button>
                                {canEditMutations && isPending && (
                                    <>
                                        <button
                                            type="button"
                                            title="Konfirmasi / Terima Pembayaran"
                                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:border-emerald-400"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openConfirmModal(row);
                                            }}
                                        >
                                            <CheckCircle2 size={14} className="text-emerald-600" />
                                            <span className="hidden xl:inline">Terima</span>
                                        </button>
                                        <button
                                            type="button"
                                            title="Tolak Pembayaran"
                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 hover:border-rose-400"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRejectModalItem(row);
                                            }}
                                        >
                                            <XCircle size={14} className="text-rose-600" />
                                            <span className="hidden xl:inline">Tolak</span>
                                        </button>
                                    </>
                                )}
                                {canEditMutations && (
                                    <>
                                        <button
                                            type="button"
                                            title="Edit Mutasi"
                                            className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditModal(row);
                                            }}
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            title="Hapus Mutasi"
                                            className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(row);
                                            }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    }}
                />
                <div className="hidden border-t border-slate-200 bg-slate-50 px-4 py-3 md:block">
                    <div className={`grid ${canEditMutations ? 'grid-cols-9' : 'grid-cols-8'} gap-2 items-center text-sm`}>
                        <div className="col-span-6 font-semibold text-slate-700">Total Halaman Ini</div>
                        <div className="text-right font-bold text-emerald-600">{formatCurrency(pageTotals.income)}</div>
                        <div className="text-right font-bold text-rose-600">{formatCurrency(pageTotals.expense)}</div>
                        {canEditMutations ? <div /> : null}
                    </div>
                </div>
            </AdminConsoleSurface>

            <AdminConsoleSurface accent="cyan" className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Ringkasan Mutasi (Statement)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs text-emerald-700">Total Pemasukan</p>
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(statementTotals.income)}</p>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                        <p className="text-xs text-rose-700">Total Pengeluaran</p>
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(statementTotals.expense)}</p>
                    </div>
                    <div className={`rounded-2xl border p-3 ${netMutation >= 0 ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'}`}>
                        <p className={`text-xs ${netMutation >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>Mutasi Bersih</p>
                        <p className="text-lg font-bold text-slate-900">
                            {netMutation >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netMutation))}
                        </p>
                    </div>
                </div>
            </AdminConsoleSurface>

            <AdminConsoleSurface accent="violet" className="p-4">
                <div className="flex flex-col items-center justify-between gap-3 text-sm text-slate-600 md:flex-row">
                <div className="flex flex-wrap items-center gap-3">
                    <div>Total data: <span className="font-semibold text-slate-900">{pageInfo.total}</span></div>
                    <div className="flex items-center gap-2">
                        <label className="text-slate-500">Data ditampilkan:</label>
                        <select
                            value={pageSize}
                            onChange={handlePageSizeChange}
                            className={`${adminConsoleSelectClassName} min-w-[96px] py-1.5 text-sm`}
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadData(pageInfo.current - 1)}
                        disabled={loading || pageInfo.current <= 1}
                        className={adminConsoleButtonClassNames.secondary}
                    >
                        Sebelumnya
                    </Button>
                    <span className="text-slate-600">Halaman <span className="font-semibold text-slate-900">{pageInfo.current}</span> / <span className="font-semibold text-slate-900">{pageInfo.last}</span></span>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadData(pageInfo.current + 1)}
                        disabled={loading || pageInfo.current >= pageInfo.last}
                        className={adminConsoleButtonClassNames.secondary}
                    >
                        Berikutnya
                    </Button>
                </div>
                </div>
            </AdminConsoleSurface>

            <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Tambah Mutasi Pemasukan" theme="dashboard">
                <form onSubmit={handleCreate} className="space-y-4">
                    <AdminConsoleField label="Sumber">
                        <select
                            value={createForm.source}
                            onChange={(e) => setCreateForm((p) => ({ ...p, source: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="manual">Manual</option>
                            <option value="pemasangan">Pemasangan</option>
                            <option value="pembayaran">Pembayaran</option>
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Deskripsi">
                        <input
                            type="text"
                            value={createForm.description}
                            onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                            className={adminConsoleInputClassName}
                            required
                        />
                    </AdminConsoleField>
                    <AdminConsoleField label="Nominal">
                        <input
                            type="number"
                            value={createForm.amount}
                            onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
                            className={adminConsoleInputClassName}
                            required
                        />
                    </AdminConsoleField>
                    <AdminConsoleField label="Penerimaan Via">
                        <select
                            value={createForm.payment_receipt_option_id}
                            onChange={(e) => setCreateForm((p) => ({ ...p, payment_receipt_option_id: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Pilih (opsional)</option>
                            {paymentReceiptOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Penerima Pembayaran">
                        <select
                            value={createForm.payment_receiver_user_id}
                            onChange={(e) => setCreateForm((p) => ({ ...p, payment_receiver_user_id: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Akun saya (default)</option>
                            {paymentReceivers.map((receiver) => (
                                <option key={receiver.id} value={receiver.id}>{getPaymentReceiverLabel(receiver)}</option>
                            ))}
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Tanggal">
                        <input
                            type="date"
                            value={createForm.transaction_date}
                            onChange={(e) => setCreateForm((p) => ({ ...p, transaction_date: e.target.value }))}
                            className={adminConsoleInputClassName}
                            required
                        />
                    </AdminConsoleField>
                    <AdminConsoleActionRow>
                        <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)} className={adminConsoleButtonClassNames.secondary}>Batal</Button>
                        <Button type="submit" variant="primary" disabled={saving} className={adminConsoleButtonClassNames.primary}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                    </AdminConsoleActionRow>
                </form>
            </Modal>

            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Mutasi" theme="dashboard">
                <form onSubmit={handleUpdate} className="space-y-4">
                    <AdminConsoleField label="Deskripsi">
                        <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                            className={adminConsoleInputClassName}
                            required
                        />
                    </AdminConsoleField>
                    <AdminConsoleField label="Nominal">
                        <input
                            type="number"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                            className={adminConsoleInputClassName}
                            required
                        />
                    </AdminConsoleField>
                    <AdminConsoleField label="Status Mutasi">
                        <select
                            value={editForm.status}
                            onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="confirmed">Confirmed (Masuk Kas Resmi)</option>
                            <option value="pending">Pending (Menunggu Konfirmasi)</option>
                            <option value="rejected">Rejected (Ditolak)</option>
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Penerimaan Via">
                        <select
                            value={editForm.payment_receipt_option_id}
                            onChange={(e) => setEditForm((p) => ({ ...p, payment_receipt_option_id: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Pilih (opsional)</option>
                            {paymentReceiptOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Penerima Pembayaran">
                        <select
                            value={editForm.payment_receiver_user_id}
                            onChange={(e) => setEditForm((p) => ({ ...p, payment_receiver_user_id: e.target.value }))}
                            className={adminConsoleSelectClassName}
                        >
                            <option value="">Akun saya (default)</option>
                            {paymentReceivers.map((receiver) => (
                                <option key={receiver.id} value={receiver.id}>{getPaymentReceiverLabel(receiver)}</option>
                            ))}
                        </select>
                    </AdminConsoleField>
                    <AdminConsoleField label="Tanggal">
                        <input
                            type="date"
                            value={editForm.transaction_date}
                            onChange={(e) => setEditForm((p) => ({ ...p, transaction_date: e.target.value }))}
                            className={adminConsoleInputClassName}
                            required
                        />
                    </AdminConsoleField>
                    <AdminConsoleActionRow>
                        <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)} className={adminConsoleButtonClassNames.secondary}>Batal</Button>
                        <Button type="submit" variant="primary" disabled={saving} className={adminConsoleButtonClassNames.primary}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                    </AdminConsoleActionRow>
                </form>
            </Modal>

            <Modal
                isOpen={!!confirmModalItem}
                onClose={() => !actionLoading && setConfirmModalItem(null)}
                title="Konfirmasi Penerimaan Pembayaran"
                theme="dashboard"
            >
                {confirmModalItem && (() => {
                    const currentSelectedReceiver = paymentReceivers.find((r) => String(r.id) === String(confirmForm.payment_receiver_user_id)) || null;
                    const isCompanyReceiver = !!currentSelectedReceiver?.is_company_finance_receiver;

                    return (
                        <div className="space-y-4 text-slate-100">
                            <p className="text-sm text-slate-300">
                                Konfirmasi penerimaan pembayaran mutasi. Tentukan akun penerima yang memegang dana ini untuk sinkronisasi kas dan hutang.
                            </p>

                            <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/60 p-4 space-y-2.5">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-xs uppercase tracking-wider text-slate-400">Deskripsi:</span>
                                    <span className="text-sm font-semibold text-white text-right max-w-[260px]">{confirmModalItem.description || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs uppercase tracking-wider text-slate-400">Sumber:</span>
                                    <span className="text-sm text-slate-200">{confirmModalItem.source}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs uppercase tracking-wider text-slate-400">Petugas / Teknisi Pencatat:</span>
                                    <span className="text-sm text-slate-200">{confirmModalItem.creator?.name || 'Sistem'}</span>
                                </div>
                                <div className="flex justify-between items-center border-t border-slate-800 pt-2">
                                    <span className="text-xs uppercase tracking-wider text-slate-400">Nominal:</span>
                                    <span className="text-lg font-bold text-emerald-400">{formatCurrency(confirmModalItem.amount)}</span>
                                </div>
                            </div>

                            <div className="space-y-3 pt-1">
                                <AdminConsoleField label="Penerima Pembayaran (Akun yang Menerima Uang)">
                                    <select
                                        value={confirmForm.payment_receiver_user_id}
                                        onChange={(e) => setConfirmForm((p) => ({ ...p, payment_receiver_user_id: e.target.value }))}
                                        className={adminConsoleSelectClassName}
                                    >
                                        <option value="">Pilih Penerima...</option>
                                        {paymentReceivers.map((receiver) => (
                                            <option key={receiver.id} value={receiver.id}>
                                                {getPaymentReceiverLabel(receiver)}
                                            </option>
                                        ))}
                                    </select>
                                </AdminConsoleField>

                                {currentSelectedReceiver ? (
                                    isCompanyReceiver ? (
                                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300 flex items-start gap-2">
                                            <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-emerald-200">Rekening Keuangan Perusahaan</p>
                                                <p className="mt-0.5">Uang masuk langsung ke rekening/kas resmi perusahaan. <strong>Tidak membebankan hutang</strong> ke akun penerima.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-xs text-amber-300 flex items-start gap-2">
                                            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-amber-200">Akun Non-Perusahaan ({currentSelectedReceiver.name})</p>
                                                <p className="mt-0.5">Uang dipegang oleh perorangan/teknisi. Setelah dikonfirmasi, otomatis <strong>dicatat sebagai pinjaman/hutang {currentSelectedReceiver.name}</strong> ke kantor sampai disetorkan.</p>
                                            </div>
                                        </div>
                                    )
                                ) : null}

                                <AdminConsoleField label="Penerimaan Via / Rekening Tujuan">
                                    <select
                                        value={confirmForm.payment_receipt_option_id}
                                        onChange={(e) => setConfirmForm((p) => ({ ...p, payment_receipt_option_id: e.target.value }))}
                                        className={adminConsoleSelectClassName}
                                    >
                                        <option value="">Gunakan metode asal ({getReceivedViaName(confirmModalItem)})</option>
                                        {paymentReceiptOptions.map((option) => (
                                            <option key={option.id} value={option.id}>{option.name}</option>
                                        ))}
                                    </select>
                                </AdminConsoleField>
                            </div>

                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={actionLoading}
                                    onClick={() => setConfirmModalItem(null)}
                                    className={adminConsoleButtonClassNames.secondary}
                                >
                                    Batal
                                </Button>
                                <Button
                                    type="button"
                                    variant="success"
                                    disabled={actionLoading}
                                    onClick={() => handleConfirmTransaction(confirmModalItem)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl px-5 py-2.5 transition"
                                >
                                    {actionLoading ? 'Memproses...' : 'Ya, Konfirmasi Penerimaan'}
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            <Modal
                isOpen={!!rejectModalItem}
                onClose={() => !actionLoading && setRejectModalItem(null)}
                title="Tolak Mutasi Keuangan"
                theme="dashboard"
            >
                {rejectModalItem && (
                    <div className="space-y-4 text-slate-100">
                        <p className="text-sm text-slate-300">
                            Apakah Anda yakin ingin menolak mutasi ini? Status mutasi akan diubah menjadi <span className="font-semibold text-rose-400">Rejected</span> dan tidak dimasukkan ke dalam saldo kas.
                        </p>
                        <div className="rounded-2xl border border-rose-500/20 bg-slate-950/60 p-4 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-xs uppercase tracking-wider text-slate-400">Deskripsi:</span>
                                <span className="text-sm font-semibold text-white text-right max-w-[240px]">{rejectModalItem.description || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-800 pt-2 mt-2">
                                <span className="text-xs uppercase tracking-wider text-slate-400">Nominal:</span>
                                <span className="text-lg font-bold text-rose-400">{formatCurrency(rejectModalItem.amount)}</span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={actionLoading}
                                onClick={() => setRejectModalItem(null)}
                                className={adminConsoleButtonClassNames.secondary}
                            >
                                Batal
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                disabled={actionLoading}
                                onClick={() => handleRejectTransaction(rejectModalItem)}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-2xl px-5 py-2.5 transition"
                            >
                                {actionLoading ? 'Memproses...' : 'Ya, Tolak Mutasi'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Detail Mutasi Modal */}
            <Modal
                isOpen={!!detailModalItem}
                onClose={() => setDetailModalItem(null)}
                title="Detail Mutasi Keuangan"
                size="2xl"
            >
                {detailModalItem && (() => {
                    const item = detailModalItem;
                    const amount = Number(item.amount || 0);
                    const isIncome = item.type === 'income' || (item.type === 'adjustment' && amount > 0);
                    const isExpense = item.type === 'expense' || (item.type === 'adjustment' && amount < 0);
                    const status = item.status || 'confirmed';
                    const isPending = status === 'pending';
                    const isRejected = status === 'rejected';

                    const invoice = item.reference_type?.includes('Invoice') ? item.reference : null;
                    const customer = invoice?.customer || (item.reference_type?.includes('Customer') ? item.reference : null);
                    const pengeluaran = item.reference_type?.includes('Pengeluaran') ? item.reference : null;

                    const proofData = item.meta?.payment_proof
                        || (invoice?.approved_payment_capture?.meta ? {
                            capture_id: invoice.approved_payment_capture.id,
                            source: invoice.approved_payment_capture.source,
                            reference_code: invoice.approved_payment_capture.reference_code || invoice.approved_payment_capture.meta?.analysis?.reference_code,
                            sender_name: invoice.approved_payment_capture.meta?.analysis?.sender_name,
                            bank_name: invoice.approved_payment_capture.meta?.analysis?.payment_channel,
                            amount: invoice.approved_payment_capture.amount,
                            paid_date: invoice.approved_payment_capture.paid_date,
                            paid_time: invoice.approved_payment_capture.meta?.analysis?.paid_time,
                            proof_url: invoice.approved_payment_capture.meta?.media?.path ? (invoice.approved_payment_capture.meta.media.path.startsWith('http') ? invoice.approved_payment_capture.meta.media.path : `/storage/${invoice.approved_payment_capture.meta.media.path.replace(/^\/+/, '')}`) : null,
                            ocr_raw_text: invoice.approved_payment_capture.meta?.analysis?.ocr_raw_text,
                            confidence: invoice.approved_payment_capture.match_confidence,
                        } : null);

                    const proofUrl = proofData?.proof_url
                        || (item.meta?.media?.url || (item.meta?.media?.path ? (item.meta.media.path.startsWith('http') ? item.meta.media.path : `/storage/${item.meta.media.path.replace(/^\/+/, '')}`) : null))
                        || (invoice?.id ? `/billing/invoice/${invoice.id}/payment-proof` : null);

                    const hasQrisMeta = proofData?.reference_code || item.meta?.qris_transaction_number || invoice?.qris_transaction_number;

                    return (
                        <div className="space-y-4 text-slate-800">
                            {detailLoading && (
                                <div className="rounded-xl bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 flex items-center justify-between">
                                    <span>Memperbarui rincian transaksi terbaru...</span>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                                </div>
                            )}

                            {/* Highlight Card */}
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-mono font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-xs">
                                            #TX-{item.id}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                            isPending
                                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                : isRejected
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        }`}>
                                            {isPending && <Clock size={12} className="text-amber-600" />}
                                            {status === 'confirmed' && <CheckCircle2 size={12} className="text-emerald-600" />}
                                            {isRejected && <XCircle size={12} className="text-rose-600" />}
                                            <span className="capitalize">{status}</span>
                                        </span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                            isIncome
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : isExpense
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                                        }`}>
                                            {isIncome ? <ArrowDownLeft size={12} className="text-emerald-600" /> : <ArrowUpRight size={12} className="text-rose-600" />}
                                            <span className="capitalize">{item.type}</span>
                                        </span>
                                        <span className="text-xs font-medium text-slate-700 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                                            {item.source}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Nominal Transaksi</p>
                                        <p className={`text-2xl sm:text-3xl font-extrabold ${isIncome ? 'text-emerald-600' : isExpense ? 'text-rose-600' : 'text-amber-600'}`}>
                                            {isIncome ? '+' : isExpense ? '-' : ''}{formatCurrency(Math.abs(amount))}
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-slate-200 pt-3">
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Deskripsi</p>
                                    <p className="text-base font-bold text-slate-900 break-words">{item.description || '-'}</p>
                                </div>
                            </div>

                            {/* Detail Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-xs">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                        <Calendar size={14} className="text-blue-600" /> Waktu & Pelaksanaan
                                    </p>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-slate-500 text-xs font-medium">Tanggal Transaksi:</span>
                                            <span className="font-semibold text-slate-800 text-right">{item.transaction_date || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-slate-500 text-xs font-medium">Dicatat Pada:</span>
                                            <span className="font-semibold text-slate-800 text-right">{formatDateTime(item.created_at)}</span>
                                        </div>
                                        {item.updated_at && item.updated_at !== item.created_at && (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-slate-500 text-xs font-medium">Terakhir Diubah:</span>
                                                <span className="font-semibold text-slate-800 text-right">{formatDateTime(item.updated_at)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-slate-500 text-xs font-medium">Kategori:</span>
                                            <span className="font-semibold text-slate-800 text-right">{item.category || '-'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-xs">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                        <User size={14} className="text-indigo-600" /> Penanggung Jawab & Penerimaan
                                    </p>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-slate-500 text-xs font-medium">Penerimaan Via:</span>
                                            <span className="font-semibold text-slate-800 text-right">{getReceivedViaName(item)}</span>
                                        </div>
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-slate-500 text-xs font-medium">Penanggung Jawab:</span>
                                            <span className="font-semibold text-slate-800 text-right">
                                                {item.creator?.name || item.meta?.payment_receiver_name || 'Sistem'}
                                            </span>
                                        </div>
                                        {item.meta?.payment_receiver_name && (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-slate-500 text-xs font-medium">Akun Pemegang Kas:</span>
                                                <span className="font-semibold text-slate-800 text-right">
                                                    {item.meta.payment_receiver_name}
                                                    {item.meta?.payment_receiver_is_company_finance ? ' (Kas Perusahaan)' : ' (Titipan)'}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-slate-500 text-xs font-medium">Petugas Input:</span>
                                            <span className="font-semibold text-slate-800 text-right">{item.creator?.name || 'Sistem'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Contextual Box: Invoice Payment */}
                            {(item.source === 'invoice_payment' || invoice) && (
                                <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                                    <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                                        <p className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                                            <FileText size={14} className="text-blue-600" /> Detail Tagihan / Invoice
                                        </p>
                                        {(item.meta?.invoice_link || invoice?.invoice_link) && (
                                            <a
                                                href={`/public/invoice/${item.meta?.invoice_link || invoice?.invoice_link}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                                            >
                                                <span>Buka Invoice Publik</span>
                                                <ExternalLink size={12} />
                                            </a>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs text-slate-600 font-medium">Pelanggan:</span>
                                                <span className="font-semibold text-slate-900 text-right">{customer?.name || item.meta?.customer_name || '-'}</span>
                                            </div>
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs text-slate-600 font-medium">PPPoE Username:</span>
                                                <span className="font-mono text-xs font-bold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded text-right">
                                                    {customer?.pppoe_username || item.meta?.pppoe_username || '-'}
                                                </span>
                                            </div>
                                            {customer?.phone && (
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className="text-xs text-slate-600 font-medium">No. WhatsApp:</span>
                                                    <span className="font-semibold text-slate-800 text-right">{customer.phone}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            {hasQrisMeta && (
                                                <>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-xs text-slate-600 font-medium">No. Referensi / Trx:</span>
                                                        <span className="font-mono text-xs font-bold text-slate-900 text-right">
                                                            {item.meta?.qris_transaction_number || invoice?.qris_transaction_number || '-'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-xs text-slate-600 font-medium">Pengirim Struk:</span>
                                                        <span className="font-semibold text-slate-800 text-right">
                                                            {item.meta?.qris_sender || invoice?.qris_sender || '-'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-xs text-slate-600 font-medium">Jam Bayar Struk:</span>
                                                        <span className="font-semibold text-slate-800 text-right">
                                                            {formatDateTime(item.meta?.qris_payment_time || invoice?.qris_payment_time)}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Detail Bukti Pembayaran Pelanggan */}
                                    {(proofData || proofUrl) && (
                                        <div className="mt-3 pt-3 border-t border-blue-200/80 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                                                    <FileText size={14} className="text-blue-600" /> Rincian Bukti Transfer / Struk Pelanggan
                                                </p>
                                                {proofData?.bank_name && (
                                                    <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full">
                                                        {proofData.bank_name}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white/90 p-3 rounded-xl border border-blue-100 shadow-xs">
                                                <div>
                                                    <span className="text-slate-500 block text-[11px]">No. Transaksi / Referensi:</span>
                                                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded inline-block mt-0.5">
                                                        {proofData?.reference_code || item.meta?.qris_transaction_number || invoice?.qris_transaction_number || '-'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-[11px]">Nama Pengirim di Struk:</span>
                                                    <span className="font-semibold text-slate-800">
                                                        {proofData?.sender_name || item.meta?.qris_sender || invoice?.qris_sender || '-'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-[11px]">Waktu / Tanggal Struk:</span>
                                                    <span className="font-semibold text-slate-800">
                                                        {proofData?.paid_date ? `${proofData.paid_date} ${proofData.paid_time ? `(${proofData.paid_time})` : ''}` : formatDateTime(item.meta?.qris_payment_time || invoice?.qris_payment_time)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-[11px]">Metode / Saluran:</span>
                                                    <span className="font-semibold text-slate-800">
                                                        {proofData?.bank_name || (hasQrisMeta ? 'QRIS / Transfer Bank' : 'Transfer Bank')}
                                                    </span>
                                                </div>
                                                {proofData?.confidence && (
                                                    <div className="col-span-1 sm:col-span-2 flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
                                                        <span className="text-slate-500">Skor Verifikasi AI:</span>
                                                        <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                                            {Number(proofData.confidence).toFixed(0)}% Cocok
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Foto Struk */}
                                            {proofUrl && (
                                                <div className="flex items-center gap-3 bg-white/70 p-2.5 rounded-xl border border-blue-100 shadow-xs">
                                                    <div
                                                        className="h-20 w-20 overflow-hidden rounded-xl border border-blue-200 bg-white cursor-pointer transition hover:opacity-90 flex items-center justify-center shrink-0 shadow-xs relative group"
                                                        onClick={() => setPreviewImage(proofUrl)}
                                                    >
                                                        <img
                                                            src={proofUrl}
                                                            alt="Bukti Transfer"
                                                            className="h-full w-full object-cover"
                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                        />
                                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                                            <Eye size={16} />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                                            <ImageIcon size={13} className="text-blue-600" />
                                                            Foto Bukti Pembayaran Asli
                                                        </p>
                                                        <p className="text-[11px] text-slate-500">
                                                            Klik tombol untuk melihat foto struk resolusi penuh.
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewImage(proofUrl)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition shadow-xs"
                                                        >
                                                            <Eye size={13} /> Lihat Foto Struk Penuh
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Contextual Box: Installation Income */}
                            {item.source === 'installation_income' && (
                                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 space-y-2 text-sm">
                                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-900 flex items-center gap-1.5 border-b border-cyan-100 pb-2">
                                        <FileText size={14} className="text-cyan-600" /> Rincian Pemasangan Baru
                                    </p>
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-xs text-slate-600 font-medium">Pelanggan:</span>
                                            <span className="font-semibold text-slate-900">{customer?.name || item.meta?.customer_name || '-'}</span>
                                        </div>
                                        {customer?.phone && (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs text-slate-600 font-medium">No. WhatsApp:</span>
                                                <span className="font-semibold text-slate-800">{customer.phone}</span>
                                            </div>
                                        )}
                                        {customer?.package?.name && (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs text-slate-600 font-medium">Paket Internet:</span>
                                                <span className="font-semibold text-cyan-800">{customer.package.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Contextual Box: Pengeluaran */}
                            {(item.source === 'pengeluaran' || pengeluaran) && (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 space-y-2 text-sm">
                                    <p className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5 border-b border-rose-100 pb-2">
                                        <FileText size={14} className="text-rose-600" /> Rincian Pengeluaran Operasional
                                    </p>
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-xs text-slate-600 font-medium">Kategori:</span>
                                            <span className="font-semibold text-rose-800">{pengeluaran?.kategori || item.category || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-xs text-slate-600 font-medium">Rincian Pengeluaran:</span>
                                            <span className="font-semibold text-slate-900 text-right max-w-[300px]">{pengeluaran?.detail || item.description || '-'}</span>
                                        </div>
                                        {pengeluaran?.payment_source && (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs text-slate-600 font-medium">Sumber Dana:</span>
                                                <span className="font-semibold text-slate-800">{pengeluaran.payment_source}</span>
                                            </div>
                                        )}
                                        {pengeluaran?.user?.name && (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs text-slate-600 font-medium">Diajukan Oleh:</span>
                                                <span className="font-semibold text-slate-800">{pengeluaran.user.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Modal Footer Actions */}
                            <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-slate-200">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {canEditMutations && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDetailModalItem(null);
                                                openEditModal(item);
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                                        >
                                            <Edit2 size={13} /> Edit Mutasi
                                        </button>
                                    )}
                                    {canEditMutations && isPending && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDetailModalItem(null);
                                                    openConfirmModal(item);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-xs"
                                            >
                                                <CheckCircle2 size={13} /> Terima
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDetailModalItem(null);
                                                    setRejectModalItem(item);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition shadow-xs"
                                            >
                                                <XCircle size={13} /> Tolak
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDetailModalItem(null)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Lightbox / Preview Image Modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-4 right-4 z-10 rounded-full bg-black/70 p-2 text-white hover:bg-black transition"
                        >
                            <XCircle size={20} />
                        </button>
                        <img
                            src={previewImage}
                            alt="Bukti Transfer Penuh"
                            className="max-h-[85vh] max-w-[85vw] object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default MutasiPage;

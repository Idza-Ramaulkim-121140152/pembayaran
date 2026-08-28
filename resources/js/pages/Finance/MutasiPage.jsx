import { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Edit2, Trash2, Plus } from 'lucide-react';
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
        if (!canChoosePaymentReceiver) {
            setPaymentReceivers([]);
            return;
        }

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
        { key: 'description', label: 'Deskripsi', render: (row) => row.description || '-' },
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
                    actions={canEditMutations ? ((row) => (
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100"
                                onClick={() => openEditModal(row)}
                            >
                                <Edit2 size={14} />
                            </button>
                            <button
                                type="button"
                                className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                                onClick={() => handleDelete(row)}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )) : null}
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
                    {canChoosePaymentReceiver && (
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
                    )}
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
                    {canChoosePaymentReceiver && (
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
                    )}
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
        </div>
    );
}

export default MutasiPage;

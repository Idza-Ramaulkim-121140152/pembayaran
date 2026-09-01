import { useEffect, useMemo, useRef, useState } from 'react';
import { 
    Calendar, ChevronLeft, ChevronRight, Clock, Wallet, 
    TrendingUp, TrendingDown, Layers, ListFilter, CheckCircle2, 
    AlertCircle, Edit3, Trash2, Plus, RefreshCw, Eye
} from 'lucide-react';
import apiClient from '../services/api';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

const currencyFormatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
});

function formatCurrency(value) {
    return currencyFormatter.format(Number(value || 0));
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function extractDateKey(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        const match = val.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
    }
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return '';
}

function formatFullDateIndonesian(dateStr) {
    if (!dateStr) return '-';
    const key = extractDateKey(dateStr);
    const parts = key.split('-');
    if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }
    return dateStr;
}

function formatShortDayName(dateStr) {
    if (!dateStr) return '';
    const key = extractDateKey(dateStr);
    const parts = key.split('-');
    if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('id-ID', { weekday: 'short' });
    }
    return '';
}

function formatDayNumber(dateStr) {
    if (!dateStr) return '';
    const key = extractDateKey(dateStr);
    const parts = key.split('-');
    return parts[2] || '';
}

function formatMonthShort(dateStr) {
    if (!dateStr) return '';
    const key = extractDateKey(dateStr);
    const parts = key.split('-');
    if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('id-ID', { month: 'short' });
    }
    return '';
}

function historyTypeLabel(item) {
    return item.history_type === 'settlement' ? 'Pelunasan dicatat' : 'Pinjaman dibuat';
}

function HistoryTypeBadge({ item }) {
    const isSettlement = item.history_type === 'settlement';
    const palette = isSettlement
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
    const dot = isSettlement ? 'bg-emerald-500' : 'bg-amber-500';

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${palette}`}>
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {historyTypeLabel(item)}
        </span>
    );
}

function canEditHistoryItem(item) {
    return item?.history_type === 'loan' || !!item?.action_group_key;
}

const settlementExpenseWindows = ['7', '30', '90', 'all'];
const settlementExpenseWindowLabels = {
    7: '7 hari terakhir',
    30: '30 hari terakhir',
    90: '90 hari terakhir',
    all: 'Semua pengeluaran',
};

function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDaysToDateString(dateStr, days) {
    const parts = (dateStr || getTodayString()).split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function BorrowerLoansPage() {
    const isSuperAdmin = (window.appUserRole || '') === 'superadmin';
    const [loans, setLoans] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [borrowers, setBorrowers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [filters, setFilters] = useState({ status: '', borrower_id: '' });
    
    // Daily view and date selection states
    const todayStr = useMemo(() => getTodayString(), []);
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'grouped'
    const dateStripRef = useRef(null);

    const [modal, setModal] = useState({ open: false, borrower: null });
    const [editHistoryModal, setEditHistoryModal] = useState({ open: false, item: null });
    const [savingHistory, setSavingHistory] = useState(false);
    const [creatingLoan, setCreatingLoan] = useState(false);
    const [settlingLoan, setSettlingLoan] = useState(false);
    const [createLoanForm, setCreateLoanForm] = useState({
        borrower_id: '',
        amount: '',
        occurred_at: todayStr,
        notes: '',
    });
    const [settleForm, setSettleForm] = useState({
        amount: '',
        payment_date: todayStr,
        notes: '',
    });
    const [settlementExpenseLink, setSettlementExpenseLink] = useState({
        enabled: false,
        selectedId: '',
        window: '7',
        options: [],
        loading: false,
    });
    const [editHistoryForm, setEditHistoryForm] = useState({
        amount: '',
        event_date: todayStr,
        notes: '',
    });

    const modalBorrowerMappedUser = modal.borrower?.mapped_user || modal.borrower?.mappedUser || null;
    const modalBorrowerHasMappedUser = Boolean(modalBorrowerMappedUser || modal.borrower?.mapped_user_id);
    const modalBorrowerMappedUserName = modalBorrowerMappedUser?.name || 'akun sistem terhubung';

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [loansResponse, borrowersResponse] = await Promise.all([
                apiClient.get('/borrower-loans', { params: filters }),
                apiClient.get('/borrowers'),
            ]);
            setLoans(Array.isArray(loansResponse.data?.data) ? loansResponse.data.data : []);
            setHistoryItems(Array.isArray(loansResponse.data?.history) ? loansResponse.data.history : []);

            const summaryRows = Array.isArray(loansResponse.data?.borrowers_summary) ? loansResponse.data.borrowers_summary : [];
            const borrowerRows = Array.isArray(borrowersResponse.data?.data) ? borrowersResponse.data.data : [];
            const summaryMap = new Map(summaryRows.map((row) => [Number(row.borrower_id), row]));

            const mergedBorrowers = borrowerRows.map((borrower) => {
                const summary = summaryMap.get(Number(borrower.id));
                return {
                    ...borrower,
                    total_outstanding: Number(summary?.total_outstanding ?? borrower.total_outstanding ?? 0),
                    outstanding_loans_count: Number(summary?.outstanding_loans_count ?? 0),
                    outstanding_loans: Array.isArray(summary?.outstanding_loans) ? summary.outstanding_loans : [],
                };
            });

            setBorrowers(mergedBorrowers);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data hutang.');
        } finally {
            setLoading(false);
        }
    };

    const loadSettlementExpenseOptions = async (windowValue = settlementExpenseLink.window) => {
        if (!modal.borrower?.id) {
            return;
        }

        try {
            setSettlementExpenseLink((previous) => ({ ...previous, loading: true, window: windowValue }));
            const response = await apiClient.get(`/borrowers/${modal.borrower.id}/settlement-expenses`, {
                params: { window: windowValue },
            });
            setSettlementExpenseLink((previous) => ({
                ...previous,
                loading: false,
                window: response.data?.window || windowValue,
                options: Array.isArray(response.data?.data) ? response.data.data : [],
            }));
        } catch (err) {
            setSettlementExpenseLink((previous) => ({ ...previous, loading: false }));
            setError(err.response?.data?.message || 'Gagal memuat daftar pengeluaran untuk pelunasan.');
        }
    };

    useEffect(() => {
        loadData();
    }, [filters.status, filters.borrower_id]);

    const openSettleForBorrower = (borrower) => {
        setModal({ open: true, borrower });
        setSettleForm({
            amount: '',
            payment_date: todayStr,
            notes: '',
        });
        setSettlementExpenseLink({
            enabled: false,
            selectedId: '',
            window: '7',
            options: [],
            loading: false,
        });
    };

    const closeSettleModal = () => {
        setModal({ open: false, borrower: null });
        setSettleForm({
            amount: '',
            payment_date: todayStr,
            notes: '',
        });
        setSettlementExpenseLink({
            enabled: false,
            selectedId: '',
            window: '7',
            options: [],
            loading: false,
        });
    };

    const toggleSettlementExpenseLink = (enabled) => {
        if (enabled && !modalBorrowerHasMappedUser) {
            return;
        }

        setSettlementExpenseLink((previous) => ({
            ...previous,
            enabled,
            selectedId: enabled ? previous.selectedId : '',
        }));

        if (enabled && settlementExpenseLink.options.length === 0) {
            loadSettlementExpenseOptions();
        }
    };

    const selectSettlementExpense = (expenseId) => {
        const selected = settlementExpenseLink.options.find((item) => String(item.id) === String(expenseId));
        setSettlementExpenseLink((previous) => ({ ...previous, selectedId: expenseId }));

        if (!selected) {
            return;
        }

        setSettleForm((previous) => ({
            ...previous,
            amount: selected.amount ? String(selected.amount) : previous.amount,
            payment_date: selected.occurred_at || previous.payment_date,
            notes: selected.notes ? `Pelunasan linked pengeluaran: ${selected.notes}` : previous.notes,
        }));
    };

    const showMoreSettlementExpenses = () => {
        const nextIndex = settlementExpenseWindows.indexOf(settlementExpenseLink.window) + 1;
        if (nextIndex < settlementExpenseWindows.length) {
            loadSettlementExpenseOptions(settlementExpenseWindows[nextIndex]);
        }
    };

    const submitCreateLoan = async (e) => {
        e.preventDefault();
        try {
            setCreatingLoan(true);
            setError(null);
            setSuccess(null);
            await apiClient.post('/borrower-loans', createLoanForm);
            setSuccess('Pinjaman manual berhasil dibuat.');
            setCreateLoanForm({
                borrower_id: '',
                amount: '',
                occurred_at: todayStr,
                notes: '',
            });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah pinjaman manual.');
        } finally {
            setCreatingLoan(false);
        }
    };

    const submitSettle = async (e) => {
        e.preventDefault();
        try {
            setSettlingLoan(true);
            setError(null);
            setSuccess(null);
            await apiClient.post(`/borrowers/${modal.borrower.id}/settle`, {
                amount: settleForm.amount,
                payment_date: settleForm.payment_date,
                notes: settleForm.notes,
                pengeluaran_id: settlementExpenseLink.enabled ? settlementExpenseLink.selectedId || null : null,
            });
            setSuccess('Pelunasan berhasil dicatat.');
            closeSettleModal();
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mencatat pelunasan.');
        } finally {
            setSettlingLoan(false);
        }
    };

    const openEditHistory = (item) => {
        setEditHistoryModal({ open: true, item });
        setEditHistoryForm({
            amount: item.amount ? String(item.amount) : '',
            event_date: item.event_date ? extractDateKey(item.event_date) : todayStr,
            notes: item.notes || '',
        });
    };

    const closeEditHistory = () => {
        setEditHistoryModal({ open: false, item: null });
        setEditHistoryForm({
            amount: '',
            event_date: todayStr,
            notes: '',
        });
    };

    const submitEditHistory = async (e) => {
        e.preventDefault();
        if (!editHistoryModal.item) return;

        try {
            setSavingHistory(true);
            setError(null);
            setSuccess(null);

            const item = editHistoryModal.item;
            if (item.history_type === 'loan') {
                await apiClient.put(`/borrower-loans/${item.loan_id}`, {
                    amount: editHistoryForm.amount,
                    occurred_at: editHistoryForm.event_date,
                    notes: editHistoryForm.notes,
                });
            } else {
                await apiClient.put(`/borrower-loan-settlement-groups/${item.action_group_key || item.id}`, {
                    amount: editHistoryForm.amount,
                    payment_date: editHistoryForm.event_date,
                    notes: editHistoryForm.notes,
                });
            }

            setSuccess('Histori pinjaman berhasil diperbarui.');
            closeEditHistory();
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui histori pinjaman.');
        } finally {
            setSavingHistory(false);
        }
    };

    const deleteHistory = async (item) => {
        if (!window.confirm(`Hapus histori ${historyTypeLabel(item).toLowerCase()} sebesar ${formatCurrency(item.amount)}? Jumlah pinjaman akan ikut berubah.`)) {
            return;
        }

        try {
            setSavingHistory(true);
            setError(null);
            setSuccess(null);

            if (item.history_type === 'loan') {
                await apiClient.delete(`/borrower-loans/${item.loan_id}`);
            } else {
                await apiClient.delete(`/borrower-loan-settlement-groups/${item.action_group_key || item.id}`);
            }

            setSuccess('Histori pinjaman berhasil dihapus.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus histori pinjaman.');
        } finally {
            setSavingHistory(false);
        }
    };

    // ----------------------------------------------------
    // DAILY GROUPING & NAVIGATION LOGIC
    // ----------------------------------------------------

    // Group all history items by date key (YYYY-MM-DD)
    const groupedHistory = useMemo(() => {
        const groups = {};
        for (const item of historyItems) {
            const dateKey = extractDateKey(item.event_date) || 'Tanpa Tanggal';
            if (!groups[dateKey]) {
                groups[dateKey] = {
                    dateKey,
                    items: [],
                    totalLoan: 0,
                    totalSettlement: 0,
                    count: 0,
                };
            }
            groups[dateKey].items.push(item);
            groups[dateKey].count += 1;
            if (item.history_type === 'settlement') {
                groups[dateKey].totalSettlement += Number(item.amount || 0);
            } else {
                groups[dateKey].totalLoan += Number(item.amount || 0);
            }
        }

        // Sort descending by date
        return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    }, [historyItems]);

    // Map of dateKey -> summary for fast lookup in date strip
    const dateSummaryMap = useMemo(() => {
        const map = new Map();
        for (const g of groupedHistory) {
            map.set(g.dateKey, g);
        }
        return map;
    }, [groupedHistory]);

    // Items for currently selected date in daily mode
    const dailyData = useMemo(() => {
        const summary = dateSummaryMap.get(selectedDate);
        return summary || {
            dateKey: selectedDate,
            items: [],
            totalLoan: 0,
            totalSettlement: 0,
            count: 0,
        };
    }, [dateSummaryMap, selectedDate]);

    // Generate day list for the horizontal swipeable strip (e.g. 14 days around selectedDate + active history dates)
    const dayStripList = useMemo(() => {
        const list = [];
        const baseDate = selectedDate || todayStr;
        // Generate 7 days before and 7 days after baseDate
        for (let i = -7; i <= 7; i++) {
            const dStr = addDaysToDateString(baseDate, i);
            const hasData = dateSummaryMap.has(dStr);
            const summary = dateSummaryMap.get(dStr);
            list.push({
                dateStr: dStr,
                hasData,
                count: summary?.count || 0,
                totalLoan: summary?.totalLoan || 0,
                totalSettlement: summary?.totalSettlement || 0,
            });
        }
        return list;
    }, [selectedDate, todayStr, dateSummaryMap]);

    // Date navigation handlers
    const handlePrevDay = () => {
        setSelectedDate((prev) => addDaysToDateString(prev || todayStr, -1));
    };

    const handleNextDay = () => {
        setSelectedDate((prev) => addDaysToDateString(prev || todayStr, 1));
    };

    const handleSelectToday = () => {
        setSelectedDate(todayStr);
        setViewMode('daily');
    };

    const handleFocusDate = (dateKey) => {
        setSelectedDate(dateKey);
        setViewMode('daily');
        window.scrollTo({ top: 400, behavior: 'smooth' });
    };

    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Pinjaman & Hutang</h1>
                <p className="text-gray-600">Kelola akun peminjam di bagian atas, lalu pantau histori pinjaman dan pelunasan per hari.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Tambah Pinjaman Manual</h2>
                    <p className="mt-1 text-sm text-gray-600">Buat pinjaman baru tanpa invoice pelanggan.</p>
                    <form onSubmit={submitCreateLoan} className="mt-4 space-y-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Peminjam</label>
                            <select className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm" value={createLoanForm.borrower_id} onChange={(e) => setCreateLoanForm((p) => ({ ...p, borrower_id: e.target.value }))} required>
                                <option value="">Pilih peminjam</option>
                                {borrowers.map((borrower) => (
                                    <option key={borrower.id} value={borrower.id}>{borrower.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Nominal Pinjaman (Rp)</label>
                            <input className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm" type="number" min="1" placeholder="Contoh: 500000" value={createLoanForm.amount} onChange={(e) => setCreateLoanForm((p) => ({ ...p, amount: e.target.value }))} required />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Tanggal Pinjaman</label>
                            <input className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm" type="date" value={createLoanForm.occurred_at} onChange={(e) => setCreateLoanForm((p) => ({ ...p, occurred_at: e.target.value }))} required />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Catatan (Opsional)</label>
                            <textarea className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm" rows={2} placeholder="Keterangan pinjaman" value={createLoanForm.notes} onChange={(e) => setCreateLoanForm((p) => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <Button type="submit" disabled={creatingLoan} className="w-full bg-blue-600 hover:bg-blue-700 py-2.5 font-semibold">
                            {creatingLoan ? 'Menyimpan...' : 'Simpan Pinjaman'}
                        </Button>
                    </form>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">Daftar Peminjam & Outstanding</h2>
                        <span className="text-xs font-medium text-gray-500">{borrowers.length} Peminjam</span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {borrowers.map((borrower) => (
                            <div key={borrower.id} className="rounded-xl border border-gray-200 p-4 transition hover:border-blue-300 bg-gray-50/50">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">{borrower.name}</p>
                                        <p className="text-xs text-gray-500">{borrower.mapped_user?.name || 'Tanpa akun user'}</p>
                                        <p className="mt-2.5 text-base font-bold text-amber-700">
                                            {formatCurrency(borrower.total_outstanding || 0)}
                                        </p>
                                        <p className="mt-0.5 text-xs text-gray-500">
                                            {Number(borrower.outstanding_loans_count || 0)} pinjaman outstanding
                                        </p>
                                    </div>
                                    {Number(borrower.total_outstanding || 0) > 0 && (
                                        <Button onClick={() => openSettleForBorrower(borrower)} className="text-xs py-1.5 px-3">
                                            Pelunasan
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Filter Status & Borrower */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                        <ListFilter size={15} /> Filter:
                    </span>
                    <select className="rounded-xl border border-gray-300 px-3 py-2 text-xs bg-white font-medium" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                        <option value="">Semua Status Pinjaman</option>
                        <option value="outstanding">Outstanding (Belum Lunas)</option>
                        <option value="settled">Settled (Sudah Lunas)</option>
                        <option value="rejected_by_receiver">Rejected by receiver</option>
                    </select>
                    <select className="rounded-xl border border-gray-300 px-3 py-2 text-xs bg-white font-medium" value={filters.borrower_id} onChange={(e) => setFilters((p) => ({ ...p, borrower_id: e.target.value }))}>
                        <option value="">Semua Peminjam</option>
                        {borrowers.map((borrower) => (
                            <option key={borrower.id} value={borrower.id}>{borrower.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setViewMode('daily')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                            viewMode === 'daily'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <Calendar size={14} />
                        Mode Per Hari
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('grouped')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                            viewMode === 'grouped'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <Layers size={14} />
                        Semua Hari
                    </button>
                </div>
            </div>

            {/* 🌟 HISTORI PINJAMAN PER HARI DENGAN NAVIGATOR & GESER HARI 🌟 */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {/* Header section with Date Navigation */}
                <div className="border-b border-gray-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-white/10 rounded-lg">
                                    <Calendar size={18} className="text-blue-400" />
                                </span>
                                <h2 className="text-lg font-bold text-white tracking-tight">Histori Transaksi Pinjaman & Pelunasan</h2>
                            </div>
                            <p className="mt-1 text-xs text-slate-300">
                                {viewMode === 'daily'
                                    ? 'Geser hari atau pilih tanggal spesifik untuk melihat mutasi pinjaman pada hari tersebut.'
                                    : 'Timeline seluruh riwayat pinjaman dikelompokkan per hari.'}
                            </p>
                        </div>

                        {/* Date Picker & Jump Button */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1">
                                <Calendar size={14} className="text-slate-400 mr-2" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            setSelectedDate(e.target.value);
                                            setViewMode('daily');
                                        }
                                    }}
                                    className="bg-transparent text-xs text-white border-0 p-0 focus:ring-0 cursor-pointer font-medium"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleSelectToday}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                    selectedDate === todayStr && viewMode === 'daily'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white/10 hover:bg-white/20 text-slate-200'
                                }`}
                            >
                                Hari Ini
                            </button>
                        </div>
                    </div>

                    {/* Horizontal Day Strip (Geser Hari Carousel) */}
                    {viewMode === 'daily' && (
                        <div className="pt-2 border-t border-slate-700/60">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                    <Clock size={12} /> Geser & Pilih Hari:
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={handlePrevDay}
                                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs px-2"
                                        title="Hari Sebelumnya"
                                    >
                                        <ChevronLeft size={14} /> Prev
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleNextDay}
                                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs px-2"
                                        title="Hari Berikutnya"
                                    >
                                        Next <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Day Pills */}
                            <div 
                                ref={dateStripRef}
                                className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
                            >
                                {dayStripList.map((day) => {
                                    const isSelected = day.dateStr === selectedDate;
                                    const isToday = day.dateStr === todayStr;

                                    return (
                                        <button
                                            key={day.dateStr}
                                            type="button"
                                            onClick={() => setSelectedDate(day.dateStr)}
                                            className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[64px] py-2 px-2.5 rounded-2xl transition border ${
                                                isSelected
                                                    ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-md ring-2 ring-blue-400/40'
                                                    : isToday
                                                    ? 'bg-slate-800 border-blue-500 text-blue-300 hover:bg-slate-700'
                                                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/80 hover:text-white'
                                            }`}
                                        >
                                            <span className="text-[10px] uppercase font-semibold tracking-wider">
                                                {formatShortDayName(day.dateStr)}
                                            </span>
                                            <span className="text-base font-black my-0.5">
                                                {formatDayNumber(day.dateStr)}
                                            </span>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                {day.hasData ? (
                                                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-emerald-400'}`} title={`${day.count} transaksi`} />
                                                ) : (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
                                                )}
                                                <span className="text-[9px] opacity-75">
                                                    {formatMonthShort(day.dateStr)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 🌟 VIEW 1: MODE PER HARI (FOKUS TANGGAL TERPILIH) 🌟 */}
                {viewMode === 'daily' && (
                    <div className="p-5 space-y-5">
                        {/* Daily Header Summary Card */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                            <div>
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    Transaksi Tanggal:
                                </span>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mt-0.5">
                                    📅 {formatFullDateIndonesian(selectedDate)}
                                    {selectedDate === todayStr && (
                                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                                            Hari Ini
                                        </span>
                                    )}
                                </h3>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
                                    <p className="text-[10px] font-bold text-amber-700 uppercase">Pinjaman Dibuat</p>
                                    <p className="text-sm font-bold text-amber-900">{formatCurrency(dailyData.totalLoan)}</p>
                                </div>

                                <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200">
                                    <p className="text-[10px] font-bold text-emerald-700 uppercase">Pelunasan Dicatat</p>
                                    <p className="text-sm font-bold text-emerald-900">{formatCurrency(dailyData.totalSettlement)}</p>
                                </div>

                                <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200">
                                    <p className="text-[10px] font-bold text-blue-700 uppercase">Total Mutasi</p>
                                    <p className="text-sm font-bold text-blue-900">{dailyData.count} Transaksi</p>
                                </div>
                            </div>
                        </div>

                        {/* Daily Table of Items */}
                        {dailyData.items.length === 0 ? (
                            <div className="py-12 text-center rounded-2xl border border-dashed border-gray-200 bg-white">
                                <Calendar className="mx-auto h-12 w-12 text-gray-300" />
                                <p className="mt-3 text-base font-semibold text-gray-700">
                                    Tidak ada transaksi pinjaman atau pelunasan pada {formatDate(selectedDate)}.
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                    Gunakan tombol navigasi di atas untuk berpindah ke tanggal lain atau beralih ke Mode Semua Hari.
                                </p>
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <Button type="button" variant="secondary" onClick={() => setViewMode('grouped')}>
                                        Lihat Semua Hari
                                    </Button>
                                    {selectedDate !== todayStr && (
                                        <Button type="button" onClick={handleSelectToday}>
                                            Kembali ke Hari Ini
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Jenis Transaksi</th>
                                            <th className="px-4 py-3 text-left">Peminjam</th>
                                            <th className="px-4 py-3 text-left">Akun Pencatat</th>
                                            <th className="px-4 py-3 text-left">Nominal</th>
                                            <th className="px-4 py-3 text-left">Catatan & Keterangan</th>
                                            {isSuperAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {dailyData.items.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50/80 transition">
                                                <td className="px-4 py-3.5">
                                                    <HistoryTypeBadge item={item} />
                                                    <p className="text-[11px] text-gray-400 mt-1">{item.source || 'Manual'}</p>
                                                </td>
                                                <td className="px-4 py-3.5 font-bold text-gray-900">
                                                    {item.borrower?.name || '-'}
                                                </td>
                                                <td className="px-4 py-3.5 text-xs text-gray-600">
                                                    {item.actor_name || 'Sistem'}
                                                </td>
                                                <td className="px-4 py-3.5 font-bold text-sm">
                                                    <span className={item.history_type === 'settlement' ? 'text-emerald-700' : 'text-amber-700'}>
                                                        {formatCurrency(item.amount || 0)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-xs text-gray-600 max-w-xs">
                                                    {item.display_notes || item.notes || '-'}
                                                </td>
                                                {isSuperAdmin && (
                                                    <td className="px-4 py-3.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                onClick={() => openEditHistory(item)}
                                                                disabled={savingHistory || !canEditHistoryItem(item)}
                                                                className="text-xs py-1 px-2.5"
                                                            >
                                                                <Edit3 size={12} className="mr-1" /> Edit
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="danger"
                                                                onClick={() => deleteHistory(item)}
                                                                disabled={savingHistory || !canEditHistoryItem(item)}
                                                                className="text-xs py-1 px-2.5"
                                                            >
                                                                <Trash2 size={12} className="mr-1" /> Hapus
                                                            </Button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* 🌟 VIEW 2: MODE SEMUA HARI (DIKELOMPOKKAN PER HARI SECARA RUNTUT) 🌟 */}
                {viewMode === 'grouped' && (
                    <div className="p-5 space-y-6">
                        {loading ? (
                            <div className="py-8 text-center text-gray-500">Memuat data histori pinjaman...</div>
                        ) : groupedHistory.length === 0 ? (
                            <div className="py-8 text-center text-gray-500">Belum ada histori pinjaman yang tercatat.</div>
                        ) : (
                            groupedHistory.map((group) => (
                                <div key={group.dateKey} className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                                    {/* Group Header */}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50 border-b border-gray-200 px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                                                <Calendar size={16} />
                                            </span>
                                            <div>
                                                <h4 className="font-bold text-gray-900 text-sm">
                                                    {formatFullDateIndonesian(group.dateKey)}
                                                    {group.dateKey === todayStr && (
                                                        <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                                                            Hari Ini
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-xs text-gray-500">
                                                    {group.count} Transaksi tercatat
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="text-xs text-gray-600">
                                                {group.totalLoan > 0 && (
                                                    <span className="mr-3 font-semibold text-amber-700">
                                                        Pinjaman: +{formatCurrency(group.totalLoan)}
                                                    </span>
                                                )}
                                                {group.totalSettlement > 0 && (
                                                    <span className="font-semibold text-emerald-700">
                                                        Pelunasan: -{formatCurrency(group.totalSettlement)}
                                                    </span>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleFocusDate(group.dateKey)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition"
                                            >
                                                <Eye size={13} />
                                                Fokus Hari Ini
                                            </button>
                                        </div>
                                    </div>

                                    {/* Group Table */}
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <thead className="bg-white text-xs font-semibold uppercase text-gray-500 tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-2.5 text-left">Jenis</th>
                                                    <th className="px-4 py-2.5 text-left">Peminjam</th>
                                                    <th className="px-4 py-2.5 text-left">Akun</th>
                                                    <th className="px-4 py-2.5 text-left">Nominal</th>
                                                    <th className="px-4 py-2.5 text-left">Catatan</th>
                                                    {isSuperAdmin && <th className="px-4 py-2.5 text-right">Aksi</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {group.items.map((item) => (
                                                    <tr key={item.id} className="hover:bg-gray-50/60 transition">
                                                        <td className="px-4 py-3">
                                                            <HistoryTypeBadge item={item} />
                                                            <p className="text-[10px] text-gray-400 mt-0.5">{item.source || '-'}</p>
                                                        </td>
                                                        <td className="px-4 py-3 font-semibold text-gray-900">{item.borrower?.name || '-'}</td>
                                                        <td className="px-4 py-3 text-xs text-gray-600">{item.actor_name || 'Sistem'}</td>
                                                        <td className="px-4 py-3 font-bold text-sm">
                                                            <span className={item.history_type === 'settlement' ? 'text-emerald-700' : 'text-amber-700'}>
                                                                {formatCurrency(item.amount || 0)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-gray-600">{item.display_notes || item.notes || '-'}</td>
                                                        {isSuperAdmin && (
                                                            <td className="px-4 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <Button
                                                                        type="button"
                                                                        variant="secondary"
                                                                        onClick={() => openEditHistory(item)}
                                                                        disabled={savingHistory || !canEditHistoryItem(item)}
                                                                        className="text-xs py-1 px-2.5"
                                                                    >
                                                                        <Edit3 size={12} className="mr-1" /> Edit
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="danger"
                                                                        onClick={() => deleteHistory(item)}
                                                                        disabled={savingHistory || !canEditHistoryItem(item)}
                                                                        className="text-xs py-1 px-2.5"
                                                                    >
                                                                        <Trash2 size={12} className="mr-1" /> Hapus
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Modal Pelunasan Hutang */}
            <Modal isOpen={modal.open} onClose={closeSettleModal} title="Pelunasan Hutang">
                <form onSubmit={submitSettle} className="space-y-4">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="font-semibold">{modal.borrower?.name || '-'}</p>
                        <p className="mt-1 text-amber-800">Total outstanding akun: {formatCurrency(modal.borrower?.total_outstanding || 0)}</p>
                        <p className="mt-1 text-xs text-amber-700">Nominal total akan dialokasikan otomatis ke hutang tertua lebih dulu.</p>
                    </div>

                    {modalBorrowerHasMappedUser ? (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                            <label className="flex items-start gap-3 text-sm">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                    checked={settlementExpenseLink.enabled}
                                    onChange={(e) => toggleSettlementExpenseLink(e.target.checked)}
                                />
                                <span>
                                    <span className="block font-semibold text-blue-900">Link ke Pengeluaran</span>
                                    <span className="block text-xs text-blue-700">
                                        Opsional, hanya menampilkan pengeluaran yang dibuat oleh akun peminjam: {modalBorrowerMappedUserName}.
                                    </span>
                                </span>
                            </label>

                            {settlementExpenseLink.enabled && (
                                <div className="mt-3 space-y-2">
                                    <select
                                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                                        value={settlementExpenseLink.selectedId}
                                        onChange={(e) => selectSettlementExpense(e.target.value)}
                                        disabled={settlementExpenseLink.loading}
                                    >
                                        <option value="">
                                            {settlementExpenseLink.loading
                                                ? 'Memuat pengeluaran...'
                                                : `Pilih pengeluaran (${settlementExpenseWindowLabels[settlementExpenseLink.window]})`}
                                        </option>
                                        {settlementExpenseLink.options.map((expense) => (
                                            <option key={expense.id} value={expense.id}>
                                                {expense.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-700">
                                        <span>
                                            {settlementExpenseLink.options.length} pengeluaran tampil dari {settlementExpenseWindowLabels[settlementExpenseLink.window]}.
                                        </span>
                                        {settlementExpenseLink.window !== 'all' && (
                                            <button
                                                type="button"
                                                className="font-semibold text-blue-800 underline-offset-2 hover:underline disabled:opacity-60"
                                                onClick={showMoreSettlementExpenses}
                                                disabled={settlementExpenseLink.loading}
                                            >
                                                Tampilkan lebih banyak
                                            </button>
                                        )}
                                    </div>
                                    {settlementExpenseLink.selectedId && (
                                        <p className="rounded-lg bg-white/80 px-3 py-2 text-xs text-blue-800">
                                            Data pengeluaran mengisi nominal, tanggal, dan catatan pelunasan. Anda masih bisa mengubahnya sebelum simpan.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                            Peminjam belum terhubung ke akun sistem, link pengeluaran tidak tersedia.
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Nominal pelunasan total</label>
                        <input className="w-full rounded-lg border px-3 py-2" type="number" min="1" value={settleForm.amount} onChange={(e) => setSettleForm((p) => ({ ...p, amount: e.target.value }))} required />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal pelunasan</label>
                        <input className="w-full rounded-lg border px-3 py-2" type="date" value={settleForm.payment_date} onChange={(e) => setSettleForm((p) => ({ ...p, payment_date: e.target.value }))} required />
                    </div>
                    <textarea className="w-full rounded-lg border px-3 py-2" rows={3} value={settleForm.notes} onChange={(e) => setSettleForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Catatan" />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeSettleModal}>Batal</Button>
                        <Button type="submit" disabled={settlingLoan}>{settlingLoan ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Modal Edit History */}
            <Modal isOpen={editHistoryModal.open} onClose={closeEditHistory} title={editHistoryModal.item?.history_type === 'settlement' ? 'Edit Pelunasan' : 'Edit Pinjaman'}>
                <form onSubmit={submitEditHistory} className="space-y-4">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                        <p className="font-semibold">{historyTypeLabel(editHistoryModal.item || {})}</p>
                        <p className="mt-1 text-blue-800">
                            Perubahan ini akan langsung menghitung ulang outstanding pinjaman.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Nominal</label>
                        <input className="w-full rounded-lg border px-3 py-2" type="number" min="1" value={editHistoryForm.amount} onChange={(e) => setEditHistoryForm((p) => ({ ...p, amount: e.target.value }))} required />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            {editHistoryModal.item?.history_type === 'settlement' ? 'Tanggal pelunasan' : 'Tanggal pinjaman'}
                        </label>
                        <input className="w-full rounded-lg border px-3 py-2" type="date" value={editHistoryForm.event_date} onChange={(e) => setEditHistoryForm((p) => ({ ...p, event_date: e.target.value }))} required />
                    </div>
                    <textarea className="w-full rounded-lg border px-3 py-2" rows={3} value={editHistoryForm.notes} onChange={(e) => setEditHistoryForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Catatan" />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeEditHistory}>Batal</Button>
                        <Button type="submit" disabled={savingHistory}>{savingHistory ? 'Menyimpan...' : 'Simpan Perubahan'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default BorrowerLoansPage;

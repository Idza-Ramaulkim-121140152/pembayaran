import { useEffect, useState } from 'react';
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
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${palette}`}>
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

function BorrowerLoansPage() {
    const isSuperAdmin = (window.appUserRole || '') === 'superadmin';
    const [loans, setLoans] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [borrowers, setBorrowers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [filters, setFilters] = useState({ status: '', borrower_id: '' });
    const [modal, setModal] = useState({ open: false, borrower: null });
    const [editHistoryModal, setEditHistoryModal] = useState({ open: false, item: null });
    const [savingHistory, setSavingHistory] = useState(false);
    const [creatingLoan, setCreatingLoan] = useState(false);
    const [settlingLoan, setSettlingLoan] = useState(false);
    const [createLoanForm, setCreateLoanForm] = useState({
        borrower_id: '',
        amount: '',
        occurred_at: new Date().toISOString().split('T')[0],
        notes: '',
    });
    const [settleForm, setSettleForm] = useState({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
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
        event_date: new Date().toISOString().split('T')[0],
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
            payment_date: new Date().toISOString().split('T')[0],
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
            payment_date: new Date().toISOString().split('T')[0],
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
            loadSettlementExpenseOptions('7');
        }
    };

    const selectSettlementExpense = (expenseId) => {
        const selectedExpense = settlementExpenseLink.options.find((expense) => String(expense.id) === String(expenseId));
        setSettlementExpenseLink((previous) => ({ ...previous, selectedId: expenseId }));

        if (!selectedExpense) {
            return;
        }

        setSettleForm((previous) => ({
            ...previous,
            amount: String(selectedExpense.jumlah || ''),
            payment_date: selectedExpense.tanggal || previous.payment_date,
            notes: selectedExpense.detail || selectedExpense.kategori || previous.notes,
        }));
    };

    const showMoreSettlementExpenses = () => {
        const currentIndex = settlementExpenseWindows.indexOf(settlementExpenseLink.window);
        const nextWindow = settlementExpenseWindows[Math.min(currentIndex + 1, settlementExpenseWindows.length - 1)];

        if (nextWindow && nextWindow !== settlementExpenseLink.window) {
            loadSettlementExpenseOptions(nextWindow);
        }
    };

    const submitCreateLoan = async (e) => {
        e.preventDefault();
        try {
            setCreatingLoan(true);
            setError(null);
            await apiClient.post('/borrower-loans', {
                borrower_id: Number(createLoanForm.borrower_id),
                amount: Number(createLoanForm.amount),
                occurred_at: createLoanForm.occurred_at,
                notes: createLoanForm.notes,
            });
            setSuccess('Pinjaman manual berhasil ditambahkan.');
            setCreateLoanForm({
                borrower_id: '',
                amount: '',
                occurred_at: new Date().toISOString().split('T')[0],
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
        if (!modal.borrower?.id) {
            setError('Pilih peminjam yang ingin dilunasi.');
            return;
        }

        try {
            setSettlingLoan(true);
            setError(null);
            await apiClient.post(`/borrowers/${modal.borrower.id}/settle`, {
                amount: Number(settleForm.amount),
                payment_date: settleForm.payment_date,
                notes: settleForm.notes,
                pengeluaran_id: settlementExpenseLink.enabled && settlementExpenseLink.selectedId
                    ? Number(settlementExpenseLink.selectedId)
                    : null,
            });
            setSuccess('Pelunasan total berhasil dicatat.');
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
            amount: String(item.amount || ''),
            event_date: (item.event_date || new Date().toISOString()).split('T')[0],
            notes: item.notes || '',
        });
    };

    const closeEditHistory = () => {
        setEditHistoryModal({ open: false, item: null });
        setEditHistoryForm({
            amount: '',
            event_date: new Date().toISOString().split('T')[0],
            notes: '',
        });
    };

    const submitEditHistory = async (e) => {
        e.preventDefault();
        const item = editHistoryModal.item;
        if (!item) return;

        try {
            setSavingHistory(true);
            setError(null);

            if (item.history_type === 'loan') {
                await apiClient.put(`/borrower-loans/${item.loan_id}`, {
                    amount: Number(editHistoryForm.amount),
                    occurred_at: editHistoryForm.event_date,
                    notes: editHistoryForm.notes,
                });
            } else {
                await apiClient.put(`/borrower-loan-settlements/${item.action_group_key}`, {
                    amount: Number(editHistoryForm.amount),
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

            if (item.history_type === 'loan') {
                await apiClient.delete(`/borrower-loans/${item.loan_id}`);
            } else {
                await apiClient.delete(`/borrower-loan-settlements/${item.action_group_key}`);
            }

            setSuccess('Histori pinjaman berhasil dihapus.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus histori pinjaman.');
        } finally {
            setSavingHistory(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Daftar Hutang ke Perusahaan</h1>
                <p className="text-gray-600">Kelola akun peminjam di bagian atas, lalu lihat histori pinjaman dan pelunasan di bagian bawah.</p>
            </div>
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="grid gap-6 xl:grid-cols-[1.05fr_1.6fr]">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Input Pinjaman Manual</h2>
                    <p className="mt-1 text-sm text-gray-600">Buat pinjaman baru tanpa invoice pelanggan.</p>
                    <form onSubmit={submitCreateLoan} className="mt-4 space-y-3">
                        <select className="w-full rounded-lg border px-3 py-2" value={createLoanForm.borrower_id} onChange={(e) => setCreateLoanForm((p) => ({ ...p, borrower_id: e.target.value }))} required>
                            <option value="">Pilih peminjam</option>
                            {borrowers.map((borrower) => (
                                <option key={borrower.id} value={borrower.id}>{borrower.name}</option>
                            ))}
                        </select>
                        <input className="w-full rounded-lg border px-3 py-2" type="number" min="1" placeholder="Nominal pinjaman" value={createLoanForm.amount} onChange={(e) => setCreateLoanForm((p) => ({ ...p, amount: e.target.value }))} required />
                        <input className="w-full rounded-lg border px-3 py-2" type="date" value={createLoanForm.occurred_at} onChange={(e) => setCreateLoanForm((p) => ({ ...p, occurred_at: e.target.value }))} required />
                        <textarea className="w-full rounded-lg border px-3 py-2" rows={3} placeholder="Catatan" value={createLoanForm.notes} onChange={(e) => setCreateLoanForm((p) => ({ ...p, notes: e.target.value }))} />
                        <Button type="submit" disabled={creatingLoan}>{creatingLoan ? 'Menyimpan...' : 'Tambah Pinjaman Manual'}</Button>
                    </form>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Akun Peminjam</h2>
                            <p className="mt-1 text-sm text-gray-600">Pelunasan hanya dilakukan dari akun peminjam di section ini.</p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {borrowers.length === 0 ? (
                            <p className="text-sm text-gray-500">Belum ada data peminjam.</p>
                        ) : borrowers.map((borrower) => (
                            <div key={borrower.id} className="rounded-2xl border border-gray-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-gray-900">{borrower.name}</p>
                                        <p className="text-xs text-gray-500">{borrower.mapped_user?.name || 'Tanpa akun user'}</p>
                                        <p className="mt-3 text-sm font-semibold text-amber-700">
                                            {formatCurrency(borrower.total_outstanding || 0)}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {Number(borrower.outstanding_loans_count || 0)} pinjaman outstanding
                                        </p>
                                    </div>
                            {Number(borrower.total_outstanding || 0) > 0 && (
                                        <Button onClick={() => openSettleForBorrower(borrower)}>Pelunasan Total</Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                <select className="rounded-lg border px-3 py-2" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">Semua status</option>
                    <option value="outstanding">Outstanding</option>
                    <option value="rejected_by_receiver">Rejected by receiver</option>
                    <option value="settled">Settled</option>
                </select>
                <select className="rounded-lg border px-3 py-2" value={filters.borrower_id} onChange={(e) => setFilters((p) => ({ ...p, borrower_id: e.target.value }))}>
                    <option value="">Semua peminjam</option>
                    {borrowers.map((borrower) => (
                        <option key={borrower.id} value={borrower.id}>{borrower.name}</option>
                    ))}
                </select>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <h2 className="text-lg font-semibold text-gray-900">Histori Pinjaman</h2>
                    <p className="mt-1 text-sm text-gray-600">Timeline pinjaman dibuat dan pelunasan yang sudah pernah dicatat.</p>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left">Tanggal</th>
                            <th className="px-4 py-3 text-left">Jenis</th>
                            <th className="px-4 py-3 text-left">Peminjam</th>
                            <th className="px-4 py-3 text-left">Akun</th>
                            <th className="px-4 py-3 text-left">Nominal</th>
                            <th className="px-4 py-3 text-left">Catatan</th>
                            {isSuperAdmin && <th className="px-4 py-3 text-left">Aksi</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td className="px-4 py-4 text-gray-500" colSpan={isSuperAdmin ? 7 : 6}>Memuat...</td></tr>
                        ) : historyItems.length === 0 ? (
                            <tr><td className="px-4 py-4 text-gray-500" colSpan={isSuperAdmin ? 7 : 6}>Belum ada histori pinjaman.</td></tr>
                        ) : historyItems.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3 text-gray-700">{formatDate(item.event_date)}</td>
                                <td className="px-4 py-3">
                                    <HistoryTypeBadge item={item} />
                                    <p className="text-xs text-gray-500">{item.source || '-'}</p>
                                </td>
                                <td className="px-4 py-3 text-gray-900">{item.borrower?.name || '-'}</td>
                                <td className="px-4 py-3 text-gray-700">{item.actor_name || 'Sistem'}</td>
                                <td className="px-4 py-3 font-semibold text-amber-700">{formatCurrency(item.amount || 0)}</td>
                                <td className="px-4 py-3 text-gray-600">{item.display_notes || item.notes || '-'}</td>
                                {isSuperAdmin && (
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-2">
                                            <Button type="button" variant="secondary" onClick={() => openEditHistory(item)} disabled={savingHistory || !canEditHistoryItem(item)}>
                                                Edit
                                            </Button>
                                            <Button type="button" variant="danger" onClick={() => deleteHistory(item)} disabled={savingHistory || !canEditHistoryItem(item)}>
                                                Hapus
                                            </Button>
                                        </div>
                                        {!canEditHistoryItem(item) && (
                                            <p className="mt-1 text-xs text-gray-400">Histori lama belum punya group key.</p>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

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

import { useEffect, useState } from 'react';
import { Edit2, Trash2, Plus } from 'lucide-react';
import apiClient from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';

function MutasiPage() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const canEditMutations = !!window.appCanEditMutations;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [items, setItems] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selected, setSelected] = useState(null);
    const [pageInfo, setPageInfo] = useState({ current: 1, last: 1, total: 0 });
    const [filters, setFilters] = useState({
        type: '',
        source: '',
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
        keyword: '',
    });

    const [createForm, setCreateForm] = useState({
        source: 'manual',
        description: '',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
    });

    const [editForm, setEditForm] = useState({
        description: '',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
    });

    const loadData = async (page = 1, filterOverride = null) => {
        try {
            setLoading(true);
            const activeFilters = filterOverride || filters;
            const params = { page };
            if (activeFilters.type) params.type = activeFilters.type;
            if (activeFilters.source) params.source = activeFilters.source;
            if (activeFilters.start_date) params.start_date = activeFilters.start_date;
            if (activeFilters.end_date) params.end_date = activeFilters.end_date;

            const res = await apiClient.get('/finance/transactions', { params });
            const list = res.data?.data?.data || [];
            setItems(list);
            setPageInfo({
                current: res.data?.data?.current_page || 1,
                last: res.data?.data?.last_page || 1,
                total: res.data?.data?.total || 0,
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data mutasi');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleItems = items.filter((item) => {
        const kw = filters.keyword.trim().toLowerCase();
        if (!kw) return true;

        const sourceText = String(item.source || '').toLowerCase();
        const descText = String(item.description || '').toLowerCase();
        const typeText = String(item.type || '').toLowerCase();

        return sourceText.includes(kw) || descText.includes(kw) || typeText.includes(kw);
    });

    const statementTotals = visibleItems.reduce(
        (acc, item) => {
            const amount = Number(item.amount || 0);
            const isIncome = item.type === 'income' || (item.type === 'adjustment' && amount > 0);
            const isExpense = item.type === 'expense' || (item.type === 'adjustment' && amount < 0);

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

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(Number(amount || 0));
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            await apiClient.post('/finance/manual-income', {
                source: createForm.source,
                description: createForm.description,
                amount: Number(createForm.amount),
                transaction_date: createForm.transaction_date,
            });
            setSuccess('Mutasi pemasukan berhasil ditambahkan.');
            setShowCreateModal(false);
            setCreateForm({
                source: 'manual',
                description: '',
                amount: '',
                transaction_date: new Date().toISOString().split('T')[0],
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
        loadData(1);
    };

    const resetFilter = () => {
        const resetValues = {
            type: '',
            source: '',
            start_date: currentMonthStart,
            end_date: currentMonthEnd,
            keyword: '',
        };
        setFilters(resetValues);
        loadData(1, resetValues);
    };

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
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                    >
                        <Plus size={16} /> Tambah Mutasi
                    </button>
                )}
            </div>

            {!canEditMutations && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm">
                    Anda hanya memiliki akses lihat mutasi. Hubungi superadmin jika memerlukan hak edit.
                </div>
            )}

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <form onSubmit={applyFilter} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Jenis</label>
                        <select
                            value={filters.type}
                            onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                            <option value="">Semua</option>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                            <option value="adjustment">Adjustment</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Sumber</label>
                        <select
                            value={filters.source}
                            onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Dari Tanggal</label>
                        <input
                            type="date"
                            value={filters.start_date}
                            onChange={(e) => setFilters((p) => ({ ...p, start_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Sampai Tanggal</label>
                        <input
                            type="date"
                            value={filters.end_date}
                            onChange={(e) => setFilters((p) => ({ ...p, end_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Cari Cepat</label>
                        <input
                            type="text"
                            value={filters.keyword}
                            onChange={(e) => setFilters((p) => ({ ...p, keyword: e.target.value }))}
                            placeholder="deskripsi/sumber/jenis"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                    <Button type="button" variant="secondary" onClick={resetFilter}>Reset</Button>
                    <Button type="submit" variant="primary">Terapkan Filter</Button>
                </div>
            </form>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-4 py-3 text-left">Tanggal</th>
                                <th className="px-4 py-3 text-left">Jenis</th>
                                <th className="px-4 py-3 text-left">Sumber</th>
                                <th className="px-4 py-3 text-left">Deskripsi</th>
                                <th className="px-4 py-3 text-right">Pemasukan</th>
                                <th className="px-4 py-3 text-right">Pengeluaran</th>
                                {canEditMutations && <th className="px-4 py-3 text-right">Aksi</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {visibleItems.length === 0 && (
                                <tr>
                                    <td colSpan={canEditMutations ? 7 : 6} className="px-4 py-10 text-center text-gray-500">
                                        Belum ada mutasi.
                                    </td>
                                </tr>
                            )}
                            {visibleItems.map((item) => {
                                const amount = Number(item.amount || 0);
                                const isIncome = item.type === 'income' || (item.type === 'adjustment' && amount > 0);
                                const isExpense = item.type === 'expense' || (item.type === 'adjustment' && amount < 0);
                                return (
                                    <tr key={item.id}>
                                        <td className="px-4 py-3">{item.transaction_date}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs ${item.type === 'income' ? 'bg-green-100 text-green-700' : item.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{item.source}</td>
                                        <td className="px-4 py-3">{item.description || '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-green-700">
                                            {isIncome ? formatCurrency(Math.abs(amount)) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                                            {isExpense ? formatCurrency(Math.abs(amount)) : '-'}
                                        </td>
                                        {canEditMutations && (
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-2">
                                                    <button type="button" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" onClick={() => openEditModal(item)}>
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button type="button" className="p-1.5 text-red-600 hover:bg-red-50 rounded" onClick={() => handleDelete(item)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                            <tr>
                                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">
                                    Total Halaman Ini
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                                    {formatCurrency(statementTotals.income)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-red-600">
                                    {formatCurrency(statementTotals.expense)}
                                </td>
                                {canEditMutations && <td className="px-4 py-3" />}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Ringkasan Mutasi (Statement)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                        <p className="text-xs text-green-700">Total Pemasukan</p>
                        <p className="text-lg font-bold text-green-700">{formatCurrency(statementTotals.income)}</p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-xs text-red-700">Total Pengeluaran</p>
                        <p className="text-lg font-bold text-red-700">{formatCurrency(statementTotals.expense)}</p>
                    </div>
                    <div className={`rounded-lg border p-3 ${netMutation >= 0 ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'}`}>
                        <p className={`text-xs ${netMutation >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>Mutasi Bersih</p>
                        <p className={`text-lg font-bold ${netMutation >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                            {netMutation >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netMutation))}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-600">
                <div>Total data: {pageInfo.total}</div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadData(pageInfo.current - 1)}
                        disabled={loading || pageInfo.current <= 1}
                    >
                        Sebelumnya
                    </Button>
                    <span>Halaman {pageInfo.current} / {pageInfo.last}</span>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadData(pageInfo.current + 1)}
                        disabled={loading || pageInfo.current >= pageInfo.last}
                    >
                        Berikutnya
                    </Button>
                </div>
            </div>

            <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Tambah Mutasi Pemasukan">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sumber</label>
                        <select
                            value={createForm.source}
                            onChange={(e) => setCreateForm((p) => ({ ...p, source: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="manual">Manual</option>
                            <option value="pemasangan">Pemasangan</option>
                            <option value="pembayaran">Pembayaran</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                        <input
                            type="text"
                            value={createForm.description}
                            onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
                        <input
                            type="number"
                            value={createForm.amount}
                            onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                        <input
                            type="date"
                            value={createForm.transaction_date}
                            onChange={(e) => setCreateForm((p) => ({ ...p, transaction_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Batal</Button>
                        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Mutasi">
                <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                        <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
                        <input
                            type="number"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                        <input
                            type="date"
                            value={editForm.transaction_date}
                            onChange={(e) => setEditForm((p) => ({ ...p, transaction_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Batal</Button>
                        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default MutasiPage;

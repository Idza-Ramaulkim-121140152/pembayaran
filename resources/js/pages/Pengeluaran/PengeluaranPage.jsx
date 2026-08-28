import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Search, Calendar, DollarSign, Filter, TrendingDown } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import {
    AdminConsoleActionRow,
    AdminConsoleField,
    AdminConsoleNotice,
    AdminConsoleSurface,
    adminConsoleButtonClassNames,
    adminConsoleInputClassName,
    adminConsoleSelectClassName,
    adminConsoleTextareaClassName,
} from '../../components/common/AdminConsoleUI';
import Modal from '../../components/common/Modal';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import pengeluaranService from '../../services/pengeluaranService';
import expenseCategoryService from '../../services/expenseCategoryService';
import borrowerService from '../../services/borrowerService';

function getCategoryLabel(item) {
    return item?.expense_category?.name || item?.kategori || '-';
}

function createDefaultFormData(categories) {
    return {
        tanggal: new Date().toISOString().split('T')[0],
        jumlah: '',
        expense_category_id: categories[0] ? String(categories[0].id) : '',
        detail: '',
        payment_source: 'company_cash',
        borrower_id: '',
    };
}

function PengeluaranForm({
    onSubmit,
    isEdit = false,
    formData,
    setFormData,
    handleInputChange,
    submitting,
    onCancel,
    categories,
    borrowers,
    isSuperAdmin,
}) {
    const useBorrowerLoan = formData.payment_source === 'borrower_loan_repayment';

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <AdminConsoleField label="Tanggal *">
                <input
                    type="date"
                    name="tanggal"
                    value={formData.tanggal}
                    onChange={handleInputChange}
                    required
                    className={adminConsoleInputClassName}
                />
            </AdminConsoleField>
            <AdminConsoleField label="Jumlah (Rp) *">
                <input
                    type="number"
                    inputMode="numeric"
                    name="jumlah"
                    value={formData.jumlah}
                    onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setFormData((prev) => ({ ...prev, jumlah: value }));
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                        }
                    }}
                    required
                    className={adminConsoleInputClassName}
                    placeholder="0"
                    min="0"
                />
            </AdminConsoleField>
            <AdminConsoleField label="Jenis Pengeluaran *">
                <select
                    name="expense_category_id"
                    value={formData.expense_category_id}
                    onChange={handleInputChange}
                    required
                    className={adminConsoleSelectClassName}
                >
                    {categories.map((category) => (
                        <option key={category.id} value={String(category.id)}>{category.name}</option>
                    ))}
                </select>
            </AdminConsoleField>
            <AdminConsoleField label="Detail/Keterangan">
                <textarea
                    name="detail"
                    value={formData.detail}
                    onChange={handleInputChange}
                    rows={3}
                    className={adminConsoleTextareaClassName}
                    placeholder="Keterangan pengeluaran..."
                />
            </AdminConsoleField>
            {isSuperAdmin && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <div className="flex rounded-xl bg-white p-1 border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, payment_source: 'company_cash', borrower_id: '' }))}
                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                !useBorrowerLoan ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            Uang Perusahaan
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, payment_source: 'borrower_loan_repayment' }))}
                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                useBorrowerLoan ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            Potong Pinjaman Borrower
                        </button>
                    </div>
                    <p className="text-xs text-slate-500">
                        Mode borrower dipakai jika peminjam membayar belanja dengan uang pribadi sebagai pengurang hutangnya ke perusahaan.
                    </p>
                    {useBorrowerLoan && (
                        <AdminConsoleField label="Borrower yang Dipotong *">
                            <select
                                name="borrower_id"
                                value={formData.borrower_id}
                                onChange={handleInputChange}
                                required
                                className={adminConsoleSelectClassName}
                            >
                                <option value="">Pilih borrower aktif</option>
                                {borrowers.map((borrower) => (
                                    <option key={borrower.id} value={String(borrower.id)}>
                                        {borrower.name} - sisa {new Intl.NumberFormat('id-ID', {
                                            style: 'currency',
                                            currency: 'IDR',
                                            minimumFractionDigits: 0,
                                        }).format(borrower.total_outstanding || 0)}
                                    </option>
                                ))}
                            </select>
                        </AdminConsoleField>
                    )}
                </div>
            )}
            <AdminConsoleActionRow>
                <Button type="button" variant="secondary" onClick={onCancel} className={adminConsoleButtonClassNames.secondary}>
                    Batal
                </Button>
                <Button type="submit" variant="primary" disabled={submitting} className={adminConsoleButtonClassNames.primary}>
                    {submitting ? 'Menyimpan...' : isEdit ? 'Update' : 'Simpan'}
                </Button>
            </AdminConsoleActionRow>
        </form>
    );
}

function PengeluaranPage() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const [pengeluarans, setPengeluarans] = useState([]);
    const [categories, setCategories] = useState([]);
    const [borrowers, setBorrowers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [search, setSearch] = useState('');
    const [filterKategori, setFilterKategori] = useState('');
    const [filterMonth, setFilterMonth] = useState(currentMonth);
    const [createModal, setCreateModal] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, item: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, item: null });
    const [formData, setFormData] = useState(createDefaultFormData([]));
    const [submitting, setSubmitting] = useState(false);
    const isSuperAdmin = (window.appUserRole || '') === 'superadmin';

    useEffect(() => {
        fetchPageData();
    }, []);

    const fetchPageData = async () => {
        try {
            setLoading(true);
            const [pengeluaranResponse, categoryResponse, borrowerResponse] = await Promise.all([
                pengeluaranService.getAll(),
                expenseCategoryService.getAll(),
                isSuperAdmin ? borrowerService.getAll() : Promise.resolve({ data: { data: [] } }),
            ]);

            const nextCategories = categoryResponse.data.data || [];
            setPengeluarans(pengeluaranResponse.data.data || []);
            setCategories(nextCategories);
            setBorrowers((borrowerResponse.data.data || []).filter((borrower) => borrower.is_active && Number(borrower.total_outstanding || 0) > 0));
            setFormData((prev) => prev.expense_category_id
                ? prev
                : createDefaultFormData(nextCategories)
            );
        } catch (err) {
            setError('Gagal memuat data pengeluaran');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const resetForm = () => {
        setFormData(createDefaultFormData(categories));
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const data = {
                ...formData,
                jumlah: formData.jumlah.toString().replace(/[^0-9]/g, ''),
            };
            await pengeluaranService.create(data);
            setCreateModal(false);
            resetForm();
            setSuccess('Pengeluaran berhasil ditambahkan');
            fetchPageData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambahkan pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const data = {
                ...formData,
                jumlah: formData.jumlah.toString().replace(/[^0-9]/g, ''),
            };
            await pengeluaranService.update(editModal.item.id, data);
            setEditModal({ open: false, item: null });
            resetForm();
            setSuccess('Pengeluaran berhasil diupdate');
            fetchPageData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengupdate pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            setSubmitting(true);
            await pengeluaranService.delete(deleteModal.item.id);
            setDeleteModal({ open: false, item: null });
            setSuccess('Pengeluaran berhasil dihapus');
            fetchPageData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = (item) => {
        const selectedCategoryId = item.expense_category_id || item.expense_category?.id || categories[0]?.id || '';
        setFormData({
            tanggal: item.tanggal,
            jumlah: item.jumlah.toString(),
            expense_category_id: selectedCategoryId ? String(selectedCategoryId) : '',
            detail: item.detail || '',
            payment_source: item.payment_source || 'company_cash',
            borrower_id: item.borrower_id ? String(item.borrower_id) : '',
        });
        setEditModal({ open: true, item });
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(amount);

    const formatDate = (date) => new Date(date).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

    const filteredPengeluarans = pengeluarans.filter((item) => {
        const categoryLabel = getCategoryLabel(item);
        const searchSource = `${item.detail || ''} ${categoryLabel}`.toLowerCase();
        const matchSearch = searchSource.includes(search.toLowerCase());
        const matchKategori = !filterKategori || categoryLabel === filterKategori;
        const matchMonth = !filterMonth || item.tanggal.startsWith(filterMonth);
        return matchSearch && matchKategori && matchMonth;
    });

    const totalPengeluaran = filteredPengeluarans.reduce((sum, item) => sum + Number(item.jumlah), 0);
    const thisMonthTotal = pengeluarans
        .filter((item) => item.tanggal.startsWith(new Date().toISOString().slice(0, 7)))
        .reduce((sum, item) => sum + Number(item.jumlah), 0);

    const categoryFilterOptions = Array.from(new Set(pengeluarans.map((item) => getCategoryLabel(item)).filter(Boolean))).sort();
    const hasActiveCategories = categories.length > 0;

    const pengeluaranColumns = [
        {
            key: 'row_number',
            label: 'No',
            render: (_, index) => index + 1,
        },
        {
            key: 'tanggal',
            label: 'Tanggal',
            render: (row) => formatDate(row.tanggal),
        },
        {
            key: 'kategori',
            label: 'Kategori',
            render: (row) => (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {getCategoryLabel(row)}
                </span>
            ),
        },
        {
            key: 'detail',
            label: 'Detail',
            render: (row) => row.detail || '-',
            cellClassName: 'px-4 py-3 text-sm text-gray-600 max-w-xs truncate',
        },
        {
            key: 'jumlah',
            label: 'Jumlah',
            render: (row) => (
                <span className="font-semibold text-red-600">
                    {formatCurrency(row.jumlah)}
                </span>
            ),
        },
        {
            key: 'payment_source',
            label: 'Sumber',
            render: (row) => row.payment_source === 'borrower_loan_repayment' ? (
                <span className="inline-flex flex-col gap-0.5 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    <span>Potong Pinjaman</span>
                    <span className="font-medium text-blue-500">{row.borrower?.name || 'Borrower'}</span>
                </span>
            ) : (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700">
                    Uang Perusahaan
                </span>
            ),
            mobileHidden: true,
        },
        {
            key: 'user.name',
            label: 'Dicatat Oleh',
            render: (row) => row.user?.name || '-',
            mobileHidden: true,
            cellClassName: 'px-4 py-3 text-sm text-gray-600',
        },
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data pengeluaran..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pengeluaran</h1>
                    <p className="text-gray-600 mt-1">Catat dan kelola pengeluaran operasional</p>
                </div>
                <Button
                    variant="primary"
                    onClick={() => {
                        resetForm();
                        setCreateModal(true);
                    }}
                    className={adminConsoleButtonClassNames.primary}
                    disabled={!hasActiveCategories}
                >
                    <Plus size={20} className="mr-2" />
                    Catat Pengeluaran
                </Button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}
            {!hasActiveCategories && (
                <Alert
                    type="warning"
                    message="Belum ada jenis pengeluaran aktif. Minta superadmin menambahkan master jenis pengeluaran terlebih dahulu."
                />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AdminConsoleSurface accent="rose" className="border-rose-100 bg-rose-50 p-6">
                    <div className="flex items-center gap-4">
                        <div className="rounded-2xl border border-rose-200 bg-white p-3">
                            <TrendingDown className="text-rose-600" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-rose-700">Total Bulan Ini</p>
                            <p className="text-2xl font-bold text-slate-900">{formatCurrency(thisMonthTotal)}</p>
                        </div>
                    </div>
                </AdminConsoleSurface>
                <AdminConsoleSurface accent="cyan" className="border-blue-100 bg-blue-50 p-6">
                    <div className="flex items-center gap-4">
                        <div className="rounded-2xl border border-blue-200 bg-white p-3">
                            <DollarSign className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-blue-700">Total Terfilter</p>
                            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPengeluaran)}</p>
                        </div>
                    </div>
                </AdminConsoleSurface>
            </div>

            <AdminConsoleSurface className="p-4" accent="violet">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <input
                            type="text"
                            placeholder="Cari keterangan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className={`${adminConsoleInputClassName} pl-10`}
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <select
                            value={filterKategori}
                            onChange={(e) => setFilterKategori(e.target.value)}
                            className={`${adminConsoleSelectClassName} appearance-none pl-10`}
                        >
                            <option value="">Semua Kategori</option>
                            {categoryFilterOptions.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <input
                            type="month"
                            value={filterMonth}
                            onChange={(e) => setFilterMonth(e.target.value)}
                            className={`${adminConsoleInputClassName} pl-10`}
                        />
                    </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                    <span>Menampilkan data: {filterMonth ? new Date(`${filterMonth}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : 'Semua bulan'}</span>
                    <button
                        type="button"
                        onClick={() => setFilterMonth(currentMonth)}
                        className="font-medium text-blue-600 hover:text-blue-700"
                    >
                        Kembali ke bulan ini
                    </button>
                </div>
            </AdminConsoleSurface>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <ResponsiveDataView
                    rows={filteredPengeluarans}
                    columns={pengeluaranColumns}
                    keyField="id"
                    priorityFields={['tanggal', 'kategori', 'jumlah']}
                    emptyMessage="Tidak ada data pengeluaran"
                    actions={(row) => (
                        <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => openEditModal(row)} disabled={!hasActiveCategories}>
                                <Edit2 size={14} />
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteModal({ open: true, item: row })}>
                                <Trash2 size={14} />
                            </Button>
                        </div>
                    )}
                />
            </div>

            <Modal isOpen={createModal} onClose={() => { setCreateModal(false); resetForm(); }} title="Catat Pengeluaran Baru" theme="dashboard">
                <PengeluaranForm
                    onSubmit={handleCreate}
                    formData={formData}
                    setFormData={setFormData}
                    handleInputChange={handleInputChange}
                    submitting={submitting}
                    categories={categories}
                    borrowers={borrowers}
                    isSuperAdmin={isSuperAdmin}
                    onCancel={() => {
                        setCreateModal(false);
                        resetForm();
                    }}
                />
            </Modal>

            <Modal isOpen={editModal.open} onClose={() => { setEditModal({ open: false, item: null }); resetForm(); }} title="Edit Pengeluaran" theme="dashboard">
                <PengeluaranForm
                    onSubmit={handleEdit}
                    isEdit
                    formData={formData}
                    setFormData={setFormData}
                    handleInputChange={handleInputChange}
                    submitting={submitting}
                    categories={categories}
                    borrowers={borrowers}
                    isSuperAdmin={isSuperAdmin}
                    onCancel={() => {
                        setEditModal({ open: false, item: null });
                        resetForm();
                    }}
                />
            </Modal>

            <Modal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, item: null })} title="Hapus Pengeluaran" theme="dashboard">
                <div className="space-y-4">
                    <AdminConsoleNotice tone="danger" title="Konfirmasi">
                        <p>
                            Apakah Anda yakin ingin menghapus pengeluaran sebesar <strong>{formatCurrency(deleteModal.item?.jumlah || 0)}</strong>?
                            Tindakan ini tidak dapat dibatalkan.
                        </p>
                    </AdminConsoleNotice>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button variant="secondary" onClick={() => setDeleteModal({ open: false, item: null })} className={adminConsoleButtonClassNames.secondary}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={handleDelete} disabled={submitting} className={adminConsoleButtonClassNames.danger}>
                            {submitting ? 'Menghapus...' : 'Hapus'}
                        </Button>
                    </AdminConsoleActionRow>
                </div>
            </Modal>
        </div>
    );
}

export default PengeluaranPage;

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Calendar, DollarSign, Filter, TrendingDown } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import pengeluaranService from '../../services/pengeluaranService';

const KATEGORI_OPTIONS = [
    'Operasional',
    'Gaji',
    'Peralatan',
    'Maintenance',
    'Transport',
    'Lainnya'
];

function PengeluaranPage() {
    const [pengeluarans, setPengeluarans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [search, setSearch] = useState('');
    const [filterKategori, setFilterKategori] = useState('');
    const [filterMonth, setFilterMonth] = useState('');
    
    // Modal states
    const [createModal, setCreateModal] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, item: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, item: null });
    
    // Form states
    const [formData, setFormData] = useState({
        tanggal: new Date().toISOString().split('T')[0],
        jumlah: '',
        kategori: 'Operasional',
        detail: '',
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchPengeluarans();
    }, []);

    const fetchPengeluarans = async () => {
        try {
            setLoading(true);
            const response = await pengeluaranService.getAll();
            setPengeluarans(response.data.data || []);
        } catch (err) {
            setError('Gagal memuat data pengeluaran');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const resetForm = () => {
        setFormData({
            tanggal: new Date().toISOString().split('T')[0],
            jumlah: '',
            kategori: 'Operasional',
            detail: '',
        });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const data = {
                ...formData,
                jumlah: formData.jumlah.toString().replace(/,/g, ''),
            };
            await pengeluaranService.create(data);
            setCreateModal(false);
            resetForm();
            setSuccess('Pengeluaran berhasil ditambahkan');
            fetchPengeluarans();
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
                jumlah: formData.jumlah.toString().replace(/,/g, ''),
            };
            await pengeluaranService.update(editModal.item.id, data);
            setEditModal({ open: false, item: null });
            resetForm();
            setSuccess('Pengeluaran berhasil diupdate');
            fetchPengeluarans();
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
            fetchPengeluarans();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = (item) => {
        setFormData({
            tanggal: item.tanggal,
            jumlah: item.jumlah.toString(),
            kategori: item.kategori,
            detail: item.detail || '',
        });
        setEditModal({ open: true, item });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    // Filter pengeluarans
    const filteredPengeluarans = pengeluarans.filter(item => {
        const matchSearch = item.detail?.toLowerCase().includes(search.toLowerCase()) ||
                           item.kategori.toLowerCase().includes(search.toLowerCase());
        const matchKategori = !filterKategori || item.kategori === filterKategori;
        const matchMonth = !filterMonth || item.tanggal.startsWith(filterMonth);
        return matchSearch && matchKategori && matchMonth;
    });

    // Calculate totals
    const totalPengeluaran = filteredPengeluarans.reduce((sum, item) => sum + Number(item.jumlah), 0);
    const thisMonthTotal = pengeluarans
        .filter(item => item.tanggal.startsWith(new Date().toISOString().slice(0, 7)))
        .reduce((sum, item) => sum + Number(item.jumlah), 0);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data pengeluaran..." />
            </div>
        );
    }

    const PengeluaranForm = ({ onSubmit, isEdit = false }) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
                <input
                    type="date"
                    name="tanggal"
                    value={formData.tanggal}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah (Rp) *</label>
                <input
                    type="text"
                    name="jumlah"
                    value={formData.jumlah}
                    onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setFormData(prev => ({ ...prev, jumlah: value ? parseInt(value).toLocaleString('id-ID') : '' }));
                    }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
                <select
                    name="kategori"
                    value={formData.kategori}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    {KATEGORI_OPTIONS.map(kat => (
                        <option key={kat} value={kat}>{kat}</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detail/Keterangan</label>
                <textarea
                    name="detail"
                    value={formData.detail}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Keterangan pengeluaran..."
                />
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                        isEdit ? setEditModal({ open: false, item: null }) : setCreateModal(false);
                        resetForm();
                    }}
                >
                    Batal
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                    {submitting ? 'Menyimpan...' : isEdit ? 'Update' : 'Simpan'}
                </Button>
            </div>
        </form>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pengeluaran</h1>
                    <p className="text-gray-600 mt-1">Catat dan kelola pengeluaran operasional</p>
                </div>
                <Button variant="primary" onClick={() => { resetForm(); setCreateModal(true); }}>
                    <Plus size={20} className="mr-2" />
                    Catat Pengeluaran
                </Button>
            </div>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-100 rounded-xl">
                            <TrendingDown className="text-red-600" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Total Bulan Ini</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(thisMonthTotal)}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-xl">
                            <DollarSign className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Total Terfilter</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalPengeluaran)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Cari keterangan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <select
                            value={filterKategori}
                            onChange={(e) => setFilterKategori(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                        >
                            <option value="">Semua Kategori</option>
                            {KATEGORI_OPTIONS.map(kat => (
                                <option key={kat} value={kat}>{kat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="month"
                            value={filterMonth}
                            onChange={(e) => setFilterMonth(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">No</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tanggal</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Kategori</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">Detail</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Jumlah</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Dicatat Oleh</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredPengeluarans.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                        Tidak ada data pengeluaran
                                    </td>
                                </tr>
                            ) : (
                                filteredPengeluarans.map((item, index) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{formatDate(item.tanggal)}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                                {item.kategori}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell max-w-xs truncate">
                                            {item.detail || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-semibold text-red-600">
                                            {formatCurrency(item.jumlah)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                                            {item.user?.name || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1">
                                                <Button 
                                                    size="sm" 
                                                    variant="secondary"
                                                    onClick={() => openEditModal(item)}
                                                >
                                                    <Edit2 size={14} />
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="danger"
                                                    onClick={() => setDeleteModal({ open: true, item })}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Modal */}
            <Modal isOpen={createModal} onClose={() => { setCreateModal(false); resetForm(); }} title="Catat Pengeluaran Baru">
                <PengeluaranForm onSubmit={handleCreate} />
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={editModal.open} onClose={() => { setEditModal({ open: false, item: null }); resetForm(); }} title="Edit Pengeluaran">
                <PengeluaranForm onSubmit={handleEdit} isEdit />
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, item: null })} title="Hapus Pengeluaran">
                <div className="space-y-4">
                    <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                            Apakah Anda yakin ingin menghapus pengeluaran sebesar <strong>{formatCurrency(deleteModal.item?.jumlah || 0)}</strong>? 
                            Tindakan ini tidak dapat dibatalkan.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setDeleteModal({ open: false, item: null })}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={handleDelete} disabled={submitting}>
                            {submitting ? 'Menghapus...' : 'Hapus'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default PengeluaranPage;

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Eye, Users, X, Upload, Image } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import odpService from '../../services/odpService';

function OdpPage() {
    const [odps, setOdps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [search, setSearch] = useState('');
    
    // Modal states
    const [createModal, setCreateModal] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, odp: null });
    const [viewModal, setViewModal] = useState({ open: false, odp: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, odp: null });
    
    // Form states
    const [formData, setFormData] = useState({
        nama: '',
        rasio_spesial: '',
        rasio_distribusi: '1:8',
        foto: null,
    });
    const [submitting, setSubmitting] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);

    useEffect(() => {
        fetchOdps();
    }, []);

    const fetchOdps = async () => {
        try {
            setLoading(true);
            const response = await odpService.getAll();
            setOdps(response.data.data || []);
        } catch (err) {
            setError('Gagal memuat data ODP');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value, files } = e.target;
        if (files) {
            setFormData(prev => ({ ...prev, [name]: files[0] }));
            const reader = new FileReader();
            reader.onloadend = () => setPreviewImage(reader.result);
            reader.readAsDataURL(files[0]);
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const resetForm = () => {
        setFormData({
            nama: '',
            rasio_spesial: '',
            rasio_distribusi: '1:8',
            foto: null,
        });
        setPreviewImage(null);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const data = new FormData();
            Object.keys(formData).forEach(key => {
                if (formData[key] !== null && formData[key] !== '') {
                    data.append(key, formData[key]);
                }
            });
            
            await odpService.create(data);
            setCreateModal(false);
            resetForm();
            setSuccess('ODP berhasil ditambahkan');
            fetchOdps();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambahkan ODP');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const data = new FormData();
            data.append('_method', 'PUT');
            Object.keys(formData).forEach(key => {
                if (formData[key] !== null && formData[key] !== '') {
                    data.append(key, formData[key]);
                }
            });
            
            await odpService.update(editModal.odp.id, data);
            setEditModal({ open: false, odp: null });
            resetForm();
            setSuccess('ODP berhasil diupdate');
            fetchOdps();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengupdate ODP');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            setSubmitting(true);
            await odpService.delete(deleteModal.odp.id);
            setDeleteModal({ open: false, odp: null });
            setSuccess('ODP berhasil dihapus');
            fetchOdps();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus ODP');
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = (odp) => {
        setFormData({
            nama: odp.nama,
            rasio_spesial: odp.rasio_spesial || '',
            rasio_distribusi: odp.rasio_distribusi,
            foto: null,
        });
        setPreviewImage(odp.foto ? `/storage/${odp.foto}` : null);
        setEditModal({ open: true, odp });
    };

    const filteredOdps = odps.filter(odp => 
        odp.nama.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data ODP..." />
            </div>
        );
    }

    const OdpForm = ({ onSubmit, isEdit = false }) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama ODP *</label>
                <input
                    type="text"
                    name="nama"
                    value={formData.nama}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Contoh: ODP-001"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rasio Distribusi *</label>
                <select
                    name="rasio_distribusi"
                    value={formData.rasio_distribusi}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    <option value="1:2">1:2</option>
                    <option value="1:4">1:4</option>
                    <option value="1:8">1:8</option>
                    <option value="1:16">1:16</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rasio Spesial (opsional)</label>
                <input
                    type="text"
                    name="rasio_spesial"
                    value={formData.rasio_spesial}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Contoh: 1:32"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto ODP</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
                    <div className="space-y-1 text-center">
                        {previewImage ? (
                            <div className="relative">
                                <img src={previewImage} alt="Preview" className="mx-auto h-32 w-auto rounded-lg" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPreviewImage(null);
                                        setFormData(prev => ({ ...prev, foto: null }));
                                    }}
                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                <div className="flex text-sm text-gray-600">
                                    <label className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500">
                                        <span>Upload file</span>
                                        <input
                                            type="file"
                                            name="foto"
                                            accept="image/*"
                                            onChange={handleInputChange}
                                            className="sr-only"
                                        />
                                    </label>
                                    <p className="pl-1">atau drag and drop</p>
                                </div>
                                <p className="text-xs text-gray-500">PNG, JPG hingga 2MB</p>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                        isEdit ? setEditModal({ open: false, odp: null }) : setCreateModal(false);
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
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manajemen ODP</h1>
                    <p className="text-gray-600 mt-1">Kelola Optical Distribution Point</p>
                </div>
                <Button variant="primary" onClick={() => { resetForm(); setCreateModal(true); }}>
                    <Plus size={20} className="mr-2" />
                    Tambah ODP
                </Button>
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
                        placeholder="Cari nama ODP..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                </div>
            </div>

            {/* ODP Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredOdps.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-xl border border-gray-100">
                        <Image className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">Tidak ada ODP</h3>
                        <p className="text-gray-500 mt-1">Mulai dengan menambahkan ODP pertama.</p>
                    </div>
                ) : (
                    filteredOdps.map((odp) => (
                        <div key={odp.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                            {/* Image */}
                            <div className="aspect-video bg-gray-100 relative">
                                {odp.foto ? (
                                    <img 
                                        src={`/storage/${odp.foto}`} 
                                        alt={odp.nama}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Image className="h-12 w-12 text-gray-300" />
                                    </div>
                                )}
                            </div>
                            
                            {/* Content */}
                            <div className="p-4">
                                <h3 className="font-semibold text-gray-900 mb-2">{odp.nama}</h3>
                                <div className="space-y-1 text-sm text-gray-600">
                                    <div className="flex justify-between">
                                        <span>Rasio Distribusi:</span>
                                        <span className="font-medium">{odp.rasio_distribusi}</span>
                                    </div>
                                    {odp.rasio_spesial && (
                                        <div className="flex justify-between">
                                            <span>Rasio Spesial:</span>
                                            <span className="font-medium">{odp.rasio_spesial}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span>Pelanggan:</span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                            <Users size={12} className="mr-1" />
                                            {odp.customers_count || 0}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Actions */}
                                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                                    <Button 
                                        size="sm" 
                                        variant="secondary"
                                        onClick={() => setViewModal({ open: true, odp })}
                                        className="flex-1"
                                    >
                                        <Eye size={14} className="mr-1" /> Detail
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="primary"
                                        onClick={() => openEditModal(odp)}
                                    >
                                        <Edit2 size={14} />
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="danger"
                                        onClick={() => setDeleteModal({ open: true, odp })}
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            <Modal isOpen={createModal} onClose={() => { setCreateModal(false); resetForm(); }} title="Tambah ODP Baru">
                <OdpForm onSubmit={handleCreate} />
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={editModal.open} onClose={() => { setEditModal({ open: false, odp: null }); resetForm(); }} title="Edit ODP">
                <OdpForm onSubmit={handleEdit} isEdit />
            </Modal>

            {/* View Modal */}
            <Modal isOpen={viewModal.open} onClose={() => setViewModal({ open: false, odp: null })} title="Detail ODP" size="lg">
                {viewModal.odp && (
                    <div className="space-y-4">
                        {viewModal.odp.foto && (
                            <img 
                                src={`/storage/${viewModal.odp.foto}`} 
                                alt={viewModal.odp.nama}
                                className="w-full h-64 object-cover rounded-lg"
                            />
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-gray-500">Nama ODP</p>
                                <p className="font-semibold">{viewModal.odp.nama}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Rasio Distribusi</p>
                                <p className="font-semibold">{viewModal.odp.rasio_distribusi}</p>
                            </div>
                            {viewModal.odp.rasio_spesial && (
                                <div>
                                    <p className="text-sm text-gray-500">Rasio Spesial</p>
                                    <p className="font-semibold">{viewModal.odp.rasio_spesial}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm text-gray-500">Jumlah Pelanggan</p>
                                <p className="font-semibold">{viewModal.odp.customers_count || 0} pelanggan</p>
                            </div>
                        </div>
                        
                        {viewModal.odp.customers && viewModal.odp.customers.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-2">Daftar Pelanggan</h4>
                                <div className="max-h-48 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Nama</th>
                                                <th className="px-3 py-2 text-left">PPPoE</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {viewModal.odp.customers.map(customer => (
                                                <tr key={customer.id}>
                                                    <td className="px-3 py-2">{customer.name}</td>
                                                    <td className="px-3 py-2">{customer.pppoe_username}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, odp: null })} title="Hapus ODP">
                <div className="space-y-4">
                    <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                            Apakah Anda yakin ingin menghapus ODP <strong>{deleteModal.odp?.nama}</strong>? 
                            Tindakan ini tidak dapat dibatalkan.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setDeleteModal({ open: false, odp: null })}>
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

export default OdpPage;

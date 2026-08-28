import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, Eye, Users, X, Upload, Image, MapPin } from 'lucide-react';
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
    adminConsoleReadOnlyClassName,
    adminConsoleSelectClassName,
    adminConsoleTextareaClassName,
} from '../../components/common/AdminConsoleUI';
import Modal from '../../components/common/Modal';
import MapPicker from '../../components/common/MapPicker';
import apiClient from '../../services/api';
import odpService from '../../services/odpService';
import masterWilayahService from '../../services/masterWilayahService';

function extractOdpSequence(name, prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedPrefix}-(\\d{3})$`);
    const match = String(name || '').match(regex);
    return match ? Number(match[1]) : null;
}

function buildOdpNamePreview({
    kecamatanId,
    desaId,
    dusunId,
    kecamatanOptions,
    desaOptions,
    dusunOptions,
    odps,
    excludeOdpId = null,
}) {
    const kecamatan = kecamatanOptions.find((item) => Number(item.id) === Number(kecamatanId));
    const desa = desaOptions.find((item) => Number(item.id) === Number(desaId));
    const dusun = dusunOptions.find((item) => Number(item.id) === Number(dusunId));

    if (!kecamatan?.code || !desa?.code || !dusun?.code) {
        return 'Auto: pilih kecamatan, desa, dan dusun';
    }

    const prefix = `${String(kecamatan.code).toUpperCase()}-${String(desa.code).toUpperCase()}-${String(dusun.code).toUpperCase()}`;
    const maxSequence = odps
        .filter((odp) => Number(odp?.desa_id) === Number(desaId) && Number(odp?.dusun_id) === Number(dusunId))
        .filter((odp) => Number(odp?.id) !== Number(excludeOdpId))
        .reduce((max, odp) => {
            const current = extractOdpSequence(odp?.nama, prefix);
            if (current === null) return max;
            return current > max ? current : max;
        }, 0);

    return `${prefix}-${String(maxSequence + 1).padStart(3, '0')}`;
}

// OdpForm component extracted outside to prevent re-creation on every render
const OdpForm = ({
    formData,
    handleInputChange,
    onSubmit,
    isEdit,
    submitting,
    previewImage,
    setPreviewImage,
    setFormData,
    onCancel,
    isModalOpen,
    mapKey,
    kecamatanOptions,
    desaOptions,
    dusunOptions,
    handleKecamatanChange,
    handleDesaChange,
    generatedNamePreview,
}) => (
    <form onSubmit={onSubmit} className="space-y-4">
        <AdminConsoleField label="Nama ODP (Auto)">
            <input
                type="text"
                value={generatedNamePreview}
                readOnly
                className={adminConsoleReadOnlyClassName}
            />
            <p className="mt-1 text-xs text-slate-400">Nama akan dibuat otomatis dari kode kecamatan-desa-dusun + nomor urut.</p>
        </AdminConsoleField>
        <AdminConsoleField label="Rasio Distribusi *">
            <select
                name="rasio_distribusi"
                value={formData.rasio_distribusi}
                onChange={handleInputChange}
                required
                className={adminConsoleSelectClassName}
            >
                <option value="1:2">1:2</option>
                <option value="1:4">1:4</option>
                <option value="1:8">1:8</option>
                <option value="1:16">1:16</option>
            </select>
        </AdminConsoleField>
        <AdminConsoleField label="Rasio Spesial (opsional)">
            <input
                type="text"
                name="rasio_spesial"
                value={formData.rasio_spesial}
                onChange={handleInputChange}
                className={adminConsoleInputClassName}
                placeholder="Contoh: 1:32"
            />
        </AdminConsoleField>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AdminConsoleField label="Kecamatan">
                <select
                    name="kecamatan_id"
                    value={formData.kecamatan_id || ''}
                    onChange={handleKecamatanChange}
                    className={adminConsoleSelectClassName}
                >
                    <option value="">Pilih Kecamatan</option>
                    {kecamatanOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                    ))}
                </select>
            </AdminConsoleField>
            <AdminConsoleField label="Desa *">
                <select
                    name="desa_id"
                    value={formData.desa_id || ''}
                    onChange={handleDesaChange}
                    required
                    disabled={!formData.kecamatan_id}
                    className={adminConsoleSelectClassName}
                >
                    <option value="">Pilih Desa</option>
                    {desaOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                    ))}
                </select>
            </AdminConsoleField>
            <AdminConsoleField label="Dusun *">
                <select
                    name="dusun_id"
                    value={formData.dusun_id || ''}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.desa_id}
                    className={adminConsoleSelectClassName}
                >
                    <option value="">Pilih Dusun</option>
                    {dusunOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                    ))}
                </select>
            </AdminConsoleField>
        </div>
        <AdminConsoleField label="Alamat Detail *">
            <textarea
                name="alamat_detail"
                value={formData.alamat_detail || ''}
                onChange={handleInputChange}
                required
                rows={2}
                className={adminConsoleTextareaClassName}
                placeholder="Patokan lokasi ODP di lapangan"
            />
        </AdminConsoleField>
        
        {/* Map Picker */}
        <MapPicker
            key={mapKey}
            latitude={formData.latitude}
            longitude={formData.longitude}
            onLocationChange={(lat, lng) => {
                setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
            }}
            height="300px"
            isOpen={isModalOpen}
        />
        
        <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">Foto ODP</label>
            <div className="mt-1 flex justify-center rounded-[22px] border-2 border-dashed border-white/10 bg-slate-950/55 px-6 pb-6 pt-5 transition-colors hover:border-cyan-300/30">
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
                            <Upload className="mx-auto h-12 w-12 text-slate-500" />
                            <div className="flex text-sm text-slate-400">
                                <label className="relative cursor-pointer rounded-md font-medium text-cyan-300 hover:text-cyan-200">
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
                            <p className="text-xs text-slate-500">PNG, JPG hingga 2MB</p>
                        </>
                    )}
                </div>
            </div>
        </div>

        <AdminConsoleActionRow>
            <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                className={adminConsoleButtonClassNames.secondary}
            >
                Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} className={adminConsoleButtonClassNames.primary}>
                {submitting ? 'Menyimpan...' : isEdit ? 'Update' : 'Simpan'}
            </Button>
        </AdminConsoleActionRow>
    </form>
);

function OdpPage() {
    const [odps, setOdps] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [managerLoading, setManagerLoading] = useState(false);
    const [managerSubmitting, setManagerSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [managerError, setManagerError] = useState(null);
    const [search, setSearch] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    
    // Modal states
    const [createModal, setCreateModal] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, odp: null });
    const [viewModal, setViewModal] = useState({ open: false, odp: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, odp: null });
    
    // Form states
    const [formData, setFormData] = useState({
        rasio_spesial: '',
        rasio_distribusi: '1:8',
        foto: null,
        latitude: null,
        longitude: null,
        kecamatan_id: '',
        desa_id: '',
        dusun_id: '',
        alamat_detail: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [selectedOdpCustomers, setSelectedOdpCustomers] = useState([]);
    const [kecamatanOptions, setKecamatanOptions] = useState([]);
    const [desaOptions, setDesaOptions] = useState([]);
    const [dusunOptions, setDusunOptions] = useState([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (viewModal.open && viewModal.odp?.id) {
            loadSelectedOdp(viewModal.odp.id);
        }
    }, [viewModal.open, viewModal.odp?.id]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [odpResponse, customerResponse, kecamatanResponse] = await Promise.all([
                odpService.getAll(),
                apiClient.get('/customers?api=1'),
                masterWilayahService.getKecamatans(),
            ]);

            setOdps(odpResponse.data.data || []);
            setCustomers(customerResponse.data.data || []);
            setKecamatanOptions(kecamatanResponse?.data?.data || []);
        } catch (err) {
            setError('Gagal memuat data ODP');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchOdps = async () => {
        try {
            const response = await odpService.getAll();
            setOdps(response.data.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchCustomers = async () => {
        try {
            const response = await apiClient.get('/customers?api=1');
            setCustomers(response.data.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const loadSelectedOdp = async (odpId) => {
        try {
            setManagerLoading(true);
            setManagerError(null);
            const response = await odpService.getById(odpId);
            const odpData = response.data?.data;
            if (odpData) {
                setViewModal({ open: true, odp: odpData });
                setSelectedOdpCustomers(odpData.customers || []);
                setSelectedCustomerId('');
                setCustomerSearch('');
            }
        } catch (err) {
            setManagerError('Gagal memuat pelanggan pada ODP terpilih');
        } finally {
            setManagerLoading(false);
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
            rasio_spesial: '',
            rasio_distribusi: '1:8',
            foto: null,
            latitude: null,
            longitude: null,
            kecamatan_id: '',
            desa_id: '',
            dusun_id: '',
            alamat_detail: '',
        });
        setDesaOptions([]);
        setDusunOptions([]);
        setPreviewImage(null);
    };

    const handleKecamatanChange = async (event) => {
        const value = event.target.value;
        setFormData((prev) => ({ ...prev, kecamatan_id: value, desa_id: '', dusun_id: '' }));
        if (!value) {
            setDesaOptions([]);
            setDusunOptions([]);
            return;
        }

        try {
            const response = await masterWilayahService.getDesas(Number(value));
            setDesaOptions(response?.data?.data || []);
            setDusunOptions([]);
        } catch (err) {
            setError('Gagal memuat desa untuk kecamatan terpilih.');
        }
    };

    const handleDesaChange = async (event) => {
        const value = event.target.value;
        setFormData((prev) => ({ ...prev, desa_id: value, dusun_id: '' }));
        if (!value) {
            setDusunOptions([]);
            return;
        }

        try {
            const response = await masterWilayahService.getDusuns(Number(value));
            setDusunOptions(response?.data?.data || []);
        } catch (err) {
            setError('Gagal memuat dusun untuk desa terpilih.');
        }
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
            fetchInitialData();
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
            fetchInitialData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus ODP');
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = (odp) => {
        setFormData({
            rasio_spesial: odp.rasio_spesial || '',
            rasio_distribusi: odp.rasio_distribusi,
            foto: null,
            latitude: odp.latitude || null,
            longitude: odp.longitude || null,
            kecamatan_id: odp.kecamatan_id || '',
            desa_id: odp.desa_id || '',
            dusun_id: odp.dusun_id || '',
            alamat_detail: odp.alamat_detail || '',
        });
        if (odp.kecamatan_id) {
            masterWilayahService.getDesas(Number(odp.kecamatan_id))
                .then((response) => setDesaOptions(response?.data?.data || []))
                .catch(() => setDesaOptions([]));
        }
        if (odp.desa_id) {
            masterWilayahService.getDusuns(Number(odp.desa_id))
                .then((response) => setDusunOptions(response?.data?.data || []))
                .catch(() => setDusunOptions([]));
        }
        setPreviewImage(odp.foto ? `/storage/${odp.foto}` : null);
        setEditModal({ open: true, odp });
    };

    const createGeneratedNamePreview = useMemo(() => {
        return buildOdpNamePreview({
            kecamatanId: formData.kecamatan_id,
            desaId: formData.desa_id,
            dusunId: formData.dusun_id,
            kecamatanOptions,
            desaOptions,
            dusunOptions,
            odps,
        });
    }, [formData.kecamatan_id, formData.desa_id, formData.dusun_id, kecamatanOptions, desaOptions, dusunOptions, odps]);

    const editGeneratedNamePreview = useMemo(() => {
        if (!editModal.odp) {
            return 'Auto: pilih kecamatan, desa, dan dusun';
        }

        const scopeUnchanged =
            Number(formData.kecamatan_id) === Number(editModal.odp.kecamatan_id) &&
            Number(formData.desa_id) === Number(editModal.odp.desa_id) &&
            Number(formData.dusun_id) === Number(editModal.odp.dusun_id);

        if (scopeUnchanged) {
            return editModal.odp.nama;
        }

        return buildOdpNamePreview({
            kecamatanId: formData.kecamatan_id,
            desaId: formData.desa_id,
            dusunId: formData.dusun_id,
            kecamatanOptions,
            desaOptions,
            dusunOptions,
            odps,
            excludeOdpId: editModal.odp.id,
        });
    }, [
        editModal.odp,
        formData.kecamatan_id,
        formData.desa_id,
        formData.dusun_id,
        kecamatanOptions,
        desaOptions,
        dusunOptions,
        odps,
    ]);

    const closeViewModal = () => {
        setViewModal({ open: false, odp: null });
        setSelectedOdpCustomers([]);
        setSelectedCustomerId('');
        setCustomerSearch('');
        setManagerError(null);
    };

    const handleOpenView = (odp) => {
        setViewModal({ open: true, odp });
    };

    const handleAttachCustomer = async () => {
        if (!viewModal.odp?.id || !selectedCustomerId) {
            return;
        }

        try {
            setManagerSubmitting(true);
            setManagerError(null);
            await apiClient.post(`/odp/${viewModal.odp.id}/customers`, {
                customer_id: selectedCustomerId,
            });
            await Promise.all([loadSelectedOdp(viewModal.odp.id), fetchOdps(), fetchCustomers()]);
            setSuccess('Pelanggan berhasil ditambahkan ke ODP');
        } catch (err) {
            setManagerError(err.response?.data?.message || 'Gagal menambahkan pelanggan ke ODP');
        } finally {
            setManagerSubmitting(false);
        }
    };

    const handleDetachCustomer = async (customerId) => {
        if (!viewModal.odp?.id) {
            return;
        }

        try {
            setManagerSubmitting(true);
            setManagerError(null);
            await apiClient.delete(`/odp/${viewModal.odp.id}/customers`, {
                data: { customer_id: customerId },
            });
            await Promise.all([loadSelectedOdp(viewModal.odp.id), fetchOdps(), fetchCustomers()]);
            setSuccess('Pelanggan berhasil dihapus dari ODP');
        } catch (err) {
            setManagerError(err.response?.data?.message || 'Gagal menghapus pelanggan dari ODP');
        } finally {
            setManagerSubmitting(false);
        }
    };

    const filteredOdps = odps.filter(odp => 
        odp.nama.toLowerCase().includes(search.toLowerCase())
    );

    const selectedOdpAvailableCustomers = customers.filter(customer => {
        const alreadyAttached = selectedOdpCustomers.some(item => item.id === customer.id);
        const customerPppoe = (customer.pppoe_username || '').trim().toLowerCase();
        const query = customerSearch.trim().toLowerCase();
        const matchesSearch = customerPppoe.includes(query);

        return !alreadyAttached && matchesSearch;
    });

    const recommendedCustomers = selectedOdpAvailableCustomers
        .slice()
        .sort((left, right) => (left.name || '').localeCompare(right.name || ''))
        .slice(0, 8);

    const handlePickCustomer = (customerId, customerName) => {
        setSelectedCustomerId(String(customerId));
        setCustomerSearch(customerName || '');
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data ODP..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manajemen ODP</h1>
                    <p className="text-gray-600 mt-1">Kelola Optical Distribution Point</p>
                </div>
                <Button variant="primary" onClick={() => { resetForm(); setCreateModal(true); }} className={adminConsoleButtonClassNames.primary}>
                    <Plus size={20} className="mr-2" />
                    Tambah ODP
                </Button>
            </div>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Search */}
            <AdminConsoleSurface accent="cyan" className="p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input
                        type="text"
                        placeholder="Cari nama ODP..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`${adminConsoleInputClassName} pl-10`}
                    />
                </div>
            </AdminConsoleSurface>

            {/* ODP Cards Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredOdps.length === 0 ? (
                    <AdminConsoleSurface accent="slate" className="col-span-full py-12 text-center">
                        <Image className="mx-auto mb-4 h-12 w-12 text-slate-500" />
                        <h3 className="text-lg font-medium text-white">Tidak ada ODP</h3>
                        <p className="mt-1 text-slate-400">Mulai dengan menambahkan ODP pertama.</p>
                    </AdminConsoleSurface>
                ) : (
                    filteredOdps.map((odp) => (
                        <div key={odp.id} className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.92))] shadow-[0_24px_55px_rgba(2,6,23,0.24)] transition duration-300 hover:-translate-y-1 hover:border-white/15">
                            <div className="aspect-video bg-slate-950/80 relative">
                                {odp.foto ? (
                                    <img 
                                        src={`/storage/${odp.foto}`} 
                                        alt={odp.nama}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Image className="h-12 w-12 text-slate-500" />
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-4">
                                <h3 className="mb-2 font-semibold text-white">{odp.nama}</h3>
                                <div className="space-y-1 text-sm text-slate-300">
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
                                        <span className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-xs font-medium text-cyan-200">
                                            <Users size={12} className="mr-1" />
                                            {odp.customers_count || 0}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
                                    <Button 
                                        size="sm" 
                                        variant="secondary"
                                        onClick={() => handleOpenView(odp)}
                                        className={`flex-1 ${adminConsoleButtonClassNames.secondary}`}
                                    >
                                        <Eye size={14} className="mr-1" /> Detail
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="primary"
                                        onClick={() => openEditModal(odp)}
                                        className={adminConsoleButtonClassNames.primary}
                                    >
                                        <Edit2 size={14} />
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="danger"
                                        onClick={() => setDeleteModal({ open: true, odp })}
                                        className={adminConsoleButtonClassNames.danger}
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
            <Modal isOpen={createModal} onClose={() => { setCreateModal(false); resetForm(); }} title="Tambah ODP Baru" theme="dashboard">
                <OdpForm 
                    formData={formData}
                    handleInputChange={handleInputChange}
                    onSubmit={handleCreate}
                    isEdit={false}
                    submitting={submitting}
                    previewImage={previewImage}
                    setPreviewImage={setPreviewImage}
                    setFormData={setFormData}
                    onCancel={() => { setCreateModal(false); resetForm(); }}
                    isModalOpen={createModal}
                    mapKey="create"
                    kecamatanOptions={kecamatanOptions}
                    desaOptions={desaOptions}
                    dusunOptions={dusunOptions}
                    handleKecamatanChange={handleKecamatanChange}
                    handleDesaChange={handleDesaChange}
                    generatedNamePreview={createGeneratedNamePreview}
                />
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={editModal.open} onClose={() => { setEditModal({ open: false, odp: null }); resetForm(); }} title="Edit ODP" theme="dashboard">
                <OdpForm 
                    formData={formData}
                    handleInputChange={handleInputChange}
                    onSubmit={handleEdit}
                    isEdit={true}
                    submitting={submitting}
                    previewImage={previewImage}
                    setPreviewImage={setPreviewImage}
                    setFormData={setFormData}
                    onCancel={() => { setEditModal({ open: false, odp: null }); resetForm(); }}
                    isModalOpen={editModal.open}
                    mapKey={editModal.odp?.id ? `edit-${editModal.odp.id}` : 'edit'}
                    kecamatanOptions={kecamatanOptions}
                    desaOptions={desaOptions}
                    dusunOptions={dusunOptions}
                    handleKecamatanChange={handleKecamatanChange}
                    handleDesaChange={handleDesaChange}
                    generatedNamePreview={editGeneratedNamePreview}
                />
            </Modal>

            {/* View Modal */}
            <Modal isOpen={viewModal.open} onClose={closeViewModal} title="Detail ODP" size="lg" theme="dashboard">
                {viewModal.odp && (
                    <div className="space-y-4">
                        {viewModal.odp.foto && (
                            <AdminConsoleSurface className="p-2" accent="cyan">
                                <img
                                    src={`/storage/${viewModal.odp.foto}`}
                                    alt={viewModal.odp.nama}
                                    className="h-64 w-full rounded-lg object-cover"
                                />
                            </AdminConsoleSurface>
                        )}

                        <AdminConsoleSurface className="grid grid-cols-2 gap-4 p-4" accent="violet">
                            <div>
                                <p className="text-sm text-slate-400">Nama ODP</p>
                                <p className="font-semibold text-white">{viewModal.odp.nama}</p>
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Rasio Distribusi</p>
                                <p className="font-semibold text-white">{viewModal.odp.rasio_distribusi}</p>
                            </div>
                            {viewModal.odp.rasio_spesial && (
                                <div>
                                    <p className="text-sm text-slate-400">Rasio Spesial</p>
                                    <p className="font-semibold text-white">{viewModal.odp.rasio_spesial}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm text-slate-400">Jumlah Pelanggan</p>
                                <p className="font-semibold text-white">{viewModal.odp.customers_count || 0} pelanggan</p>
                            </div>
                            {viewModal.odp.latitude && viewModal.odp.longitude && (
                                <>
                                    <div>
                                        <p className="text-sm text-slate-400">Latitude</p>
                                        <p className="font-semibold text-white">{viewModal.odp.latitude}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-400">Longitude</p>
                                        <p className="font-semibold text-white">{viewModal.odp.longitude}</p>
                                    </div>
                                </>
                            )}
                        </AdminConsoleSurface>

                        <AdminConsoleSurface className="p-4" accent="amber">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h4 className="font-semibold text-white">Kelola Pelanggan ODP</h4>
                                    <p className="text-sm text-slate-400">Pelanggan yang ditambahkan di sini otomatis tersimpan sebagai data pelanggan ODP.</p>
                                </div>
                                {managerLoading && <span className="text-xs text-slate-400">Memuat data...</span>}
                            </div>

                            {managerError && (
                                <AdminConsoleNotice tone="danger" className="mt-3">
                                    {managerError}
                                </AdminConsoleNotice>
                            )}

                            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-200">Tambah pelanggan ke ODP</label>
                                    <input
                                        type="text"
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        className={`mb-2 ${adminConsoleInputClassName}`}
                                        placeholder="Cari PPPoE pelanggan"
                                    />
                                    <select
                                        value={selectedCustomerId}
                                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                                        className={adminConsoleSelectClassName}
                                    >
                                        <option value="">Pilih pelanggan</option>
                                        {selectedOdpAvailableCustomers.map((customer) => (
                                            <option key={customer.id} value={customer.id}>
                                                {customer.name}{customer.pppoe_username ? ` - ${customer.pppoe_username}` : ''}{customer.phone ? ` - ${customer.phone}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-2 max-h-44 overflow-y-auto rounded-[20px] border border-white/10 bg-slate-950/60">
                                        {customerSearch.trim() === '' ? (
                                            <div className="p-3 text-xs text-slate-400">Ketik PPPoE pelanggan untuk melihat rekomendasi.</div>
                                        ) : recommendedCustomers.length === 0 ? (
                                            <div className="p-3 text-xs text-slate-400">Tidak ada pelanggan yang cocok dengan PPPoE ini.</div>
                                        ) : (
                                            recommendedCustomers.map((customer) => (
                                                <button
                                                    key={customer.id}
                                                    type="button"
                                                    onClick={() => handlePickCustomer(customer.id, customer.name)}
                                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-white/5"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-white">{customer.pppoe_username || '-'}</span>
                                                        <span className="text-xs text-slate-400">{customer.name}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-400">Pilih</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleAttachCustomer}
                                        disabled={managerSubmitting || !selectedCustomerId}
                                        className={`w-full md:w-auto ${adminConsoleButtonClassNames.primary}`}
                                    >
                                        {managerSubmitting ? 'Menyimpan...' : 'Tambah'}
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <h4 className="font-semibold text-white">Pelanggan Terhubung</h4>
                                <div className="mt-2 max-h-64 overflow-y-auto rounded-[20px] border border-white/10 bg-slate-950/60">
                                    {selectedOdpCustomers.length === 0 ? (
                                        <div className="p-4 text-sm text-slate-400">Belum ada pelanggan pada ODP ini.</div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="bg-white/[0.03] text-slate-400">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Nama</th>
                                                    <th className="px-3 py-2 text-left">PPPoE</th>
                                                    <th className="px-3 py-2 text-right">Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/10 text-slate-100">
                                                {selectedOdpCustomers.map((customer) => (
                                                    <tr key={customer.id}>
                                                        <td className="px-3 py-2">{customer.name}</td>
                                                        <td className="px-3 py-2">{customer.pppoe_username || '-'}</td>
                                                        <td className="px-3 py-2 text-right">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="danger"
                                                                onClick={() => handleDetachCustomer(customer.id)}
                                                                disabled={managerSubmitting}
                                                                className={adminConsoleButtonClassNames.danger}
                                                            >
                                                                Hapus
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </AdminConsoleSurface>

                        {viewModal.odp.latitude && viewModal.odp.longitude && (
                            <div>
                                <p className="mb-2 flex items-center text-sm font-medium text-slate-200">
                                    <MapPin className="mr-1 h-4 w-4" />
                                    Lokasi ODP
                                </p>
                                <MapPicker
                                    latitude={parseFloat(viewModal.odp.latitude)}
                                    longitude={parseFloat(viewModal.odp.longitude)}
                                    height="250px"
                                />
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, odp: null })} title="Hapus ODP" theme="dashboard">
                <div className="space-y-4">
                    <AdminConsoleNotice tone="danger" title="Konfirmasi">
                        <p>
                            Apakah Anda yakin ingin menghapus ODP <strong>{deleteModal.odp?.nama}</strong>? 
                            Tindakan ini tidak dapat dibatalkan.
                        </p>
                    </AdminConsoleNotice>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button variant="secondary" onClick={() => setDeleteModal({ open: false, odp: null })} className={adminConsoleButtonClassNames.secondary}>
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

export default OdpPage;

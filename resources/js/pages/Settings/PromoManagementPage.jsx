import { useEffect, useState } from 'react';
import { 
    Plus, Edit2, Trash2, Image, Eye, EyeOff, 
    Save, X, Upload, Settings, Package, Megaphone,
    GripVertical, Check
} from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import apiClient from '../../services/api';

function PromoManagementPage() {
    const [activeTab, setActiveTab] = useState('promotions'); // promotions, packages, settings
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Promotions
    const [promotions, setPromotions] = useState([]);
    const [editingPromo, setEditingPromo] = useState(null);
    const [promoForm, setPromoForm] = useState({
        title: '',
        description: '',
        image: null,
        is_active: true,
        start_date: '',
        end_date: '',
    });
    const [promoPreview, setPromoPreview] = useState(null);

    // Packages
    const [packages, setPackages] = useState([]);
    const [editingPackage, setEditingPackage] = useState(null);
    const [packageForm, setPackageForm] = useState({
        name: '',
        speed: '',
        price: '',
        device_count: '',
        is_popular: false,
        is_active: true,
    });

    // Settings
    const [settings, setSettings] = useState({});
    const [savingSettings, setSavingSettings] = useState(false);

    // Helper function untuk mendapatkan path gambar yang benar
    const getImageSrc = (imagePath) => {
        if (!imagePath) return null;
        // Jika path sudah dimulai dengan / (seperti /brosur/), gunakan langsung
        if (imagePath.startsWith('/')) return imagePath;
        // Jika tidak, asumsikan path dari storage
        return `/storage/${imagePath}`;
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [promoRes, packageRes, settingsRes] = await Promise.all([
                apiClient.get('/promotions'),
                apiClient.get('/packages'),
                apiClient.get('/site-settings'),
            ]);
            setPromotions(promoRes.data.data || promoRes.data || []);
            setPackages(packageRes.data.data || packageRes.data || []);
            setSettings(settingsRes.data.data || settingsRes.data || {});
        } catch (err) {
            setError('Gagal memuat data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // ============ PROMOTIONS ============
    const handlePromoChange = (e) => {
        const { name, value, type, checked, files } = e.target;
        if (type === 'file' && files[0]) {
            setPromoForm(prev => ({ ...prev, [name]: files[0] }));
            // Preview
            const reader = new FileReader();
            reader.onloadend = () => setPromoPreview(reader.result);
            reader.readAsDataURL(files[0]);
        } else {
            setPromoForm(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            }));
        }
    };

    const handlePromoSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        
        const formData = new FormData();
        Object.keys(promoForm).forEach(key => {
            if (promoForm[key] !== null && promoForm[key] !== '') {
                if (key === 'is_active') {
                    formData.append(key, promoForm[key] ? '1' : '0');
                } else {
                    formData.append(key, promoForm[key]);
                }
            }
        });

        try {
            if (editingPromo) {
                formData.append('_method', 'PUT');
                await apiClient.post(`/promotions/${editingPromo.id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                setSuccess('Promo berhasil diperbarui');
            } else {
                await apiClient.post('/promotions', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                setSuccess('Promo berhasil ditambahkan');
            }
            resetPromoForm();
            fetchData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan promo');
        }
    };

    const handleEditPromo = (promo) => {
        setEditingPromo(promo);
        setPromoForm({
            title: promo.title || '',
            description: promo.description || '',
            image: null,
            is_active: promo.is_active,
            start_date: promo.start_date || '',
            end_date: promo.end_date || '',
        });
        setPromoPreview(getImageSrc(promo.image));
    };

    const handleDeletePromo = async (id) => {
        if (!confirm('Hapus promo ini?')) return;
        try {
            await apiClient.delete(`/promotions/${id}`);
            setSuccess('Promo berhasil dihapus');
            fetchData();
        } catch (err) {
            setError('Gagal menghapus promo');
        }
    };

    const handleTogglePromo = async (promo) => {
        try {
            await apiClient.patch(`/promotions/${promo.id}/toggle`);
            fetchData();
        } catch (err) {
            setError('Gagal mengubah status promo');
        }
    };

    const resetPromoForm = () => {
        setEditingPromo(null);
        setPromoForm({
            title: '',
            description: '',
            image: null,
            is_active: true,
            start_date: '',
            end_date: '',
        });
        setPromoPreview(null);
    };

    // ============ PACKAGES ============
    const handlePackageChange = (e) => {
        const { name, value, type, checked } = e.target;
        setPackageForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handlePackageSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        
        try {
            if (editingPackage) {
                await apiClient.post(`/packages/${editingPackage.id}`, packageForm);
                setSuccess('Paket berhasil diperbarui');
            } else {
                await apiClient.post('/packages', packageForm);
                setSuccess('Paket berhasil ditambahkan');
            }
            resetPackageForm();
            fetchData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan paket');
        }
    };

    const handleEditPackage = (pkg) => {
        setEditingPackage(pkg);
        setPackageForm({
            name: pkg.name || '',
            speed: pkg.speed || '',
            price: pkg.price || '',
            device_count: pkg.device_count || '',
            is_popular: pkg.is_popular || false,
            is_active: pkg.is_active ?? true,
        });
    };

    const handleDeletePackage = async (id) => {
        if (!confirm('Hapus paket ini?')) return;
        try {
            await apiClient.delete(`/packages/${id}`);
            setSuccess('Paket berhasil dihapus');
            fetchData();
        } catch (err) {
            setError('Gagal menghapus paket');
        }
    };

    const resetPackageForm = () => {
        setEditingPackage(null);
        setPackageForm({
            name: '',
            speed: '',
            price: '',
            device_count: '',
            is_popular: false,
            is_active: true,
        });
    };

    // ============ SETTINGS ============
    const handleSettingsChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSettingsSubmit = async (e) => {
        e.preventDefault();
        setSavingSettings(true);
        try {
            await apiClient.post('/site-settings', settings);
            setSuccess('Pengaturan berhasil disimpan');
        } catch (err) {
            setError('Gagal menyimpan pengaturan');
        } finally {
            setSavingSettings(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <LoadingSpinner text="Memuat data..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Kelola Landing Page</h1>
                    <p className="text-gray-600 mt-1">Atur promo, paket, dan pengaturan halaman depan</p>
                </div>
                <a 
                    href="/" 
                    target="_blank"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                    <Eye size={18} />
                    Lihat Halaman
                </a>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="border-b border-gray-200 overflow-x-auto">
                    <nav className="flex -mb-px min-w-max">
                        <button
                            onClick={() => setActiveTab('promotions')}
                            className={`flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b-2 font-medium text-xs sm:text-sm transition whitespace-nowrap ${
                                activeTab === 'promotions'
                                    ? 'border-orange-500 text-orange-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Megaphone size={18} />
                            <span className="hidden sm:inline">Promo & Brosur</span>
                            <span className="sm:hidden">Promo</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('packages')}
                            className={`flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b-2 font-medium text-xs sm:text-sm transition whitespace-nowrap ${
                                activeTab === 'packages'
                                    ? 'border-orange-500 text-orange-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Package size={18} />
                            <span className="hidden sm:inline">Paket Internet</span>
                            <span className="sm:hidden">Paket</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b-2 font-medium text-xs sm:text-sm transition whitespace-nowrap ${
                                activeTab === 'settings'
                                    ? 'border-orange-500 text-orange-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Settings size={18} />
                            <span>Pengaturan</span>
                        </button>
                    </nav>
                </div>

                <div className="p-4 sm:p-6">
                    {/* PROMOTIONS TAB */}
                    {activeTab === 'promotions' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Form */}
                            <div className="bg-gray-50 rounded-xl p-4 sm:p-6 order-2 lg:order-1">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    {editingPromo ? 'Edit Promo' : 'Tambah Promo Baru'}
                                </h3>
                                <form onSubmit={handlePromoSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Judul Promo *
                                        </label>
                                        <input
                                            type="text"
                                            name="title"
                                            value={promoForm.title}
                                            onChange={handlePromoChange}
                                            required
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            placeholder="Contoh: Promo Akhir Tahun"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Deskripsi
                                        </label>
                                        <textarea
                                            name="description"
                                            value={promoForm.description}
                                            onChange={handlePromoChange}
                                            rows={3}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Gambar/Brosur
                                        </label>
                                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-orange-500 transition cursor-pointer">
                                            <input
                                                type="file"
                                                name="image"
                                                accept="image/*"
                                                onChange={handlePromoChange}
                                                className="hidden"
                                                id="promo-image"
                                            />
                                            <label htmlFor="promo-image" className="cursor-pointer">
                                                {promoPreview ? (
                                                    <img src={promoPreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                                                ) : (
                                                    <>
                                                        <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                                                        <p className="text-sm text-gray-500">Klik untuk upload gambar</p>
                                                    </>
                                                )}
                                            </label>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Tanggal Mulai
                                            </label>
                                            <input
                                                type="date"
                                                name="start_date"
                                                value={promoForm.start_date}
                                                onChange={handlePromoChange}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Tanggal Berakhir
                                            </label>
                                            <input
                                                type="date"
                                                name="end_date"
                                                value={promoForm.end_date}
                                                onChange={handlePromoChange}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                    </div>

                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            name="is_active"
                                            checked={promoForm.is_active}
                                            onChange={handlePromoChange}
                                            className="w-4 h-4 text-orange-500 rounded"
                                        />
                                        <span className="text-sm text-gray-700">Aktif</span>
                                    </label>

                                    <div className="flex gap-2">
                                        <Button type="submit" className="flex-1">
                                            <Save size={18} className="mr-2" />
                                            {editingPromo ? 'Update' : 'Simpan'}
                                        </Button>
                                        {editingPromo && (
                                            <Button type="button" variant="secondary" onClick={resetPromoForm}>
                                                <X size={18} />
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </div>

                            {/* List */}
                            <div className="order-1 lg:order-2">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Daftar Promo</h3>
                                {promotions.length > 0 ? (
                                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                                        {promotions.map((promo) => (
                                            <div key={promo.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
                                                {promo.image ? (
                                                    <img 
                                                        src={getImageSrc(promo.image)} 
                                                        alt={promo.title}
                                                        className="w-full sm:w-24 h-32 sm:h-24 object-cover rounded-lg flex-shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-full sm:w-24 h-32 sm:h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                        <Image size={32} className="text-gray-400" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <h4 className="font-medium text-gray-900">{promo.title}</h4>
                                                            <p className="text-sm text-gray-500 truncate">{promo.description}</p>
                                                        </div>
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                            promo.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {promo.is_active ? 'Aktif' : 'Nonaktif'}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2 mt-3">
                                                        <button
                                                            onClick={() => handleTogglePromo(promo)}
                                                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                                                            title={promo.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                                        >
                                                            {promo.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditPromo(promo)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeletePromo(promo.id)}
                                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 bg-gray-50 rounded-xl">
                                        <Megaphone size={48} className="mx-auto text-gray-300 mb-4" />
                                        <p className="text-gray-500">Belum ada promo</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* PACKAGES TAB */}
                    {activeTab === 'packages' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Form */}
                            <div className="bg-gray-50 rounded-xl p-4 sm:p-6 order-2 lg:order-1">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    {editingPackage ? 'Edit Paket' : 'Tambah Paket Baru'}
                                </h3>
                                <form onSubmit={handlePackageSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Nama Paket *
                                        </label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={packageForm.name}
                                            onChange={handlePackageChange}
                                            required
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            placeholder="Contoh: Bronze, Gold, Platinum"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Kecepatan *
                                        </label>
                                        <input
                                            type="text"
                                            name="speed"
                                            value={packageForm.speed}
                                            onChange={handlePackageChange}
                                            required
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            placeholder="Contoh: 10Mbps"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Harga/Bulan (Rp) *
                                        </label>
                                        <input
                                            type="number"
                                            name="price"
                                            value={packageForm.price}
                                            onChange={handlePackageChange}
                                            required
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            placeholder="175000"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Jumlah Perangkat
                                        </label>
                                        <input
                                            type="text"
                                            name="device_count"
                                            value={packageForm.device_count}
                                            onChange={handlePackageChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                            placeholder="Contoh: 2-3 Perangkat"
                                        />
                                    </div>

                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                name="is_popular"
                                                checked={packageForm.is_popular}
                                                onChange={handlePackageChange}
                                                className="w-4 h-4 text-orange-500 rounded"
                                            />
                                            <span className="text-sm text-gray-700">Paling Populer</span>
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                name="is_active"
                                                checked={packageForm.is_active}
                                                onChange={handlePackageChange}
                                                className="w-4 h-4 text-orange-500 rounded"
                                            />
                                            <span className="text-sm text-gray-700">Aktif</span>
                                        </label>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button type="submit" className="flex-1">
                                            <Save size={18} className="mr-2" />
                                            {editingPackage ? 'Update' : 'Simpan'}
                                        </Button>
                                        {editingPackage && (
                                            <Button type="button" variant="secondary" onClick={resetPackageForm}>
                                                <X size={18} />
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </div>

                            {/* List */}
                            <div className="order-1 lg:order-2">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Daftar Paket</h3>
                                {packages.length > 0 ? (
                                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                                        {packages.map((pkg) => (
                                            <div key={pkg.id} className={`bg-white border rounded-xl p-4 ${pkg.is_popular ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-200'}`}>
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-semibold text-gray-900">Paket {pkg.name}</h4>
                                                            {pkg.is_popular && (
                                                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                                                                    Populer
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-2xl font-bold text-orange-500 mt-1">{pkg.speed}</p>
                                                        <p className="text-gray-600">Rp {new Intl.NumberFormat('id-ID').format(pkg.price)}/bulan</p>
                                                        <p className="text-sm text-gray-500">{pkg.device_count}</p>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                            pkg.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {pkg.is_active ? 'Aktif' : 'Nonaktif'}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => handleEditPackage(pkg)}
                                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeletePackage(pkg.id)}
                                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 bg-gray-50 rounded-xl">
                                        <Package size={48} className="mx-auto text-gray-300 mb-4" />
                                        <p className="text-gray-500">Belum ada paket</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* SETTINGS TAB */}
                    {activeTab === 'settings' && (
                        <form onSubmit={handleSettingsSubmit} className="max-w-2xl mx-auto space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nama Perusahaan
                                    </label>
                                    <input
                                        type="text"
                                        name="company_name"
                                        value={settings.company_name || ''}
                                        onChange={handleSettingsChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tagline
                                    </label>
                                    <input
                                        type="text"
                                        name="company_tagline"
                                        value={settings.company_tagline || ''}
                                        onChange={handleSettingsChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nomor Telepon
                                    </label>
                                    <input
                                        type="text"
                                        name="company_phone"
                                        value={settings.company_phone || ''}
                                        onChange={handleSettingsChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nomor WhatsApp
                                    </label>
                                    <input
                                        type="text"
                                        name="company_whatsapp"
                                        value={settings.company_whatsapp || ''}
                                        onChange={handleSettingsChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    name="company_email"
                                    value={settings.company_email || ''}
                                    onChange={handleSettingsChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <hr />

                            <h4 className="font-semibold text-gray-900">Pengaturan Hero Section</h4>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Judul Hero
                                </label>
                                <input
                                    type="text"
                                    name="hero_title"
                                    value={settings.hero_title || ''}
                                    onChange={handleSettingsChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Sub Judul Hero
                                </label>
                                <input
                                    type="text"
                                    name="hero_subtitle"
                                    value={settings.hero_subtitle || ''}
                                    onChange={handleSettingsChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <hr />

                            <h4 className="font-semibold text-gray-900">Pengaturan Promo</h4>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Biaya Pemasangan Normal (Rp)
                                    </label>
                                    <input
                                        type="number"
                                        name="installation_fee"
                                        value={settings.installation_fee || ''}
                                        onChange={handleSettingsChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Teks Promo Utama
                                    </label>
                                    <input
                                        type="text"
                                        name="promo_text"
                                        value={settings.promo_text || ''}
                                        onChange={handleSettingsChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                        placeholder="Contoh: GRATIS BIAYA PEMASANGAN"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Periode Promo
                                </label>
                                <input
                                    type="text"
                                    name="promo_period"
                                    value={settings.promo_period || ''}
                                    onChange={handleSettingsChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="Contoh: Berlaku hingga 31 Desember 2025"
                                />
                            </div>

                            <Button type="submit" disabled={savingSettings}>
                                {savingSettings ? (
                                    <>
                                        <span className="animate-spin mr-2">⏳</span>
                                        Menyimpan...
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} className="mr-2" />
                                        Simpan Pengaturan
                                    </>
                                )}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PromoManagementPage;

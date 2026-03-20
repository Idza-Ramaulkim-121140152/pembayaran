import { useState, useEffect, useCallback } from 'react';
import {
    Package, Plus, Edit2, Trash2, Save, X, Wifi, RefreshCw,
    Check, AlertCircle, ChevronDown, ChevronUp, Star, Eye, EyeOff,
    Zap, Server
} from 'lucide-react';

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

const defaultForm = {
    name: '',
    speed: '',
    mikrotik_profile: '',
    price: '',
    device_count: '',
    features: [],
    description: '',
    is_popular: false,
    is_active: true,
    sort_order: 0,
};

function PackageManagementPage() {
    const [packages, setPackages] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [profilesLoading, setProfilesLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ ...defaultForm });
    const [featureInput, setFeatureInput] = useState('');
    const [alert, setAlert] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken(),
    };

    const showAlert = (message, type = 'success') => {
        setAlert({ message, type });
        setTimeout(() => setAlert(null), 4000);
    };

    const fetchPackages = useCallback(async () => {
        try {
            const res = await fetch('/api/packages', { headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() } });
            const data = await res.json();
            setPackages(data.data || []);
        } catch (err) {
            console.error('Failed to fetch packages', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchProfiles = async () => {
        setProfilesLoading(true);
        try {
            const res = await fetch('/api/mikrotik/profiles', { headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() } });
            const data = await res.json();
            if (data.data) {
                setProfiles(data.data);
            }
            if (data.error) {
                showAlert(data.error, 'error');
            }
        } catch (err) {
            showAlert('Gagal mengambil profil MikroTik', 'error');
        } finally {
            setProfilesLoading(false);
        }
    };

    useEffect(() => {
        fetchPackages();
        fetchProfiles();
    }, [fetchPackages]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const addFeature = () => {
        if (!featureInput.trim()) return;
        setForm(prev => ({ ...prev, features: [...(prev.features || []), featureInput.trim()] }));
        setFeatureInput('');
    };

    const removeFeature = (index) => {
        setForm(prev => ({
            ...prev,
            features: prev.features.filter((_, i) => i !== index),
        }));
    };

    const openAddForm = () => {
        setForm({ ...defaultForm });
        setEditingId(null);
        setShowForm(true);
        setFeatureInput('');
    };

    const openEditForm = (pkg) => {
        setForm({
            name: pkg.name || '',
            speed: pkg.speed || '',
            mikrotik_profile: pkg.mikrotik_profile || '',
            price: pkg.price || '',
            device_count: pkg.device_count || '',
            features: pkg.features || [],
            description: pkg.description || '',
            is_popular: pkg.is_popular || false,
            is_active: pkg.is_active ?? true,
            sort_order: pkg.sort_order || 0,
        });
        setEditingId(pkg.id);
        setShowForm(true);
        setFeatureInput('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name || !form.speed || !form.price) {
            showAlert('Nama, kecepatan, dan harga wajib diisi', 'error');
            return;
        }

        setSaving(true);
        try {
            const url = editingId ? `/api/packages/${editingId}` : '/api/packages';
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers,
                body: JSON.stringify({
                    ...form,
                    price: parseFloat(form.price) || 0,
                    sort_order: parseInt(form.sort_order) || 0,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                showAlert(data.message || 'Berhasil disimpan');
                setShowForm(false);
                fetchPackages();
            } else {
                showAlert(data.message || 'Gagal menyimpan', 'error');
            }
        } catch (err) {
            showAlert('Gagal menyimpan paket', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`/api/packages/${id}`, {
                method: 'DELETE',
                headers,
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(data.message || 'Paket berhasil dihapus');
                fetchPackages();
            } else {
                showAlert(data.message || 'Gagal menghapus', 'error');
            }
        } catch (err) {
            showAlert('Gagal menghapus paket', 'error');
        }
        setDeleteConfirm(null);
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-500">Memuat data paket...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Alert */}
            {alert && (
                <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center gap-2 ${
                    alert.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
                }`}>
                    {alert.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
                    <span className="text-sm">{alert.message}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Paket Layanan</h1>
                    <p className="text-gray-600">Kelola paket layanan internet dan profil MikroTik</p>
                </div>
                <button
                    onClick={openAddForm}
                    className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition"
                >
                    <Plus size={18} />
                    Tambah Paket
                </button>
            </div>

            {/* Package List */}
            <div className="grid gap-4">
                {packages.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                        <Package className="mx-auto mb-3 text-gray-300" size={48} />
                        <p className="text-gray-500">Belum ada paket layanan. Tambahkan paket pertama Anda.</p>
                    </div>
                ) : (
                    packages.map(pkg => (
                        <div key={pkg.id} className={`bg-white rounded-xl shadow-sm border p-5 transition ${!pkg.is_active ? 'opacity-60' : ''}`}>
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-gray-900 text-lg">{pkg.name}</h3>
                                        {pkg.is_popular && (
                                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1">
                                                <Star size={12} /> Populer
                                            </span>
                                        )}
                                        {!pkg.is_active && (
                                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium flex items-center gap-1">
                                                <EyeOff size={12} /> Nonaktif
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
                                        <span className="flex items-center gap-1">
                                            <Zap size={14} className="text-orange-500" />
                                            {pkg.speed}
                                        </span>
                                        <span className="font-semibold text-orange-600 text-base">{formatPrice(pkg.price)}</span>
                                        {pkg.mikrotik_profile && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                                                <Server size={12} />
                                                Profile: {pkg.mikrotik_profile}
                                            </span>
                                        )}
                                        {pkg.device_count && (
                                            <span className="text-gray-500">{pkg.device_count} perangkat</span>
                                        )}
                                    </div>
                                    {pkg.description && (
                                        <p className="text-sm text-gray-500 mb-2">{pkg.description}</p>
                                    )}
                                    {pkg.features && pkg.features.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {pkg.features.map((f, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{f}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 ml-4">
                                    <button
                                        onClick={() => openEditForm(pkg)}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                        title="Edit"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(pkg.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                        title="Hapus"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)}></div>
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    {editingId ? 'Edit Paket' : 'Tambah Paket Baru'}
                                </h3>
                                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Name */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nama Paket <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={form.name}
                                        onChange={handleChange}
                                        placeholder="contoh: Paket 200k, Bronze, Gold"
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    />
                                </div>

                                {/* Speed + Price */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Kecepatan <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="speed"
                                            value={form.speed}
                                            onChange={handleChange}
                                            placeholder="contoh: 20Mbps"
                                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Harga (Rp) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            name="price"
                                            value={form.price}
                                            onChange={handleChange}
                                            placeholder="200000"
                                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* MikroTik Profile */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Profil MikroTik
                                    </label>
                                    <div className="flex gap-2">
                                        <select
                                            name="mikrotik_profile"
                                            value={form.mikrotik_profile}
                                            onChange={handleChange}
                                            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        >
                                            <option value="">-- Pilih Profil --</option>
                                            {profiles.map(p => (
                                                <option key={p.name} value={p.name}>
                                                    {p.name} {p.rate_limit ? `(${p.rate_limit})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={fetchProfiles}
                                            disabled={profilesLoading}
                                            className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg border transition"
                                            title="Refresh profil dari MikroTik"
                                        >
                                            <RefreshCw size={18} className={profilesLoading ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Profil PPPoE di router MikroTik yang akan digunakan untuk paket ini.
                                        Nama paket dan profil boleh berbeda.
                                    </p>
                                </div>

                                {/* Device Count */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Perangkat</label>
                                    <input
                                        type="text"
                                        name="device_count"
                                        value={form.device_count}
                                        onChange={handleChange}
                                        placeholder="contoh: 3-5"
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                                    <textarea
                                        name="description"
                                        value={form.description}
                                        onChange={handleChange}
                                        placeholder="Deskripsi singkat paket..."
                                        rows={2}
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>

                                {/* Features */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fitur</label>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={featureInput}
                                            onChange={(e) => setFeatureInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
                                            placeholder="Tambah fitur, tekan Enter"
                                            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={addFeature}
                                            className="px-3 py-2 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 text-sm"
                                        >
                                            Tambah
                                        </button>
                                    </div>
                                    {form.features && form.features.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {form.features.map((f, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                                                    {f}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFeature(i)}
                                                        className="text-gray-400 hover:text-red-500"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Options */}
                                <div className="flex items-center gap-6 pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="is_active"
                                            checked={form.is_active}
                                            onChange={handleChange}
                                            className="text-orange-500 focus:ring-orange-500 rounded"
                                        />
                                        <span className="text-sm text-gray-700">Aktif</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="is_popular"
                                            checked={form.is_popular}
                                            onChange={handleChange}
                                            className="text-orange-500 focus:ring-orange-500 rounded"
                                        />
                                        <span className="text-sm text-gray-700">Populer</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm text-gray-700">Urutan:</label>
                                        <input
                                            type="number"
                                            name="sort_order"
                                            value={form.sort_order}
                                            onChange={handleChange}
                                            className="w-16 border rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 pt-4 border-t">
                                    <button
                                        type="button"
                                        onClick={() => setShowForm(false)}
                                        className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="flex-1 px-4 py-2.5 text-white bg-orange-500 hover:bg-orange-600 rounded-xl font-medium transition flex items-center justify-center gap-2"
                                    >
                                        {saving ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <Save size={16} />
                                        )}
                                        {editingId ? 'Simpan Perubahan' : 'Tambah Paket'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)}></div>
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 mb-4">
                                <Trash2 className="h-7 w-7 text-red-600" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Hapus Paket?</h3>
                                <p className="text-gray-600 text-sm">Paket yang dihapus tidak dapat dikembalikan. Pelanggan yang sudah menggunakan paket ini tidak akan terpengaruh.</p>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={() => handleDelete(deleteConfirm)}
                                    className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-xl font-medium transition"
                                >
                                    Ya, Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PackageManagementPage;

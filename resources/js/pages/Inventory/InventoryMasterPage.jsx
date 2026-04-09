import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, RefreshCw, Trash2, Tags, Package } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import inventoryService from '../../services/inventoryService';

const DEFAULT_TYPE_FORM = {
    name: '',
    description: '',
};

const DEFAULT_ITEM_FORM = {
    inventory_item_type_id: '',
    name: '',
    unit: 'pcs',
    default_length: '',
    length_unit: '',
    is_active: true,
};

const DEFAULT_PRICING_FORM = {
    installation_labor_fee_default: '0',
    installation_cable_rate_default: '0',
};

const normalizeErrorMessage = (err, fallback) => {
    if (err?.response?.data?.errors) {
        const firstError = Object.values(err.response.data.errors)[0];
        if (Array.isArray(firstError) && firstError[0]) return firstError[0];
    }
    return err?.response?.data?.message || fallback;
};

const formatNumber = (value) => {
    const numeric = Number(value || 0);
    if (Number.isNaN(numeric)) return '0';
    return numeric % 1 === 0 ? numeric.toLocaleString('id-ID') : numeric.toLocaleString('id-ID', { maximumFractionDigits: 2 });
};

function InventoryMasterPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [types, setTypes] = useState([]);
    const [items, setItems] = useState([]);

    const [typeModal, setTypeModal] = useState({ open: false, editItem: null });
    const [itemModal, setItemModal] = useState({ open: false, editItem: null });
    const [typeForm, setTypeForm] = useState(DEFAULT_TYPE_FORM);
    const [itemForm, setItemForm] = useState(DEFAULT_ITEM_FORM);
    const [pricingForm, setPricingForm] = useState(DEFAULT_PRICING_FORM);
    const [savingPricing, setSavingPricing] = useState(false);

    const loadData = useCallback(async (showLoading = false) => {
        if (showLoading) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            const [typesRes, itemsRes, pricingRes] = await Promise.all([
                inventoryService.getTypes(),
                inventoryService.getItems(),
                inventoryService.getDefaultPricing(),
            ]);

            setTypes(typesRes.data?.data || []);
            setItems(itemsRes.data?.data || []);

            const pricing = pricingRes.data?.data || {};
            setPricingForm({
                installation_labor_fee_default: String(pricing.installation_labor_fee_default ?? 0),
                installation_cable_rate_default: String(pricing.installation_cable_rate_default ?? 0),
            });
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal memuat master data inventori'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData(true);
    }, [loadData]);

    const openCreateType = () => {
        setTypeForm(DEFAULT_TYPE_FORM);
        setTypeModal({ open: true, editItem: null });
    };

    const openEditType = (type) => {
        setTypeForm({
            name: type.name || '',
            description: type.description || '',
        });
        setTypeModal({ open: true, editItem: type });
    };

    const submitType = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        try {
            setSaving(true);
            if (typeModal.editItem) {
                await inventoryService.updateType(typeModal.editItem.id, typeForm);
                setSuccess('Jenis barang berhasil diperbarui.');
            } else {
                await inventoryService.createType(typeForm);
                setSuccess('Jenis barang berhasil ditambahkan.');
            }
            setTypeModal({ open: false, editItem: null });
            setTypeForm(DEFAULT_TYPE_FORM);
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menyimpan jenis barang'));
        } finally {
            setSaving(false);
        }
    };

    const removeType = async (type) => {
        if (!window.confirm(`Hapus jenis barang ${type.name}?`)) return;

        try {
            setSaving(true);
            await inventoryService.deleteType(type.id);
            setSuccess('Jenis barang berhasil dihapus.');
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menghapus jenis barang'));
        } finally {
            setSaving(false);
        }
    };

    const openCreateItem = () => {
        setItemForm(DEFAULT_ITEM_FORM);
        setItemModal({ open: true, editItem: null });
    };

    const openEditItem = (item) => {
        setItemForm({
            inventory_item_type_id: item.inventory_item_type_id || '',
            name: item.name || '',
            unit: item.unit || 'pcs',
            default_length: item.default_length || '',
            length_unit: item.length_unit || '',
            is_active: !!item.is_active,
        });
        setItemModal({ open: true, editItem: item });
    };

    const submitItem = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const payload = {
            inventory_item_type_id: Number(itemForm.inventory_item_type_id),
            name: itemForm.name,
            unit: itemForm.unit,
            default_length: itemForm.default_length === '' ? null : Number(itemForm.default_length),
            length_unit: itemForm.length_unit || null,
            is_active: !!itemForm.is_active,
        };

        try {
            setSaving(true);
            if (itemModal.editItem) {
                await inventoryService.updateItem(itemModal.editItem.id, payload);
                setSuccess('Barang inventori berhasil diperbarui.');
            } else {
                await inventoryService.createItem(payload);
                setSuccess('Barang inventori berhasil ditambahkan.');
            }

            setItemModal({ open: false, editItem: null });
            setItemForm(DEFAULT_ITEM_FORM);
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menyimpan master barang'));
        } finally {
            setSaving(false);
        }
    };

    const removeItem = async (item) => {
        if (!window.confirm(`Hapus barang ${item.name}?`)) return;

        try {
            setSaving(true);
            await inventoryService.deleteItem(item.id);
            setSuccess('Barang inventori berhasil dihapus.');
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menghapus barang inventori'));
        } finally {
            setSaving(false);
        }
    };

    const submitDefaultPricing = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const payload = {
            installation_labor_fee_default: pricingForm.installation_labor_fee_default === ''
                ? 0
                : Number(pricingForm.installation_labor_fee_default),
            installation_cable_rate_default: pricingForm.installation_cable_rate_default === ''
                ? 0
                : Number(pricingForm.installation_cable_rate_default),
        };

        if (Number.isNaN(payload.installation_labor_fee_default) || Number.isNaN(payload.installation_cable_rate_default)) {
            setError('Default biaya payroll harus berupa angka yang valid.');
            return;
        }

        try {
            setSavingPricing(true);
            const response = await inventoryService.updateDefaultPricing(payload);
            const savedPricing = response.data?.data || payload;

            setPricingForm({
                installation_labor_fee_default: String(savedPricing.installation_labor_fee_default ?? 0),
                installation_cable_rate_default: String(savedPricing.installation_cable_rate_default ?? 0),
            });
            setSuccess('Default biaya payroll pemasangan berhasil diperbarui.');
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menyimpan default biaya payroll pemasangan'));
        } finally {
            setSavingPricing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner text="Memuat master data inventori..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Master Data Inventori</h1>
                    <p className="text-gray-500 mt-1">Khusus superadmin: kelola jenis barang dan master barang inventori</p>
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => loadData(false)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </Button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-800">Default Payroll Pemasangan</h2>
                    <p className="text-sm text-gray-500 mt-1">Nilai awal untuk form verifikasi pelanggan. Tetap bisa diubah saat input per pelanggan.</p>
                </div>
                <form onSubmit={submitDefaultPricing} className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Biaya Pasang (Payroll) - Default</label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={pricingForm.installation_labor_fee_default}
                                onChange={(e) => setPricingForm((prev) => ({ ...prev, installation_labor_fee_default: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="0"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Harga Kabel (Payroll) - Default</label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={pricingForm.installation_cable_rate_default}
                                onChange={(e) => setPricingForm((prev) => ({ ...prev, installation_cable_rate_default: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="0"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" variant="primary" disabled={savingPricing}>
                            {savingPricing ? 'Menyimpan...' : 'Simpan Default'}
                        </Button>
                    </div>
                </form>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 inline-flex items-center gap-2">
                        <Tags size={18} /> Jenis Barang
                    </h2>
                    <Button type="button" variant="primary" size="sm" onClick={openCreateType} className="inline-flex items-center gap-2">
                        <Plus size={14} /> Tambah Jenis
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-3 py-2 text-left">Nama Jenis</th>
                                <th className="px-3 py-2 text-left">Deskripsi</th>
                                <th className="px-3 py-2 text-right">Jumlah Barang</th>
                                <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {types.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-3 py-8 text-center text-gray-500">Belum ada jenis barang.</td>
                                </tr>
                            )}
                            {types.map((type) => (
                                <tr key={type.id}>
                                    <td className="px-3 py-2 font-medium text-gray-800">{type.name}</td>
                                    <td className="px-3 py-2 text-gray-600">{type.description || '-'}</td>
                                    <td className="px-3 py-2 text-right">{formatNumber(type.items_count)}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="secondary" size="sm" onClick={() => openEditType(type)}>
                                                <Edit2 size={14} />
                                            </Button>
                                            <Button type="button" variant="danger" size="sm" onClick={() => removeType(type)} disabled={saving}>
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 inline-flex items-center gap-2">
                        <Package size={18} /> Master Barang
                    </h2>
                    <Button type="button" variant="primary" size="sm" onClick={openCreateItem} className="inline-flex items-center gap-2">
                        <Plus size={14} /> Tambah Barang
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-3 py-2 text-left">Nama Barang</th>
                                <th className="px-3 py-2 text-left">Jenis</th>
                                <th className="px-3 py-2 text-left">Satuan</th>
                                <th className="px-3 py-2 text-left">Panjang Default</th>
                                <th className="px-3 py-2 text-right">Stok</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="px-3 py-8 text-center text-gray-500">Belum ada master barang inventori.</td>
                                </tr>
                            )}
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-3 py-2 font-medium text-gray-800">{item.name}</td>
                                    <td className="px-3 py-2 text-gray-700">{item.type?.name || '-'}</td>
                                    <td className="px-3 py-2 text-gray-700">{item.unit}</td>
                                    <td className="px-3 py-2 text-gray-700">
                                        {item.default_length ? `${formatNumber(item.default_length)} ${item.length_unit || ''}` : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatNumber(item.current_stock)}</td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}
                                        >
                                            {item.is_active ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="secondary" size="sm" onClick={() => openEditItem(item)}>
                                                <Edit2 size={14} />
                                            </Button>
                                            <Button type="button" variant="danger" size="sm" onClick={() => removeItem(item)} disabled={saving}>
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={typeModal.open}
                onClose={() => setTypeModal({ open: false, editItem: null })}
                title={typeModal.editItem ? 'Edit Jenis Barang' : 'Tambah Jenis Barang'}
                size="md"
            >
                <form onSubmit={submitType} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Nama Jenis</label>
                        <input
                            type="text"
                            value={typeForm.name}
                            onChange={(e) => setTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Deskripsi</label>
                        <textarea
                            value={typeForm.description}
                            onChange={(e) => setTypeForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            rows={3}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setTypeModal({ open: false, editItem: null })}>Batal</Button>
                        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={itemModal.open}
                onClose={() => setItemModal({ open: false, editItem: null })}
                title={itemModal.editItem ? 'Edit Barang Inventori' : 'Tambah Barang Inventori'}
                size="lg"
            >
                <form onSubmit={submitItem} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Jenis Barang</label>
                            <select
                                value={itemForm.inventory_item_type_id}
                                onChange={(e) => setItemForm((prev) => ({ ...prev, inventory_item_type_id: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            >
                                <option value="">Pilih jenis</option>
                                {types.map((type) => (
                                    <option key={type.id} value={type.id}>{type.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Nama Barang</label>
                            <input
                                type="text"
                                value={itemForm.name}
                                onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Satuan</label>
                            <input
                                type="text"
                                value={itemForm.unit}
                                onChange={(e) => setItemForm((prev) => ({ ...prev, unit: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Panjang Default (opsional)</label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={itemForm.default_length}
                                onChange={(e) => setItemForm((prev) => ({ ...prev, default_length: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Satuan Panjang (opsional)</label>
                            <input
                                type="text"
                                value={itemForm.length_unit}
                                onChange={(e) => setItemForm((prev) => ({ ...prev, length_unit: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="M"
                            />
                        </div>
                        <div className="flex items-end">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={itemForm.is_active}
                                    onChange={(e) => setItemForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                />
                                Barang aktif
                            </label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setItemModal({ open: false, editItem: null })}>Batal</Button>
                        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default InventoryMasterPage;

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowDownCircle,
    ArrowUpCircle,
    History,
    Plus,
    RefreshCw,
    Pencil,
    Trash2,
    Wallet,
    Package,
    AlertCircle,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import inventoryService from '../../services/inventoryService';

const TAB_ITEMS = [
    { key: 'incoming', label: 'Pemasukan', icon: ArrowDownCircle },
    { key: 'outgoing', label: 'Pengeluaran', icon: ArrowUpCircle },
    { key: 'debts', label: 'Hutang Barang', icon: Wallet },
    { key: 'history', label: 'Histori', icon: History },
];

const today = new Date().toISOString().split('T')[0];

const defaultIncomingItem = { inventory_item_id: '', quantity: '', unit_price: '' };
const defaultOutgoingItem = { inventory_item_id: '', quantity: '' };

const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
};

const formatNumber = (value) => {
    const numeric = Number(value || 0);
    if (Number.isNaN(numeric)) return '0';
    return numeric % 1 === 0 ? numeric.toLocaleString('id-ID') : numeric.toLocaleString('id-ID', { maximumFractionDigits: 2 });
};

const normalizeErrorMessage = (err, fallback) => {
    if (err?.response?.data?.errors) {
        const firstError = Object.values(err.response.data.errors)[0];
        if (Array.isArray(firstError) && firstError[0]) return firstError[0];
    }
    return err?.response?.data?.message || fallback;
};

function InventoryPage() {
    const [activeTab, setActiveTab] = useState('incoming');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [stockItems, setStockItems] = useState([]);
    const [itemOptions, setItemOptions] = useState([]);
    const [movementRows, setMovementRows] = useState([]);
    const [debtRows, setDebtRows] = useState([]);
    const [debtSummary, setDebtSummary] = useState({
        known_outstanding: 0,
        unknown_outstanding_count: 0,
        unpaid_count: 0,
        partial_count: 0,
        paid_count: 0,
    });

    const [movementFilter, setMovementFilter] = useState({
        movement_type: '',
        source: '',
        start_date: '',
        end_date: '',
    });

    const [incomingForm, setIncomingForm] = useState({
        transaction_date: today,
        payment_type: 'cash',
        due_date: '',
        notes: '',
        items: [{ ...defaultIncomingItem }],
    });

    const [outgoingForm, setOutgoingForm] = useState({
        transaction_date: today,
        notes: '',
        items: [{ ...defaultOutgoingItem }],
    });

    const [payDebtModal, setPayDebtModal] = useState({ open: false, debt: null });
    const [payDebtForm, setPayDebtForm] = useState({
        amount: '',
        payment_date: today,
        notes: '',
        mark_as_paid: false,
    });

    const [bulkPaymentForm, setBulkPaymentForm] = useState({
        total_amount: '',
        payment_date: today,
        notes: '',
    });
    const [selectedDebtIds, setSelectedDebtIds] = useState([]);
    const [editMovementModal, setEditMovementModal] = useState({ open: false, movement: null });
    const [editMovementForm, setEditMovementForm] = useState({
        inventory_item_id: '',
        movement_type: 'in',
        quantity: '',
        unit_price: '',
        transaction_date: today,
        notes: '',
    });

    const loadData = useCallback(
        async (showLoading = false) => {
            if (showLoading) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }

            try {
                const [summaryRes, optionsRes, movementsRes, debtsRes] = await Promise.all([
                    inventoryService.getSummary(),
                    inventoryService.getItemOptions(),
                    inventoryService.getMovements({ per_page: 100, ...movementFilter }),
                    inventoryService.getDebts({ per_page: 100 }),
                ]);

                setStockItems(summaryRes.data?.items || []);
                setItemOptions(optionsRes.data?.data || []);
                setMovementRows(movementsRes.data?.data?.data || []);
                setDebtRows(debtsRes.data?.data?.data || []);
                setDebtSummary(
                    debtsRes.data?.summary || {
                        known_outstanding: 0,
                        unknown_outstanding_count: 0,
                        unpaid_count: 0,
                        partial_count: 0,
                        paid_count: 0,
                    }
                );
            } catch (err) {
                setError(normalizeErrorMessage(err, 'Gagal memuat data inventori'));
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [movementFilter]
    );

    useEffect(() => {
        loadData(true);
    }, [loadData]);

    const totalStockItem = stockItems.length;
    const stockTrackedUnits = useMemo(() => {
        return stockItems.reduce((sum, item) => sum + Number(item.current_stock || 0), 0);
    }, [stockItems]);

    const resolveItemLabel = (itemId) => {
        const found = itemOptions.find((option) => String(option.id) === String(itemId));
        if (!found) return 'Barang tidak ditemukan';

        return `${found.name} (${found.type_name || 'Tanpa jenis'}) - stok ${formatNumber(found.current_stock)} ${found.unit}`;
    };

    const resetIncomingForm = () => {
        setIncomingForm({
            transaction_date: today,
            payment_type: 'cash',
            due_date: '',
            notes: '',
            items: [{ ...defaultIncomingItem }],
        });
    };

    const resetOutgoingForm = () => {
        setOutgoingForm({
            transaction_date: today,
            notes: '',
            items: [{ ...defaultOutgoingItem }],
        });
    };

    const addIncomingRow = () => {
        setIncomingForm((prev) => ({
            ...prev,
            items: [...prev.items, { ...defaultIncomingItem }],
        }));
    };

    const removeIncomingRow = (index) => {
        setIncomingForm((prev) => {
            const rows = prev.items.filter((_, idx) => idx !== index);
            return {
                ...prev,
                items: rows.length > 0 ? rows : [{ ...defaultIncomingItem }],
            };
        });
    };

    const updateIncomingRow = (index, field, value) => {
        setIncomingForm((prev) => {
            const rows = [...prev.items];
            rows[index] = {
                ...rows[index],
                [field]: value,
            };
            return { ...prev, items: rows };
        });
    };

    const addOutgoingRow = () => {
        setOutgoingForm((prev) => ({
            ...prev,
            items: [...prev.items, { ...defaultOutgoingItem }],
        }));
    };

    const removeOutgoingRow = (index) => {
        setOutgoingForm((prev) => {
            const rows = prev.items.filter((_, idx) => idx !== index);
            return {
                ...prev,
                items: rows.length > 0 ? rows : [{ ...defaultOutgoingItem }],
            };
        });
    };

    const updateOutgoingRow = (index, field, value) => {
        setOutgoingForm((prev) => {
            const rows = [...prev.items];
            rows[index] = {
                ...rows[index],
                [field]: value,
            };
            return { ...prev, items: rows };
        });
    };

    const submitIncoming = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const cleanedItems = incomingForm.items
            .map((item) => ({
                inventory_item_id: Number(item.inventory_item_id),
                quantity: Number(item.quantity),
                unit_price: item.unit_price === '' ? null : Number(item.unit_price),
            }))
            .filter((item) => item.inventory_item_id > 0 && item.quantity > 0);

        if (cleanedItems.length === 0) {
            setError('Isi minimal 1 baris barang untuk pemasukan inventori.');
            return;
        }

        if (incomingForm.payment_type === 'cash' && cleanedItems.some((item) => item.unit_price === null || Number.isNaN(item.unit_price))) {
            setError('Harga satuan wajib diisi untuk pembelian tunai.');
            return;
        }

        try {
            setSaving(true);
            await inventoryService.storeIncoming({
                transaction_date: incomingForm.transaction_date,
                payment_type: incomingForm.payment_type,
                due_date: incomingForm.payment_type === 'debt' && incomingForm.due_date ? incomingForm.due_date : null,
                notes: incomingForm.notes || null,
                items: cleanedItems,
            });
            setSuccess('Pemasukan inventori berhasil dicatat.');
            resetIncomingForm();
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal mencatat pemasukan inventori'));
        } finally {
            setSaving(false);
        }
    };

    const submitOutgoing = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const cleanedItems = outgoingForm.items
            .map((item) => ({
                inventory_item_id: Number(item.inventory_item_id),
                quantity: Number(item.quantity),
            }))
            .filter((item) => item.inventory_item_id > 0 && item.quantity > 0);

        if (cleanedItems.length === 0) {
            setError('Isi minimal 1 baris barang untuk pengeluaran inventori.');
            return;
        }

        try {
            setSaving(true);
            await inventoryService.storeOutgoing({
                transaction_date: outgoingForm.transaction_date,
                notes: outgoingForm.notes || null,
                items: cleanedItems,
            });
            setSuccess('Pengeluaran inventori berhasil dicatat.');
            resetOutgoingForm();
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal mencatat pengeluaran inventori'));
        } finally {
            setSaving(false);
        }
    };

    const openEditMovementModal = (movement) => {
        setEditMovementModal({ open: true, movement });
        setEditMovementForm({
            inventory_item_id: String(movement.inventory_item_id || ''),
            movement_type: movement.movement_type || 'in',
            quantity: String(movement.quantity ?? ''),
            unit_price: movement.unit_price === null || movement.unit_price === undefined ? '' : String(movement.unit_price),
            transaction_date: movement.transaction_date || today,
            notes: movement.notes || '',
        });
    };

    const submitEditMovement = async (event) => {
        event.preventDefault();
        if (!editMovementModal.movement) return;

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            await inventoryService.updateMovement(editMovementModal.movement.id, {
                inventory_item_id: Number(editMovementForm.inventory_item_id),
                movement_type: editMovementForm.movement_type,
                quantity: Number(editMovementForm.quantity),
                unit_price: editMovementForm.unit_price === '' ? null : Number(editMovementForm.unit_price),
                transaction_date: editMovementForm.transaction_date,
                notes: editMovementForm.notes || null,
            });

            setEditMovementModal({ open: false, movement: null });
            setSuccess('Histori inventori berhasil diperbarui.');
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal memperbarui histori inventori'));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteMovement = async (movement) => {
        if (!window.confirm('Yakin ingin menghapus histori inventori ini?')) return;

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            await inventoryService.deleteMovement(movement.id);
            setSuccess('Histori inventori berhasil dihapus.');
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menghapus histori inventori'));
        } finally {
            setSaving(false);
        }
    };

    const openPayDebtModal = (debt) => {
        setPayDebtModal({ open: true, debt });
        setPayDebtForm({
            amount: debt.remaining_amount === null ? '' : String(debt.remaining_amount),
            payment_date: today,
            notes: '',
            mark_as_paid: debt.remaining_amount === null,
        });
    };

    const submitSingleDebtPayment = async (e) => {
        e.preventDefault();
        if (!payDebtModal.debt) return;

        try {
            setSaving(true);
            await inventoryService.payDebt(payDebtModal.debt.id, {
                amount: Number(payDebtForm.amount),
                payment_date: payDebtForm.payment_date,
                notes: payDebtForm.notes || null,
                mark_as_paid: !!payDebtForm.mark_as_paid,
            });

            setSuccess('Pembayaran hutang berhasil dicatat.');
            setPayDebtModal({ open: false, debt: null });
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal memproses pembayaran hutang'));
        } finally {
            setSaving(false);
        }
    };

    const toggleDebtSelection = (debtId) => {
        setSelectedDebtIds((prev) => {
            if (prev.includes(debtId)) {
                return prev.filter((id) => id !== debtId);
            }
            return [...prev, debtId];
        });
    };

    const submitBulkDebtPayment = async (e) => {
        e.preventDefault();

        if (selectedDebtIds.length === 0) {
            setError('Pilih minimal 1 hutang barang untuk pembayaran total.');
            return;
        }

        if (!bulkPaymentForm.total_amount || Number(bulkPaymentForm.total_amount) <= 0) {
            setError('Isi nominal pembayaran total terlebih dahulu.');
            return;
        }

        try {
            setSaving(true);
            await inventoryService.payDebtBulk({
                debt_ids: selectedDebtIds,
                total_amount: Number(bulkPaymentForm.total_amount),
                payment_date: bulkPaymentForm.payment_date,
                notes: bulkPaymentForm.notes || null,
            });

            setSuccess('Pembayaran hutang total berhasil diproses.');
            setSelectedDebtIds([]);
            setBulkPaymentForm({
                total_amount: '',
                payment_date: today,
                notes: '',
            });
            await loadData(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal memproses pembayaran hutang total'));
        } finally {
            setSaving(false);
        }
    };

    const incomingCashTotal = incomingForm.items.reduce((sum, item) => {
        const qty = Number(item.quantity || 0);
        const unitPrice = Number(item.unit_price || 0);
        return sum + qty * unitPrice;
    }, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner text="Memuat inventori..." />
            </div>
        );
    }

    return (
        <div className="space-y-6 min-w-0">
            <div className="app-section-header flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Inventori</h1>
                    <p className="text-gray-500 mt-1">Kelola stok, pemasukan, pengeluaran barang, hutang inventori, dan histori</p>
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => loadData(false)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                </Button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="app-card p-5">
                    <p className="text-sm text-gray-500">Total Master Barang</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalStockItem)}</p>
                </div>
                <div className="app-card p-5">
                    <p className="text-sm text-gray-500">Akumulasi Stok (semua unit)</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(stockTrackedUnits)}</p>
                </div>
                <div className="app-card p-5">
                    <p className="text-sm text-gray-500">Outstanding Hutang Diketahui</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(debtSummary.known_outstanding)}</p>
                </div>
            </div>

            <div className="app-card overflow-hidden">
                <div className="border-b border-gray-100 px-4 py-3 flex flex-wrap gap-2">
                    {TAB_ITEMS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                    isActive
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 md:p-6">
                    {activeTab === 'incoming' && (
                        <form onSubmit={submitIncoming} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                                    <input
                                        type="date"
                                        value={incomingForm.transaction_date}
                                        onChange={(e) => setIncomingForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Pembelian</label>
                                    <select
                                        value={incomingForm.payment_type}
                                        onChange={(e) => setIncomingForm((prev) => ({ ...prev, payment_type: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="cash">Tunai</option>
                                        <option value="debt">Hutang</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Jatuh Tempo Hutang</label>
                                    <input
                                        type="date"
                                        value={incomingForm.due_date}
                                        onChange={(e) => setIncomingForm((prev) => ({ ...prev, due_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        disabled={incomingForm.payment_type !== 'debt'}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                                    <input
                                        type="text"
                                        value={incomingForm.notes}
                                        onChange={(e) => setIncomingForm((prev) => ({ ...prev, notes: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        placeholder="Keterangan pemasukan"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                {incomingForm.items.map((row, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border border-gray-100 rounded-lg p-3">
                                        <div className="md:col-span-6">
                                            <label className="block text-xs text-gray-500 mb-1">Barang</label>
                                            <select
                                                value={row.inventory_item_id}
                                                onChange={(e) => updateIncomingRow(index, 'inventory_item_id', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            >
                                                <option value="">Pilih barang</option>
                                                {itemOptions.map((option) => (
                                                    <option key={option.id} value={option.id}>{resolveItemLabel(option.id)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-gray-500 mb-1">Qty</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={row.quantity}
                                                onChange={(e) => updateIncomingRow(index, 'quantity', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs text-gray-500 mb-1">Harga Satuan</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={row.unit_price}
                                                onChange={(e) => updateIncomingRow(index, 'unit_price', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                placeholder={incomingForm.payment_type === 'cash' ? 'Wajib' : 'Opsional'}
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <Button
                                                type="button"
                                                variant="danger"
                                                size="sm"
                                                onClick={() => removeIncomingRow(index)}
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Button type="button" variant="secondary" onClick={addIncomingRow} className="w-full sm:w-auto inline-flex items-center justify-center gap-2">
                                    <Plus size={14} /> Tambah Baris
                                </Button>

                                <div className="text-sm text-gray-600 min-w-0 flex-1 break-words sm:text-right">
                                    {incomingForm.payment_type === 'cash' ? (
                                        <span>Total Tunai: <strong>{formatCurrency(incomingCashTotal)}</strong></span>
                                    ) : (
                                        <span>Pembelian hutang: nominal boleh dikosongkan dan dibayar belakangan.</span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2 sm:justify-end">
                                <Button type="button" variant="secondary" onClick={resetIncomingForm} className="w-full sm:w-auto">Reset</Button>
                                <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">{saving ? 'Menyimpan...' : 'Simpan Pemasukan'}</Button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'outgoing' && (
                        <form onSubmit={submitOutgoing} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                                    <input
                                        type="date"
                                        value={outgoingForm.transaction_date}
                                        onChange={(e) => setOutgoingForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        required
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                                    <input
                                        type="text"
                                        value={outgoingForm.notes}
                                        onChange={(e) => setOutgoingForm((prev) => ({ ...prev, notes: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        placeholder="Keterangan pengeluaran barang"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                {outgoingForm.items.map((row, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border border-gray-100 rounded-lg p-3">
                                        <div className="md:col-span-8">
                                            <label className="block text-xs text-gray-500 mb-1">Barang</label>
                                            <select
                                                value={row.inventory_item_id}
                                                onChange={(e) => updateOutgoingRow(index, 'inventory_item_id', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            >
                                                <option value="">Pilih barang</option>
                                                {itemOptions.map((option) => (
                                                    <option key={option.id} value={option.id}>{resolveItemLabel(option.id)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs text-gray-500 mb-1">Qty Keluar</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={row.quantity}
                                                onChange={(e) => updateOutgoingRow(index, 'quantity', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <Button type="button" variant="danger" size="sm" onClick={() => removeOutgoingRow(index)}>
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Button type="button" variant="secondary" onClick={addOutgoingRow} className="w-full sm:w-auto inline-flex items-center justify-center gap-2">
                                    <Plus size={14} /> Tambah Baris
                                </Button>
                                <p className="text-sm text-gray-500 min-w-0 flex-1 break-words sm:text-right">Pengeluaran inventori manual akan tercatat di histori dengan penanggung jawab.</p>
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2 sm:justify-end">
                                <Button type="button" variant="secondary" onClick={resetOutgoingForm} className="w-full sm:w-auto">Reset</Button>
                                <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">{saving ? 'Menyimpan...' : 'Simpan Pengeluaran'}</Button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'debts' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                                    <p className="text-xs text-red-700">Outstanding Diketahui</p>
                                    <p className="text-lg font-bold text-red-700 mt-1">{formatCurrency(debtSummary.known_outstanding)}</p>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4">
                                    <p className="text-xs text-yellow-700">Belum Dibayar</p>
                                    <p className="text-lg font-bold text-yellow-700 mt-1">{formatNumber(debtSummary.unpaid_count)}</p>
                                </div>
                                <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                                    <p className="text-xs text-orange-700">Sebagian Dibayar</p>
                                    <p className="text-lg font-bold text-orange-700 mt-1">{formatNumber(debtSummary.partial_count)}</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                    <p className="text-xs text-blue-700">Nominal Belum Ditetapkan</p>
                                    <p className="text-lg font-bold text-blue-700 mt-1">{formatNumber(debtSummary.unknown_outstanding_count)}</p>
                                </div>
                            </div>

                            <form onSubmit={submitBulkDebtPayment} className="border border-gray-100 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-2 text-gray-800 font-semibold">
                                    <Wallet size={18} /> Pembayaran Total (Keseluruhan)
                                </div>
                                <p className="text-sm text-gray-500">Pilih beberapa hutang lalu masukkan satu nominal total. Sistem akan mengalokasikan pembayaran otomatis.</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Nominal Total</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={bulkPaymentForm.total_amount}
                                            onChange={(e) => setBulkPaymentForm((prev) => ({ ...prev, total_amount: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Tanggal Bayar</label>
                                        <input
                                            type="date"
                                            value={bulkPaymentForm.payment_date}
                                            onChange={(e) => setBulkPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Catatan</label>
                                        <input
                                            type="text"
                                            value={bulkPaymentForm.notes}
                                            onChange={(e) => setBulkPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            placeholder="Catatan pembayaran"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button type="submit" variant="primary" disabled={saving || selectedDebtIds.length === 0}>
                                        {saving ? 'Memproses...' : `Bayar Total (${selectedDebtIds.length} item)`}
                                    </Button>
                                </div>
                            </form>

                            <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Pilih</th>
                                            <th className="px-3 py-2 text-left">Barang</th>
                                            <th className="px-3 py-2 text-right">Qty</th>
                                            <th className="px-3 py-2 text-right">Total Hutang</th>
                                            <th className="px-3 py-2 text-right">Terbayar</th>
                                            <th className="px-3 py-2 text-right">Sisa</th>
                                            <th className="px-3 py-2 text-left">Status</th>
                                            <th className="px-3 py-2 text-left">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {debtRows.length === 0 && (
                                            <tr>
                                                <td colSpan="8" className="px-3 py-8 text-center text-gray-500">Belum ada data hutang barang.</td>
                                            </tr>
                                        )}
                                        {debtRows.map((debt) => {
                                            const isSelectable = debt.status !== 'paid';
                                            return (
                                                <tr key={debt.id}>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedDebtIds.includes(debt.id)}
                                                            onChange={() => toggleDebtSelection(debt.id)}
                                                            disabled={!isSelectable}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <p className="font-medium text-gray-800">{debt.item?.name || '-'}</p>
                                                        <p className="text-xs text-gray-500">{debt.item?.type?.name || 'Tanpa jenis'}</p>
                                                    </td>
                                                    <td className="px-3 py-2 text-right">{formatNumber(debt.quantity)}</td>
                                                    <td className="px-3 py-2 text-right">{debt.original_amount === null ? '-' : formatCurrency(debt.original_amount)}</td>
                                                    <td className="px-3 py-2 text-right">{formatCurrency(debt.paid_amount)}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        {debt.remaining_amount === null ? 'Belum ditetapkan' : formatCurrency(debt.remaining_amount)}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span
                                                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                                debt.status === 'paid'
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : debt.status === 'partial'
                                                                        ? 'bg-orange-100 text-orange-700'
                                                                        : 'bg-red-100 text-red-700'
                                                            }`}
                                                        >
                                                            {debt.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => openPayDebtModal(debt)}
                                                        >
                                                            Bayar
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Jenis</label>
                                    <select
                                        value={movementFilter.movement_type}
                                        onChange={(e) => setMovementFilter((prev) => ({ ...prev, movement_type: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="">Semua</option>
                                        <option value="in">Masuk</option>
                                        <option value="out">Keluar</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Sumber</label>
                                    <input
                                        type="text"
                                        value={movementFilter.source}
                                        onChange={(e) => setMovementFilter((prev) => ({ ...prev, source: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        placeholder="manual_out / installation / dll"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Dari Tanggal</label>
                                    <input
                                        type="date"
                                        value={movementFilter.start_date}
                                        onChange={(e) => setMovementFilter((prev) => ({ ...prev, start_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Sampai Tanggal</label>
                                    <input
                                        type="date"
                                        value={movementFilter.end_date}
                                        onChange={(e) => setMovementFilter((prev) => ({ ...prev, end_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <Button type="button" variant="primary" onClick={() => loadData(false)} className="w-full">
                                        Terapkan Filter
                                    </Button>
                                </div>
                            </div>

                            <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Tanggal</th>
                                            <th className="px-3 py-2 text-left">Barang</th>
                                            <th className="px-3 py-2 text-left">Jenis</th>
                                            <th className="px-3 py-2 text-left">Sumber</th>
                                            <th className="px-3 py-2 text-right">Qty</th>
                                            <th className="px-3 py-2 text-right">Nilai</th>
                                            <th className="px-3 py-2 text-left">Penanggung Jawab</th>
                                            <th className="px-3 py-2 text-left">Catatan</th>
                                            <th className="px-3 py-2 text-left">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {movementRows.length === 0 && (
                                            <tr>
                                                <td colSpan="9" className="px-3 py-8 text-center text-gray-500">Belum ada histori inventori.</td>
                                            </tr>
                                        )}
                                        {movementRows.map((row) => (
                                            <tr key={row.id}>
                                                <td className="px-3 py-2">{row.transaction_date}</td>
                                                <td className="px-3 py-2">
                                                    <p className="font-medium text-gray-800">{row.item?.name || '-'}</p>
                                                    <p className="text-xs text-gray-500">{row.item?.type?.name || '-'}</p>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                            row.movement_type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                        }`}
                                                    >
                                                        {row.movement_type === 'in' ? 'Masuk' : 'Keluar'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{row.source}</td>
                                                <td className="px-3 py-2 text-right">{formatNumber(row.quantity)} {row.item?.unit || ''}</td>
                                                <td className="px-3 py-2 text-right">{row.total_amount === null ? '-' : formatCurrency(row.total_amount)}</td>
                                                <td className="px-3 py-2">{row.creator?.name || 'Sistem'}</td>
                                                <td className="px-3 py-2 max-w-xs">
                                                    <p className="truncate" title={row.notes || ''}>{row.notes || '-'}</p>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => openEditMovementModal(row)}
                                                        >
                                                            <Pencil size={14} />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="danger"
                                                            onClick={() => handleDeleteMovement(row)}
                                                        >
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
                    )}
                </div>
            </div>

            <div className="app-card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 text-gray-800 font-semibold">
                    <Package size={18} /> Stok Saat Ini
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-3 py-2 text-left">Barang</th>
                                <th className="px-3 py-2 text-left">Jenis</th>
                                <th className="px-3 py-2 text-left">Satuan</th>
                                <th className="px-3 py-2 text-right">Stok</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {stockItems.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-3 py-8 text-center text-gray-500">Belum ada master barang inventori.</td>
                                </tr>
                            )}
                            {stockItems.map((item) => {
                                const isLow = Number(item.current_stock || 0) <= 0;
                                return (
                                    <tr key={item.id}>
                                        <td className="px-3 py-2">
                                            <p className="font-medium text-gray-800">{item.name}</p>
                                            {!item.is_active && <p className="text-xs text-red-500">Nonaktif</p>}
                                        </td>
                                        <td className="px-3 py-2">{item.type?.name || '-'}</td>
                                        <td className="px-3 py-2">{item.unit}</td>
                                        <td className={`px-3 py-2 text-right font-semibold ${isLow ? 'text-red-600' : 'text-gray-800'}`}>
                                            {formatNumber(item.current_stock)}
                                            {isLow && (
                                                <span className="inline-flex items-center gap-1 ml-2 text-xs font-normal text-red-500">
                                                    <AlertCircle size={12} /> Habis
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={editMovementModal.open}
                onClose={() => setEditMovementModal({ open: false, movement: null })}
                title="Edit Histori Inventori"
                size="md"
            >
                {editMovementModal.movement && (
                    <form onSubmit={submitEditMovement} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Barang</label>
                                <select
                                    value={editMovementForm.inventory_item_id}
                                    onChange={(event) => setEditMovementForm((prev) => ({ ...prev, inventory_item_id: event.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    required
                                >
                                    <option value="">Pilih barang</option>
                                    {itemOptions.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {resolveItemLabel(item.id)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Jenis</label>
                                <select
                                    value={editMovementForm.movement_type}
                                    onChange={(event) => setEditMovementForm((prev) => ({ ...prev, movement_type: event.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                >
                                    <option value="in">Masuk</option>
                                    <option value="out">Keluar</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Qty</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={editMovementForm.quantity}
                                    onChange={(event) => setEditMovementForm((prev) => ({ ...prev, quantity: event.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Harga Satuan</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={editMovementForm.unit_price}
                                    onChange={(event) => setEditMovementForm((prev) => ({ ...prev, unit_price: event.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    placeholder="Opsional"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Tanggal</label>
                            <input
                                type="date"
                                value={editMovementForm.transaction_date}
                                onChange={(event) => setEditMovementForm((prev) => ({ ...prev, transaction_date: event.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Catatan</label>
                            <input
                                type="text"
                                value={editMovementForm.notes}
                                onChange={(event) => setEditMovementForm((prev) => ({ ...prev, notes: event.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="Opsional"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={() => setEditMovementModal({ open: false, movement: null })}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={saving}>
                                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={payDebtModal.open}
                onClose={() => setPayDebtModal({ open: false, debt: null })}
                title="Pembayaran Hutang Per Barang"
                size="md"
            >
                {payDebtModal.debt && (
                    <form onSubmit={submitSingleDebtPayment} className="space-y-4">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">
                            <p><strong>Barang:</strong> {payDebtModal.debt.item?.name || '-'}</p>
                            <p><strong>Status:</strong> {payDebtModal.debt.status}</p>
                            <p>
                                <strong>Sisa:</strong>{' '}
                                {payDebtModal.debt.remaining_amount === null
                                    ? 'Belum ditetapkan'
                                    : formatCurrency(payDebtModal.debt.remaining_amount)}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Nominal Bayar</label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={payDebtForm.amount}
                                onChange={(e) => setPayDebtForm((prev) => ({ ...prev, amount: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Tanggal Bayar</label>
                            <input
                                type="date"
                                value={payDebtForm.payment_date}
                                onChange={(e) => setPayDebtForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Catatan</label>
                            <input
                                type="text"
                                value={payDebtForm.notes}
                                onChange={(e) => setPayDebtForm((prev) => ({ ...prev, notes: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="Opsional"
                            />
                        </div>

                        {payDebtModal.debt.remaining_amount === null && (
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={payDebtForm.mark_as_paid}
                                    onChange={(e) => setPayDebtForm((prev) => ({ ...prev, mark_as_paid: e.target.checked }))}
                                />
                                Tandai lunas setelah pembayaran ini
                            </label>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={() => setPayDebtModal({ open: false, debt: null })}>Batal</Button>
                            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Pembayaran'}</Button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}

export default InventoryPage;

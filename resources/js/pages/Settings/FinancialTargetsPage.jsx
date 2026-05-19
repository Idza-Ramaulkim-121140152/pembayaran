import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, RefreshCw, Shield, Target, Trash2 } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import financialTargetService from '../../services/financialTargetService';

const TYPE_MANDATORY = 'mandatory_expense';
const TYPE_PURCHASE = 'purchase_target';

const DEFAULT_FORM = {
    type: TYPE_MANDATORY,
    name: '',
    description: '',
    amount: '',
    target_date: '',
    start_date: '',
    end_date: '',
    monthly_day: '',
    is_recurring_monthly: false,
    recurrence_until: '',
    recurrence_forever: false,
    is_active: true,
    priority: '100',
};

const TYPE_LABELS = {
    [TYPE_MANDATORY]: 'Pengeluaran Wajib',
    [TYPE_PURCHASE]: 'Target Pembelian',
};

function toDateInput(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(amount || 0));
}

function normalizeErrorMessage(err, fallback) {
    const errors = err?.response?.data?.errors;
    if (errors) {
        const firstError = Object.values(errors)[0];
        if (Array.isArray(firstError) && firstError[0]) return firstError[0];
    }
    return err?.response?.data?.message || fallback;
}

function getMonthlyDayFromTarget(target) {
    if (target?.meta?.monthly_day) return String(target.meta.monthly_day);
    if (target?.end_date) {
        const date = new Date(target.end_date);
        if (!Number.isNaN(date.getTime())) return String(date.getDate());
    }
    return '';
}

function mapTargetToPayload(target, overrides = {}) {
    const base = {
        type: target.type,
        name: target.name || '',
        description: target.description || '',
        amount: Number(target.amount || 0),
        target_date: target.target_date || null,
        start_date: target.start_date || null,
        end_date: target.end_date || null,
        monthly_day: getMonthlyDayFromTarget(target) ? Number(getMonthlyDayFromTarget(target)) : null,
        is_recurring_monthly: !!target.is_recurring_monthly,
        recurrence_until: target.recurrence_until || null,
        recurrence_forever: !!target.recurrence_forever,
        is_active: !!target.is_active,
        priority: Number(target.priority || 100),
    };

    const payload = { ...base, ...overrides };

    if (payload.type === TYPE_PURCHASE) {
        payload.start_date = null;
        payload.end_date = null;
        payload.is_recurring_monthly = false;
        payload.recurrence_until = null;
        payload.recurrence_forever = false;
        payload.monthly_day = null;
    } else {
        payload.target_date = null;
        if (!payload.is_recurring_monthly) {
            payload.recurrence_until = null;
            payload.recurrence_forever = false;
            payload.monthly_day = null;
        } else if (payload.recurrence_forever) {
            payload.start_date = null;
            payload.end_date = null;
            payload.recurrence_until = null;
        }
    }

    return payload;
}

function FinancialTargetsPage() {
    const isSuperAdmin = (window.appUserRole || '') === 'superadmin';

    const [targets, setTargets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [modal, setModal] = useState({ open: false, editItem: null });
    const [form, setForm] = useState(DEFAULT_FORM);

    const loadTargets = useCallback(async (showLoading = false) => {
        if (showLoading) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            setError(null);
            const response = await financialTargetService.list({ include_inactive: true });
            setTargets(response.data?.data || []);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal memuat master target keuangan.'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (!isSuperAdmin) {
            setLoading(false);
            return;
        }

        loadTargets(true);
    }, [isSuperAdmin, loadTargets]);

    const mandatoryTargets = useMemo(
        () => targets.filter((item) => item.type === TYPE_MANDATORY),
        [targets]
    );
    const purchaseTargets = useMemo(
        () => targets.filter((item) => item.type === TYPE_PURCHASE),
        [targets]
    );

    const openCreate = () => {
        setForm(DEFAULT_FORM);
        setModal({ open: true, editItem: null });
    };

    const openEdit = (target) => {
        setForm({
            type: target.type || TYPE_MANDATORY,
            name: target.name || '',
            description: target.description || '',
            amount: String(target.amount ?? ''),
            target_date: toDateInput(target.target_date),
            start_date: toDateInput(target.start_date),
            end_date: toDateInput(target.end_date),
            monthly_day: getMonthlyDayFromTarget(target),
            is_recurring_monthly: !!target.is_recurring_monthly,
            recurrence_until: toDateInput(target.recurrence_until),
            recurrence_forever: !!target.recurrence_forever,
            is_active: !!target.is_active,
            priority: String(target.priority ?? 100),
        });
        setModal({ open: true, editItem: target });
    };

    const closeModal = () => {
        setModal({ open: false, editItem: null });
        setForm(DEFAULT_FORM);
    };

    const handleTypeChange = (nextType) => {
        setForm((prev) => ({
            ...prev,
            type: nextType,
            target_date: nextType === TYPE_PURCHASE ? prev.target_date : '',
            start_date: nextType === TYPE_MANDATORY ? prev.start_date : '',
            end_date: nextType === TYPE_MANDATORY ? prev.end_date : '',
            monthly_day: nextType === TYPE_MANDATORY ? prev.monthly_day : '',
            is_recurring_monthly: nextType === TYPE_MANDATORY ? prev.is_recurring_monthly : false,
            recurrence_until: nextType === TYPE_MANDATORY ? prev.recurrence_until : '',
            recurrence_forever: nextType === TYPE_MANDATORY ? prev.recurrence_forever : false,
        }));
    };

    const buildPayloadFromForm = () => {
        const type = form.type;
        const base = {
            type,
            name: form.name.trim(),
            description: form.description.trim() || null,
            amount: Number(form.amount),
            target_date: form.target_date || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            monthly_day: form.monthly_day ? Number(form.monthly_day) : null,
            is_recurring_monthly: !!form.is_recurring_monthly,
            recurrence_until: form.recurrence_until || null,
            recurrence_forever: !!form.recurrence_forever,
            is_active: !!form.is_active,
            priority: Number(form.priority || 100),
        };

        if (type === TYPE_PURCHASE) {
            base.start_date = null;
            base.end_date = null;
            base.is_recurring_monthly = false;
            base.recurrence_until = null;
            base.recurrence_forever = false;
            base.monthly_day = null;
        } else {
            base.target_date = null;
            if (!base.is_recurring_monthly) {
                base.recurrence_until = null;
                base.recurrence_forever = false;
                base.monthly_day = null;
            } else if (base.recurrence_forever) {
                base.start_date = null;
                base.end_date = null;
                base.recurrence_until = null;
            }
        }

        return base;
    };

    const submitForm = async (e) => {
        e.preventDefault();

        const payload = buildPayloadFromForm();

        if (!payload.name) {
            setError('Nama target wajib diisi.');
            return;
        }
        if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
            setError('Nominal target wajib lebih dari 0.');
            return;
        }
        if (!Number.isFinite(payload.priority) || payload.priority < 1) {
            setError('Prioritas minimal 1.');
            return;
        }
        if (payload.type === TYPE_MANDATORY && payload.recurrence_forever && (!payload.monthly_day || payload.monthly_day < 1 || payload.monthly_day > 31)) {
            setError('Tanggal bulanan wajib diisi 1-31 untuk mode bulanan selamanya.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            if (modal.editItem) {
                await financialTargetService.update(modal.editItem.id, payload);
                setSuccess('Target keuangan berhasil diperbarui.');
            } else {
                await financialTargetService.create(payload);
                setSuccess('Target keuangan berhasil ditambahkan.');
            }

            closeModal();
            await loadTargets(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menyimpan target keuangan.'));
        } finally {
            setSaving(false);
        }
    };

    const removeTarget = async (target) => {
        if (!window.confirm(`Hapus target "${target.name}"?`)) return;

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await financialTargetService.remove(target.id);
            setSuccess('Target keuangan berhasil dihapus.');
            await loadTargets(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal menghapus target keuangan.'));
        } finally {
            setSaving(false);
        }
    };

    const toggleTargetActive = async (target) => {
        const payload = mapTargetToPayload(target, { is_active: !target.is_active });
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await financialTargetService.update(target.id, payload);
            setSuccess(`Target ${payload.is_active ? 'diaktifkan' : 'dinonaktifkan'}.`);
            await loadTargets(false);
        } catch (err) {
            setError(normalizeErrorMessage(err, 'Gagal mengubah status target.'));
        } finally {
            setSaving(false);
        }
    };

    const renderTargetTable = (rows, type) => {
        const targetColumns = [
            {
                key: 'name',
                label: 'Nama',
                render: (item) => (
                    <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.description || '-'}</p>
                    </div>
                ),
            },
            {
                key: 'amount',
                label: 'Nominal',
                render: (item) => <span className="font-semibold text-gray-900">{formatCurrency(item.amount)}</span>,
                cellClassName: 'px-4 py-3 text-sm text-gray-800 text-left md:text-right',
            },
            {
                key: 'priority',
                label: 'Prioritas',
                render: (item) => <span>{item.priority}</span>,
                cellClassName: 'px-4 py-3 text-sm text-gray-800 text-left md:text-center',
            },
            {
                key: 'time_config',
                label: 'Konfigurasi Waktu',
                render: (item) => {
                    if (item.type === TYPE_PURCHASE) return <span>Target: {item.target_date || '-'}</span>;
                    if (item.is_recurring_monthly) {
                        return item.recurrence_forever
                            ? `Bulanan selamanya (tgl ${item?.meta?.monthly_day || '-'})`
                            : `Bulanan hingga ${item.recurrence_until || '-'}`;
                    }
                    return <span>{item.start_date || '-'} s.d. {item.end_date || '-'}</span>;
                },
            },
            {
                key: 'is_active',
                label: 'Status',
                render: (item) => (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
                    }`}>
                        {item.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                ),
                cellClassName: 'px-4 py-3 text-sm text-gray-800 text-left md:text-center',
            },
        ];

        return (
            <div className="p-4 md:p-0">
                <ResponsiveDataView
                    rows={rows}
                    columns={targetColumns}
                    keyField="id"
                    priorityFields={['name', 'amount', 'is_active']}
                    emptyMessage={type === TYPE_MANDATORY ? 'Belum ada target pengeluaran wajib.' : 'Belum ada target pembelian.'}
                    tableClassName="w-full text-sm md:min-w-[980px]"
                    actions={(item) => (
                        <div className="flex flex-wrap items-center justify-start md:justify-end gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => toggleTargetActive(item)}
                                disabled={saving}
                                className="w-full sm:w-auto"
                            >
                                {item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(item)} disabled={saving}>
                                <Edit2 size={14} />
                            </Button>
                            <Button type="button" variant="danger" size="sm" onClick={() => removeTarget(item)} disabled={saving}>
                                <Trash2 size={14} />
                            </Button>
                        </div>
                    )}
                />
            </div>
        );
    };

    if (!isSuperAdmin) {
        return (
            <div className="max-w-3xl mx-auto">
                <Alert type="warning" message="Menu ini hanya tersedia untuk superadmin." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="text-indigo-600" size={28} />
                        Master Target Keuangan
                    </h1>
                    <p className="text-gray-500 mt-1">Khusus superadmin: kelola target pengeluaran wajib dan target pembelian.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadTargets(false)}
                        disabled={refreshing}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                    </Button>
                    <Button type="button" onClick={openCreate} className="w-full sm:w-auto inline-flex items-center justify-center gap-2">
                        <Plus size={16} />
                        Tambah Target
                    </Button>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {loading ? (
                <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
                    Memuat master target keuangan...
                </div>
            ) : (
                <>
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                <Target size={18} className="text-rose-600" />
                                Target Pengeluaran Wajib
                            </h2>
                        </div>
                        {renderTargetTable(mandatoryTargets, TYPE_MANDATORY)}
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                <Target size={18} className="text-cyan-600" />
                                Target Pembelian
                            </h2>
                        </div>
                        {renderTargetTable(purchaseTargets, TYPE_PURCHASE)}
                    </div>
                </>
            )}

            <Modal
                isOpen={modal.open}
                onClose={closeModal}
                title={modal.editItem ? 'Edit Target Keuangan' : 'Tambah Target Keuangan'}
                size="2xl"
            >
                <form onSubmit={submitForm} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Jenis Target</label>
                            <select
                                value={form.type}
                                onChange={(e) => handleTypeChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                                disabled={!!modal.editItem}
                            >
                                <option value={TYPE_MANDATORY}>{TYPE_LABELS[TYPE_MANDATORY]}</option>
                                <option value={TYPE_PURCHASE}>{TYPE_LABELS[TYPE_PURCHASE]}</option>
                            </select>
                            {modal.editItem && (
                                <p className="text-xs text-gray-500 mt-1">Jenis target tidak dapat diubah saat edit.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Prioritas</label>
                            <input
                                type="number"
                                min="1"
                                max="1000"
                                value={form.priority}
                                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Nama Target</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                maxLength={120}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Nominal</label>
                            <input
                                type="number"
                                min="1"
                                step="any"
                                value={form.amount}
                                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Deskripsi</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            rows={2}
                            maxLength={1000}
                        />
                    </div>

                    {form.type === TYPE_PURCHASE ? (
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">Target Tanggal (Opsional)</label>
                            <input
                                type="date"
                                value={form.target_date}
                                onChange={(e) => setForm((prev) => ({ ...prev, target_date: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg md:w-64"
                            />
                        </div>
                    ) : (
                        <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                                <input
                                    type="checkbox"
                                    checked={form.is_recurring_monthly}
                                    onChange={(e) => setForm((prev) => ({ ...prev, is_recurring_monthly: e.target.checked }))}
                                    className="rounded border-gray-300"
                                />
                                Target berulang bulanan
                            </label>

                            {form.is_recurring_monthly ? (
                                <div className="space-y-3">
                                    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                                        <input
                                            type="checkbox"
                                            checked={form.recurrence_forever}
                                            onChange={(e) => setForm((prev) => ({ ...prev, recurrence_forever: e.target.checked }))}
                                            className="rounded border-gray-300"
                                        />
                                        Berlaku selamanya
                                    </label>

                                    {form.recurrence_forever ? (
                                        <div>
                                            <label className="block text-sm text-gray-700 mb-1">Tanggal setiap bulan (1-31)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="31"
                                                value={form.monthly_day}
                                                onChange={(e) => setForm((prev) => ({ ...prev, monthly_day: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg md:w-64"
                                                required
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-sm text-gray-700 mb-1">Tanggal Mulai</label>
                                                <input
                                                    type="date"
                                                    value={form.start_date}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-gray-700 mb-1">Tanggal Akhir</label>
                                                <input
                                                    type="date"
                                                    value={form.end_date}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-gray-700 mb-1">Batas Pengulangan</label>
                                                <input
                                                    type="date"
                                                    value={form.recurrence_until}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, recurrence_until: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm text-gray-700 mb-1">Tanggal Mulai</label>
                                        <input
                                            type="date"
                                            value={form.start_date}
                                            onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-700 mb-1">Tanggal Akhir</label>
                                        <input
                                            type="date"
                                            value={form.end_date}
                                            onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                            className="rounded border-gray-300"
                        />
                        Target aktif
                    </label>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default FinancialTargetsPage;

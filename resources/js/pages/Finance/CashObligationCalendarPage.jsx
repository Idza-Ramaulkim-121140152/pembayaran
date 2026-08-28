import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    Clock3,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    Wallet,
    XCircle,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import cashObligationCalendarService from '../../services/cashObligationCalendarService';
import apiClient from '../../services/api';

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatDateInput(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate()).toISOString().slice(0, 10);
}

function formatDateLabel(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function defaultRange() {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);

    return {
        start_date: formatDateInput(today),
        end_date: formatDateInput(end),
    };
}

function defaultForm() {
    return {
        title: '',
        amount: '',
        due_date: formatDateInput(new Date()),
        category: 'lainnya',
        priority: 'medium',
        status: 'pending',
        notes: '',
    };
}

function getStatusMeta(status) {
    if (status === 'completed') return { label: 'Selesai', className: 'bg-emerald-100 text-emerald-700' };
    if (status === 'cancelled') return { label: 'Dibatalkan', className: 'bg-slate-200 text-slate-700' };
    if (status === 'overdue') return { label: 'Overdue', className: 'bg-rose-100 text-rose-700' };
    return { label: 'Pending', className: 'bg-amber-100 text-amber-700' };
}

function getPriorityMeta(priority) {
    if (priority === 'high') return { label: 'Tinggi', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
    if (priority === 'low') return { label: 'Rendah', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
    return { label: 'Sedang', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
}

function getSourceMeta(sourceType) {
    if (sourceType === 'mandatory_target') return { label: 'Pengeluaran Wajib', className: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
    if (sourceType === 'purchase_target') return { label: 'Target Pembelian', className: 'bg-cyan-50 text-cyan-700 border border-cyan-200' };
    return { label: 'Manual', className: 'bg-white text-slate-700 border border-slate-200' };
}

function SummaryCard({ icon: Icon, title, value, subtitle, tone = 'blue' }) {
    const tones = {
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
        red: 'bg-rose-50 text-rose-700 border-rose-100',
        green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };

    return (
        <div className={`rounded-2xl border p-4 ${tones[tone] || tones.blue}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium opacity-80">{title}</p>
                    <p className="mt-2 text-2xl font-bold">{value}</p>
                    {subtitle ? <p className="mt-1 text-xs opacity-80">{subtitle}</p> : null}
                </div>
                <div className="rounded-xl bg-white/70 p-3">
                    <Icon size={20} />
                </div>
            </div>
        </div>
    );
}

function FilterPill({ active, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
                active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
        >
            {children}
        </button>
    );
}

function CashObligationCalendarPage() {
    const [range, setRange] = useState(defaultRange());
    const [calendar, setCalendar] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [filters, setFilters] = useState({
        status: [],
        source: [],
        priority: [],
        category: [],
    });
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form, setForm] = useState(defaultForm());

    const fetchCalendar = async () => {
        setLoading(true);
        try {
            setError(null);
            const response = await cashObligationCalendarService.get({
                ...range,
                ...filters,
            });
            setCalendar(response?.data?.data || null);
        } catch (err) {
            console.error('Gagal memuat kalender kewajiban kas', err);
            setError(err?.response?.data?.message || 'Gagal memuat kalender kewajiban kas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalendar();
    }, [range.start_date, range.end_date, JSON.stringify(filters)]);

    const summary = calendar?.summary || {};
    const groupedRows = calendar?.grouped_by_date || [];
    const filterMeta = calendar?.meta?.filters || {};

    const headerSubtitle = useMemo(() => {
        return `Workspace finance untuk melihat kewajiban uang keluar dari ${formatDateLabel(range.start_date)} sampai ${formatDateLabel(range.end_date)}.`;
    }, [range.start_date, range.end_date]);

    const openCreateModal = () => {
        setEditingItem(null);
        setForm(defaultForm());
        setModalOpen(true);
    };

    const openEditModal = (item) => {
        setEditingItem(item);
        setForm({
            title: item.title || '',
            amount: String(item.amount || ''),
            due_date: item.due_date || formatDateInput(new Date()),
            category: item.category || 'lainnya',
            priority: item.priority || 'medium',
            status: item.status || 'pending',
            notes: item.notes || '',
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingItem(null);
        setForm(defaultForm());
    };

    const submitManualEntry = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            setError(null);
            const payload = {
                ...form,
                amount: Number(form.amount || 0),
                notes: form.notes?.trim() || null,
            };

            if (editingItem) {
                await cashObligationCalendarService.updateManualEntry(editingItem.source_id, payload);
                setSuccess('Kewajiban manual berhasil diperbarui.');
            } else {
                await cashObligationCalendarService.createManualEntry(payload);
                setSuccess('Kewajiban manual berhasil ditambahkan.');
            }

            closeModal();
            await fetchCalendar();
        } catch (err) {
            console.error('Gagal menyimpan kewajiban manual', err);
            setError(err?.response?.data?.message || 'Gagal menyimpan kewajiban manual.');
        } finally {
            setSaving(false);
        }
    };

    const handleManualStatus = async (item, status) => {
        try {
            setError(null);
            await cashObligationCalendarService.updateManualEntryStatus(item.source_id, { status });
            setSuccess('Status kewajiban manual berhasil diperbarui.');
            await fetchCalendar();
        } catch (err) {
            console.error('Gagal memperbarui status kewajiban manual', err);
            setError(err?.response?.data?.message || 'Gagal memperbarui status kewajiban manual.');
        }
    };

    const handleDelete = async (item) => {
        if (!window.confirm(`Hapus kewajiban "${item.title}"?`)) {
            return;
        }

        try {
            setError(null);
            await cashObligationCalendarService.deleteManualEntry(item.source_id);
            setSuccess('Kewajiban manual berhasil dihapus.');
            await fetchCalendar();
        } catch (err) {
            console.error('Gagal menghapus kewajiban manual', err);
            setError(err?.response?.data?.message || 'Gagal menghapus kewajiban manual.');
        }
    };

    const handleMandatoryAction = async (item, action) => {
        const payload = {
            target_id: item.extra?.target_id,
            due_date: item.due_date,
            amount: item.amount,
        };

        try {
            setError(null);
            if (action === 'confirm_execution') {
                await apiClient.post('/dashboard/financial-projection/mandatory-events/confirm', payload);
                setSuccess('Pengeluaran wajib berhasil dikonfirmasi.');
            } else {
                await apiClient.delete('/dashboard/financial-projection/mandatory-events/confirm', { data: payload });
                setSuccess('Konfirmasi pengeluaran wajib berhasil dibatalkan.');
            }
            await fetchCalendar();
        } catch (err) {
            console.error('Gagal menjalankan aksi pengeluaran wajib', err);
            setError(err?.response?.data?.message || 'Gagal menjalankan aksi pengeluaran wajib.');
        }
    };

    const toggleFilterValue = (key, value) => {
        setFilters((current) => {
            const set = new Set(current[key] || []);
            if (set.has(value)) {
                set.delete(value);
            } else {
                set.add(value);
            }

            return {
                ...current,
                [key]: Array.from(set),
            };
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Kalender Kewajiban Kas</h1>
                    <p className="mt-1 text-slate-600">{headerSubtitle}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                        <Calendar size={16} />
                        <input
                            type="date"
                            value={range.start_date}
                            onChange={(event) => setRange((current) => ({ ...current, start_date: event.target.value }))}
                            className="border-0 bg-transparent p-0 text-slate-700 focus:ring-0"
                        />
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                        <Calendar size={16} />
                        <input
                            type="date"
                            value={range.end_date}
                            onChange={(event) => setRange((current) => ({ ...current, end_date: event.target.value }))}
                            className="border-0 bg-transparent p-0 text-slate-700 focus:ring-0"
                        />
                    </label>
                    <Button variant="secondary" onClick={fetchCalendar}>
                        <RefreshCw size={16} />
                        Muat Ulang
                    </Button>
                    <Button onClick={openCreateModal}>
                        <Plus size={16} />
                        Tambah Kewajiban Manual
                    </Button>
                </div>
            </div>

            {error ? <Alert type="error" message={error} onClose={() => setError(null)} /> : null}
            {success ? <Alert type="success" message={success} onClose={() => setSuccess(null)} /> : null}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <SummaryCard icon={Clock3} title="Jatuh Tempo Hari Ini" value={formatCurrency(summary.due_today_amount)} subtitle={`${summary?.counts?.total || 0} item pada rentang ini`} tone="amber" />
                <SummaryCard icon={Calendar} title="7 Hari Ke Depan" value={formatCurrency(summary.next_7_days_amount)} subtitle={`${summary?.counts?.pending || 0} item pending`} tone="blue" />
                <SummaryCard icon={AlertTriangle} title="Overdue" value={formatCurrency(summary.overdue_amount)} subtitle={`${summary?.counts?.overdue || 0} item lewat jatuh tempo`} tone="red" />
                <SummaryCard icon={Wallet} title="Bulan Berjalan" value={formatCurrency(summary.current_month_amount)} subtitle="Total kewajiban di bulan aktif" tone="blue" />
                <SummaryCard icon={CheckCircle2} title="Selesai" value={formatCurrency(summary.completed_amount)} subtitle={`${summary?.counts?.completed || 0} item selesai`} tone="green" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Filter Kewajiban</h2>
                    <p className="text-sm text-slate-500">Pilih filter untuk fokus ke risiko kas yang paling relevan.</p>
                </div>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                        <div className="flex flex-wrap gap-2">
                            {(filterMeta.statuses || []).map((item) => (
                                <FilterPill key={item.value} active={(filters.status || []).includes(item.value)} onClick={() => toggleFilterValue('status', item.value)}>
                                    {item.label}
                                </FilterPill>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sumber</p>
                        <div className="flex flex-wrap gap-2">
                            {(filterMeta.source_types || []).map((item) => (
                                <FilterPill key={item.value} active={(filters.source || []).includes(item.value)} onClick={() => toggleFilterValue('source', item.value)}>
                                    {item.label}
                                </FilterPill>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prioritas</p>
                        <div className="flex flex-wrap gap-2">
                            {(filterMeta.priorities || []).map((item) => (
                                <FilterPill key={item.value} active={(filters.priority || []).includes(item.value)} onClick={() => toggleFilterValue('priority', item.value)}>
                                    {item.label}
                                </FilterPill>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kategori</p>
                        <div className="flex flex-wrap gap-2">
                            {(filterMeta.categories || []).map((item) => (
                                <FilterPill key={item.value} active={(filters.category || []).includes(item.value)} onClick={() => toggleFilterValue('category', item.value)}>
                                    {item.label}
                                </FilterPill>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.05),transparent_26%),white] p-5 md:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Timeline Kewajiban</h2>
                        <p className="text-sm text-slate-500">Urutan kewajiban berdasarkan tanggal jatuh tempo agar kontrol kas lebih mudah dibawa.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-slate-500">Memuat timeline kewajiban kas...</div>
                ) : groupedRows.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
                        Belum ada kewajiban pada rentang dan filter yang dipilih.
                    </div>
                ) : (
                    <div className="mt-6 space-y-6">
                        {groupedRows.map((group) => (
                            <div key={group.date} className="space-y-3">
                                <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-900">{group.label}</p>
                                        <p className="text-xs text-slate-500">{group.items.length} item</p>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-700">{formatCurrency(group.total_amount)}</p>
                                </div>

                                <div className="space-y-3">
                                    {group.items.map((item) => {
                                        const statusMeta = getStatusMeta(item.display_status);
                                        const priorityMeta = getPriorityMeta(item.priority);
                                        const sourceMeta = getSourceMeta(item.source_type);

                                        return (
                                            <div
                                                key={item.id}
                                                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                                                    item.display_status === 'overdue' ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-200'
                                                }`}
                                            >
                                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
                                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityMeta.className}`}>{priorityMeta.label}</span>
                                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sourceMeta.className}`}>{sourceMeta.label}</span>
                                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.category}</span>
                                                        </div>

                                                        <div>
                                                            <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                                                            <p className="mt-1 text-sm text-slate-500">
                                                                Jatuh tempo {formatDateLabel(item.due_date)}
                                                                {item.source_url ? (
                                                                    <>
                                                                        {' '}·{' '}
                                                                        <a href={item.source_url} className="font-medium text-blue-600 hover:text-blue-700">
                                                                            Buka sumber
                                                                        </a>
                                                                    </>
                                                                ) : null}
                                                            </p>
                                                            {item.notes ? <p className="mt-2 text-sm text-slate-600">{item.notes}</p> : null}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col items-start gap-3 xl:items-end">
                                                        <p className={`text-2xl font-bold ${item.display_status === 'overdue' ? 'text-rose-700' : 'text-slate-900'}`}>
                                                            {formatCurrency(item.amount)}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 xl:justify-end">
                                                            {item.source_type === 'manual_entry' && item.is_editable ? (
                                                                <>
                                                                    <Button variant="secondary" size="sm" onClick={() => openEditModal(item)}>
                                                                        <Pencil size={14} />
                                                                        Edit
                                                                    </Button>
                                                                    {item.status !== 'completed' ? (
                                                                        <Button variant="success" size="sm" onClick={() => handleManualStatus(item, 'completed')}>
                                                                            <CheckCircle2 size={14} />
                                                                            Selesai
                                                                        </Button>
                                                                    ) : null}
                                                                    {item.status !== 'pending' ? (
                                                                        <Button variant="secondary" size="sm" onClick={() => handleManualStatus(item, 'pending')}>
                                                                            <RefreshCw size={14} />
                                                                            Buka Lagi
                                                                        </Button>
                                                                    ) : null}
                                                                    {item.status !== 'cancelled' ? (
                                                                        <Button variant="warning" size="sm" onClick={() => handleManualStatus(item, 'cancelled')}>
                                                                            <XCircle size={14} />
                                                                            Batalkan
                                                                        </Button>
                                                                    ) : null}
                                                                    <Button variant="danger" size="sm" onClick={() => handleDelete(item)}>
                                                                        <Trash2 size={14} />
                                                                        Hapus
                                                                    </Button>
                                                                </>
                                                            ) : null}

                                                            {item.source_type === 'mandatory_target' ? (
                                                                item.extra?.is_confirmed ? (
                                                                    <Button variant="secondary" size="sm" onClick={() => handleMandatoryAction(item, 'revoke_confirmation')}>
                                                                        <RefreshCw size={14} />
                                                                        Batalkan Konfirmasi
                                                                    </Button>
                                                                ) : (
                                                                    <Button variant="success" size="sm" onClick={() => handleMandatoryAction(item, 'confirm_execution')}>
                                                                        <CheckCircle2 size={14} />
                                                                        Konfirmasi Terlaksana
                                                                    </Button>
                                                                )
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal isOpen={modalOpen} onClose={closeModal} title={editingItem ? 'Edit Kewajiban Manual' : 'Tambah Kewajiban Manual'} size="lg">
                <form onSubmit={submitManualEntry} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Judul</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Nominal</label>
                            <input
                                type="number"
                                min="1"
                                value={form.amount}
                                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Jatuh Tempo</label>
                            <input
                                type="date"
                                value={form.due_date}
                                onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
                            <select
                                value={form.category}
                                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                {(filterMeta.categories || []).map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Prioritas</label>
                            <select
                                value={form.priority}
                                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                {(filterMeta.priorities || []).map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
                        <textarea
                            value={form.notes}
                            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                            rows={4}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            placeholder="Opsional: detail vendor, konteks pembayaran, atau catatan keputusan."
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={closeModal}>Batal</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Tambah Kewajiban'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default CashObligationCalendarPage;

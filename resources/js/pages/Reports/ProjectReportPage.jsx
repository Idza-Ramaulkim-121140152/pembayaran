import { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, FolderKanban, MapPin, Plus, Save, Settings, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import reportService from '../../services/reportService';

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusClass(status) {
    if (status === 'untung') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (status === 'rugi') return 'bg-rose-50 text-rose-700 border-rose-100';
    return 'bg-amber-50 text-amber-700 border-amber-100';
}

function SummaryCard({ icon: Icon, title, value, subtitle, tone = 'blue' }) {
    const tones = {
        blue: 'bg-blue-50 text-blue-700',
        green: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
        red: 'bg-rose-50 text-rose-700',
        slate: 'bg-slate-50 text-slate-700',
    };

    return (
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <p className="mt-2 text-2xl font-bold leading-tight tracking-tight text-gray-900 [font-variant-numeric:tabular-nums] break-words">
                        {value}
                    </p>
                    {subtitle && <p className="mt-2 text-xs leading-5 text-gray-500">{subtitle}</p>}
                </div>
                <div className={`rounded-2xl p-3 ${tones[tone] || tones.blue}`}>
                    <Icon size={20} />
                </div>
            </div>
        </div>
    );
}

function SectionCard({ title, subtitle, children, right }) {
    return (
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                    {subtitle && <p className="mt-1 text-sm leading-6 text-gray-500">{subtitle}</p>}
                </div>
                {right}
            </div>
            <div className="mt-4">{children}</div>
        </div>
    );
}

function blankExpense() {
    return {
        name: '',
        category: '',
        quantity: '1',
        unit: 'pcs',
        unit_price: '0',
        notes: '',
    };
}

function buildFormFromProject(project) {
    if (!project) {
        return {
            name: '',
            notes: '',
            starts_at: '',
            ends_at: '',
            is_active: true,
            wilayah_mappings: [],
            customer_ids: [],
            manual_expenses: [blankExpense()],
        };
    }

    return {
        name: project.name || '',
        notes: project.notes || '',
        starts_at: project.starts_at || '',
        ends_at: project.ends_at || '',
        is_active: !!project.is_active,
        wilayah_mappings: (project.wilayah_mappings || []).map((item) => ({
            level: item.level,
            id: item.wilayah_id,
            label: item.label,
        })),
        customer_ids: (project.customers || []).map((item) => item.customer_id),
        manual_expenses: (project.manual_expenses || []).length > 0
            ? project.manual_expenses.map((item) => ({
                name: item.name || '',
                category: item.category || '',
                quantity: String(item.quantity ?? 0),
                unit: item.unit || '',
                unit_price: String(item.unit_price ?? 0),
                notes: item.notes || '',
            }))
            : [blankExpense()],
    };
}

function matchesWilayah(customer, mappings) {
    if (!Array.isArray(mappings) || mappings.length === 0) {
        return true;
    }

    return mappings.some((mapping) => {
        if (mapping.level === 'kecamatan') return Number(customer.kecamatan_id) === Number(mapping.id);
        if (mapping.level === 'desa') return Number(customer.desa_id) === Number(mapping.id);
        if (mapping.level === 'dusun') return Number(customer.dusun_id) === Number(mapping.id);
        return false;
    });
}

function DetailMetric({ label, value, tone = 'default' }) {
    const toneClass = tone === 'positive'
        ? 'text-emerald-700'
        : tone === 'negative'
            ? 'text-rose-700'
            : 'text-gray-900';

    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-2 text-lg font-bold leading-tight [font-variant-numeric:tabular-nums] ${toneClass}`}>
                {value}
            </p>
        </div>
    );
}

function ProjectReportPage() {
    const [report, setReport] = useState(null);
    const [options, setOptions] = useState({ wilayah_hierarchy: [], customers: [] });
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingProjectId, setEditingProjectId] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [wilayahPicker, setWilayahPicker] = useState({
        level: 'dusun',
        kecamatan_id: '',
        desa_id: '',
        wilayah_id: '',
    });
    const [form, setForm] = useState(buildFormFromProject(null));

    const loadDetail = async (projectId) => {
        if (!projectId) {
            setSelectedDetail(null);
            return;
        }

        setDetailLoading(true);
        try {
            const response = await reportService.projectReports.detail(projectId);
            setSelectedDetail(response?.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat detail project.');
        } finally {
            setDetailLoading(false);
        }
    };

    const loadPage = async (preferredId = null) => {
        setLoading(true);
        setError(null);

        try {
            const [listResponse, optionsResponse] = await Promise.all([
                reportService.projectReports.list(),
                reportService.projectReports.options(),
            ]);

            const listPayload = listResponse?.data?.data || {};
            const rows = listPayload.rows || [];
            const nextSelectedId = preferredId ?? selectedId ?? rows[0]?.id ?? null;

            setReport(listPayload);
            setOptions(optionsResponse?.data?.data || { wilayah_hierarchy: [], customers: [] });
            setSelectedId(nextSelectedId);

            if (nextSelectedId) {
                await loadDetail(nextSelectedId);
            } else {
                setSelectedDetail(null);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat laporan project.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPage();
    }, []);

    const rows = report?.rows || [];
    const summary = report?.summary || {};
    const hierarchy = options?.wilayah_hierarchy || [];

    const kecamatanOptions = useMemo(() => hierarchy, [hierarchy]);
    const desaOptions = useMemo(() => {
        const selected = hierarchy.find((item) => Number(item.id) === Number(wilayahPicker.kecamatan_id));
        return selected?.desas || [];
    }, [hierarchy, wilayahPicker.kecamatan_id]);
    const dusunOptions = useMemo(() => {
        const selected = desaOptions.find((item) => Number(item.id) === Number(wilayahPicker.desa_id));
        return selected?.dusuns || [];
    }, [desaOptions, wilayahPicker.desa_id]);

    const filteredCustomers = useMemo(() => {
        const search = customerSearch.trim().toLowerCase();

        return (options.customers || [])
            .filter((customer) => {
                if (search === '') return true;
                return [customer.name, customer.pppoe_username, customer.phone, customer.wilayah_label]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(search);
            })
            .sort((a, b) => {
                const aMatch = matchesWilayah(a, form.wilayah_mappings) ? 0 : 1;
                const bMatch = matchesWilayah(b, form.wilayah_mappings) ? 0 : 1;
                return aMatch - bMatch || a.name.localeCompare(b.name);
            });
    }, [customerSearch, form.wilayah_mappings, options.customers]);

    const openCreateModal = () => {
        setSuccess(null);
        setEditingProjectId(null);
        setForm(buildFormFromProject(null));
        setModalOpen(true);
    };

    const openEditModal = () => {
        setSuccess(null);
        setEditingProjectId(selectedDetail?.id || null);
        setForm(buildFormFromProject(selectedDetail));
        setModalOpen(true);
    };

    const handleSelectProject = async (projectId) => {
        setSelectedId(projectId);
        await loadDetail(projectId);
    };

    const addWilayahMapping = () => {
        const level = wilayahPicker.level;
        const wilayahId = Number(wilayahPicker.wilayah_id || 0);
        if (!wilayahId) return;

        const label = level === 'kecamatan'
            ? kecamatanOptions.find((item) => Number(item.id) === wilayahId)?.name
            : level === 'desa'
                ? desaOptions.find((item) => Number(item.id) === wilayahId)?.name
                : dusunOptions.find((item) => Number(item.id) === wilayahId)?.name;

        if (!label) return;

        const exists = form.wilayah_mappings.some((item) => item.level === level && Number(item.id) === wilayahId);
        if (exists) return;

        setForm((prev) => ({
            ...prev,
            wilayah_mappings: [...prev.wilayah_mappings, { level, id: wilayahId, label }],
        }));
        setWilayahPicker((prev) => ({ ...prev, wilayah_id: '' }));
    };

    const toggleCustomer = (customerId) => {
        setForm((prev) => {
            const exists = prev.customer_ids.includes(customerId);

            return {
                ...prev,
                customer_ids: exists
                    ? prev.customer_ids.filter((item) => item !== customerId)
                    : [...prev.customer_ids, customerId],
            };
        });
    };

    const updateExpenseRow = (index, key, value) => {
        setForm((prev) => ({
            ...prev,
            manual_expenses: prev.manual_expenses.map((item, itemIndex) => (
                itemIndex === index ? { ...item, [key]: value } : item
            )),
        }));
    };

    const addExpenseRow = () => {
        setForm((prev) => ({
            ...prev,
            manual_expenses: [...prev.manual_expenses, blankExpense()],
        }));
    };

    const removeExpenseRow = (index) => {
        setForm((prev) => ({
            ...prev,
            manual_expenses: prev.manual_expenses.filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = {
                name: form.name,
                notes: form.notes || null,
                starts_at: form.starts_at || null,
                ends_at: form.ends_at || null,
                is_active: form.is_active,
                wilayah_mappings: form.wilayah_mappings.map((item) => ({ level: item.level, id: Number(item.id) })),
                customer_ids: form.customer_ids.map(Number),
                manual_expenses: form.manual_expenses
                    .filter((item) => item.name.trim() !== '')
                    .map((item) => ({
                        name: item.name,
                        category: item.category || null,
                        quantity: Number(item.quantity || 0),
                        unit: item.unit || null,
                        unit_price: Number(item.unit_price || 0),
                        notes: item.notes || null,
                    })),
            };

            const response = editingProjectId
                ? await reportService.projectReports.update(editingProjectId, payload)
                : await reportService.projectReports.store(payload);

            const saved = response?.data?.data || null;
            setModalOpen(false);
            setEditingProjectId(null);
            setSuccess(response?.data?.message || 'Project report berhasil disimpan.');
            await loadPage(saved?.id || editingProjectId || null);
        } catch (err) {
            const validation = err.response?.data?.errors;
            if (validation) {
                const firstError = Object.values(validation).flat()[0];
                setError(firstError || 'Validasi project report gagal.');
            } else {
                setError(err.response?.data?.message || 'Gagal menyimpan project report.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Laporan Project</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                        Memantau untung atau rugi project area terbaru. Biaya pelanggan mengikuti logika yang sama dengan
                        laporan income pelanggan, sedangkan biaya manual dipakai untuk tambahan pengeluaran project.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                    >
                        <Plus size={16} />
                        Project Baru
                    </button>
                    <button
                        type="button"
                        onClick={openEditModal}
                        disabled={!selectedDetail}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Settings size={16} />
                        Pengaturan Project
                    </button>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {loading ? (
                <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
                    <LoadingSpinner text="Memuat laporan project..." />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard icon={FolderKanban} title="Total Project" value={summary.project_count || 0} subtitle={`${summary.active_project_count || 0} project aktif`} tone="blue" />
                        <SummaryCard icon={Users} title="Pelanggan Terkait" value={summary.customer_count || 0} subtitle={`${summary.wilayah_count || 0} mapping wilayah`} tone="slate" />
                        <SummaryCard icon={TrendingUp} title="Total Pemasukan" value={formatCurrency(summary.total_income)} subtitle="Income pemasangan + invoice paid" tone="green" />
                        <SummaryCard icon={TrendingDown} title="Total Margin" value={formatCurrency(summary.total_margin)} subtitle="Akumulasi income dikurangi biaya" tone={Number(summary.total_margin || 0) >= 0 ? 'green' : 'red'} />
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
                        <SectionCard
                            title="Daftar Project"
                            subtitle="Pilih project untuk melihat detail pemasukan, biaya pelanggan, biaya manual, dan margin."
                        >
                            {rows.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                    Belum ada project report. Buat project baru dari tombol di kanan atas.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rows.map((row) => (
                                        <button
                                            key={row.id}
                                            type="button"
                                            onClick={() => handleSelectProject(row.id)}
                                            className={`w-full rounded-3xl border p-4 text-left transition ${selectedId === row.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-lg font-bold text-gray-900">{row.name}</p>
                                                    <p className="mt-1 text-xs leading-5 text-gray-500">
                                                        {row.customer_count} pelanggan · {row.wilayah_count} wilayah
                                                        {row.starts_at ? ` · mulai ${formatDate(row.starts_at)}` : ''}
                                                    </p>
                                                </div>
                                                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                                                    {row.status}
                                                </span>
                                            </div>
                                            <div className="mt-4 grid grid-cols-3 gap-3">
                                                <DetailMetric label="Income" value={formatCurrency(row.total_income)} tone="positive" />
                                                <DetailMetric label="Biaya" value={formatCurrency(row.total_expense)} tone="negative" />
                                                <DetailMetric label="Margin" value={formatCurrency(row.margin)} tone={Number(row.margin || 0) >= 0 ? 'positive' : 'negative'} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        {detailLoading ? (
                            <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
                                <LoadingSpinner text="Memuat detail project..." />
                            </div>
                        ) : !selectedDetail ? (
                            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
                                Pilih project terlebih dahulu untuk melihat detail laporan.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <SectionCard
                                    title={selectedDetail.name}
                                    subtitle={`${selectedDetail.is_active ? 'Aktif' : 'Nonaktif'}${selectedDetail.starts_at ? ` · mulai ${formatDate(selectedDetail.starts_at)}` : ''}${selectedDetail.ends_at ? ` · selesai ${formatDate(selectedDetail.ends_at)}` : ''}`}
                                    right={<span className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${statusClass(selectedDetail.status)}`}>{selectedDetail.status}</span>}
                                >
                                    {selectedDetail.notes && (
                                        <p className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                                            {selectedDetail.notes}
                                        </p>
                                    )}

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        <SummaryCard icon={DollarSign} title="Total Pemasukan" value={formatCurrency(selectedDetail.total_income)} subtitle="Instalasi pelanggan + invoice paid" tone="green" />
                                        <SummaryCard icon={Wallet} title="Total Biaya" value={formatCurrency(selectedDetail.total_expense)} subtitle="Biaya pelanggan + biaya manual" tone="red" />
                                        <SummaryCard icon={TrendingUp} title="Margin" value={formatCurrency(selectedDetail.margin)} subtitle="Selisih pemasukan dan pengeluaran" tone={Number(selectedDetail.margin || 0) >= 0 ? 'green' : 'red'} />
                                        <SummaryCard icon={BarChart3} title="Status" value={selectedDetail.status} subtitle={`${selectedDetail.customer_count} pelanggan · ${selectedDetail.wilayah_count} wilayah`} tone={Number(selectedDetail.margin || 0) >= 0 ? 'green' : 'amber'} />
                                    </div>
                                </SectionCard>

                                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                    <SectionCard title="Breakdown Pemasukan" subtitle="Sumber pemasukan project dari pelanggan yang dimapping manual.">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                            <DetailMetric label="Income Instalasi" value={formatCurrency(selectedDetail.installation_income_total)} tone="positive" />
                                            <DetailMetric label="Invoice Paid" value={formatCurrency(selectedDetail.invoice_income_total)} tone="positive" />
                                            <DetailMetric label="Total Pemasukan" value={formatCurrency(selectedDetail.total_income)} tone="positive" />
                                        </div>
                                    </SectionCard>

                                    <SectionCard title="Breakdown Pengeluaran" subtitle="Biaya pelanggan memakai logika yang sama dengan laporan income pelanggan.">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                            <DetailMetric label="Biaya Pelanggan" value={formatCurrency(selectedDetail.customer_installation_expense_total)} tone="negative" />
                                            <DetailMetric label="Biaya Manual" value={formatCurrency(selectedDetail.manual_expense_total)} tone="negative" />
                                            <DetailMetric label="Total Biaya" value={formatCurrency(selectedDetail.total_expense)} tone="negative" />
                                        </div>
                                    </SectionCard>
                                </div>

                                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                                    <SectionCard
                                        title="Pelanggan Project"
                                        subtitle="Setiap pelanggan membawa income pemasangan, invoice paid, dan biaya instalasi berdasarkan snapshot laporan income pelanggan."
                                    >
                                        {(selectedDetail.customers || []).length === 0 ? (
                                            <p className="text-sm text-gray-500">Belum ada pelanggan yang dimapping ke project ini.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {selectedDetail.customers.map((customer) => (
                                                    <div key={customer.customer_id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div>
                                                                <p className="text-base font-bold text-gray-900">{customer.customer_name}</p>
                                                                <p className="mt-1 text-sm text-gray-500">{customer.pppoe_username || '-'} · {customer.wilayah_label}</p>
                                                                {customer.estimation_notes && (
                                                                    <p className="mt-2 text-xs leading-5 text-amber-700">{customer.estimation_notes}</p>
                                                                )}
                                                            </div>
                                                            <span className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-semibold ${Number(customer.margin || 0) >= 0 ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
                                                                Margin {formatCurrency(customer.margin)}
                                                            </span>
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                                            <DetailMetric label="Income Instalasi" value={formatCurrency(customer.installation_income_total)} tone="positive" />
                                                            <DetailMetric label="Invoice Paid" value={formatCurrency(customer.invoice_income_total)} tone="positive" />
                                                            <DetailMetric label="Biaya Instalasi" value={formatCurrency(customer.installation_cost_total)} tone="negative" />
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                                <p className="text-sm font-semibold text-gray-900">Breakdown Kabel & Material</p>
                                                                <div className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Kabel</span>
                                                                        <span className="font-semibold text-gray-900 [font-variant-numeric:tabular-nums]">
                                                                            {customer.cost_breakdown.cable_used_meter} m x {formatCurrency(customer.cost_breakdown.cable_combined_price_per_meter)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Komponen kabel</span>
                                                                        <span className="text-xs text-gray-500">
                                                                            barang {formatCurrency(customer.cost_breakdown.cable_material_price_per_meter)} + payroll {formatCurrency(customer.cost_breakdown.cable_payroll_price_per_meter)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Total kabel</span>
                                                                        <span className="font-semibold text-gray-900">{formatCurrency(customer.cost_breakdown.cable_total)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Connector</span>
                                                                        <span className="font-semibold text-gray-900">{formatCurrency(customer.cost_breakdown.connector_total)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Router</span>
                                                                        <span className="font-semibold text-gray-900">{formatCurrency(customer.cost_breakdown.router_total)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span>Labor</span>
                                                                        <span className="font-semibold text-gray-900">{formatCurrency(customer.cost_breakdown.labor_fee)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                                <p className="text-sm font-semibold text-gray-900">Invoice Paid</p>
                                                                {(customer.invoices || []).length === 0 ? (
                                                                    <p className="mt-3 text-sm text-gray-500">Belum ada invoice paid pelanggan ini.</p>
                                                                ) : (
                                                                    <div className="mt-3 space-y-2">
                                                                        {customer.invoices.map((invoice) => (
                                                                            <div key={invoice.invoice_id} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                                                                                <div>
                                                                                    <p className="font-semibold text-gray-900">{invoice.invoice_link || `Invoice #${invoice.invoice_id}`}</p>
                                                                                    <p className="text-xs text-gray-500">{invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</p>
                                                                                </div>
                                                                                <span className="font-semibold text-gray-900">{formatCurrency(invoice.amount)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </SectionCard>

                                    <div className="space-y-6">
                                        <SectionCard title="Mapping Wilayah" subtitle="Wilayah dipakai untuk membantu konteks project dan mempermudah pemilihan pelanggan.">
                                            {(selectedDetail.wilayah_mappings || []).length === 0 ? (
                                                <p className="text-sm text-gray-500">Belum ada mapping wilayah.</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedDetail.wilayah_mappings.map((item, index) => (
                                                        <span key={`${item.level}-${item.wilayah_id}-${index}`} className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                                            {item.level} · {item.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </SectionCard>

                                        <SectionCard title="Biaya Manual" subtitle="Tambahan pengeluaran di luar biaya pelanggan.">
                                            {(selectedDetail.manual_expenses || []).length === 0 ? (
                                                <p className="text-sm text-gray-500">Belum ada biaya manual pada project ini.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {selectedDetail.manual_expenses.map((expense) => (
                                                        <div key={expense.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="font-semibold text-gray-900">{expense.name}</p>
                                                                    <p className="mt-1 text-xs text-gray-500">
                                                                        {expense.quantity} {expense.unit || 'unit'} x {formatCurrency(expense.unit_price)}
                                                                        {expense.category ? ` · ${expense.category}` : ''}
                                                                    </p>
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{formatCurrency(expense.subtotal)}</span>
                                                            </div>
                                                            {expense.notes && <p className="mt-2 text-sm leading-6 text-gray-600">{expense.notes}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </SectionCard>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <Modal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingProjectId(null);
                }}
                title={editingProjectId ? 'Pengaturan Project' : 'Project Baru'}
                size="2xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                        Pelanggan yang dipilih akan membawa income dan biaya instalasi masing-masing, mengikuti logika yang sama
                        dengan laporan income pelanggan. Biaya manual dipakai untuk tambahan pengeluaran project.
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-gray-700">Nama Project</span>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                placeholder="Contoh: Project Area Dusun Baru"
                                required
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-gray-700">Status</span>
                            <select
                                value={form.is_active ? '1' : '0'}
                                onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.value === '1' }))}
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="1">Aktif</option>
                                <option value="0">Nonaktif</option>
                            </select>
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-gray-700">Tanggal Mulai</span>
                            <input
                                type="date"
                                value={form.starts_at}
                                onChange={(event) => setForm((prev) => ({ ...prev, starts_at: event.target.value }))}
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-gray-700">Tanggal Selesai</span>
                            <input
                                type="date"
                                value={form.ends_at}
                                onChange={(event) => setForm((prev) => ({ ...prev, ends_at: event.target.value }))}
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </label>
                    </div>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-gray-700">Catatan Project</span>
                        <textarea
                            value={form.notes}
                            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                            className="min-h-[96px] w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Catatan area, target project, atau konteks biaya."
                        />
                    </label>

                    <SectionCard title="Mapping Wilayah" subtitle="Wilayah dipakai sebagai konteks project dan prioritas pemilihan pelanggan.">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <select
                                value={wilayahPicker.level}
                                onChange={(event) => setWilayahPicker({ level: event.target.value, kecamatan_id: '', desa_id: '', wilayah_id: '' })}
                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="kecamatan">Kecamatan</option>
                                <option value="desa">Desa</option>
                                <option value="dusun">Dusun</option>
                            </select>
                            <select
                                value={wilayahPicker.kecamatan_id}
                                onChange={(event) => setWilayahPicker((prev) => ({ ...prev, kecamatan_id: event.target.value, desa_id: '', wilayah_id: event.target.value }))}
                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">Pilih kecamatan</option>
                                {kecamatanOptions.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                            <select
                                value={wilayahPicker.desa_id}
                                onChange={(event) => setWilayahPicker((prev) => ({ ...prev, desa_id: event.target.value, wilayah_id: event.target.value }))}
                                disabled={wilayahPicker.level === 'kecamatan' || !wilayahPicker.kecamatan_id}
                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                            >
                                <option value="">Pilih desa</option>
                                {desaOptions.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                            <div className="flex gap-2">
                                <select
                                    value={wilayahPicker.wilayah_id}
                                    onChange={(event) => setWilayahPicker((prev) => ({ ...prev, wilayah_id: event.target.value }))}
                                    disabled={wilayahPicker.level !== 'dusun' || !wilayahPicker.desa_id}
                                    className="min-w-0 flex-1 rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                                >
                                    <option value="">{wilayahPicker.level === 'dusun' ? 'Pilih dusun' : 'Terisi otomatis'}</option>
                                    {dusunOptions.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={addWilayahMapping}
                                    className="rounded-2xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                                >
                                    Tambah
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {form.wilayah_mappings.length === 0 ? (
                                <span className="text-sm text-gray-500">Belum ada wilayah dipilih.</span>
                            ) : (
                                form.wilayah_mappings.map((item, index) => (
                                    <button
                                        key={`${item.level}-${item.id}-${index}`}
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, wilayah_mappings: prev.wilayah_mappings.filter((_, itemIndex) => itemIndex !== index) }))}
                                        className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                                    >
                                        {item.level} · {item.label}
                                    </button>
                                ))
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard title="Pelanggan Manual" subtitle={`${form.customer_ids.length} pelanggan dipilih untuk membawa pemasukan dan biaya instalasi project.`}>
                        <input
                            type="text"
                            value={customerSearch}
                            onChange={(event) => setCustomerSearch(event.target.value)}
                            className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Cari nama, PPPoE, nomor, atau wilayah pelanggan"
                        />
                        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                            {filteredCustomers.map((customer) => {
                                const checked = form.customer_ids.includes(customer.id);
                                const prioritized = matchesWilayah(customer, form.wilayah_mappings);

                                return (
                                    <label key={customer.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${checked ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleCustomer(customer.id)}
                                            className="mt-1"
                                        />
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900">{customer.name}</p>
                                            <p className="text-xs leading-5 text-gray-500">{customer.pppoe_username || '-'} · {customer.phone || '-'} · {customer.wilayah_label}</p>
                                            <p className={`mt-1 text-[11px] font-semibold ${prioritized ? 'text-blue-700' : 'text-gray-400'}`}>
                                                {prioritized ? 'Prioritas sesuai wilayah project' : 'Tetap boleh dipilih walau di luar wilayah project'}
                                            </p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </SectionCard>

                    <SectionCard title="Biaya Manual" subtitle="Tambahan pengeluaran di luar biaya pelanggan.">
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={addExpenseRow}
                                className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                                Tambah Baris
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            {form.manual_expenses.map((expense, index) => {
                                const subtotal = Number(expense.quantity || 0) * Number(expense.unit_price || 0);

                                return (
                                    <div key={`expense-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                                            <input
                                                type="text"
                                                value={expense.name}
                                                onChange={(event) => updateExpenseRow(index, 'name', event.target.value)}
                                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none xl:col-span-2"
                                                placeholder="Nama barang / biaya"
                                            />
                                            <input
                                                type="text"
                                                value={expense.category}
                                                onChange={(event) => updateExpenseRow(index, 'category', event.target.value)}
                                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Kategori"
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={expense.quantity}
                                                onChange={(event) => updateExpenseRow(index, 'quantity', event.target.value)}
                                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Qty"
                                            />
                                            <input
                                                type="text"
                                                value={expense.unit}
                                                onChange={(event) => updateExpenseRow(index, 'unit', event.target.value)}
                                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Satuan"
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={expense.unit_price}
                                                onChange={(event) => updateExpenseRow(index, 'unit_price', event.target.value)}
                                                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Harga satuan"
                                            />
                                        </div>
                                        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <input
                                                type="text"
                                                value={expense.notes}
                                                onChange={(event) => updateExpenseRow(index, 'notes', event.target.value)}
                                                className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Catatan biaya manual"
                                            />
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-semibold text-gray-900">{formatCurrency(subtotal)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeExpenseRow(index)}
                                                    disabled={form.manual_expenses.length === 1}
                                                    className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Save size={16} />
                            {saving ? 'Menyimpan...' : (editingProjectId ? 'Update Project' : 'Simpan Project')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default ProjectReportPage;

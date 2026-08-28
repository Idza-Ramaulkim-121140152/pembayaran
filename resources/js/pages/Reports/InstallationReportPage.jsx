import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cable, Calendar, ClipboardList, DollarSign, Download, MapPin, Package, Router, Search, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
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

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function defaultDateRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toInput = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    return { start_date: toInput(start), end_date: toInput(end) };
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
                    <p className="mt-2 whitespace-nowrap text-2xl font-bold leading-tight tracking-tight text-gray-900 [font-variant-numeric:tabular-nums]">
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
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    {subtitle && <p className="mt-1 text-sm leading-6 text-gray-500">{subtitle}</p>}
                </div>
                {right}
            </div>
            <div className="mt-4">{children}</div>
        </div>
    );
}

function HealthTile({ label, value, tone = 'slate' }) {
    const toneClass = {
        green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-100 bg-amber-50 text-amber-700',
        red: 'border-rose-100 bg-rose-50 text-rose-700',
        slate: 'border-slate-100 bg-slate-50 text-slate-700',
    }[tone];

    return (
        <div className={`rounded-2xl border p-4 ${toneClass}`}>
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-2 text-2xl font-bold [font-variant-numeric:tabular-nums]">
                {typeof value === 'number' ? value.toLocaleString('id-ID') : (value || 0)}
            </p>
        </div>
    );
}

function InstallationReportPage() {
    const range = defaultDateRange();
    const [filters, setFilters] = useState({
        start_date: range.start_date,
        end_date: range.end_date,
        search: '',
        profit_status: 'all',
        include_estimated: true,
    });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedDetail, setSelectedDetail] = useState(null);

    const fetchReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await reportService.installations(filters);
            setReport(response?.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat laporan pemasangan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, []);

    const summary = report?.summary || {};
    const health = report?.operational_health || {};
    const material = report?.material_efficiency || {};
    const rows = report?.rows || [];
    const visibleRows = useMemo(() => rows.slice(0, 100), [rows]);

    const applyFilters = (event) => {
        event.preventDefault();
        fetchReport();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Laporan</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-900 md:text-3xl">Laporan Pemasangan</h1>
                    <p className="mt-2 max-w-3xl text-gray-600">
                        Pusat evaluasi pemasangan: operasional, biaya material/payroll, pemasukan pemasangan, margin, wilayah, dan kualitas data.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                    <Download size={16} />
                    Cetak
                </button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            <form onSubmit={applyFilters} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1fr_auto_auto]">
                    <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm">
                        <Calendar size={16} className="text-gray-500" />
                        <input
                            type="date"
                            value={filters.start_date}
                            onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
                            className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0"
                        />
                    </label>
                    <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm">
                        <Calendar size={16} className="text-gray-500" />
                        <input
                            type="date"
                            value={filters.end_date}
                            onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
                            className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0"
                        />
                    </label>
                    <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm">
                        <Search size={16} className="text-gray-500" />
                        <input
                            type="search"
                            placeholder="Cari pelanggan, PPPoE, telepon..."
                            value={filters.search}
                            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                            className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0"
                        />
                    </label>
                    <select
                        value={filters.profit_status}
                        onChange={(event) => setFilters((prev) => ({ ...prev, profit_status: event.target.value }))}
                        className="rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="all">Semua status</option>
                        <option value="untung">Untung</option>
                        <option value="rugi">Rugi</option>
                        <option value="impas">Impas</option>
                    </select>
                    <label className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={filters.include_estimated}
                            onChange={(event) => setFilters((prev) => ({ ...prev, include_estimated: event.target.checked }))}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Estimasi
                    </label>
                    <button type="submit" className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                        Terapkan
                    </button>
                </div>
            </form>

            {loading ? (
                <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
                    <LoadingSpinner text="Memuat laporan pemasangan..." />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                        <SummaryCard icon={ClipboardList} title="Total Pemasangan" value={summary.installation_count || 0} subtitle="Berdasarkan tanggal aktivasi" />
                        <SummaryCard icon={DollarSign} title="Pemasukan" value={formatCurrency(summary.installation_income_total)} subtitle={`Fallback fee ${formatCurrency(summary.installation_fee_fallback_total)}`} tone="green" />
                        <SummaryCard icon={Wallet} title="Biaya" value={formatCurrency(summary.installation_cost_total)} subtitle="Kabel + router + connector + labor" tone="red" />
                        <SummaryCard icon={Number(summary.gross_margin_total || 0) >= 0 ? TrendingUp : TrendingDown} title="Margin" value={formatCurrency(summary.gross_margin_total)} subtitle="Pemasukan dikurangi biaya" tone={Number(summary.gross_margin_total || 0) >= 0 ? 'green' : 'red'} />
                        <SummaryCard icon={AlertTriangle} title="Status Dominan" value={summary.dominant_status || 'impas'} subtitle={`${summary.status_counts?.untung || 0} untung · ${summary.status_counts?.rugi || 0} rugi`} tone={summary.dominant_status === 'rugi' ? 'red' : 'green'} />
                        <SummaryCard icon={Package} title="Data Estimasi" value={`${summary.estimated_percent || 0}%`} subtitle={`${summary.estimated_count || 0} pelanggan`} tone={Number(summary.estimated_count || 0) > 0 ? 'amber' : 'green'} />
                    </div>

                    <SectionCard title="Radar Operasional" subtitle="Sinyal cepat untuk mengecek kualitas data dan pekerjaan pemasangan.">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            <HealthTile label="Pemasangan selesai" value={health.completed_installations} tone="green" />
                            <HealthTile label="Belum ada snapshot" value={health.missing_snapshot} tone={health.missing_snapshot > 0 ? 'amber' : 'green'} />
                            <HealthTile label="Data estimasi" value={health.estimated_snapshot} tone={health.estimated_snapshot > 0 ? 'amber' : 'green'} />
                            <HealthTile label="WO belum lengkap" value={health.incomplete_work_order} tone={health.incomplete_work_order > 0 ? 'red' : 'green'} />
                            <HealthTile label="Belum link payroll" value={health.missing_payroll_link} tone={health.missing_payroll_link > 0 ? 'amber' : 'green'} />
                            <HealthTile label="Pemasangan rugi" value={health.loss_installations} tone={health.loss_installations > 0 ? 'red' : 'green'} />
                        </div>
                    </SectionCard>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <SectionCard title="Breakdown Wilayah" subtitle="Wilayah dengan margin terbaik/terburuk dan pemakaian kabel.">
                            <div className="overflow-x-auto rounded-2xl border border-gray-100">
                                <table className="min-w-full divide-y divide-gray-100 text-sm">
                                    <thead className="bg-gray-50 text-left text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3">Wilayah</th>
                                            <th className="px-4 py-3 text-right">Pemasangan</th>
                                            <th className="px-4 py-3 text-right">Biaya Rata-rata</th>
                                            <th className="px-4 py-3 text-right">Margin</th>
                                            <th className="px-4 py-3 text-right">Kabel</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {(report?.by_region || []).slice(0, 8).map((row) => (
                                            <tr key={row.label}>
                                                <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                                                <td className="px-4 py-3 text-right">{row.installation_count}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(row.average_cost)}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${Number(row.gross_margin_total || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(row.gross_margin_total)}</td>
                                                <td className="px-4 py-3 text-right">{Number(row.cable_used_meter_total || 0).toLocaleString('id-ID')} m</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>

                        <SectionCard title="Efisiensi Material" subtitle="Pemakaian kabel, router, connector, dan labor dari pelanggan teraktivasi.">
                            <div className="grid grid-cols-2 gap-3">
                                <HealthTile label="Total kabel" value={`${Number(material.cable_used_meter_total || 0).toLocaleString('id-ID')} m`} tone="slate" />
                                <HealthTile label="Rata-rata kabel" value={`${Number(material.average_cable_meter || 0).toLocaleString('id-ID')} m`} tone="slate" />
                                <HealthTile label="Router dipakai" value={material.router_count} tone="slate" />
                                <HealthTile label="Connector" value={material.connector_quantity_total} tone="slate" />
                            </div>
                            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-sm font-semibold text-gray-900">Kabel tertinggi</p>
                                <div className="mt-3 space-y-2">
                                    {(material.highest_cable_usage_customers || []).map((row) => (
                                        <div key={row.customer_id} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="min-w-0 truncate text-gray-700">{row.customer_name} · {row.region_label}</span>
                                            <span className="whitespace-nowrap font-semibold text-gray-900">{Number(row.cable_used_meter || 0).toLocaleString('id-ID')} m</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    <SectionCard title="Performa Pelaksana" subtitle="Diambil dari payroll project bila terhubung, fallback ke assignee work order, atau Belum terhubung.">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {(report?.by_installer || []).map((row) => (
                                <div key={`${row.source}-${row.label}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-gray-900">{row.label}</p>
                                            <p className="text-xs text-gray-500">{row.source === 'payroll_project' ? 'Payroll project' : row.source === 'work_order' ? 'Work order' : 'Belum terhubung'}</p>
                                        </div>
                                        <Users size={18} className="text-blue-600" />
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-gray-500">Jumlah</p>
                                            <p className="font-bold text-gray-900">{row.installation_count}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Bagian</p>
                                            <p className="font-bold text-gray-900">{formatCurrency(row.payroll_share_total)}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-gray-500">Margin</p>
                                            <p className={`font-bold ${Number(row.gross_margin_total || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(row.gross_margin_total)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard title="Daftar Pemasangan" subtitle={`Menampilkan ${visibleRows.length} dari ${rows.length} pelanggan. Klik baris untuk melihat detail biaya.`}>
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="min-w-full divide-y divide-gray-100 text-sm">
                                <thead className="bg-gray-50 text-left text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Pelanggan</th>
                                        <th className="px-4 py-3">Tanggal</th>
                                        <th className="px-4 py-3">Wilayah</th>
                                        <th className="px-4 py-3 text-right">Pemasukan</th>
                                        <th className="px-4 py-3 text-right">Biaya</th>
                                        <th className="px-4 py-3 text-right">Margin</th>
                                        <th className="px-4 py-3 text-right">Kabel</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {visibleRows.map((row) => (
                                        <tr key={row.customer_id} onClick={() => setSelectedDetail(row.detail_payload)} className="cursor-pointer hover:bg-blue-50/50">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900">{row.customer_name}</p>
                                                <p className="text-xs text-gray-500">{row.pppoe_username || '-'} · {row.package_label || '-'}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">{formatDate(row.activation_date)}</td>
                                            <td className="px-4 py-3 text-gray-700">{row.region_label}</td>
                                            <td className="px-4 py-3 text-right font-medium text-emerald-700">{formatCurrency(row.installation_income_total)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-rose-700">{formatCurrency(row.installation_cost_total)}</td>
                                            <td className={`px-4 py-3 text-right font-bold ${Number(row.gross_margin || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(row.gross_margin)}</td>
                                            <td className="px-4 py-3 text-right">{Number(row.cost_breakdown?.cable_used_meter || 0).toLocaleString('id-ID')} m</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.profit_status)}`}>
                                                    {row.profit_status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}

            <Modal
                isOpen={!!selectedDetail}
                onClose={() => setSelectedDetail(null)}
                title={selectedDetail ? `Detail Pemasangan · ${selectedDetail.customer?.name}` : 'Detail Pemasangan'}
            >
                {selectedDetail && (
                    <div className="space-y-5">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <p className="text-lg font-bold text-gray-900">{selectedDetail.customer?.name}</p>
                                    <p className="text-sm text-gray-500">{selectedDetail.customer?.pppoe_username || '-'} · {selectedDetail.region_label}</p>
                                    <p className="text-sm text-gray-500">Aktivasi: {formatDate(selectedDetail.customer?.activation_date)}</p>
                                </div>
                                <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(selectedDetail.profit_status)}`}>
                                    {selectedDetail.profit_status}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <SummaryCard icon={DollarSign} title="Pemasukan" value={formatCurrency(selectedDetail.installation_income_total)} subtitle={`Fallback customer ${formatCurrency(selectedDetail.installation_fee_fallback)}`} tone="green" />
                            <SummaryCard icon={Wallet} title="Biaya" value={formatCurrency(selectedDetail.installation_cost_total)} tone="red" />
                            <SummaryCard icon={Number(selectedDetail.gross_margin || 0) >= 0 ? TrendingUp : TrendingDown} title="Margin" value={formatCurrency(selectedDetail.gross_margin)} tone={Number(selectedDetail.gross_margin || 0) >= 0 ? 'green' : 'red'} />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-gray-100 p-4">
                                <Cable size={18} className="text-blue-600" />
                                <p className="mt-2 font-semibold text-gray-900">Kabel</p>
                                <p className="text-sm text-gray-600">
                                    {Number(selectedDetail.cost_breakdown?.cable_used_meter || 0).toLocaleString('id-ID')} m x ({formatCurrency(selectedDetail.cost_breakdown?.cable_material_price_per_meter)} barang + {formatCurrency(selectedDetail.cost_breakdown?.cable_payroll_price_per_meter)} payroll)
                                </p>
                                <p className="mt-2 font-bold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.cable_total)}</p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 p-4">
                                <Router size={18} className="text-blue-600" />
                                <p className="mt-2 font-semibold text-gray-900">Router</p>
                                <p className="text-sm text-gray-600">{selectedDetail.cost_breakdown?.router_used ? 'Dipakai' : 'Tidak dipakai'}</p>
                                <p className="mt-2 font-bold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.router_total)}</p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 p-4">
                                <Package size={18} className="text-blue-600" />
                                <p className="mt-2 font-semibold text-gray-900">Connector</p>
                                <p className="text-sm text-gray-600">{selectedDetail.cost_breakdown?.connector_quantity || 0} x {formatCurrency(selectedDetail.cost_breakdown?.connector_unit_price)}</p>
                                <p className="mt-2 font-bold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.connector_total)}</p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 p-4">
                                <Users size={18} className="text-blue-600" />
                                <p className="mt-2 font-semibold text-gray-900">Labor</p>
                                <p className="text-sm text-gray-600">Biaya pasang umum/non-kabel</p>
                                <p className="mt-2 font-bold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.labor_fee)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="font-semibold text-gray-900">Payroll / Pelaksana</p>
                                <p className="mt-1 text-sm text-gray-600">{selectedDetail.payroll_project ? `Payroll project #${selectedDetail.payroll_project.id}` : 'Belum terhubung ke payroll project'}</p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="font-semibold text-gray-900">Work Order</p>
                                <p className="mt-1 text-sm text-gray-600">{selectedDetail.work_order ? `WO #${selectedDetail.work_order.id} · ${selectedDetail.work_order.status} · ${selectedDetail.work_order.assignee_name || 'Belum assign'}` : 'Belum ada work order terhubung'}</p>
                                {selectedDetail.work_order && <p className="mt-1 text-xs text-gray-500">Selesai: {formatDateTime(selectedDetail.work_order.completed_at)}</p>}
                            </div>
                        </div>

                        {selectedDetail.is_estimated && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                {selectedDetail.estimation_notes || 'Sebagian biaya memakai estimasi karena snapshot historis belum lengkap.'}
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default InstallationReportPage;

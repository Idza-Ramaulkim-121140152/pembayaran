import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Clock, CreditCard, Download, ExternalLink, MapPin, Search, ShieldAlert, ShieldCheck, Users, Wallet } from 'lucide-react';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import reportService from '../../services/reportService';

function toDateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

function priorityClass(level) {
    if (level === 'tinggi') return 'border-rose-200 bg-rose-50 text-rose-700';
    if (level === 'sedang') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function isolationClass(isIsolated) {
    return isIsolated
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';
}

function invoiceClass(status) {
    if (status === 'paid') return 'bg-emerald-50 text-emerald-700';
    if (status === 'menunggu konfirmasi') return 'bg-amber-50 text-amber-700';
    if (status === 'unpaid') return 'bg-rose-50 text-rose-700';
    return 'bg-slate-50 text-slate-700';
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
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    <p className="mt-2 whitespace-nowrap text-2xl font-bold leading-tight text-slate-900 [font-variant-numeric:tabular-nums]">{value}</p>
                    {subtitle && <p className="mt-2 text-xs leading-5 text-slate-500">{subtitle}</p>}
                </div>
                <div className={`rounded-2xl p-3 ${tones[tone] || tones.blue}`}>
                    <Icon size={20} />
                </div>
            </div>
        </div>
    );
}

function SectionCard({ title, subtitle, children }) {
    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
                <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

function RadarTile({ label, value, tone = 'slate' }) {
    const classes = {
        blue: 'border-blue-200 bg-blue-50 text-blue-700',
        green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        red: 'border-rose-200 bg-rose-50 text-rose-700',
        slate: 'border-slate-200 bg-slate-50 text-slate-700',
    };

    return (
        <div className={`rounded-2xl border p-4 ${classes[tone] || classes.slate}`}>
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-2 text-2xl font-bold [font-variant-numeric:tabular-nums]">{Number(value || 0).toLocaleString('id-ID')}</p>
        </div>
    );
}

function InactiveCustomerReportPage() {
    const [filters, setFilters] = useState({
        as_of_date: toDateInput(new Date()),
        search: '',
        isolation_status: 'all',
        invoice_status: 'all',
        aging_bucket: 'all',
        sort_by: 'priority_desc',
    });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchReport = async (nextFilters = filters) => {
        setLoading(true);
        setError(null);

        try {
            const response = await reportService.inactiveCustomers(nextFilters);
            setReport(response?.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat laporan pelanggan nonaktif.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const summary = report?.summary || {};
    const radar = report?.radar || {};
    const rows = report?.rows || [];
    const visibleRows = useMemo(() => rows.slice(0, 150), [rows]);

    const applyFilters = (event) => {
        event.preventDefault();
        fetchReport();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-600">Laporan</p>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">Laporan Pelanggan Nonaktif</h1>
                    <p className="mt-2 max-w-3xl text-slate-600">
                        Memantau pelanggan lewat jatuh tempo, membedakan yang sudah isolir dan belum isolir, serta membantu menentukan prioritas follow-up.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                    <Download size={16} />
                    Cetak
                </button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            <form onSubmit={applyFilters} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_auto]">
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm">
                        <Calendar size={16} className="text-slate-500" />
                        <input
                            type="date"
                            value={filters.as_of_date}
                            onChange={(event) => setFilters((prev) => ({ ...prev, as_of_date: event.target.value }))}
                            className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0"
                        />
                    </label>
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm">
                        <Search size={16} className="text-slate-500" />
                        <input
                            type="search"
                            placeholder="Cari nama, PPPoE, telepon, alamat..."
                            value={filters.search}
                            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                            className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0"
                        />
                    </label>
                    <select
                        value={filters.isolation_status}
                        onChange={(event) => setFilters((prev) => ({ ...prev, isolation_status: event.target.value }))}
                        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="all">Semua isolir</option>
                        <option value="isolir">Sudah isolir</option>
                        <option value="belum_isolir">Belum isolir</option>
                    </select>
                    <select
                        value={filters.invoice_status}
                        onChange={(event) => setFilters((prev) => ({ ...prev, invoice_status: event.target.value }))}
                        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="all">Semua invoice</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="menunggu konfirmasi">Menunggu konfirmasi</option>
                        <option value="none">Tanpa invoice</option>
                    </select>
                    <select
                        value={filters.aging_bucket}
                        onChange={(event) => setFilters((prev) => ({ ...prev, aging_bucket: event.target.value }))}
                        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="all">Semua aging</option>
                        <option value="1_3">1-3 hari</option>
                        <option value="4_7">4-7 hari</option>
                        <option value="8_14">8-14 hari</option>
                        <option value="15_30">15-30 hari</option>
                        <option value="30_plus">&gt;30 hari</option>
                    </select>
                    <select
                        value={filters.sort_by}
                        onChange={(event) => setFilters((prev) => ({ ...prev, sort_by: event.target.value }))}
                        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="priority_desc">Prioritas tertinggi</option>
                        <option value="days_overdue_desc">Hari telat terbesar</option>
                        <option value="overdue_amount_desc">Tunggakan terbesar</option>
                        <option value="due_date_asc">Jatuh tempo terlama</option>
                    </select>
                    <button type="submit" className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                        Terapkan
                    </button>
                </div>
            </form>

            {loading ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                    <LoadingSpinner text="Memuat laporan pelanggan nonaktif..." />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                        <SummaryCard icon={Users} title="Lewat Jatuh Tempo" value={summary.customer_count || 0} subtitle={report?.meta?.definition} tone="red" />
                        <SummaryCard icon={ShieldCheck} title="Sudah Isolir" value={summary.isolated_count || 0} subtitle="Layanan sudah masuk status isolir" tone="green" />
                        <SummaryCard icon={ShieldAlert} title="Belum Isolir" value={summary.not_isolated_count || 0} subtitle={`${summary.not_isolated_ratio || 0}% dari overdue`} tone="red" />
                        <SummaryCard icon={Wallet} title="Estimasi Tunggakan" value={formatCurrency(summary.overdue_amount_total)} subtitle="Invoice terbuka belum paid/cancelled" tone="amber" />
                        <SummaryCard icon={Clock} title="Rata-rata Telat" value={`${summary.average_days_overdue || 0} hari`} subtitle="Dari tanggal jatuh tempo pelanggan" tone="blue" />
                        <SummaryCard icon={AlertTriangle} title="Prioritas Tinggi" value={summary.high_priority_count || 0} subtitle="Telat, nominal, dan belum isolir" tone="red" />
                    </div>

                    <SectionCard title="Radar Tindakan" subtitle="Sinyal cepat untuk menentukan pekerjaan penagihan dan isolir.">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            <RadarTile label="Belum isolir" value={radar.not_isolated} tone={radar.not_isolated > 0 ? 'red' : 'green'} />
                            <RadarTile label="Sudah isolir" value={radar.isolated} tone="green" />
                            <RadarTile label="Menunggu konfirmasi" value={radar.pending_confirmation} tone={radar.pending_confirmation > 0 ? 'amber' : 'green'} />
                            <RadarTile label="Telat >30 hari" value={radar.heavy_overdue} tone={radar.heavy_overdue > 0 ? 'red' : 'green'} />
                            <RadarTile label="Ada invoice terbuka" value={radar.with_open_invoice} tone="amber" />
                            <RadarTile label="Tanpa invoice terbuka" value={radar.without_open_invoice} tone={radar.without_open_invoice > 0 ? 'amber' : 'green'} />
                        </div>
                    </SectionCard>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <SectionCard title="Aging Telat" subtitle="Kelompok keterlambatan dari tanggal jatuh tempo pelanggan.">
                            <div className="space-y-3">
                                {(report?.aging || []).map((bucket) => {
                                    const percent = summary.customer_count > 0 ? Math.round((bucket.customer_count / summary.customer_count) * 100) : 0;
                                    return (
                                        <div key={bucket.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-900">{bucket.label}</p>
                                                    <p className="text-xs text-slate-500">{bucket.isolated_count} isolir · {bucket.not_isolated_count} belum isolir</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-slate-900">{bucket.customer_count} pelanggan</p>
                                                    <p className="text-xs text-amber-700">{formatCurrency(bucket.overdue_amount)}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                                                <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, percent)}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        <SectionCard title="Breakdown Wilayah" subtitle="Wilayah dengan risiko tunggakan terbesar.">
                            <div className="overflow-hidden rounded-2xl border border-slate-100">
                                <table className="min-w-full divide-y divide-slate-100 text-sm">
                                    <thead className="bg-slate-50 text-left text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Wilayah</th>
                                            <th className="px-4 py-3 text-right">Pelanggan</th>
                                            <th className="px-4 py-3 text-right">Belum Isolir</th>
                                            <th className="px-4 py-3 text-right">Tunggakan</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {(report?.by_region || []).slice(0, 10).map((region) => (
                                            <tr key={region.label}>
                                                <td className="px-4 py-3 font-medium text-slate-900">{region.label}</td>
                                                <td className="px-4 py-3 text-right text-slate-600">{region.customer_count}</td>
                                                <td className="px-4 py-3 text-right text-rose-600">{region.not_isolated_count}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatCurrency(region.overdue_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </div>

                    <SectionCard title="Daftar Prioritas Tinggi" subtitle="Pelanggan yang paling perlu ditindaklanjuti lebih dulu.">
                        {(report?.priority_rows || []).length === 0 ? (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
                                Tidak ada pelanggan prioritas tinggi pada filter ini.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                {(report?.priority_rows || []).map((row) => (
                                    <div key={row.customer_id} className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate font-bold text-slate-900">{row.customer_name}</p>
                                                <p className="text-sm text-slate-600">{row.pppoe_username || '-'} · {row.phone || '-'}</p>
                                                <p className="mt-1 text-xs text-slate-500">{row.action_hint}</p>
                                            </div>
                                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass(row.priority_level)}`}>
                                                {row.priority_level}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                            <div className="rounded-xl bg-white p-2">
                                                <p className="text-slate-500">Telat</p>
                                                <p className="font-bold text-rose-700">{row.days_overdue} hari</p>
                                            </div>
                                            <div className="rounded-xl bg-white p-2">
                                                <p className="text-slate-500">Tunggakan</p>
                                                <p className="font-bold text-amber-700">{formatCurrency(row.overdue_amount)}</p>
                                            </div>
                                            <div className="rounded-xl bg-white p-2">
                                                <p className="text-slate-500">Isolir</p>
                                                <p className="font-bold text-slate-900">{row.isolation_label}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Daftar Pelanggan Lewat Jatuh Tempo" subtitle={`Menampilkan ${visibleRows.length} dari ${rows.length} pelanggan sesuai filter.`}>
                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                            <table className="min-w-[1180px] divide-y divide-slate-100 text-sm">
                                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Pelanggan</th>
                                        <th className="px-4 py-3">Wilayah</th>
                                        <th className="px-4 py-3">Jatuh Tempo</th>
                                        <th className="px-4 py-3 text-right">Hari Telat</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Invoice</th>
                                        <th className="px-4 py-3 text-right">Tunggakan</th>
                                        <th className="px-4 py-3">Terakhir Bayar</th>
                                        <th className="px-4 py-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {visibleRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-10 text-center text-slate-500">Tidak ada pelanggan sesuai filter.</td>
                                        </tr>
                                    ) : visibleRows.map((row) => (
                                        <tr key={row.customer_id} className="hover:bg-blue-50/40">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-slate-900">{row.customer_name}</p>
                                                <p className="text-xs text-slate-500">{row.pppoe_username || '-'} · {row.phone || '-'}</p>
                                                <p className="text-xs text-slate-400">{row.package_label || '-'}</p>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin size={14} className="text-slate-400" />
                                                    {row.region_label}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{formatDate(row.due_date)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-rose-700">{row.days_overdue}</td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-1">
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${isolationClass(row.is_isolated)}`}>
                                                        {row.isolation_label}
                                                    </span>
                                                    <span className={`block w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass(row.priority_level)}`}>
                                                        Prioritas {row.priority_level}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${invoiceClass(row.invoice_status)}`}>
                                                    {row.invoice_status}
                                                </span>
                                                <p className="mt-1 text-xs text-slate-500">{row.open_invoice_count} invoice terbuka</p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-amber-700">{formatCurrency(row.overdue_amount)}</td>
                                            <td className="px-4 py-3 text-slate-600">{formatDate(row.last_paid_at)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    <a href={`/customers/${row.customer_id}/edit`} className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                                                        Detail
                                                    </a>
                                                    {row.latest_invoice?.invoice_link && (
                                                        <a href={`/invoice/${row.latest_invoice.invoice_link}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                                                            Invoice <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}

export default InactiveCustomerReportPage;

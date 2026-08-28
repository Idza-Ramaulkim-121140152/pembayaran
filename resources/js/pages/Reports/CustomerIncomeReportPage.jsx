import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Cable, Calendar, DollarSign, Package, Router, Save, Search, Settings, TrendingDown, TrendingUp } from 'lucide-react';
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

function SummaryCard({ icon: Icon, title, value, subtitle, tone = 'blue' }) {
    const tones = {
        blue: 'bg-blue-50 text-blue-700',
        green: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
        red: 'bg-rose-50 text-rose-700',
        slate: 'bg-slate-50 text-slate-700',
    };

    return (
        <div className="app-card p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm text-gray-500">{title}</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
                    {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
                </div>
                <div className={`rounded-xl p-3 ${tones[tone] || tones.blue}`}>
                    <Icon size={22} />
                </div>
            </div>
        </div>
    );
}

function statusClass(status) {
    if (status === 'untung') return 'bg-emerald-50 text-emerald-700';
    if (status === 'rugi') return 'bg-rose-50 text-rose-700';
    return 'bg-amber-50 text-amber-700';
}

function CustomerIncomeReportPage() {
    const [tableSearch, setTableSearch] = useState('');
    const [tableFilters, setTableFilters] = useState({
        profit_status: 'all',
        include_estimated: true,
        has_cable_only: true,
    });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [pricingModalOpen, setPricingModalOpen] = useState(false);
    const [pricingLoading, setPricingLoading] = useState(false);
    const [pricingSaving, setPricingSaving] = useState(false);
    const [pricingError, setPricingError] = useState(null);
    const [pricingSuccess, setPricingSuccess] = useState(null);
    const [pricingHistory, setPricingHistory] = useState([]);
    const [pricingMeta, setPricingMeta] = useState({
        labor_fee_default: 0,
        updated_snapshot_count: 0,
    });
    const [pricingForm, setPricingForm] = useState({
        cable_price_per_meter: '1200',
        router_unit_price: '225000',
        apply_scope: 'future_only',
    });

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await reportService.customerIncome(tableFilters);
                if (!cancelled) {
                    setReport(response?.data?.data || null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.message || 'Gagal memuat laporan income pelanggan.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [tableFilters]);

    const summary = report?.summary || {};
    const rows = report?.rows || [];
    const filteredRows = useMemo(() => {
        const search = tableSearch.trim().toLowerCase();
        if (search === '') {
            return rows;
        }

        return rows.filter((row) => {
            const haystack = [
                row.customer_name,
                row.pppoe_username,
                row.phone,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(search);
        });
    }, [rows, tableSearch]);

    const headline = useMemo(() => {
        if (!summary.customer_count) {
            return 'Belum ada pelanggan yang bisa dihitung.';
        }

        return `${summary.customer_count} pelanggan dihitung secara lifetime dari biaya pemasangan vs pemasukan pelanggan.`;
    }, [summary.customer_count]);

    const loadPricing = async () => {
        setPricingLoading(true);
        setPricingError(null);

        try {
            const response = await reportService.installationPricing.get();
            const payload = response?.data?.data || {};
            const active = payload.active || {};

            setPricingForm((prev) => ({
                ...prev,
                cable_price_per_meter: String(active.cable_price_per_meter ?? 1200),
                router_unit_price: String(active.router_unit_price ?? 225000),
            }));
            setPricingHistory(payload.history || []);
            setPricingMeta({
                labor_fee_default: Number(payload.labor_fee_default || 0),
                updated_snapshot_count: Number(payload.updated_snapshot_count || 0),
            });
        } catch (err) {
            setPricingError(err.response?.data?.message || 'Gagal memuat pengaturan harga barang laporan.');
        } finally {
            setPricingLoading(false);
        }
    };

    const openPricingModal = async () => {
        setPricingModalOpen(true);
        setPricingSuccess(null);
        await loadPricing();
    };

    const handlePricingSubmit = async (event) => {
        event.preventDefault();
        setPricingSaving(true);
        setPricingError(null);
        setPricingSuccess(null);

        try {
            const response = await reportService.installationPricing.store({
                cable_price_per_meter: Number(pricingForm.cable_price_per_meter || 0),
                router_unit_price: Number(pricingForm.router_unit_price || 0),
                apply_scope: pricingForm.apply_scope,
            });

            const payload = response?.data?.data || {};
            const active = payload.active || {};

            setPricingForm((prev) => ({
                ...prev,
                cable_price_per_meter: String(active.cable_price_per_meter ?? 1200),
                router_unit_price: String(active.router_unit_price ?? 225000),
            }));
            setPricingHistory(payload.history || []);
            setPricingMeta({
                labor_fee_default: Number(payload.labor_fee_default || 0),
                updated_snapshot_count: Number(payload.updated_snapshot_count || 0),
            });
            setPricingSuccess(response?.data?.message || 'Pengaturan harga barang laporan berhasil disimpan.');

            const refreshed = await reportService.customerIncome(tableFilters);
            setReport(refreshed?.data?.data || null);
        } catch (err) {
            setPricingError(err.response?.data?.message || 'Gagal menyimpan pengaturan harga barang laporan.');
        } finally {
            setPricingSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Laporan Income Pelanggan</h1>
                    <p className="mt-1 text-gray-600">Membandingkan biaya pemasangan rumah pelanggan dengan uang pemasangan dan seluruh invoice yang sudah dibayar.</p>
                </div>
                <button
                    type="button"
                    onClick={openPricingModal}
                    className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                    <Settings size={16} />
                    Pengaturan Harga
                </button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            {loading ? (
                <div className="app-card p-10 text-center">
                    <LoadingSpinner text="Memuat laporan income pelanggan..." />
                </div>
            ) : (
                <>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-blue-900">
                        <p className="font-semibold">Ringkasan lifetime pelanggan</p>
                        <p className="text-sm">{headline}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <SummaryCard icon={BarChart3} title="Pelanggan Terhitung" value={summary.customer_count || 0} subtitle={`${summary.estimated_count || 0} data estimasi`} tone="blue" />
                        <SummaryCard icon={Package} title="Total Biaya Pemasangan" value={formatCurrency(summary.installation_cost_total)} subtitle="Biaya rumah pelanggan yang terbaca sistem" tone="red" />
                        <SummaryCard icon={DollarSign} title="Income Pemasangan" value={formatCurrency(summary.installation_income_total)} subtitle="Uang pemasangan yang sudah tercatat" tone="green" />
                        <SummaryCard icon={TrendingUp} title="Income Invoice" value={formatCurrency(summary.invoice_income_total)} subtitle="Seluruh invoice paid pelanggan" tone="green" />
                        <SummaryCard icon={TrendingUp} title="Total Margin" value={formatCurrency(summary.total_margin)} subtitle="Income pelanggan dikurangi biaya pemasangan" tone={Number(summary.total_margin || 0) >= 0 ? 'green' : 'red'} />
                        <SummaryCard icon={TrendingUp} title="Paling Untung" value={summary.most_profitable_customer?.customer_name || '-'} subtitle={summary.most_profitable_customer ? formatCurrency(summary.most_profitable_customer.gross_margin) : 'Belum ada data'} tone="green" />
                        <SummaryCard icon={TrendingDown} title="Paling Rugi" value={summary.least_profitable_customer?.customer_name || '-'} subtitle={summary.least_profitable_customer ? formatCurrency(summary.least_profitable_customer.gross_margin) : 'Belum ada data'} tone="red" />
                        <SummaryCard icon={AlertTriangle} title="Data Estimasi" value={summary.estimated_count || 0} subtitle="Histori lama yang dibentuk dari data tersedia" tone="amber" />
                    </div>

                    <div className="app-card p-5 space-y-4">
                        <div>
                            <h2 className="font-bold text-gray-900">Profitabilitas per Pelanggan</h2>
                            <p className="text-sm text-gray-500 mt-1">Status untung/rugi dihitung lifetime per pelanggan, bukan bulanan.</p>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-3">
                            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                                <Search size={16} className="text-gray-500" />
                                <input
                                    value={tableSearch}
                                    onChange={(event) => setTableSearch(event.target.value)}
                                    placeholder="Cari pelanggan / PPPoE / nomor HP"
                                    className="w-full border-0 bg-transparent p-0 focus:ring-0"
                                />
                            </label>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <select
                                    value={tableFilters.profit_status}
                                    onChange={(event) => setTableFilters((prev) => ({ ...prev, profit_status: event.target.value }))}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                >
                                    <option value="all">Semua status</option>
                                    <option value="untung">Untung</option>
                                    <option value="rugi">Rugi</option>
                                    <option value="impas">Impas</option>
                                </select>

                                <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={tableFilters.include_estimated}
                                        onChange={(event) => setTableFilters((prev) => ({ ...prev, include_estimated: event.target.checked }))}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Sertakan estimasi
                                </label>

                                <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={tableFilters.has_cable_only}
                                        onChange={(event) => setTableFilters((prev) => ({ ...prev, has_cable_only: event.target.checked }))}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Hanya pelanggan dengan kabel
                                </label>
                            </div>
                        </div>

                        {filteredRows.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                Tidak ada data yang cocok dengan filter saat ini.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Pelanggan</th>
                                            <th className="px-4 py-3 text-left">Aktivasi</th>
                                            <th className="px-4 py-3 text-right">Biaya Pemasangan</th>
                                            <th className="px-4 py-3 text-right">Uang Pemasangan</th>
                                            <th className="px-4 py-3 text-right">Invoice Paid</th>
                                            <th className="px-4 py-3 text-right">Total Pemasukan</th>
                                            <th className="px-4 py-3 text-right">Margin</th>
                                            <th className="px-4 py-3 text-left">Status</th>
                                            <th className="px-4 py-3 text-left">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {filteredRows.map((row) => (
                                            <tr key={row.customer_id}>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold text-gray-900">{row.customer_name}</div>
                                                    <div className="text-xs text-gray-500">{row.pppoe_username || '-'} · {row.phone || '-'}</div>
                                                    {row.is_estimated && (
                                                        <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                                            Estimasi
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top text-gray-700">
                                                    <div className="inline-flex items-center gap-1">
                                                        <Calendar size={14} className="text-gray-400" />
                                                        {formatDate(row.activation_date)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top text-right">
                                                    <div className="font-semibold text-rose-700">{formatCurrency(row.installation_cost_total)}</div>
                                                    <div className="mt-1 text-[11px] text-gray-500">
                                                        <div className="inline-flex items-center gap-1">
                                                            <Cable size={12} />
                                                            Kabel {Number(row.cost_breakdown?.cable_used_meter || 0).toLocaleString('id-ID')} m
                                                        </div>
                                                        <div>Connector {row.cost_breakdown?.connector_quantity || 0}x · Router Ya</div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top text-right text-gray-700">{formatCurrency(row.installation_income_total)}</td>
                                                <td className="px-4 py-3 align-top text-right text-gray-700">{formatCurrency(row.invoice_income_total)}</td>
                                                <td className="px-4 py-3 align-top text-right font-semibold text-emerald-700">{formatCurrency(row.total_customer_income)}</td>
                                                <td className={`px-4 py-3 align-top text-right font-bold ${Number(row.gross_margin || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    {formatCurrency(row.gross_margin)}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(row.profit_status)}`}>
                                                        {row.profit_status}
                                                    </span>
                                                    <div className="mt-2 text-[11px] text-gray-500">
                                                        {row.snapshot_label || 'Snapshot biaya instalasi'}
                                                    </div>
                                                    {row.estimation_notes && (
                                                        <div className="mt-1 text-[11px] text-amber-700">{row.estimation_notes}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedDetail(row.detail_payload || null)}
                                                        className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                                    >
                                                        Detail
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <Modal
                        isOpen={!!selectedDetail}
                        onClose={() => setSelectedDetail(null)}
                        title={`Detail Income Pelanggan${selectedDetail?.customer?.name ? ` · ${selectedDetail.customer.name}` : ''}`}
                        size="2xl"
                    >
                        {selectedDetail && (
                            <div className="space-y-5">
                                <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <p className="text-lg font-bold text-gray-900">{selectedDetail.customer?.name || '-'}</p>
                                        <p className="text-sm text-gray-600">{selectedDetail.customer?.pppoe_username || '-'} · {selectedDetail.customer?.phone || '-'}</p>
                                        <p className="mt-1 text-xs text-gray-500">Aktivasi: {formatDate(selectedDetail.customer?.activation_date)}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(selectedDetail.status)}`}>
                                            {selectedDetail.status}
                                        </span>
                                        {selectedDetail.is_estimated && (
                                            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                                Estimasi
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs text-gray-500">Total Biaya Pemasangan</p>
                                        <p className="mt-2 text-xl font-bold text-rose-700">{formatCurrency(selectedDetail.installation_cost_total)}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs text-gray-500">Total Pemasukan Pelanggan</p>
                                        <p className="mt-2 text-xl font-bold text-emerald-700">{formatCurrency(selectedDetail.total_customer_income)}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs text-gray-500">Total Uang Pemasangan</p>
                                        <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(selectedDetail.installation_income_total)}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs text-gray-500">Total Invoice Paid</p>
                                        <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(selectedDetail.invoice_income_total)}</p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold text-gray-900">Breakdown Biaya Instalasi</h3>
                                            <p className="text-sm text-gray-500">Rincian komponen biaya yang membentuk total pengeluaran pelanggan.</p>
                                        </div>
                                        <p className={`text-lg font-bold ${Number(selectedDetail.gross_margin || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            Margin {formatCurrency(selectedDetail.gross_margin)}
                                        </p>
                                    </div>

                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                            <p className="font-medium text-gray-900">Kabel</p>
                                            <p className="mt-1 text-gray-600">
                                                {Number(selectedDetail.cost_breakdown?.cable_used_meter || 0).toLocaleString('id-ID')} m x ({formatCurrency(selectedDetail.cost_breakdown?.cable_material_price_per_meter || 0)} barang + {formatCurrency(selectedDetail.cost_breakdown?.cable_payroll_price_per_meter || 0)} payroll)
                                            </p>
                                            {selectedDetail.cost_breakdown?.cable_payroll_source === 'inventory_default' && (
                                                <p className="mt-1 text-xs text-amber-700">Payroll memakai default inventori aktif.</p>
                                            )}
                                            <p className="mt-1 text-xs text-gray-500">
                                                Total per meter {formatCurrency(selectedDetail.cost_breakdown?.cable_combined_price_per_meter || 0)}
                                            </p>
                                            <p className="mt-1 font-semibold text-gray-900">Total Kabel {formatCurrency(selectedDetail.cost_breakdown?.cable_total || 0)}</p>
                                        </div>
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                            <p className="font-medium text-gray-900">Connector</p>
                                            <p className="mt-1 text-gray-600">
                                                {Number(selectedDetail.cost_breakdown?.connector_quantity || 0).toLocaleString('id-ID')} x {formatCurrency(selectedDetail.cost_breakdown?.connector_unit_price || 0)}
                                            </p>
                                            <p className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.connector_total || 0)}</p>
                                        </div>
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                            <p className="font-medium text-gray-900">Router</p>
                                            <p className="mt-1 text-gray-600">Dipakai</p>
                                            <p className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.router_total || 0)}</p>
                                        </div>
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                            <p className="font-medium text-gray-900">Labor</p>
                                            <p className="mt-1 text-gray-600">Biaya pasang umum/tenaga kerja di luar payroll kabel per meter</p>
                                            <p className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.cost_breakdown?.labor_fee || 0)}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4">
                                    <h3 className="font-semibold text-gray-900">Daftar Invoice Paid</h3>
                                    <p className="mt-1 text-sm text-gray-500">Pemasukan dari invoice ditampilkan satu per satu untuk pelanggan ini.</p>

                                    {selectedDetail.invoices?.length ? (
                                        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Invoice</th>
                                                        <th className="px-4 py-3 text-left">Tanggal Paid</th>
                                                        <th className="px-4 py-3 text-right">Nominal</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {selectedDetail.invoices.map((invoice) => (
                                                        <tr key={invoice.invoice_id}>
                                                            <td className="px-4 py-3 text-gray-900">{invoice.invoice_link || `#${invoice.invoice_id}`}</td>
                                                            <td className="px-4 py-3 text-gray-700">{formatDateTime(invoice.paid_at)}</td>
                                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(invoice.amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                                            Belum ada invoice paid untuk pelanggan ini.
                                        </div>
                                    )}
                                </div>

                                {selectedDetail.estimation_notes && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                        <p className="font-semibold">{selectedDetail.snapshot_label || 'Catatan estimasi'}</p>
                                        <p className="mt-1">{selectedDetail.estimation_notes}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </Modal>

                    <Modal
                        isOpen={pricingModalOpen}
                        onClose={() => setPricingModalOpen(false)}
                        title="Pengaturan Harga Barang Laporan"
                        size="2xl"
                    >
                        <div className="space-y-5">
                            {pricingError && <Alert type="error" message={pricingError} onClose={() => setPricingError(null)} />}
                            {pricingSuccess && <Alert type="success" message={pricingSuccess} onClose={() => setPricingSuccess(null)} />}

                            {pricingLoading ? (
                                <div className="py-8">
                                    <LoadingSpinner text="Memuat pengaturan harga barang laporan..." />
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                        <p className="font-semibold">Harga barang laporan dipisahkan dari payroll</p>
                                        <p className="mt-1">Form ini hanya mengubah harga barang/material kabel dan router milik perusahaan untuk laporan income pelanggan. Biaya Pasang Payroll dan Tarif Kabel Payroll teknisi pada verifikasi pelanggan tidak ikut berubah.</p>
                                    </div>

                                    <form onSubmit={handlePricingSubmit} className="space-y-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <label className="block">
                                                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700"><Cable size={16} /> Harga Kabel Barang per Meter</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={pricingForm.cable_price_per_meter}
                                                    onChange={(event) => setPricingForm((prev) => ({ ...prev, cable_price_per_meter: event.target.value }))}
                                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                />
                                            </label>

                                            <label className="block">
                                                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700"><Router size={16} /> Harga Router per Unit</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={pricingForm.router_unit_price}
                                                    onChange={(event) => setPricingForm((prev) => ({ ...prev, router_unit_price: event.target.value }))}
                                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                />
                                            </label>
                                        </div>

                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                            <p className="text-sm font-semibold text-gray-900">Cakupan perubahan harga</p>
                                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                                <label className="flex items-start gap-3">
                                                    <input
                                                        type="radio"
                                                        name="apply_scope"
                                                        value="future_only"
                                                        checked={pricingForm.apply_scope === 'future_only'}
                                                        onChange={(event) => setPricingForm((prev) => ({ ...prev, apply_scope: event.target.value }))}
                                                        className="mt-1"
                                                    />
                                                    <span>Berlaku untuk pelanggan berikutnya saja. Snapshot pelanggan lama tidak diubah.</span>
                                                </label>
                                                <label className="flex items-start gap-3">
                                                    <input
                                                        type="radio"
                                                        name="apply_scope"
                                                        value="recalculate_existing"
                                                        checked={pricingForm.apply_scope === 'recalculate_existing'}
                                                        onChange={(event) => setPricingForm((prev) => ({ ...prev, apply_scope: event.target.value }))}
                                                        className="mt-1"
                                                    />
                                                    <span>Terapkan juga ke snapshot pelanggan lama. Harga kabel dan router pada histori laporan akan dihitung ulang.</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                                <p className="text-gray-500">Default labor payroll saat ini</p>
                                                <p className="mt-1 font-semibold text-gray-900">{formatCurrency(pricingMeta.labor_fee_default)}</p>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                                <p className="text-gray-500">Snapshot terakhir dihitung ulang</p>
                                                <p className="mt-1 font-semibold text-gray-900">{Number(pricingMeta.updated_snapshot_count || 0).toLocaleString('id-ID')} pelanggan</p>
                                            </div>
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={pricingSaving}
                                                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Save size={16} />
                                                {pricingSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                                            </button>
                                        </div>
                                    </form>

                                    <div className="rounded-xl border border-gray-200">
                                        <div className="border-b border-gray-200 px-4 py-3">
                                            <p className="font-semibold text-gray-900">Riwayat Harga Barang</p>
                                            <p className="mt-1 text-sm text-gray-500">Connector tetap mengikuti master harga instalasi yang sudah ada.</p>
                                        </div>
                                        <div className="max-h-64 overflow-auto">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Dibuat</th>
                                                        <th className="px-4 py-3 text-right">Kabel</th>
                                                        <th className="px-4 py-3 text-right">Router</th>
                                                        <th className="px-4 py-3 text-left">Oleh</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {pricingHistory.map((row) => (
                                                        <tr key={row.id}>
                                                            <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
                                                            <td className="px-4 py-3 text-right">{formatCurrency(row.cable_price_per_meter)}</td>
                                                            <td className="px-4 py-3 text-right">{formatCurrency(row.router_unit_price)}</td>
                                                            <td className="px-4 py-3">{row.creator?.name || 'Sistem'}</td>
                                                        </tr>
                                                    ))}
                                                    {pricingHistory.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                                                                Belum ada riwayat harga.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </Modal>
                </>
            )}
        </div>
    );
}

export default CustomerIncomeReportPage;

import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Calendar,
    DollarSign,
    Download,
    MapPin,
    Package,
    Percent,
    ReceiptText,
    TrendingDown,
    TrendingUp,
    UserCheck,
    UserX,
    Wallet,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import reportService from '../../services/reportService';

function defaultPreviousMonth() {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

function formatPercent(value) {
    return `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}

function getBudgetStatusClass(status) {
    if (status === 'defisit' || status === 'lewat_budget') return 'bg-red-50 text-red-700';
    if (status === 'waspada') return 'bg-amber-50 text-amber-700';
    if (status === 'unconfigured') return 'bg-slate-50 text-slate-700';
    return 'bg-emerald-50 text-emerald-700';
}

function SummaryCard({ icon: Icon, title, value, subtitle, color = 'blue' }) {
    const colors = {
        blue: 'bg-blue-50 text-blue-700',
        green: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
        red: 'bg-red-50 text-red-700',
        purple: 'bg-purple-50 text-purple-700',
        slate: 'bg-slate-50 text-slate-700',
    };

    return (
        <div className="app-card p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm text-gray-500">{title}</p>
                    <p className="mt-2 whitespace-nowrap text-2xl font-bold tabular-nums text-gray-900">{value}</p>
                    {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
                </div>
                <div className={`rounded-xl p-3 ${colors[color] || colors.blue}`}>
                    <Icon size={22} />
                </div>
            </div>
        </div>
    );
}

function FinancialLine({ label, value, tone = 'default', hint }) {
    const toneClass = {
        default: 'text-gray-900',
        green: 'text-emerald-700',
        red: 'text-rose-700',
        amber: 'text-amber-700',
        slate: 'text-slate-700',
    }[tone] || 'text-gray-900';

    return (
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0">
            <div>
                <p className="text-sm font-medium text-gray-700">{label}</p>
                {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
            </div>
            <p className={`whitespace-nowrap text-right text-base font-bold tabular-nums ${toneClass}`}>
                {formatCurrency(value)}
            </p>
        </div>
    );
}

function FinancialStatementCard({ title, subtitle, rows, footer }) {
    return (
        <div className="app-card p-5">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4">
                {rows.map((row) => (
                    <FinancialLine key={row.label} {...row} />
                ))}
            </div>
            {footer}
        </div>
    );
}

function GroupCards({ title, icon: Icon, rows, valueLabel = 'Total', emptyText = 'Belum ada data.' }) {
    return (
        <div className="app-card p-5">
            <div className="mb-4 flex items-center gap-2">
                <Icon size={18} className="text-blue-600" />
                <h2 className="font-bold text-gray-900">{title}</h2>
            </div>
            {(rows || []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">{emptyText}</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(rows || []).map((row) => (
                        <div key={row.key || row.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                            <p className="mt-2 text-xl font-bold text-gray-900">
                                {row.total !== undefined || row.amount !== undefined
                                    ? formatCurrency(row.total ?? row.amount)
                                    : Number(row.count || 0).toLocaleString('id-ID')}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {(row.customer_count ?? row.count ?? row.invoice_count ?? 0).toLocaleString('id-ID')} data · {valueLabel}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ReportsPage() {
    const [month, setMonth] = useState(defaultPreviousMonth());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await reportService.summary({ month });
            setReport(response?.data?.data || null);
        } catch (err) {
            console.error('Gagal memuat laporan', err);
            setError(err.response?.data?.message || 'Gagal memuat laporan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [month]);

    const summary = report?.summary || {};
    const period = report?.period || {};
    const budgetSummary = report?.budget_summary || null;
    const budgetBreakdown = report?.budget_breakdown || [];
    const loanCashImpact = report?.loan_cash_impact || null;
    const financialStatement = report?.financial_statement || {};
    const incomeStatement = financialStatement.income_statement || {};
    const cashFlow = financialStatement.cash_flow || {};
    const balanceSheet = financialStatement.balance_sheet || {};
    const assets = balanceSheet.assets || {};
    const liabilities = balanceSheet.liabilities || {};
    const equity = balanceSheet.equity || {};
    const receivables = financialStatement.receivables || {};
    const payablesOrLoans = financialStatement.payables_or_loans || {};
    const netProfit = Number(incomeStatement.net_profit_after_adjustment ?? incomeStatement.net_profit ?? 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Laporan Keuangan</h1>
                    <p className="mt-1 text-gray-600">Laba rugi, arus kas, neraca sederhana, dan analitik operasional pendukung.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                        <Calendar size={16} className="text-gray-500" />
                        <input
                            type="month"
                            value={month}
                            onChange={(event) => setMonth(event.target.value)}
                            className="border-0 bg-transparent p-0 focus:ring-0"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                    >
                        <Download size={16} />
                        Cetak
                    </button>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            {loading ? (
                <div className="app-card p-10 text-center">
                    <LoadingSpinner text="Memuat laporan..." />
                </div>
            ) : (
                <>
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="font-semibold text-gray-900">Periode: {period.label || month}</p>
                                <p className="text-sm text-gray-600">Data dihitung dari {formatDate(period.start_date)} sampai {formatDate(period.end_date)}.</p>
                            </div>
                            <span className="inline-flex w-fit rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
                                Basis {financialStatement.basis || 'gabungan'}
                            </span>
                        </div>
                        <p className="mt-3 text-sm text-gray-600">
                            Mutasi menjadi realisasi kas utama. Invoice paid dan piutang tetap ditampilkan sebagai pembanding akrual agar laporan lebih mudah direkonsiliasi.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <SummaryCard icon={DollarSign} title="Pendapatan Kas" value={formatCurrency(incomeStatement.cash_revenue || 0)} subtitle="Mutasi income periode ini" color="green" />
                        <SummaryCard icon={Wallet} title="Total Beban" value={formatCurrency(incomeStatement.total_expense || 0)} subtitle="Operasional + pembelanjaan" color="red" />
                        <SummaryCard icon={netProfit >= 0 ? TrendingUp : TrendingDown} title="Laba/Rugi Bersih" value={formatCurrency(netProfit)} subtitle="Setelah penyesuaian kas" color={netProfit >= 0 ? 'green' : 'red'} />
                        <SummaryCard icon={Wallet} title="Saldo Kas Akhir" value={formatCurrency(cashFlow.ending_cash || 0)} subtitle="Saldo awal + arus kas periode" color="blue" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <FinancialStatementCard
                            title="Laba Rugi"
                            subtitle="Melihat pendapatan, beban, dan hasil bersih periode."
                            rows={[
                                { label: 'Pendapatan kas dari mutasi', value: incomeStatement.cash_revenue, tone: 'green' },
                                { label: 'Invoice paid pembanding akrual', value: incomeStatement.invoice_paid_revenue, hint: 'Tidak menggantikan mutasi kas.' },
                                { label: 'Pendapatan pemasangan', value: incomeStatement.installation_income, tone: 'green' },
                                { label: 'Beban operasional', value: incomeStatement.operational_expense, tone: 'red' },
                                { label: 'Pembelanjaan/inventory', value: incomeStatement.purchase_expense, tone: 'red' },
                                { label: 'Total beban', value: incomeStatement.total_expense, tone: 'red' },
                                { label: 'Laba/rugi bersih', value: netProfit, tone: netProfit >= 0 ? 'green' : 'red', hint: 'Termasuk penyesuaian kas jika ada.' },
                            ]}
                        />

                        <FinancialStatementCard
                            title="Arus Kas"
                            subtitle="Pergerakan kas berdasarkan mutasi sebelum dan selama periode."
                            rows={[
                                { label: 'Saldo awal kas', value: cashFlow.opening_cash },
                                { label: 'Kas masuk periode', value: cashFlow.cash_in, tone: 'green' },
                                { label: 'Kas keluar periode', value: cashFlow.cash_out, tone: 'red' },
                                { label: 'Penyesuaian', value: cashFlow.adjustment, tone: Number(cashFlow.adjustment || 0) >= 0 ? 'green' : 'red' },
                                { label: 'Saldo akhir kas', value: cashFlow.ending_cash, tone: Number(cashFlow.ending_cash || 0) >= 0 ? 'green' : 'red' },
                                { label: 'Dampak pinjaman borrower', value: cashFlow.loan_cash_adjusted_net, hint: 'Informasi pendukung posisi kas riil.' },
                            ]}
                        />

                        <FinancialStatementCard
                            title="Neraca"
                            subtitle="Neraca sederhana untuk aset, kewajiban, dan ekuitas manajerial."
                            rows={[
                                { label: 'Kas akhir', value: assets.cash, tone: 'green' },
                                { label: 'Piutang invoice terbuka', value: assets.receivables, tone: 'amber' },
                                { label: 'Estimasi persediaan', value: assets.inventory_estimated_value },
                                { label: 'Total aset', value: assets.total_assets, tone: 'green' },
                                { label: 'Utang supplier inventory', value: liabilities.inventory_supplier_debt, tone: 'red' },
                                { label: 'Outstanding pinjaman internal', value: liabilities.borrower_internal_debt, tone: 'red' },
                                { label: 'Ekuitas sederhana', value: equity.simple_equity, tone: Number(equity.simple_equity || 0) >= 0 ? 'green' : 'red' },
                            ]}
                        />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <FinancialStatementCard
                            title="Piutang"
                            subtitle={`${receivables.invoice_count || 0} invoice · ${receivables.customer_count || 0} pelanggan sampai akhir periode.`}
                            rows={[
                                { label: 'Total piutang terbuka', value: receivables.total, tone: 'amber' },
                                { label: 'Piutang overdue lama', value: summary.overdue_total, tone: 'red', hint: 'Dari invoice belum lunas/cancelled.' },
                            ]}
                        />

                        <FinancialStatementCard
                            title="Pinjaman/Hutang"
                            subtitle="Kewajiban supplier dan posisi pinjaman internal borrower."
                            rows={[
                                { label: 'Utang supplier inventory', value: payablesOrLoans.inventory_supplier_debt, tone: 'red' },
                                { label: 'Outstanding borrower akhir', value: payablesOrLoans.closing_borrower_outstanding, tone: 'red' },
                                { label: 'Pinjaman borrower baru', value: payablesOrLoans.new_borrower_loans, tone: 'red' },
                                { label: 'Pelunasan borrower', value: payablesOrLoans.borrower_settlements, tone: 'green' },
                            ]}
                        />
                    </div>

                    {(financialStatement.accounting_notes || []).length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                            <p className="font-semibold">Catatan Akuntansi</p>
                            <div className="mt-2 space-y-1">
                                {financialStatement.accounting_notes.map((note) => (
                                    <p key={note}>{note}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-gray-900">Analitik Operasional Pendukung</h2>
                            <p className="mt-1 text-sm text-gray-500">KPI pelanggan, wilayah, churn, pemasangan, dan aging tetap tersedia sebagai lampiran manajerial.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <SummaryCard icon={UserCheck} title="Pelanggan Bayar" value={summary.paid_customer_count || 0} subtitle={`${summary.paid_invoice_count || 0} invoice · ${formatCurrency(summary.paid_total)}`} color="green" />
                            <SummaryCard icon={AlertTriangle} title="Telat/Tidak Bayar" value={summary.overdue_customer_count || 0} subtitle={`${summary.overdue_invoice_count || 0} invoice · ${formatCurrency(summary.overdue_total)}`} color="red" />
                            <SummaryCard icon={Percent} title="Collection Rate" value={formatPercent(summary.collection_rate)} subtitle={`${summary.paid_due_invoice_count || 0}/${summary.due_invoice_count || 0} invoice jatuh tempo lunas`} color="green" />
                            <SummaryCard icon={Package} title="Pemasangan" value={summary.installation_count || 0} subtitle={`Fee customer ${formatCurrency(summary.installation_fee_total)} · Ledger ${formatCurrency(summary.installation_income_total)}`} color="blue" />
                            <SummaryCard icon={UserX} title="Copot Final" value={summary.termination_count || 0} subtitle="Pelanggan nonaktif via verifikasi final" color="amber" />
                            <SummaryCard icon={TrendingUp} title="ARPU" value={formatCurrency(summary.arpu)} subtitle="Rata-rata pembayaran per pelanggan bayar" color="purple" />
                            <SummaryCard icon={Percent} title="Churn Rate" value={formatPercent(summary.churn_rate)} subtitle={`${summary.termination_count || 0}/${summary.active_customer_base || 0} basis pelanggan`} color="amber" />
                            <SummaryCard icon={MapPin} title="Wilayah Overdue Terbesar" value={summary.top_overdue_region?.label || '-'} subtitle={summary.top_overdue_region ? formatCurrency(summary.top_overdue_region.total) : 'Tidak ada overdue'} color="red" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1.85fr] gap-6">
                        <div className="app-card p-5 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <h2 className="font-bold text-gray-900">Budget & Kontrol Anggaran</h2>
                                    <p className="text-sm text-gray-500 mt-1">Section pendukung untuk membandingkan realisasi kas terhadap target budget.</p>
                                </div>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getBudgetStatusClass(budgetSummary?.status)}`}>
                                    {budgetSummary?.status || 'unconfigured'}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Total Budget Inflow</p>
                                    <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(budgetSummary?.total_budget_inflows || 0)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Total Budget Outflow</p>
                                    <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(budgetSummary?.total_budget_outflows || 0)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Realisasi Inflow</p>
                                    <p className="mt-2 text-xl font-bold text-emerald-700">{formatCurrency(budgetSummary?.total_actual_inflows || 0)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Realisasi Outflow</p>
                                    <p className="mt-2 text-xl font-bold text-rose-700">{formatCurrency(budgetSummary?.total_actual_outflows || 0)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Cadangan Kas Minimum</p>
                                    <p className="mt-2 text-xl font-bold text-amber-700">{formatCurrency(budgetSummary?.minimum_cash_reserve_target || 0)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Kas Tersedia Setelah Cadangan</p>
                                    <p className={`mt-2 text-xl font-bold ${Number(budgetSummary?.projected_available_after_reserve || 0) >= 0 ? 'text-cyan-700' : 'text-rose-700'}`}>
                                        {formatCurrency(budgetSummary?.projected_available_after_reserve || 0)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="app-card p-5 space-y-4">
                            <div>
                                <h2 className="font-bold text-gray-900">Realisasi vs Budget per Pos</h2>
                                <p className="text-sm text-gray-500 mt-1">Menunjukkan pos yang aman, waspada, atau sudah melewati budget.</p>
                            </div>
                            {budgetBreakdown.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">Belum ada budget bulanan yang dikonfigurasi untuk periode ini.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Pos</th>
                                                <th className="px-4 py-3 text-right">Budget</th>
                                                <th className="px-4 py-3 text-right">Realisasi</th>
                                                <th className="px-4 py-3 text-right">Forecast</th>
                                                <th className="px-4 py-3 text-right">Deviasi</th>
                                                <th className="px-4 py-3 text-right">Deviasi %</th>
                                                <th className="px-4 py-3 text-left">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {budgetBreakdown.map((row) => (
                                                <tr key={row.category_key}>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(row.budget_amount || 0)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(row.actual_amount || 0)}</td>
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(row.forecast_amount || 0)}</td>
                                                    <td className={`px-4 py-3 text-right font-semibold ${(row.variance_amount || 0) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatCurrency(row.variance_amount || 0)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{formatPercent(row.variance_pct || 0)}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getBudgetStatusClass(row.status)}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="app-card p-5 space-y-4">
                        <div>
                            <h2 className="font-bold text-gray-900">Dampak Pinjaman ke Cash Position</h2>
                            <p className="text-sm text-gray-500 mt-1">Pinjaman dihitung sebagai pengurang kas riil perusahaan.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-xs text-gray-500">Outstanding Awal</p>
                                <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(loanCashImpact?.opening_outstanding || 0)}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-xs text-gray-500">Pinjaman Baru</p>
                                <p className="mt-2 text-xl font-bold text-rose-700">{formatCurrency(loanCashImpact?.new_loans || 0)}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-xs text-gray-500">Pelunasan</p>
                                <p className="mt-2 text-xl font-bold text-emerald-700">{formatCurrency(loanCashImpact?.settlements || 0)}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-xs text-gray-500">Outstanding Akhir</p>
                                <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(loanCashImpact?.closing_outstanding || 0)}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-xs text-gray-500">Dampak Cash Adjusted</p>
                                <p className={`mt-2 text-xl font-bold ${Number(loanCashImpact?.cash_adjusted_net || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {formatCurrency(loanCashImpact?.cash_adjusted_net || 0)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <GroupCards title="Pendapatan per Paket" icon={BarChart3} rows={report?.revenue_by_package} valueLabel="pendapatan" />
                        <GroupCards title="Pembayaran per Wilayah" icon={MapPin} rows={report?.payments_by_region} valueLabel="pembayaran" />
                        <GroupCards title="Pemasangan per Wilayah" icon={Package} rows={report?.installations_by_region} valueLabel="fee pemasangan" />
                        <GroupCards title="Nonaktif/Copot per Wilayah" icon={UserX} rows={report?.inactive_by_region} valueLabel="pelanggan copot" />
                        <GroupCards title="Aging Piutang Overdue" icon={AlertTriangle} rows={summary.overdue_aging} valueLabel="piutang" />
                        <GroupCards title="Pembelanjaan" icon={ReceiptText} rows={report?.purchases} valueLabel="pembelanjaan" />
                        <GroupCards title="Pengeluaran Operasional" icon={Wallet} rows={report?.expenses} valueLabel="pengeluaran" />
                    </div>
                </>
            )}
        </div>
    );
}

export default ReportsPage;

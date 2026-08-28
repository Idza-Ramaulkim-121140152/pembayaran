import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    FileWarning,
    Link2,
    RefreshCw,
    ShieldAlert,
    XCircle,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import reconciliationCenterService from '../../services/reconciliationCenterService';

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function SummaryCard({ icon: Icon, title, value, subtitle, tone = 'blue' }) {
    const tones = {
        blue: 'border-blue-100 bg-blue-50 text-blue-800',
        amber: 'border-amber-100 bg-amber-50 text-amber-800',
        red: 'border-rose-100 bg-rose-50 text-rose-800',
        green: 'border-emerald-100 bg-emerald-50 text-emerald-800',
        slate: 'border-slate-200 bg-slate-50 text-slate-800',
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

function FilterGroup({ title, items, activeValues, onToggle }) {
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <div className="flex flex-wrap gap-2">
                {items.map((item) => {
                    const active = activeValues.includes(item.value);
                    return (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => onToggle(item.value)}
                            className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                active
                                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function getSeverityMeta(severity) {
    if (severity === 'critical') return { label: 'Kritis', className: 'bg-rose-100 text-rose-700' };
    if (severity === 'high') return { label: 'Tinggi', className: 'bg-orange-100 text-orange-700' };
    if (severity === 'low') return { label: 'Rendah', className: 'bg-slate-100 text-slate-700' };
    return { label: 'Sedang', className: 'bg-amber-100 text-amber-700' };
}

function getStatusMeta(status) {
    if (status === 'resolved') return { label: 'Resolved', className: 'bg-emerald-100 text-emerald-700' };
    if (status === 'ignored') return { label: 'Ignored', className: 'bg-slate-100 text-slate-700' };
    if (status === 'in_review') return { label: 'In Review', className: 'bg-blue-100 text-blue-700' };
    return { label: 'Open', className: 'bg-rose-100 text-rose-700' };
}

function actionLabel(action) {
    return {
        rerun_match: 'Re-run Matching',
        approve_top_candidate: 'Approve Top Candidate',
        reject_capture: 'Reject Capture',
        resync_invoice_ledger: 'Resync Invoice Ledger',
        resync_pengeluaran_ledger: 'Resync Pengeluaran Ledger',
    }[action] || action;
}

function laneLabel(sourceGroup) {
    return {
        invoice_receipts: 'Penerimaan Invoice',
        ledger_vs_source: 'Ledger vs Sumber',
        action_required: 'Perlu Tindakan',
    }[sourceGroup] || 'Perlu Tindakan';
}

export default function ReconciliationCenterPage() {
    const [summary, setSummary] = useState(null);
    const [issues, setIssues] = useState([]);
    const [meta, setMeta] = useState({ filters: { statuses: [], severities: [], source_groups: [], issue_types: [] } });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filters, setFilters] = useState({
        status: ['open', 'in_review'],
        severity: [],
        source_group: [],
        issue_type: [],
    });

    const loadData = async ({ runRefresh = false } = {}) => {
        try {
            setError('');
            if (runRefresh) {
                setRefreshing(true);
                await reconciliationCenterService.refresh();
            } else {
                setLoading(true);
            }

            const params = {
                ...filters,
            };

            const [summaryResponse, issuesResponse] = await Promise.all([
                reconciliationCenterService.summary(params),
                reconciliationCenterService.issues(params),
            ]);

            setSummary(summaryResponse.data?.data || null);
            setIssues(issuesResponse.data?.data?.data || []);
            setMeta(issuesResponse.data?.data?.meta || { filters: { statuses: [], severities: [], source_groups: [], issue_types: [] } });
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memuat Reconciliation Center.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData({ runRefresh: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!loading) {
            loadData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(filters)]);

    const lanes = useMemo(() => {
        const groups = {
            invoice_receipts: [],
            ledger_vs_source: [],
            action_required: [],
        };

        issues.forEach((issue) => {
            const key = issue.source_group || 'action_required';
            if (!groups[key]) groups[key] = [];
            groups[key].push(issue);
        });

        return groups;
    }, [issues]);

    const toggleFilter = (key, value) => {
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

    const handleStatusUpdate = async (issueId, status) => {
        try {
            setError('');
            await reconciliationCenterService.updateStatus(issueId, { status });
            setSuccess('Status issue berhasil diperbarui.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memperbarui status issue.');
        }
    };

    const handleAction = async (issue, action) => {
        try {
            setError('');
            await reconciliationCenterService.performAction(issue.id, action);
            setSuccess(`Aksi ${actionLabel(action)} berhasil dijalankan.`);
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal menjalankan aksi rekonsiliasi.');
        }
    };

    const renderLane = (sourceGroupKey) => {
        const rows = lanes[sourceGroupKey] || [];

        return (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">{laneLabel(sourceGroupKey)}</h2>
                        <p className="text-sm text-slate-500">{rows.length} issue pada lane ini.</p>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        Tidak ada issue pada lane ini.
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        {rows.map((issue) => {
                            const severity = getSeverityMeta(issue.severity);
                            const status = getStatusMeta(issue.status);

                            return (
                                <div
                                    key={issue.id}
                                    className={`rounded-2xl border p-4 ${
                                        issue.severity === 'critical'
                                            ? 'border-rose-200 bg-rose-50/40'
                                            : issue.severity === 'high'
                                                ? 'border-orange-200 bg-orange-50/30'
                                                : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap gap-2">
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severity.className}`}>{severity.label}</span>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                    {issue.issue_type}
                                                </span>
                                            </div>

                                            <div>
                                                <h3 className="text-lg font-semibold text-slate-900">{issue.title}</h3>
                                                <p className="mt-1 text-sm text-slate-600">{issue.description}</p>
                                            </div>

                                            <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-3">
                                                <p><span className="font-medium text-slate-900">Nominal:</span> {formatCurrency(issue.amount)}</p>
                                                <p><span className="font-medium text-slate-900">Kejadian:</span> {formatDate(issue.occurred_at)}</p>
                                                <p><span className="font-medium text-slate-900">Terdeteksi:</span> {formatDateTime(issue.detected_at)}</p>
                                                <p><span className="font-medium text-slate-900">Aging:</span> {issue.age_days} hari</p>
                                                <p><span className="font-medium text-slate-900">Entity:</span> {issue.primary_entity_type || '-'} #{issue.primary_entity_id || '-'}</p>
                                                <p><span className="font-medium text-slate-900">Lane:</span> {issue.source_group_label}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-start gap-2 xl:items-end">
                                            <div className="flex flex-wrap gap-2 xl:justify-end">
                                                {issue.available_actions.map((action) => (
                                                    <Button
                                                        key={action}
                                                        size="sm"
                                                        variant={action.includes('resync') ? 'warning' : 'secondary'}
                                                        onClick={() => handleAction(issue, action)}
                                                    >
                                                        {actionLabel(action)}
                                                    </Button>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-2 xl:justify-end">
                                                {issue.source_url ? (
                                                    <a
                                                        href={issue.source_url}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        <Link2 size={14} />
                                                        Buka Sumber
                                                    </a>
                                                ) : null}
                                                {issue.status !== 'in_review' ? (
                                                    <Button size="sm" variant="secondary" onClick={() => handleStatusUpdate(issue.id, 'in_review')}>
                                                        In Review
                                                    </Button>
                                                ) : null}
                                                {issue.status !== 'resolved' ? (
                                                    <Button size="sm" variant="success" onClick={() => handleStatusUpdate(issue.id, 'resolved')}>
                                                        Resolved
                                                    </Button>
                                                ) : null}
                                                {issue.status !== 'ignored' ? (
                                                    <Button size="sm" variant="ghost" onClick={() => handleStatusUpdate(issue.id, 'ignored')}>
                                                        Ignore
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Reconciliation Center</h1>
                    <p className="mt-1 text-slate-600">
                        Workspace untuk memastikan ledger, invoice, pengeluaran, dan payment capture tetap sinkron sebelum dipakai untuk prediksi dan laporan.
                    </p>
                </div>
                <Button variant="secondary" onClick={() => loadData({ runRefresh: true })} disabled={refreshing}>
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    Refresh Issue
                </Button>
            </div>

            {error ? <Alert type="error" message={error} onClose={() => setError('')} /> : null}
            {success ? <Alert type="success" message={success} onClose={() => setSuccess('')} /> : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <SummaryCard icon={FileWarning} title="Issue Open" value={summary?.total_open || 0} subtitle="Belum selesai" tone="red" />
                <SummaryCard icon={ShieldAlert} title="Issue Kritis" value={summary?.critical_open || 0} subtitle="Perlu prioritas" tone="red" />
                <SummaryCard icon={AlertTriangle} title="Nilai Terdampak" value={formatCurrency(summary?.affected_amount_open || 0)} subtitle="Nominal issue open" tone="amber" />
                <SummaryCard icon={Clock3} title="Aging > 3 Hari" value={summary?.overdue_over_3_days_open || 0} subtitle="Open lebih dari 3 hari" tone="amber" />
                <SummaryCard icon={CheckCircle2} title="Capture Review" value={summary?.capture_review_open || 0} subtitle="Invoice receipt lane" tone="blue" />
                <SummaryCard icon={XCircle} title="Ledger Mismatch" value={summary?.ledger_source_mismatch_open || 0} subtitle="Ledger vs sumber" tone="slate" />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Filter Issue</h2>
                    <p className="text-sm text-slate-500">Gunakan filter ini untuk fokus ke mismatch yang paling penting terlebih dahulu.</p>
                </div>

                <FilterGroup
                    title="Status"
                    items={meta.filters?.statuses || []}
                    activeValues={filters.status}
                    onToggle={(value) => toggleFilter('status', value)}
                />
                <FilterGroup
                    title="Severity"
                    items={meta.filters?.severities || []}
                    activeValues={filters.severity}
                    onToggle={(value) => toggleFilter('severity', value)}
                />
                <FilterGroup
                    title="Lane"
                    items={meta.filters?.source_groups || []}
                    activeValues={filters.source_group}
                    onToggle={(value) => toggleFilter('source_group', value)}
                />
                <FilterGroup
                    title="Tipe Issue"
                    items={meta.filters?.issue_types || []}
                    activeValues={filters.issue_type}
                    onToggle={(value) => toggleFilter('issue_type', value)}
                />
            </div>

            {loading ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                    Memuat data rekonsiliasi...
                </div>
            ) : (
                <div className="space-y-6">
                    {renderLane('invoice_receipts')}
                    {renderLane('ledger_vs_source')}
                    {renderLane('action_required')}
                </div>
            )}
        </div>
    );
}

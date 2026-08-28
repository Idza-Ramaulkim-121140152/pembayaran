import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCcw, Shield } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import systemActivityLogService from '../../services/systemActivityLogService';
import accessControlService from '../../services/accessControlService';

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function badgeClass(eventType) {
    if ((eventType || '').startsWith('auth.')) {
        return 'bg-emerald-100 text-emerald-700';
    }
    if ((eventType || '').startsWith('access_policy.')) {
        return 'bg-amber-100 text-amber-700';
    }
    if (eventType === 'activity.account_action') {
        return 'bg-rose-100 text-rose-700';
    }
    if (eventType === 'activity.page_view') {
        return 'bg-sky-100 text-sky-700';
    }
    return 'bg-slate-100 text-slate-700';
}

export default function SystemActivityLogsPage() {
    const isSuperAdmin = (window.appUserRole || '') === 'superadmin';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [eventTypes, setEventTypes] = useState([]);
    const [users, setUsers] = useState([]);
    const [detailLog, setDetailLog] = useState(null);
    const [filters, setFilters] = useState({
        actor_id: '',
        event_type: '',
        method: '',
        status_code: '',
        search: '',
        per_page: 30,
        page: 1,
    });

    const activeFilterSummary = useMemo(() => {
        const rows = [];
        if (filters.actor_id) rows.push('akun');
        if (filters.event_type) rows.push('event');
        if (filters.method) rows.push('method');
        if (filters.status_code) rows.push('status');
        if (filters.search) rows.push('pencarian');
        return rows.join(', ');
    }, [filters]);

    const loadUsers = async () => {
        const response = await accessControlService.users();
        setUsers(Array.isArray(response?.data?.data) ? response.data.data : []);
    };

    const loadLogs = async (nextFilters = filters) => {
        try {
            setLoading(true);
            setError(null);
            const response = await systemActivityLogService.list(nextFilters);
            setLogs(response?.data?.data?.data || []);
            setPagination(response?.data?.data || null);
            setEventTypes(response?.data?.meta?.event_types || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat log aktivitas sistem.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isSuperAdmin) return;
        Promise.all([loadUsers(), loadLogs(filters)]).catch(() => {
            setError('Gagal memuat data log aktivitas.');
            setLoading(false);
        });
    }, []);

    const applyFilters = async (event) => {
        event.preventDefault();
        const nextFilters = { ...filters, page: 1 };
        setFilters(nextFilters);
        await loadLogs(nextFilters);
    };

    const resetFilters = async () => {
        const nextFilters = {
            actor_id: '',
            event_type: '',
            method: '',
            status_code: '',
            search: '',
            per_page: 30,
            page: 1,
        };
        setFilters(nextFilters);
        await loadLogs(nextFilters);
    };

    const goToPage = async (page) => {
        const nextFilters = { ...filters, page };
        setFilters(nextFilters);
        await loadLogs(nextFilters);
    };

    if (!isSuperAdmin) {
        return <Alert type="warning" message="Menu log aktivitas hanya tersedia untuk superadmin." />;
    }

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_38%),linear-gradient(135deg,#ffffff,#f8fafc)] p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white">
                            <Shield className="h-3.5 w-3.5" />
                            Audit Superadmin
                        </div>
                        <h1 className="mt-3 text-2xl font-bold text-slate-900">Log Aktivitas Akun</h1>
                        <p className="mt-2 max-w-3xl text-sm text-slate-600">
                            Semua aktivitas akun staff, perubahan yang dilakukan user, login/logout, kunjungan halaman, dan aksi API penting tercatat di sini.
                        </p>
                    </div>
                    <Button type="button" onClick={() => loadLogs(filters)} className="inline-flex items-center gap-2">
                        <RefreshCcw className="h-4 w-4" />
                        Muat Ulang
                    </Button>
                </div>
            </div>

            <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6">
                <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Cari</label>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                        placeholder="event, path, route, nama user"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Akun</label>
                    <select
                        value={filters.actor_id}
                        onChange={(e) => setFilters((prev) => ({ ...prev, actor_id: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Semua akun</option>
                        {users.map((user) => (
                            <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Event</label>
                    <select
                        value={filters.event_type}
                        onChange={(e) => setFilters((prev) => ({ ...prev, event_type: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Semua event</option>
                        {eventTypes.map((eventType) => (
                            <option key={eventType} value={eventType}>{eventType}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Method</label>
                    <select
                        value={filters.method}
                        onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Semua method</option>
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                            <option key={method} value={method}>{method}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
                    <input
                        type="number"
                        value={filters.status_code}
                        onChange={(e) => setFilters((prev) => ({ ...prev, status_code: e.target.value }))}
                        placeholder="200"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                </div>
                <div className="md:col-span-6 flex flex-wrap items-center gap-2 pt-1">
                    <Button type="submit">Terapkan Filter</Button>
                    <Button type="button" variant="secondary" onClick={resetFilters}>Reset</Button>
                    {activeFilterSummary && (
                        <span className="text-xs text-slate-500">Filter aktif: {activeFilterSummary}</span>
                    )}
                </div>
            </form>

            {error && <Alert type="error" message={error} />}

            {loading ? (
                <LoadingSpinner text="Memuat log aktivitas..." />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Waktu</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Akun</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Event</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Rute</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                            Belum ada log yang cocok dengan filter ini.
                                        </td>
                                    </tr>
                                )}
                                {logs.map((log) => (
                                    <tr key={log.id} className="align-top">
                                        <td className="px-4 py-3 text-slate-700">{formatDateTime(log.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{log.actor?.name || 'Sistem / Tidak diketahui'}</div>
                                            <div className="text-xs text-slate-500">{log.actor?.email || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(log.event_type)}`}>
                                                {log.event_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            <div className="font-medium">{log.method || '-'}</div>
                                            <div className="text-xs text-slate-500 break-all">{log.path || log.route_name || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{log.status_code || '-'}</td>
                                        <td className="px-4 py-3">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => setDetailLog(log)}
                                                className="inline-flex items-center gap-2"
                                            >
                                                <Eye className="h-4 w-4" />
                                                Detail
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {pagination && pagination.last_page > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
                            <div className="text-slate-500">
                                Menampilkan {pagination.from || 0}-{pagination.to || 0} dari {pagination.total || 0} log
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={!pagination.prev_page_url}
                                    onClick={() => goToPage((pagination.current_page || 1) - 1)}
                                >
                                    Sebelumnya
                                </Button>
                                <span className="text-slate-600">Halaman {pagination.current_page} / {pagination.last_page}</span>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={!pagination.next_page_url}
                                    onClick={() => goToPage((pagination.current_page || 1) + 1)}
                                >
                                    Berikutnya
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Modal
                isOpen={Boolean(detailLog)}
                onClose={() => setDetailLog(null)}
                title="Detail Log Aktivitas"
                theme="dashboard"
            >
                {detailLog && (
                    <div className="space-y-4 text-sm text-slate-700">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">Event</div>
                                <div className="font-medium text-slate-900">{detailLog.event_type}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">Waktu</div>
                                <div className="font-medium text-slate-900">{formatDateTime(detailLog.created_at)}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">Akun</div>
                                <div className="font-medium text-slate-900">{detailLog.actor?.name || 'Sistem / Tidak diketahui'}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">HTTP</div>
                                <div className="font-medium text-slate-900">{detailLog.method || '-'} {detailLog.path || '-'}</div>
                            </div>
                        </div>
                        <div>
                            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Payload</div>
                            <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                                {JSON.stringify(detailLog.payload || {}, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

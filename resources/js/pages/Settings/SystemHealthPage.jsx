import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, RefreshCw, Server, XCircle } from 'lucide-react';

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

function statusClass(status) {
    if (status === 'healthy') return 'bg-green-50 text-green-700 border-green-100';
    if (status === 'degraded') return 'bg-amber-50 text-amber-700 border-amber-100';
    if (status === 'down') return 'bg-red-50 text-red-700 border-red-100';
    return 'bg-slate-50 text-slate-700 border-slate-100';
}

function statusIcon(status) {
    if (status === 'healthy') return CheckCircle;
    if (status === 'down') return XCircle;
    return AlertTriangle;
}

export default function SystemHealthPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);

    const fetchHealth = async () => {
        try {
            setError(null);
            const response = await fetch('/api/system-health', { headers: { Accept: 'application/json' } });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Gagal memuat system health.');
            setData(result.data);
        } catch (err) {
            setError(err.message || 'Gagal memuat system health.');
        } finally {
            setLoading(false);
        }
    };

    const runCheck = async () => {
        try {
            setChecking(true);
            setError(null);
            const response = await fetch('/api/system-health/check-now', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify({}),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Gagal menjalankan health check.');
            setData(result.data);
        } catch (err) {
            setError(err.message || 'Gagal menjalankan health check.');
        } finally {
            setChecking(false);
        }
    };

    useEffect(() => {
        fetchHealth();
    }, []);

    if (loading) {
        return <div className="rounded-xl bg-white p-8 text-center text-gray-500">Memuat system health...</div>;
    }

    const checks = data?.checks || [];
    const heartbeats = data?.scheduler_heartbeats || [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
                        <Server className="text-indigo-500" />
                        System Health
                    </h1>
                    <p className="mt-1 text-gray-500">Observability internal: uptime, queue, scheduler, backup, WA, MikroTik.</p>
                </div>
                <button
                    type="button"
                    onClick={runCheck}
                    disabled={checking}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
                    {checking ? 'Checking...' : 'Check Now'}
                </button>
            </div>

            {error && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-700">{error}</div>}

            <section className={`rounded-2xl border p-5 ${statusClass(data?.status)}`}>
                <p className="text-sm font-semibold uppercase tracking-[0.2em]">Overall Status</p>
                <h2 className="mt-2 text-3xl font-bold">{data?.status || 'unknown'}</h2>
                <p className="mt-2 text-sm">
                    Healthy {data?.summary?.healthy || 0} · Degraded {data?.summary?.degraded || 0} · Down {data?.summary?.down || 0}
                </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {checks.map((check) => {
                    const Icon = statusIcon(check.status);
                    return (
                        <div key={check.check_key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-gray-900">{check.label}</p>
                                    <p className="mt-1 text-sm text-gray-500">{check.message || '-'}</p>
                                </div>
                                <span className={`rounded-full border p-2 ${statusClass(check.status)}`}>
                                    <Icon size={18} />
                                </span>
                            </div>
                            <p className="mt-4 text-xs text-gray-400">Checked: {check.checked_at ? new Date(check.checked_at).toLocaleString('id-ID') : '-'}</p>
                        </div>
                    );
                })}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                    <Activity size={20} className="text-indigo-500" />
                    Scheduler Heartbeats
                </h2>
                <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-gray-500">
                                <th className="py-2 pr-4">Command</th>
                                <th className="py-2 pr-4">Status</th>
                                <th className="py-2 pr-4">Last Finished</th>
                                <th className="py-2 pr-4">Duration</th>
                                <th className="py-2 pr-4">Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {heartbeats.map((row) => (
                                <tr key={row.command} className="border-b last:border-0">
                                    <td className="py-2 pr-4 font-medium text-gray-900">{row.command}</td>
                                    <td className="py-2 pr-4">{row.status}</td>
                                    <td className="py-2 pr-4">{row.last_finished_at ? new Date(row.last_finished_at).toLocaleString('id-ID') : '-'}</td>
                                    <td className="py-2 pr-4">{row.last_duration_ms ? `${row.last_duration_ms} ms` : '-'}</td>
                                    <td className="py-2 pr-4 text-gray-500">{row.message || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {heartbeats.length === 0 && <p className="py-6 text-center text-gray-500">Belum ada heartbeat.</p>}
                </div>
            </section>
        </div>
    );
}

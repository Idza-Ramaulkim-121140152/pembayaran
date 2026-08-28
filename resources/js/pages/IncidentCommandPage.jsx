import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert } from 'lucide-react';

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

export default function IncidentCommandPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchIncidents = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/network-incidents?per_page=50', { headers: { Accept: 'application/json' } });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Gagal memuat incident.');
            setItems(result.data?.data || []);
        } catch (err) {
            setError(err.message || 'Gagal memuat incident.');
        } finally {
            setLoading(false);
        }
    };

    const action = async (incident, type) => {
        const note = type === 'resolve'
            ? window.prompt('Alasan resolve incident:', 'Gangguan sudah pulih.')
            : window.prompt('Catatan tindakan:', '');
        if (note === null) return;

        try {
            const endpoint = type === 'resolve'
                ? `/api/network-incidents/${incident.id}/resolve`
                : `/api/network-incidents/${incident.id}/${type}`;
            const body = type === 'resolve' ? { reason: note } : { note };
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Aksi incident gagal.');
            fetchIncidents();
        } catch (err) {
            setError(err.message || 'Aksi incident gagal.');
        }
    };

    useEffect(() => {
        fetchIncidents();
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
                        <ShieldAlert className="text-red-500" />
                        Incident Command Center
                    </h1>
                    <p className="mt-1 text-gray-500">Acknowledge, escalate, mitigate, resolve, dan pantau MTTA/MTTR.</p>
                </div>
                <button onClick={fetchIncidents} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50">
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            {error && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-700">{error}</div>}
            {loading ? (
                <div className="rounded-xl bg-white p-8 text-center text-gray-500">Memuat incident...</div>
            ) : (
                <div className="grid gap-4">
                    {items.map((incident) => {
                        const meta = incident.meta || {};
                        const isResolved = incident.status === 'resolved';
                        return (
                            <div key={incident.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{incident.severity}</span>
                                            <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{incident.status}</span>
                                        </div>
                                        <h2 className="mt-3 text-xl font-bold text-gray-900">{incident.title}</h2>
                                        <p className="mt-1 text-sm text-gray-500">
                                            Mulai: {incident.started_at ? new Date(incident.started_at).toLocaleString('id-ID') : '-'} · ODP: {(incident.odps || []).map((odp) => odp.nama).join(', ') || '-'}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-600">
                                            MTTA: {meta.mtta_minutes ?? '-'} menit · MTTR: {meta.mttr_minutes ?? '-'} menit
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {!isResolved && incident.status === 'open' && <button onClick={() => action(incident, 'acknowledge')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">Acknowledge</button>}
                                        {!isResolved && ['open', 'acknowledged'].includes(incident.status) && <button onClick={() => action(incident, 'escalate')} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white">Escalate</button>}
                                        {!isResolved && ['open', 'acknowledged', 'escalated'].includes(incident.status) && <button onClick={() => action(incident, 'mitigate')} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">Mitigate</button>}
                                        {!isResolved && <button onClick={() => action(incident, 'resolve')} className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white">Resolve</button>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {items.length === 0 && (
                        <div className="rounded-xl bg-white p-8 text-center text-gray-500">
                            <CheckCircle className="mx-auto mb-3 text-green-500" />
                            Tidak ada incident.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

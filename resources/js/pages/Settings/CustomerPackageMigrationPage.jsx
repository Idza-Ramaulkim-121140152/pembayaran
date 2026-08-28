import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Play, RefreshCw, Search } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import customerPackageMigrationService from '../../services/customerPackageMigrationService';
import masterMikrotikService from '../../services/masterMikrotikService';

const SUMMARY_ITEMS = [
    ['total_pelanggan', 'Pelanggan'],
    ['profile_akan_dibuat', 'Profile dibuat'],
    ['profile_sudah_ada', 'Profile ada'],
    ['secret_akan_dibuat', 'Secret dibuat'],
    ['secret_sudah_ada_konflik', 'Secret konflik'],
    ['data_kosong', 'Data kosong'],
    ['gagal_validasi', 'Gagal'],
];

const STATUS_LABELS = {
    will_create: 'Akan dibuat',
    exists: 'Sudah ada',
    created: 'Dibuat',
    empty: 'Kosong',
    failed: 'Gagal',
    conflict_exists: 'Konflik',
    empty_username: 'Username kosong',
    skipped: 'Dilewati',
};

function statusClass(status) {
    if (['created', 'exists'].includes(status)) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (['will_create'].includes(status)) {
        return 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (['conflict_exists', 'empty', 'empty_username', 'skipped'].includes(status)) {
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (status === 'failed') {
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }

    return 'bg-slate-50 text-slate-700 border-slate-200';
}

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>
            {STATUS_LABELS[status] || status || '-'}
        </span>
    );
}

function CustomerPackageMigrationPage() {
    const [routers, setRouters] = useState([]);
    const [routerId, setRouterId] = useState('');
    const [loading, setLoading] = useState(true);
    const [previewing, setPreviewing] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [showWarningModal, setShowWarningModal] = useState(false);

    useEffect(() => {
        let mounted = true;

        masterMikrotikService.getAll()
            .then((response) => {
                if (!mounted) return;

                const rows = Array.isArray(response.data?.data) ? response.data.data : [];
                setRouters(rows);

                const active = rows.find((row) => row.is_active);
                setRouterId(String((active || rows[0] || {}).id || ''));
            })
            .catch((err) => {
                setError(err.response?.data?.message || 'Gagal memuat daftar router.');
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, []);

    const summary = result?.summary || {};
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const problemRows = useMemo(() => {
        return rows.filter((row) => (
            (row.warnings && row.warnings.length > 0)
            || (row.errors && row.errors.length > 0)
            || row.secret_status === 'conflict_exists'
        ));
    }, [rows]);

    const selectedRouter = routers.find((router) => String(router.id) === String(routerId));

    const runPreview = async () => {
        if (!routerId) {
            setError('Pilih router target terlebih dahulu.');
            return;
        }

        try {
            setPreviewing(true);
            setError(null);
            setSuccess(null);
            const response = await customerPackageMigrationService.preview({ router_id: routerId });
            setResult(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Preview migrasi gagal.');
        } finally {
            setPreviewing(false);
        }
    };

    const requestRun = () => {
        if (!result) {
            setError('Jalankan preview terlebih dahulu.');
            return;
        }

        if (summary.has_warnings || problemRows.length > 0) {
            setShowWarningModal(true);
            return;
        }

        runMigration();
    };

    const runMigration = async () => {
        try {
            setRunning(true);
            setError(null);
            setSuccess(null);
            setShowWarningModal(false);
            const response = await customerPackageMigrationService.run({
                router_id: routerId,
                confirm_warnings: true,
            });
            setResult(response.data?.data || null);
            setSuccess(response.data?.message || 'Migrasi selesai diproses.');
        } catch (err) {
            setError(err.response?.data?.message || 'Migrasi gagal diproses.');
        } finally {
            setRunning(false);
        }
    };

    if (loading) {
        return <LoadingSpinner text="Memuat migrasi PPPoE..." />;
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Migrasi PPPoE Pelanggan</h1>
                    <p className="text-sm text-slate-600">Target: profile lebih dulu, lalu secret pelanggan.</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                        value={routerId}
                        onChange={(event) => {
                            setRouterId(event.target.value);
                            setResult(null);
                        }}
                        className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    >
                        <option value="">Pilih router target</option>
                        {routers.map((router) => (
                            <option key={router.id} value={router.id}>
                                {router.name} - {router.host}:{router.port}
                            </option>
                        ))}
                    </select>

                    <Button onClick={runPreview} disabled={previewing || running || !routerId} variant="secondary">
                        {previewing ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                        Preview
                    </Button>

                    <Button onClick={requestRun} disabled={previewing || running || !result}>
                        {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                        Migrasi
                    </Button>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-semibold text-slate-900">Router Target</h2>
                        <p className="text-sm text-slate-600">
                            {selectedRouter ? `${selectedRouter.name} (${selectedRouter.host}:${selectedRouter.port})` : '-'}
                        </p>
                    </div>
                    {selectedRouter?.is_active && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={14} /> Aktif
                        </span>
                    )}
                </div>
            </div>

            {result && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                        {SUMMARY_ITEMS.map(([key, label]) => (
                            <div key={key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                                <p className="mt-1 text-2xl font-bold text-slate-900">{summary[key] ?? 0}</p>
                            </div>
                        ))}
                    </div>

                    {problemRows.length > 0 && (
                        <Alert
                            type="warning"
                            title="Ada data yang perlu dicek"
                            message={`${problemRows.length} pelanggan memiliki data kosong, konflik, atau error. Item valid tetap bisa dimigrasikan.`}
                        />
                    )}

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-3">
                            <h2 className="font-semibold text-slate-900">Hasil Migrasi</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Pelanggan</th>
                                        <th className="px-4 py-3">Username</th>
                                        <th className="px-4 py-3">Profile</th>
                                        <th className="px-4 py-3">Status Profile</th>
                                        <th className="px-4 py-3">Status Secret</th>
                                        <th className="px-4 py-3">IP</th>
                                        <th className="px-4 py-3">Catatan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map((row) => (
                                        <tr key={row.customer_id} className="align-top">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-slate-900">{row.customer_name}</p>
                                                <p className="text-xs text-slate-500">{row.is_active ? 'Aktif' : 'Nonaktif'}</p>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">{row.pppoe_username || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.target_profile || '-'}</td>
                                            <td className="px-4 py-3"><StatusBadge status={row.profile_status} /></td>
                                            <td className="px-4 py-3"><StatusBadge status={row.secret_status} /></td>
                                            <td className="px-4 py-3 text-slate-700">{row.remote_address || '-'}</td>
                                            <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                                                {[...(row.warnings || []), ...(row.errors || [])].length > 0
                                                    ? [...(row.warnings || []), ...(row.errors || [])].join(' ')
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <Modal
                isOpen={showWarningModal}
                onClose={() => setShowWarningModal(false)}
                title="Konfirmasi Migrasi"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
                        <p className="text-sm">
                            Ada data kosong, konflik, atau error. Migrasi tetap berjalan untuk pelanggan yang valid.
                        </p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                        <div className="rounded-lg bg-slate-50 p-3">
                            <p className="text-xs font-semibold text-slate-500">Data kosong</p>
                            <p className="text-lg font-bold text-slate-900">{summary.data_kosong || 0}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                            <p className="text-xs font-semibold text-slate-500">Konflik</p>
                            <p className="text-lg font-bold text-slate-900">{summary.secret_sudah_ada_konflik || 0}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                            <p className="text-xs font-semibold text-slate-500">Gagal</p>
                            <p className="text-lg font-bold text-slate-900">{summary.gagal_validasi || 0}</p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShowWarningModal(false)} disabled={running}>
                            Batal
                        </Button>
                        <Button variant="warning" onClick={runMigration} disabled={running}>
                            {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                            Lanjutkan
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default CustomerPackageMigrationPage;

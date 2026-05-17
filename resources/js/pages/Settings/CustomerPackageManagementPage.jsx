import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Link2,
    Package,
    RefreshCw,
    Search,
    Settings2,
    UserX2,
    WifiOff,
} from 'lucide-react';
import apiClient from '../../services/api';
import customerPackageManagementService from '../../services/customerPackageManagementService';

const STATUS_ORDER = [
    'VALID',
    'TIDAK_SESUAI',
    'PPPOE_TIDAK_DITEMUKAN',
    'BELUM_ADA_PAKET',
    'BELUM_ADA_USERNAME',
];

const STATUS_LABEL = {
    VALID: 'Paket Valid',
    TIDAK_SESUAI: 'Paket Tidak Sesuai',
    PPPOE_TIDAK_DITEMUKAN: 'PPPoE Tidak Ditemukan',
    BELUM_ADA_PAKET: 'Belum Ada Paket',
    BELUM_ADA_USERNAME: 'Belum Ada Username',
};

const STATUS_BADGE = {
    VALID: 'bg-emerald-100 text-emerald-700',
    TIDAK_SESUAI: 'bg-rose-100 text-rose-700',
    PPPOE_TIDAK_DITEMUKAN: 'bg-amber-100 text-amber-700',
    BELUM_ADA_PAKET: 'bg-indigo-100 text-indigo-700',
    BELUM_ADA_USERNAME: 'bg-slate-200 text-slate-700',
};

function actionAllowed() {
    const role = window.appUserRole || 'admin';
    const capabilities = window.appCapabilities || {};
    if (Object.prototype.hasOwnProperty.call(capabilities, 'customer.package_audit.manage')) {
        return !!capabilities['customer.package_audit.manage'];
    }

    return role === 'superadmin' || role === 'admin';
}

function formatDateTime(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString('id-ID');
    } catch (_) {
        return value;
    }
}

export default function CustomerPackageManagementPage() {
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [search, setSearch] = useState('');
    const [includeIgnored, setIncludeIgnored] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [detailRow, setDetailRow] = useState(null);
    const [resolveRow, setResolveRow] = useState(null);
    const [linkRow, setLinkRow] = useState(null);
    const [assignRow, setAssignRow] = useState(null);
    const [ignoreRow, setIgnoreRow] = useState(null);
    const [ignoreReason, setIgnoreReason] = useState('');
    const [linkSearch, setLinkSearch] = useState('');
    const [linkSelected, setLinkSelected] = useState('');
    const [pppoeOptions, setPppoeOptions] = useState([]);
    const [packages, setPackages] = useState([]);
    const [selectedPackageId, setSelectedPackageId] = useState('');

    const canManage = actionAllowed();

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [summaryRes, rowsRes] = await Promise.all([
                customerPackageManagementService.summary({
                    active_only: 1,
                    include_ignored: includeIgnored ? 1 : 0,
                    search,
                }),
                customerPackageManagementService.customers({
                    active_only: 1,
                    include_ignored: includeIgnored ? 1 : 0,
                    search,
                    per_page: 500,
                    page: 1,
                }),
            ]);

            setSummary(summaryRes.data?.data || null);
            setRows(Array.isArray(rowsRes.data?.data) ? rowsRes.data.data : []);
        } catch (err) {
            const serverErrors = err?.response?.data?.errors;
            if (serverErrors) {
                const allMessages = Object.values(serverErrors)
                    .flat()
                    .filter(Boolean);
                setError(allMessages.join(' ') || 'Gagal memuat data audit manajemen paket.');
            } else {
                setError(err?.response?.data?.message || 'Gagal memuat data audit manajemen paket.');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchPackages = async () => {
        try {
            const response = await apiClient.get('/packages/active');
            setPackages(Array.isArray(response?.data?.data) ? response.data.data : []);
        } catch (_) {
            setPackages([]);
        }
    };

    useEffect(() => {
        fetchData();
        fetchPackages();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 350);

        return () => clearTimeout(timer);
    }, [search, includeIgnored]);

    useEffect(() => {
        if (!linkRow) return;
        const run = async () => {
            const response = await customerPackageManagementService.pppoeSecrets({ search: linkSearch });
            setPppoeOptions(Array.isArray(response.data?.data) ? response.data.data : []);
        };
        run().catch(() => setPppoeOptions([]));
    }, [linkRow, linkSearch]);

    const rowsByStatus = useMemo(() => {
        const map = {
            VALID: [],
            TIDAK_SESUAI: [],
            PPPOE_TIDAK_DITEMUKAN: [],
            BELUM_ADA_PAKET: [],
            BELUM_ADA_USERNAME: [],
        };

        rows.forEach((row) => {
            const key = row.status;
            if (!map[key]) {
                map[key] = [];
            }
            map[key].push(row);
        });

        return map;
    }, [rows]);

    const runAction = async (handler) => {
        try {
            setActionLoading(true);
            setError(null);
            setMessage(null);
            await handler();
            setMessage('Perubahan berhasil disimpan.');
            await fetchData();
        } catch (err) {
            const serverErrors = err?.response?.data?.errors;
            if (serverErrors) {
                const allMessages = Object.values(serverErrors)
                    .flat()
                    .filter(Boolean);
                setError(allMessages.join(' ') || 'Permintaan tidak valid.');
                return;
            }
            setError(err?.response?.data?.message || err?.response?.data?.error || 'Aksi gagal diproses.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleIgnore = (row) => {
        setIgnoreRow(row);
        setIgnoreReason('');
    };

    return (
        <div className="space-y-6 min-w-0">
            <div className="app-section-header flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manajemen Paket Pelanggan</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Audit kesesuaian paket sistem dan profile PPPoE MikroTik dengan aksi sinkronisasi langsung.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={fetchData}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                    disabled={loading || actionLoading}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            <div className="app-toolbar flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1 min-w-0">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Cari nama pelanggan, username PPPoE, paket, profile..."
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={includeIgnored}
                        onChange={(e) => setIncludeIgnored(e.target.checked)}
                    />
                    Tampilkan diabaikan
                </label>
            </div>

            {message && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">
                    {message}
                </div>
            )}
            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                <SummaryCard icon={UsersIcon} label="Total Pelanggan" value={summary?.total_pelanggan ?? rows.length} />
                <SummaryCard icon={CheckCircle2} label="Paket Valid" value={summary?.paket_valid ?? 0} tone="emerald" />
                <SummaryCard icon={AlertTriangle} label="Paket Tidak Sesuai" value={summary?.paket_tidak_sesuai ?? 0} tone="rose" />
                <SummaryCard icon={WifiOff} label="PPPoE Tidak Ditemukan" value={summary?.pppoe_tidak_ditemukan ?? 0} tone="amber" />
                <SummaryCard icon={Package} label="Belum Ada Paket" value={summary?.belum_ada_paket ?? 0} tone="indigo" />
                <SummaryCard icon={UserX2} label="Belum Ada Username" value={summary?.belum_ada_username ?? 0} tone="slate" />
            </div>

            {loading ? (
                <div className="app-card p-8 text-center text-sm text-gray-500">Memuat data manajemen paket...</div>
            ) : (
                STATUS_ORDER.map((status) => (
                    <section key={status} className="app-card overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[status]}`}>
                                    {STATUS_LABEL[status]}
                                </span>
                                <span className="text-sm text-gray-500">{rowsByStatus[status]?.length || 0} pelanggan</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-sm">
                                <thead className="bg-white text-gray-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Pelanggan</th>
                                        <th className="px-3 py-2 text-left">Username PPPoE</th>
                                        <th className="px-3 py-2 text-left">Paket Sistem</th>
                                        <th className="px-3 py-2 text-left">Profile PPPoE</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                        <th className="px-3 py-2 text-left">Last Update</th>
                                        <th className="px-3 py-2 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(rowsByStatus[status] || []).length === 0 ? (
                                        <tr>
                                            <td className="px-3 py-4 text-gray-500 text-center" colSpan={7}>
                                                Tidak ada data pada section ini.
                                            </td>
                                        </tr>
                                    ) : (
                                        (rowsByStatus[status] || []).map((row) => (
                                            <tr key={`${row.customer_id}-${status}`} className="border-t border-gray-100">
                                                <td className="px-3 py-2">
                                                    <p className="font-medium text-gray-900">{row.customer_name}</p>
                                                    <p className="text-xs text-gray-500">{row.phone || '-'}</p>
                                                </td>
                                                <td className="px-3 py-2 text-gray-700">{row.pppoe_username || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{row.system_package || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{row.mikrotik_profile || '-'}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[status]}`}>
                                                        {row.status}
                                                    </span>
                                                    {row.ignored && (
                                                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                                                            Diabaikan
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-gray-500">{formatDateTime(row.last_update_at)}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <div className="inline-flex flex-wrap justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDetailRow(row)}
                                                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                                                        >
                                                            Lihat Detail
                                                        </button>
                                                        {canManage && status === 'TIDAK_SESUAI' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setResolveRow(row)}
                                                                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                                                            >
                                                                Sesuaikan Paket
                                                            </button>
                                                        )}
                                                        {canManage && status === 'PPPOE_TIDAK_DITEMUKAN' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => runAction(() => customerPackageManagementService.createPppoe(row.customer_id))}
                                                                    disabled={actionLoading}
                                                                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-60"
                                                                >
                                                                    Buat PPPoE
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setLinkRow(row);
                                                                        setLinkSelected('');
                                                                        setLinkSearch('');
                                                                    }}
                                                                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                                                                >
                                                                    Hubungkan PPPoE
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleIgnore(row)}
                                                                    className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium"
                                                                >
                                                                    Abaikan
                                                                </button>
                                                            </>
                                                        )}
                                                        {canManage && status === 'BELUM_ADA_PAKET' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setAssignRow(row);
                                                                    setSelectedPackageId('');
                                                                }}
                                                                className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
                                                            >
                                                                Pilih Paket
                                                            </button>
                                                        )}
                                                        {canManage && status === 'BELUM_ADA_USERNAME' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => runAction(() => customerPackageManagementService.createPppoe(row.customer_id))}
                                                                    disabled={actionLoading}
                                                                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-60"
                                                                >
                                                                    Buat PPPoE
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setLinkRow(row);
                                                                        setLinkSelected('');
                                                                        setLinkSearch('');
                                                                    }}
                                                                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                                                                >
                                                                    Hubungkan PPPoE
                                                                </button>
                                                            </>
                                                        )}
                                                        {canManage && row.ignored && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    runAction(() =>
                                                                        customerPackageManagementService.unignore(row.customer_id, { status_code: row.status })
                                                                    )
                                                                }
                                                                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium"
                                                            >
                                                                Buka Abaikan
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))
            )}

            {detailRow && (
                <SimpleModal title="Detail Pelanggan" onClose={() => setDetailRow(null)}>
                    <div className="space-y-2 text-sm text-gray-700">
                        <RowDetail label="Pelanggan" value={detailRow.customer_name} />
                        <RowDetail label="Username PPPoE" value={detailRow.pppoe_username || '-'} />
                        <RowDetail label="Paket Sistem" value={detailRow.system_package || '-'} />
                        <RowDetail label="Expected Profile" value={detailRow.expected_profile || '-'} />
                        <RowDetail label="Profile MikroTik" value={detailRow.mikrotik_profile || '-'} />
                        <RowDetail label="Status" value={detailRow.status} />
                        <RowDetail label="Last Update" value={formatDateTime(detailRow.last_update_at)} />
                    </div>
                </SimpleModal>
            )}

            {resolveRow && (
                <SimpleModal title="Sesuaikan Paket" onClose={() => setResolveRow(null)}>
                    <p className="text-sm text-gray-600 mb-4">
                        Pilih sumber data yang dianggap benar untuk pelanggan <span className="font-semibold">{resolveRow.customer_name}</span>.
                    </p>
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() =>
                                runAction(async () => {
                                    await customerPackageManagementService.resolveSystemToMikrotik(resolveRow.customer_id);
                                    setResolveRow(null);
                                })
                            }
                            className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
                            disabled={actionLoading}
                        >
                            Ikuti Paket Sistem
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                runAction(async () => {
                                    await customerPackageManagementService.resolveMikrotikToSystem(resolveRow.customer_id);
                                    setResolveRow(null);
                                })
                            }
                            className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
                            disabled={actionLoading}
                        >
                            Ikuti Profile PPPoE
                        </button>
                    </div>
                </SimpleModal>
            )}

            {linkRow && (
                <SimpleModal title="Hubungkan PPPoE" onClose={() => setLinkRow(null)}>
                    <p className="text-sm text-gray-600 mb-3">
                        Pilih secret PPPoE untuk pelanggan <span className="font-semibold">{linkRow.customer_name}</span>.
                    </p>
                    <input
                        type="text"
                        value={linkSearch}
                        onChange={(e) => setLinkSearch(e.target.value)}
                        placeholder="Cari username/profile secret..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                    />
                    <select
                        value={linkSelected}
                        onChange={(e) => setLinkSelected(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
                    >
                        <option value="">Pilih secret PPPoE</option>
                        {pppoeOptions.map((secret) => (
                            <option key={secret.name} value={secret.name}>
                                {secret.name} - {secret.profile || '-'} {secret.disabled ? '(disabled)' : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() =>
                            runAction(async () => {
                                await customerPackageManagementService.linkPppoe(linkRow.customer_id, { pppoe_username: linkSelected });
                                setLinkRow(null);
                            })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
                        disabled={actionLoading || !linkSelected}
                    >
                        Simpan Hubungan PPPoE
                    </button>
                </SimpleModal>
            )}

            {assignRow && (
                <SimpleModal title="Pilih Paket Pelanggan" onClose={() => setAssignRow(null)}>
                    <p className="text-sm text-gray-600 mb-3">
                        Pilih paket aktif untuk pelanggan <span className="font-semibold">{assignRow.customer_name}</span>.
                    </p>
                    <select
                        value={selectedPackageId}
                        onChange={(e) => setSelectedPackageId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
                    >
                        <option value="">Pilih paket</option>
                        {packages.map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                                {pkg.name} {pkg.mikrotik_profile ? `(${pkg.mikrotik_profile})` : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() =>
                            runAction(async () => {
                                await customerPackageManagementService.assignPackage(assignRow.customer_id, {
                                    package_id: Number(selectedPackageId),
                                });
                                setAssignRow(null);
                            })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60"
                        disabled={actionLoading || !selectedPackageId}
                    >
                        Simpan Paket
                    </button>
                </SimpleModal>
            )}

            {ignoreRow && (
                <SimpleModal title="Abaikan Status Pelanggan" onClose={() => setIgnoreRow(null)}>
                    <p className="text-sm text-gray-600 mb-3">
                        Pelanggan akan disembunyikan dari list utama untuk status <span className="font-semibold">{ignoreRow.status}</span>.
                    </p>
                    <textarea
                        value={ignoreReason}
                        onChange={(e) => setIgnoreReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[96px] mb-4"
                        placeholder="Alasan (opsional)"
                    />
                    <button
                        type="button"
                        onClick={() =>
                            runAction(async () => {
                                await customerPackageManagementService.ignore(ignoreRow.customer_id, {
                                    status_code: ignoreRow.status,
                                    reason: ignoreReason || null,
                                });
                                setIgnoreRow(null);
                            })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-60"
                        disabled={actionLoading}
                    >
                        Simpan Abaikan
                    </button>
                </SimpleModal>
            )}
        </div>
    );
}

function SummaryCard({ icon: Icon, label, value, tone = 'sky' }) {
    const toneMap = {
        sky: 'bg-sky-50 border-sky-100 text-sky-800',
        emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800',
        rose: 'bg-rose-50 border-rose-100 text-rose-800',
        amber: 'bg-amber-50 border-amber-100 text-amber-800',
        indigo: 'bg-indigo-50 border-indigo-100 text-indigo-800',
        slate: 'bg-slate-100 border-slate-200 text-slate-800',
    };

    return (
        <div className={`rounded-xl border p-3 ${toneMap[tone] || toneMap.sky}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{label}</p>
                <Icon size={16} />
            </div>
            <p className="text-2xl font-bold mt-2">{value}</p>
        </div>
    );
}

function RowDetail({ label, value }) {
    return (
        <div className="flex justify-between gap-4 py-1 border-b border-gray-100 last:border-b-0">
            <p className="text-gray-500">{label}</p>
            <p className="text-gray-900 font-medium text-right">{value || '-'}</p>
        </div>
    );
}

function SimpleModal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Settings2 size={18} className="text-blue-600" />
                        {title}
                    </h3>
                    <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
                        Tutup
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function UsersIcon(props) {
    return <Link2 {...props} />;
}

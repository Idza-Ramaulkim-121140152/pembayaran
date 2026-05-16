import { useEffect, useMemo, useState } from 'react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import MapPicker from '../../components/common/MapPicker';
import masterWilayahService from '../../services/masterWilayahService';
import odpMappingService from '../../services/odpMappingService';

const DEFAULT_ODP_COORDINATE = {
    latitude: -5.632727646,
    longitude: 105.548014641,
};

function extractOdpSequence(name, prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedPrefix}-(\\d{3})$`);
    const match = String(name || '').match(regex);
    return match ? Number(match[1]) : null;
}

function buildQuickCreateNamePreview({ kecamatanId, desaId, dusunId, kecamatanOptions, desaOptions, dusunOptions, odps }) {
    const kecamatan = kecamatanOptions.find((item) => Number(item.id) === Number(kecamatanId));
    const desa = desaOptions.find((item) => Number(item.id) === Number(desaId));
    const dusun = dusunOptions.find((item) => Number(item.id) === Number(dusunId));

    if (!kecamatan?.code || !desa?.code || !dusun?.code) {
        return 'Auto: pilih kecamatan, desa, dan dusun';
    }

    const prefix = `${String(kecamatan.code).toUpperCase()}-${String(desa.code).toUpperCase()}-${String(dusun.code).toUpperCase()}`;
    const maxSequence = odps
        .filter((odp) => Number(odp?.desa_id) === Number(desaId) && Number(odp?.dusun_id) === Number(dusunId))
        .reduce((max, odp) => {
            const current = extractOdpSequence(odp?.nama, prefix);
            if (current === null) return max;
            return current > max ? current : max;
        }, 0);

    return `${prefix}-${String(maxSequence + 1).padStart(3, '0')}`;
}

function OdpMappingPage() {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [rows, setRows] = useState([]);
    const [selectedRowsMap, setSelectedRowsMap] = useState({});
    const [odps, setOdps] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedOdpId, setSelectedOdpId] = useState('');
    const [stats, setStats] = useState({ assigned: 0, unassigned: 0, mismatch: 0 });
    const [filters, setFilters] = useState({ search: '', status: '', odp_id: '' });
    const [searchInput, setSearchInput] = useState('');
    const [kecamatanOptions, setKecamatanOptions] = useState([]);
    const [desaOptions, setDesaOptions] = useState([]);
    const [dusunOptions, setDusunOptions] = useState([]);
    const [hasMapInteraction, setHasMapInteraction] = useState(false);
    const [quickCreate, setQuickCreate] = useState({
        rasio_distribusi: '1:8',
        kecamatan_id: '',
        desa_id: '',
        dusun_id: '',
        alamat_detail: '',
        latitude: DEFAULT_ODP_COORDINATE.latitude,
        longitude: DEFAULT_ODP_COORDINATE.longitude,
    });

    useEffect(() => {
        fetchInitial();
        fetchKecamatanOptions();
    }, []);

    const fetchInitial = async () => {
        try {
            setLoading(true);
            const [customersRes, optionsRes] = await Promise.all([
                odpMappingService.listCustomers({ ...filters, per_page: 200 }),
                odpMappingService.options(),
            ]);

            const pageRows = customersRes?.data?.data?.data || [];
            setRows(pageRows);
            setStats(customersRes?.data?.meta?.stats || { assigned: 0, unassigned: 0, mismatch: 0 });
            setOdps(optionsRes?.data?.data || []);
        } catch (err) {
            setError('Gagal memuat data pemetaan ODP.');
        } finally {
            setLoading(false);
        }
    };

    const fetchKecamatanOptions = async () => {
        try {
            const response = await masterWilayahService.getKecamatans();
            setKecamatanOptions(response?.data?.data || []);
        } catch (err) {
            setError('Gagal memuat daftar kecamatan.');
        }
    };

    const fetchDesaOptions = async (kecamatanId) => {
        try {
            if (!kecamatanId) {
                setDesaOptions([]);
                setDusunOptions([]);
                return;
            }

            const response = await masterWilayahService.getDesas(Number(kecamatanId));
            setDesaOptions(response?.data?.data || []);
            setDusunOptions([]);
        } catch (err) {
            setError('Gagal memuat daftar desa.');
        }
    };

    const fetchDusunOptions = async (desaId) => {
        try {
            if (!desaId) {
                setDusunOptions([]);
                return;
            }

            const response = await masterWilayahService.getDusuns(Number(desaId));
            setDusunOptions(response?.data?.data || []);
        } catch (err) {
            setError('Gagal memuat daftar dusun.');
        }
    };

    const reloadCustomers = async (overrideFilters = null) => {
        try {
            setLoading(true);
            const activeFilters = overrideFilters ?? filters;
            const response = await odpMappingService.listCustomers({ ...activeFilters, per_page: 200 });
            setRows(response?.data?.data?.data || []);
            setStats(response?.data?.meta?.stats || { assigned: 0, unassigned: 0, mismatch: 0 });
        } catch (err) {
            setError('Gagal memuat ulang data pelanggan.');
        } finally {
            setLoading(false);
        }
    };

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    useEffect(() => {
        setSelectedRowsMap((prev) => {
            if (selectedIds.length === 0) {
                return {};
            }

            const next = { ...prev };
            const rowById = new Map((rows || []).map((row) => [Number(row.id), row]));
            const selectedIdSet = new Set(selectedIds.map((id) => Number(id)));

            selectedIdSet.forEach((id) => {
                const latestRow = rowById.get(id);
                if (latestRow) {
                    next[id] = latestRow;
                }
            });

            Object.keys(next).forEach((id) => {
                if (!selectedIdSet.has(Number(id))) {
                    delete next[id];
                }
            });

            return next;
        });
    }, [rows, selectedIds]);

    const displayRows = useMemo(() => {
        const rowById = new Map((rows || []).map((row) => [Number(row.id), row]));
        const pinnedRows = [];
        const seen = new Set();

        selectedIds.forEach((id) => {
            const numericId = Number(id);
            const row = rowById.get(numericId) || selectedRowsMap[numericId];
            if (!row || seen.has(numericId)) {
                return;
            }

            pinnedRows.push(row);
            seen.add(numericId);
        });

        const regularRows = (rows || []).filter((row) => {
            const numericId = Number(row.id);
            if (seen.has(numericId)) {
                return false;
            }
            seen.add(numericId);
            return true;
        });

        return [...pinnedRows, ...regularRows];
    }, [rows, selectedIds, selectedRowsMap]);

    const selectedCustomerWithCoordinate = useMemo(() => {
        const rowById = new Map((rows || []).map((row) => [Number(row.id), row]));

        for (const id of selectedIds) {
            const numericId = Number(id);
            const row = rowById.get(numericId) || selectedRowsMap[numericId];
            if (!row) continue;
            if (row.latitude !== null && row.latitude !== undefined && row.longitude !== null && row.longitude !== undefined) {
                return row;
            }
        }

        return null;
    }, [rows, selectedIds, selectedRowsMap]);

    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            if (prev.includes(id)) {
                return prev.filter((item) => item !== id);
            }

            return [...prev, id];
        });

        if (selectedSet.has(id)) {
            setSelectedRowsMap((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        } else {
            const selectedRow = (rows || []).find((row) => Number(row.id) === Number(id));
            if (selectedRow) {
                setSelectedRowsMap((prev) => ({
                    ...prev,
                    [id]: selectedRow,
                }));
            }
        }
    };

    const tryAssign = async (forceReassign = false) => {
        return odpMappingService.assign({
            customer_ids: selectedIds,
            odp_id: Number(selectedOdpId),
            force_reassign: forceReassign,
            reason: forceReassign
                ? 'Bulk reassign dari menu pemetaan ODP'
                : 'Bulk assign dari menu pemetaan ODP',
        });
    };

    const handleAssign = async () => {
        if (!selectedOdpId || selectedIds.length === 0) {
            setError('Pilih ODP tujuan dan minimal 1 pelanggan.');
            return;
        }

        try {
            setSubmitting(true);
            await tryAssign(false);
            setSuccess('Assign ODP berhasil diproses.');
            setSelectedIds([]);
            await reloadCustomers();
        } catch (err) {
            if (err?.response?.status === 409) {
                const conflictCount = (err?.response?.data?.conflicts || []).length;
                const confirmed = window.confirm(`Terdapat ${conflictCount} pelanggan yang sudah terhubung ke ODP lain. Lanjutkan re-assign?`);
                if (confirmed) {
                    try {
                        await tryAssign(true);
                        setSuccess('Re-assign ODP berhasil diproses.');
                        setSelectedIds([]);
                        await reloadCustomers();
                        return;
                    } catch (forceErr) {
                        setError(forceErr?.response?.data?.message || 'Gagal re-assign ODP.');
                        return;
                    }
                }
                return;
            }

            setError(err?.response?.data?.message || 'Gagal assign ODP.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnassign = async () => {
        if (selectedIds.length === 0) {
            setError('Pilih minimal 1 pelanggan.');
            return;
        }

        try {
            setSubmitting(true);
            await odpMappingService.unassign({
                customer_ids: selectedIds,
                reason: 'Bulk unassign dari menu pemetaan ODP',
            });
            setSuccess('Unassign ODP berhasil diproses.');
            setSelectedIds([]);
            await reloadCustomers();
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal unassign ODP.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackfill = async () => {
        try {
            setSubmitting(true);
            const response = await odpMappingService.backfill();
            const payload = response?.data?.data || {};
            setSuccess(`Backfill selesai. updated=${payload.updated || 0}, mismatch=${payload.mismatch || 0}`);
            await reloadCustomers();
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal menjalankan backfill ODP.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUseSelectedCoordinate = () => {
        if (!selectedCustomerWithCoordinate) {
            setError('Pilih pelanggan yang memiliki koordinat terlebih dulu.');
            return;
        }

        setQuickCreate((prev) => ({
            ...prev,
            latitude: Number(selectedCustomerWithCoordinate.latitude),
            longitude: Number(selectedCustomerWithCoordinate.longitude),
        }));
        setHasMapInteraction(true);
    };

    const handleQuickCreate = async (event) => {
        event.preventDefault();

        if (!quickCreate.desa_id || !quickCreate.dusun_id) {
            setError('Desa dan dusun ODP wajib dipilih.');
            return;
        }
        if (!quickCreate.alamat_detail.trim()) {
            setError('Alamat detail ODP wajib diisi.');
            return;
        }
        if (!hasMapInteraction || quickCreate.latitude === null || quickCreate.longitude === null) {
            setError('Lokasi ODP wajib dipilih dari peta.');
            return;
        }

        try {
            setSubmitting(true);
            const createResponse = await odpMappingService.createOdp({
                rasio_distribusi: quickCreate.rasio_distribusi || '1:8',
                kecamatan_id: quickCreate.kecamatan_id ? Number(quickCreate.kecamatan_id) : null,
                desa_id: Number(quickCreate.desa_id),
                dusun_id: Number(quickCreate.dusun_id),
                alamat_detail: quickCreate.alamat_detail.trim(),
                latitude: Number(quickCreate.latitude),
                longitude: Number(quickCreate.longitude),
            });

            const createdName = createResponse?.data?.data?.nama;
            setSuccess(createdName ? `ODP baru berhasil dibuat: ${createdName}` : 'ODP baru berhasil dibuat.');
            setQuickCreate({
                rasio_distribusi: '1:8',
                kecamatan_id: '',
                desa_id: '',
                dusun_id: '',
                alamat_detail: '',
                latitude: DEFAULT_ODP_COORDINATE.latitude,
                longitude: DEFAULT_ODP_COORDINATE.longitude,
            });
            setDesaOptions([]);
            setDusunOptions([]);
            setHasMapInteraction(false);

            const optionsRes = await odpMappingService.options();
            setOdps(optionsRes?.data?.data || []);
        } catch (err) {
            const message = err?.response?.data?.message;
            const validationErrors = err?.response?.data?.errors;
            const firstValidationError = validationErrors
                ? Object.values(validationErrors)[0]?.[0]
                : null;

            setError(firstValidationError || message || 'Gagal membuat ODP baru.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSearchSubmit = async (event) => {
        event.preventDefault();
        const nextFilters = {
            ...filters,
            search: searchInput.trim(),
        };

        setFilters(nextFilters);
        await reloadCustomers(nextFilters);
    };

    const quickCreateGeneratedNamePreview = useMemo(() => {
        return buildQuickCreateNamePreview({
            kecamatanId: quickCreate.kecamatan_id,
            desaId: quickCreate.desa_id,
            dusunId: quickCreate.dusun_id,
            kecamatanOptions,
            desaOptions,
            dusunOptions,
            odps,
        });
    }, [quickCreate.kecamatan_id, quickCreate.desa_id, quickCreate.dusun_id, kecamatanOptions, desaOptions, dusunOptions, odps]);

    const handleSearchReset = async () => {
        const nextFilters = {
            ...filters,
            search: '',
        };

        setSearchInput('');
        setFilters(nextFilters);
        await reloadCustomers(nextFilters);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pemetaan ODP</h1>
                <p className="text-gray-600 mt-1">Kelola mapping pelanggan ke ODP secara aman dan terukur.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <form onSubmit={handleQuickCreate} className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Quick Create ODP</h2>
                    <p className="text-sm text-gray-500">Buat ODP baru langsung dari menu pemetaan (map-first, wilayah wajib).</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama ODP (Auto)</label>
                    <input
                        type="text"
                        value={quickCreateGeneratedNamePreview}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 bg-gray-100 rounded-lg text-gray-700"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                        value={quickCreate.rasio_distribusi}
                        onChange={(e) => setQuickCreate((prev) => ({ ...prev, rasio_distribusi: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                        <option value="1:2">1:2</option>
                        <option value="1:4">1:4</option>
                        <option value="1:8">1:8</option>
                        <option value="1:16">1:16</option>
                    </select>
                    <select
                        value={quickCreate.kecamatan_id}
                        onChange={async (e) => {
                            const value = e.target.value;
                            setQuickCreate((prev) => ({ ...prev, kecamatan_id: value, desa_id: '', dusun_id: '' }));
                            await fetchDesaOptions(value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                        <option value="">Pilih Kecamatan</option>
                        {kecamatanOptions.map((item) => (
                            <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                        ))}
                    </select>
                    <select
                        value={quickCreate.desa_id}
                        onChange={async (e) => {
                            const value = e.target.value;
                            setQuickCreate((prev) => ({ ...prev, desa_id: value, dusun_id: '' }));
                            await fetchDusunOptions(value);
                        }}
                        disabled={!quickCreate.kecamatan_id}
                        className="px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                    >
                        <option value="">Pilih Desa</option>
                        {desaOptions.map((item) => (
                            <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                        ))}
                    </select>
                    <select
                        value={quickCreate.dusun_id}
                        onChange={(e) => setQuickCreate((prev) => ({ ...prev, dusun_id: e.target.value }))}
                        disabled={!quickCreate.desa_id}
                        className="px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                    >
                        <option value="">Pilih Dusun</option>
                        {dusunOptions.map((item) => (
                            <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={quickCreate.alamat_detail}
                        onChange={(e) => setQuickCreate((prev) => ({ ...prev, alamat_detail: e.target.value }))}
                        placeholder="Alamat detail ODP (patokan lapangan)"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                    />
                </div>
                <MapPicker
                    latitude={quickCreate.latitude}
                    longitude={quickCreate.longitude}
                    onLocationChange={(lat, lng) => {
                        setQuickCreate((prev) => ({ ...prev, latitude: lat, longitude: lng }));
                        setHasMapInteraction(true);
                    }}
                    height="280px"
                    showCoordinateInputs={false}
                />
                <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    Koordinat terpilih: {quickCreate.latitude !== null && quickCreate.longitude !== null
                        ? `${quickCreate.latitude}, ${quickCreate.longitude}`
                        : 'Belum dipilih dari peta'}
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button type="submit" variant="primary" disabled={submitting}>Simpan ODP</Button>
                    <Button type="button" variant="secondary" onClick={handleUseSelectedCoordinate} disabled={submitting}>
                        Ambil Koordinat dari Pelanggan Terpilih
                    </Button>
                </div>
            </form>

            <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-4">
                <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search pelanggan: nama/PPPoE/telepon/alamat"
                        className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2"
                    />
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                        <option value="">Semua status</option>
                        <option value="assigned">Assigned</option>
                        <option value="unassigned">Unassigned</option>
                        <option value="mismatch">Mismatch</option>
                    </select>
                    <select
                        value={filters.odp_id}
                        onChange={(e) => setFilters((prev) => ({ ...prev, odp_id: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                        <option value="">Semua ODP</option>
                        {odps.map((odp) => (
                            <option key={odp.id} value={odp.id}>{odp.nama}</option>
                        ))}
                    </select>
                    <Button type="submit" variant="primary">Cari Pelanggan</Button>
                    <Button type="button" variant="secondary" onClick={handleSearchReset}>Reset Search</Button>
                    <Button type="button" variant="secondary" onClick={() => reloadCustomers()}>Terapkan Filter</Button>
                </form>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-100 rounded-lg p-4">
                        <p className="text-sm text-gray-500">Assigned</p>
                        <p className="text-2xl font-bold text-green-600">{stats.assigned}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-lg p-4">
                        <p className="text-sm text-gray-500">Unassigned</p>
                        <p className="text-2xl font-bold text-amber-600">{stats.unassigned}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-lg p-4">
                        <p className="text-sm text-gray-500">Mismatch</p>
                        <p className="text-2xl font-bold text-red-600">{stats.mismatch}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3">
                    <select
                        value={selectedOdpId}
                        onChange={(e) => setSelectedOdpId(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                        <option value="">Pilih ODP tujuan bulk assign</option>
                        {odps.map((odp) => (
                            <option key={odp.id} value={odp.id}>{odp.nama}</option>
                        ))}
                    </select>
                    <Button type="button" variant="primary" onClick={handleAssign} disabled={submitting}>Bulk Assign</Button>
                    <Button type="button" variant="danger" onClick={handleUnassign} disabled={submitting}>Bulk Unassign</Button>
                    <Button type="button" variant="secondary" onClick={handleBackfill} disabled={submitting}>Backfill</Button>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                {loading ? (
                    <div className="p-8">
                        <LoadingSpinner text="Memuat pelanggan..." />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-4 py-3 text-left">Pilih</th>
                                    <th className="px-4 py-3 text-left">Nama</th>
                                    <th className="px-4 py-3 text-left">PPPoE</th>
                                    <th className="px-4 py-3 text-left">Telepon</th>
                                    <th className="px-4 py-3 text-left">ODP (legacy)</th>
                                    <th className="px-4 py-3 text-left">ODP (master)</th>
                                    <th className="px-4 py-3 text-left">Koordinat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {displayRows.map((row) => (
                                    <tr key={row.id} className={selectedSet.has(row.id) ? 'bg-blue-50' : ''}>
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedSet.has(row.id)}
                                                onChange={() => toggleSelect(row.id)}
                                            />
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                                        <td className="px-4 py-3">{row.pppoe_username || '-'}</td>
                                        <td className="px-4 py-3">{row.phone || '-'}</td>
                                        <td className="px-4 py-3">{row.odp || '-'}</td>
                                        <td className="px-4 py-3">{row.odp_master_name || '-'}</td>
                                        <td className="px-4 py-3">
                                            {(row.latitude !== null && row.latitude !== undefined && row.longitude !== null && row.longitude !== undefined)
                                                ? `${row.latitude}, ${row.longitude}`
                                                : '-'}
                                        </td>
                                    </tr>
                                ))}
                                {displayRows.length === 0 && (
                                    <tr>
                                        <td className="px-4 py-8 text-center text-gray-500" colSpan={7}>Tidak ada data pelanggan.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default OdpMappingPage;

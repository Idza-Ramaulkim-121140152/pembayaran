import { useEffect, useMemo, useState } from 'react';
import {
    Sparkles,
    MapPin,
    CheckCircle2,
    AlertTriangle,
    Layers,
    ArrowRight,
    Search,
    Check,
    RefreshCw,
    X,
    Info,
    CheckSquare,
    Square,
    Users,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import MapPicker from '../../components/common/MapPicker';
import Modal from '../../components/common/Modal';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import masterWilayahService from '../../services/masterWilayahService';
import odpMappingService from '../../services/odpMappingService';
import OdpSpatialNetworkMap from './OdpSpatialNetworkMap';

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

function OdpMappingPage({ embedded = false, initialOdpFilter = '' }) {
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
    const [qualityAudit, setQualityAudit] = useState(null);
    const [filters, setFilters] = useState({ search: '', status: '', odp_id: initialOdpFilter || '' });
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

    // View Mode: 'map' (Peta Spasial Jaringan) vs 'table' (Tabel Pelanggan)
    const [viewMode, setViewMode] = useState('map');

    // AI Auto-Suggest state
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiApplying, setAiApplying] = useState(false);
    const [aiSummary, setAiSummary] = useState(null);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [aiSelectedIds, setAiSelectedIds] = useState(new Set());
    const [aiCustomAssignments, setAiCustomAssignments] = useState({});
    const [aiFilterTab, setAiFilterTab] = useState('all'); // 'all' | 'high' | 'has_gps'

    useEffect(() => {
        fetchInitial();
        fetchKecamatanOptions();
    }, []);

    useEffect(() => {
        if (initialOdpFilter !== undefined && initialOdpFilter !== null) {
            setFilters((prev) => {
                if (String(prev.odp_id || '') === String(initialOdpFilter)) return prev;
                const next = { ...prev, odp_id: String(initialOdpFilter) };
                reloadCustomers(next);
                return next;
            });
        }
    }, [initialOdpFilter]);

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
            fetchQualityAudit();
        } catch (err) {
            setError('Gagal memuat data pemetaan ODP.');
        } finally {
            setLoading(false);
        }
    };

    const fetchQualityAudit = async () => {
        try {
            const response = await odpMappingService.qualityAudit();
            setQualityAudit(response?.data?.data || null);
        } catch (err) {
            setQualityAudit(null);
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

    const openAiModal = async (specificIds = null) => {
        setAiModalOpen(true);
        setAiLoading(true);
        try {
            const params = {
                limit: 200,
                min_confidence: 25,
                include_spatial_mismatch: true,
            };
            if (Array.isArray(specificIds) && specificIds.length > 0) {
                params.customer_ids = specificIds;
            }
            const res = await odpMappingService.getAiSuggestions(params);
            const suggestions = res?.data?.data || [];
            const summary = res?.data?.meta?.summary || null;
            setAiSuggestions(suggestions);
            setAiSummary(summary);

            const highIds = new Set(
                suggestions.filter((s) => s.confidence === 'high').map((s) => s.customer_id)
            );
            setAiSelectedIds(highIds.size > 0 ? highIds : new Set(suggestions.map((s) => s.customer_id)));
            setAiCustomAssignments({});
        } catch (err) {
            setError('Gagal memuat rekomendasi AI ODP: ' + (err?.response?.data?.message || err.message));
        } finally {
            setAiLoading(false);
        }
    };

    const toggleAiSelect = (customerId) => {
        setAiSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(customerId)) {
                next.delete(customerId);
            } else {
                next.add(customerId);
            }
            return next;
        });
    };

    const selectAllHighConfidence = () => {
        const highIds = new Set(
            aiSuggestions.filter((s) => s.confidence === 'high').map((s) => s.customer_id)
        );
        setAiSelectedIds(highIds);
    };

    const selectAllSuggestions = () => {
        setAiSelectedIds(new Set(filteredAiSuggestions.map((s) => s.customer_id)));
    };

    const deselectAllSuggestions = () => {
        setAiSelectedIds(new Set());
    };

    const handleApplyAiSuggestions = async () => {
        if (aiSelectedIds.size === 0) return;
        setAiApplying(true);
        try {
            const assignments = [];
            aiSuggestions.forEach((s) => {
                if (aiSelectedIds.has(s.customer_id)) {
                    const assignedOdpId = aiCustomAssignments[s.customer_id] || s.suggested_odp_id;
                    assignments.push({
                        customer_id: s.customer_id,
                        odp_id: Number(assignedOdpId),
                    });
                }
            });

            const res = await odpMappingService.applyAiSuggestions({ assignments });
            setSuccess(res?.data?.message || `Berhasil menerapkan ${assignments.length} pemetaan ODP via AI!`);
            setAiModalOpen(false);
            await reloadCustomers();
            fetchQualityAudit();
        } catch (err) {
            setError('Gagal menerapkan rekomendasi AI: ' + (err?.response?.data?.message || err.message));
        } finally {
            setAiApplying(false);
        }
    };

    const filteredAiSuggestions = useMemo(() => {
        if (aiFilterTab === 'high') {
            return aiSuggestions.filter((s) => s.confidence === 'high');
        }
        if (aiFilterTab === 'has_gps') {
            return aiSuggestions.filter((s) => s.has_coordinates);
        }
        if (aiFilterTab === 'unmapped') {
            return aiSuggestions.filter((s) => !s.is_reassignment);
        }
        if (aiFilterTab === 'reassign') {
            return aiSuggestions.filter((s) => Boolean(s.is_reassignment));
        }
        return aiSuggestions;
    }, [aiSuggestions, aiFilterTab]);

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

    const customerColumns = [
        {
            key: 'select',
            label: 'Pilih',
            render: (row) => (
                <input
                    type="checkbox"
                    checked={selectedSet.has(row.id)}
                    onChange={() => toggleSelect(row.id)}
                />
            ),
        },
        { key: 'name', label: 'Nama', cellClassName: 'px-4 py-3 font-medium text-gray-900' },
        { key: 'pppoe_username', label: 'PPPoE', render: (row) => row.pppoe_username || '-' },
        { key: 'phone', label: 'Telepon', render: (row) => row.phone || '-' },
        { key: 'odp', label: 'ODP (legacy)', render: (row) => row.odp || '-' },
        { key: 'odp_master_name', label: 'ODP (master)', render: (row) => row.odp_master_name || '-' },
        {
            key: 'coordinate',
            label: 'Koordinat',
            render: (row) => (
                (row.latitude !== null && row.latitude !== undefined && row.longitude !== null && row.longitude !== undefined)
                    ? `${row.latitude}, ${row.longitude}`
                    : '-'
            ),
        },
        {
            key: 'ai_action',
            label: 'Aksi AI',
            render: (row) => {
                if (row.odp_master_name) {
                    return (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                            <CheckCircle2 size={12} /> Terpetakan
                        </span>
                    );
                }
                return (
                    <button
                        type="button"
                        onClick={() => openAiModal([row.id])}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition"
                        title="Dapatkan rekomendasi ODP dari AI untuk pelanggan ini"
                    >
                        <Sparkles size={12} /> Cari ODP AI
                    </button>
                );
            },
        },
    ];

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

    const handleMapAssignCustomer = async (customerId, odpId, force = true) => {
        try {
            setSubmitting(true);
            await odpMappingService.assign({
                customer_ids: [customerId],
                odp_id: Number(odpId),
                force_reassign: Boolean(force),
            });
            setSuccess('Pelanggan berhasil dipetakan ke ODP.');
            // Background reload
            const [customersRes, optionsRes] = await Promise.all([
                odpMappingService.listCustomers({ ...filters, per_page: 200 }),
                odpMappingService.options(),
            ]);
            setRows(customersRes?.data?.data?.data || []);
            setStats(customersRes?.data?.meta?.stats || stats);
            setOdps(optionsRes?.data?.data || []);
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal memetakan pelanggan.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleMapCreateOdp = async (payload) => {
        try {
            setSubmitting(true);
            const res = await odpMappingService.createOdp(payload);
            setSuccess(res?.data?.message || 'ODP baru berhasil dipasang.');
            // Background reload
            const [customersRes, optionsRes] = await Promise.all([
                odpMappingService.listCustomers({ ...filters, per_page: 200 }),
                odpMappingService.options(),
            ]);
            setRows(customersRes?.data?.data?.data || []);
            setOdps(optionsRes?.data?.data || []);
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal memasang ODP baru.');
            throw err;
        } finally {
            setSubmitting(false);
        }
    };

    const handleAdoptNearestWilayahQuick = async (nearest) => {
        if (!nearest) return;
        setQuickCreate((prev) => ({
            ...prev,
            kecamatan_id: nearest.kecamatan_id ? String(nearest.kecamatan_id) : prev.kecamatan_id,
            desa_id: nearest.desa_id ? String(nearest.desa_id) : prev.desa_id,
            dusun_id: nearest.dusun_id ? String(nearest.dusun_id) : prev.dusun_id,
            alamat_detail: prev.alamat_detail || `Dekat ${nearest.nama}${nearest.alamat_detail ? ` (${nearest.alamat_detail})` : ''}`,
            latitude: prev.latitude ?? nearest.latitude,
            longitude: prev.longitude ?? nearest.longitude,
        }));
        setHasMapInteraction(true);

        if (nearest.kecamatan_id) {
            await fetchDesaOptions(nearest.kecamatan_id);
            if (nearest.desa_id) {
                await fetchDusunOptions(nearest.desa_id);
            }
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
            {!embedded ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pemetaan ODP</h1>
                        <p className="text-gray-600 mt-1">Kelola mapping pelanggan ke ODP secara aman, akurat, dan terukur.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => openAiModal()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-indigo-700 hover:to-pink-700 transition"
                    >
                        <Sparkles size={18} />
                        ✨ AI Auto-Suggest Mapping
                    </button>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span>Pemetaan Pelanggan ke ODP</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                                AI Assisted
                            </span>
                        </h2>
                        <p className="text-xs text-gray-500">
                            Kelola relasi dropcore pelanggan, audit anomali ODP, dan terapkan rekomendasi AI 1-klik.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => openAiModal()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md hover:from-indigo-700 hover:to-pink-700 transition"
                    >
                        <Sparkles size={16} />
                        ✨ Rekomendasi AI
                    </button>
                </div>
            )}

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {qualityAudit && (
                <section className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-500">ODP Quality Score</p>
                            <h2 className="mt-1 text-2xl font-bold text-gray-900">{qualityAudit.score}/100</h2>
                            <p className="text-sm text-gray-500">
                                {qualityAudit.summary?.customers_total || 0} pelanggan · {qualityAudit.summary?.odps_total || 0} ODP · {qualityAudit.summary?.issue_total || 0} issue
                            </p>
                        </div>
                        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                            qualityAudit.status === 'healthy'
                                ? 'bg-green-50 text-green-700'
                                : qualityAudit.status === 'degraded'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-red-50 text-red-700'
                        }`}>
                            Status: {qualityAudit.status}
                        </div>
                    </div>
                    {qualityAudit.priority_actions?.length > 0 && (
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {qualityAudit.priority_actions.slice(0, 6).map((issue) => (
                                <div key={issue.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                    <p className="text-sm font-semibold text-gray-900">{issue.label}</p>
                                    <p className="mt-1 text-2xl font-bold text-gray-800">{issue.count}</p>
                                    <p className="text-xs text-gray-500">Bobot dampak: {issue.weight}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* 3 Summary Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-950/60 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Terpetakan (Assigned)</p>
                        <p className="text-2xl font-extrabold text-emerald-600 mt-0.5">{stats.assigned}</p>
                        <p className="text-[11px] text-slate-400">Sudah terhubung ke ODP</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center font-bold">
                        <CheckCircle2 size={22} />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-950/60 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Belum Terpetakan</p>
                        <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{stats.unassigned}</p>
                        <p className="text-[11px] text-amber-600 font-medium">Bisa dipetakan 1-klik di peta</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center font-bold">
                        <AlertTriangle size={22} />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-950/60 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mismatch / Anomali</p>
                        <p className="text-2xl font-extrabold text-rose-600 mt-0.5">{stats.mismatch}</p>
                        <p className="text-[11px] text-rose-500 font-medium">Perlu verifikasi tiang ODP</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center font-bold">
                        <Users size={22} />
                    </div>
                </div>
            </div>

            {/* View Mode Switcher Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 bg-gray-100/90 dark:bg-slate-900/60 rounded-2xl border border-gray-200/80 dark:border-white/10">
                <div className="inline-flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setViewMode('map')}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                            viewMode === 'map'
                                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-cyan-300 shadow-sm'
                                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <MapPin size={16} className={viewMode === 'map' ? 'text-cyan-500' : ''} />
                        <span>🗺️ Peta Spasial Jaringan (Visual)</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 font-extrabold">
                            Rekomendasi
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                            viewMode === 'table'
                                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-cyan-300 shadow-sm'
                                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <Users size={16} />
                        <span>📋 Daftar Tabel & Bulk Mapping ({rows.length})</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 pr-1">
                    <button
                        type="button"
                        onClick={() => openAiModal()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-xs hover:from-indigo-700 hover:to-purple-700 transition"
                    >
                        <Sparkles size={14} />
                        <span>✨ AI Auto-Suggest ({stats.unassigned + stats.mismatch})</span>
                    </button>
                </div>
            </div>

            {/* VIEW MODE 1: Interactive Spatial Network Map */}
            {viewMode === 'map' && (
                <OdpSpatialNetworkMap
                    odps={odps}
                    customers={rows}
                    onAssignCustomer={handleMapAssignCustomer}
                    onCreateOdp={handleMapCreateOdp}
                    kecamatanOptions={kecamatanOptions}
                    desaOptions={desaOptions}
                    dusunOptions={dusunOptions}
                    onRefresh={fetchInitial}
                />
            )}

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
                    height="300px"
                    showCoordinateInputs={false}
                    existingOdps={odps}
                    onAdoptNearestWilayah={handleAdoptNearestWilayahQuick}
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

            {/* VIEW MODE 2: Customer Table & Bulk Mapping */}
            {viewMode === 'table' && (
                <div className="space-y-4">
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

                        {/* AI Auto-Suggest Quick Banner */}
                        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-pink-50/50 p-4 shadow-sm">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-2.5 text-white shadow-md">
                                        <Sparkles size={22} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                                            AI Auto-Suggest ODP Mapping
                                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                                Pencocokan Cerdas
                                            </span>
                                        </h3>
                                        <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                                            Menganalisis koordinat GPS tiang, nama legacy, dan port PON OLT untuk memetakan {stats.unassigned + stats.mismatch} pelanggan tanpa survei manual.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {selectedIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => openAiModal(selectedIds)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 transition"
                                        >
                                            <Sparkles size={15} />
                                            Analisis ({selectedIds.length}) Terpilih
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => openAiModal()}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-indigo-700 transition"
                                    >
                                        <Sparkles size={15} />
                                        Buka Rekomendasi AI
                                    </button>
                                </div>
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
                            <ResponsiveDataView
                                rows={displayRows}
                                columns={customerColumns}
                                keyField="id"
                                priorityFields={['name', 'pppoe_username', 'phone', 'odp_master_name']}
                                emptyMessage="Tidak ada data pelanggan."
                                rowClassName={(row) => selectedSet.has(row.id) ? 'bg-blue-50' : ''}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* AI Auto-Suggest Modal */}
            <Modal
                isOpen={aiModalOpen}
                onClose={() => setAiModalOpen(false)}
                title={
                    <div className="flex items-center gap-2 text-indigo-900">
                        <Sparkles size={22} className="text-indigo-600" />
                        <span>Kecerdasan AI Pemetaan ODP</span>
                    </div>
                }
                size="5xl"
            >
                <div className="space-y-4 p-1">
                    {/* Header Banner */}
                    <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/30 p-3 sm:p-4">
                        <p className="text-xs sm:text-sm text-gray-700">
                            Mesin AI menganalisis koordinat GPS tiang, kedekatan jarak dropcore, kesesuaian nama legacy ODP, serta jalur Port PON OLT untuk merekonstruksi topologi secara otomatis tanpa perlu survei manual tiang satu per satu.
                        </p>
                    </div>

                    {/* Summary KPI Cards */}
                    {aiSummary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
                                <p className="text-xs font-medium text-gray-500">Total Dianalisis</p>
                                <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{aiSummary.total_analyzed}</p>
                                <p className="text-[11px] text-gray-400">dari {aiSummary.total_unmapped} unmapped</p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
                                <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                                    <CheckCircle2 size={13} /> Keyakinan Tinggi
                                </p>
                                <p className="text-lg sm:text-xl font-bold text-emerald-700 mt-1">{aiSummary.high_confidence_count}</p>
                                <p className="text-[11px] text-emerald-600">Sangat akurat (1-klik)</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs">
                                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                                    <AlertTriangle size={13} /> Keyakinan Sedang
                                </p>
                                <p className="text-lg sm:text-xl font-bold text-amber-700 mt-1">{aiSummary.medium_confidence_count}</p>
                                <p className="text-[11px] text-amber-600">Jarak/nama terindikasi</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-xs">
                                <p className="text-xs font-medium text-slate-500">Keyakinan Rendah</p>
                                <p className="text-lg sm:text-xl font-bold text-slate-700 mt-1">{aiSummary.low_confidence_count}</p>
                                <p className="text-[11px] text-slate-400">Perlu cek tiang fisik</p>
                            </div>
                        </div>
                    )}

                    {/* Filter and Quick Select Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-3">
                        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setAiFilterTab('all')}
                                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                    aiFilterTab === 'all'
                                        ? 'bg-white text-gray-900 shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Semua Saran ({aiSuggestions.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAiFilterTab('high')}
                                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                    aiFilterTab === 'high'
                                        ? 'bg-white text-emerald-700 shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Keyakinan Tinggi ({aiSummary?.high_confidence_count || 0})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAiFilterTab('unmapped')}
                                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                    aiFilterTab === 'unmapped'
                                        ? 'bg-white text-blue-700 shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Belum Terpetakan ({aiSuggestions.filter((s) => !s.is_reassignment).length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAiFilterTab('reassign')}
                                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                    aiFilterTab === 'reassign'
                                        ? 'bg-white text-amber-700 shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Koreksi Salah ODP ({aiSuggestions.filter((s) => s.is_reassignment).length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAiFilterTab('has_gps')}
                                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                    aiFilterTab === 'has_gps'
                                        ? 'bg-white text-indigo-700 shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Berdasarkan GPS Tiang
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                                type="button"
                                onClick={selectAllHighConfidence}
                                className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100 transition"
                            >
                                ✓ Pilih Semua Tinggi
                            </button>
                            <button
                                type="button"
                                onClick={selectAllSuggestions}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 transition"
                            >
                                Pilih Semua
                            </button>
                            <button
                                type="button"
                                onClick={deselectAllSuggestions}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 font-medium hover:bg-gray-50 transition"
                            >
                                Batal Pilih
                            </button>
                        </div>
                    </div>

                    {/* Suggestions Content */}
                    {aiLoading ? (
                        <div className="py-12 text-center">
                            <LoadingSpinner text="AI sedang merekayasa balik topologi & mencocokkan ODP..." />
                        </div>
                    ) : filteredAiSuggestions.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
                            <Sparkles size={36} className="mx-auto text-gray-300 mb-2" />
                            <p className="font-semibold text-gray-700">Tidak ada saran ODP yang cocok.</p>
                            <p className="text-sm mt-1 text-gray-500">
                                Semua pelanggan yang diperiksa mungkin sudah terpetakan atau tidak memiliki data wilayah/GPS/legacy yang dapat dianalisis.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                            {filteredAiSuggestions.map((item) => {
                                const isSelected = aiSelectedIds.has(item.customer_id);
                                const chosenOdpId = aiCustomAssignments[item.customer_id] || item.suggested_odp_id;
                                const isCapacityFull = item.flags?.includes('odp_full');

                                return (
                                    <div
                                        key={item.customer_id}
                                        className={`rounded-xl border p-3 sm:p-3.5 transition ${
                                            isSelected
                                                ? 'border-indigo-300 bg-indigo-50/40 shadow-xs'
                                                : 'border-gray-200 bg-white hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleAiSelect(item.customer_id)}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />

                                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                                                {/* Customer Info */}
                                                <div className="lg:col-span-4">
                                                    <p className="font-bold text-gray-900 text-sm">{item.customer_name}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                                                        {item.pppoe_username ? `PPPoE: ${item.pppoe_username}` : `Telp: ${item.phone || '-'}`}
                                                    </p>
                                                    <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                                                        {item.address || 'Alamat tidak tercatat'}
                                                    </p>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {item.is_reassignment ? (
                                                            <span className="inline-flex items-center text-[11px] bg-red-100 text-red-800 font-semibold px-2 py-0.5 rounded">
                                                                ⚠️ Salah ODP: <span className="line-through ml-1">{item.current_odp_name}</span> {item.current_distance_meters ? `(${item.current_distance_meters}m)` : ''}
                                                            </span>
                                                        ) : item.legacy_odp ? (
                                                            <span className="inline-flex items-center text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                                                                Catatan: {item.legacy_odp}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">Belum Terpetakan</span>
                                                        )}
                                                        {item.has_coordinates && (
                                                            <span className="inline-flex items-center gap-0.5 text-[11px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">
                                                                <MapPin size={10} /> GPS Aktif
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Arrow */}
                                                <div className="hidden lg:flex lg:col-span-1 justify-center items-center pt-2 text-indigo-400">
                                                    <ArrowRight size={20} />
                                                </div>

                                                {/* AI Recommendation */}
                                                <div className="lg:col-span-7 bg-white/90 rounded-xl border border-gray-200/80 p-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-gray-900 text-sm">
                                                                {item.suggested_odp_name}
                                                            </span>
                                                            {item.distance_saving_meters ? (
                                                                <span className="text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                                                    ✨ Lebih dekat {item.distance_saving_meters}m
                                                                </span>
                                                            ) : null}
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                                                                    item.confidence === 'high'
                                                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                                        : item.confidence === 'medium'
                                                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                                                        : 'bg-slate-100 text-slate-700 border-slate-300'
                                                                }`}
                                                            >
                                                                <Sparkles size={11} />
                                                                {item.score}% {item.confidence === 'high' ? 'Yakin' : item.confidence === 'medium' ? 'Sedang' : 'Rendah'}
                                                            </span>
                                                        </div>

                                                        {item.distance_meters !== null && (
                                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                                                <MapPin size={11} /> {Math.round(item.distance_meters)} meter
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Reasons list */}
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {item.reasons?.map((reason, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="inline-flex items-center text-[11px] text-gray-700 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md"
                                                            >
                                                                ✓ {reason}
                                                            </span>
                                                        ))}
                                                        {isCapacityFull && (
                                                            <span className="inline-flex items-center text-[11px] text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md font-semibold">
                                                                ⚠️ ODP Penuh ({item.occupied_ports}/{item.total_ports})
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Alternative ODP Selector */}
                                                    {item.alternatives?.length > 0 && (
                                                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-2 text-xs">
                                                            <span className="text-gray-500 font-medium">Alternatif:</span>
                                                            <select
                                                                value={chosenOdpId}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setAiCustomAssignments((prev) => ({
                                                                        ...prev,
                                                                        [item.customer_id]: val,
                                                                    }));
                                                                }}
                                                                className="px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
                                                            >
                                                                <option value={item.suggested_odp_id}>
                                                                    (Utama) {item.suggested_odp_name} — {item.score}%
                                                                </option>
                                                                {item.alternatives.map((alt) => (
                                                                    <option key={alt.odp_id} value={alt.odp_id}>
                                                                        (Alt) {alt.odp_name} {alt.distance_meters ? `(${Math.round(alt.distance_meters)}m)` : ''} — {alt.score}%
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Modal Footer */}
                    <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-gray-600">
                            Terpilih: <span className="font-bold text-indigo-700">{aiSelectedIds.size}</span> dari {filteredAiSuggestions.length} saran
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setAiModalOpen(false)}
                                disabled={aiApplying}
                            >
                                Batal
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={handleApplyAiSuggestions}
                                disabled={aiSelectedIds.size === 0 || aiApplying}
                                className="!bg-gradient-to-r !from-indigo-600 !to-purple-600 hover:!from-indigo-700 hover:!to-purple-700"
                            >
                                {aiApplying ? (
                                    <span className="flex items-center gap-1.5">
                                        <RefreshCw size={14} className="animate-spin" /> Menerapkan...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 font-bold">
                                        <Sparkles size={15} /> Terapkan ({aiSelectedIds.size}) Pemetaan Terpilih
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default OdpMappingPage;

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, GitBranchPlus, Plus, Trash2 } from 'lucide-react';
import apiClient from '../../services/api';

const NODE_COLORS = {
    OLT: '#0f766e',
    ODC: '#0369a1',
    ODP: '#7c3aed',
};

const CABLE_COLOR_HEX = {
    merah: '#dc2626',
    biru: '#2563eb',
    hijau: '#16a34a',
    kuning: '#ca8a04',
    hitam: '#1f2937',
    putih: '#e5e7eb',
    oranye: '#ea580c',
};

const CABLE_TYPE_OPTIONS = ['1 core', '2 core', '4 core', '8 core', '12 core', '24 core'];
const CABLE_COLOR_OPTIONS = ['merah', 'biru', 'hijau', 'kuning', 'hitam', 'putih', 'oranye'];
const SOURCE_TYPE_OPTIONS = ['OLT', 'ODC', 'ODP'];

const INITIAL_NODE = {
    id: 'olt-root',
    nodeType: 'OLT',
    label: 'OLT Utama',
    parentId: '',
    cableType: '',
    cableColor: '',
    attenuationIn: '',
    attenuationOut: '',
};

function getAllowedParentTypes(nodeType) {
    if (nodeType === 'OLT') return [];
    if (nodeType === 'ODC') return ['OLT', 'ODC'];
    return ['OLT', 'ODC', 'ODP'];
}

function toNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatDb(value) {
    if (value === null || value === undefined || value === '') {
        return '-';
    }
    return `${value} dB`;
}

function calculateLoss(inValue, outValue) {
    const inDb = toNumber(inValue);
    const outDb = toNumber(outValue);

    if (inDb === null || outDb === null) {
        return null;
    }

    return Number.parseFloat((outDb - inDb).toFixed(2));
}

function getCableStrokeColor(cableType, cableColor) {
    if (cableType === '1 core') {
        return '#6b7280';
    }

    if (!cableColor) {
        return '#0891b2';
    }

    return CABLE_COLOR_HEX[cableColor] || '#0891b2';
}

function buildMindmapLayout(nodes) {
    const childrenMap = new Map();

    nodes.forEach((node) => {
        if (!node.parentId) return;
        if (!childrenMap.has(node.parentId)) {
            childrenMap.set(node.parentId, []);
        }
        childrenMap.get(node.parentId).push(node.id);
    });

    const roots = nodes.filter((node) => !node.parentId).map((node) => node.id);
    const levelById = new Map();

    const visit = (nodeId, depth, visited = new Set()) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const currentDepth = levelById.get(nodeId);
        if (currentDepth === undefined || depth < currentDepth) {
            levelById.set(nodeId, depth);
        }

        const children = childrenMap.get(nodeId) || [];
        children.forEach((childId) => visit(childId, depth + 1, new Set(visited)));
    };

    roots.forEach((rootId) => visit(rootId, 0));

    const levels = new Map();
    nodes.forEach((node) => {
        const level = levelById.get(node.id) ?? 0;
        if (!levels.has(level)) {
            levels.set(level, []);
        }
        levels.get(level).push(node);
    });

    const levelKeys = [...levels.keys()].sort((a, b) => a - b);
    const positions = new Map();

    levelKeys.forEach((level) => {
        const items = levels.get(level);
        items.forEach((node, index) => {
            positions.set(node.id, {
                x: 140 + level * 290,
                y: 110 + index * 150,
            });
        });
    });

    return positions;
}

export default function DistributionRoutePage() {
    const [nodes, setNodes] = useState([INITIAL_NODE]);
    const [loadingRoute, setLoadingRoute] = useState(true);
    const [loadingOdps, setLoadingOdps] = useState(true);
    const [message, setMessage] = useState('');
    const [autosaveStatus, setAutosaveStatus] = useState('idle');
    const [odps, setOdps] = useState([]);
    const isInitialLoadDoneRef = useRef(false);
    const autosaveTimeoutRef = useRef(null);
    const [form, setForm] = useState({
        nodeType: 'ODP',
        label: '',
        odpId: '',
        sourceType: 'OLT',
        parentId: 'olt-root',
        cableType: '1 core',
        cableColor: '',
        attenuationIn: '',
        attenuationOut: '',
    });

    const parentCandidates = useMemo(() => {
        const allowed = getAllowedParentTypes(form.nodeType);
        if (allowed.length === 0) return [];

        return nodes.filter((node) => {
            if (!allowed.includes(node.nodeType)) return false;
            if (form.nodeType === 'ODP') {
                return node.nodeType === form.sourceType;
            }
            return true;
        });
    }, [form.nodeType, form.sourceType, nodes]);

    const positions = useMemo(() => buildMindmapLayout(nodes), [nodes]);

    const availableOdpOptions = useMemo(() => {
        const usedOdpIds = new Set(
            nodes
                .filter((node) => node.nodeType === 'ODP' && node.odpId)
                .map((node) => Number(node.odpId))
        );

        return odps.filter((odp) => !usedOdpIds.has(Number(odp.id)) || Number(odp.id) === Number(form.odpId));
    }, [nodes, odps, form.odpId]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoadingOdps(true);
                const odpResponse = await apiClient.get('/odp');
                setOdps(odpResponse.data?.data || []);

                setLoadingRoute(true);
                const response = await apiClient.get('/distribution-routes/latest');
                const routeData = response.data?.data;

                if (routeData?.nodes?.length) {
                    setNodes(routeData.nodes);
                    setMessage('Data jalur terakhir berhasil dimuat dari database.');
                }
            } catch (error) {
                setMessage('Gagal memuat data jalur/ODP dari database.');
            } finally {
                setLoadingRoute(false);
                setLoadingOdps(false);
                isInitialLoadDoneRef.current = true;
            }
        };

        fetchInitialData();
    }, []);

    useEffect(() => {
        if (!isInitialLoadDoneRef.current) {
            return;
        }

        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
        }

        autosaveTimeoutRef.current = setTimeout(async () => {
            try {
                setAutosaveStatus('saving');
                await apiClient.post('/distribution-routes/save', {
                    nodes,
                });
                setAutosaveStatus('saved');
                setMessage('Perubahan tersimpan otomatis.');
            } catch (error) {
                setAutosaveStatus('error');
                setMessage('Gagal menyimpan otomatis ke database.');
            }
        }, 700);

        return () => {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
            }
        };
    }, [nodes]);

    const edgeData = useMemo(() => {
        return nodes
            .filter((node) => node.parentId)
            .map((node) => {
                const from = positions.get(node.parentId);
                const to = positions.get(node.id);
                const lossDb = calculateLoss(node.attenuationIn, node.attenuationOut);

                return {
                    id: node.id,
                    from,
                    to,
                    cableType: node.cableType,
                    cableColor: node.cableColor,
                    attenuationIn: node.attenuationIn,
                    attenuationOut: node.attenuationOut,
                    lossDb,
                };
            })
            .filter((edge) => edge.from && edge.to);
    }, [nodes, positions]);

    const maxX = Math.max(...[...positions.values()].map((p) => p.x), 0) + 220;
    const maxY = Math.max(...[...positions.values()].map((p) => p.y), 0) + 120;

    const onInput = (key, value) => {
        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const onNodeTypeChange = (nodeType) => {
        setForm((prev) => ({
            ...prev,
            nodeType,
            label: '',
            odpId: '',
            sourceType: 'OLT',
            parentId: '',
        }));
    };

    const addNode = (event) => {
        event.preventDefault();

        const selectedOdp = odps.find((item) => Number(item.id) === Number(form.odpId));
        const trimmedLabel = form.nodeType === 'ODP' ? (selectedOdp?.nama || '').trim() : form.label.trim();
        if (!trimmedLabel) {
            alert(form.nodeType === 'ODP' ? 'Silakan pilih ODP dari data Kelola ODP.' : 'Nama titik jalur wajib diisi.');
            return;
        }

        if (form.nodeType !== 'OLT' && !form.parentId) {
            alert('Silakan pilih titik sumber/jalur masuk terlebih dahulu.');
            return;
        }

        const id = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const nextNode = {
            id,
            nodeType: form.nodeType,
            label: trimmedLabel,
            odpId: form.nodeType === 'ODP' ? Number(form.odpId) : null,
            parentId: form.nodeType === 'OLT' ? '' : form.parentId,
            cableType: form.nodeType === 'OLT' ? '' : form.cableType,
            cableColor: form.cableType === '1 core' ? '' : form.cableColor,
            attenuationIn: form.nodeType === 'OLT' ? '' : form.attenuationIn,
            attenuationOut: form.nodeType === 'OLT' ? '' : form.attenuationOut,
        };

        setNodes((prev) => [...prev, nextNode]);
        setForm((prev) => ({
            ...prev,
            label: '',
            odpId: '',
            parentId: '',
            attenuationIn: '',
            attenuationOut: '',
        }));
    };

    const removeNode = (nodeId) => {
        if (nodeId === 'olt-root') {
            alert('OLT utama tidak bisa dihapus.');
            return;
        }

        setNodes((prev) => {
            const childMap = new Map();

            prev.forEach((node) => {
                if (!node.parentId) return;
                if (!childMap.has(node.parentId)) {
                    childMap.set(node.parentId, []);
                }
                childMap.get(node.parentId).push(node.id);
            });

            const idsToDelete = new Set([nodeId]);
            const stack = [nodeId];

            while (stack.length > 0) {
                const currentId = stack.pop();
                const children = childMap.get(currentId) || [];
                children.forEach((childId) => {
                    if (!idsToDelete.has(childId)) {
                        idsToDelete.add(childId);
                        stack.push(childId);
                    }
                });
            }

            return prev.filter((node) => !idsToDelete.has(node.id));
        });
    };

    const exportSvg = () => {
        const svgElement = document.getElementById('distribution-mindmap-svg');
        if (!svgElement) return;

        const serializer = new XMLSerializer();
        const source = serializer.serializeToString(svgElement);
        const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `jalur-distribusi-${new Date().toISOString().slice(0, 10)}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-r from-cyan-700 via-sky-700 to-indigo-700 p-6 text-white shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="text-sm font-semibold text-cyan-100">Mode global: satu data untuk semua jalur distribusi</div>
                        <div className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white">
                            {autosaveStatus === 'saving' && 'Sedang menyimpan...'}
                            {autosaveStatus === 'saved' && 'Tersimpan otomatis'}
                            {autosaveStatus === 'error' && 'Gagal simpan otomatis'}
                            {autosaveStatus === 'idle' && 'Belum ada perubahan'}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={exportSvg}
                            className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/30"
                        >
                            <Download size={16} />
                            Unduh Gambar SVG
                        </button>
                    </div>
                </div>
                {message && (
                    <div className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-white">
                        {message}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="xl:col-span-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <GitBranchPlus size={18} className="text-sky-700" />
                            <h2 className="text-lg font-semibold text-slate-800">Tambah Titik Jalur</h2>
                        </div>

                        <form onSubmit={addNode} className="space-y-3">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Jenis Titik</label>
                                <select
                                    value={form.nodeType}
                                    onChange={(e) => onNodeTypeChange(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                >
                                    <option value="OLT">OLT</option>
                                    <option value="ODC">ODC</option>
                                    <option value="ODP">ODP</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">{form.nodeType === 'ODP' ? 'Pilih ODP (dari Kelola ODP)' : 'Nama Titik'}</label>
                                {form.nodeType === 'ODP' ? (
                                    <select
                                        value={form.odpId}
                                        onChange={(e) => onInput('odpId', e.target.value)}
                                        disabled={loadingOdps}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-100"
                                    >
                                        <option value="">{loadingOdps ? 'Memuat data ODP...' : 'Pilih ODP'}</option>
                                        {availableOdpOptions.map((odp) => (
                                            <option key={odp.id} value={odp.id}>
                                                {odp.nama}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={form.label}
                                        onChange={(e) => onInput('label', e.target.value)}
                                        placeholder="Contoh: ODC A1"
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                    />
                                )}
                            </div>

                            {form.nodeType === 'ODP' && (
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">In ODP Dari</label>
                                    <select
                                        value={form.sourceType}
                                        onChange={(e) => {
                                            onInput('sourceType', e.target.value);
                                            onInput('parentId', '');
                                        }}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                    >
                                        {SOURCE_TYPE_OPTIONS.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {form.nodeType !== 'OLT' && (
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Sumber Jalur</label>
                                    <select
                                        value={form.parentId}
                                        onChange={(e) => onInput('parentId', e.target.value)}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                    >
                                        <option value="">Pilih sumber jalur</option>
                                        {parentCandidates.map((candidate) => (
                                            <option key={candidate.id} value={candidate.id}>
                                                {candidate.nodeType} - {candidate.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {form.nodeType !== 'OLT' && (
                                <>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">Jenis Kabel</label>
                                        <select
                                            value={form.cableType}
                                            onChange={(e) => {
                                                onInput('cableType', e.target.value);
                                                if (e.target.value === '1 core') {
                                                    onInput('cableColor', '');
                                                }
                                            }}
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                        >
                                            {CABLE_TYPE_OPTIONS.map((type) => (
                                                <option key={type} value={type}>
                                                    {type}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">Warna Kabel</label>
                                        <select
                                            value={form.cableColor}
                                            onChange={(e) => onInput('cableColor', e.target.value)}
                                            disabled={form.cableType === '1 core'}
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                                        >
                                            <option value="">{form.cableType === '1 core' ? 'Tidak ada warna (1 core)' : 'Pilih warna kabel'}</option>
                                            {CABLE_COLOR_OPTIONS.map((color) => (
                                                <option key={color} value={color}>
                                                    {color}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-700">Redaman In (dB)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={form.attenuationIn}
                                                onChange={(e) => onInput('attenuationIn', e.target.value)}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-700">Redaman Out (dB)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={form.attenuationOut}
                                                onChange={(e) => onInput('attenuationOut', e.target.value)}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <button
                                type="submit"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800"
                            >
                                <Plus size={16} />
                                Tambah ke Jalur
                            </button>
                        </form>
                    </div>
                </div>

                <div className="xl:col-span-8">
                    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <svg
                            id="distribution-mindmap-svg"
                            xmlns="http://www.w3.org/2000/svg"
                            width={Math.max(maxX, 920)}
                            height={Math.max(maxY, 500)}
                            viewBox={`0 0 ${Math.max(maxX, 920)} ${Math.max(maxY, 500)}`}
                            className="h-auto w-full"
                        >
                            <defs>
                                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                                    <path d="M0,0 L8,4 L0,8 z" fill="#475569" />
                                </marker>
                            </defs>

                            {edgeData.map((edge) => {
                                const startX = edge.from.x + 95;
                                const startY = edge.from.y;
                                const endX = edge.to.x - 95;
                                const endY = edge.to.y;
                                const midX = (startX + endX) / 2;
                                const strokeColor = getCableStrokeColor(edge.cableType, edge.cableColor);

                                return (
                                    <g key={`edge-${edge.id}`}>
                                        <path
                                            d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                                            fill="none"
                                            stroke={strokeColor}
                                            strokeWidth="3"
                                            markerEnd="url(#arrow)"
                                        />
                                        <text x={midX} y={(startY + endY) / 2 - 10} textAnchor="middle" fontSize="11" fill="#334155">
                                            {edge.cableType || '-'}
                                            {edge.cableType === '1 core' ? ' / tanpa warna' : edge.cableColor ? ` / ${edge.cableColor}` : ''}
                                        </text>
                                        <text x={midX} y={(startY + endY) / 2 + 8} textAnchor="middle" fontSize="11" fill="#475569">
                                            in: {formatDb(edge.attenuationIn)} | out: {formatDb(edge.attenuationOut)} | loss:{' '}
                                            {edge.lossDb === null ? '-' : `${edge.lossDb} dB`}
                                        </text>
                                    </g>
                                );
                            })}

                            {nodes.map((node) => {
                                const position = positions.get(node.id);
                                if (!position) return null;

                                return (
                                    <g key={node.id} transform={`translate(${position.x - 95}, ${position.y - 32})`}>
                                        <rect width="190" height="64" rx="12" fill="#ffffff" stroke={NODE_COLORS[node.nodeType]} strokeWidth="2.5" />
                                        <text x="95" y="24" textAnchor="middle" fontSize="12" fontWeight="700" fill={NODE_COLORS[node.nodeType]}>
                                            {node.nodeType}
                                        </text>
                                        <text x="95" y="44" textAnchor="middle" fontSize="13" fill="#0f172a">
                                            {node.label}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold text-slate-800">Ringkasan Titik Jalur</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {nodes.map((node) => {
                        const lossDb = calculateLoss(node.attenuationIn, node.attenuationOut);
                        const parent = nodes.find((item) => item.id === node.parentId);

                        return (
                            <div key={`card-${node.id}`} className="rounded-xl border border-slate-200 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: NODE_COLORS[node.nodeType] }}>
                                        {node.nodeType}
                                    </span>
                                    {node.id !== 'olt-root' && (
                                        <button
                                            type="button"
                                            onClick={() => removeNode(node.id)}
                                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                            title="Hapus titik"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-slate-900">{node.label}</p>
                                <p className="mt-1 text-xs text-slate-500">Sumber: {parent ? `${parent.nodeType} - ${parent.label}` : '-'}</p>
                                <p className="mt-2 text-xs text-slate-600">
                                    Kabel: {node.cableType || '-'}
                                    {node.cableType === '1 core' ? ' (tanpa warna)' : node.cableColor ? ` / ${node.cableColor}` : ''}
                                </p>
                                <p className="text-xs text-slate-600">Redaman in: {formatDb(node.attenuationIn)}</p>
                                <p className="text-xs text-slate-600">Redaman out: {formatDb(node.attenuationOut)}</p>
                                <p className="text-xs font-semibold text-slate-700">Loss redaman: {lossDb === null ? '-' : `${lossDb} dB`}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

import { useState, useMemo } from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowDown,
    ArrowRight,
    Cable,
    Check,
    ChevronDown,
    Cpu,
    GitBranch,
    Layers,
    Link,
    Network,
    Plus,
    Radio,
    Settings,
    Sparkles,
    Trash2,
    Zap,
} from 'lucide-react';

export const SPECIAL_RATIO_TABLE = {
    '1:99': { tap_loss: 20.5, thru_loss: 0.15, tap_pct: 1, thru_pct: 99 },
    '2:98': { tap_loss: 17.5, thru_loss: 0.20, tap_pct: 2, thru_pct: 98 },
    '3:97': { tap_loss: 15.7, thru_loss: 0.25, tap_pct: 3, thru_pct: 97 },
    '5:95': { tap_loss: 13.5, thru_loss: 0.35, tap_pct: 5, thru_pct: 95 },
    '10:90': { tap_loss: 10.5, thru_loss: 0.60, tap_pct: 10, thru_pct: 90 },
    '15:85': { tap_loss: 8.7, thru_loss: 0.85, tap_pct: 15, thru_pct: 85 },
    '20:80': { tap_loss: 7.4, thru_loss: 1.10, tap_pct: 20, thru_pct: 80 },
    '25:75': { tap_loss: 6.4, thru_loss: 1.40, tap_pct: 25, thru_pct: 75 },
    '30:70': { tap_loss: 5.6, thru_loss: 1.75, tap_pct: 30, thru_pct: 70 },
    '70:30': { tap_loss: 5.6, thru_loss: 1.75, tap_pct: 30, thru_pct: 70 },
    '35:65': { tap_loss: 4.9, thru_loss: 2.05, tap_pct: 35, thru_pct: 65 },
    '40:60': { tap_loss: 4.3, thru_loss: 2.40, tap_pct: 40, thru_pct: 60 },
    '45:55': { tap_loss: 3.8, thru_loss: 2.80, tap_pct: 45, thru_pct: 55 },
    '50:50': { tap_loss: 3.4, thru_loss: 3.40, tap_pct: 50, thru_pct: 50 },
};

export const PLC_RATIO_TABLE = {
    '1:2': { loss: 3.6, ports: 2 },
    '1:4': { loss: 7.2, ports: 4 },
    '1:8': { loss: 10.5, ports: 8 },
    '1:16': { loss: 13.8, ports: 16 },
    '1:32': { loss: 17.0, ports: 32 },
};

/**
 * Visual Schematic Diagram for FTTH ODP / ODC Enclosure
 */
export default function OdpInternalSchematic({
    schematic,
    onChange,
    inputPower = 9.84,
    availableOdps = [],
    availableOdcs = [],
    availableOlts = [],
    customerList = [],
    childOdps = [],
    totalPorts = 8,
    isOdc = false,
    onApplySummary,
    onCustomerPortChange,
}) {
    const [selectedModuleId, setSelectedModuleId] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({
        type: 'asymmetric',
        ratio: '10:90',
        in_source: 'feeder_in',
    });

    const modules = schematic?.modules || [];
    const inputSource = schematic?.input_source || { type: 'pon', id: '', label: 'PON OLT' };

    // Calculate optical power at every node & pin
    const calculatedPowers = useMemo(() => {
        const powers = {
            feeder_in: Number(inputPower) || 9.84,
        };

        modules.forEach((mod) => {
            const inPow = powers[mod.in_source] ?? (Number(inputPower) || 9.84);
            powers[`${mod.id}:in`] = inPow;

            if (mod.type === 'asymmetric') {
                const spec = SPECIAL_RATIO_TABLE[mod.ratio] || { tap_loss: 10.5, thru_loss: 0.60, tap_pct: 10, thru_pct: 90 };
                powers[`${mod.id}:thru`] = Number((inPow - spec.thru_loss).toFixed(2));
                powers[`${mod.id}:tap`] = Number((inPow - spec.tap_loss).toFixed(2));
            } else {
                const spec = PLC_RATIO_TABLE[mod.ratio] || { loss: 7.2, ports: 4 };
                const count = spec.ports || 4;
                for (let i = 1; i <= count; i++) {
                    powers[`${mod.id}:out_${i}`] = Number((inPow - spec.loss).toFixed(2));
                }
            }
        });

        return powers;
    }, [modules, inputPower]);

    // Available input sources that can feed into a module
    const availableInputSources = useMemo(() => {
        const sources = [
            { id: 'feeder_in', label: `⚡ Feeder Utama Masuk (${(calculatedPowers['feeder_in'] ?? 9.84).toFixed(2)} dBm)` },
        ];

        modules.forEach((mod) => {
            if (mod.type === 'asymmetric') {
                sources.push({
                    id: `${mod.id}:thru`,
                    label: `🔗 ${mod.name} ── Out Thru (Rasio Besar: ${calculatedPowers[`${mod.id}:thru`]} dBm)`,
                    moduleId: mod.id,
                });
                sources.push({
                    id: `${mod.id}:tap`,
                    label: `🔗 ${mod.name} ── Out Tap (Rasio Kecil: ${calculatedPowers[`${mod.id}:tap`]} dBm)`,
                    moduleId: mod.id,
                });
            } else {
                const spec = PLC_RATIO_TABLE[mod.ratio] || { ports: 4 };
                for (let i = 1; i <= spec.ports; i++) {
                    sources.push({
                        id: `${mod.id}:out_${i}`,
                        label: `🔗 ${mod.name} ── Out ${i} (${calculatedPowers[`${mod.id}:out_${i}`]} dBm)`,
                        moduleId: mod.id,
                    });
                }
            }
        });

        return sources;
    }, [modules, calculatedPowers]);

    // Map of physical port -> array of { moduleId, outputKey, moduleName, moduleIndex }
    // Only leaf outputs (not consumed internally by another module) occupy physical ports
    const claimedPortMap = useMemo(() => {
        const map = {};
        modules.forEach((m, mIdx) => {
            Object.entries(m.outputs || {}).forEach(([k, out]) => {
                const isInternal = modules.some(other => other.in_source === `${m.id}:${k}`);
                if (!isInternal && out?.target_type === 'port' && out?.target_id) {
                    const p = Number(out.target_id);
                    if (!map[p]) {
                        map[p] = [];
                    }
                    map[p].push({
                        moduleId: m.id,
                        outputKey: k,
                        moduleName: m.name || `Modul #${mIdx + 1}`,
                        moduleIndex: mIdx + 1,
                    });
                }
            });
        });
        return map;
    }, [modules]);

    // Apply quick presets
    const handleApplyPreset = (presetKey) => {
        let newModules = [];
        let newSpecial = 'none';
        let newDist = '1:8';
        let newCapacity = totalPorts;

        if (presetKey === 'estafet_10_90_1_2') {
            newSpecial = '10:90';
            newDist = '1:2';
            newCapacity = 2;
            newModules = [
                {
                    id: 'mod_tap_1',
                    name: 'Coupler Tap 10:90',
                    type: 'asymmetric',
                    ratio: '10:90',
                    in_source: 'feeder_in',
                    outputs: {
                        thru: {
                            label: 'Thru (90%)',
                            target_type: 'next_hop',
                            target_id: null,
                            target_label: 'Jalur ke ODP Hilir',
                        },
                        tap: {
                            label: 'Tap (10%)',
                            target_type: 'module',
                            target_id: 'mod_plc_1',
                            target_label: 'Masuk ke Splitter 1:2',
                        },
                    },
                },
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:2',
                    type: 'plc',
                    ratio: '1:2',
                    in_source: 'mod_tap_1:tap',
                    outputs: {
                        out_1: { label: 'Out 1', target_type: 'port', target_id: 1, target_label: 'Port Pelanggan 1' },
                        out_2: { label: 'Out 2', target_type: 'port', target_id: 2, target_label: 'Port Pelanggan 2' },
                    },
                },
            ];
        } else if (presetKey === 'estafet_10_90_1_4') {
            newSpecial = '10:90';
            newDist = '1:4';
            newCapacity = 4;
            newModules = [
                {
                    id: 'mod_tap_1',
                    name: 'Coupler Tap 10:90',
                    type: 'asymmetric',
                    ratio: '10:90',
                    in_source: 'feeder_in',
                    outputs: {
                        thru: {
                            label: 'Thru (90%)',
                            target_type: 'next_hop',
                            target_id: null,
                            target_label: 'Jalur ke ODP Hilir',
                        },
                        tap: {
                            label: 'Tap (10%)',
                            target_type: 'module',
                            target_id: 'mod_plc_1',
                            target_label: 'Masuk ke Splitter 1:4',
                        },
                    },
                },
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:4',
                    type: 'plc',
                    ratio: '1:4',
                    in_source: 'mod_tap_1:tap',
                    outputs: {
                        out_1: { label: 'Out 1', target_type: 'port', target_id: 1, target_label: 'Port Pelanggan 1' },
                        out_2: { label: 'Out 2', target_type: 'port', target_id: 2, target_label: 'Port Pelanggan 2' },
                        out_3: { label: 'Out 3', target_type: 'port', target_id: 3, target_label: 'Port Pelanggan 3' },
                        out_4: { label: 'Out 4', target_type: 'port', target_id: 4, target_label: 'Port Pelanggan 4' },
                    },
                },
            ];
        } else if (presetKey === 'estafet_10_90_1_8') {
            newSpecial = '10:90';
            newDist = '1:8';
            newCapacity = 8;
            newModules = [
                {
                    id: 'mod_tap_1',
                    name: 'Coupler Tap 10:90',
                    type: 'asymmetric',
                    ratio: '10:90',
                    in_source: 'feeder_in',
                    outputs: {
                        thru: {
                            label: 'Thru (90%)',
                            target_type: 'next_hop',
                            target_id: null,
                            target_label: 'Jalur ke ODP Hilir',
                        },
                        tap: {
                            label: 'Tap (10%)',
                            target_type: 'module',
                            target_id: 'mod_plc_1',
                            target_label: 'Masuk ke Splitter 1:8',
                        },
                    },
                },
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:8',
                    type: 'plc',
                    ratio: '1:8',
                    in_source: 'mod_tap_1:tap',
                    outputs: Array.from({ length: 8 }, (_, i) => ({
                        label: `Out ${i + 1}`,
                        target_type: 'port',
                        target_id: i + 1,
                        target_label: `Port Pelanggan ${i + 1}`,
                    })).reduce((acc, curr, idx) => ({ ...acc, [`out_${idx + 1}`]: curr }), {}),
                },
            ];
        } else if (presetKey === 'direct_1_2') {
            newSpecial = 'none';
            newDist = '1:2';
            newCapacity = 2;
            newModules = [
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:2 Langsung',
                    type: 'plc',
                    ratio: '1:2',
                    in_source: 'feeder_in',
                    outputs: {
                        out_1: { label: 'Out 1', target_type: 'port', target_id: 1, target_label: 'Port Pelanggan 1' },
                        out_2: { label: 'Out 2', target_type: 'port', target_id: 2, target_label: 'Port Pelanggan 2' },
                    },
                },
            ];
        } else if (presetKey === 'direct_1_4') {
            newSpecial = 'none';
            newDist = '1:4';
            newCapacity = 4;
            newModules = [
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:4 Langsung',
                    type: 'plc',
                    ratio: '1:4',
                    in_source: 'feeder_in',
                    outputs: {
                        out_1: { label: 'Out 1', target_type: 'port', target_id: 1, target_label: 'Port Pelanggan 1' },
                        out_2: { label: 'Out 2', target_type: 'port', target_id: 2, target_label: 'Port Pelanggan 2' },
                        out_3: { label: 'Out 3', target_type: 'port', target_id: 3, target_label: 'Port Pelanggan 3' },
                        out_4: { label: 'Out 4', target_type: 'port', target_id: 4, target_label: 'Port Pelanggan 4' },
                    },
                },
            ];
        } else if (presetKey === 'direct_1_8') {
            newSpecial = 'none';
            newDist = '1:8';
            newCapacity = 8;
            newModules = [
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:8 Langsung',
                    type: 'plc',
                    ratio: '1:8',
                    in_source: 'feeder_in',
                    outputs: Array.from({ length: 8 }, (_, i) => ({
                        label: `Out ${i + 1}`,
                        target_type: 'port',
                        target_id: i + 1,
                        target_label: `Port Pelanggan ${i + 1}`,
                    })).reduce((acc, curr, idx) => ({ ...acc, [`out_${idx + 1}`]: curr }), {}),
                },
            ];
        } else if (presetKey === 'odc_transit_1_2') {
            newSpecial = 'none';
            newDist = 'none';
            newCapacity = isOdc ? 24 : 2;
            newModules = [
                {
                    id: 'mod_plc_1',
                    name: 'Splitter PLC 1:2 Transit',
                    type: 'plc',
                    ratio: '1:2',
                    in_source: 'feeder_in',
                    outputs: {
                        out_1: { label: 'Out 1', target_type: 'next_hop', target_id: null, target_label: 'Ke Cabang ODP A' },
                        out_2: { label: 'Out 2', target_type: 'next_hop', target_id: null, target_label: 'Ke Cabang ODP B' },
                    },
                },
            ];
        }

        const updated = {
            ...schematic,
            modules: newModules,
        };
        onChange(updated);
        onApplySummary?.({
            rasio_spesial: newSpecial,
            rasio_distribusi: newDist,
            total_ports: newCapacity,
        });
    };

    // Add new module handler
    const handleAddModule = () => {
        const id = 'mod_' + Date.now();
        let newMod = null;

        // Set of currently claimed ports across all modules
        const usedPorts = new Set(
            Object.keys(claimedPortMap).map((p) => Number(p))
        );

        let portCounter = 1;
        const getNextAvailablePort = () => {
            while (usedPorts.has(portCounter)) {
                portCounter++;
            }
            usedPorts.add(portCounter);
            return portCounter;
        };

        if (addForm.type === 'asymmetric') {
            const tapPort = getNextAvailablePort();
            newMod = {
                id,
                name: `Coupler Tap ${addForm.ratio}`,
                type: 'asymmetric',
                ratio: addForm.ratio,
                in_source: addForm.in_source,
                outputs: {
                    thru: {
                        label: 'Thru (Rasio Besar)',
                        target_type: 'next_hop',
                        target_id: null,
                        target_label: 'Jalur ke ODP Hilir',
                    },
                    tap: {
                        label: 'Tap (Rasio Kecil)',
                        target_type: 'port',
                        target_id: tapPort,
                        target_label: `Port Pelanggan ${tapPort}`,
                    },
                },
            };
        } else {
            const spec = PLC_RATIO_TABLE[addForm.ratio] || { ports: 4 };
            const count = spec.ports || 4;
            const outputs = {};
            for (let i = 1; i <= count; i++) {
                const assignedPort = getNextAvailablePort();
                outputs[`out_${i}`] = {
                    label: `Out ${i}`,
                    target_type: 'port',
                    target_id: assignedPort,
                    target_label: `Port Pelanggan ${assignedPort}`,
                };
            }

            newMod = {
                id,
                name: `Splitter PLC ${addForm.ratio}`,
                type: 'plc',
                ratio: addForm.ratio,
                in_source: addForm.in_source,
                outputs,
            };
        }

        const updated = {
            ...schematic,
            modules: [...modules, newMod],
        };
        onChange(updated);

        if (addForm.type === 'plc' && !isOdc) {
            const spec = PLC_RATIO_TABLE[addForm.ratio] || { ports: 4 };
            onApplySummary?.({
                rasio_distribusi: addForm.ratio,
                total_ports: Math.max(totalPorts || 0, Math.max(...Array.from(usedPorts), spec.ports)),
            });
        }

        setShowAddModal(false);
    };

    // Remove module handler
    const handleRemoveModule = (modId) => {
        const updatedModules = modules.filter((m) => m.id !== modId);
        // Remap any references pointing to this module back to feeder_in
        const sanitized = updatedModules.map((m) => {
            if (m.in_source.startsWith(`${modId}:`)) {
                return { ...m, in_source: 'feeder_in' };
            }
            return m;
        });

        onChange({
            ...schematic,
            modules: sanitized,
        });
    };

    // Update single module property
    const handleUpdateModule = (modId, patch) => {
        let newRatioApplied = null;
        const updatedModules = modules.map((m) => {
            if (m.id === modId) {
                const updatedMod = { ...m, ...patch };
                if (patch.ratio && m.type === 'plc' && PLC_RATIO_TABLE[patch.ratio]) {
                    const spec = PLC_RATIO_TABLE[patch.ratio];
                    const count = spec.ports;
                    const newOutputs = {};
                    for (let i = 1; i <= count; i++) {
                        newOutputs[`out_${i}`] = m.outputs?.[`out_${i}`] || {
                            label: `Out ${i}`,
                            target_type: 'port',
                            target_id: i,
                            target_label: `Port Pelanggan ${i}`,
                        };
                    }
                    updatedMod.outputs = newOutputs;
                    newRatioApplied = { ratio: patch.ratio, ports: count };
                }
                return updatedMod;
            }
            return m;
        });

        onChange({
            ...schematic,
            modules: updatedModules,
        });

        if (newRatioApplied && !isOdc) {
            onApplySummary?.({
                rasio_distribusi: newRatioApplied.ratio,
                total_ports: newRatioApplied.ports,
            });
        }
    };

    // Update single output target
    const handleUpdateOutput = (modId, outKey, patch) => {
        const updatedModules = modules.map((m) => {
            if (m.id === modId) {
                return {
                    ...m,
                    outputs: {
                        ...m.outputs,
                        [outKey]: {
                            ...m.outputs[outKey],
                            ...patch,
                        },
                    },
                };
            }
            return m;
        });
        onChange({
            ...schematic,
            modules: updatedModules,
        });
    };

    return (
        <div className="space-y-4">
            {/* Top Bar: One-Click Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Template Cepat Skematik:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('estafet_10_90_1_2')}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition font-medium"
                        title="1 Coupler 10:90 (Thru ke ODP hilir, Tap ke Splitter 1:2 / 2 Port)"
                    >
                        ⚡ Estafet 10:90 + 1:2 (2 Port)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('estafet_10_90_1_4')}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition font-medium"
                        title="1 Coupler 10:90 (Thru ke ODP hilir, Tap ke Splitter 1:4 / 4 Port)"
                    >
                        ⚡ Estafet 10:90 + 1:4 (4 Port)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('estafet_10_90_1_8')}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition font-medium"
                        title="1 Coupler 10:90 (Thru ke ODP hilir, Tap ke Splitter 1:8 / 8 Port)"
                    >
                        ⚡ Estafet 10:90 + 1:8 (8 Port)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('direct_1_2')}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition font-medium"
                        title="Langsung Splitter 1:2 dari feeder (2 Port)"
                    >
                        🔌 Direct 1:2 (2 Port)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('direct_1_4')}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition font-medium"
                        title="Langsung Splitter 1:4 dari feeder (4 Port)"
                    >
                        🔌 Direct 1:4 (4 Port)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('direct_1_8')}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition font-medium"
                        title="Langsung Splitter 1:8 dari feeder (8 Port)"
                    >
                        🔌 Direct 1:8 (8 Port)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('odc_transit_1_2')}
                        className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-lg transition font-medium"
                        title="Splitter 1:2 untuk transit percabangan ODC"
                    >
                        🗄️ Transit ODC 1:2
                    </button>
                </div>
            </div>

            {/* Visual Schematic Canvas (Enclosure Box Representation) */}
            <div className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 rounded-2xl border-2 border-slate-700/80 shadow-2xl space-y-4">
                {/* Enclosure Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-cyan-400" />
                            Kotak Enclosure ODP (Penyambungan Serat Optik)
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30 transition"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        + Tambah Splitter / Rasio
                    </button>
                </div>

                {/* 1. Main Feeder Input Row */}
                <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                                ⚡ Input Feeder Masuk ke Box (IN)
                            </div>
                            <div className="text-xs text-white font-bold flex items-center gap-1.5 mt-0.5">
                                <span>{inputSource.label || 'Sumber Serat Optik'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400">Daya Sinyal Input:</div>
                            <div className="text-sm font-black text-emerald-400 font-mono">
                                +{(calculatedPowers['feeder_in'] ?? 9.84).toFixed(2)} dBm
                            </div>
                        </div>
                    </div>
                </div>

                {/* Arrow from Feeder In to Modules */}
                <div className="flex justify-center -my-2">
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">
                        <ArrowDown className="w-3 h-3 text-cyan-400" />
                        <span>Kabel Core Masuk ke Splitter</span>
                    </div>
                </div>

                {/* 2. Splitter / Ratio Modules Inside Enclosure */}
                <div className="space-y-3">
                    {modules.length === 0 && (
                        <div className="p-6 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                            <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                            <div className="text-xs text-slate-400 font-medium">Belum ada splitter atau rasio di dalam ODP ini.</div>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(true)}
                                className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300 underline"
                            >
                                Klik di sini untuk menambahkan Splitter / Rasio
                            </button>
                        </div>
                    )}

                    {modules.map((mod, index) => {
                        const inPower = calculatedPowers[`${mod.id}:in`] ?? (Number(inputPower) || 9.84);
                        const isAsym = mod.type === 'asymmetric';

                        return (
                            <div
                                key={mod.id}
                                className="p-3.5 bg-slate-900/90 border border-slate-700/80 hover:border-slate-600 rounded-xl shadow-lg space-y-3 transition"
                            >
                                {/* Module Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center text-xs font-bold">
                                            #{index + 1}
                                        </span>
                                        <div>
                                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                                {isAsym ? '⚡ Rasio Asimetris (Coupler Tap 1 IN 2 OUT)' : '🔌 Splitter PLC Simetris (1 IN N OUT)'}
                                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                    {mod.ratio}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {modules.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveModule(mod.id)}
                                                className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition"
                                                title="Hapus splitter ini"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Pin Input & In-Source Selector */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 text-xs">
                                    <div>
                                        <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                                            Sumber Input Pin (IN):
                                        </label>
                                        <select
                                            value={mod.in_source}
                                            onChange={(e) => handleUpdateModule(mod.id, { in_source: e.target.value })}
                                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
                                        >
                                            {availableInputSources
                                                .filter((src) => !src.id.startsWith(`${mod.id}:`)) // cannot feed from self
                                                .map((src) => (
                                                    <option key={src.id} value={src.id}>
                                                        {src.label}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:pt-4">
                                        <span className="text-[11px] text-slate-400">Daya Masuk ke Splitter:</span>
                                        <span className="font-mono font-bold text-cyan-400 text-xs bg-cyan-950/40 px-2 py-1 rounded border border-cyan-800/40">
                                            {inPower.toFixed(2)} dBm
                                        </span>
                                    </div>
                                </div>

                                {/* Output Legs */}
                                <div className="space-y-2">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        Cabang Kaki Output (OUT):
                                    </div>

                                    {/* For Asymmetric (1 In, 2 Out: Thru & Tap) */}
                                    {isAsym ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            {/* Out 1: Thru (Rasio Besar) */}
                                            <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-lg space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-xs text-emerald-400 flex items-center gap-1">
                                                        <span>🟢 Out 1: Thru (Besar {SPECIAL_RATIO_TABLE[mod.ratio]?.thru_pct ?? 90}%)</span>
                                                    </span>
                                                    <span className="font-mono text-xs font-black text-emerald-300">
                                                        {calculatedPowers[`${mod.id}:thru`]} dBm
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-400">
                                                    Redaman Thru: -{SPECIAL_RATIO_TABLE[mod.ratio]?.thru_loss ?? 0.6} dB
                                                </div>
                                                <div className="pt-1">
                                                    <label className="block text-[10px] text-slate-400 mb-0.5">Tujuan Out Thru:</label>
                                                    <select
                                                        value={mod.outputs?.thru?.target_type || 'next_hop'}
                                                        onChange={(e) => {
                                                             const val = e.target.value;
                                                             handleUpdateOutput(mod.id, 'thru', {
                                                                 target_type: val,
                                                                 target_label: val === 'next_hop' ? 'Jalur ke ODP Hilir' : 'Splitter Internal',
                                                             });
                                                        }}
                                                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                                                    >
                                                        <option value="next_hop">➡️ Lanjut ke ODP Hilir (Estafet Bus)</option>
                                                        <option value="port">🔌 Masuk ke Port Pelanggan</option>
                                                    </select>
                                                </div>
                                                {(() => {
                                                    const thruChild = childOdps.find(c => String(c.parent_port) === 'thru');
                                                    const thruInternalMod = modules.find(m => m.in_source === `${mod.id}:thru`);
                                                    if (thruInternalMod) {
                                                        const targetIdx = modules.findIndex(m => m.id === thruInternalMod.id) + 1;
                                                        return (
                                                            <div className="mt-1 px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] flex items-center gap-1 font-semibold truncate">
                                                                <Link className="w-3 h-3 text-indigo-400 shrink-0" />
                                                                <span>Jumper ke Modul #{targetIdx}: {thruInternalMod.name}</span>
                                                            </div>
                                                        );
                                                    }
                                                    return thruChild ? (
                                                        <div className="mt-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] flex items-center gap-1 font-semibold truncate">
                                                            <span>⚡ Estafet Thru:</span>
                                                            <span className="truncate">📦 {thruChild.name}</span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>

                                            {/* Out 2: Tap (Rasio Kecil) */}
                                            <div className="p-2.5 bg-indigo-950/20 border border-indigo-800/40 rounded-lg space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-xs text-indigo-400 flex items-center gap-1">
                                                        <span>🔵 Out 2: Tap (Kecil {SPECIAL_RATIO_TABLE[mod.ratio]?.tap_pct ?? 10}%)</span>
                                                    </span>
                                                    <span className="font-mono text-xs font-black text-indigo-300">
                                                        {calculatedPowers[`${mod.id}:tap`]} dBm
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-400">
                                                    Redaman Tap: -{SPECIAL_RATIO_TABLE[mod.ratio]?.tap_loss ?? 10.5} dB
                                                </div>
                                                <div className="pt-1">
                                                    <label className="block text-[10px] text-slate-400 mb-0.5">Tujuan Out Tap:</label>
                                                    <select
                                                        value={mod.outputs?.tap?.target_type || 'module'}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            handleUpdateOutput(mod.id, 'tap', {
                                                                target_type: val,
                                                                target_id: val === 'port' ? 1 : null,
                                                                target_label: val === 'module' ? 'Masuk ke Splitter Distribusi' : 'Port Pelanggan 1',
                                                            });
                                                        }}
                                                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                                                    >
                                                        <option value="module">🔗 Masuk ke Splitter Distribusi (PLC 1:4 / 1:8)</option>
                                                        <option value="port">🔌 Langsung ke Port Pelanggan</option>
                                                    </select>
                                                </div>

                                                {/* If Tap goes to a physical port */}
                                                {mod.outputs?.tap?.target_type === 'port' && (
                                                    <div className="pt-1 space-y-1">
                                                        <label className="block text-[10px] text-slate-400">Pilih Port Adaptor:</label>
                                                        <select
                                                            value={mod.outputs?.tap?.target_id || 1}
                                                            onChange={(e) => {
                                                                const pVal = parseInt(e.target.value, 10);
                                                                handleUpdateOutput(mod.id, 'tap', {
                                                                    target_type: 'port',
                                                                    target_id: pVal,
                                                                    target_label: `Port Pelanggan ${pVal}`,
                                                                });
                                                            }}
                                                            className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-[11px] text-white"
                                                        >
                                                            {Array.from({ length: totalPorts || 8 }, (_, i) => i + 1).map((p) => {
                                                                const claimants = claimedPortMap[p] || [];
                                                                const isClaimedByOther = claimants.some(c => c.moduleId !== mod.id || c.outputKey !== 'tap');
                                                                const claimant = claimants.find(c => c.moduleId !== mod.id || c.outputKey !== 'tap');
                                                                return (
                                                                    <option key={p} value={p} disabled={isClaimedByOther}>
                                                                        Port Adaptor #{p} {isClaimedByOther ? `(Terpakai Modul #${claimant?.moduleIndex})` : ''}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                        {(() => {
                                                            const tapPort = Number(mod.outputs?.tap?.target_id || 1);
                                                            const child = childOdps.find(c => String(c.parent_port) === String(tapPort));
                                                            const cust = customerList.find(c => Number(c.odp_port_number) === tapPort);
                                                            if (child) {
                                                                return (
                                                                    <div className="p-1 rounded bg-amber-500/20 text-amber-300 text-[10px] border border-amber-500/30">
                                                                        <div className="font-bold">📦 ODP {child.name} (Estafet)</div>
                                                                        {cust && (
                                                                            <div className="text-[9px] text-rose-300 font-semibold mt-0.5">
                                                                                ⚠️ Konflik: Pelanggan ({cust.name}) di port ini!
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }
                                                            if (cust) {
                                                                return (
                                                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
                                                                        <div className="text-[10px] font-bold flex items-center justify-between gap-1">
                                                                            <span className="truncate">👤 {cust.name}</span>
                                                                            {onCustomerPortChange && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => onCustomerPortChange(null, tapPort)}
                                                                                    className="text-[9px] text-rose-400 hover:text-rose-300 font-semibold underline shrink-0 px-1"
                                                                                    title="Lepas pelanggan dari port ini"
                                                                                >
                                                                                    ✕ Lepas
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[9px] text-emerald-400/80">
                                                                            Pelanggan Terhubung (Port {tapPort})
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] text-slate-500 italic">⚪ Port Kosong / Bebas</div>
                                                                    {onCustomerPortChange && customerList && customerList.length > 0 && (
                                                                        <select
                                                                            value=""
                                                                            onChange={(e) => {
                                                                                const cId = parseInt(e.target.value, 10);
                                                                                if (cId) onCustomerPortChange(cId, tapPort);
                                                                            }}
                                                                            className="w-full px-1.5 py-0.5 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                                                                        >
                                                                            <option value="">➕ Map Pelanggan ke Port #{tapPort}...</option>
                                                                            {customerList
                                                                                .filter(c => !c.odp_port_number || Number(c.odp_port_number) === 0)
                                                                                .map((c) => (
                                                                                    <option key={c.id} value={c.id}>
                                                                                        {c.name} {c.pppoe_username ? `[${c.pppoe_username}]` : ''}
                                                                                    </option>
                                                                                ))}
                                                                        </select>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* For PLC Splitter (1 In, N Out) */
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                                            {Object.entries(mod.outputs || {}).map(([key, out], outIdx) => {
                                                const outPow = calculatedPowers[`${mod.id}:${key}`] ?? inPower;
                                                const isGood = outPow >= -24 && outPow <= -12;

                                                // Check if this output is consumed internally as in_source by another module
                                                const internalTargetMod = modules.find(m => m.in_source === `${mod.id}:${key}`);
                                                const isInternal = !!internalTargetMod;
                                                const internalTargetIndex = internalTargetMod ? modules.findIndex(m => m.id === internalTargetMod.id) + 1 : null;

                                                // Check port assignments if not internal
                                                const portNum = !isInternal ? Number(out.target_id) : null;
                                                const assignedCustomer = portNum ? customerList.find(c => Number(c.odp_port_number) === portNum) : null;
                                                const assignedChildOdp = portNum ? childOdps.find(c => String(c.parent_port) === String(portNum)) : null;

                                                // Check if this port is claimed by multiple outputs
                                                const claimants = portNum ? (claimedPortMap[portNum] || []) : [];
                                                const isDuplicateClaim = claimants.length > 1;
                                                const otherClaimant = claimants.find(c => c.moduleId !== mod.id || c.outputKey !== key);

                                                return (
                                                    <div
                                                        key={key}
                                                        className={`p-2 rounded-lg border space-y-1.5 text-xs transition ${
                                                            isInternal
                                                                ? 'bg-indigo-950/40 border-indigo-500/50'
                                                                : isDuplicateClaim
                                                                ? 'bg-rose-950/30 border-rose-500/60'
                                                                : assignedChildOdp
                                                                ? 'bg-amber-950/25 border-amber-500/50'
                                                                : 'bg-slate-950/70 border-slate-800'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between font-bold text-slate-300">
                                                            <span className="flex items-center gap-1.5">
                                                                <span>Port Out {outIdx + 1}</span>
                                                                {isInternal && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                                        JUMPER
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span
                                                                className={`font-mono text-[11px] font-bold ${
                                                                    outPow < -24 ? 'text-red-400' : 'text-emerald-400'
                                                                }`}
                                                            >
                                                                {outPow} dBm
                                                            </span>
                                                        </div>

                                                        {isInternal ? (
                                                            /* 1. Internal Jumper connection (does NOT use physical port adaptor) */
                                                            <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 space-y-1">
                                                                <div className="text-[10px] font-bold flex items-center gap-1 text-indigo-300">
                                                                    <Link className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                                    <span>Sambungan Jumper Internal</span>
                                                                </div>
                                                                <div className="text-[11px] font-semibold text-white">
                                                                    ➡️ Masuk ke Modul #{internalTargetIndex}: {internalTargetMod.name}
                                                                </div>
                                                                <div className="text-[9px] text-slate-400">
                                                                    Serat optik disambung internal di kaset ODP (tidak menggunakan port dropcore).
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            /* 2. Physical Port Adaptor connection */
                                                            <div className="space-y-1">
                                                                <div className="text-[10px] text-slate-400">
                                                                    Hubungkan ke Port:
                                                                </div>
                                                                <select
                                                                    value={out.target_id || ''}
                                                                    onChange={(e) => {
                                                                        const pVal = parseInt(e.target.value, 10);
                                                                        handleUpdateOutput(mod.id, key, {
                                                                            target_type: 'port',
                                                                            target_id: pVal,
                                                                            target_label: `Port Pelanggan ${pVal}`,
                                                                        });
                                                                    }}
                                                                    className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-[11px] text-white focus:outline-none focus:border-blue-500"
                                                                >
                                                                    {Array.from({ length: totalPorts || 8 }, (_, i) => i + 1).map((p) => {
                                                                        const pClaimants = claimedPortMap[p] || [];
                                                                        const isClaimedByOther = pClaimants.some(c => c.moduleId !== mod.id || c.outputKey !== key);
                                                                        const claimantInfo = pClaimants.find(c => c.moduleId !== mod.id || c.outputKey !== key);
                                                                        return (
                                                                            <option key={p} value={p} disabled={isClaimedByOther}>
                                                                                Port Adaptor #{p} {isClaimedByOther ? `(Terpakai Modul #${claimantInfo?.moduleIndex})` : ''}
                                                                            </option>
                                                                        );
                                                                    })}
                                                                </select>

                                                                {/* Conflict warning if multiple outputs connect to this port */}
                                                                {isDuplicateClaim && otherClaimant && (
                                                                    <div className="p-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[9px] flex items-center gap-1 font-semibold">
                                                                        <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                                                                        <span>Port #{portNum} ganda dengan Modul #{otherClaimant.moduleIndex}!</span>
                                                                    </div>
                                                                )}

                                                                {/* MUTUAL EXCLUSIVITY: Child ODP vs Customer */}
                                                                {assignedChildOdp ? (
                                                                    <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 space-y-0.5">
                                                                        <div className="text-[10px] font-bold flex items-center gap-1 truncate" title={`Estafet ke Downstream ODP: ${assignedChildOdp.name}`}>
                                                                            <span>📦 ODP {assignedChildOdp.name}</span>
                                                                        </div>
                                                                        <div className="text-[9px] text-amber-400/90 font-medium">
                                                                            Jalur Estafet ODP Hilir
                                                                        </div>
                                                                        {assignedCustomer && (
                                                                            <div className="mt-1 pt-1 border-t border-rose-500/30 text-[9px] text-rose-300 font-semibold flex items-center gap-1">
                                                                                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                                                                                <span>Konflik: Pelanggan ({assignedCustomer.name}) bertabrakan!</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : assignedCustomer ? (
                                                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
                                                                        <div className="text-[10px] font-bold flex items-center justify-between gap-1">
                                                                            <span className="truncate" title={assignedCustomer.name}>👤 {assignedCustomer.name}</span>
                                                                            {onCustomerPortChange && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => onCustomerPortChange(null, portNum)}
                                                                                    className="text-[9px] text-rose-400 hover:text-rose-300 font-semibold underline shrink-0 px-1"
                                                                                    title="Lepas pelanggan dari port ini"
                                                                                >
                                                                                    ✕ Lepas
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[9px] text-emerald-400/80">
                                                                            Pelanggan Terhubung (Port {portNum})
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-1">
                                                                        <div className="text-[10px] text-slate-500 italic">
                                                                            ⚪ Port Kosong / Bebas
                                                                        </div>
                                                                        {onCustomerPortChange && customerList && customerList.length > 0 && (
                                                                            <select
                                                                                value=""
                                                                                onChange={(e) => {
                                                                                    const cId = parseInt(e.target.value, 10);
                                                                                    if (cId) onCustomerPortChange(cId, portNum);
                                                                                }}
                                                                                className="w-full px-1.5 py-0.5 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                                                                            >
                                                                                <option value="">➕ Map Pelanggan ke Port #{portNum}...</option>
                                                                                {customerList
                                                                                    .filter(c => !c.odp_port_number || Number(c.odp_port_number) === 0)
                                                                                    .map((c) => (
                                                                                        <option key={c.id} value={c.id}>
                                                                                            {c.name} {c.pppoe_username ? `[${c.pppoe_username}]` : ''}
                                                                                        </option>
                                                                                    ))}
                                                                            </select>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 3. Physical Port Tray of the ODP Box */}
                {!isOdc && (
                    <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                <Cable className="w-3.5 h-3.5 text-emerald-400" />
                                Tray Adaptor Port Dropcore ODP (Total {totalPorts || 8} Port)
                            </span>
                            <span className="text-[11px] text-slate-400">
                                Port aktif: {
                                    Array.from({ length: totalPorts || 8 }, (_, i) => i + 1).filter(p => {
                                        const hasChild = childOdps.some(c => String(c.parent_port) === String(p));
                                        const hasCust = customerList.some(c => Number(c.odp_port_number) === p);
                                        return hasChild || hasCust;
                                    }).length
                                } / {totalPorts || 8}
                            </span>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
                            {Array.from({ length: totalPorts || 8 }, (_, i) => i + 1).map((portNum) => {
                                const customer = customerList.find(c => Number(c.odp_port_number) === portNum);
                                const childOdp = childOdps.find(c => String(c.parent_port) === String(portNum));
                                const isChildOdp = !!childOdp;
                                const isCustomer = !!customer;
                                const hasConflict = isChildOdp && isCustomer;

                                return (
                                    <div
                                        key={portNum}
                                        className={`p-2 rounded-xl text-center border transition ${
                                            hasConflict
                                                ? 'bg-rose-950/50 border-rose-500 text-rose-200 shadow-md shadow-rose-950/50'
                                                : isChildOdp
                                                ? 'bg-amber-950/40 border-amber-500/60 text-amber-200 shadow-md shadow-amber-950/30'
                                                : isCustomer
                                                ? 'bg-blue-950/40 border-blue-500/50 text-blue-200'
                                                : 'bg-slate-900/60 border-slate-800 text-slate-400'
                                        }`}
                                    >
                                        <div className="text-[10px] font-mono font-bold flex items-center justify-center gap-1">
                                            <span>Port {portNum}</span>
                                            {hasConflict && <AlertTriangle className="w-3 h-3 text-rose-400 animate-pulse" />}
                                        </div>
                                        <div className="w-3 h-3 mx-auto my-1 rounded-full border flex items-center justify-center">
                                            <div
                                                className={`w-1.5 h-1.5 rounded-full ${
                                                    hasConflict
                                                        ? 'bg-rose-500 shadow-[0_0_6px_#EF4444]'
                                                        : isChildOdp
                                                        ? 'bg-amber-400 shadow-[0_0_6px_#F59E0B]'
                                                        : isCustomer
                                                        ? 'bg-emerald-400 shadow-[0_0_6px_#10B981]'
                                                        : 'bg-slate-600'
                                                }`}
                                            />
                                        </div>
                                        <div
                                            className={`text-[9px] truncate font-medium ${hasConflict ? 'text-rose-300 font-bold' : ''}`}
                                            title={
                                                hasConflict
                                                    ? `⚠️ KONFLIK: Port ini dipakai ODP (${childOdp.name}) DAN Pelanggan (${customer.name})!`
                                                    : isChildOdp
                                                    ? `Estafet ke ODP: ${childOdp.name}`
                                                    : isCustomer
                                                    ? customer.name
                                                    : 'Kosong'
                                            }
                                        >
                                            {hasConflict ? `⚠️ ${childOdp.name}` : isChildOdp ? `📦 ${childOdp.name}` : isCustomer ? customer.name : 'Kosong'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Add Splitter / Rasio */}
            {showAddModal && (
                <div className="fixed inset-0 z-[10001] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-[fadeIn_.2s_ease-out]">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h4 className="font-bold text-white text-sm flex items-center gap-2">
                                <Plus className="w-4 h-4 text-blue-400" />
                                Tambah Splitter / Rasio Baru di ODP
                            </h4>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-slate-300">
                            {/* Splitter Type */}
                            <div>
                                <label className="block text-slate-400 mb-1 font-medium">Tipe Komponen:</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAddForm({ ...addForm, type: 'asymmetric', ratio: '10:90' })}
                                        className={`p-2.5 rounded-xl border text-left transition ${
                                            addForm.type === 'asymmetric'
                                                ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold'
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                        }`}
                                    >
                                        <div className="font-bold text-xs">⚡ Rasio Spesial</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">1 IN $\to$ 2 OUT (Thru & Tap)</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddForm({ ...addForm, type: 'plc', ratio: '1:4' })}
                                        className={`p-2.5 rounded-xl border text-left transition ${
                                            addForm.type === 'plc'
                                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200 font-bold'
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                        }`}
                                    >
                                        <div className="font-bold text-xs">🔌 Splitter PLC</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">1 IN $\to$ N OUT (Simetris)</div>
                                    </button>
                                </div>
                            </div>

                            {/* Ratio Selection */}
                            <div>
                                <label className="block text-slate-400 mb-1 font-medium">Pilih Ukuran Rasio:</label>
                                {addForm.type === 'asymmetric' ? (
                                    <select
                                        value={addForm.ratio}
                                        onChange={(e) => setAddForm({ ...addForm, ratio: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold"
                                    >
                                        {Object.entries(SPECIAL_RATIO_TABLE).map(([r, val]) => (
                                            <option key={r} value={r}>
                                                Rasio {r} (Tap -{val.tap_loss} dB, Thru -{val.thru_loss} dB)
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <select
                                        value={addForm.ratio}
                                        onChange={(e) => setAddForm({ ...addForm, ratio: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold"
                                    >
                                        {Object.entries(PLC_RATIO_TABLE).map(([r, val]) => (
                                            <option key={r} value={r}>
                                                Splitter {r} ({val.ports} Port, Redaman -{val.loss} dB)
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* In-Source Selection */}
                            <div>
                                <label className="block text-slate-400 mb-1 font-medium">
                                    Pilih Asal Sinyal Masuk (IN):
                                </label>
                                <select
                                    value={addForm.in_source}
                                    onChange={(e) => setAddForm({ ...addForm, in_source: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold"
                                >
                                    {availableInputSources.map((src) => (
                                        <option key={src.id} value={src.id}>
                                            {src.label}
                                        </option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-slate-500 mt-1 block">
                                    Bisa dari Feeder Masuk ODP atau dari Output splitter yang sudah terpasang.
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-semibold text-xs"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleAddModule}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/30"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Pasang Splitter
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

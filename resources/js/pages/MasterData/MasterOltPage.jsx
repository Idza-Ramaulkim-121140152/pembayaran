import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Box,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Cpu,
    Edit,
    ExternalLink,
    Filter,
    Globe,
    Info,
    Layers,
    MapPin,
    Network,
    Plus,
    Power,
    Radio,
    RefreshCw,
    Search,
    Server,
    Shield,
    Trash2,
    Wifi,
    X,
    Zap,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import masterOltService from '../../services/masterOltService';

const OLT_BRANDS = [
    'ZTE',
    'Huawei',
    'VSOL',
    'BDCOM',
    'HSGQ',
    'Fiberhome',
    'Hioso',
    'CDATA',
    'Generic',
];

const INITIAL_FORM = {
    id: null,
    name: '',
    host: '',
    username: 'admin',
    password: '',
    snmp_port: 161,
    telnet_port: 23,
    snmp_community: 'public',
    snmp_version: '2c',
    is_active: true,
};

function MasterOltPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [olts, setOlts] = useState([]);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Modal Form OLT State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [form, setForm] = useState(INITIAL_FORM);

    // Modal PON Ports Config State
    const [selectedOltForPorts, setSelectedOltForPorts] = useState(null);
    const [editingPort, setEditingPort] = useState(null);
    const [savingPort, setSavingPort] = useState(false);

    // Modal SNMP Test State
    const [snmpTestResult, setSnmpTestResult] = useState(null);
    const [testingSnmpId, setTestingSnmpId] = useState(null);

    // Auto-Discovery State
    const [discoveringId, setDiscoveringId] = useState(null);
    const [discoveryResult, setDiscoveryResult] = useState(null);

    // Active / Selected Port Detail State
    const [selectedPort, setSelectedPort] = useState(null); // { oltId, port }
    const [portDetailsData, setPortDetailsData] = useState(null); // { port, odps, onus }
    const [loadingPortDetails, setLoadingPortDetails] = useState(false);
    const [portActiveTab, setPortActiveTab] = useState('onus'); // 'onus' | 'odps'
    const [onuSearch, setOnuSearch] = useState('');
    const [onuStatusFilter, setOnuStatusFilter] = useState('all'); // 'all' | 'online' | 'offline'
    const [onuPage, setOnuPage] = useState(1);
    const ONUS_PER_PAGE = 15;

    const isEdit = useMemo(() => !!form.id, [form.id]);

    const handleTogglePort = async (olt, port) => {
        if (selectedPort?.oltId === olt.id && selectedPort?.port?.id === port.id) {
            setSelectedPort(null);
            setPortDetailsData(null);
            return;
        }

        setSelectedPort({ oltId: olt.id, port });
        setOnuSearch('');
        setOnuStatusFilter('all');
        setOnuPage(1);
        setPortActiveTab('onus');

        try {
            setLoadingPortDetails(true);
            const res = await masterOltService.getPonPortDetails(olt.id, port.id);
            if (res.data?.success && res.data?.data) {
                setPortDetailsData(res.data.data);
            }
        } catch (err) {
            console.error('Gagal mengambil detail port:', err);
        } finally {
            setLoadingPortDetails(false);
        }
    };

    const handleRefreshPortDetails = async () => {
        if (!selectedPort) return;
        try {
            setLoadingPortDetails(true);
            const res = await masterOltService.getPonPortDetails(selectedPort.oltId, selectedPort.port.id);
            if (res.data?.success && res.data?.data) {
                setPortDetailsData(res.data.data);
                if (res.data.data.port) {
                    setSelectedPort(prev => prev ? { ...prev, port: res.data.data.port } : null);
                }
            }
        } catch (err) {
            console.error('Gagal refresh port:', err);
        } finally {
            setLoadingPortDetails(false);
        }
    };

    const handleEditPortFromDetail = (olt, port) => {
        setSelectedOltForPorts(olt);
        setEditingPort(port);
    };

    const filteredOnus = useMemo(() => {
        const list = portDetailsData?.onus || [];
        return list.filter((onu) => {
            const matchesSearch =
                !onuSearch.trim() ||
                (onu.mac_address && onu.mac_address.toLowerCase().includes(onuSearch.toLowerCase())) ||
                (onu.serial_number && onu.serial_number.toLowerCase().includes(onuSearch.toLowerCase())) ||
                (onu.customer?.name && onu.customer.name.toLowerCase().includes(onuSearch.toLowerCase())) ||
                (onu.customer?.pppoe_username && onu.customer.pppoe_username.toLowerCase().includes(onuSearch.toLowerCase())) ||
                (onu.model && onu.model.toLowerCase().includes(onuSearch.toLowerCase()));

            const matchesStatus =
                onuStatusFilter === 'all' ||
                (onuStatusFilter === 'online' && onu.status === 'online') ||
                (onuStatusFilter === 'offline' && onu.status !== 'online');

            return matchesSearch && matchesStatus;
        });
    }, [portDetailsData?.onus, onuSearch, onuStatusFilter]);

    const paginatedOnus = useMemo(() => {
        const start = (onuPage - 1) * ONUS_PER_PAGE;
        return filteredOnus.slice(start, start + ONUS_PER_PAGE);
    }, [filteredOnus, onuPage]);

    const totalPages = Math.ceil(filteredOnus.length / ONUS_PER_PAGE) || 1;

    useEffect(() => {
        fetchOlts();
    }, []);

    const fetchOlts = async () => {
        try {
            setLoading(true);
            const response = await masterOltService.getAll();
            setOlts(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat master OLT.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreate = () => {
        setForm(INITIAL_FORM);
        setIsFormOpen(true);
        setError(null);
        setSuccess(null);
    };

    const handleOpenEdit = (olt) => {
        setForm({
            id: olt.id,
            name: olt.name || '',
            host: olt.host || '',
            username: olt.username || 'admin',
            password: olt.password || '',
            snmp_port: olt.snmp_port || 161,
            telnet_port: olt.telnet_port || 23,
            snmp_community: olt.snmp_community === '***' ? 'public' : (olt.snmp_community || 'public'),
            snmp_version: olt.snmp_version || '2c',
            is_active: !!olt.is_active,
        });
        setIsFormOpen(true);
        setError(null);
        setSuccess(null);
    };

    const handleSubmitForm = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            const payload = {
                name: form.name?.trim() || `OLT - ${form.host.trim()}`,
                host: form.host.trim(),
                username: form.username?.trim() || 'admin',
                password: form.password?.trim() || 'admin',
                snmp_port: Number(form.snmp_port) || 161,
                telnet_port: Number(form.telnet_port) || 23,
                snmp_community: form.snmp_community?.trim() || 'public',
                snmp_version: form.snmp_version || '2c',
                is_active: !!form.is_active,
            };

            if (isEdit) {
                const res = await masterOltService.update(form.id, payload);
                setSuccess(res.data?.message || `Master OLT '${payload.name}' berhasil diperbarui.`);
                if (res.data?.discovery) {
                    setDiscoveryResult(res.data.discovery);
                }
            } else {
                const res = await masterOltService.create(payload);
                setSuccess(res.data?.message || `Master OLT '${payload.name}' berhasil ditambahkan.`);
                if (res.data?.discovery) {
                    setDiscoveryResult(res.data.discovery);
                }
            }

            setIsFormOpen(false);
            await fetchOlts();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan konfigurasi OLT.');
        } finally {
            setSaving(false);
        }
    };

    const handleAutoDiscover = async (olt) => {
        try {
            setDiscoveringId(olt.id);
            setError(null);
            setSuccess(null);
            const res = await masterOltService.autoDiscover(olt.id);
            setDiscoveryResult(res.data?.discovery || null);
            setSuccess(res.data?.message || `Auto-discovery OLT '${olt.name}' berhasil.`);
            await fetchOlts();
        } catch (err) {
            setDiscoveryResult(err.response?.data?.discovery || null);
            setError(err.response?.data?.message || 'Gagal menjalankan auto-discovery pada OLT.');
        } finally {
            setDiscoveringId(null);
        }
    };

    const handleToggleActive = async (olt) => {
        try {
            await masterOltService.activate(olt.id);
            setSuccess(`OLT '${olt.name}' sekarang aktif sebagai OLT Utama.`);
            await fetchOlts();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengaktifkan OLT.');
        }
    };

    const handleTestSnmp = async (olt) => {
        try {
            setTestingSnmpId(olt.id);
            setSnmpTestResult(null);
            const res = await masterOltService.testSnmp(olt.id);
            setSnmpTestResult(res.data?.data || null);
            setSuccess(res.data?.message || 'Uji koneksi SNMP berhasil.');
        } catch (err) {
            setSnmpTestResult(err.response?.data?.data || { error: err.response?.data?.message || 'Gagal uji koneksi SNMP.' });
            setError(err.response?.data?.message || 'Gagal menghubungi perangkat OLT.');
        } finally {
            setTestingSnmpId(null);
        }
    };

    const handleDeleteOlt = async (olt) => {
        if (!window.confirm(`Apakah Anda yakin ingin menghapus Master OLT '${olt.name}'? Port PON dan relasi terkait akan dinonaktifkan.`)) {
            return;
        }

        try {
            await masterOltService.remove(olt.id);
            setSuccess(`Master OLT '${olt.name}' berhasil dihapus.`);
            await fetchOlts();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus Master OLT.');
        }
    };

    const handleOpenPonModal = (olt) => {
        setSelectedOltForPorts(olt);
        setEditingPort(null);
    };

    const handleSavePort = async (e) => {
        e.preventDefault();
        if (!selectedOltForPorts || !editingPort) return;

        try {
            setSavingPort(true);
            await masterOltService.updatePonPort(selectedOltForPorts.id, editingPort.id, {
                name: editingPort.name,
                pon_identifier: editingPort.pon_identifier,
                admin_status: editingPort.admin_status,
                oper_status: editingPort.oper_status,
                tx_power_dbm: Number(editingPort.tx_power_dbm),
                temperature: Number(editingPort.temperature),
                max_onu_capacity: Number(editingPort.max_onu_capacity),
                description: editingPort.description,
            });

            setSuccess(`Port ${editingPort.name} berhasil diperbarui.`);
            setEditingPort(null);
            await fetchOlts();
            
            // Update modal data
            const updated = await masterOltService.getById(selectedOltForPorts.id);
            setSelectedOltForPorts(updated.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui port PON.');
        } finally {
            setSavingPort(false);
        }
    };

    const totalPonAll = useMemo(() => olts.reduce((sum, o) => sum + (o.total_pon_ports || 0), 0), [olts]);
    const totalOnuAll = useMemo(() => olts.reduce((sum, o) => sum + (o.onus_count || 0), 0), [olts]);
    const totalOdpAll = useMemo(() => olts.reduce((sum, o) => sum + (o.odps_count || 0), 0), [olts]);

    return (
        <div className="space-y-6">
            {/* TOP HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Server className="text-orange-500" />
                        Master OLT &amp; Port PON
                    </h1>
                    <p className="text-sm text-gray-500">
                        Kelola perangkat Optical Line Terminal (OLT), pemetaan port PON, dan parameter SNMP telemetry.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        onClick={fetchOlts}
                        disabled={loading}
                        className="flex items-center gap-2"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleOpenCreate}
                        className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                        <Plus size={16} />
                        Tambah OLT Baru
                    </Button>
                </div>
            </div>

            {/* ALERTS */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-medium">Total Master OLT</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{olts.length}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                        {olts.filter((o) => o.is_active).length} OLT Aktif
                    </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-medium">Total Port PON</p>
                    <p className="text-2xl font-bold text-indigo-600 mt-1">{totalPonAll}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Kapasitas SFP Fiber Optic</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-medium">ONU/ONT Terdaftar</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{totalOnuAll}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Pelanggan Aktif Terpetakan</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-medium">ODP Terhubung</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{totalOdpAll}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Kotak Distribusi Sentral</p>
                </div>
            </div>

            {/* OLT LIST CARDS */}
            {loading && olts.length === 0 ? (
                <div className="py-16 text-center">
                    <LoadingSpinner />
                    <p className="text-sm text-gray-500 mt-2">Memuat data Master OLT...</p>
                </div>
            ) : olts.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center space-y-3">
                    <Server size={48} className="mx-auto text-gray-300" />
                    <h3 className="font-bold text-gray-700">Belum Ada Master OLT</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                        Tambahkan OLT pertama Anda untuk menghubungkan jalur GPON/EPON, port PON, dan integrasi monitoring ke Super Panel.
                    </p>
                    <Button variant="primary" onClick={handleOpenCreate}>
                        Tambah OLT Sekarang
                    </Button>
                </div>
            ) : (
                <div className="space-y-4">
                    {olts.map((olt) => {
                        return (
                            <div
                                key={olt.id}
                                className={`bg-white rounded-2xl border transition shadow-sm p-5 space-y-4 ${
                                    olt.is_active ? 'border-orange-300 ring-1 ring-orange-200' : 'border-gray-200 opacity-90'
                                }`}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                                    <div className="flex items-start gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100 font-bold">
                                            <Server size={24} />
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-extrabold text-gray-900 text-lg">{olt.name}</h3>
                                                {olt.is_active && (
                                                    <span className="px-2.5 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-bold flex items-center gap-1">
                                                        <CheckCircle2 size={12} /> OLT Utama
                                                    </span>
                                                )}
                                                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold flex items-center gap-1">
                                                    <Zap size={12} className="text-emerald-600" /> Real-Time Live
                                                </span>
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs font-mono font-bold uppercase">
                                                    {olt.brand} {olt.model}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                                <span>Host: <strong className="font-mono text-gray-800">{olt.host}:{olt.snmp_port}</strong></span>
                                                <span>&bull;</span>
                                                <span>SNMP v{olt.snmp_version}</span>
                                                {olt.location_address && (
                                                    <>
                                                        <span>&bull;</span>
                                                        <span className="flex items-center gap-1"><MapPin size={12} /> {olt.location_address}</span>
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleAutoDiscover(olt)}
                                            disabled={discoveringId === olt.id}
                                            className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                            title="Ambil spesifikasi, port PON, dan daftar perangkat terhubung langsung dari OLT"
                                        >
                                            <Zap size={14} className={discoveringId === olt.id ? 'animate-spin text-yellow-200' : ''} />
                                            {discoveringId === olt.id ? 'Mendeteksi...' : 'Auto-Discover OLT'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTestSnmp(olt)}
                                            disabled={testingSnmpId === olt.id}
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                                        >
                                            <Radio size={14} className={testingSnmpId === olt.id ? 'animate-pulse text-orange-500' : ''} />
                                            {testingSnmpId === olt.id ? 'Menguji...' : 'Test SNMP'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenPonModal(olt)}
                                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                                        >
                                            <Layers size={14} />
                                            🏷️ Tandai Port PON ({olt.total_pon_ports})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenEdit(olt)}
                                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition"
                                            title="Edit OLT"
                                        >
                                            <Edit size={16} />
                                        </button>
                                        {!olt.is_active && (
                                            <button
                                                type="button"
                                                onClick={() => handleToggleActive(olt)}
                                                className="px-2.5 py-1.5 bg-gray-100 hover:bg-orange-50 hover:text-orange-600 text-gray-700 text-xs font-semibold rounded-xl transition"
                                                title="Jadikan OLT Utama"
                                            >
                                                Jadikan Utama
                                            </button>
                                        )}
                                        {olts.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteOlt(olt)}
                                                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition"
                                                title="Hapus OLT"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                 {/* PON Ports Interactive Grid */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-700">Status Modul Port PON ({olt.total_pon_ports} Port)</span>
                                            <span className="text-[11px] text-orange-600 bg-orange-50 border border-orange-200/80 px-2 py-0.5 rounded-full font-medium">
                                                💡 Klik port untuk melihat detail &amp; daftar ONT
                                            </span>
                                        </div>
                                        <span>Terdaftar: <strong className="text-gray-900">{olt.onus_count || 0} ONU</strong> pada <strong className="text-gray-900">{olt.odps_count || 0} ODP</strong></span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
                                        {(olt.pon_ports || []).map((port) => {
                                            const isUp = port.oper_status === 'up';
                                            const isSelected = selectedPort?.oltId === olt.id && selectedPort?.port?.id === port.id;
                                            return (
                                                <button
                                                    key={port.id}
                                                    type="button"
                                                    onClick={() => handleTogglePort(olt, port)}
                                                    className={`p-2.5 rounded-2xl border text-center transition-all duration-200 cursor-pointer relative group text-left ${
                                                        isSelected
                                                            ? 'bg-gradient-to-b from-orange-50 to-orange-100/80 border-orange-500 ring-2 ring-orange-400/30 shadow-md scale-[1.02]'
                                                            : isUp
                                                            ? 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-400 hover:shadow-sm hover:scale-[1.01] text-emerald-900'
                                                            : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-500'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-1 mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                                            <span className={`font-mono font-black text-xs ${isSelected ? 'text-orange-900' : 'text-gray-800'}`}>P{port.pon_index}</span>
                                                        </div>
                                                        <span className="text-[9px] font-mono text-gray-400">{port.pon_identifier}</span>
                                                    </div>
                                                    <p className={`text-[10px] font-bold truncate ${isSelected ? 'text-orange-950' : 'text-gray-800'}`}>{port.name}</p>
                                                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-200/50 text-[10px]">
                                                        <span className="text-gray-600 font-mono font-bold">
                                                            {port.tx_power_dbm ? `${port.tx_power_dbm} dBm` : '-'}
                                                        </span>
                                                        <span className="font-bold text-indigo-700">
                                                            {port.total_registered_onu || 0} ONU
                                                        </span>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rotate-45" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* EXPANDABLE DETAIL PANEL BELOW PON PORTS */}
                                    {selectedPort?.oltId === olt.id && selectedPort?.port && (() => {
                                        const currentPort = (portDetailsData?.port?.id === selectedPort.port.id)
                                            ? portDetailsData.port
                                            : selectedPort.port;

                                        const onusList = portDetailsData?.onus || [];
                                        const onlineCount = onusList.filter(o => o.status === 'online').length;
                                        const offlineCount = onusList.length - onlineCount;

                                        return (
                                            <div className="mt-3 p-5 sm:p-6 rounded-3xl bg-white border-2 border-orange-200 shadow-xl space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                {/* Header Panel */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                                                    <div className="flex items-start gap-3">
                                                        <div className="p-2.5 rounded-2xl bg-orange-100 text-orange-600 shrink-0 mt-0.5">
                                                            <Radio size={22} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h4 className="font-black text-base text-gray-900">
                                                                    Detail Port PON {currentPort.pon_index} ({currentPort.pon_identifier})
                                                                </h4>
                                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${
                                                                    currentPort.oper_status === 'up'
                                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                                        : 'bg-rose-100 text-rose-800 border border-rose-200'
                                                                }`}>
                                                                    <span className={`w-2 h-2 rounded-full ${currentPort.oper_status === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                                                    {currentPort.oper_status === 'up' ? 'UP (Online)' : 'DOWN (Offline)'}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[10px] font-bold">
                                                                    Modul SFP PX20+++
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-semibold text-gray-600 mt-0.5">
                                                                {currentPort.name}
                                                            </p>
                                                            {currentPort.description && (
                                                                <p className="text-[11px] text-gray-400 mt-0.5">
                                                                    {currentPort.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 self-end sm:self-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditPortFromDetail(olt, currentPort)}
                                                            className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs font-bold flex items-center gap-1.5 transition"
                                                        >
                                                            <Edit size={13} />
                                                            Tandai / Edit Port
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleRefreshPortDetails}
                                                            disabled={loadingPortDetails}
                                                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition disabled:opacity-50"
                                                            title="Segarkan Data Real-Time"
                                                        >
                                                            <RefreshCw size={14} className={loadingPortDetails ? 'animate-spin' : ''} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedPort(null);
                                                                setPortDetailsData(null);
                                                            }}
                                                            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition"
                                                            title="Tutup Detail"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Hardware Telemetry Metric Cards */}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                    <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                                                        <div className="flex items-center justify-between text-amber-800 mb-1">
                                                            <span className="text-[11px] font-bold">Redaman Keluar SFP</span>
                                                            <Radio size={14} />
                                                        </div>
                                                        <p className="font-mono font-black text-xl text-amber-950">
                                                            {currentPort.tx_power_dbm ? `+${currentPort.tx_power_dbm} dBm` : '-'}
                                                        </p>
                                                        <p className="text-[10px] text-amber-700 font-semibold mt-1">
                                                            Output Laser SFP OLT (PX20+++)
                                                        </p>
                                                    </div>

                                                    <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80">
                                                        <div className="flex items-center justify-between text-blue-800 mb-1">
                                                            <span className="text-[11px] font-bold">Suhu Transceiver SFP</span>
                                                            <Cpu size={14} />
                                                        </div>
                                                        <p className="font-mono font-black text-xl text-blue-950">
                                                            {currentPort.temperature ? `${currentPort.temperature} °C` : '-'}
                                                        </p>
                                                        <p className="text-[10px] text-blue-700 font-semibold mt-1">
                                                            Thermal Normal (&lt; 65 °C)
                                                        </p>
                                                    </div>

                                                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
                                                        <div className="flex items-center justify-between text-emerald-800 mb-1">
                                                            <span className="text-[11px] font-bold">Voltase Operasi SFP</span>
                                                            <Zap size={14} />
                                                        </div>
                                                        <p className="font-mono font-black text-xl text-emerald-950">
                                                            {currentPort.voltage ? `${currentPort.voltage} V` : '3.00 V'}
                                                        </p>
                                                        <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                                                            Tegangan Pasokan Stabil
                                                        </p>
                                                    </div>

                                                    <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200/80">
                                                        <div className="flex items-center justify-between text-purple-800 mb-1">
                                                            <span className="text-[11px] font-bold">Arus Bias Laser</span>
                                                            <Activity size={14} />
                                                        </div>
                                                        <p className="font-mono font-black text-xl text-purple-950">
                                                            {currentPort.current_ma ? `${currentPort.current_ma} mA` : '11.00 mA'}
                                                        </p>
                                                        <p className="text-[10px] text-purple-700 font-semibold mt-1">
                                                            Bias Current Transceiver
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Kapasitas & Distribusi Rute */}
                                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                                                    <div className="space-y-1.5 flex-1">
                                                        <div className="flex items-center justify-between font-bold text-gray-700">
                                                            <span>Kapasitas Terdaftar Port PON:</span>
                                                            <span className="font-mono text-indigo-700">{currentPort.total_registered_onu || 0} / {currentPort.max_onu_capacity || 64} Unit</span>
                                                        </div>
                                                        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                                            <div
                                                                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                                                                style={{
                                                                    width: `${Math.min(100, ((currentPort.total_registered_onu || 0) / (currentPort.max_onu_capacity || 64)) * 100)}%`
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-4 text-[11px] text-gray-500">
                                                            <span className="flex items-center gap-1 font-semibold text-emerald-700">
                                                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                {currentPort.online_onu_count || 0} Online
                                                            </span>
                                                            <span className="flex items-center gap-1 font-semibold text-slate-500">
                                                                <span className="w-2 h-2 rounded-full bg-slate-400" />
                                                                {currentPort.offline_onu_count || (currentPort.total_registered_onu - (currentPort.online_onu_count || 0))} Offline / Lost
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="md:border-l md:border-gray-200 md:pl-5 space-y-1">
                                                        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">ODP Terpetakan pada Port Ini</p>
                                                        <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                            <Box size={16} className="text-orange-500" />
                                                            {portDetailsData?.odps?.length || 0} Kotak Distribusi (ODP)
                                                        </p>
                                                        <p className="text-[11px] text-gray-500">
                                                            {portDetailsData?.odps?.map(o => o.nama).slice(0, 4).join(', ') || '-'}
                                                            {(portDetailsData?.odps?.length || 0) > 4 ? `, +${portDetailsData.odps.length - 4} lainnya` : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Tab Navigation */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPortActiveTab('onus')}
                                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                                                                portActiveTab === 'onus'
                                                                    ? 'bg-orange-600 text-white shadow-sm'
                                                                    : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            <Wifi size={14} />
                                                            Daftar ONT / ONU Terhubung ({onusList.length || currentPort.total_registered_onu || 0})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPortActiveTab('odps')}
                                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                                                                portActiveTab === 'odps'
                                                                    ? 'bg-orange-600 text-white shadow-sm'
                                                                    : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            <Box size={14} />
                                                            ODP Terhubung ({portDetailsData?.odps?.length || 0})
                                                        </button>
                                                    </div>

                                                    {/* TAB 1: ONUS */}
                                                    {portActiveTab === 'onus' && (
                                                        <div className="space-y-3">
                                                            {/* Filter & Search Bar */}
                                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                                                                <div className="relative flex-1 max-w-md">
                                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                    <input
                                                                        type="text"
                                                                        value={onuSearch}
                                                                        onChange={(e) => {
                                                                            setOnuSearch(e.target.value);
                                                                            setOnuPage(1);
                                                                        }}
                                                                        placeholder="Cari nama pelanggan, MAC address, serial, PPPoE..."
                                                                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-xs"
                                                                    />
                                                                    {onuSearch && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setOnuSearch('')}
                                                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                                        >
                                                                            <X size={12} />
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-1.5 self-start sm:self-center">
                                                                    <span className="text-gray-400 text-[11px] font-semibold mr-1">Status:</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOnuStatusFilter('all'); setOnuPage(1); }}
                                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                                                            onuStatusFilter === 'all'
                                                                                ? 'bg-gray-900 text-white'
                                                                                : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                                                        }`}
                                                                    >
                                                                        Semua ({onusList.length})
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOnuStatusFilter('online'); setOnuPage(1); }}
                                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                                                            onuStatusFilter === 'online'
                                                                                ? 'bg-emerald-600 text-white'
                                                                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                                        }`}
                                                                    >
                                                                        Online ({onlineCount})
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setOnuStatusFilter('offline'); setOnuPage(1); }}
                                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                                                            onuStatusFilter === 'offline'
                                                                                ? 'bg-rose-600 text-white'
                                                                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                                                        }`}
                                                                    >
                                                                        Offline ({offlineCount})
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Table Content */}
                                                            {loadingPortDetails ? (
                                                                <div className="py-12 flex flex-col items-center justify-center gap-3">
                                                                    <LoadingSpinner />
                                                                    <p className="text-xs text-gray-500 font-medium">Memuat data real telemetri ONT...</p>
                                                                </div>
                                                            ) : paginatedOnus.length === 0 ? (
                                                                <div className="p-8 text-center border border-dashed border-gray-200 rounded-2xl">
                                                                    <p className="text-xs font-bold text-gray-500">
                                                                        {onuSearch ? `Tidak ada ONT yang cocok dengan pencarian '${onuSearch}'.` : 'Tidak ada ONT terdaftar pada port ini.'}
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                                                                    <table className="w-full text-xs text-left">
                                                                        <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                                                                            <tr>
                                                                                <th className="px-3.5 py-2.5">Slot / No</th>
                                                                                <th className="px-3.5 py-2.5">Pelanggan &amp; PPPoE</th>
                                                                                <th className="px-3.5 py-2.5">MAC Address Real</th>
                                                                                <th className="px-3.5 py-2.5">Model ONT / Serial</th>
                                                                                <th className="px-3.5 py-2.5">Redaman RX</th>
                                                                                <th className="px-3.5 py-2.5">Redaman TX</th>
                                                                                <th className="px-3.5 py-2.5">Jarak Fiber</th>
                                                                                <th className="px-3.5 py-2.5 text-center">Status</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-100">
                                                                            {paginatedOnus.map((onu) => {
                                                                                const isOnline = onu.status === 'online';
                                                                                const rx = onu.optical_rx_dbm ? Number(onu.optical_rx_dbm) : null;
                                                                                let rxColorClass = 'text-gray-700 bg-gray-50';
                                                                                if (rx !== null) {
                                                                                    if (rx >= -24.0) {
                                                                                        rxColorClass = 'text-emerald-700 bg-emerald-50 font-bold';
                                                                                    } else if (rx >= -27.0) {
                                                                                        rxColorClass = 'text-amber-700 bg-amber-50 font-bold';
                                                                                    } else {
                                                                                        rxColorClass = 'text-rose-700 bg-rose-50 font-bold';
                                                                                    }
                                                                                }

                                                                                return (
                                                                                    <tr key={onu.id} className="hover:bg-orange-50/30 transition">
                                                                                        <td className="px-3.5 py-2.5 font-mono font-bold text-gray-800">
                                                                                            P{currentPort.pon_index}:{onu.onu_index}
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5">
                                                                                            {onu.customer ? (
                                                                                                <div>
                                                                                                    <p className="font-bold text-gray-900">{onu.customer.name}</p>
                                                                                                    <p className="text-[11px] text-gray-500 font-mono">
                                                                                                        {onu.customer.pppoe_username ? `PPPoE: ${onu.customer.pppoe_username}` : ''}
                                                                                                    </p>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px]">
                                                                                                    Belum Dipetakan
                                                                                                </span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5 font-mono font-bold text-gray-800">
                                                                                            {onu.mac_address || '-'}
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5">
                                                                                            <p className="font-mono text-gray-700">{onu.serial_number || '-'}</p>
                                                                                            <p className="text-[10px] text-gray-400">{onu.model || 'HiOSO EPON ONU'}</p>
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5">
                                                                                            {rx !== null ? (
                                                                                                <span className={`px-2 py-0.5 rounded font-mono text-xs ${rxColorClass}`}>
                                                                                                    {rx.toFixed(2)} dBm
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="font-mono text-gray-400">-</span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5 font-mono text-gray-600">
                                                                                            {onu.optical_tx_dbm ? `${Number(onu.optical_tx_dbm).toFixed(2)} dBm` : '-'}
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5 font-mono text-gray-700">
                                                                                            {onu.distance_meter ? `${onu.distance_meter} m (${(onu.distance_meter / 1000).toFixed(2)} km)` : '-'}
                                                                                        </td>
                                                                                        <td className="px-3.5 py-2.5 text-center">
                                                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                                                isOnline
                                                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                                                    : 'bg-slate-100 text-slate-600'
                                                                                            }`}>
                                                                                                {isOnline ? '🟢 Online' : '⚪ Offline'}
                                                                                            </span>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}

                                                            {/* Pagination */}
                                                            {filteredOnus.length > ONUS_PER_PAGE && (
                                                                <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
                                                                    <span>
                                                                        Menampilkan {((onuPage - 1) * ONUS_PER_PAGE) + 1} - {Math.min(onuPage * ONUS_PER_PAGE, filteredOnus.length)} dari {filteredOnus.length} ONT
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            disabled={onuPage <= 1}
                                                                            onClick={() => setOnuPage(p => Math.max(1, p - 1))}
                                                                        >
                                                                            Sebelumnya
                                                                        </Button>
                                                                        <span className="px-2 font-bold text-gray-700">
                                                                            {onuPage} / {totalPages}
                                                                        </span>
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            disabled={onuPage >= totalPages}
                                                                            onClick={() => setOnuPage(p => Math.min(totalPages, p + 1))}
                                                                        >
                                                                            Selanjutnya
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* TAB 2: ODPS */}
                                                    {portActiveTab === 'odps' && (
                                                        <div className="space-y-3">
                                                            {(!portDetailsData?.odps || portDetailsData.odps.length === 0) ? (
                                                                <div className="p-8 text-center border border-dashed border-gray-200 rounded-2xl text-xs text-gray-500">
                                                                    Belum ada ODP yang terpetakan pada port ini.
                                                                </div>
                                                            ) : (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                    {portDetailsData.odps.map((odp) => (
                                                                        <div key={odp.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                                                                            <div className="flex items-center justify-between">
                                                                                <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                                                                                    <Box size={14} className="text-orange-500" />
                                                                                    {odp.nama}
                                                                                </p>
                                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                                                    Rasio {odp.rasio_distribusi || '1:8'}
                                                                                </span>
                                                                            </div>
                                                                            {odp.alamat_detail && (
                                                                                <p className="text-[11px] text-gray-500 line-clamp-2">
                                                                                    {odp.alamat_detail}
                                                                                </p>
                                                                            )}
                                                                            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                                                                                <span className="text-gray-500">Pelanggan Terhubung:</span>
                                                                                <span className="font-bold text-emerald-700">
                                                                                    {odp.customers_count || 0} / {odp.total_ports || 8} Port Terisi
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* SNMP TEST RESULT MODAL */}
            {snmpTestResult && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Radio className="text-orange-500" />
                                Hasil Uji Diagnostik SNMP
                            </h3>
                            <button
                                type="button"
                                onClick={() => setSnmpTestResult(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                <p><strong>Target OLT:</strong> {snmpTestResult.olt_name} ({snmpTestResult.host}:{snmpTestResult.port})</p>
                                <p><strong>Latency Response:</strong> <span className="font-mono text-emerald-600 font-bold">{snmpTestResult.response_time_ms} ms</span></p>
                                <p><strong>Status:</strong> {snmpTestResult.is_reachable ? <span className="text-emerald-600 font-bold">ONLINE &amp; RESPONSIVE</span> : <span className="text-rose-600 font-bold">TIMEOUT / GAGAL</span>}</p>
                            </div>

                            {snmpTestResult.details && (
                                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1 text-slate-800">
                                    <p className="font-bold text-emerald-800">Telemetry Info:</p>
                                    <p><strong>SysDescr:</strong> {snmpTestResult.details.sys_descr}</p>
                                    <p><strong>Uptime:</strong> {snmpTestResult.details.sys_uptime}</p>
                                    {snmpTestResult.details.note && <p className="text-purple-700 font-semibold">{snmpTestResult.details.note}</p>}
                                </div>
                            )}

                            {snmpTestResult.error && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
                                    <p className="font-bold">Pesan Error:</p>
                                    <p>{snmpTestResult.error}</p>
                                </div>
                            )}
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button variant="secondary" onClick={() => setSnmpTestResult(null)}>
                                Tutup
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* DISCOVERY RESULT MODAL */}
            {discoveryResult && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Zap className="text-orange-500" />
                                Hasil Auto-Discovery OLT Fisik
                            </h3>
                            <button
                                type="button"
                                onClick={() => setDiscoveryResult(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3.5 rounded-2xl bg-orange-50/70 border border-orange-200 space-y-1.5 text-slate-800">
                                <p><strong>Host OLT:</strong> <span className="font-mono font-bold text-orange-900">{discoveryResult.host}</span></p>
                                <p><strong>Status Jaringan:</strong> {discoveryResult.is_reachable ? <span className="text-emerald-600 font-bold">ONLINE &amp; TERHUBUNG ({discoveryResult.latency_ms} ms)</span> : <span className="text-rose-600 font-bold">TIDAK MERESPON</span>}</p>
                                <p><strong>Konektivitas:</strong> SNMP {discoveryResult.snmp_connected ? '🟢 Aktif' : '🔴 Mati'} &bull; Telnet {discoveryResult.telnet_connected ? '🟢 Aktif' : '🔴 Mati'}</p>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-slate-700">
                                <p><strong>Merk Terdeteksi:</strong> <span className="font-bold text-gray-900">{discoveryResult.detected_brand || '-'}</span></p>
                                <p><strong>Model Perangkat:</strong> <span className="font-bold text-indigo-700">{discoveryResult.detected_model || '-'}</span></p>
                                {discoveryResult.sys_descr && <p className="text-[11px] text-gray-500 font-mono"><strong>SysDescr:</strong> {discoveryResult.sys_descr}</p>}
                                {discoveryResult.uptime && <p><strong>Uptime:</strong> {discoveryResult.uptime}</p>}
                                <p><strong>Port PON Terdeteksi:</strong> <span className="font-bold text-emerald-600">{discoveryResult.discovered_ports?.length || 0} Port Fisik</span></p>
                                <p><strong>Perangkat ONU/ONT Terhubung:</strong> <span className="font-bold text-blue-600">{discoveryResult.discovered_onus_count || 0} Unit</span></p>
                            </div>

                            {discoveryResult.errors && Object.keys(discoveryResult.errors).length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                                    <p className="font-bold">Catatan Diagnostik:</p>
                                    {Object.entries(discoveryResult.errors).map(([k, v]) => (
                                        <p key={k}>&bull; {k.toUpperCase()}: {v}</p>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button variant="secondary" onClick={() => setDiscoveryResult(null)}>
                                Tutup
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* FORM MODAL: TAMBAH / EDIT MASTER OLT */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-black text-xl text-gray-900">
                                    {isEdit ? 'Edit Master OLT' : 'Tambah Master OLT Baru'}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Cukup masukkan IP host dan kredensial. Spesifikasi dan port akan dideteksi otomatis.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsFormOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* AUTO-DISCOVERY HINT BANNER */}
                        <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 flex items-start gap-3">
                            <div className="p-2 bg-orange-100 rounded-xl text-orange-600 shrink-0">
                                <Zap size={18} />
                            </div>
                            <div className="text-xs text-orange-900 leading-relaxed">
                                <p className="font-bold">Auto-Discovery Otomatis dari OLT</p>
                                <p className="text-orange-700 text-[11px] mt-0.5">
                                    Sistem akan mengambil merk OLT, model perangkat, jumlah port PON SFP, daya optik TX, dan seluruh daftar ONU/ONT yang terhubung langsung dari OLT fisik via SNMP dan Telnet.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
                            <div className="space-y-4">
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        IP Address / Host OLT <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={form.host}
                                        onChange={(e) => setForm({ ...form, host: e.target.value })}
                                        placeholder="Contoh: 192.168.27.88 atau 10.10.10.1"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono font-bold"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Username OLT (Telnet/CLI)
                                        </label>
                                        <input
                                            type="text"
                                            value={form.username}
                                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                                            placeholder="admin"
                                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Password OLT (Telnet/CLI)
                                        </label>
                                        <input
                                            type="password"
                                            value={form.password}
                                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                                            placeholder="admin"
                                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Port SNMP
                                        </label>
                                        <input
                                            type="number"
                                            value={form.snmp_port}
                                            onChange={(e) => setForm({ ...form, snmp_port: e.target.value })}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Port Telnet
                                        </label>
                                        <input
                                            type="number"
                                            value={form.telnet_port}
                                            onChange={(e) => setForm({ ...form, telnet_port: e.target.value })}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            SNMP Community
                                        </label>
                                        <input
                                            type="text"
                                            value={form.snmp_community}
                                            onChange={(e) => setForm({ ...form, snmp_community: e.target.value })}
                                            placeholder="public"
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Versi SNMP
                                        </label>
                                        <select
                                            value={form.snmp_version}
                                            onChange={(e) => setForm({ ...form, snmp_version: e.target.value })}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-xs font-mono"
                                        >
                                            <option value="1">v1</option>
                                            <option value="2c">v2c</option>
                                            <option value="3">v3</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Nama Label OLT <span className="text-gray-400 font-normal">(Opsional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="Contoh: OLT Sentral NOC Kalianda (Otomatis jika dikosongkan)"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                    />
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.is_active}
                                            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                            className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                                        />
                                        <div>
                                            <p className="font-bold text-gray-800 text-xs">Set Sebagai OLT Utama (Active)</p>
                                            <p className="text-[11px] text-gray-500">
                                                OLT utama akan menjadi default di Super Panel, WebGIS, dan Customer Tracer.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setIsFormOpen(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    disabled={saving}
                                    className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1.5"
                                >
                                    <Zap size={14} className={saving ? 'animate-spin' : ''} />
                                    {saving ? 'Mendeteksi OLT...' : isEdit ? 'Simpan & Deteksi Ulang' : 'Simpan & Deteksi Otomatis'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: KELOLA & TANDAI PORT PON OLT */}
            {selectedOltForPorts && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-black text-xl text-gray-900 flex items-center gap-2">
                                    <Layers className="text-orange-500" />
                                    🏷️ Tandai / Beri Label Port PON - {selectedOltForPorts.name}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Port PON dideteksi otomatis dari OLT fisik ({selectedOltForPorts.brand} {selectedOltForPorts.model}). Beri label penanda rute dan keterangan jalur untuk mempermudah identifikasi lapangan.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedOltForPorts(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Edit single port form */}
                        {editingPort && (
                            <form onSubmit={handleSavePort} className="p-5 rounded-2xl bg-orange-50/70 border border-orange-200 space-y-4 text-xs">
                                <div className="flex items-center justify-between pb-2 border-b border-orange-200/60">
                                    <h4 className="font-bold text-orange-950 text-sm flex items-center gap-1.5">
                                        🏷️ Tandai Port PON {editingPort.pon_index}
                                    </h4>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                        🟢 Terdeteksi dari Perangkat OLT
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="sm:col-span-2">
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Nama / Label Penanda Port <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={editingPort.name}
                                            onChange={(e) => setEditingPort({ ...editingPort, name: e.target.value })}
                                            placeholder="Contoh: PON 1 (Jalur Utama Sentral - Kalianda)"
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-orange-500 font-semibold"
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            Label ini akan tampil di Super Panel, Customer Tracer, dan WebGIS.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Identifier Fisik OLT</label>
                                        <input
                                            type="text"
                                            readOnly
                                            disabled
                                            value={editingPort.pon_identifier}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 text-xs font-mono font-bold cursor-not-allowed"
                                        />
                                        <p className="text-[10px] text-emerald-600 font-bold mt-1">
                                            Port Fisik Hardware ({editingPort.pon_identifier})
                                        </p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block font-bold text-gray-700 mb-1">Keterangan / Rute Kabel Feeder</label>
                                        <input
                                            type="text"
                                            value={editingPort.description || ''}
                                            onChange={(e) => setEditingPort({ ...editingPort, description: e.target.value })}
                                            placeholder="Contoh: Kabel Feeder 24 Core, Tube Biru, Arah ODP Sukarame"
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Kapasitas Maksimal ONU</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="256"
                                            value={editingPort.max_onu_capacity || 64}
                                            onChange={(e) => setEditingPort({ ...editingPort, max_onu_capacity: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setEditingPort(null)}
                                        disabled={savingPort}
                                    >
                                        Batal
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={savingPort}
                                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
                                    >
                                        {savingPort ? 'Menyimpan...' : 'Simpan Penanda Port'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Table of PON ports */}
                        <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3">Slot Hardware</th>
                                        <th className="px-4 py-3">Label / Penanda Jalur</th>
                                        <th className="px-4 py-3">Identifier</th>
                                        <th className="px-4 py-3">Status Fisik</th>
                                        <th className="px-4 py-3">TX Power</th>
                                        <th className="px-4 py-3">Suhu</th>
                                        <th className="px-4 py-3">ONU Terhubung</th>
                                        <th className="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(selectedOltForPorts.pon_ports || []).map((p) => {
                                        const isUp = p.oper_status === 'up';
                                        return (
                                            <tr key={p.id} className="hover:bg-gray-50/70">
                                                <td className="px-4 py-3 font-mono font-bold text-gray-900">
                                                    Port {p.pon_index}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-gray-900">{p.name}</p>
                                                    {p.description && (
                                                        <p className="text-[11px] text-gray-500 mt-0.5">{p.description}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-gray-600 font-bold">{p.pon_identifier}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        isUp ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                    }`}>
                                                        {isUp ? 'UP (Online)' : 'DOWN'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono">{p.tx_power_dbm ? `${p.tx_power_dbm} dBm` : '-'}</td>
                                                <td className="px-4 py-3 font-mono">{p.temperature ? `${p.temperature} °C` : '-'}</td>
                                                <td className="px-4 py-3 font-bold text-indigo-700">
                                                    {p.total_registered_onu || 0} / {p.max_onu_capacity || 64} Unit
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingPort(p)}
                                                        className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg font-bold transition"
                                                    >
                                                        🏷️ Tandai Port
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button variant="secondary" onClick={() => setSelectedOltForPorts(null)}>
                                Selesai
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MasterOltPage;

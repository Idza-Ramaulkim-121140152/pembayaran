import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Cpu,
    Edit,
    Globe,
    Layers,
    MapPin,
    Network,
    Plus,
    Power,
    Radio,
    RefreshCw,
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
    brand: 'ZTE',
    model: 'ZTE C320 GPON 8-Port',
    host: '',
    snmp_port: 161,
    snmp_community: 'public',
    snmp_version: '2c',
    total_pon_ports: 8,
    is_active: true,
    simulation_mode: false,
    latitude: -5.63272765,
    longitude: 105.54801464,
    location_address: 'Sentral NOC Server Room, Kalianda',
    description: '',
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

    const isEdit = useMemo(() => !!form.id, [form.id]);

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
            brand: olt.brand || 'ZTE',
            model: olt.model || '',
            host: olt.host || '',
            snmp_port: olt.snmp_port || 161,
            snmp_community: olt.snmp_community === '***' ? 'public' : (olt.snmp_community || 'public'),
            snmp_version: olt.snmp_version || '2c',
            total_pon_ports: olt.total_pon_ports || 8,
            is_active: !!olt.is_active,
            simulation_mode: !!olt.simulation_mode,
            latitude: olt.latitude || -5.63272765,
            longitude: olt.longitude || 105.54801464,
            location_address: olt.location_address || '',
            description: olt.description || '',
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
                name: form.name.trim(),
                brand: form.brand,
                model: form.model?.trim() || `${form.brand} GPON OLT ${form.total_pon_ports}-Port`,
                host: form.host.trim(),
                snmp_port: Number(form.snmp_port) || 161,
                snmp_community: form.snmp_community.trim() || 'public',
                snmp_version: form.snmp_version || '2c',
                total_pon_ports: Number(form.total_pon_ports) || 8,
                is_active: !!form.is_active,
                simulation_mode: !!form.simulation_mode,
                latitude: Number(form.latitude) || -5.63272765,
                longitude: Number(form.longitude) || 105.54801464,
                location_address: form.location_address?.trim() || null,
                description: form.description?.trim() || null,
            };

            if (isEdit) {
                await masterOltService.update(form.id, payload);
                setSuccess(`Master OLT '${payload.name}' berhasil diperbarui.`);
            } else {
                await masterOltService.create(payload);
                setSuccess(`Master OLT '${payload.name}' berhasil ditambahkan.`);
            }

            setIsFormOpen(false);
            await fetchOlts();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan konfigurasi OLT.');
        } finally {
            setSaving(false);
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

    const handleToggleSimulation = async (olt) => {
        try {
            const res = await masterOltService.toggleSimulation(olt.id);
            setSuccess(res.data?.message || 'Mode simulasi OLT berhasil diubah.');
            await fetchOlts();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengubah mode simulasi.');
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
                        const isSim = olt.simulation_mode;
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
                                                {isSim ? (
                                                    <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-bold flex items-center gap-1">
                                                        <Radio size={12} /> Smart Simulation
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold flex items-center gap-1">
                                                        <Zap size={12} /> Real SNMP Live
                                                    </span>
                                                )}
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
                                            onClick={() => handleTestSnmp(olt)}
                                            disabled={testingSnmpId === olt.id}
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                                        >
                                            <Radio size={14} className={testingSnmpId === olt.id ? 'animate-pulse text-orange-500' : ''} />
                                            {testingSnmpId === olt.id ? 'Menguji...' : 'Test SNMP'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleSimulation(olt)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
                                                isSim
                                                    ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                            }`}
                                        >
                                            <Zap size={14} />
                                            {isSim ? 'Ganti ke Real SNMP' : 'Ganti ke Simulasi'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenPonModal(olt)}
                                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                                        >
                                            <Layers size={14} />
                                            Port PON ({olt.total_pon_ports})
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

                                {/* PON Ports Mini Grid */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span className="font-semibold text-gray-700">Status Modul Port PON ({olt.total_pon_ports} Port)</span>
                                        <span>Terdaftar: <strong className="text-gray-900">{olt.onus_count || 0} ONU</strong> pada <strong className="text-gray-900">{olt.odps_count || 0} ODP</strong></span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                                        {(olt.pon_ports || []).map((port) => {
                                            const isUp = port.oper_status === 'up';
                                            return (
                                                <div
                                                    key={port.id}
                                                    className={`p-2 rounded-xl border text-center transition ${
                                                        isUp
                                                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                                            : 'bg-slate-50 border-slate-200 text-slate-500'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-center gap-1 mb-0.5">
                                                        <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                                        <span className="font-mono font-bold text-xs">P{port.pon_index}</span>
                                                    </div>
                                                    <p className="text-[10px] font-semibold truncate">{port.name}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                                        {port.tx_power_dbm ? `${port.tx_power_dbm} dBm` : '-'}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-indigo-700 mt-0.5">
                                                        {port.total_registered_onu || 0} ONU
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
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

            {/* FORM MODAL: TAMBAH / EDIT MASTER OLT */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-black text-xl text-gray-900">
                                    {isEdit ? 'Edit Master OLT' : 'Tambah Master OLT Baru'}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Konfigurasikan vendor, alamat IP host SNMP, port, dan jumlah port PON.
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

                        <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Nama Perangkat OLT <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="Contoh: OLT Utama - Sentral NOC Kalianda"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Vendor / Brand OLT <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={form.brand}
                                        onChange={(e) => setForm({ ...form, brand: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                    >
                                        {OLT_BRANDS.map((b) => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Model / Tipe Chassis
                                    </label>
                                    <input
                                        type="text"
                                        value={form.model}
                                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                                        placeholder="Contoh: ZTE C320 GPON 8-Port"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Host IP / Domain SNMP <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={form.host}
                                        onChange={(e) => setForm({ ...form, host: e.target.value })}
                                        placeholder="Contoh: 10.10.10.1 atau 192.168.10.2"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Port SNMP
                                        </label>
                                        <input
                                            type="number"
                                            value={form.snmp_port}
                                            onChange={(e) => setForm({ ...form, snmp_port: e.target.value })}
                                            className="w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">
                                            Versi SNMP
                                        </label>
                                        <select
                                            value={form.snmp_version}
                                            onChange={(e) => setForm({ ...form, snmp_version: e.target.value })}
                                            className="w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                        >
                                            <option value="1">v1</option>
                                            <option value="2c">v2c</option>
                                            <option value="3">v3</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Community Read String
                                    </label>
                                    <input
                                        type="text"
                                        value={form.snmp_community}
                                        onChange={(e) => setForm({ ...form, snmp_community: e.target.value })}
                                        placeholder="public"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Total Port PON SFP <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={form.total_pon_ports}
                                        onChange={(e) => setForm({ ...form, total_pon_ports: Number(e.target.value) })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-bold text-orange-600"
                                    >
                                        <option value={4}>4 Port PON</option>
                                        <option value={8}>8 Port PON</option>
                                        <option value={16}>16 Port PON</option>
                                        <option value={32}>32 Port PON</option>
                                        <option value={64}>64 Port PON</option>
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Lokasi Alamat Server Room / NOC
                                    </label>
                                    <input
                                        type="text"
                                        value={form.location_address}
                                        onChange={(e) => setForm({ ...form, location_address: e.target.value })}
                                        placeholder="Contoh: Sentral NOC Room Kalianda, Jl. Utama No. 1"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Latitude Koordinat GIS
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={form.latitude}
                                        onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Longitude Koordinat GIS
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={form.longitude}
                                        onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono"
                                    />
                                </div>
                            </div>

                            {/* Toggles */}
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.simulation_mode}
                                        onChange={(e) => setForm({ ...form, simulation_mode: e.target.checked })}
                                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                    />
                                    <div>
                                        <p className="font-bold text-gray-800 text-xs">Aktifkan Smart Simulation Mode</p>
                                        <p className="text-[11px] text-gray-500">
                                            Gunakan simulasi cerdas berpresisi tinggi jika komputer Anda belum terhubung langsung ke OLT fisik.
                                        </p>
                                    </div>
                                </label>

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
                                            OLT utama akan otomatis menjadi default di WebGIS dan Customer Tracer.
                                        </p>
                                    </div>
                                </label>
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
                                    className="bg-orange-600 hover:bg-orange-700 text-white"
                                >
                                    {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah OLT'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: KELOLA PORT PON OLT */}
            {selectedOltForPorts && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-black text-xl text-gray-900 flex items-center gap-2">
                                    <Layers className="text-orange-500" />
                                    Pengaturan Port PON - {selectedOltForPorts.name}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Kelola identifier, status operasional, daya optik TX SFP, dan kapasitas ONU per port PON.
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
                            <form onSubmit={handleSavePort} className="p-4 rounded-2xl bg-orange-50/70 border border-orange-200 space-y-3 text-xs">
                                <h4 className="font-bold text-orange-900 text-sm">
                                    Edit Port PON {editingPort.pon_index}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Nama Port</label>
                                        <input
                                            type="text"
                                            required
                                            value={editingPort.name}
                                            onChange={(e) => setEditingPort({ ...editingPort, name: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Identifier OLT</label>
                                        <input
                                            type="text"
                                            value={editingPort.pon_identifier}
                                            onChange={(e) => setEditingPort({ ...editingPort, pon_identifier: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Status Operasional</label>
                                        <select
                                            value={editingPort.oper_status}
                                            onChange={(e) => setEditingPort({ ...editingPort, oper_status: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs"
                                        >
                                            <option value="up">UP (Aktif)</option>
                                            <option value="down">DOWN (Mati/Nonaktif)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">TX Optical Power (dBm)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={editingPort.tx_power_dbm}
                                            onChange={(e) => setEditingPort({ ...editingPort, tx_power_dbm: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Suhu SFP (C)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={editingPort.temperature}
                                            onChange={(e) => setEditingPort({ ...editingPort, temperature: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Kapasitas Maksimal ONU</label>
                                        <input
                                            type="number"
                                            value={editingPort.max_onu_capacity}
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
                                        Batal Edit
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={savingPort}
                                        className="bg-orange-600 hover:bg-orange-700 text-white"
                                    >
                                        {savingPort ? 'Menyimpan...' : 'Simpan Port'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Table of PON ports */}
                        <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3">Slot</th>
                                        <th className="px-4 py-3">Nama Port</th>
                                        <th className="px-4 py-3">Identifier</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">TX Power</th>
                                        <th className="px-4 py-3">Suhu</th>
                                        <th className="px-4 py-3">Terdaftar</th>
                                        <th className="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(selectedOltForPorts.pon_ports || []).map((p) => {
                                        const isUp = p.oper_status === 'up';
                                        return (
                                            <tr key={p.id} className="hover:bg-gray-50/70">
                                                <td className="px-4 py-3 font-mono font-bold">PON {p.pon_index}</td>
                                                <td className="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                                                <td className="px-4 py-3 font-mono text-gray-600">{p.pon_identifier}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        isUp ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                    }`}>
                                                        {isUp ? 'UP (Aktif)' : 'DOWN'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono">{p.tx_power_dbm} dBm</td>
                                                <td className="px-4 py-3 font-mono">{p.temperature} &deg;C</td>
                                                <td className="px-4 py-3 font-bold text-indigo-700">
                                                    {p.total_registered_onu || 0} / {p.max_onu_capacity || 64}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingPort(p)}
                                                        className="px-2.5 py-1 bg-gray-100 hover:bg-orange-50 hover:text-orange-600 rounded-lg font-bold transition"
                                                    >
                                                        Edit
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

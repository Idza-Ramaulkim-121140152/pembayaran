import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    AlertTriangle, Zap, Wrench, Send, CheckCircle2, AlertCircle,
    Users, Phone, MapPin, RefreshCw, Search, Check, Info, ArrowLeft,
    ExternalLink, ShieldAlert, Sparkles, MessageSquare
} from 'lucide-react';

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

export default function AreaIncidentActionPage() {
    const { token } = useParams();

    const [loading, setLoading] = useState(true);
    const [incident, setIncident] = useState(null);
    const [error, setError] = useState(null);

    // Opsi 1: Tandai Gangguan
    const [incidentType, setIncidentType] = useState('pemadaman_listrik');
    const [incidentNotes, setIncidentNotes] = useState('');
    const [markingNotice, setMarkingNotice] = useState(false);
    const [markSuccess, setMarkSuccess] = useState(null);

    // Opsi 2: Kirim Pesan ke Pelanggan Tidak Aktif
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [messageText, setMessageText] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('listrik');
    const [sendingNotification, setSendingNotification] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [confirmSendModal, setConfirmSendModal] = useState(false);

    const getTemplates = (areaCode = 'INI') => ({
        listrik: `âš ï¸ *INFORMASI GANGGUAN JARINGAN (LISTRIK PADAM)* âš ï¸\n\nYth. Pelanggan RumahKitaNet di Area *${areaCode}*,\n\nSaat ini koneksi internet di wilayah Anda sedang mengalami gangguan karena adanya *Pemadaman Listrik (PLN)* pada perangkat transmisi / distribusi kami.\n\nPerangkat akan menyala kembali secara otomatis sesaat setelah aliran listrik PLN normal.\n\nMohon maaf atas ketidaknyamanan yang terjadi. Terima kasih atas pengertian dan kesabaran Anda. ðŸ™`,
        maintenance: `ðŸ”§ *PEMBERITAHUAN MAINTENANCE / PERBAIKAN JARINGAN* ðŸ”§\n\nYth. Pelanggan RumahKitaNet di Area *${areaCode}*,\n\nSaat ini sedang berlangsung pekerjaan *Perbaikan / Pemeliharaan Jaringan Darurat* pada wilayah Anda (Area *${areaCode}*).\n\nTim teknisi kami sedang berada di lokasi untuk mempercepat pemulihan koneksi Anda.\n\nMohon maaf atas ketidaknyamanan ini. Kami akan berupaya agar koneksi segera kembali normal secepat mungkin. Terima kasih. ðŸ™`,
        umum: `ðŸ“¢ *INFORMASI GANGGUAN JARINGAN INTERNET* ðŸ“¢\n\nYth. Pelanggan RumahKitaNet di Area *${areaCode}*,\n\nKami menginformasikan bahwa sistem mendeteksi adanya penurunan kualitas/putusnya koneksi di area *${areaCode}*.\n\nTim teknisi telah menerima laporan dan sedang melakukan investigasi serta perbaikan langsung.\n\nCek update status: https://rumahkitanet.site/status-jaringan\nTerima kasih atas kerja sama dan pengertiannya. ðŸ™`
    });

    const fetchIncident = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/area-incident/${token}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken() || '',
                }
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Gagal memuat rincian insiden area');
            }

            const inc = data.incident;
            setIncident(inc);

            // Default template
            const tpls = getTemplates(inc.area_code);
            setMessageText(tpls.listrik);

            // Pre-select all inactive customers
            const inactives = inc.inactive_customers_data || [];
            setSelectedCustomerIds(inactives.map(c => c.id));

            // Populate existing values if already marked
            if (inc.incident_type) {
                setIncidentType(inc.incident_type);
            }
            if (inc.incident_notes) {
                setIncidentNotes(inc.incident_notes);
            }
        } catch (err) {
            console.error('Fetch incident error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchIncident();
        }
    }, [token]);

    const handleSelectTemplate = (type) => {
        setSelectedTemplate(type);
        const tpls = getTemplates(incident?.area_code || 'AREA');
        if (tpls[type]) {
            setMessageText(tpls[type]);
        }
    };

    const handleMarkNotice = async (e) => {
        e?.preventDefault();
        setMarkingNotice(true);
        setMarkSuccess(null);
        try {
            const res = await fetch(`/api/area-incident/${token}/mark-notice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken() || '',
                },
                body: JSON.stringify({
                    type: incidentType,
                    notes: incidentNotes,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Gagal menandai gangguan');
            }

            setMarkSuccess(data.message || 'Gangguan berhasil ditandai & dipublikasikan ke Status Jaringan!');
            if (data.incident) {
                setIncident(data.incident);
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setMarkingNotice(false);
        }
    };

    const handleSendNotification = async () => {
        setConfirmSendModal(false);
        setSendingNotification(true);
        setSendResult(null);

        try {
            const res = await fetch(`/api/area-incident/${token}/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken() || '',
                },
                body: JSON.stringify({
                    message: messageText,
                    customer_ids: selectedCustomerIds,
                }),
            });

            const data = await res.json();
            setSendResult({
                success: data.success,
                message: data.message || (data.success ? 'Pesan berhasil dikirim!' : 'Sebagian pesan gagal'),
                sent_count: data.sent_count ?? 0,
                failed_count: data.failed_count ?? 0,
            });

            if (data.incident) {
                setIncident(data.incident);
            }
        } catch (err) {
            setSendResult({
                success: false,
                message: 'Terjadi kesalahan jaringan: ' + err.message,
                sent_count: 0,
                failed_count: selectedCustomerIds.length,
            });
        } finally {
            setSendingNotification(false);
        }
    };

    const toggleSelectAll = () => {
        const inactives = incident?.inactive_customers_data || [];
        if (selectedCustomerIds.length === inactives.length) {
            setSelectedCustomerIds([]);
        } else {
            setSelectedCustomerIds(inactives.map(c => c.id));
        }
    };

    const toggleCustomer = (id) => {
        setSelectedCustomerIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
                    <RefreshCw className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-4" />
                    <h2 className="text-lg font-bold text-slate-800">Memuat Data Insiden...</h2>
                    <p className="text-sm text-slate-500 mt-1">Mengambil rincian area dan status pelanggan dari server</p>
                </div>
            </div>
        );
    }

    if (error || !incident) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 max-w-md w-full text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Insiden Tidak Ditemukan</h2>
                    <p className="text-sm text-slate-600 mb-6">
                        {error || 'Link penanganan gangguan sudah kedaluwarsa atau token tidak valid.'}
                    </p>
                    <Link
                        to="/status-jaringan"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition"
                    >
                        <ArrowLeft size={16} />
                        Buka Status Jaringan Publik
                    </Link>
                </div>
            </div>
        );
    }

    const inactiveList = incident.inactive_customers_data || [];
    const filteredInactive = inactiveList.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.pppoe_username && c.pppoe_username.toLowerCase().includes(q)) ||
            (c.odp && c.odp.toLowerCase().includes(q))
        );
    });

    const inactivePercentage = incident.total_customers > 0
        ? Math.round((incident.inactive_customers_count / incident.total_customers) * 100)
        : 0;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
            {/* Top Bar */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
                <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                            RK
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-slate-900 leading-tight">
                                Pusat Aksi Gangguan Area
                            </h1>
                            <p className="text-xs text-slate-500">RumahKitaNet NOC & Field Response</p>
                        </div>
                    </div>
                    <Link
                        to="/status-jaringan"
                        target="_blank"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                    >
                        <span>Status Jaringan</span>
                        <ExternalLink size={13} />
                    </Link>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
                {/* Incident Overview Card */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 p-1" />
                    <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                        <ShieldAlert size={13} />
                                        PERINGATAN GANGGUAN MASSAL
                                    </span>
                                    <span className="text-xs text-slate-400">â€¢</span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {incident.alerted_at ? new Date(incident.alerted_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                    Area / Dusun: <span className="text-orange-600">{incident.area_code}</span>
                                </h2>
                                <p className="text-sm text-slate-600 mt-1">
                                    Terdeteksi {incident.inactive_customers_count} dari total {incident.total_customers} pelanggan tidak aktif ({inactivePercentage}% offline).
                                </p>
                            </div>

                            <div className="flex flex-col sm:items-end gap-1.5">
                                <div className="text-xs text-slate-500 font-medium">Status Tindakan:</div>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                    incident.status === 'notified_customers' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                    incident.status === 'marked_notice' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                    'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                    {incident.status === 'notified_customers' ? 'âœ“ Pesan Terkirim ke Pelanggan' :
                                     incident.status === 'marked_notice' ? 'âœ“ Gangguan Ditandai' :
                                     'Menunggu Respon Teknisi'}
                                </span>
                            </div>
                        </div>

                        {/* Metric Highlights */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <div className="text-xs text-slate-500 font-medium">Total Pelanggan</div>
                                <div className="text-xl font-bold text-slate-800 mt-0.5">{incident.total_customers}</div>
                            </div>
                            <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-100">
                                <div className="text-xs text-emerald-700 font-medium">Pelanggan Aktif</div>
                                <div className="text-xl font-bold text-emerald-700 mt-0.5">{incident.active_customers_count}</div>
                            </div>
                            <div className="bg-red-50/70 rounded-xl p-3 border border-red-100">
                                <div className="text-xs text-red-700 font-medium">Pelanggan Offline</div>
                                <div className="text-xl font-bold text-red-700 mt-0.5">{incident.inactive_customers_count}</div>
                            </div>
                            <div className="bg-orange-50/70 rounded-xl p-3 border border-orange-100">
                                <div className="text-xs text-orange-700 font-medium">Rasio Gangguan</div>
                                <div className="text-xl font-bold text-orange-700 mt-0.5">{inactivePercentage}%</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Option 1: Tandai Gangguan */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base">
                                1
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Tandai Jenis Gangguan</h3>
                                <p className="text-xs text-slate-500">
                                    Mempublikasikan insiden ini ke portal status jaringan agar pelanggan & tim mengetahui penyebabnya.
                                </p>
                            </div>
                        </div>
                        {incident.network_notice_id && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                <Check size={14} /> Terpublikasi
                            </span>
                        )}
                    </div>

                    {markSuccess && (
                        <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-sm text-emerald-800">
                            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            <span>{markSuccess}</span>
                        </div>
                    )}

                    <form onSubmit={handleMarkNotice} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                                Pilih Penyebab Gangguan:
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIncidentType('pemadaman_listrik');
                                        handleSelectTemplate('listrik');
                                    }}
                                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                                        incidentType === 'pemadaman_listrik'
                                            ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <div className={`p-2 rounded-lg shrink-0 ${incidentType === 'pemadaman_listrik' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        <Zap size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-900">Pemadaman Listrik (PLN)</div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Mati lampu di wilayah {incident.area_code} yang menyebabkan OLT/switch/AP padam.
                                        </p>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIncidentType('maintenance_jaringan');
                                        handleSelectTemplate('maintenance');
                                    }}
                                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                                        incidentType === 'maintenance_jaringan'
                                            ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <div className={`p-2 rounded-lg shrink-0 ${incidentType === 'maintenance_jaringan' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        <Wrench size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-900">Maintenance Jaringan</div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Perbaikan kabel FO, pergantian perangkat, atau optimasi routing teknisi.
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Catatan Tambahan Teknisi (Opsional):
                            </label>
                            <textarea
                                value={incidentNotes}
                                onChange={(e) => setIncidentNotes(e.target.value)}
                                rows={2}
                                placeholder="Contoh: Pemadaman PLN jalur utara estimasi nyala pukul 16.00 WIB, atau kabel FO putus tertimpa pohon sedang disambung..."
                                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-center justify-end">
                            <button
                                type="submit"
                                disabled={markingNotice}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs disabled:opacity-50 transition"
                            >
                                {markingNotice ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Menyimpan...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Tandai & Publikasikan Gangguan
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Option 2: Kirim Pesan ke Pelanggan Tidak Aktif */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-base">
                                2
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Kirim Pesan WhatsApp ke Pelanggan Tidak Aktif</h3>
                                <p className="text-xs text-slate-500">
                                    Kirim notifikasi pesan langsung ke WhatsApp pelanggan yang terdeteksi offline pada area {incident.area_code}.
                                </p>
                            </div>
                        </div>
                    </div>

                    {sendResult && (
                        <div className={`mb-5 p-4 rounded-xl border ${sendResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                            <div className="flex items-center gap-2 font-bold text-sm mb-1">
                                {sendResult.success ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-amber-600" />}
                                <span>{sendResult.message}</span>
                            </div>
                            <div className="text-xs opacity-80 mt-1">
                                Terkirim: {sendResult.sent_count} | Gagal: {sendResult.failed_count}
                            </div>
                        </div>
                    )}

                    {/* Template Chooser */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                            Pilih Template Pesan Cepat:
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => handleSelectTemplate('listrik')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    selectedTemplate === 'listrik'
                                        ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                âš¡ Template Listrik Padam
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectTemplate('maintenance')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    selectedTemplate === 'maintenance'
                                        ? 'bg-blue-50 text-blue-800 border-blue-300 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                ðŸ”§ Template Maintenance
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectTemplate('umum')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    selectedTemplate === 'umum'
                                        ? 'bg-purple-50 text-purple-800 border-purple-300 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                ðŸ“¢ Template Gangguan Umum
                            </button>
                        </div>
                    </div>

                    {/* Editable Text Area (Free Text) */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Isi Pesan WhatsApp (Dapat Diedit Bebas):
                            </label>
                            <span className="text-xs text-slate-400">{messageText.length} karakter</span>
                        </div>
                        <textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            rows={6}
                            className="w-full px-3.5 py-2.5 text-sm font-sans border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
                            placeholder="Tulis pesan WhatsApp untuk pelanggan offline di area ini..."
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            * Anda dapat mengubah, menambah keterangan teknis, atau mengedit teks di atas secara bebas sebelum dikirim.
                        </p>
                    </div>

                    {/* Inactive Customers Selector */}
                    <div>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h4 className="text-sm font-bold text-slate-900">
                                    Daftar Pelanggan Offline ({inactiveList.length})
                                </h4>
                                <p className="text-xs text-slate-500">
                                    {selectedCustomerIds.length} pelanggan dipilih untuk menerima pesan WhatsApp.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                                >
                                    {selectedCustomerIds.length === inactiveList.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                                </button>
                            </div>
                        </div>

                        {/* Search Filter */}
                        <div className="relative mb-3">
                            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari nama pelanggan, nomor WhatsApp, atau ODP..."
                                className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                        </div>

                        {/* Customer List Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100">
                            {filteredInactive.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-400">
                                    Tidak ada pelanggan yang cocok dengan pencarian.
                                </div>
                            ) : (
                                filteredInactive.map(c => {
                                    const isSelected = selectedCustomerIds.includes(c.id);
                                    const hasValidPhone = c.phone && c.phone !== '0';

                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => hasValidPhone && toggleCustomer(c.id)}
                                            className={`p-3 flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                                                !hasValidPhone ? 'opacity-50 bg-slate-50 cursor-not-allowed' :
                                                isSelected ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    disabled={!hasValidPhone}
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-slate-900 truncate">
                                                        {c.name || 'Tanpa Nama'}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                                        <span className="font-mono text-slate-600">{c.pppoe_username}</span>
                                                        {c.odp && <span>â€¢ ODP: {c.odp}</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <div className="text-xs font-mono font-medium text-slate-700 flex items-center justify-end gap-1">
                                                    <Phone size={12} className="text-slate-400" />
                                                    {c.phone || <span className="text-red-500 text-2xs">No Phone</span>}
                                                </div>
                                                <span className="inline-block px-1.5 py-0.5 text-2xs font-semibold rounded bg-red-100 text-red-700 mt-0.5">
                                                    Offline
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Submit Send Button */}
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                            <div className="text-xs text-slate-500">
                                Penerima terpilih: <span className="font-bold text-slate-800">{selectedCustomerIds.length}</span> orang
                            </div>
                            <button
                                type="button"
                                onClick={() => setConfirmSendModal(true)}
                                disabled={selectedCustomerIds.length === 0 || !messageText.trim() || sendingNotification}
                                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-xs disabled:opacity-50 transition"
                            >
                                {sendingNotification ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Mengirim Pesan...
                                    </>
                                ) : (
                                    <>
                                        <Send size={16} />
                                        Kirim Pesan ke {selectedCustomerIds.length} Pelanggan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Confirmation Modal */}
            {confirmSendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                            <Send size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
                            Kirim Notifikasi Massal?
                        </h3>
                        <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed">
                            Pesan WhatsApp akan dikirim ke <span className="font-bold text-emerald-700">{selectedCustomerIds.length} pelanggan nonaktif</span> di area <strong>{incident.area_code}</strong> melalui WhatsApp Gateway.
                        </p>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 max-h-36 overflow-y-auto mb-5 font-sans whitespace-pre-line">
                            {messageText}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmSendModal(false)}
                                className="w-1/2 py-2.5 px-4 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSendNotification}
                                className="w-1/2 py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
                            >
                                Ya, Kirim Sekarang
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
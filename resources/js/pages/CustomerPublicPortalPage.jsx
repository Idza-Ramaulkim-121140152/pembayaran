import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
    Wifi,
    Lock,
    Eye,
    EyeOff,
    Copy,
    Check,
    Smartphone,
    Laptop,
    Tv,
    Shield,
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    Info,
    Phone,
    MapPin,
    Calendar,
    CreditCard,
    ExternalLink,
    RefreshCw,
    User,
    Ban,
    MessageSquare,
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Sparkles,
    FileText,
    Clock,
} from 'lucide-react';

export default function CustomerPublicPortalPage() {
    const { token } = useParams();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [portalData, setPortalData] = useState(null);

    // WiFi Password visibility
    const [showPassword, setShowPassword] = useState(false);
    const [copiedPassword, setCopiedPassword] = useState(false);

    // Ganti WiFi Form
    const [showChangeWifiForm, setShowChangeWifiForm] = useState(false);
    const [wifiForm, setWifiForm] = useState({ ssid: '', password: '', password_confirmation: '' });
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [savingWifi, setSavingWifi] = useState(false);
    const [wifiMessage, setWifiMessage] = useState('');
    const [wifiError, setWifiError] = useState('');

    // Blocking device state
    const [blockingMac, setBlockingMac] = useState(null);
    const [blockModalTarget, setBlockModalTarget] = useState(null);
    const [actionMessage, setActionMessage] = useState('');

    // Complaint / Aduan Gangguan state
    const [showComplaintForm, setShowComplaintForm] = useState(false);
    const [complaintCategory, setComplaintCategory] = useState('los_merah');
    const [complaintSubject, setComplaintSubject] = useState('Lampu LOS Router Berkedip Merah / Tidak Ada Sinyal Optik');
    const [complaintMessage, setComplaintMessage] = useState('');
    const [submittingComplaint, setSubmittingComplaint] = useState(false);
    const [complaintSuccess, setComplaintSuccess] = useState('');
    const [complaintError, setComplaintError] = useState('');

    // Fetch portal data
    const loadPortalData = async () => {
        if (!token) return;
        try {
            setError('');
            const res = await axios.get(`/api/public/portal/${token}`);
            setPortalData(res.data);
            if (res.data?.wifi?.ssid) {
                setWifiForm((prev) => ({ ...prev, ssid: res.data.wifi.ssid }));
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat portal pelanggan. Pastikan link yang Anda buka benar.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPortalData();
    }, [token]);

    // Handle Category change for complaint
    const handleCategoryChange = (cat) => {
        setComplaintCategory(cat);
        const titles = {
            los_merah: 'Lampu LOS Router Berkedip Merah / Tidak Ada Sinyal Optik',
            mati_total: 'Router Mati Total / Tidak Menyala Sama Sekali',
            koneksi_lambat: 'Koneksi Internet Sangat Lambat / Lemot',
            sering_putus: 'Koneksi Internet Sering Putus-Putus / RTO',
            ganti_password: 'Bantuan Pengaturan Nama & Sandi WiFi',
            lainnya: 'Laporan Kendala Jaringan Internet',
        };
        setComplaintSubject(titles[cat] || 'Laporan Kendala Jaringan');
    };

    // Handle Submit Complaint
    const handleSubmitComplaint = async (e) => {
        e.preventDefault();
        setComplaintError('');
        setComplaintSuccess('');

        if (!complaintMessage || complaintMessage.trim().length < 5) {
            setComplaintError('Harap jelaskan rincian kendala Anda minimal 5 karakter.');
            return;
        }

        try {
            setSubmittingComplaint(true);
            const res = await axios.post(`/api/public/portal/${token}/complaints`, {
                category: complaintCategory,
                subject: complaintSubject.trim(),
                message: complaintMessage.trim(),
            });

            setComplaintSuccess(res.data?.message || 'Laporan aduan berhasil dikirim! Tim teknisi kami akan segera memproses laporan Anda.');
            setComplaintMessage('');
            setShowComplaintForm(false);
            await loadPortalData();
        } catch (err) {
            setComplaintError(err.response?.data?.message || 'Gagal mengirim laporan aduan.');
        } finally {
            setSubmittingComplaint(false);
        }
    };

    // Handle Ganti Password WiFi
    const handleSaveWifi = async (e) => {
        e.preventDefault();
        setWifiError('');
        setWifiMessage('');

        if (!wifiForm.password) {
            setWifiError('Masukkan kata sandi WiFi baru (minimal 8 karakter).');
            return;
        }

        if (wifiForm.password.length < 8) {
            setWifiError('Kata sandi WiFi baru minimal 8 karakter.');
            return;
        }

        if (wifiForm.password_confirmation && wifiForm.password !== wifiForm.password_confirmation) {
            setWifiError('Konfirmasi kata sandi baru tidak cocok.');
            return;
        }

        try {
            setSavingWifi(true);
            const res = await axios.post(`/api/public/portal/${token}/wifi`, {
                ssid: wifiForm.ssid ? wifiForm.ssid.trim() : undefined,
                password: wifiForm.password.trim(),
            });

            setWifiMessage(res.data?.message || 'Kata sandi WiFi berhasil diperbarui di router!');
            setWifiForm((prev) => ({ ...prev, password: '', password_confirmation: '' }));
            setShowChangeWifiForm(false);
            await loadPortalData();
        } catch (err) {
            setWifiError(err.response?.data?.message || 'Gagal memperbarui kata sandi WiFi.');
        } finally {
            setSavingWifi(false);
        }
    };

    // Handle Blokir Perangkat
    const handleConfirmBlock = async () => {
        if (!blockModalTarget) return;
        const mac = blockModalTarget.mac_address;
        try {
            setBlockingMac(mac);
            setActionMessage('');
            const res = await axios.post(`/api/public/portal/${token}/block-device`, {
                mac_address: mac,
                reason: `Diblokir oleh pelanggan (${blockModalTarget.name || 'Perangkat'})`,
            });
            setActionMessage(res.data?.message || `Perangkat ${mac} berhasil diblokir.`);
            setBlockModalTarget(null);
            await loadPortalData();
        } catch (err) {
            alert(err.response?.data?.message || 'Gagal memblokir perangkat.');
        } finally {
            setBlockingMac(null);
        }
    };

    // Handle Buka Blokir Perangkat
    const handleUnblock = async (mac) => {
        if (!confirm(`Apakah Anda yakin ingin membuka blokir untuk perangkat ${mac}?`)) return;
        try {
            setBlockingMac(mac);
            setActionMessage('');
            const res = await axios.post(`/api/public/portal/${token}/unblock-device`, {
                mac_address: mac,
            });
            setActionMessage(res.data?.message || `Blokir perangkat ${mac} berhasil dibuka.`);
            await loadPortalData();
        } catch (err) {
            alert(err.response?.data?.message || 'Gagal membuka blokir perangkat.');
        } finally {
            setBlockingMac(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
                <div className="p-4 rounded-3xl bg-slate-800/80 border border-slate-700 shadow-2xl backdrop-blur-md max-w-sm w-full space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">Memuat Portal Pelanggan</h3>
                        <p className="text-xs text-slate-400 mt-1">Mengambil data status router & jaringan Anda...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !portalData) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
                <div className="p-6 sm:p-7 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md max-w-md w-full space-y-4 text-left">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                        <AlertTriangle size={28} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Akses Portal Tidak Ditemukan</h2>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            {error || 'Tautan akses portal pelanggan yang Anda buka tidak valid atau telah kedaluwarsa. Silakan periksa kembali tautan yang diberikan atau hubungi layanan pelanggan kami.'}
                        </p>
                    </div>
                    <div className="pt-3 border-t border-slate-800 space-y-2.5">
                        <button
                            type="button"
                            onClick={() => {
                                setLoading(true);
                                loadPortalData();
                            }}
                            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition border border-slate-700"
                        >
                            <RefreshCw size={14} />
                            Coba Muat Ulang Halaman
                        </button>
                        <a
                            href={`https://wa.me/6282181512403?text=${encodeURIComponent(`Halo CS Rumah Kita Net, saya ingin menanyakan tautan portal mandiri pelanggan WiFi saya yang tidak dapat dibuka (Token: ${token || '-'}).`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30"
                        >
                            <MessageSquare size={16} />
                            Hubungi Customer Service via WhatsApp
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    const { customer, package: pkg, capacity, wifi, disruption, invoice, cs_contact } = portalData;
    const isOnline = wifi.is_online;
    const blockedMacSet = new Set((wifi.blocked_devices || []).map((b) => b.mac_address.toUpperCase()));

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans pb-16">
            {/* TOP BRAND NAVBAR */}
            <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800/80 px-4 py-3.5 shadow-sm">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-extrabold shadow-md shadow-emerald-900/40">
                            <Wifi size={18} />
                        </div>
                        <div>
                            <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                                Rumah Kita Net
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    Portal Pelanggan
                                </span>
                            </h1>
                            <p className="text-[11px] text-slate-400">Pusat Informasi & Manajemen WiFi Mandiri</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-xs ${
                                !wifi.has_router
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : isOnline
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                        >
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    !wifi.has_router ? 'bg-amber-400' : isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                                }`}
                            />
                            {!wifi.has_router ? 'Router Belum Tertaut ACS' : isOnline ? 'Router Online' : 'Router Offline'}
                        </span>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT CONTAINER */}
            <main className="max-w-3xl mx-auto px-4 pt-5 space-y-4">
                {/* GREETING HERO CARD */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-800/90 to-slate-900 border border-slate-700/80 p-5 shadow-xl">
                    <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
                        <div>
                            <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                                <Sparkles size={13} />
                                Selamat Datang
                            </p>
                            <h2 className="text-xl font-extrabold text-white mt-0.5">{customer.name}</h2>
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                                <MapPin size={13} className="text-slate-500 shrink-0" />
                                {customer.address}
                            </p>
                        </div>
                        <div className="sm:text-right">
                            <span className="text-[11px] font-semibold text-slate-400 block">Paket Langganan:</span>
                            <span className="inline-block mt-0.5 font-bold text-sm text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-xl">
                                {pkg.name} ({pkg.speed})
                            </span>
                        </div>
                    </div>
                </div>

                {/* ACTION MESSAGE BANNER */}
                {actionMessage && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>{actionMessage}</span>
                        </div>
                        <button onClick={() => setActionMessage('')} className="text-emerald-400 hover:text-white font-bold ml-2">
                            ✕
                        </button>
                    </div>
                )}

                {/* SECTION: PEMBERITAHUAN GANGGUAN ROUTER & FORM ADUAN */}
                {disruption?.is_disrupted && (
                    <div className="rounded-3xl bg-gradient-to-br from-rose-950/70 via-slate-800 to-amber-950/50 border-2 border-rose-500/40 p-5 shadow-2xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                                    <AlertTriangle size={22} className="animate-bounce" />
                                </div>
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-extrabold text-white">
                                            Perangkat Terindikasi Mengalami Gangguan
                                        </h3>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                                            {disruption.offline_duration_minutes > 0
                                                ? `Tidak Aktif > ${disruption.offline_duration_minutes} Menit`
                                                : 'Tidak Aktif > 15 Menit'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                        Router Anda terdeteksi tidak aktif sejak <strong>{disruption.last_active_at || 'beberapa waktu lalu'}</strong>. Silakan periksa adaptor listrik router dan pastikan lampu indikator tidak berkedip merah (LOS).
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 sm:self-start">
                                <button
                                    type="button"
                                    onClick={() => setShowComplaintForm(!showComplaintForm)}
                                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/50"
                                >
                                    <FileText size={14} />
                                    {showComplaintForm ? 'Tutup Formulir' : 'Buat Laporan Aduan'}
                                    {showComplaintForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                            </div>
                        </div>

                        {/* COMPLAINT SUCCESS BANNER */}
                        {complaintSuccess && (
                            <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                                <CheckCircle2 size={16} className="shrink-0" />
                                <span>{complaintSuccess}</span>
                            </div>
                        )}

                        {/* COLLAPSIBLE COMPLAINT FORM */}
                        {showComplaintForm && (
                            <form onSubmit={handleSubmitComplaint} className="pt-3 border-t border-slate-700/80 space-y-3.5 text-left">
                                <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                                    <FileText size={14} />
                                    Formulir Pengaduan Kendala Teknis:
                                </h4>

                                {complaintError && (
                                    <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
                                        {complaintError}
                                    </div>
                                )}

                                {/* Kategori Kendala Pills */}
                                <div>
                                    <label className="block text-slate-300 text-xs font-semibold mb-1.5">
                                        Pilih Kategori Kendala:
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                        {[
                                            { key: 'los_merah', label: '🔴 Lampu LOS Berkedip Merah' },
                                            { key: 'mati_total', label: '🔌 Router Mati / Tidak Menyala' },
                                            { key: 'koneksi_lambat', label: '🐢 Internet Lambat / Lemot' },
                                            { key: 'sering_putus', label: '📶 Sering Putus / RTO' },
                                            { key: 'ganti_password', label: '🔒 Bantuan Pengaturan WiFi' },
                                            { key: 'lainnya', label: '📝 Kendala Lainnya' },
                                        ].map((c) => (
                                            <button
                                                key={c.key}
                                                type="button"
                                                onClick={() => handleCategoryChange(c.key)}
                                                className={`p-2.5 rounded-xl border text-left font-medium transition text-[11px] ${
                                                    complaintCategory === c.key
                                                        ? 'bg-rose-600/30 border-rose-400 text-white font-bold'
                                                        : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                                                }`}
                                            >
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Judul Laporan */}
                                <div>
                                    <label className="block text-slate-300 text-xs font-semibold mb-1">
                                        Judul Laporan:
                                    </label>
                                    <input
                                        type="text"
                                        value={complaintSubject}
                                        onChange={(e) => setComplaintSubject(e.target.value)}
                                        placeholder="Judul kendala..."
                                        className="w-full text-xs rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                        required
                                    />
                                </div>

                                {/* Rincian Pesan */}
                                <div>
                                    <label className="block text-slate-300 text-xs font-semibold mb-1">
                                        Rincian Keluhan / Pesan untuk Teknisi: <span className="text-rose-400">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={complaintMessage}
                                        onChange={(e) => setComplaintMessage(e.target.value)}
                                        placeholder="Contoh: Lampu LOS berkedip merah sejak tadi pagi, sudah coba restart router tetap merah..."
                                        className="w-full text-xs rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                        required
                                    />
                                </div>

                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowComplaintForm(false)}
                                        className="px-3.5 py-2 text-xs font-semibold text-slate-400 rounded-xl hover:bg-slate-700/60"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submittingComplaint}
                                        className="px-4 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-500 disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
                                    >
                                        {submittingComplaint ? (
                                            <>
                                                <RefreshCw size={13} className="animate-spin" />
                                                Mengirim Laporan...
                                            </>
                                        ) : (
                                            'Kirim Laporan Aduan'
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* RECENT COMPLAINTS LIST */}
                        {disruption.recent_complaints && disruption.recent_complaints.length > 0 && (
                            <div className="pt-3 border-t border-slate-700/80 space-y-2">
                                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                    <Clock size={13} className="text-slate-400" />
                                    Riwayat Aduan Anda ({disruption.recent_complaints.length}):
                                </h4>
                                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 divide-y divide-slate-800/80 overflow-hidden text-xs">
                                    {disruption.recent_complaints.map((c) => (
                                        <div key={c.id} className="p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-slate-300 text-[11px]">{c.ticket_number}</span>
                                                    <p className="font-bold text-white">{c.subject}</p>
                                                </div>
                                                <span
                                                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                                                        c.status === 'resolved' || c.status === 'closed'
                                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                            : c.status === 'in_progress'
                                                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                                    }`}
                                                >
                                                    {c.status_label}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400">Dibuat: {c.created_at}</p>
                                            {c.admin_response && (
                                                <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-emerald-300 mt-1">
                                                    <strong className="text-white">Tanggapan Teknisi:</strong> {c.admin_response}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* SECTION 1: WIFI & KATA SANDI CARD */}
                <div className="rounded-3xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Wifi size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Pengaturan WiFi & Sandi</h3>
                                <p className="text-[11px] text-slate-400">Informasi nama WiFi dan kata sandi router</p>
                            </div>
                        </div>

                        {wifi.has_router && (
                            <button
                                type="button"
                                onClick={() => setShowChangeWifiForm(!showChangeWifiForm)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-950/50"
                            >
                                <Lock size={13} />
                                {showChangeWifiForm ? 'Tutup Form' : 'Ganti Sandi WiFi'}
                                {showChangeWifiForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                        )}
                    </div>

                    {!wifi.has_router ? (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-2.5">
                            <div className="flex items-start gap-2.5">
                                <Info size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-bold text-amber-300">
                                        Router Belum Tertaut ke Sistem GenieACS
                                    </p>
                                    <p className="text-[11px] leading-relaxed text-slate-300">
                                        Perangkat router di lokasi Anda belum disinkronkan dengan sistem otomasi TR-069 kami. Untuk bantuan konfigurasi nama WiFi, kata sandi, atau pengecekan oleh teknisi, silakan hubungi Customer Service kami.
                                    </p>
                                </div>
                            </div>
                            <div className="pt-1 flex justify-end">
                                <a
                                    href={`https://wa.me/${cs_contact.whatsapp}?text=${encodeURIComponent(cs_contact.support_message)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow"
                                >
                                    <MessageSquare size={13} />
                                    Hubungi CS via WhatsApp
                                </a>
                            </div>
                        </div>
                    ) : (
                        <>

                    {/* WIFI CREDENTIALS BOX */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {/* Nama SSID */}
                        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/70">
                            <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                <Wifi size={13} className="text-emerald-400" />
                                Nama Jaringan WiFi (SSID):
                            </p>
                            <p className="text-sm font-bold text-white mt-1 font-mono break-all">
                                {wifi.ssid || 'Rumah Kita Net WiFi'}
                            </p>
                        </div>

                        {/* Kata Sandi Saat Ini */}
                        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/70">
                            <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                <Lock size={13} className="text-emerald-400" />
                                Kata Sandi WiFi Saat Ini:
                            </p>
                            {wifi.password ? (
                                <div className="flex items-center justify-between mt-1">
                                    <span className="font-mono text-sm font-extrabold text-emerald-300 tracking-wider select-all">
                                        {showPassword ? wifi.password : '••••••••••••'}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                            title={showPassword ? 'Sembunyikan' : 'Lihat kata sandi'}
                                        >
                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(wifi.password);
                                                setCopiedPassword(true);
                                                setTimeout(() => setCopiedPassword(false), 2000);
                                            }}
                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 text-[11px]"
                                            title="Salin kata sandi"
                                        >
                                            {copiedPassword ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                            <span>{copiedPassword ? 'Tersalin' : 'Salin'}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-1 space-y-1.5">
                                    <p className="text-[11px] text-amber-300/90 leading-relaxed">
                                        Kata sandi terenkripsi di router.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CATATAN CUSTOMER SERVICE JIKA PASSWORD BELUM TERBACA */}
                    {!wifi.password && (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-2">
                            <div className="flex items-start gap-2.5">
                                <Info size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-bold text-amber-300">
                                        Kata Sandi WiFi Terenkripsi di Router
                                    </p>
                                    <p className="text-[11px] leading-relaxed text-slate-300">
                                        Kata sandi pada model router ini dilindungi enkripsi internal router. Jika Anda lupa kata sandi atau ingin mereset kata sandi WiFi, silakan gunakan tombol <strong>Ganti Sandi WiFi</strong> di atas atau hubungi Customer Service kami.
                                    </p>
                                </div>
                            </div>
                            <div className="pt-1 flex justify-end">
                                <a
                                    href={`https://wa.me/${cs_contact.whatsapp}?text=${encodeURIComponent(cs_contact.support_message)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow"
                                >
                                    <MessageSquare size={13} />
                                    Hubungi CS via WhatsApp
                                </a>
                            </div>
                        </div>
                    )}

                    {/* COLLAPSIBLE GANTI PASSWORD FORM */}
                    {showChangeWifiForm && (
                        <form onSubmit={handleSaveWifi} className="pt-3 border-t border-slate-700/80 space-y-3.5">
                            <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                <Lock size={14} />
                                Formulir Penggantian Kata Sandi / Nama WiFi:
                            </h4>

                            {wifiError && (
                                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                                    {wifiError}
                                </div>
                            )}
                            {wifiMessage && (
                                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
                                    {wifiMessage}
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">
                                        Nama SSID WiFi (Opsional)
                                    </label>
                                    <input
                                        type="text"
                                        value={wifiForm.ssid}
                                        onChange={(e) => setWifiForm((p) => ({ ...p, ssid: e.target.value }))}
                                        placeholder="Nama WiFi..."
                                        className="w-full text-xs rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">
                                        Kata Sandi Baru (Min. 8 Karakter) <span className="text-rose-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            value={wifiForm.password}
                                            onChange={(e) => setWifiForm((p) => ({ ...p, password: e.target.value }))}
                                            placeholder="Minimal 8 karakter..."
                                            className="w-full text-xs rounded-xl bg-slate-900 border border-slate-700 pr-9 p-2.5 font-mono text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                        >
                                            {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowChangeWifiForm(false)}
                                    className="px-3.5 py-2 text-xs font-semibold text-slate-400 rounded-xl hover:bg-slate-700/60"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingWifi}
                                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-900/30"
                                >
                                    {savingWifi ? (
                                        <>
                                            <RefreshCw size={13} className="animate-spin" />
                                            Mengirim ke Router...
                                        </>
                                    ) : (
                                        'Simpan Kata Sandi Baru'
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                    </>
                    )}
                </div>

                {/* SECTION 2: STATUS KAPASITAS & PAKET INTERNET */}
                <div className="rounded-3xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-xl space-y-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Shield size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Kapasitas & Layanan Paket</h3>
                                <p className="text-[11px] text-slate-400">Status penggunaan perangkat dan batas kuota</p>
                            </div>
                        </div>

                        <span
                            className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                                capacity.status === 'safe'
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : capacity.status === 'warning'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : capacity.status === 'critical'
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    : 'bg-slate-700 text-slate-300 border-slate-600'
                            }`}
                        >
                            {capacity.label}
                        </span>
                    </div>

                    {/* CAPACITY PROGRESS & INFO */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-700/60">
                            <p className="text-[11px] text-slate-400">Perangkat Terhubung</p>
                            <p className="text-base font-extrabold text-white mt-0.5">
                                {capacity.connected_count} <span className="text-xs font-normal text-slate-400">Unit</span>
                            </p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-700/60">
                            <p className="text-[11px] text-slate-400">Batas Maksimal Paket</p>
                            <p className="text-base font-extrabold text-emerald-400 mt-0.5">
                                {capacity.max_devices ? `${capacity.max_devices} Perangkat` : (capacity.max_devices_label || 'Tanpa Batas')}
                            </p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-700/60">
                            <p className="text-[11px] text-slate-400">Kecepatan Paket</p>
                            <p className="text-base font-extrabold text-cyan-400 mt-0.5">{pkg.speed}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-700/60">
                            <p className="text-[11px] text-slate-400">Status Langganan</p>
                            <p className="text-base font-extrabold text-emerald-400 mt-0.5">{pkg.active_status}</p>
                        </div>
                    </div>

                    {/* STATUS EXPLANATION ALERT */}
                    {capacity.status === 'safe' && (
                        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>Perangkat yang terhubung saat ini sesuai dengan kapasitas paket langganan Anda.</span>
                        </div>
                    )}
                    {capacity.status === 'warning' && (
                        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                            <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                            <span>Jumlah perangkat terhubung melebihi kuota 1 unit. Pertimbangkan untuk upgrade paket jika koneksi melambat.</span>
                        </div>
                    )}
                    {capacity.status === 'critical' && (
                        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                            <ShieldAlert size={16} className="shrink-0 text-rose-400" />
                            <span>Jumlah perangkat terhubung melebihi batas kuota paket (+{capacity.diff} perangkat). Blokir perangkat yang tidak dikenal di bawah ini atau hubungi CS untuk upgrade paket.</span>
                        </div>
                    )}
                </div>

                {/* SECTION 3: DAFTAR PERANGKAT TERHUBUNG & FITUR BLOKIR */}
                <div className="rounded-3xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-xl space-y-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Smartphone size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Daftar Perangkat Terhubung</h3>
                                <p className="text-[11px] text-slate-400">HP, Laptop, atau Smart TV yang menggunakan WiFi Anda</p>
                            </div>
                        </div>

                        <span className="text-xs font-bold text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-700">
                            {wifi.connected_hosts?.length || 0} Perangkat
                        </span>
                    </div>

                    {/* CONNECTED HOSTS LIST */}
                    {wifi.connected_hosts && wifi.connected_hosts.length > 0 ? (
                        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 divide-y divide-slate-800/80 overflow-hidden">
                            {wifi.connected_hosts.map((h, idx) => {
                                const isBlocked = blockedMacSet.has((h.mac_address || '').toUpperCase());
                                return (
                                    <div
                                        key={idx}
                                        className={`p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs transition ${
                                            h.is_active ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-slate-800/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`p-2 rounded-xl ${
                                                    h.is_active
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                        : 'bg-slate-800 text-slate-400'
                                                }`}
                                            >
                                                {h.type?.toLowerCase().includes('lan') ? <Laptop size={16} /> : <Smartphone size={16} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="font-bold text-white text-xs">{h.name || `Perangkat ${idx + 1}`}</p>
                                                    {h.is_active && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.2 rounded">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            Aktif
                                                        </span>
                                                    )}
                                                    {isBlocked && (
                                                        <span className="text-[9px] font-bold text-rose-400 bg-rose-950/80 border border-rose-800/60 px-1.5 py-0.2 rounded">
                                                            Diblokir
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                                                    IP: <strong className="text-slate-300">{h.ip_address || '-'}</strong> · MAC:{' '}
                                                    <strong className="text-slate-300">{h.mac_address || '-'}</strong>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                                                {h.type || 'WiFi'}
                                            </span>

                                            {h.mac_address && !isBlocked && (
                                                <button
                                                    type="button"
                                                    onClick={() => setBlockModalTarget(h)}
                                                    disabled={blockingMac === h.mac_address}
                                                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-[11px] transition flex items-center gap-1"
                                                >
                                                    <Ban size={12} />
                                                    Blokir
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-6 rounded-2xl border border-dashed border-slate-700 text-center text-xs text-slate-400 bg-slate-900/40 space-y-1">
                            <Smartphone size={24} className="mx-auto text-slate-500 mb-1" />
                            <p className="font-semibold text-slate-300">Belum ada rincian klien terhubung yang dilaporkan router.</p>
                            <p className="text-[11px]">Perangkat Anda akan muncul otomatis saat aktif berselancar internet.</p>
                        </div>
                    )}

                    {/* BLOCKED DEVICES SECTION */}
                    {wifi.blocked_devices && wifi.blocked_devices.length > 0 && (
                        <div className="pt-3 border-t border-slate-700/80 space-y-2">
                            <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                                <Ban size={13} />
                                Perangkat yang Diblokir ({wifi.blocked_devices.length}):
                            </h4>
                            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 divide-y divide-rose-900/30 overflow-hidden">
                                {wifi.blocked_devices.map((b, bIdx) => (
                                    <div key={bIdx} className="p-3 flex items-center justify-between text-xs">
                                        <div>
                                            <p className="font-mono font-bold text-rose-300">{b.mac_address}</p>
                                            <p className="text-[10px] text-slate-400">{b.reason || 'Diblokir oleh pemilik WiFi'}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleUnblock(b.mac_address)}
                                            disabled={blockingMac === b.mac_address}
                                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] transition"
                                        >
                                            Buka Blokir
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* SECTION 4: TAGIHAN & PEMBAYARAN */}
                <div className="rounded-3xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-xl space-y-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <CreditCard size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Informasi Tagihan & Masa Aktif</h3>
                                <p className="text-[11px] text-slate-400">Jadwal jatuh tempo pembayaran bulanan</p>
                            </div>
                        </div>

                        {invoice && (
                            <span
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${
                                    invoice.is_paid
                                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                }`}
                            >
                                {invoice.is_paid ? 'Tagihan Lunas' : 'Menunggu Pembayaran'}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-700/60">
                            <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Calendar size={13} className="text-amber-400" />
                                Waktu Jatuh Tempo Bayar:
                            </p>
                            <p className="text-sm font-bold text-white mt-1">{customer.due_date}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Pastikan pembayaran sebelum tanggal jatuh tempo agar internet tetap lancar.</p>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-700/60 flex flex-col justify-between">
                            <div>
                                <p className="text-[11px] text-slate-400">Tarif Bulanan:</p>
                                <p className="text-base font-extrabold text-emerald-400 mt-0.5">
                                    Rp {pkg.price.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">/ bulan</span>
                                </p>
                            </div>
                            {invoice && !invoice.is_paid && invoice.payment_url && (
                                <a
                                    href={invoice.payment_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow"
                                >
                                    <CreditCard size={13} />
                                    Bayar Tagihan Sekarang
                                    <ExternalLink size={12} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* SECTION 5: INFORMASI PELANGGAN GENERAL (NON-SENSITIF) */}
                <div className="rounded-3xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-xl space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-slate-700/50 text-slate-300 border border-slate-600">
                            <User size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Informasi Akun Pelanggan</h3>
                            <p className="text-[11px] text-slate-400">Data registrasi dan kontak terdaftar</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                        <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
                            <p className="text-[11px] text-slate-400">Nama Lengkap</p>
                            <p className="font-bold text-white mt-0.5">{customer.name}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
                            <p className="text-[11px] text-slate-400">No. WhatsApp / Telepon</p>
                            <p className="font-bold text-emerald-400 mt-0.5 font-mono">{customer.phone || '-'}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
                            <p className="text-[11px] text-slate-400">Lokasi / Alamat</p>
                            <p className="font-bold text-slate-200 mt-0.5 truncate">{customer.address}</p>
                        </div>
                    </div>
                </div>

                {/* CS WHATSAPP CTA FOOTER */}
                <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-800 to-teal-950/60 border border-emerald-500/30 text-center space-y-3 shadow-xl">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg">
                        <HelpCircle size={24} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white">Butuh Bantuan Teknis atau Pengaturan Router?</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                            Tim Customer Service Rumah Kita Net siap membantu Anda 24/7 untuk keluhan koneksi, perbaikan, atau upgrade paket.
                        </p>
                    </div>
                    <a
                        href={`https://wa.me/${cs_contact.whatsapp}?text=${encodeURIComponent(cs_contact.support_message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/50"
                    >
                        <MessageSquare size={16} />
                        Chat Customer Service via WhatsApp
                    </a>
                </div>

                <footer className="text-center text-[11px] text-slate-500 pt-4">
                    © {new Date().getFullYear()} Rumah Kita Net · Layanan Internet Cepat & Terpercaya
                </footer>
            </main>

            {/* MODAL KONFIRMASI BLOKIR PERANGKAT */}
            {blockModalTarget && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-left">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <Ban size={24} />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white">Konfirmasi Blokir Perangkat</h4>
                            <p className="text-xs text-slate-400 mt-1">
                                Apakah Anda yakin ingin memblokir perangkat <strong>{blockModalTarget.name || 'ini'}</strong> (MAC:{' '}
                                <span className="font-mono text-slate-300">{blockModalTarget.mac_address}</span>)?
                            </p>
                            <p className="text-[11px] text-amber-300/90 mt-2">
                                Perangkat ini tidak akan bisa terhubung ke WiFi Anda setelah diblokir.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={() => setBlockModalTarget(null)}
                                className="px-3.5 py-2 text-xs font-semibold text-slate-400 rounded-xl hover:bg-slate-800"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmBlock}
                                disabled={Boolean(blockingMac)}
                                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
                            >
                                {blockingMac ? <RefreshCw size={13} className="animate-spin" /> : <Ban size={13} />}
                                Ya, Blokir Perangkat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

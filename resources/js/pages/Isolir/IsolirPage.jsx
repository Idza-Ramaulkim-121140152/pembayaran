import { useEffect, useState, useMemo } from 'react';
import { 
    Users, 
    Wifi, 
    Phone, 
    MapPin, 
    Calendar, 
    AlertCircle, 
    RefreshCw, 
    MessageSquare, 
    Send, 
    History, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    ExternalLink, 
    Search, 
    X, 
    AlertTriangle,
    Check
} from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Modal from '../../components/common/Modal';
import axios from 'axios';

function IsolirPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [isolatedDevices, setIsolatedDevices] = useState([]);

    // Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'notified' | 'unnotified'

    // Notice Modal
    const [selectedDeviceForNotice, setSelectedDeviceForNotice] = useState(null);
    const [customMessage, setCustomMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(null);
    const [sendError, setSendError] = useState(null);

    // History Modal
    const [selectedDeviceForHistory, setSelectedDeviceForHistory] = useState(null);

    useEffect(() => {
        fetchIsolatedDevices();
    }, []);

    const fetchIsolatedDevices = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get('/api/isolir', {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            setIsolatedDevices(response.data.data || []);
        } catch (err) {
            console.error('Failed to fetch isolated devices:', err);
            setError(err.response?.data?.message || 'Gagal mengambil data perangkat isolir');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchIsolatedDevices();
        setRefreshing(false);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
    };

    const cleanPhone = (phone) => {
        if (!phone) return '';
        let cleaned = String(phone).replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }
        return cleaned;
    };

    const buildDefaultMessage = (device) => {
        const name = device.customer?.name || device.username;
        const username = device.username;
        const address = device.customer?.address || '-';
        const packageType = device.customer?.package_type || '-';

        return `Halo *${name}*,

Pemberitahuan dari *Rumah Kita Network*.

Sehubungan dengan status layanan internet Anda yang saat ini telah terisolir dan belum ada konfirmasi penyelesaian pembayaran tagihan, kami menginformasikan bahwa tim teknisi kami dijadwalkan untuk melakukan *penarikan / pencopotan perangkat* (Modem ONT & adaptor) yang terpasang di lokasi Anda:

👤 *Nama Pelanggan:* ${name}
🏠 *Alamat:* ${address}
📦 *Paket Layanan:* ${packageType}
🔑 *ID / User PPPoE:* ${username}

Apabila Anda masih ingin melanjutkan layanan internet atau telah melakukan pembayaran tagihan, mohon segera hubungi admin kami untuk konfirmasi agar jadwal pencopotan alat dapat dibatalkan.

Terima kasih atas perhatian dan kerjasamanya.

_Rumah Kita Network_`;
    };

    const openNoticeModal = (device) => {
        setSelectedDeviceForNotice(device);
        setCustomMessage(buildDefaultMessage(device));
        setSendSuccess(null);
        setSendError(null);
    };

    const closeNoticeModal = () => {
        if (sending) return;
        setSelectedDeviceForNotice(null);
        setCustomMessage('');
        setSendSuccess(null);
        setSendError(null);
    };

    const handleSendNotice = async () => {
        if (!selectedDeviceForNotice) return;
        const phone = selectedDeviceForNotice.customer?.phone;
        if (!phone || cleanPhone(phone).length < 9) {
            setSendError('Nomor telepon pelanggan tidak valid atau kosong. Harap perbarui data pelanggan terlebih dahulu.');
            return;
        }

        try {
            setSending(true);
            setSendError(null);
            setSendSuccess(null);

            const payload = {
                username: selectedDeviceForNotice.username,
                customer_id: selectedDeviceForNotice.customer?.id || null,
                phone: phone,
                custom_message: customMessage,
            };

            const response = await axios.post('/api/isolir/send-dismantle-notice', payload, {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const newLog = response.data.log;
            setSendSuccess(response.data.message || 'Pemberitahuan pencopotan alat berhasil dikirim!');

            // Update local state so UI instantly reflects the new notice & history
            setIsolatedDevices(prev => prev.map(d => {
                if (d.username === selectedDeviceForNotice.username) {
                    const currentHistory = Array.isArray(d.dismantle_history) ? d.dismantle_history : [];
                    const updatedHistory = [newLog, ...currentHistory];
                    return {
                        ...d,
                        last_dismantle_notice: newLog,
                        dismantle_history: updatedHistory,
                        dismantle_count: updatedHistory.length,
                    };
                }
                return d;
            }));

            setTimeout(() => {
                closeNoticeModal();
            }, 1800);
        } catch (err) {
            console.error('Failed to send dismantle notice:', err);
            const errMsg = err.response?.data?.message || err.message || 'Gagal mengirim pesan WhatsApp';
            setSendError(errMsg);

            // If log was still created (e.g. status failed in DB)
            if (err.response?.data?.log) {
                const failedLog = err.response.data.log;
                setIsolatedDevices(prev => prev.map(d => {
                    if (d.username === selectedDeviceForNotice.username) {
                        const currentHistory = Array.isArray(d.dismantle_history) ? d.dismantle_history : [];
                        const updatedHistory = [failedLog, ...currentHistory];
                        return {
                            ...d,
                            last_dismantle_notice: failedLog,
                            dismantle_history: updatedHistory,
                            dismantle_count: updatedHistory.length,
                        };
                    }
                    return d;
                }));
            }
        } finally {
            setSending(false);
        }
    };

    // Filtered devices
    const filteredDevices = useMemo(() => {
        return isolatedDevices.filter(device => {
            const query = searchQuery.toLowerCase().trim();
            const matchesQuery = !query || 
                (device.username && device.username.toLowerCase().includes(query)) ||
                (device.customer?.name && device.customer.name.toLowerCase().includes(query)) ||
                (device.customer?.phone && device.customer.phone.includes(query)) ||
                (device.customer?.address && device.customer.address.toLowerCase().includes(query));

            const hasNotice = Boolean(device.last_dismantle_notice);
            let matchesStatus = true;
            if (statusFilter === 'notified') {
                matchesStatus = hasNotice;
            } else if (statusFilter === 'unnotified') {
                matchesStatus = !hasNotice;
            }

            return matchesQuery && matchesStatus;
        });
    }, [isolatedDevices, searchQuery, statusFilter]);

    // Statistics counts
    const totalNotified = useMemo(() => {
        return isolatedDevices.filter(d => Boolean(d.last_dismantle_notice)).length;
    }, [isolatedDevices]);

    const totalUnnotified = isolatedDevices.length - totalNotified;

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data perangkat isolir..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <AlertTriangle className="text-red-600 h-8 w-8" />
                        Perangkat Isolir
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Daftar perangkat yang dibatasi karena lewat jatuh tempo & manajemen notifikasi pencopotan alat.
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm font-semibold text-sm"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Memuat...' : 'Refresh MikroTik'}
                </button>
            </div>

            {error && (
                <Alert
                    type="error"
                    title="Error"
                    message={error}
                    onClose={() => setError(null)}
                />
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl shadow-md p-5 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-red-100 text-xs font-semibold uppercase tracking-wider">Total Perangkat Isolir</p>
                            <p className="text-3xl font-extrabold mt-1">{isolatedDevices.length}</p>
                            <p className="text-red-100 text-xs mt-1">Profile isolir di MikroTik</p>
                        </div>
                        <div className="bg-white/20 p-3 rounded-xl">
                            <AlertCircle size={32} />
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl shadow-md p-5 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-amber-100 text-xs font-semibold uppercase tracking-wider">Sudah Diberi Notif</p>
                            <p className="text-3xl font-extrabold mt-1">{totalNotified}</p>
                            <p className="text-amber-100 text-xs mt-1">Pemberitahuan pencopotan dikirim</p>
                        </div>
                        <div className="bg-white/20 p-3 rounded-xl">
                            <Clock size={32} />
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-2xl shadow-md p-5 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Belum Diberi Notif</p>
                            <p className="text-3xl font-extrabold mt-1">{totalUnnotified}</p>
                            <p className="text-slate-300 text-xs mt-1">Menunggu pengiriman pesan</p>
                        </div>
                        <div className="bg-white/20 p-3 rounded-xl">
                            <MessageSquare size={32} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
                    <input
                        type="text"
                        placeholder="Cari nama, user PPPoE, telepon, atau alamat..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className={`px-3 py-1.5 rounded-lg transition ${
                            statusFilter === 'all'
                                ? 'bg-white shadow-sm text-blue-600 font-bold'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        Semua ({isolatedDevices.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('notified')}
                        className={`px-3 py-1.5 rounded-lg transition ${
                            statusFilter === 'notified'
                                ? 'bg-white shadow-sm text-amber-600 font-bold'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        Sudah Notif ({totalNotified})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('unnotified')}
                        className={`px-3 py-1.5 rounded-lg transition ${
                            statusFilter === 'unnotified'
                                ? 'bg-white shadow-sm text-slate-800 font-bold'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        Belum Notif ({totalUnnotified})
                    </button>
                </div>
            </div>

            {/* Devices List */}
            {filteredDevices.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 text-gray-500 rounded-full mb-4">
                        <Wifi size={32} />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {isolatedDevices.length === 0 ? 'Tidak Ada Perangkat Isolir' : 'Tidak Ada Perangkat Sesuai Filter'}
                    </h3>
                    <p className="text-gray-500 text-sm max-w-md mx-auto">
                        {isolatedDevices.length === 0
                            ? 'Saat ini tidak ada perangkat yang menggunakan profile isolir di MikroTik.'
                            : 'Cobalah mengubah kata kunci pencarian atau ganti filter status di atas.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {filteredDevices.map((device, index) => {
                        const hasPhone = Boolean(device.customer?.phone && cleanPhone(device.customer.phone).length >= 9);
                        const lastNotice = device.last_dismantle_notice;
                        const historyCount = device.dismantle_count || (device.dismantle_history?.length ?? 0);

                        return (
                            <div
                                key={index}
                                className="bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
                            >
                                <div className="p-5 space-y-4">
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-11 h-11 bg-red-50 text-red-600 rounded-xl flex items-center justify-center font-bold">
                                                <Wifi size={22} />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-gray-900 leading-snug">
                                                    {device.customer?.name || 'Pelanggan Tidak Terdata'}
                                                </h3>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                                        {device.username}
                                                    </span>
                                                    {device.remote_address && (
                                                        <span className="text-xs font-mono text-gray-400">
                                                            {device.remote_address}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full border border-red-200">
                                            ISOLIR
                                        </span>
                                    </div>

                                    {/* Customer Info Box */}
                                    {device.customer ? (
                                        <div className="space-y-2 bg-gray-50 rounded-xl p-3.5 text-xs">
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} className="text-gray-400 shrink-0" />
                                                <span className="text-gray-500 w-20">Telepon:</span>
                                                <span className="font-semibold text-gray-800">
                                                    {device.customer.phone || '-'}
                                                </span>
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                                                <span className="text-gray-500 w-20">Alamat:</span>
                                                <span className="font-medium text-gray-700 leading-relaxed">
                                                    {device.customer.address || '-'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-gray-400 shrink-0" />
                                                <span className="text-gray-500 w-20">Jatuh Tempo:</span>
                                                <span className="font-bold text-red-600">
                                                    {formatDate(device.customer.due_date)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users size={14} className="text-gray-400 shrink-0" />
                                                <span className="text-gray-500 w-20">Paket:</span>
                                                <span className="font-medium text-gray-800">
                                                    {device.customer.package_type || '-'}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                                            ⚠️ Data pelanggan tidak ditemukan di tabel database dengan username ini.
                                        </div>
                                    )}

                                    {/* Notice History Box */}
                                    <div className="rounded-xl border border-gray-100 bg-slate-50/70 p-3 text-xs">
                                        {lastNotice ? (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 text-amber-700 font-semibold">
                                                        <Clock size={13} className="shrink-0" />
                                                        <span>Notifikasi Pencopotan Terakhir:</span>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                        lastNotice.status === 'sent'
                                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                                            : 'bg-red-100 text-red-700 border border-red-200'
                                                    }`}>
                                                        {lastNotice.status === 'sent' ? (
                                                            <>
                                                                <CheckCircle2 size={11} /> Terkirim
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle size={11} /> Gagal
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="text-gray-600 flex items-center justify-between">
                                                    <span>
                                                        {lastNotice.sent_at_human} {lastNotice.sent_by ? `oleh ${lastNotice.sent_by}` : ''}
                                                    </span>
                                                    {historyCount > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedDeviceForHistory(device)}
                                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                                                        >
                                                            <History size={12} />
                                                            Lihat Riwayat ({historyCount})
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between text-gray-500">
                                                <span className="flex items-center gap-1.5">
                                                    <Clock size={13} className="text-gray-400" />
                                                    Belum pernah dikirim notifikasi pencopotan alat
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Card Footer Actions */}
                                <div className="p-4 bg-gray-50/90 border-t border-gray-100 flex items-center justify-between gap-3">
                                    <div className="text-[11px] text-gray-400">
                                        Profile: <span className="font-mono text-gray-600">{device.profile}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {historyCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedDeviceForHistory(device)}
                                                title="Lihat riwayat pesan yang dikirim"
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 transition shadow-sm"
                                            >
                                                <History size={14} className="text-gray-500" />
                                                <span className="hidden sm:inline">Riwayat</span>
                                                <span>({historyCount})</span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => openNoticeModal(device)}
                                            disabled={!hasPhone}
                                            title={!hasPhone ? 'Nomor telepon tidak valid' : 'Kirim pesan pemberitahuan pencopotan alat via WA'}
                                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition active:scale-95 ${
                                                hasPhone
                                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                                    : 'bg-gray-400 cursor-not-allowed opacity-60'
                                            }`}
                                        >
                                            <MessageSquare size={14} />
                                            <span>Kirim WA Pencopotan</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* SEND NOTICE MODAL */}
            {selectedDeviceForNotice && (
                <Modal
                    isOpen={Boolean(selectedDeviceForNotice)}
                    onClose={closeNoticeModal}
                    title="Kirim Pemberitahuan Pencopotan Alat"
                    size="lg"
                >
                    <div className="space-y-4 text-sm text-gray-700">
                        {/* Summary banner */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <span className="text-gray-500">Pelanggan:</span>
                                <p className="font-bold text-gray-900 text-sm">
                                    {selectedDeviceForNotice.customer?.name || selectedDeviceForNotice.username}
                                </p>
                            </div>
                            <div>
                                <span className="text-gray-500">No. WhatsApp Tujuan:</span>
                                <p className="font-bold text-emerald-700 font-mono text-sm">
                                    {selectedDeviceForNotice.customer?.phone || '-'}
                                </p>
                            </div>
                            <div>
                                <span className="text-gray-500">ID / PPPoE:</span>
                                <p className="font-mono text-gray-800">{selectedDeviceForNotice.username}</p>
                            </div>
                            <div>
                                <span className="text-gray-500">Paket Layanan:</span>
                                <p className="font-medium text-gray-800">
                                    {selectedDeviceForNotice.customer?.package_type || '-'}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <span className="text-gray-500">Alamat:</span>
                                <p className="font-medium text-gray-800">
                                    {selectedDeviceForNotice.customer?.address || '-'}
                                </p>
                            </div>
                        </div>

                        {/* Alerts inside modal */}
                        {sendSuccess && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-semibold">
                                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                <span>{sendSuccess}</span>
                            </div>
                        )}

                        {sendError && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2 text-xs font-semibold">
                                <AlertCircle size={16} className="text-red-600 shrink-0" />
                                <span>{sendError}</span>
                            </div>
                        )}

                        {/* Message Textarea */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="font-bold text-gray-800 text-xs">
                                    Isi Pesan WhatsApp (Bisa diedit bila perlu penyesuaian tanggal):
                                </label>
                                <span className="text-[11px] text-gray-400 font-mono">
                                    {customMessage.length} karakter
                                </span>
                            </div>
                            <textarea
                                rows={10}
                                value={customMessage}
                                onChange={(e) => setCustomMessage(e.target.value)}
                                disabled={sending}
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-xs font-sans focus:ring-2 focus:ring-emerald-500 focus:outline-none transition leading-relaxed"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">
                                💡 Pesan akan dikirim langsung menggunakan service WhatsApp Gateway yang berjalan di server.
                            </p>
                        </div>

                        {/* Modal Actions */}
                        <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            {/* Manual WA Link */}
                            {selectedDeviceForNotice.customer?.phone && (
                                <a
                                    href={`https://wa.me/${cleanPhone(selectedDeviceForNotice.customer.phone)}?text=${encodeURIComponent(customMessage)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition border border-emerald-200"
                                >
                                    <ExternalLink size={13} />
                                    <span>Buka di WA Web / App</span>
                                </a>
                            )}

                            <div className="flex items-center gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={closeNoticeModal}
                                    disabled={sending}
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendNotice}
                                    disabled={sending}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
                                >
                                    {sending ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            <span>Mengirim Pesan...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send size={14} />
                                            <span>Kirim Otomatis via API</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* HISTORY MODAL */}
            {selectedDeviceForHistory && (
                <Modal
                    isOpen={Boolean(selectedDeviceForHistory)}
                    onClose={() => setSelectedDeviceForHistory(null)}
                    title={`Riwayat Notifikasi Pencopotan - ${selectedDeviceForHistory.customer?.name || selectedDeviceForHistory.username}`}
                    size="xl"
                >
                    <div className="space-y-4 text-sm">
                        <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <div>
                                User PPPoE: <strong className="font-mono text-gray-800">{selectedDeviceForHistory.username}</strong>
                            </div>
                            <div>
                                No. Telepon: <strong className="text-gray-800">{selectedDeviceForHistory.customer?.phone || '-'}</strong>
                            </div>
                        </div>

                        {(!selectedDeviceForHistory.dismantle_history || selectedDeviceForHistory.dismantle_history.length === 0) ? (
                            <div className="p-8 text-center text-gray-400">
                                <History size={36} className="mx-auto mb-2 text-gray-300" />
                                <p className="font-semibold text-sm">Belum Ada Riwayat</p>
                                <p className="text-xs text-gray-400 mt-1">Belum pernah ada pesan pemberitahuan pencopotan alat yang dikirimkan ke pelanggan ini.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                {selectedDeviceForHistory.dismantle_history.map((log, idx) => (
                                    <div
                                        key={log.id || idx}
                                        className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 transition space-y-2"
                                    >
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold ${
                                                    log.status === 'sent'
                                                        ? 'bg-green-100 text-green-700 border border-green-200'
                                                        : 'bg-red-100 text-red-700 border border-red-200'
                                                }`}>
                                                    {log.status === 'sent' ? (
                                                        <>
                                                            <CheckCircle2 size={12} /> Terkirim
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircle size={12} /> Gagal
                                                        </>
                                                    )}
                                                </span>
                                                <span className="font-semibold text-gray-700">
                                                    {log.sent_at_human}
                                                </span>
                                            </div>
                                            <span className="text-gray-400 text-[11px]">
                                                Dikirim oleh: <strong className="text-gray-600">{log.sent_by || 'Admin'}</strong>
                                            </span>
                                        </div>

                                        <div className="text-xs text-gray-500">
                                            No. Tujuan: <span className="font-mono text-gray-700">{log.phone || '-'}</span>
                                        </div>

                                        {log.error && (
                                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 font-mono">
                                                Error: {log.error}
                                            </div>
                                        )}

                                        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans border border-gray-100 max-h-40 overflow-y-auto">
                                            {log.message}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="pt-3 border-t border-gray-100 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedDeviceForHistory(null)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default IsolirPage;
import { useEffect, useState } from 'react';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    DollarSign,
    ExternalLink,
    FileText,
    HelpCircle,
    MessageCircle,
    RefreshCw,
    RotateCcw,
    Search,
    Shield,
    Sparkles,
    User,
    Wifi,
    X,
    ZoomIn,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import paymentVerificationService from '../../services/paymentVerificationService';

export default function AutoConfirmationHistoryPage() {
    const [captures, setCaptures] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [datePreset, setDatePreset] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'approved' | 'cancelled'
    const [currentPage, setCurrentPage] = useState(1);

    // Cancel modal state
    const [cancelModal, setCancelModal] = useState({
        open: false,
        capture: null,
        cancelling: false,
    });

    // Preview zoom image
    const [previewImage, setPreviewImage] = useState(null);

    const loadData = async (
        page = currentPage,
        search = searchQuery,
        startDate = fromDate,
        endDate = toDate,
        status = statusFilter
    ) => {
        try {
            setError('');
            setRefreshing(true);

            const response = await paymentVerificationService.getAutoConfirmations({
                page,
                per_page: 20,
                search: search.trim() || undefined,
                from_date: startDate || undefined,
                to_date: endDate || undefined,
                status: status !== 'all' ? status : undefined,
            });

            const payload = response.data?.data || {};
            setCaptures(payload.data || []);
            setPagination(payload);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memuat riwayat konfirmasi terima auto.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData(1, searchQuery, fromDate, toDate, statusFilter);
    }, [statusFilter]);

    const handleSearch = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        loadData(1, searchQuery, fromDate, toDate, statusFilter);
    };

    const handleDatePresetChange = (preset) => {
        setDatePreset(preset);
        setCurrentPage(1);

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        let start = '';
        let end = '';

        if (preset === 'today') {
            start = todayStr;
            end = todayStr;
        } else if (preset === 'last7') {
            const past7 = new Date();
            past7.setDate(now.getDate() - 7);
            const pY = past7.getFullYear();
            const pM = String(past7.getMonth() + 1).padStart(2, '0');
            const pD = String(past7.getDate()).padStart(2, '0');
            start = `${pY}-${pM}-${pD}`;
            end = todayStr;
        } else if (preset === 'thisMonth') {
            start = `${yyyy}-${mm}-01`;
            end = todayStr;
        }

        setFromDate(start);
        setToDate(end);
        loadData(1, searchQuery, start, end, statusFilter);
    };

    const handleCancelConfirmation = async () => {
        if (!cancelModal.capture) return;

        try {
            setCancelModal((prev) => ({ ...prev, cancelling: true }));
            setError('');

            const response = await paymentVerificationService.cancelAutoConfirmation(cancelModal.capture.id);
            setSuccessMessage(response.data?.message || 'Konfirmasi pembayaran berhasil dibatalkan.');

            setCancelModal({ open: false, capture: null, cancelling: false });
            await loadData(currentPage, searchQuery, fromDate, toDate, statusFilter);

            setTimeout(() => setSuccessMessage(''), 6000);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal membatalkan konfirmasi pembayaran.');
            setCancelModal((prev) => ({ ...prev, cancelling: false }));
        }
    };

    // Calculate Summary Stats from current list
    const totalApproved = captures.filter((c) => c.match_status === 'approved').length;
    const totalCancelled = captures.filter((c) => c.match_status === 'cancelled').length;
    const totalAmount = captures
        .filter((c) => c.match_status === 'approved')
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 space-y-6">
            {/* Header Section */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link
                            to="/settings/payment-verification"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg transition"
                        >
                            <ArrowLeft size={13} />
                            Kembali ke Verifikasi AI
                        </Link>
                        <span className="text-xs text-gray-400 font-medium">•</span>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Otomatisasi Pembayaran
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-600" size={26} />
                        Monitoring Riwayat Konfirmasi Terima Auto
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Catatan audit pembayaran yang terkonfirmasi otomatis oleh AI (Akurasi &ge; 80%), tercatat ke mutasi kas dengan penerima Admin Finance.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <button
                        type="button"
                        onClick={() => loadData(currentPage, searchQuery, fromDate, toDate, statusFilter)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <Link
                        to="/finance/mutasi"
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                    >
                        <DollarSign size={14} />
                        Lihat Mutasi Keuangan
                    </Link>
                </div>
            </div>

            {/* Notification Alerts */}
            {successMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                    <button type="button" onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800">
                        <X size={16} />
                    </button>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5">
                        <AlertCircle size={18} className="text-rose-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="text-rose-600 hover:text-rose-800">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Auto Lunas</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{pagination?.total ?? totalApproved}</div>
                        <div className="mt-0.5 text-xs text-emerald-600 font-medium">Auto-approved AI &ge; 80%</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <CheckCircle2 size={24} />
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Masuk Mutasi</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            Rp {totalAmount.toLocaleString('id-ID')}
                        </div>
                        <div className="mt-0.5 text-xs text-emerald-600 font-medium">Income Kas Perusahaan</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <DollarSign size={24} />
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Penerima Kas</div>
                        <div className="mt-1 text-base font-bold text-slate-900 truncate">Admin Finance</div>
                        <div className="mt-0.5 text-xs text-slate-500 font-medium">[Keuangan Perusahaan]</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                        <Shield size={24} />
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Dibatalkan (Rollback)</div>
                        <div className="mt-1 text-2xl font-bold text-rose-600">{totalCancelled}</div>
                        <div className="mt-0.5 text-xs text-gray-500 font-medium">Mutasi dihapus & jatuh tempo kembali</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                        <RotateCcw size={24} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <form onSubmit={handleSearch} className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari nama pelanggan, no WA, PPPoE, nomor referensi, invoice link..."
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                    </form>

                    {/* Date Presets */}
                    <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                        <span className="text-gray-400 font-medium whitespace-nowrap mr-1">Periode:</span>
                        {[
                            { key: 'all', label: 'Semua' },
                            { key: 'today', label: 'Hari Ini' },
                            { key: 'last7', label: '7 Hari' },
                            { key: 'thisMonth', label: 'Bulan Ini' },
                        ].map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => handleDatePresetChange(p.key)}
                                className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                                    datePreset === p.key
                                        ? 'bg-emerald-600 text-white font-semibold'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs">
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-500 font-medium">Status:</span>
                        <div className="flex items-center gap-1">
                            {[
                                { key: 'all', label: 'Semua Status' },
                                { key: 'approved', label: '🟢 Aktif (Lunas)' },
                                { key: 'cancelled', label: '🔴 Dibatalkan' },
                            ].map((s) => (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => setStatusFilter(s.key)}
                                    className={`rounded-lg px-2.5 py-1 transition ${
                                        statusFilter === s.key
                                            ? 'bg-slate-900 text-white font-semibold'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom Date Range */}
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => {
                                setFromDate(e.target.value);
                                setDatePreset('custom');
                            }}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700"
                        />
                        <span className="text-gray-400">s/d</span>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => {
                                setToDate(e.target.value);
                                setDatePreset('custom');
                            }}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700"
                        />
                        <button
                            type="button"
                            onClick={() => loadData(1, searchQuery, fromDate, toDate, statusFilter)}
                            className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                        >
                            Terapkan Filter
                        </button>
                    </div>
                </div>
            </div>

            {/* List / Table of Auto Confirmed Payments */}
            {loading ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white">
                    <RefreshCw className="animate-spin text-emerald-600" size={32} />
                    <span className="text-sm font-medium text-gray-500">Memuat riwayat konfirmasi terima auto...</span>
                </div>
            ) : captures.length === 0 ? (
                <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                    <CheckCircle2 className="text-gray-300" size={48} />
                    <div className="text-base font-semibold text-gray-700">Tidak ada riwayat konfirmasi terima auto</div>
                    <p className="max-w-md text-xs text-gray-500">
                        Pembayaran pelanggan dengan skor akurasi AI &ge; 80% akan otomatis masuk ke daftar ini beserta riwayat mutasi kas.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {captures.map((capture) => {
                        const isApproved = capture.match_status === 'approved';
                        const isCancelled = capture.match_status === 'cancelled';
                        const rollbackData = capture.rollback_data || {};
                        const analysis = capture.analysis || {};
                        const confidence = Number(capture.match_confidence || analysis.confidence_overall || 0);

                        return (
                            <div
                                key={capture.id}
                                className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                                    isCancelled ? 'border-rose-200 bg-rose-50/20 opacity-90' : 'border-gray-200'
                                }`}
                            >
                                <div className="flex flex-col lg:flex-row gap-5 items-start">
                                    {/* Proof Thumbnail */}
                                    <div className="shrink-0 w-full sm:w-48 flex flex-col items-center gap-2">
                                        <div
                                            onClick={() => capture.proof_url && setPreviewImage(capture.proof_url)}
                                            className="group relative h-40 w-full cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-gray-100 flex items-center justify-center"
                                        >
                                            {capture.proof_url ? (
                                                <>
                                                    <img
                                                        src={capture.proof_url}
                                                        alt="Bukti Struk"
                                                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white gap-1.5 text-xs font-semibold">
                                                        <ZoomIn size={16} />
                                                        Perbesar
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 text-gray-400">
                                                    <FileText size={28} />
                                                    <span className="text-[11px]">Tidak ada gambar</span>
                                                </div>
                                            )}
                                        </div>
                                        {capture.proof_url && (
                                            <a
                                                href={capture.proof_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                                            >
                                                <ExternalLink size={11} />
                                                Buka di Tab Baru
                                            </a>
                                        )}
                                    </div>

                                    {/* Transaction Details */}
                                    <div className="flex-1 space-y-3 w-full">
                                        {/* Status Header */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className="font-bold text-slate-900 text-base">Capture #{capture.id}</span>
                                                {isApproved && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                                        <CheckCircle2 size={12} />
                                                        Auto Lunas &amp; Masuk Mutasi
                                                    </span>
                                                )}
                                                {isCancelled && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                                                        <RotateCcw size={12} />
                                                        Dibatalkan (Rollback)
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-500 font-medium">
                                                    Sumber: <strong className="text-gray-700">{capture.source}</strong>
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <Clock size={13} className="text-gray-400" />
                                                <span>Dikonfirmasi: {capture.created_at_display || capture.created_at}</span>
                                            </div>
                                        </div>

                                        {/* Grid Info */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                            {/* Pelanggan */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 space-y-1">
                                                <div className="text-gray-400 font-medium flex items-center gap-1">
                                                    <User size={13} /> Pelanggan
                                                </div>
                                                <div className="font-bold text-slate-800 text-sm truncate">
                                                    {capture.customer?.name || 'Pelanggan Tidak Dikenal'}
                                                </div>
                                                <div className="text-gray-600 flex items-center gap-1">
                                                    <span>WA: {capture.customer?.phone || capture.sender_phone || '-'}</span>
                                                    {capture.customer?.phone && (
                                                        <a
                                                            href={`https://wa.me/${capture.customer.phone.replace(/\D/g, '')}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-emerald-600 hover:text-emerald-700 font-medium"
                                                        >
                                                            <MessageCircle size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                                {capture.customer?.pppoe_username && (
                                                    <div className="text-slate-500 font-mono text-[11px] truncate">
                                                        PPPoE: {capture.customer.pppoe_username}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Nominal & Struk Info */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 space-y-1">
                                                <div className="text-gray-400 font-medium flex items-center gap-1">
                                                    <DollarSign size={13} /> Nominal Transfer (Struk)
                                                </div>
                                                <div className="font-bold text-emerald-700 text-base">
                                                    Rp {Number(capture.amount).toLocaleString('id-ID')}
                                                </div>
                                                <div className="text-gray-600">
                                                    Waktu Struk:{' '}
                                                    <strong className="text-gray-800">
                                                        {capture.paid_date_display || capture.paid_date}
                                                        {analysis.paid_time ? ` ${analysis.paid_time}` : ''}
                                                    </strong>
                                                </div>
                                                <div className="text-gray-500 truncate">
                                                    No. Ref Struk:{' '}
                                                    <span className="font-mono font-semibold text-gray-800">
                                                        {capture.reference_code && !capture.reference_code.toLowerCase().startsWith('inv_')
                                                            ? capture.reference_code
                                                            : '-'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* AI Accuracy & Finance Receiver */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 space-y-1">
                                                <div className="text-gray-400 font-medium flex items-center gap-1">
                                                    <Sparkles size={13} className="text-amber-500" /> Akurasi AI &amp; Penerima
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 text-sm">{confidence}%</span>
                                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                                        &ge; 80% Valid
                                                    </span>
                                                </div>
                                                <div className="text-gray-600">
                                                    Penerima:{' '}
                                                    <strong className="text-purple-700">
                                                        {capture.invoice?.payment_receiver?.name || 'Admin Finance'}
                                                    </strong>
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    Buku Kas: <strong className="text-emerald-600">Mutasi Masuk</strong>
                                                </div>
                                            </div>

                                            {/* Masa Aktif & Jatuh Tempo */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 space-y-1">
                                                <div className="text-gray-400 font-medium flex items-center gap-1">
                                                    <Calendar size={13} /> Masa Aktif / Jatuh Tempo
                                                </div>
                                                {rollbackData.previous_due_date ? (
                                                    <div className="text-gray-700">
                                                        Semula: <span className="font-mono">{rollbackData.previous_due_date}</span>
                                                    </div>
                                                ) : null}
                                                <div className="text-slate-800 font-medium">
                                                    Baru:{' '}
                                                    <span className="font-bold text-emerald-700">
                                                        {capture.customer?.due_date || capture.invoice?.due_date || '-'}
                                                    </span>{' '}
                                                    <span className="text-[10px] text-emerald-600 font-semibold">(+30 hari)</span>
                                                </div>
                                                {rollbackData.was_isolated && (
                                                    <div className="text-[10px] text-amber-700 font-semibold">
                                                        *Sebelumnya Terisolir (Di-unisolir otomatis)
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Invoice Ref & Action Footer */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-gray-100">
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <FileText size={14} className="text-gray-400" />
                                                <span>
                                                    Tagihan Terkait:{' '}
                                                    <strong className="text-slate-800 font-mono">
                                                        {capture.invoice?.invoice_link || `#${capture.invoice_id}`}
                                                    </strong>
                                                </span>
                                                <span className="text-gray-300">•</span>
                                                <span className="capitalize font-semibold text-emerald-700">
                                                    Status Invoice: {capture.invoice?.status || 'paid'}
                                                </span>
                                            </div>

                                            {/* Action Buttons */}
                                            <div>
                                                {isApproved ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setCancelModal({ open: true, capture, cancelling: false })}
                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                                                    >
                                                        <RotateCcw size={13} />
                                                        Batalkan Konfirmasi
                                                    </button>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium bg-rose-50 px-3 py-1 rounded-xl">
                                                        <RotateCcw size={13} />
                                                        Pembayaran Dibatalkan &amp; Mutasi Dihapus
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Pagination */}
                    {pagination && pagination.last_page > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 rounded-2xl shadow-sm text-xs font-medium text-gray-600">
                            <div>
                                Menampilkan halaman {pagination.current_page} dari {pagination.last_page} (Total {pagination.total} data)
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const prev = Math.max(1, currentPage - 1);
                                        setCurrentPage(prev);
                                        loadData(prev, searchQuery, fromDate, toDate, statusFilter);
                                    }}
                                    disabled={currentPage <= 1}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-semibold text-gray-700 disabled:opacity-40"
                                >
                                    <ChevronLeft size={14} /> Sebelumnya
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = Math.min(pagination.last_page, currentPage + 1);
                                        setCurrentPage(next);
                                        loadData(next, searchQuery, fromDate, toDate, statusFilter);
                                    }}
                                    disabled={currentPage >= pagination.last_page}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-semibold text-gray-700 disabled:opacity-40"
                                >
                                    Berikutnya <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {cancelModal.open && cancelModal.capture && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shrink-0">
                                <RotateCcw size={24} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Batalkan Konfirmasi Pembayaran?</h3>
                                <p className="text-xs text-gray-500">Capture #{cancelModal.capture.id}</p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-900 space-y-2">
                            <p className="font-semibold text-rose-800">Pembatalan ini akan otomatis melakukan hal berikut:</p>
                            <ul className="list-disc pl-4 space-y-1 text-[11px] text-rose-700">
                                <li>
                                    <strong>Menghapus transaksi mutasi pemasukan</strong> dari buku kas / ledger keuangan.
                                </li>
                                <li>
                                    <strong>Mengembalikan invoice</strong> menjadi <em>Unpaid</em> (Belum Lunas).
                                </li>
                                <li>
                                    <strong>Mengembalikan tanggal jatuh tempo</strong> pelanggan ke tanggal semula sebelum auto-konfirmasi.
                                </li>
                                {cancelModal.capture.rollback_data?.was_isolated && (
                                    <li>
                                        <strong>Mengembalikan status isolir pelanggan</strong> di MikroTik &amp; sistem karena sebelumnya terisolir.
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setCancelModal({ open: false, capture: null, cancelling: false })}
                                disabled={cancelModal.cancelling}
                                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelConfirmation}
                                disabled={cancelModal.cancelling}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition disabled:opacity-50"
                            >
                                {cancelModal.cancelling ? (
                                    <>
                                        <RefreshCw size={13} className="animate-spin" />
                                        Membatalkan...
                                    </>
                                ) : (
                                    <>
                                        <RotateCcw size={13} />
                                        Ya, Batalkan Konfirmasi
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Image Modal */}
            {previewImage && (
                <div
                    onClick={() => setPreviewImage(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
                >
                    <div className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white p-2">
                        <img src={previewImage} alt="Struk Pembayaran" className="max-h-[85vh] w-auto object-contain rounded-xl" />
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

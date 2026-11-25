import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import HotspotLocationsMapSection from './HotspotLocationsMapSection';
import {
    Check,
    CheckCircle2,
    Clock,
    Copy,
    Download,
    Gauge,
    MessageCircle,
    QrCode,
    RefreshCw,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Ticket,
    Users,
    Wifi,
    AlertCircle,
    ArrowLeft,
} from 'lucide-react';

const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Number(val || 0));

export default function HotspotVoucherBuyPage() {
    const { orderCode: routeOrderCode } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const mikrotikLoginUrl = searchParams.get('link-login') || '';
    const mikrotikMac = searchParams.get('mac') || '';
    const mikrotikIp = searchParams.get('ip') || '';

    const [packages, setPackages] = useState([]);
    const [qrisReady, setQrisReady] = useState(true);
    const [loadingPackages, setLoadingPackages] = useState(true);
    const [selectedPackageId, setSelectedPackageId] = useState(null);
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const [activeOrder, setActiveOrder] = useState(null);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [copiedField, setCopiedField] = useState('');
    const autoLoginFormRef = useRef(null);

    const selectedPackage = useMemo(
        () => packages.find((p) => Number(p.id) === Number(selectedPackageId)) || null,
        [packages, selectedPackageId]
    );

    const loadPackages = useCallback(async () => {
        try {
            setLoadingPackages(true);
            const res = await fetch('/api/hotspot/packages', {
                headers: { Accept: 'application/json' },
            });
            const data = await res.json();
            const list = Array.isArray(data.packages) ? data.packages : [];
            setPackages(list);
            setQrisReady(data.qris_ready !== false);
            if (list.length > 0 && !selectedPackageId) {
                setSelectedPackageId(list[0].id);
            }
        } catch {
            setErrorMsg('Gagal memuat daftar paket voucher. Silakan muat ulang halaman.');
        } finally {
            setLoadingPackages(false);
        }
    }, [selectedPackageId]);

    const fetchOrderStatus = useCallback(async (code, silent = false) => {
        if (!code) return;
        try {
            if (!silent) setCheckingStatus(true);
            const res = await fetch(`/api/hotspot/orders/${encodeURIComponent(code)}/status`, {
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) {
                if (!silent) {
                    const errData = await res.json().catch(() => ({}));
                    setErrorMsg(errData.message || 'Pesanan voucher tidak ditemukan.');
                }
                return;
            }
            const data = await res.json();
            if (data.order) {
                setActiveOrder(data.order);
            }
        } catch {
            // silent retry on next poll
        } finally {
            if (!silent) setCheckingStatus(false);
        }
    }, []);

    useEffect(() => {
        loadPackages();
    }, [loadPackages]);

    useEffect(() => {
        if (routeOrderCode) {
            fetchOrderStatus(routeOrderCode, false);
        } else {
            setActiveOrder(null);
        }
    }, [routeOrderCode, fetchOrderStatus]);

    // Auto-polling every 3 seconds while order is pending
    useEffect(() => {
        if (!activeOrder || activeOrder.status !== 'pending') return undefined;
        const timer = setInterval(() => {
            fetchOrderStatus(activeOrder.order_code, true);
        }, 3000);
        return () => clearInterval(timer);
    }, [activeOrder, fetchOrderStatus]);

    const handleCopy = async (text, key) => {
        try {
            await navigator.clipboard.writeText(String(text));
            setCopiedField(key);
            setTimeout(() => setCopiedField(''), 2000);
        } catch {
            // ignore
        }
    };

    const handleCreateOrder = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!selectedPackageId) {
            setErrorMsg('Silakan pilih paket voucher terlebih dahulu.');
            return;
        }
        const digits = customerPhone.replace(/\D+/g, '');
        if (digits.length < 9) {
            setErrorMsg('Masukkan nomor WhatsApp aktif yang benar (contoh: 081234567890).');
            return;
        }

        try {
            setSubmitting(true);
            const res = await fetch('/api/hotspot/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    package_id: selectedPackageId,
                    customer_phone: customerPhone,
                    customer_name: customerName || null,
                    mac_address: mikrotikMac || null,
                    ip_address: mikrotikIp || null,
                    login_url: mikrotikLoginUrl || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.message || 'Gagal membuat pesanan voucher.');
                return;
            }
            if (data.order) {
                setActiveOrder(data.order);
                navigate(`/hotspot/order/${encodeURIComponent(data.order.order_code)}`, { replace: false });
            }
        } catch {
            setErrorMsg('Koneksi bermasalah saat membuat pesanan. Silakan coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAutoLoginWifi = () => {
        if (autoLoginFormRef.current) {
            autoLoginFormRef.current.submit();
        }
    };

    const handleNewOrder = () => {
        setActiveOrder(null);
        setErrorMsg('');
        const qs = searchParams.toString();
        navigate(`/hotspot/beli${qs ? `?${qs}` : ''}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-sky-900 py-6 px-4 text-slate-900">
            <div className="max-w-lg mx-auto">
                {/* Brand Header */}
                <div className="text-center mb-6 text-white">
                    <div className="inline-flex items-center justify-center gap-3 bg-white/95 px-4 py-2 rounded-2xl shadow-lg mb-3">
                        <img src="/logo-mms.png" alt="PT. Megarap Mitra Solusi (MMS)" className="h-8 w-auto object-contain" />
                        <span className="h-7 w-px bg-slate-300" />
                        <img src="/logo_baru.png" alt="Rumah Kita Network" className="h-9 w-auto object-contain" />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Voucher WiFi RUMAH KITA NETWORK</h1>
                    <p className="text-xs font-bold text-amber-300 mt-0.5">
                        POWERED BY PT. Megarap Mitra Solusi (MMS)
                    </p>
                    <p className="text-sm text-sky-200 mt-1">
                        Beli voucher mandiri 24 jam &bull; Bayar QRIS &bull; Kode langsung ke WhatsApp
                    </p>
                </div>

                {errorMsg && (
                    <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5 shadow">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* VIEW 1: PAID / VOUCHER READY */}
                {activeOrder && activeOrder.status === 'paid' && (
                    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-emerald-100">
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-center text-white">
                            <CheckCircle2 className="w-14 h-14 mx-auto mb-2 text-emerald-100" />
                            <h2 className="text-xl font-extrabold">Pembayaran Berhasil!</h2>
                            <p className="text-sm text-emerald-100 mt-1">
                                Voucher WiFi Anda sudah aktif dan siap digunakan.
                            </p>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Voucher Code Card */}
                            <div className="bg-slate-900 text-white rounded-2xl p-5 text-center relative overflow-hidden">
                                <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">
                                    Kode Voucher Anda
                                </p>
                                <p className="text-4xl font-black font-mono tracking-[0.22em] text-amber-400 my-2 select-all">
                                    {activeOrder.voucher_code}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(activeOrder.voucher_code, 'voucher')}
                                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition"
                                >
                                    {copiedField === 'voucher' ? (
                                        <>
                                            <Check className="w-4 h-4 text-emerald-400" /> Tersalin!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" /> Salin Kode Voucher
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Order Detail */}
                            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm border border-slate-100">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Paket</span>
                                    <span className="font-bold text-slate-900">{activeOrder.package?.name || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Masa Aktif</span>
                                    <span className="font-semibold text-slate-800">
                                        {activeOrder.package?.duration_label || '-'} (sejak login pertama)
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Maksimal Perangkat</span>
                                    <span className="font-semibold text-slate-800">
                                        {activeOrder.package?.max_devices || 1} Perangkat
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">WhatsApp</span>
                                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                        <MessageCircle className="w-3.5 h-3.5" />
                                        {activeOrder.customer_phone}
                                    </span>
                                </div>
                            </div>

                            {/* Hidden Auto-Login Form to MikroTik Hotspot */}
                            <form
                                ref={autoLoginFormRef}
                                action={activeOrder.login_url || 'http://rumahkita.id/login'}
                                method="post"
                                className="hidden"
                            >
                                <input type="hidden" name="username" value={activeOrder.voucher_code || ''} />
                                <input type="hidden" name="password" value={activeOrder.voucher_code || ''} />
                                <input type="hidden" name="dst" value="http://rumahkita.id/status" />
                                <input type="hidden" name="popup" value="true" />
                            </form>

                            <button
                                type="button"
                                onClick={handleAutoLoginWifi}
                                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-base shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition"
                            >
                                <Wifi className="w-5 h-5" />
                                Login WiFi Sekarang
                            </button>

                            <p className="text-xs text-center text-slate-500">
                                Kode voucher juga telah dikirim ke WhatsApp Anda. Jika tombol otomatis tidak merespon, masukkan kode <b>{activeOrder.voucher_code}</b> di halaman login WiFi.
                            </p>

                            <button
                                type="button"
                                onClick={handleNewOrder}
                                className="w-full py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
                            >
                                Beli Voucher Lagi
                            </button>
                        </div>
                    </div>
                )}

                {/* VIEW 2: PENDING QRIS PAYMENT */}
                {activeOrder && activeOrder.status === 'pending' && (
                    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
                        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5 text-white flex items-center justify-between">
                            <div>
                                <p className="text-xs text-indigo-100 uppercase tracking-wider font-semibold">
                                    Menunggu Pembayaran QRIS
                                </p>
                                <h2 className="text-lg font-extrabold mt-0.5">{activeOrder.package?.name}</h2>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-white/15 text-xs font-mono font-bold">
                                {activeOrder.order_code}
                            </span>
                        </div>

                        <div className="p-6 text-center space-y-5">
                            {/* QR Code Image */}
                            <div className="bg-white border-2 border-dashed border-indigo-200 rounded-2xl p-4 inline-block shadow-sm">
                                {activeOrder.qr_data_uri ? (
                                    <img
                                        src={activeOrder.qr_data_uri}
                                        alt="QRIS Pembayaran Voucher"
                                        className="w-60 h-60 mx-auto object-contain"
                                    />
                                ) : (
                                    <div className="w-60 h-60 flex flex-col items-center justify-center text-slate-400">
                                        <QrCode className="w-12 h-12 mb-2" />
                                        <span className="text-xs">QRIS belum dikonfigurasi</span>
                                    </div>
                                )}
                            </div>

                            {/* Exact Amount Box */}
                            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-4 text-white shadow-md">
                                <p className="text-xs uppercase tracking-wider text-emerald-100 font-semibold">
                                    Nominal Pas Pembayaran
                                </p>
                                <div className="flex items-center justify-center gap-2 my-1">
                                    <p className="text-3xl font-black font-mono tracking-tight">
                                        {formatCurrency(activeOrder.expected_amount)}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(Math.round(activeOrder.expected_amount), 'amount')}
                                        className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition"
                                        title="Salin nominal"
                                    >
                                        {copiedField === 'amount' ? (
                                            <Check className="w-4 h-4 text-amber-300" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-100">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Nominal otomatis terisi saat scan QRIS</span>
                                </div>
                                {activeOrder.unique_code > 0 && (
                                    <p className="text-[11px] text-emerald-200 mt-1">
                                        Harga Paket {formatCurrency(activeOrder.base_amount)} + Kode Unik Rp {activeOrder.unique_code}
                                    </p>
                                )}
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">
                                Scan menggunakan <b>GoPay, DANA, OVO, ShopeePay, LinkAja, atau m-Banking</b> (BCA, BRI, Mandiri, BNI, dll). Setelah transfer berhasil, halaman ini akan <b>otomatis menampilkan kode voucher</b> dan mengirimkannya ke WhatsApp <b>{activeOrder.customer_phone}</b>.
                            </p>

                            <div className="flex items-center justify-center gap-2.5 flex-wrap">
                                {activeOrder.qr_data_uri && (
                                    <a
                                        href={activeOrder.qr_data_uri}
                                        download={`QRIS-${activeOrder.order_code}.svg`}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
                                    >
                                        <Download className="w-4 h-4" />
                                        Unduh QRIS
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => fetchOrderStatus(activeOrder.order_code, false)}
                                    disabled={checkingStatus}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold transition disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
                                    {checkingStatus ? 'Memeriksa...' : 'Cek Status'}
                                </button>
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Mengecek otomatis tiap 3 detik...
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNewOrder}
                                    className="text-indigo-600 hover:underline font-semibold inline-flex items-center gap-1"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Ganti Paket
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW 3: EXPIRED / CANCELLED */}
                {activeOrder && (activeOrder.status === 'expired' || activeOrder.status === 'cancelled') && (
                    <div className="bg-white rounded-3xl shadow-2xl p-6 text-center space-y-4">
                        <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                            <Clock className="w-7 h-7" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">Pesanan Sudah Kedaluwarsa</h2>
                        <p className="text-sm text-slate-600">
                            Batas waktu pembayaran QRIS untuk pesanan <b>{activeOrder.order_code}</b> telah habis. Silakan buat pesanan baru untuk mendapatkan QRIS & kode unik yang baru.
                        </p>
                        <button
                            type="button"
                            onClick={handleNewOrder}
                            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition"
                        >
                            Pilih Paket &amp; Buat Pesanan Baru
                        </button>
                    </div>
                )}

                {/* VIEW 0: SELECT PACKAGE & ENTER WHATSAPP */}
                {!activeOrder && (
                    <form onSubmit={handleCreateOrder} className="bg-white rounded-3xl shadow-2xl p-5 sm:p-6 space-y-5">
                        <div>
                            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                                <Ticket className="w-5 h-5 text-orange-500" />
                                1. Pilih Paket Voucher
                            </h2>

                            {loadingPackages ? (
                                <div className="py-10 text-center text-slate-400 text-sm">
                                    Memuat pilihan paket voucher...
                                </div>
                            ) : packages.length === 0 ? (
                                <div className="py-8 px-4 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-sm">
                                    Belum ada paket voucher yang tersedia saat ini. Silakan hubungi admin Rumah Kita Net.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {packages.map((pkg) => {
                                        const isSelected = Number(selectedPackageId) === Number(pkg.id);
                                        return (
                                            <button
                                                type="button"
                                                key={pkg.id}
                                                onClick={() => setSelectedPackageId(pkg.id)}
                                                className={`text-left p-4 rounded-2xl border-2 transition-all ${
                                                    isSelected
                                                        ? 'border-orange-500 bg-orange-50/70 shadow-md shadow-orange-500/10'
                                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-bold text-slate-900 text-sm leading-snug">
                                                        {pkg.name}
                                                    </span>
                                                    {isSelected && (
                                                        <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                                                            <Check className="w-3.5 h-3.5" />
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-orange-600 mt-2">
                                                    {formatCurrency(pkg.price)}
                                                </p>
                                                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-600">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100">
                                                        <Clock className="w-3 h-3 text-slate-500" />
                                                        {pkg.duration_label}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100">
                                                        <Users className="w-3 h-3 text-slate-500" />
                                                        Maks {pkg.max_devices} HP
                                                    </span>
                                                    {pkg.rate_limit && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                                                            <Gauge className="w-3 h-3" />
                                                            {pkg.rate_limit}
                                                        </span>
                                                    )}
                                                </div>
                                                {pkg.description && (
                                                    <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">
                                                        {pkg.description}
                                                    </p>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-2 border-t border-slate-100 space-y-3.5">
                            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <Smartphone className="w-5 h-5 text-emerald-600" />
                                2. Masukkan Nomor WhatsApp
                            </h2>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Nomor WhatsApp Aktif <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="Contoh: 081234567890"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-base font-semibold outline-none"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Pastikan nomor WhatsApp benar karena kode voucher dikirim otomatis ke nomor ini.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Nama Anda (Opsional)
                                </label>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Contoh: Budi"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm outline-none"
                                />
                            </div>
                        </div>

                        {!qrisReady && (
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                                Pembayaran QRIS dinamis sedang belum aktif. Silakan hubungi admin.
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting || !selectedPackage || !qrisReady}
                            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-base shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                        >
                            <QrCode className="w-5 h-5" />
                            {submitting
                                ? 'Menyiapkan QRIS...'
                                : selectedPackage
                                    ? `Bayar Sekarang (${formatCurrency(selectedPackage.price)})`
                                    : 'Bayar Sekarang (QRIS)'}
                        </button>

                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span>Konfirmasi otomatis via QRIS &bull; Masa aktif dihitung sejak login pertama</span>
                        </div>
                    </form>
                )}

                {/* Available WiFi Voucher Hotspot Points (Privacy-safe, nearest first) */}
                <HotspotLocationsMapSection />

                {/* CS Support Card */}
                <div className="mt-4 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 text-center text-white">
                    <p className="text-xs text-sky-100 leading-relaxed">
                        Jika mendapati kendala pembelian atau login WiFi, Anda bisa hubungi nomor CS kami:
                    </p>
                    <div className="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
                        <a
                            href="https://wa.me/6285158025553?text=Halo%20CS%20Rumah%20Kita%20Net%2C%20saya%20butuh%20bantuan%20terkait%20Voucher%20Hotspot."
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow transition"
                        >
                            <MessageCircle className="w-4 h-4" />
                            WhatsApp CS: 085158025553
                        </a>
                        <a
                            href="tel:085158025553"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition"
                        >
                            <Smartphone className="w-3.5 h-3.5" />
                            Telepon
                        </a>
                    </div>
                </div>

                <div className="text-center mt-5 text-xs text-sky-200/80">
                    &copy; {new Date().getFullYear()} RUMAH KITA NETWORK POWERED BY PT. Megarap Mitra Solusi (MMS)
                </div>
            </div>
        </div>
    );
}

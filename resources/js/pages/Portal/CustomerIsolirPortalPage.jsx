import { useEffect, useState, useTransition } from 'react';
import { 
    WifiOff, AlertTriangle, QrCode, Download, RefreshCw, 
    CheckCircle2, Copy, Check, Phone, Search, User, 
    Calendar, Package, MapPin, ShieldCheck, ArrowRight,
    ExternalLink, Sparkles, Building2, HelpCircle
} from 'lucide-react';

export default function CustomerIsolirPortalPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [copiedAccount, setCopiedAccount] = useState(null);
    const [checkingPayment, setCheckingPayment] = useState(false);
    const [paymentNotice, setPaymentNotice] = useState(null);
    const [selectedBankId, setSelectedBankId] = useState(null);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async (overrideSearch = null) => {
        try {
            setLoading(true);
            setError(null);
            setPaymentNotice(null);

            const url = new URL('/api/public/isolir/check', window.location.origin);
            if (overrideSearch !== null && overrideSearch !== '') {
                url.searchParams.set('search', overrideSearch);
            }

            const res = await fetch(url.toString(), {
                headers: { 'Accept': 'application/json' }
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: Gagal memuat data portal isolir`);
            }

            const json = await res.json();
            if (json.success) {
                setData(json);
                if (json.payment_methods?.length > 0 && !selectedBankId) {
                    const defaultBank = json.payment_methods.find(m => m.is_default) || json.payment_methods[0];
                    setSelectedBankId(defaultBank.id);
                }
            } else {
                setError(json.message || 'Gagal memeriksa status layanan.');
            }
        } catch (err) {
            console.error('CustomerIsolirPortalPage error:', err);
            setError(err.message || 'Terjadi gangguan jaringan saat memuat status.');
        } finally {
            setLoading(false);
            setSearching(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        loadStatus(searchQuery.trim());
    };

    const copyToClipboard = async (text, id) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedAccount(id);
            setTimeout(() => setCopiedAccount(null), 2500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleCheckPaymentStatus = async () => {
        if (!data?.invoice?.invoice_link && !data?.invoice?.id) return;
        try {
            setCheckingPayment(true);
            setPaymentNotice(null);

            const res = await fetch('/api/public/isolir/refresh-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    invoice_link: data.invoice.invoice_link,
                    invoice_id: data.invoice.id
                })
            });

            const json = await res.json();
            if (json.success && json.is_paid) {
                setPaymentNotice({
                    type: 'success',
                    message: json.message || '🎉 Tagihan telah LUNAS! Layanan internet Anda sedang diaktifkan kembali secara otomatis.'
                });
                // Reload state to reflect active status
                setTimeout(() => loadStatus(searchQuery), 2000);
            } else {
                setPaymentNotice({
                    type: 'info',
                    message: json.message || 'Pembayaran belum terdeteksi. Silakan transfer sesuai nominal pas atau scan QRIS.'
                });
            }
        } catch (err) {
            setPaymentNotice({
                type: 'error',
                message: 'Gagal memeriksa status pembayaran: ' . err.message
            });
        } finally {
            setCheckingPayment(false);
        }
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(Number(val || 0));
    };

    const customer = data?.customer;
    const invoice = data?.invoice;
    const qris = data?.qris;
    const isIsolated = Boolean(data?.is_isolated);
    const matched = Boolean(data?.matched);
    const paymentMethods = data?.payment_methods || [];
    const csPhone = data?.cs_phone || '6285158025553';

    const selectedBank = paymentMethods.find(m => m.id === selectedBankId) || paymentMethods[0];

    const waHelpUrl = `https://wa.me/${csPhone}?text=${encodeURIComponent(
        `Halo Admin Rumah Kita Net, saya ingin konfirmasi pembayaran tagihan internet.\n\n` +
        `👤 Nama: ${customer?.name || '-'}\n` +
        `🔑 PPPoE: ${customer?.pppoe_username || '-'}\n` +
        `💰 Tagihan: ${invoice?.amount ? formatCurrency(invoice.amount) : '-'}\n` +
        `Mohon bantuan untuk pengecekan layanan. Terima kasih.`
    )}`;

    return (
        <div 
            className="min-h-screen invoice-public-container bg-slate-100 py-6 sm:py-10 px-3 sm:px-4 text-slate-800"
            style={{ colorScheme: 'light', backgroundColor: '#f1f5f9', color: '#0f172a' }}
        >
            <div className="max-w-xl mx-auto space-y-5">
                
                {/* Brand Header */}
                <div 
                    className="bg-white invoice-card-light rounded-3xl p-5 shadow-sm border border-slate-200/80 flex items-center justify-between"
                    style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                >
                    <div className="flex items-center gap-3">
                        <img 
                            src="/logo_baru.png" 
                            alt="Rumah Kita Net" 
                            className="h-10 w-auto object-contain"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div>
                            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Rumah Kita Net</h1>
                            <p className="text-xs text-slate-500">Customer Access & Self-Service Portal</p>
                        </div>
                    </div>
                    <a
                        href={waHelpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold transition"
                    >
                        <Phone size={14} className="text-emerald-600" />
                        <span>Bantuan CS</span>
                    </a>
                </div>

                {/* Loading State */}
                {loading && (
                    <div 
                        className="bg-white invoice-card-light rounded-3xl p-10 shadow-sm border border-slate-200/80 text-center space-y-4"
                        style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                    >
                        <div className="h-12 w-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <div>
                            <p className="text-base font-bold text-slate-800">Memeriksa Status Router & Layanan...</p>
                            <p className="text-xs text-slate-500 mt-1">Mencocokkan IP address perangkat Anda dengan sesi aktif PPPoE</p>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {!loading && error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 flex items-start gap-3">
                        <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                        <div>
                            <p className="font-bold text-rose-900">Gagal Memeriksa Status</p>
                            <p className="mt-0.5">{error}</p>
                        </div>
                    </div>
                )}

                {/* Status Notice if Payment Checked */}
                {paymentNotice && (
                    <div className={`rounded-2xl border p-4 text-xs flex items-start gap-3 animate-fade-in ${
                        paymentNotice.type === 'success' 
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : paymentNotice.type === 'error'
                                ? 'border-rose-300 bg-rose-50 text-rose-800'
                                : 'border-blue-300 bg-blue-50 text-blue-800'
                    }`}>
                        {paymentNotice.type === 'success' ? (
                            <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                        ) : (
                            <AlertTriangle size={18} className="shrink-0 text-blue-600 mt-0.5" />
                        )}
                        <div>
                            <p className="font-bold">{paymentNotice.type === 'success' ? 'Berhasil' : 'Informasi'}</p>
                            <p className="mt-0.5">{paymentNotice.message}</p>
                        </div>
                    </div>
                )}

                {/* SCENARIO 1: MATCHED & ISOLATED */}
                {!loading && matched && isIsolated && (
                    <div className="space-y-5">
                        
                        {/* Outage / Isolir Main Banner */}
                        <div 
                            className="bg-white invoice-card-light rounded-3xl p-6 shadow-md border border-rose-200 overflow-hidden relative"
                            style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                        >
                            <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                                    <WifiOff size={24} />
                                </div>
                                <div className="space-y-1">
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold uppercase tracking-wider">
                                        Layanan Diisolir Sementara
                                    </div>
                                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                                        Tagihan Internet Melewati Jatuh Tempo
                                    </h2>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        Akses internet Anda sementara waktu dialihkan ke halaman ini. Internet akan <b>otomatis aktif kembali</b> segera setelah pembayaran selesai diverifikasi oleh sistem.
                                    </p>
                                </div>
                            </div>

                            {/* Customer Profile Mini Strip */}
                            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="text-slate-400 text-[11px] font-medium">Nama Pelanggan</p>
                                    <p className="font-bold text-slate-900 truncate">{customer?.name || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[11px] font-medium">ID PPPoE</p>
                                    <p className="font-bold text-slate-900 font-mono truncate">{customer?.pppoe_username || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[11px] font-medium">Paket Layanan</p>
                                    <p className="font-semibold text-slate-800 truncate">{customer?.package_type || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[11px] font-medium">Batas Waktu</p>
                                    <p className="font-semibold text-rose-600">{invoice?.due_date || customer?.due_date || '-'}</p>
                                </div>
                            </div>
                        </div>

                        {/* QRIS Dinamis & Payment Section */}
                        {invoice && (
                            <div 
                                className="bg-white invoice-card-light rounded-3xl p-6 shadow-md border border-slate-200/90 space-y-5"
                                style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                            >
                                <div className="text-center space-y-1">
                                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                                        Pembayaran Cepat & Otomatis (QRIS)
                                    </span>
                                    <p className="text-xs text-slate-500 pt-2">
                                        Scan menggunakan <b>GoPay, BCA, Mandiri, BRI, DANA, ShopeePay, OVO</b>, atau aplikasi m-Banking apa saja:
                                    </p>
                                </div>

                                {/* QR Code Display (Anti Dark Mode Box) */}
                                <div className="text-center">
                                    <div 
                                        className="invoice-qris-box bg-white border-2 border-emerald-400 rounded-3xl p-4 inline-block shadow-lg shadow-emerald-500/10 mb-2 relative"
                                        style={{ colorScheme: 'light', backgroundColor: '#ffffff', isolation: 'isolate' }}
                                    >
                                        <img 
                                            src={qris?.qr_data_uri || '/qr.jpg'} 
                                            alt="QRIS Dinamis Pembayaran" 
                                            className="w-56 h-56 object-contain mx-auto rounded-xl p-1 bg-white"
                                            style={{ backgroundColor: '#ffffff', colorScheme: 'light', filter: 'none', WebkitFilter: 'none' }}
                                        />
                                    </div>
                                    {qris?.qr_data_uri && (
                                        <div className="mt-2">
                                            <a
                                                href={qris.qr_data_uri}
                                                download={`QRIS-${customer?.pppoe_username || 'RumahKitaNet'}.svg`}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                                            >
                                                <Download size={14} />
                                                <span>Unduh Kode QRIS</span>
                                            </a>
                                        </div>
                                    )}
                                </div>

                                {/* Nominal Pas Highlight */}
                                <div className="rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-4 text-white text-center shadow-md shadow-emerald-600/20">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
                                        Nominal Pas Transfer
                                    </p>
                                    <p className="text-3xl font-extrabold font-mono tracking-tight my-1 text-white">
                                        {formatCurrency(qris?.expected_amount || invoice.amount)}
                                    </p>
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-100 mt-1">
                                        <Sparkles size={13} className="text-amber-300" />
                                        <span>Nominal pas sudah terisi otomatis saat Anda scan QR</span>
                                    </div>
                                    {qris?.unique_code > 0 && (
                                        <p className="text-[11px] text-emerald-200/90 mt-1">
                                            (Tagihan: {formatCurrency(qris.base_amount || invoice.amount)} + Kode Otomasi: Rp {qris.unique_code})
                                        </p>
                                    )}
                                </div>

                                {/* Action Buttons: Cek Status & WhatsApp */}
                                <div className="space-y-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={handleCheckPaymentStatus}
                                        disabled={checkingPayment}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-sm transition disabled:opacity-50"
                                    >
                                        <RefreshCw size={18} className={checkingPayment ? 'animate-spin' : ''} />
                                        <span>{checkingPayment ? 'Memverifikasi Pembayaran...' : 'Saya Sudah Bayar (Cek Status)'}</span>
                                    </button>

                                    <a
                                        href={waHelpUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl shadow-sm transition text-xs"
                                    >
                                        <Phone size={16} />
                                        <span>Konfirmasi Pembayaran via WhatsApp Admin</span>
                                    </a>
                                </div>

                                {/* Manual Bank Transfer Alternatives */}
                                {paymentMethods.length > 0 && (
                                    <div className="pt-4 border-t border-slate-100 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                                <Building2 size={14} className="text-indigo-600" />
                                                Alternatif Transfer Rekening Bank
                                            </p>
                                        </div>

                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {paymentMethods.filter(m => m.type !== 'qris').map(m => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => setSelectedBankId(m.id)}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                                                        selectedBank?.id === m.id
                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {m.bank_name}
                                                </button>
                                            ))}
                                        </div>

                                        {selectedBank && (
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="text-slate-400 text-[11px]">Bank Tujuan</span>
                                                        <p className="text-sm font-bold text-slate-900">{selectedBank.bank_name}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400 text-[11px]">Atas Nama</span>
                                                        <p className="font-semibold text-slate-800 text-right">{selectedBank.account_name}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                                                    <div>
                                                        <span className="text-slate-400 text-[11px]">Nomor Rekening</span>
                                                        <p className="text-base font-extrabold font-mono text-slate-900">{selectedBank.account_number}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(selectedBank.account_number, selectedBank.id)}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700 text-xs shadow-2xs transition"
                                                    >
                                                        {copiedAccount === selectedBank.id ? (
                                                            <>
                                                                <Check size={14} className="text-emerald-600" />
                                                                <span className="text-emerald-700">Tersalin</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy size={14} />
                                                                <span>Salin</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* SCENARIO 2: MATCHED BUT NOT ISOLATED (ALREADY PAID / ACTIVE) */}
                {!loading && matched && !isIsolated && (
                    <div 
                        className="bg-white invoice-card-light rounded-3xl p-8 shadow-sm border border-emerald-200 text-center space-y-4"
                        style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                    >
                        <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                            <CheckCircle2 size={36} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-xl font-bold text-slate-900">Layanan Internet Anda Aktif & Normal</h2>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                Akun <b>{customer?.name}</b> ({customer?.pppoe_username}) dalam keadaan aktif. Tidak ada tagihan tertunggak pada akun Anda.
                            </p>
                        </div>
                        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
                            <a
                                href={data?.portal_url || '/'}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
                            >
                                <span>Buka Portal Pelanggan</span>
                                <ArrowRight size={14} />
                            </a>
                            <a
                                href="/status-jaringan"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                            >
                                <span>Cek Status Jaringan</span>
                            </a>
                        </div>
                    </div>
                )}

                {/* SCENARIO 3: NOT MATCHED VIA IP OR SEARCH FALLBACK */}
                {!loading && !matched && (
                    <div 
                        className="bg-white invoice-card-light rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 space-y-5"
                        style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                    >
                        <div className="text-center space-y-2">
                            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                                <Search size={22} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">Cari Tagihan & Pembayaran</h2>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                IP router Anda tidak terdeteksi otomatis. Masukkan nomor WhatsApp atau ID PPPoE Anda di bawah ini:
                            </p>
                        </div>

                        <form onSubmit={handleSearch} className="space-y-3 max-w-md mx-auto">
                            <div className="relative">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Contoh: 08123456789 atau KBU-siti261"
                                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-800"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={searching}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm shadow-sm transition disabled:opacity-50"
                            >
                                {searching ? 'Mencari Data Pelanggan...' : 'Tampilkan Tagihan & QRIS'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Footer Notes */}
                <div className="text-center text-xs text-slate-400 space-y-1 pt-2">
                    <p>© {new Date().getFullYear()} Rumah Kita Network. Seluruh Hak Cipta Dilindungi.</p>
                    <p>Pusat Bantuan WhatsApp: <a href={waHelpUrl} className="font-semibold text-slate-600 hover:underline">0851-5802-5553</a></p>
                </div>

            </div>
        </div>
    );
}

import { useEffect, useState } from 'react';
import { 
    AlertTriangle, Activity, RefreshCw, Phone, Clock, 
    MapPin, ShieldAlert, CheckCircle2, Info, ArrowLeft,
    Wrench, Radio
} from 'lucide-react';

export default function MassOutagePage() {
    const [statusData, setStatusData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastChecked, setLastChecked] = useState(null);

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 20000);
        return () => clearInterval(interval);
    }, []);

    const loadStatus = async () => {
        try {
            setRefreshing(true);
            const res = await fetch('/api/public/gangguan/status', {
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    setStatusData(json);
                    setLastChecked(new Date());
                }
            }
        } catch (err) {
            console.error('Failed to load outage status:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const csPhone = statusData?.cs_phone || '6285158025553';
    const waHelpUrl = `https://wa.me/${csPhone}?text=${encodeURIComponent(
        `Halo Admin Rumah Kita Net, saya ingin menanyakan status gangguan massal internet di wilayah saya. Terima kasih.`
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
                            <p className="text-xs text-slate-500">Pusat Informasi Gangguan Jaringan (NOC)</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={loadStatus}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                    >
                        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                        <span>{refreshing ? 'Memperbarui...' : 'Segarkan'}</span>
                    </button>
                </div>

                {/* Main Outage Banner */}
                <div 
                    className="bg-white invoice-card-light rounded-3xl p-6 sm:p-7 shadow-md border-2 border-amber-400/80 relative overflow-hidden space-y-4"
                    style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                >
                    {/* Live Indicator Badge */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold uppercase tracking-wider">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                            </span>
                            Pemberitahuan Gangguan Massal
                        </span>
                        {lastChecked && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Clock size={12} />
                                <span>Diperbarui {lastChecked.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
                            </span>
                        )}
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                            {statusData?.title || 'Gangguan Koneksi Internet dari Jalur Hulu (Upstream)'}
                        </h2>
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                            <Radio size={14} className="text-amber-600 animate-pulse" />
                            <span>Jalur Internet Utama (Upline) Sedang Mengalami Kendala Teknis</span>
                        </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {statusData?.message || 
                            "Mohon maaf yang sebesar-besarnya atas ketidaknyamanan yang dialami. Saat ini terdeteksi kendala koneksi dari pihak penyedia internet hulu (upstream/upline) atau putus kabel fiber optik utama.\n\nSeluruh tim teknisi jaringan Rumah Kita Net sedang melakukan penanganan darurat dan koordinasi perbaikan agar layanan dapat segera pulih kembali secepat mungkin."}
                    </div>

                    {/* Meta Strip */}
                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-100">
                        <div className="space-y-0.5">
                            <p className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                                <MapPin size={12} className="text-blue-500" />
                                <span>Wilayah Terdampak</span>
                            </p>
                            <p className="font-bold text-slate-800">{statusData?.affected_area || 'Semua Wilayah Pelanggan'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                                <Wrench size={12} className="text-amber-500" />
                                <span>Status Pemulihan</span>
                            </p>
                            <p className="font-bold text-amber-700">{statusData?.end_time_human || 'Dalam Penanganan Tim Lapangan'}</p>
                        </div>
                    </div>
                </div>

                {/* Important Customer Instructions Card */}
                <div 
                    className="bg-white invoice-card-light rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4"
                    style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                >
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Info size={16} className="text-blue-600" />
                        Panduan Penting untuk Pelanggan
                    </h3>

                    <div className="space-y-3 text-xs">
                        <div className="flex items-start gap-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900">
                            <span className="h-6 w-6 rounded-xl bg-rose-200 text-rose-700 font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                            <div>
                                <p className="font-bold">JANGAN Menekan Tombol RESET pada Modem</p>
                                <p className="text-[11px] text-rose-700 mt-0.5">
                                    Modem/router di rumah Anda tidak rusak. Menekan tombol reset akan menghapus konfigurasi dan memerlukan teknisi datang ke rumah.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
                            <span className="h-6 w-6 rounded-xl bg-amber-200 text-amber-700 font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                            <div>
                                <p className="font-bold">Biarkan Modem Wi-Fi Tetap Menyala</p>
                                <p className="text-[11px] text-amber-700 mt-0.5">
                                    Koneksi internet Anda akan otomatis tersambung kembali begitu jaringan utama di hulu selesai diperbaiki.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900">
                            <span className="h-6 w-6 rounded-xl bg-blue-200 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                            <div>
                                <p className="font-bold">Jika Status Normal Namun Internet Belum Masuk</p>
                                <p className="text-[11px] text-blue-700 mt-0.5">
                                    Cukup restart modem (cabut colokan adaptor 30 detik lalu pasang kembali) agar router merefresh IP internet.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CS Contact Card */}
                <div 
                    className="bg-white invoice-card-light rounded-3xl p-5 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
                    style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}
                >
                    <div>
                        <p className="text-xs font-bold text-slate-800">Butuh Informasi Lebih Lanjut?</p>
                        <p className="text-[11px] text-slate-500">Hubungi layanan Customer Service Rumah Kita Net via WhatsApp</p>
                    </div>
                    <a
                        href={waHelpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition shadow-sm shrink-0"
                    >
                        <Phone size={14} />
                        <span>Chat WhatsApp CS</span>
                    </a>
                </div>

                {/* Footer Notes */}
                <div className="text-center text-xs text-slate-400 space-y-1 pt-2">
                    <p>© {new Date().getFullYear()} Rumah Kita Network. Seluruh Hak Cipta Dilindungi.</p>
                    <p>Status Jaringan Real-Time: <a href="/status-jaringan" className="font-semibold text-slate-600 hover:underline">Lihat Kalender Pemeliharaan</a></p>
                </div>

            </div>
        </div>
    );
}

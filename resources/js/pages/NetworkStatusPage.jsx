import { useEffect, useState } from 'react';
import { 
    AlertTriangle, Wrench, Clock, MapPin, Calendar, 
    ArrowLeft, Wifi, RefreshCw, CheckCircle, AlertCircle,
    Info
} from 'lucide-react';

function NetworkStatusPage() {
    const [notices, setNotices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, gangguan, maintenance

    useEffect(() => {
        fetchNotices();
        // Auto refresh every 30 seconds
        const interval = setInterval(fetchNotices, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchNotices = async () => {
        try {
            const response = await fetch('/api/network-notices/public');
            const result = await response.json();
            if (result.success) {
                setNotices(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch notices', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return null;
        return new Date(dateStr).toLocaleString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getSeverityConfig = (severity) => {
        const configs = {
            low: { 
                bg: 'bg-blue-50', 
                border: 'border-blue-200',
                icon: 'bg-blue-100 text-blue-600',
                badge: 'bg-blue-100 text-blue-700',
                label: 'Ringan' 
            },
            medium: { 
                bg: 'bg-yellow-50', 
                border: 'border-yellow-200',
                icon: 'bg-yellow-100 text-yellow-600',
                badge: 'bg-yellow-100 text-yellow-700',
                label: 'Sedang' 
            },
            high: { 
                bg: 'bg-orange-50', 
                border: 'border-orange-200',
                icon: 'bg-orange-100 text-orange-600',
                badge: 'bg-orange-100 text-orange-700',
                label: 'Tinggi' 
            },
            critical: { 
                bg: 'bg-red-50', 
                border: 'border-red-200',
                icon: 'bg-red-100 text-red-600',
                badge: 'bg-red-100 text-red-700',
                label: 'Kritis' 
            },
        };
        return configs[severity] || configs.medium;
    };

    // Check if notice is upcoming (not yet started)
    const isUpcoming = (notice) => {
        if (!notice.start_time) return false;
        return new Date(notice.start_time) > new Date();
    };

    const filteredNotices = notices.filter(notice => {
        if (filter === 'all') return true;
        return notice.type === filter;
    });

    const gangguanCount = notices.filter(n => n.type === 'gangguan').length;
    const maintenanceCount = notices.filter(n => n.type === 'maintenance').length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <a href="/" className="flex items-center gap-2">
                                <img src="/logo_baru.png" alt="Logo" className="h-10" />
                                <div className="hidden sm:block">
                                    <p className="font-bold text-gray-900">Rumah Kita Network</p>
                                    <p className="text-xs text-gray-500">Status Jaringan</p>
                                </div>
                            </a>
                        </div>
                        <a 
                            href="/"
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
                        >
                            <ArrowLeft size={18} />
                            <span className="hidden sm:inline">Kembali</span>
                        </a>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/30 mb-4">
                        <Wifi size={32} className="text-white" />
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Status Jaringan</h1>
                    <p className="text-gray-600">Informasi gangguan dan perbaikan terjadwal</p>
                </div>

                {/* Status Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                        {gangguanCount === 0 && maintenanceCount === 0 ? (
                            <>
                                <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                                <p className="font-semibold text-green-700">Semua Normal</p>
                                <p className="text-xs text-gray-500">Tidak ada gangguan</p>
                            </>
                        ) : (
                            <>
                                <AlertCircle size={32} className="mx-auto text-orange-500 mb-2" />
                                <p className="font-semibold text-orange-700">{gangguanCount + maintenanceCount} Info Aktif</p>
                                <p className="text-xs text-gray-500">Perlu perhatian</p>
                            </>
                        )}
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                        <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
                        <p className="text-2xl font-bold text-gray-900">{gangguanCount}</p>
                        <p className="text-xs text-gray-500">Gangguan Aktif</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border text-center col-span-2 md:col-span-1">
                        <Wrench size={32} className="mx-auto text-blue-500 mb-2" />
                        <p className="text-2xl font-bold text-gray-900">{maintenanceCount}</p>
                        <p className="text-xs text-gray-500">Perbaikan Terjadwal</p>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                filter === 'all' 
                                    ? 'bg-orange-500 text-white' 
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                            }`}
                        >
                            Semua ({notices.length})
                        </button>
                        <button
                            onClick={() => setFilter('gangguan')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                filter === 'gangguan' 
                                    ? 'bg-red-500 text-white' 
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                            }`}
                        >
                            Gangguan ({gangguanCount})
                        </button>
                        <button
                            onClick={() => setFilter('maintenance')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                filter === 'maintenance' 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                            }`}
                        >
                            Maintenance ({maintenanceCount})
                        </button>
                    </div>
                    <button
                        onClick={() => { setLoading(true); fetchNotices(); }}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                        title="Refresh"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Notices List */}
                {loading ? (
                    <div className="bg-white rounded-xl p-8 text-center">
                        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-gray-500">Memuat informasi...</p>
                    </div>
                ) : filteredNotices.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 text-center">
                        <CheckCircle size={48} className="mx-auto text-green-400 mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-1">Tidak Ada Informasi</h3>
                        <p className="text-gray-500 text-sm">
                            {filter === 'all' 
                                ? 'Saat ini tidak ada gangguan atau perbaikan terjadwal' 
                                : filter === 'gangguan'
                                    ? 'Tidak ada gangguan yang sedang berlangsung'
                                    : 'Tidak ada perbaikan yang dijadwalkan'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredNotices.map((notice) => {
                            const config = getSeverityConfig(notice.severity);
                            const isMaintenance = notice.type === 'maintenance';
                            const upcoming = isUpcoming(notice);
                            
                            return (
                                <div 
                                    key={notice.id}
                                    className={`${upcoming ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200' : config.bg + ' ' + config.border} border-2 rounded-2xl overflow-hidden`}
                                >
                                    <div className="p-5">
                                        {/* Header */}
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-xl ${upcoming ? 'bg-indigo-100 text-indigo-600' : config.icon} flex items-center justify-center flex-shrink-0`}>
                                                {isMaintenance ? (
                                                    <Wrench size={24} />
                                                ) : (
                                                    <AlertTriangle size={24} />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    {upcoming && (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-500 text-white animate-pulse">
                                                            📅 Akan Datang
                                                        </span>
                                                    )}
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                        isMaintenance ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {isMaintenance ? 'Perbaikan Terjadwal' : 'Gangguan'}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.badge}`}>
                                                        {config.label}
                                                    </span>
                                                    {notice.is_mass && (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                            Massal
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="font-bold text-gray-900 text-lg mb-2">{notice.title}</h3>
                                                <p className="text-gray-700">{notice.message}</p>
                                            </div>
                                        </div>

                                        {/* Meta Info */}
                                        <div className="mt-4 pt-4 border-t border-gray-200/50">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                                {notice.affected_area && (
                                                    <div className="flex items-center gap-2 text-gray-600">
                                                        <MapPin size={16} className="text-gray-400" />
                                                        <span><strong>Area:</strong> {notice.affected_area}</span>
                                                    </div>
                                                )}
                                                {notice.affected_odp && (
                                                    <div className="flex items-center gap-2 text-gray-600">
                                                        <Info size={16} className="text-gray-400" />
                                                        <span><strong>ODP:</strong> {notice.affected_odp}</span>
                                                    </div>
                                                )}
                                                {notice.start_time && (
                                                    <div className="flex items-center gap-2 text-gray-600">
                                                        <Clock size={16} className="text-gray-400" />
                                                        <span><strong>Mulai:</strong> {formatDateTime(notice.start_time)}</span>
                                                    </div>
                                                )}
                                                {notice.end_time && (
                                                    <div className="flex items-center gap-2 text-gray-600">
                                                        <Calendar size={16} className="text-gray-400" />
                                                        <span><strong>Est. Selesai:</strong> {formatDateTime(notice.end_time)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Help Text */}
                <div className="mt-8 bg-white rounded-xl p-6 text-center">
                    <p className="text-gray-600 text-sm mb-3">
                        Halaman ini diperbarui otomatis setiap 30 detik
                    </p>
                    <p className="text-gray-500 text-sm">
                        Jika Anda mengalami masalah, silakan hubungi kami via WhatsApp
                    </p>
                    <a
                        href="https://wa.me/6285158025553?text=Halo,%20saya%20ingin%20melaporkan%20gangguan%20jaringan"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-medium transition"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Hubungi Support
                    </a>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t mt-12">
                <div className="max-w-4xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
                    <p>© {new Date().getFullYear()} Rumah Kita Network. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}

export default NetworkStatusPage;

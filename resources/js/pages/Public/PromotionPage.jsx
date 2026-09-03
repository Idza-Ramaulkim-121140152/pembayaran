import { useState, useEffect, useMemo } from 'react';
import {
    Wifi,
    Zap,
    Shield,
    Clock,
    MapPin,
    CheckCircle2,
    ArrowRight,
    Phone,
    MessageSquare,
    Sparkles,
    Check,
    Star,
    Layers,
    Search,
    Send,
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Tv,
    Gamepad2,
    Users,
    Laptop,
    Smartphone,
    RefreshCw,
    ExternalLink,
    AlertCircle,
    Radio,
    Mail
} from 'lucide-react';

export default function PromotionPage() {
    const [loading, setLoading] = useState(true);
    const [promoData, setPromoData] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    
    // Coverage checker state
    const [selectedKecamatan, setSelectedKecamatan] = useState('');
    const [selectedDesa, setSelectedDesa] = useState('');
    const [selectedDusun, setSelectedDusun] = useState('');
    const [coverageSearch, setCoverageSearch] = useState('');
    const [coverageCheckResult, setCoverageCheckResult] = useState(null);

    // Registration Form state
    const [regForm, setRegForm] = useState({
        name: '',
        phone: '',
        package_id: '',
        package_name: '',
        kecamatan_id: '',
        desa_id: '',
        dusun_id: '',
        kecamatan_name: '',
        desa_name: '',
        dusun_name: '',
        address_detail: '',
        notes: '',
    });
    const [submittingReg, setSubmittingReg] = useState(false);
    const [regSuccess, setRegSuccess] = useState(null);
    const [regError, setRegError] = useState('');

    // FAQ toggle state
    const [openFaq, setOpenFaq] = useState(null);

    useEffect(() => {
        fetchPromoData();
    }, []);

    const fetchPromoData = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/public/promo-page');
            const data = await res.json();
            if (data.success) {
                setPromoData(data);
                if (data.packages?.length > 0) {
                    const defaultPkg = data.packages.find((p) => p.is_popular) || data.packages[0];
                    setRegForm((prev) => ({
                        ...prev,
                        package_id: defaultPkg.id,
                        package_name: `${defaultPkg.name} (${defaultPkg.speed}) - ${defaultPkg.price_formatted}/bln`,
                    }));
                }
                if (data.coverage_areas?.length > 0) {
                    const firstKec = data.coverage_areas[0];
                    setSelectedKecamatan(firstKec.name);
                    setRegForm((prev) => ({
                        ...prev,
                        kecamatan_id: firstKec.id,
                        kecamatan_name: firstKec.name,
                    }));
                }
            }
        } catch (err) {
            console.error('Gagal memuat data promosi', err);
        } finally {
            setLoading(false);
        }
    };

    const packages = promoData?.packages || [];
    const coverageAreas = promoData?.coverage_areas || [];
    const settings = promoData?.settings || {};
    const totalOdp = promoData?.total_odp || 15;

    const waNumber = settings.company_whatsapp || '6285158025553';
    const cleanWaNumber = waNumber.replace(/\D/g, '');

    // Filter packages by category
    const filteredPackages = useMemo(() => {
        if (selectedCategory === 'hemat') {
            return packages.filter((p) => p.price <= 180000);
        }
        if (selectedCategory === 'keluarga') {
            return packages.filter((p) => p.price > 180000 && p.price <= 220000);
        }
        if (selectedCategory === 'ultra') {
            return packages.filter((p) => p.price > 220000);
        }
        return packages;
    }, [packages, selectedCategory]);

    // Flatten all villages & dusuns for quick search
    const allLocations = useMemo(() => {
        const list = [];
        coverageAreas.forEach((kec) => {
            kec.desas.forEach((desa) => {
                desa.dusuns.forEach((dusun) => {
                    list.push({
                        kecamatan_id: kec.id,
                        kecamatan: kec.name,
                        desa_id: desa.id,
                        desa: desa.name,
                        dusun_id: dusun.id,
                        dusun: dusun.name,
                        fullLabel: `Dsn. ${dusun.name}, Ds. ${desa.name}, Kec. ${kec.name}`,
                    });
                });
            });
        });
        return list;
    }, [coverageAreas]);

    // Handle Coverage Check
    const handleCheckCoverage = (e) => {
        e.preventDefault();
        if (!selectedDesa && !coverageSearch) {
            setCoverageCheckResult({
                covered: false,
                message: 'Silakan pilih atau ketik nama desa/dusun tempat tinggal Anda.',
            });
            return;
        }

        if (coverageSearch.trim()) {
            const match = allLocations.find((loc) =>
                loc.fullLabel.toLowerCase().includes(coverageSearch.trim().toLowerCase()) ||
                loc.dusun.toLowerCase().includes(coverageSearch.trim().toLowerCase()) ||
                loc.desa.toLowerCase().includes(coverageSearch.trim().toLowerCase())
            );

            if (match) {
                setCoverageCheckResult({
                    covered: true,
                    location: match.fullLabel,
                    matchData: match,
                    message: `Kabar Baik! Lokasi Anda di ${match.fullLabel} sudah ter-cover jaringan 100% Fiber Optic Rumah Kita Net.`,
                });
                setRegForm((prev) => ({
                    ...prev,
                    kecamatan_id: match.kecamatan_id,
                    kecamatan_name: match.kecamatan,
                    desa_id: match.desa_id,
                    desa_name: match.desa,
                    dusun_id: match.dusun_id,
                    dusun_name: match.dusun,
                }));
            } else {
                setCoverageCheckResult({
                    covered: false,
                    message: `Lokasi "${coverageSearch}" saat ini sedang dalam rencana perluasan fiber optic. Anda tetap bisa mendaftar sebagai antrean prioritas pemasangan.`,
                });
            }
        } else if (selectedDesa) {
            const label = selectedDusun
                ? `Dsn. ${selectedDusun}, Ds. ${selectedDesa}, Kec. ${selectedKecamatan}`
                : `Ds. ${selectedDesa}, Kec. ${selectedKecamatan}`;
            
            setCoverageCheckResult({
                covered: true,
                location: label,
                message: `Kabar Baik! Lokasi Anda di ${label} sudah ter-cover jaringan Fiber Optic Rumah Kita Net.`,
            });
        }
    };

    // Select package to register
    const handleSelectPackage = (pkg) => {
        setRegForm((prev) => ({
            ...prev,
            package_id: pkg.id,
            package_name: `${pkg.name} (${pkg.speed}) - ${pkg.price_formatted}/bln`,
        }));
        
        const regSection = document.getElementById('daftar');
        if (regSection) {
            regSection.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Handle Direct WhatsApp Order
    const handleDirectWhatsApp = () => {
        if (!regForm.name || !regForm.phone) {
            alert('Silakan masukkan Nama Lengkap dan Nomor WhatsApp Anda.');
            return;
        }

        const msg = `Halo Tim Rumah Kita Net,\nSaya ingin pasang baru WiFi dengan rincian berikut:\n\n` +
            `👤 Nama: *${regForm.name}*\n` +
            `📱 WhatsApp: *${regForm.phone}*\n` +
            `📦 Paket Pilihan: *${regForm.package_name || 'Paket Internet'}*\n` +
            `📍 Wilayah/Alamat: *${regForm.dusun_name ? 'Dsn. ' + regForm.dusun_name + ', ' : ''}${regForm.desa_name ? 'Ds. ' + regForm.desa_name + ', ' : ''}${regForm.kecamatan_name ? 'Kec. ' + regForm.kecamatan_name : ''}*\n` +
            `🏠 Alamat Detail: ${regForm.address_detail || '-'}\n` +
            `📝 Catatan: ${regForm.notes || '-'}\n\n` +
            `Mohon info ketersediaan jadwal teknisi untuk pemasangan ke rumah saya. Terima kasih!`;

        window.open(`https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // Handle Submit Prospect to Backend
    const handleSubmitProspect = async (e) => {
        e.preventDefault();
        setRegError('');
        setRegSuccess(null);

        if (!regForm.name || !regForm.phone) {
            setRegError('Nama lengkap dan nomor WhatsApp wajib diisi.');
            return;
        }

        try {
            setSubmittingReg(true);
            const res = await fetch('/api/public/register-prospect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    name: regForm.name.trim(),
                    phone: regForm.phone.trim(),
                    package_id: regForm.package_id || undefined,
                    kecamatan_id: regForm.kecamatan_id || undefined,
                    desa_id: regForm.desa_id || undefined,
                    dusun_id: regForm.dusun_id || undefined,
                    address: `${regForm.dusun_name ? 'Dsn. ' + regForm.dusun_name + ', ' : ''}${regForm.desa_name ? 'Ds. ' + regForm.desa_name + ', ' : ''}${regForm.address_detail ? regForm.address_detail : ''}`,
                    notes: regForm.notes ? `Pendaftaran Promo Web: ${regForm.notes}` : 'Pendaftaran Promo Web',
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setRegSuccess({
                    message: data.message || 'Pendaftaran pemasangan baru Anda berhasil diterima! Tim teknisi kami akan segera menghubungi Anda via WhatsApp untuk konfirmasi jadwal survey & pemasangan.',
                });
            } else {
                setRegError(data.message || 'Gagal mengirimkan formulir pendaftaran. Silakan coba hubungi kami via WhatsApp.');
            }
        } catch (err) {
            setRegError('Terjadi kendala jaringan saat mengirimkan data. Silakan hubungi via tombol WhatsApp.');
        } finally {
            setSubmittingReg(false);
        }
    };

    const faqs = [
        {
            q: 'Apakah ada biaya pemasangan / instalasi?',
            a: 'Kabar gembira! Selama periode promo ini, Anda mendapatkan GRATIS BIAYA PEMASANGAN / INSTALASI dan peminjaman perangkat Router Wi-Fi resmi dari Rumah Kita Net tanpa biaya sewa tambahan.',
        },
        {
            q: 'Apakah ada batasan kuota (FUP) atau penurunan kecepatan?',
            a: 'Tidak ada. Seluruh paket internet Rumah Kita Net adalah True Unlimited tanpa FUP. Anda bebas streaming YouTube, Netflix, download, dan browsing seharian tanpa khawatir kuota habis.',
        },
        {
            q: 'Apa itu fitur Portal Mandiri Pelanggan Rumah Kita Net?',
            a: 'Setiap pelanggan akan mendapatkan tautan portal mandiri khusus yang dapat dibuka langsung dari HP tanpa login. Anda dapat melihat kata sandi WiFi, mengganti kata sandi secara mandiri kapan saja, melihat daftar HP yang sedang tersambung, hingga memblokir perangkat asing.',
        },
        {
            q: 'Berapa lama proses pemasangan setelah mendaftar?',
            a: 'Proses pemasangan biasanya dilakukan dalam waktu 1x24 jam setelah konfirmasi data dan jadwal survey oleh tim teknisi kami.',
        },
        {
            q: 'Bagaimana cara pembayaran tagihan bulanan?',
            a: 'Pembayaran sangat mudah! Kami mendukung Transfer Bank, QRIS, E-Wallet (DANA, OVO, GoPay), serta pembayaran tunai melalui petugas resmi kami.',
        },
    ];

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <div className="text-center space-y-3">
                    <RefreshCw size={36} className="animate-spin text-emerald-400 mx-auto" />
                    <p className="text-sm font-semibold text-slate-400">Memuat Penawaran Promo Rumah Kita Net...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
            {/* 1. TOP STICKY PROMO BAR & NAVIGATION */}
            <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/85 border-b border-slate-800/80 transition-all">
                <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 py-1.5 px-4 text-center text-xs font-bold text-white flex items-center justify-center gap-2 shadow-inner">
                    <Sparkles size={14} className="animate-pulse text-amber-300" />
                    <span>PROMO SPESIAL: GRATIS BIAYA PEMASANGAN + PEMINJAMAN ROUTER WI-FI!</span>
                    <a href="#paket" className="underline underline-offset-2 hover:text-amber-200 transition hidden sm:inline">
                        Lihat Paket &rarr;
                    </a>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-0.5 shadow-lg shadow-emerald-950/50 flex items-center justify-center">
                            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-emerald-400">
                                <Wifi size={20} className="stroke-[2.5]" />
                            </div>
                        </div>
                        <div>
                            <span className="font-extrabold text-base tracking-tight text-white block leading-none">
                                Rumah Kita <span className="text-emerald-400">Net</span>
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-400/90 tracking-wider uppercase">
                                100% Fiber Optic
                            </span>
                        </div>
                    </div>

                    <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-300">
                        <a href="#keunggulan" className="hover:text-emerald-400 transition">Keunggulan</a>
                        <a href="#paket" className="hover:text-emerald-400 transition">Paket & Harga</a>
                        <a href="#cakupan" className="hover:text-emerald-400 transition">Daerah Cakupan</a>
                        <a href="#cara-pasang" className="hover:text-emerald-400 transition">Cara Berlangganan</a>
                        <a href="#faq" className="hover:text-emerald-400 transition">FAQ</a>
                    </nav>

                    <div className="flex items-center gap-2.5">
                        <a
                            href="/customer/login"
                            className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition"
                        >
                            Portal Pelanggan
                        </a>
                        <a
                            href="#daftar"
                            className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg shadow-emerald-950/50 flex items-center gap-1.5"
                        >
                            <Sparkles size={13} />
                            Pasang Baru
                        </a>
                    </div>
                </div>
            </header>

            {/* 2. HERO SECTION */}
            <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-slate-800/60">
                {/* Background Glow Accents */}
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/15 blur-[120px] pointer-events-none rounded-full" />
                <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-teal-500/10 blur-[100px] pointer-events-none rounded-full" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center max-w-3xl mx-auto space-y-6">
                        {/* Promo Tag */}
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold shadow-sm animate-pulse">
                            <Sparkles size={14} className="text-emerald-400" />
                            <span>Promo Internet Rumah Termurah & Paling Stabil di Kalianda</span>
                        </div>

                        {/* Title */}
                        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
                            Internet Cepat, Stabil &amp;{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200">
                                Tanpa Batas Kuota
                            </span>
                        </h1>

                        {/* Subtitle */}
                        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
                            Nikmati koneksi <strong>100% Fiber Optic</strong> murni tanpa FUP dengan harga mulai <strong>Rp 150.000-an/bulan</strong>. Streaming 4K lancar, game online tanpa lag, dan kerja dari rumah lebih produktif.
                        </p>

                        {/* Quick Feature Badges */}
                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 text-xs font-semibold text-slate-300">
                            <span className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-1.5 shadow-xs">
                                <Zap size={14} className="text-amber-400" /> Unlimited Tanpa FUP
                            </span>
                            <span className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-1.5 shadow-xs">
                                <CheckCircle2 size={14} className="text-emerald-400" /> GRATIS Biaya Pasang
                            </span>
                            <span className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-1.5 shadow-xs">
                                <Shield size={14} className="text-cyan-400" /> Router WiFi Dipinjamkan
                            </span>
                            <span className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-1.5 shadow-xs">
                                <Smartphone size={14} className="text-emerald-400" /> Portal Ganti Sandi Mandiri
                            </span>
                        </div>

                        {/* Hero CTAs */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
                            <a
                                href="#paket"
                                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/70 hover:scale-[1.02]"
                            >
                                <Wifi size={17} />
                                Lihat Pilihan Paket &amp; Harga
                            </a>
                            <a
                                href="#cakupan"
                                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-sm transition flex items-center justify-center gap-2 hover:scale-[1.02]"
                            >
                                <MapPin size={17} className="text-emerald-400" />
                                Cek Wilayah Cakupan Anda
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. KEUNGGULAN UTAMA (WHY CHOOSE US) */}
            <section id="keunggulan" className="py-16 md:py-20 border-b border-slate-800/60 bg-slate-900/40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto space-y-2.5 mb-12">
                        <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                            Mengapa Memilih Kami?
                        </span>
                        <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                            Keunggulan Layanan Rumah Kita Net
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400">
                            Kami memberikan standar internet fiber optic modern dengan pelayanan prima dan biaya ramah kantong.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                        {/* 1 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800/90 hover:border-emerald-500/40 transition-all space-y-3 group hover:bg-slate-900">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
                                <Zap size={22} />
                            </div>
                            <h3 className="font-bold text-white text-base">100% Fiber Optic Murni</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Jalur koneksi kabel fiber optic langsung ke rumah (FTTH) yang tahan cuaca, minim redaman, dan latency rendah untuk gaming.
                            </p>
                        </div>

                        {/* 2 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800/90 hover:border-emerald-500/40 transition-all space-y-3 group hover:bg-slate-900">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
                                <Shield size={22} />
                            </div>
                            <h3 className="font-bold text-white text-base">True Unlimited (No FUP)</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Tanpa kuota tersembunyi. Kecepatan internet Anda tetap stabil dari awal hingga akhir bulan tanpa pernah diturunkan.
                            </p>
                        </div>

                        {/* 3 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800/90 hover:border-emerald-500/40 transition-all space-y-3 group hover:bg-slate-900">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition">
                                <Smartphone size={22} />
                            </div>
                            <h3 className="font-bold text-white text-base">Portal Mandiri Canggih</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Kelola WiFi sendiri lewat HP tanpa login: ganti password WiFi, cek HP yang terhubung, dan blokir perangkat asing dalam sekali klik.
                            </p>
                        </div>

                        {/* 4 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800/90 hover:border-emerald-500/40 transition-all space-y-3 group hover:bg-slate-900">
                            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 group-hover:scale-110 transition">
                                <Clock size={22} />
                            </div>
                            <h3 className="font-bold text-white text-base">Teknisi Lokal Standby</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Tim teknisi kami berdomisili lokal di wilayah Kalianda sehingga respon pemasangan dan penanganan kendala jauh lebih cepat.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. KATALOG PAKET LAYANAN INTERNET */}
            <section id="paket" className="py-16 md:py-24 border-b border-slate-800/60">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto space-y-3 mb-10">
                        <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                            Pilihan Paket &amp; Tarif
                        </span>
                        <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                            Pilih Paket Internet Sesuai Kebutuhan Anda
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400">
                            Semua paket sudah termasuk GRATIS Biaya Pemasangan dan peminjaman Router Wi-Fi.
                        </p>

                        {/* Category Filter Pills */}
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                            <button
                                type="button"
                                onClick={() => setSelectedCategory('all')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                                    selectedCategory === 'all'
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                            >
                                Semua Paket ({packages.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedCategory('hemat')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                                    selectedCategory === 'hemat'
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                            >
                                Paket Hemat (10-15 Mbps)
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedCategory('keluarga')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                                    selectedCategory === 'keluarga'
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                            >
                                Paket Keluarga Cepat (20-25 Mbps)
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedCategory('ultra')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                                    selectedCategory === 'ultra'
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                            >
                                Paket Ultra &amp; Bisnis (40-50 Mbps)
                            </button>
                        </div>
                    </div>

                    {/* Packages Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPackages.map((pkg) => {
                            const isPop = pkg.is_popular;
                            return (
                                <div
                                    key={pkg.id}
                                    className={`relative rounded-3xl p-6 transition-all flex flex-col justify-between ${
                                        isPop
                                            ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/40 border-2 border-emerald-500 shadow-2xl shadow-emerald-950/40'
                                            : 'bg-slate-900/80 border border-slate-800 hover:border-slate-700 shadow-lg'
                                    }`}
                                >
                                    {isPop && (
                                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-emerald-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-md flex items-center gap-1">
                                            <Star size={12} className="fill-slate-950" /> Paling Banyak Dipilih
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-extrabold text-lg text-white">{pkg.name}</h3>
                                            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold text-xs font-mono">
                                                {pkg.speed}
                                            </span>
                                        </div>

                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            {pkg.description}
                                        </p>

                                        {/* Price Box */}
                                        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-2xl sm:text-3xl font-black text-white">
                                                    {pkg.price_formatted}
                                                </span>
                                                <span className="text-xs text-slate-400 font-semibold">/ bulan</span>
                                            </div>
                                            <p className="text-[11px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                                                <CheckCircle2 size={12} /> Bebas Biaya Instalasi Pemasangan
                                            </p>
                                        </div>

                                        {/* Capacity Indicator */}
                                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 py-1 border-y border-slate-800/60">
                                            <Users size={14} className="text-slate-400" />
                                            <span>Rekomendasi Kapasitas:</span>
                                            <span className="text-emerald-400 font-bold ml-auto">{pkg.max_devices} Perangkat</span>
                                        </div>

                                        {/* Feature list */}
                                        <ul className="space-y-2 text-xs text-slate-300 pt-1">
                                            {pkg.features.map((f, idx) => (
                                                <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                                    <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                                                    <span>{f}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Action Button */}
                                    <div className="pt-6">
                                        <button
                                            type="button"
                                            onClick={() => handleSelectPackage(pkg)}
                                            className={`w-full py-3 px-4 rounded-2xl font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                                                isPop
                                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60'
                                                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                                            }`}
                                        >
                                            <Sparkles size={14} />
                                            Pilih &amp; Pasang Paket Ini
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 5. DAERAH CAKUPAN JARINGAN FIBER OPTIC (COVERAGE AREA) */}
            <section id="cakupan" className="py-16 md:py-24 border-b border-slate-800/60 bg-slate-900/30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                        {/* Left Info & Area List */}
                        <div className="lg:col-span-6 space-y-6">
                            <div className="space-y-3">
                                <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
                                    <Radio size={14} className="animate-pulse" /> Daerah Cakupan Fiber Optic
                                </span>
                                <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                                    Wilayah Jaringan Rumah Kita Net
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                                    Jaringan kabel 100% Fiber Optic kami telah menjangkau berbagai desa dan dusun strategis di wilayah Kalianda dengan puluhan titik distribusi ODP aktif.
                                </p>
                            </div>

                            {/* Coverage Stats Box */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
                                    <p className="text-2xl font-black text-emerald-400">100%</p>
                                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Fiber Optic</p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
                                    <p className="text-2xl font-black text-white">{coverageAreas.reduce((acc, k) => acc + k.desas.length, 0)}</p>
                                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Desa Tercover</p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
                                    <p className="text-2xl font-black text-teal-400">{allLocations.length}+</p>
                                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Dusun Siap Pasang</p>
                                </div>
                            </div>

                            {/* Covered Areas Accordion/List */}
                            <div className="space-y-3 pt-2">
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                                    Daftar Desa &amp; Dusun yang Sudah Ter-cover:
                                </h4>
                                {coverageAreas.map((kec) => (
                                    <div key={kec.id} className="space-y-2.5">
                                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                            <MapPin size={14} />
                                            Kecamatan {kec.name}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            {kec.desas.map((desa) => (
                                                <div
                                                    key={desa.id}
                                                    className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1.5"
                                                >
                                                    <p className="font-bold text-xs text-white">
                                                        Ds. {desa.name}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 line-clamp-2">
                                                        Dusun: {desa.dusuns.map((d) => d.name).join(', ')}
                                                    </p>
                                                    <div className="pt-1 flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                        Jaringan Fiber Siap Pasang
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Live Interactive Location Checker Card */}
                        <div className="lg:col-span-6">
                            <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-900/90 border border-slate-800 shadow-2xl space-y-5">
                                <div className="space-y-1.5">
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                        <Search size={20} />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Cek Ketersediaan di Lokasi Anda</h3>
                                    <p className="text-xs text-slate-400">
                                        Ketik nama dusun atau desa Anda untuk memeriksa apakah sudah terjangkau kabel optik Rumah Kita Net.
                                    </p>
                                </div>

                                <form onSubmit={handleCheckCoverage} className="space-y-3.5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                                            Cari Nama Desa atau Dusun:
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={coverageSearch}
                                                onChange={(e) => setCoverageSearch(e.target.value)}
                                                placeholder="Contoh: Rejosari, Taman Agung, Serdang, Merak..."
                                                className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 pl-3.5 pr-10 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                            />
                                            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
                                    >
                                        <MapPin size={14} />
                                        Periksa Cakupan Lokasi
                                    </button>
                                </form>

                                {/* Check Result Output Box */}
                                {coverageCheckResult && (
                                    <div
                                        className={`p-4 rounded-2xl text-xs space-y-2 animate-in fade-in duration-200 border ${
                                            coverageCheckResult.covered
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2.5">
                                            {coverageCheckResult.covered ? (
                                                <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                                            ) : (
                                                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                            )}
                                            <div className="space-y-1">
                                                <p className="font-bold text-white text-sm">
                                                    {coverageCheckResult.covered
                                                        ? 'Area Anda Sudah Tercover!'
                                                        : 'Area Belum Terdaftar'}
                                                </p>
                                                <p className="text-xs leading-relaxed">
                                                    {coverageCheckResult.message}
                                                </p>
                                            </div>
                                        </div>

                                        {coverageCheckResult.covered && (
                                            <div className="pt-2 flex justify-end">
                                                <a
                                                    href="#daftar"
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm"
                                                >
                                                    Pasang di Lokasi Ini &rarr;
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 6. CARA BERLANGGANAN (3 LANGKAH MUDAH) */}
            <section id="cara-pasang" className="py-16 md:py-20 border-b border-slate-800/60">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto space-y-2.5 mb-12">
                        <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                            Proses Pemasangan Mudah
                        </span>
                        <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                            3 Langkah Mudah Pasang WiFi di Rumah
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400">
                            Tanpa ribet, proses cepat, dan dibantu langsung oleh tim teknisi kami.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                        {/* Step 1 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3 text-center relative">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-black text-lg flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/60">
                                1
                            </div>
                            <h3 className="font-bold text-white text-base">Pilih Paket &amp; Isi Data</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Pilih paket kecepatan yang Anda inginkan dan lengkapi formulir pendaftaran singkat di bawah.
                            </p>
                        </div>

                        {/* Step 2 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3 text-center relative">
                            <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white font-black text-lg flex items-center justify-center mx-auto shadow-lg shadow-teal-950/60">
                                2
                            </div>
                            <h3 className="font-bold text-white text-base">Konfirmasi &amp; Jadwal Survey</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Tim kami akan menghubungi via WhatsApp untuk konfirmasi titik tiang ODP dan jadwal teknisi ke lokasi Anda.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3 text-center relative">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-600 text-white font-black text-lg flex items-center justify-center mx-auto shadow-lg shadow-cyan-950/60">
                                3
                            </div>
                            <h3 className="font-bold text-white text-base">Pemasangan &amp; Siap Pakai!</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Teknisi memasang kabel fiber optic &amp; router WiFi di rumah Anda. Internet langsung aktif seketika!
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 7. FORM PENDAFTARAN PEMASANGAN BARU (ORDER SECTION) */}
            <section id="daftar" className="py-16 md:py-24 border-b border-slate-800/60 bg-gradient-to-b from-slate-950 to-slate-900/60">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="rounded-3xl bg-slate-900 border border-emerald-500/40 p-6 sm:p-10 shadow-2xl space-y-6 relative overflow-hidden">
                        {/* Glow accent */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-3xl pointer-events-none" />

                        <div className="space-y-2 text-center max-w-xl mx-auto">
                            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                                Formulir Registrasi Online
                            </span>
                            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                                Daftar Pemasangan Baru Sekarang
                            </h2>
                            <p className="text-xs text-slate-400">
                                Dapatkan promo GRATIS Biaya Pemasangan dengan mengisi formulir di bawah ini.
                            </p>
                        </div>

                        {/* Success Message Banner */}
                        {regSuccess && (
                            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs space-y-2 animate-in fade-in">
                                <div className="flex items-start gap-2.5">
                                    <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-white text-sm">Pendaftaran Anda Berhasil Diterima!</p>
                                        <p className="text-xs text-emerald-300 mt-1 leading-relaxed">{regSuccess.message}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error Message Banner */}
                        {regError && (
                            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                                <AlertCircle size={18} className="shrink-0 text-rose-400" />
                                <span>{regError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmitProspect} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">
                                        Nama Lengkap Anda <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={regForm.name}
                                        onChange={(e) => setRegForm((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="Contoh: Budi Santoso"
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">
                                        Nomor WhatsApp Aktif <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={regForm.phone}
                                        onChange={(e) => setRegForm((p) => ({ ...p, phone: e.target.value }))}
                                        placeholder="Contoh: 081234567890"
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">
                                        Pilihan Paket Internet <span className="text-rose-400">*</span>
                                    </label>
                                    <select
                                        value={regForm.package_id}
                                        onChange={(e) => {
                                            const pkg = packages.find((p) => String(p.id) === e.target.value);
                                            setRegForm((prev) => ({
                                                ...prev,
                                                package_id: e.target.value,
                                                package_name: pkg ? `${pkg.name} (${pkg.speed}) - ${pkg.price_formatted}/bln` : '',
                                            }));
                                        }}
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    >
                                        {packages.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} ({p.speed}) - {p.price_formatted}/bln
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">
                                        Pilih Desa / Wilayah
                                    </label>
                                    <select
                                        value={regForm.desa_id}
                                        onChange={(e) => {
                                            const desaId = e.target.value;
                                            let foundDesa = null;
                                            let foundKec = null;
                                            coverageAreas.forEach((k) => {
                                                const d = k.desas.find((item) => String(item.id) === desaId);
                                                if (d) {
                                                    foundDesa = d;
                                                    foundKec = k;
                                                }
                                            });

                                            setRegForm((prev) => ({
                                                ...prev,
                                                desa_id: desaId,
                                                desa_name: foundDesa?.name || '',
                                                kecamatan_id: foundKec?.id || '',
                                                kecamatan_name: foundKec?.name || '',
                                                dusun_id: '',
                                                dusun_name: '',
                                            }));
                                        }}
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    >
                                        <option value="">-- Pilih Desa --</option>
                                        {coverageAreas.flatMap((k) =>
                                            k.desas.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    Ds. {d.name} (Kec. {k.name})
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    Alamat Lengkap / Patokan Rumah
                                </label>
                                <textarea
                                    rows={2}
                                    value={regForm.address_detail}
                                    onChange={(e) => setRegForm((p) => ({ ...p, address_detail: e.target.value }))}
                                    placeholder="Contoh: Jl. Lintas Sumatra No. 12, samping Masjid Al-Huda / dekat warung Bu Ani"
                                    className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleDirectWhatsApp}
                                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60"
                                >
                                    <MessageSquare size={16} />
                                    Daftar via WhatsApp (Respon Cepat)
                                </button>

                                <button
                                    type="submit"
                                    disabled={submittingReg}
                                    className="w-full py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {submittingReg ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                                    Kirim Pendaftaran Online
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </section>

            {/* 8. FAQ SECTION */}
            <section id="faq" className="py-16 md:py-20 border-b border-slate-800/60">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                    <div className="text-center space-y-2 max-w-xl mx-auto">
                        <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                            Pertanyaan Umum (FAQ)
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                            Pertanyaan Seputar Pemasangan WiFi
                        </h2>
                    </div>

                    <div className="space-y-3">
                        {faqs.map((faq, idx) => {
                            const isOpen = openFaq === idx;
                            return (
                                <div
                                    key={idx}
                                    className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden transition"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                                        className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-white hover:text-emerald-400 transition"
                                    >
                                        <span>{faq.q}</span>
                                        {isOpen ? <ChevronUp size={16} className="text-emerald-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/50 pt-3 animate-in fade-in duration-150">
                                            {faq.a}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 9. FOOTER */}
            <footer className="py-12 bg-slate-950 text-slate-400 text-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Col 1: Brand */}
                        <div className="space-y-3 md:col-span-2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
                                    <Wifi size={16} />
                                </div>
                                <span className="font-extrabold text-white text-base">
                                    Rumah Kita <span className="text-emerald-400">Net</span>
                                </span>
                            </div>
                            <p className="text-slate-400 max-w-sm leading-relaxed">
                                Layanan penyedia internet kabel 100% Fiber Optic murni terpercaya untuk rumah, usaha, dan instansi di wilayah Kalianda dan sekitarnya.
                            </p>
                        </div>

                        {/* Col 2: Navigasi & Legal */}
                        <div className="space-y-2.5">
                            <h4 className="font-bold text-white uppercase text-xs tracking-wider">Halaman Legal &amp; Bantuan</h4>
                            <ul className="space-y-1.5 text-slate-400">
                                <li><a href="/faq" className="hover:text-emerald-400 transition">FAQ &amp; Pusat Bantuan</a></li>
                                <li><a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan Layanan</a></li>
                                <li><a href="/refund-policy" className="hover:text-emerald-400 transition">Kebijakan Pengembalian (Refund)</a></li>
                                <li><a href="/kontak" className="hover:text-emerald-400 transition">Kontak &amp; Alamat Usaha</a></li>
                                <li><a href="/status-jaringan" className="hover:text-emerald-400 transition">Status Jaringan Live</a></li>
                                <li><a href="/customer/login" className="hover:text-emerald-400 transition">Portal Pelanggan</a></li>
                            </ul>
                        </div>

                        {/* Col 3: Kontak Resmi */}
                        <div className="space-y-2.5">
                            <h4 className="font-bold text-white uppercase text-xs tracking-wider">Kontak &amp; Kantor Resmi</h4>
                            <ul className="space-y-2 text-slate-400 text-[11px]">
                                <li className="flex items-start gap-2">
                                    <Mail size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                                    <span>info@rumahkitanet.com / cs@rumahkitanet.site</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <Phone size={14} className="text-emerald-400 shrink-0" />
                                    <span>+62 851-5802-5553 (085158025553)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <MapPin size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                                    <span>Desa Taman Agung, Kec. Kalianda, Kab. Lampung Selatan, Lampung 35551</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-slate-900 text-center text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <span>&copy; {new Date().getFullYear()} Rumah Kita Net (Rumah Kita Network). All Rights Reserved.</span>
                        <div className="flex items-center gap-4">
                            <a href="/faq" className="hover:text-slate-400">FAQ</a>
                            <span>&middot;</span>
                            <a href="/terms-and-conditions" className="hover:text-slate-400">Syarat &amp; Ketentuan</a>
                            <span>&middot;</span>
                            <a href="/refund-policy" className="hover:text-slate-400">Refund Policy</a>
                            <span>&middot;</span>
                            <a href="/kontak" className="hover:text-slate-400">Kontak</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

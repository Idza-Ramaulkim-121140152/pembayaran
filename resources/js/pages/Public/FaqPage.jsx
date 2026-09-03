import { useState } from 'react';
import {
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Search,
    Wifi,
    CreditCard,
    ShieldCheck,
    Wrench,
    Smartphone,
    Phone,
    MessageSquare,
    ArrowRight,
    MapPin,
    Mail,
    Sparkles
} from 'lucide-react';

export default function FaqPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [openIndex, setOpenIndex] = useState(0);

    const categories = [
        { id: 'all', label: 'Semua Pertanyaan', icon: HelpCircle },
        { id: 'layanan', label: 'Layanan & Paket', icon: Wifi },
        { id: 'pembayaran', label: 'Pembayaran & Tagihan', icon: CreditCard },
        { id: 'instalasi', label: 'Pemasangan & Router', icon: Wrench },
        { id: 'portal', label: 'Portal Mandiri & WiFi', icon: Smartphone },
        { id: 'refund', label: 'Pengembalian Dana', icon: ShieldCheck },
    ];

    const faqList = [
        // Layanan & Paket
        {
            category: 'layanan',
            q: 'Apa itu layanan internet Rumah Kita Net?',
            a: 'Rumah Kita Net (Rumah Kita Network) adalah penyedia jasa layanan internet berbasis 100% Fiber Optic (FTTH - Fiber to the Home) yang melayani kebutuhan internet rumah, tempat usaha, kantor, dan sekolah dengan koneksi stabil, berkecepatan tinggi, dan tanpa batas kuota.',
        },
        {
            category: 'layanan',
            q: 'Apakah ada batasan kuota (FUP) pada paket Rumah Kita Net?',
            a: 'Tidak ada. Seluruh paket internet Rumah Kita Net adalah True Unlimited tanpa batas FUP (Fair Usage Policy). Kecepatan internet Anda tidak akan pernah diturunkan meskipun Anda menggunakan bandwidth besar untuk streaming 4K, video conference, ataupun download seharian.',
        },
        {
            category: 'layanan',
            q: 'Berapa pilihan kecepatan paket internet yang tersedia?',
            a: 'Kami menyediakan berbagai varian kecepatan mulai dari 10 Mbps (Paket Hemat/Bronze), 15 Mbps, 20 Mbps, 25 Mbps (Paket Keluarga Terpopuler), 40 Mbps, hingga 50 Mbps untuk kebutuhan gaming berat dan multi-perangkat.',
        },

        // Pembayaran & Tagihan
        {
            category: 'pembayaran',
            q: 'Metode pembayaran apa saja yang didukung?',
            a: 'Kami mendukung berbagai saluran pembayaran digital otomatis dan manual, meliputi: Payment Gateway (QRIS Nasional, Virtual Account Bank BCA, BNI, Mandiri, BRI, Permata), Transfer Bank Langsung, E-Wallet (GoPay, OVO, DANA, ShopeePay), serta pembayaran tunai melalui kasir/petugas resmi Rumah Kita Net.',
        },
        {
            category: 'pembayaran',
            q: 'Kapan batas waktu pembayaran tagihan bulanan?',
            a: 'Siklus tagihan dihitung bulanan sesuai tanggal aktivasi layanan Anda (atau tanggal jatuh tempo yang tercantum di invoice). Pengingat tagihan otomatis (billing reminder) akan dikirimkan secara berkala melalui WhatsApp resmi sebelum tanggal jatuh tempo.',
        },
        {
            category: 'pembayaran',
            q: 'Bagaimana jika saya tidak sengaja melakukan pembayaran ganda (double payment)?',
            a: 'Jika terjadi kelebihan pembayaran atau pembayaran ganda, dana lebih Anda dapat dikompensasikan untuk tagihan bulan berikutnya atau diajukan pengembalian dana (refund) dengan menghubungi Customer Service kami sesuai Syarat & Ketentuan Kebijakan Refund.',
        },

        // Pemasangan & Router
        {
            category: 'instalasi',
            q: 'Berapa biaya pemasangan baru WiFi Rumah Kita Net?',
            a: 'Saat ini kami memberlakukan PROMO BEBAS BIAYA PEMASANGAN / INSTALASI GRATIS untuk pelanggan baru. Anda juga dipinjamkan unit Optical Network Terminal (Router WiFi ONT) berstandar industri tanpa biaya sewa tambahan selama berlangganan.',
        },
        {
            category: 'instalasi',
            q: 'Berapa lama proses pemasangan teknisi setelah saya mendaftar?',
            a: 'Proses survei dan instalasi kabel fiber optic ke rumah Anda umumnya dilakukan dalam waktu 1x24 jam hingga maksimal 2x24 jam hari kerja setelah konfirmasi pendaftaran.',
        },

        // Portal Mandiri & WiFi
        {
            category: 'portal',
            q: 'Apa itu fitur Portal Akses Mandiri Pelanggan?',
            a: 'Portal Akses Mandiri adalah tautan web unik khusus yang kami berikan kepada setiap pelanggan. Melalui tautan ini (yang dapat dibuka dari HP tanpa perlu login), Anda dapat melihat kata sandi WiFi saat ini, mengganti nama/kata sandi WiFi secara mandiri, melihat daftar HP yang sedang terhubung, hingga memblokir perangkat asing/tidak dikenal.',
        },
        {
            category: 'portal',
            q: 'Apakah saya bisa ganti kata sandi WiFi sendiri kapan saja?',
            a: 'Ya, tentu saja. Melalui Portal Mandiri Pelanggan, Anda cukup memasukkan kata sandi baru dan klik simpan. Sistem TR-069 kami akan langsung memperbarui kata sandi tersebut ke router fisik Anda dalam hitungan detik.',
        },

        // Refund Policy
        {
            category: 'refund',
            q: 'Apakah biaya langganan bisa di-refund jika internet mengalami kendala?',
            a: 'Kami menjamin SLA (Service Level Agreement) koneksi stabil. Apabila terjadi gangguan teknis berkepanjangan yang disebabkan oleh pihak kami dan tidak dapat diselesaikan oleh teknisi dalam batas waktu yang ditentukan, pelanggan berhak mengajukan kompensasi atau pengembalian dana prorata sesuai ketentuan Kebijakan Pengembalian Dana (Refund Policy).',
        },
    ];

    const filteredFaqs = faqList.filter((item) => {
        const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
        const matchesSearch =
            searchQuery.trim() === '' ||
            item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.a.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
            {/* TOP BAR & NAVBAR */}
            <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/90 border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <a href="/promo" className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-950/50">
                            <Wifi size={18} />
                        </div>
                        <div>
                            <span className="font-extrabold text-base tracking-tight text-white block leading-none">
                                Rumah Kita <span className="text-emerald-400">Net</span>
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Pusat Bantuan &amp; FAQ
                            </span>
                        </div>
                    </a>

                    <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
                        <a href="/promo" className="hover:text-emerald-400 transition">Beranda &amp; Promo</a>
                        <a href="/promo#paket" className="hover:text-emerald-400 transition">Paket Internet</a>
                        <a href="/faq" className="text-emerald-400">FAQ</a>
                        <a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan</a>
                        <a href="/refund-policy" className="hover:text-emerald-400 transition">Refund Policy</a>
                        <a href="/kontak" className="hover:text-emerald-400 transition">Kontak</a>
                    </nav>

                    <a
                        href="/kontak"
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-950/50"
                    >
                        Hubungi CS
                    </a>
                </div>
            </header>

            {/* HERO HEADER */}
            <section className="py-14 sm:py-20 border-b border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950 relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />
                
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4 relative z-10">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        <HelpCircle size={14} />
                        <span>Pusat Informasi &amp; Jawaban</span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                        Frequently Asked Questions (FAQ)
                    </h1>
                    <p className="text-sm text-slate-400 max-w-2xl mx-auto">
                        Temukan jawaban atas pertanyaan umum seputar paket internet fiber optic, pembayaran tagihan, pemasangan router, portal mandiri, dan pengembalian dana Rumah Kita Net.
                    </p>

                    {/* Search Bar */}
                    <div className="max-w-xl mx-auto pt-4">
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari pertanyaan... (contoh: pembayaran, FUP, ganti sandi, refund)"
                                className="w-full text-xs sm:text-sm rounded-2xl bg-slate-900 border border-slate-700 pl-11 pr-4 py-3.5 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-xl"
                            />
                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>
                </div>
            </section>

            {/* MAIN CONTENT SECTION */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
                {/* Category Filter Tabs */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = activeCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                    setActiveCategory(cat.id);
                                    setOpenIndex(0);
                                }}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                                    isActive
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60'
                                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                            >
                                <Icon size={14} />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* FAQ Accordion List */}
                <div className="space-y-3.5 max-w-3xl mx-auto">
                    {filteredFaqs.length === 0 ? (
                        <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-2">
                            <p className="text-sm font-bold text-slate-300">Tidak ada pertanyaan yang sesuai dengan kata kunci "{searchQuery}"</p>
                            <p className="text-xs text-slate-500">Silakan hubungi Customer Service kami jika butuh bantuan lebih lanjut.</p>
                        </div>
                    ) : (
                        filteredFaqs.map((faq, idx) => {
                            const isOpen = openIndex === idx;
                            return (
                                <div
                                    key={idx}
                                    className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden transition"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenIndex(isOpen ? null : idx)}
                                        className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-white hover:text-emerald-400 transition"
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                                                Q
                                            </span>
                                            {faq.q}
                                        </span>
                                        {isOpen ? <ChevronUp size={16} className="text-emerald-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                                    </button>
                                    {isOpen && (
                                        <div className="px-5 pb-5 pt-2 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 bg-slate-950/40">
                                            {faq.a}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Direct CS Help Card */}
                <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="space-y-1.5 text-center sm:text-left">
                        <h3 className="font-extrabold text-white text-base">Masih Punya Pertanyaan Lain?</h3>
                        <p className="text-xs text-slate-400 max-w-md">
                            Tim Customer Service Rumah Kita Net siap menjawab pertanyaan Anda dan membantu proses registrasi pasang baru.
                        </p>
                    </div>
                    <a
                        href="/kontak"
                        className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-950/50 shrink-0"
                    >
                        <MessageSquare size={15} />
                        Hubungi Customer Service
                    </a>
                </div>
            </main>

            {/* FOOTER (COMPLIANT WITH IPAYMU REQUIREMENTS) */}
            <footer className="border-t border-slate-800/80 bg-slate-950 py-12 text-slate-400 text-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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
                                Penyedia layanan internet 100% Fiber Optic murni untuk kebutuhan rumah, kantor, dan usaha di wilayah Kalianda, Lampung Selatan.
                            </p>
                        </div>

                        <div className="space-y-2.5">
                            <h4 className="font-bold text-white uppercase text-xs tracking-wider">Halaman Legal</h4>
                            <ul className="space-y-1.5 text-slate-400">
                                <li><a href="/faq" className="text-emerald-400 font-semibold">FAQ &amp; Bantuan</a></li>
                                <li><a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan</a></li>
                                <li><a href="/refund-policy" className="hover:text-emerald-400 transition">Kebijakan Pengembalian (Refund)</a></li>
                                <li><a href="/kontak" className="hover:text-emerald-400 transition">Kontak &amp; Alamat Usaha</a></li>
                            </ul>
                        </div>

                        <div className="space-y-2.5">
                            <h4 className="font-bold text-white uppercase text-xs tracking-wider">Kontak Resmi</h4>
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

                    <div className="pt-6 border-t border-slate-900 text-center text-[11px] text-slate-500">
                        &copy; {new Date().getFullYear()} Rumah Kita Net (Rumah Kita Network). All Rights Reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}

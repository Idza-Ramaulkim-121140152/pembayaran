import { useState } from 'react';
import {
    MapPin,
    Phone,
    Mail,
    Clock,
    Send,
    MessageSquare,
    Wifi,
    CheckCircle2,
    Shield,
    Sparkles,
    Building2,
    Globe,
    User
} from 'lucide-react';

export default function ContactPage() {
    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        subject: 'Informasi Layanan & Pemasangan',
        message: '',
    });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        const text = `Halo Tim Rumah Kita Net,\n\nSaya ingin menghubungi Anda melalui formulir kontak website:\n` +
            `👤 Nama: *${form.name}*\n` +
            `📱 No. WhatsApp: *${form.phone}*\n` +
            `📧 Email: *${form.email || '-'}*\n` +
            `📌 Perihal: *${form.subject}*\n` +
            `📝 Pesan: ${form.message}\n\n` +
            `Mohon responnya. Terima kasih!`;

        window.open(`https://wa.me/6285158025553?text=${encodeURIComponent(text)}`, '_blank');
        setSubmitted(true);
    };

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
                                Kontak &amp; Lokasi Usaha
                            </span>
                        </div>
                    </a>

                    <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
                        <a href="/promo" className="hover:text-emerald-400 transition">Beranda &amp; Promo</a>
                        <a href="/faq" className="hover:text-emerald-400 transition">FAQ</a>
                        <a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan</a>
                        <a href="/refund-policy" className="hover:text-emerald-400 transition">Refund Policy</a>
                        <a href="/kontak" className="text-emerald-400">Kontak</a>
                    </nav>

                    <a
                        href="https://wa.me/6285158025553"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-950/50 flex items-center gap-1.5"
                    >
                        <MessageSquare size={14} />
                        WhatsApp CS
                    </a>
                </div>
            </header>

            {/* HEADER HERO */}
            <section className="py-12 sm:py-16 border-b border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950 relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />
                
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3 relative z-10">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        <Building2 size={14} />
                        <span>Informasi Kontak &amp; Alamat Resmi Usaha</span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                        Hubungi Kami (Contact Us)
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto">
                        Kami siap melayani kebutuhan konsultasi paket internet, pendaftaran pasang baru, bantuan teknis gangguan, dan informasi pembayaran.
                    </p>
                </div>
            </section>

            {/* MAIN CONTENT */}
            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
                {/* 3 Contact Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Alamat Usaha */}
                    <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                            <MapPin size={24} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="font-extrabold text-white text-base">Alamat Kantor Usaha</h3>
                            <p className="text-xs font-semibold text-emerald-400">Rumah Kita Net (Rumah Kita Network)</p>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                Desa Taman Agung, Kecamatan Kalianda,<br />
                                Kabupaten Lampung Selatan, Provinsi Lampung,<br />
                                Kode Pos: <strong>35551</strong>, Indonesia.
                            </p>
                        </div>
                    </div>

                    {/* Telepon & WhatsApp */}
                    <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition">
                        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                            <Phone size={24} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="font-extrabold text-white text-base">Telepon &amp; WhatsApp</h3>
                            <p className="text-xs text-slate-400">Hubungi Hotline Layanan Pelanggan:</p>
                            <p className="text-sm font-black text-white font-mono">
                                +62 851-5802-5553
                            </p>
                            <p className="text-[11px] text-slate-400">
                                WhatsApp Cepat: 0851-5802-5553
                            </p>
                            <div className="pt-1">
                                <a
                                    href="https://wa.me/6285158025553"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 underline"
                                >
                                    Chat WhatsApp Sekarang &rarr;
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Email & Operasional */}
                    <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                            <Mail size={24} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="font-extrabold text-white text-base">Email &amp; Jam Operasional</h3>
                            <p className="text-xs text-slate-400">Email Resmi:</p>
                            <p className="text-xs font-bold text-white font-mono">
                                info@rumahkitanet.com
                            </p>
                            <p className="text-xs font-bold text-slate-300 font-mono">
                                cs@rumahkitanet.site
                            </p>
                            <div className="pt-2 text-[11px] text-slate-400 space-y-1 border-t border-slate-800/80">
                                <p><strong>Kantor:</strong> Senin - Sabtu: 08.00 - 17.00 WIB</p>
                                <p className="text-emerald-400 font-semibold"><strong>Dukungan Teknis:</strong> 24 Jam Nonstop</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form Kirim Pesan & Info Usaha Card */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left: Detail Bisnis */}
                    <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
                        <div className="space-y-2">
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Identitas Usaha</span>
                            <h3 className="text-xl font-bold text-white">Profil Bisnis Resmi</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Rumah Kita Net adalah unit usaha penyedia layanan internet kabel fiber optic terpercaya di wilayah Lampung Selatan.
                            </p>
                        </div>

                        <div className="space-y-3 text-xs text-slate-300">
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                <Building2 size={18} className="text-emerald-400 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-500">Nama Bisnis / Brand</p>
                                    <p className="font-bold text-white">Rumah Kita Net (Rumah Kita Network)</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                <Globe size={18} className="text-cyan-400 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-500">Website Resmi</p>
                                    <p className="font-bold text-white">https://rumahkitanet.site</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                                <Shield size={18} className="text-teal-400 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-500">Kategori Layanan</p>
                                    <p className="font-bold text-white">Internet Service Provider (FTTH &amp; Broadband)</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                            <p className="font-bold flex items-center gap-1.5">
                                <CheckCircle2 size={14} className="text-emerald-400" />
                                Layanan Cepat &amp; Tanggap
                            </p>
                            <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                                Seluruh tiket aduan dan pertanyaan pelanggan akan direspon dalam waktu singkat oleh teknisi &amp; admin lokal.
                            </p>
                        </div>
                    </div>

                    {/* Right: Formulir Kontak */}
                    <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
                        <div className="space-y-1.5">
                            <h3 className="text-xl font-bold text-white">Kirim Pesan Langsung</h3>
                            <p className="text-xs text-slate-400">
                                Isi formulir berikut untuk mengirimkan pertanyaan atau permintaan bantuan kepada Customer Service kami.
                            </p>
                        </div>

                        {submitted && (
                            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                                <span>Pesan Anda telah diteruskan ke WhatsApp Customer Service Rumah Kita Net!</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-300 mb-1">
                                        Nama Lengkap <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={form.name}
                                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="Nama Anda"
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-slate-300 mb-1">
                                        Nomor WhatsApp / HP <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={form.phone}
                                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                                        placeholder="08xxxxxxxxxx"
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-slate-300 mb-1">
                                        Email (Opsional)
                                    </label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                                        placeholder="nama@email.com"
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-slate-300 mb-1">
                                        Perihal Pesan <span className="text-rose-400">*</span>
                                    </label>
                                    <select
                                        value={form.subject}
                                        onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                                        className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    >
                                        <option value="Pendaftaran Pasang Baru">Pendaftaran Pasang Baru</option>
                                        <option value="Informasi Paket & Tarif">Informasi Paket &amp; Tarif</option>
                                        <option value="Bantuan Teknis / Gangguan WiFi">Bantuan Teknis / Gangguan WiFi</option>
                                        <option value="Pembayaran & Konfirmasi Tagihan">Pembayaran &amp; Konfirmasi Tagihan</option>
                                        <option value="Pengajuan Refund / Pengembalian Dana">Pengajuan Refund / Pengembalian Dana</option>
                                        <option value="Lainnya">Lainnya</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-slate-300 mb-1">
                                    Isi Pesan <span className="text-rose-400">*</span>
                                </label>
                                <textarea
                                    rows={4}
                                    required
                                    value={form.message}
                                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                                    placeholder="Tuliskan pertanyaan, aduan, atau kebutuhan Anda secara detail..."
                                    className="w-full text-xs rounded-xl bg-slate-950 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60"
                            >
                                <Send size={15} />
                                Kirim Pesan via WhatsApp CS
                            </button>
                        </form>
                    </div>
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
                                <li><a href="/faq" className="hover:text-emerald-400 transition">FAQ &amp; Bantuan</a></li>
                                <li><a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan</a></li>
                                <li><a href="/refund-policy" className="hover:text-emerald-400 transition">Kebijakan Pengembalian (Refund)</a></li>
                                <li><a href="/kontak" className="text-emerald-400 font-semibold">Kontak &amp; Alamat Usaha</a></li>
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

import {
    FileText,
    Shield,
    CheckCircle2,
    Wifi,
    AlertCircle,
    Phone,
    Mail,
    MapPin,
    Calendar
} from 'lucide-react';

export default function TermsAndConditionsPage() {
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
                                Syarat &amp; Ketentuan Layanan
                            </span>
                        </div>
                    </a>

                    <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
                        <a href="/promo" className="hover:text-emerald-400 transition">Beranda &amp; Promo</a>
                        <a href="/faq" className="hover:text-emerald-400 transition">FAQ</a>
                        <a href="/terms-and-conditions" className="text-emerald-400">Syarat &amp; Ketentuan</a>
                        <a href="/refund-policy" className="hover:text-emerald-400 transition">Refund Policy</a>
                        <a href="/kontak" className="hover:text-emerald-400 transition">Kontak</a>
                    </nav>

                    <a
                        href="/kontak"
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-950/50"
                    >
                        Hubungi Kami
                    </a>
                </div>
            </header>

            {/* HEADER */}
            <section className="py-12 sm:py-16 border-b border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        <FileText size={14} />
                        <span>Dokumen Hukum &amp; Ketentuan Berlangganan</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Syarat dan Ketentuan Layanan (Terms &amp; Conditions)
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto flex items-center justify-center gap-2">
                        <Calendar size={14} />
                        Terakhir diperbarui: 1 Januari 2026 | Berlaku untuk seluruh pelanggan Rumah Kita Net
                    </p>
                </div>
            </section>

            {/* CONTENT CLAUSES */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {/* Intro */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <p>
                        Selamat datang di <strong>Rumah Kita Net (Rumah Kita Network)</strong>. Syarat dan Ketentuan berikut mengatur hak, kewajiban, serta tata cara penggunaan layanan akses internet berbasis Fiber Optic yang disediakan oleh Rumah Kita Net kepada Pelanggan (perorangan, keluarga, badan usaha, atau institusi).
                    </p>
                    <p>
                        Dengan mendaftar, mengaktifkan, dan/atau menggunakan layanan Rumah Kita Net, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh ketentuan yang tercantum dalam dokumen ini.
                    </p>
                </div>

                {/* Pasal 1 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">1</span>
                        Definisi Layanan
                    </h2>
                    <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">
                        <li><strong>Penyedia Layanan:</strong> Rumah Kita Net (Rumah Kita Network), unit usaha penyedia jasa akses internet fiber optic yang beroperasi di wilayah Lampung Selatan.</li>
                        <li><strong>Pelanggan:</strong> Pihak yang telah terdaftar resmi dan menggunakan jasa sambungan internet Rumah Kita Net.</li>
                        <li><strong>Perangkat CPE/ONT:</strong> Optical Network Terminal (Router WiFi) yang dipinjamkan oleh Penyedia Layanan kepada Pelanggan selama masa berlangganan.</li>
                        <li><strong>Portal Mandiri:</strong> Tautan web khusus pelanggan untuk mengelola kata sandi WiFi dan pemantauan perangkat.</li>
                    </ul>
                </div>

                {/* Pasal 2 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">2</span>
                        Pemasangan &amp; Peminjaman Perangkat
                    </h2>
                    <div className="space-y-2 pl-2">
                        <p>2.1. Pemasangan kabel Fiber Optic dan penempatan Router ONT dilakukan oleh tim teknisi resmi Rumah Kita Net pada lokasi alamat yang disepakati.</p>
                        <p>2.2. Perangkat Router ONT dan adaptor daya adalah aset milik Rumah Kita Net yang <strong>dipinjamkan</strong> kepada pelanggan selama status langganan aktif.</p>
                        <p>2.3. Pelanggan wajib menjaga fisik perangkat dari kerusakan akibat kelalaian (seperti terkena cairan, jatuh, atau modifikasi ilegal tanpa izin teknisi).</p>
                        <p>2.4. Apabila pelanggan memutuskan berhenti berlangganan, perangkat router dan adaptor wajib dikembalikan dalam kondisi baik kepada pihak Rumah Kita Net.</p>
                    </div>
                </div>

                {/* Pasal 3 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">3</span>
                        Tarif, Penagihan &amp; Pembayaran
                    </h2>
                    <div className="space-y-2 pl-2">
                        <p>3.1. Biaya langganan paket internet ditagihkan setiap bulan sesuai dengan paket yang dipilih oleh Pelanggan.</p>
                        <p>3.2. Pelanggan wajib melakukan pembayaran sebelum atau tepat pada tanggal jatuh tempo yang tercantum pada Invoice / Pengingat Tagihan WhatsApp.</p>
                        <p>3.3. Pembayaran resmi dapat dilakukan melalui Payment Gateway (QRIS Nasional, Virtual Account Bank), Transfer Bank Resmi, atau kasir resmi Rumah Kita Net.</p>
                        <p>3.4. Keterlambatan pembayaran setelah tanggal jatuh tempo dapat mengakibatkan penghentian layanan sementara (isolir otomatis) hingga pembayaran diselesaikan.</p>
                    </div>
                </div>

                {/* Pasal 4 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">4</span>
                        Kebijakan Penggunaan Layanan (Fair &amp; Legal Usage)
                    </h2>
                    <div className="space-y-2 pl-2">
                        <p>4.1. Layanan internet Rumah Kita Net tidak memiliki FUP kuota, namun pelanggan dilarang menyalahgunakan sambungan untuk kegiatan melawan hukum di wilayah Republik Indonesia (seperti perjudian online, hacking/DDoS, penyebaran malware, atau pelanggaran hak cipta ilegal).</p>
                        <p>4.2. Pelanggan dilarang memperjualbelikan kembali (reselling) bandwidth sambungan internet kepada pihak ketiga tanpa izin kerja sama resmi tertulis dari Rumah Kita Net.</p>
                    </div>
                </div>

                {/* Pasal 5 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">5</span>
                        Jaminan Layanan &amp; Penanganan Gangguan (SLA)
                    </h2>
                    <div className="space-y-2 pl-2">
                        <p>5.1. Rumah Kita Net berkomitmen memberikan ketersediaan jaringan (*uptime*) optimal dengan pemantauan sistem 24 jam.</p>
                        <p>5.2. Apabila terjadi kendala jaringan atau putus sambungan, Pelanggan dapat membuat laporan aduan melalui menu aduan / WhatsApp Customer Service.</p>
                        <p>5.3. Pemeliharaan berkala (*maintenance*) yang berpotensi menyebabkan *downtime* akan diumumkan terlebih dahulu melalui pemberitahuan sistem / WhatsApp.</p>
                    </div>
                </div>

                {/* Pasal 6 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">6</span>
                        Kebijakan Pengembalian Dana (Refund)
                    </h2>
                    <div className="space-y-2 pl-2">
                        <p>Ketentuan kompensasi dan pengembalian dana atas kelebihan bayar atau pembatalan sebelum instalasi diatur secara spesifik pada halaman <a href="/refund-policy" className="text-emerald-400 underline font-bold">Kebijakan Pengembalian Dana (Refund Policy)</a>.</p>
                    </div>
                </div>

                {/* Pasal 7 */}
                <div className="space-y-3">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">7</span>
                        Batasan Tanggung Jawab &amp; Force Majeure
                    </h2>
                    <div className="space-y-2 pl-2">
                        <p>Rumah Kita Net dibebaskan dari kewajiban ganti rugi atas kegagalan atau gangguan transmisi yang disebabkan oleh keadaan kahar (*Force Majeure*), termasuk namun tidak terbatas pada bencana alam (gempa bumi, banjir, petir), putusnya kabel utama utilitas akibat proyek jalan pihak ketiga, huru-hara, atau pemadaman listrik PLN massal.</p>
                    </div>
                </div>

                {/* Hubungi Kami */}
                <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-2">
                    <h3 className="font-bold text-white">Pertanyaan Mengenai Syarat &amp; Ketentuan?</h3>
                    <p className="text-slate-400">
                        Jika Anda memiliki pertanyaan seputar dokumen ini, silakan hubungi tim legal &amp; operasional kami melalui email: <strong className="text-white">info@rumahkitanet.com</strong> atau WhatsApp: <strong className="text-white">+62 851-5802-5553</strong>.
                    </p>
                </div>
            </main>

            {/* FOOTER */}
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
                                <li><a href="/terms-and-conditions" className="text-emerald-400 font-semibold">Syarat &amp; Ketentuan</a></li>
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

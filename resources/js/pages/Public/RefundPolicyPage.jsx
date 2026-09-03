import {
    ShieldCheck,
    RotateCcw,
    CheckCircle2,
    AlertCircle,
    Wifi,
    Clock,
    Phone,
    Mail,
    MapPin,
    CreditCard,
    FileText,
    HelpCircle
} from 'lucide-react';

export default function RefundPolicyPage() {
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
                                Kebijakan Refund
                            </span>
                        </div>
                    </a>

                    <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
                        <a href="/promo" className="hover:text-emerald-400 transition">Beranda &amp; Promo</a>
                        <a href="/faq" className="hover:text-emerald-400 transition">FAQ</a>
                        <a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan</a>
                        <a href="/refund-policy" className="text-emerald-400">Refund Policy</a>
                        <a href="/kontak" className="hover:text-emerald-400 transition">Kontak</a>
                    </nav>

                    <a
                        href="/kontak"
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-950/50"
                    >
                        Pusat Bantuan
                    </a>
                </div>
            </header>

            {/* HEADER */}
            <section className="py-12 sm:py-16 border-b border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        <RotateCcw size={14} />
                        <span>Kebijakan Pengembalian Dana</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Kebijakan Pengembalian Dana (Refund Policy)
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto">
                        Komitmen transparansi dan perlindungan transaksi pelanggan Rumah Kita Net untuk memastikan rasa aman dalam setiap transaksi berlangganan.
                    </p>
                </div>
            </section>

            {/* CONTENT */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {/* Ringkasan Jaminan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-2">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="font-bold text-white text-sm">Transparan &amp; Adil</h3>
                        <p className="text-xs text-slate-400">Proses refund jelas sesuai dengan bukti tagihan dan validasi transaksi bank/gateway.</p>
                    </div>

                    <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-2">
                        <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                        <h3 className="font-bold text-white text-sm">Proses 1 - 5 Hari Kerja</h3>
                        <p className="text-xs text-slate-400">Dana dikembalikan ke rekening/e-wallet pelanggan setelah verifikasi data selesai.</p>
                    </div>

                    <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-2">
                        <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                            <CreditCard size={20} />
                        </div>
                        <h3 className="font-bold text-white text-sm">Berbagai Saluran</h3>
                        <p className="text-xs text-slate-400">Pengembalian via Transfer Bank (BCA, BRI, Mandiri, BNI) atau E-Wallet (DANA, Gopay, OVO).</p>
                    </div>
                </div>

                {/* Bagian 1 */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-mono font-bold">1</span>
                        Kondisi &amp; Kriteria Pengembalian Dana (Refund Eligible)
                    </h2>
                    <p>Pengembalian dana dapat disetujui dalam kondisi-kondisi berikut:</p>
                    <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
                        <li>
                            <strong>Pembayaran Ganda (Double Payment / Overpayment):</strong> Pelanggan secara tidak sengaja membayar tagihan lebih dari satu kali untuk periode invoice yang sama.
                        </li>
                        <li>
                            <strong>Pembatalan Sebelum Pemasangan:</strong> Calon pelanggan yang telah melakukan pembayaran biaya registrasi/langganan di awal membatalkan pesanan sebelum penarikan kabel atau instalasi fisik dimulai oleh teknisi.
                        </li>
                        <li>
                            <strong>Lokasi Tidak Terjangkau (Unreachable Coverage):</strong> Setelah dilakukan survei teknis di lapangan oleh tim teknisi, lokasi calon pelanggan tidak memungkinkan untuk ditarik kabel fiber optic karena keterbatasan jarak atau tiang ODP.
                        </li>
                        <li>
                            <strong>Gangguan Jaringan Massal Berkepanjangan:</strong> Terjadi kendala teknis fatal dari sisi penyedia layanan yang tidak dapat diselesaikan lebih dari batas waktu kompensasi SLA yang berlaku.
                        </li>
                    </ul>
                </div>

                {/* Bagian 2 */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-mono font-bold">2</span>
                        Kondisi yang Tidak Memenuhi Syarat Refund (Non-Refundable)
                    </h2>
                    <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
                        <li>Layanan internet yang telah aktif dan digunakan secara normal selama periode berjalan.</li>
                        <li>Pembatalan sepihak setelah proses instalasi selesai dilakukan dan sambungan internet telah dinyatakan aktif.</li>
                        <li>Gangguan yang disebabkan oleh faktor internal pelanggan (seperti kerusakan perangkat HP/Laptop pribadi pelanggan, kabel di dalam rumah terputus akibat gigitan hewan peliharaan, atau router dicabut).</li>
                        <li>Pemutusan layanan akibat pelanggaran hukum atau pelanggaran berat Syarat &amp; Ketentuan oleh Pelanggan.</li>
                    </ul>
                </div>

                {/* Bagian 3 */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-mono font-bold">3</span>
                        Prosedur &amp; Langkah Pengajuan Refund
                    </h2>
                    <div className="space-y-2.5 pl-2">
                        <p>Untuk mengajukan permohonan pengembalian dana, pelanggan dapat mengikuti langkah berikut:</p>
                        <ol className="list-decimal list-inside space-y-2 pl-2">
                            <li>
                                <strong>Hubungi Layanan Pelanggan:</strong> Kirim pesan ke WhatsApp Customer Service (<strong className="text-white">+62 851-5802-5553</strong>) atau email ke <strong className="text-white">info@rumahkitanet.com</strong> dengan subjek <em>"Pengajuan Refund - [Nama Pelanggan] - [Nomor WhatsApp/ID Pelanggan]"</em>.
                            </li>
                            <li>
                                <strong>Lampirkan Bukti Pendukung:</strong> Sertakan bukti transfer pembayaran resmi, nomor invoice / tagihan, serta alasan pengajuan refund.
                            </li>
                            <li>
                                <strong>Sertakan Rekening Tujuan:</strong> Informasikan Nama Bank, Nomor Rekening, dan Nama Pemilik Rekening (wajib sama dengan nama pelanggan terdaftar).
                            </li>
                            <li>
                                <strong>Verifikasi &amp; Pencairan:</strong> Tim finance Rumah Kita Net akan memverifikasi mutasi bank/gateway dalam 1x24 jam dan memproses transfer pengembalian dana ke rekening Anda dalam 1 - 5 hari kerja.
                            </li>
                        </ol>
                    </div>
                </div>

                {/* Bagian 4 */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-mono font-bold">4</span>
                        Pilihan Alternatif Kompensasi (Deposit / Saldo Tagihan)
                    </h2>
                    <p>
                        Sebagai alternatif pengembalian dana ke rekening bank, pelanggan juga dapat memilih opsi <strong>Pengalihan Dana Menjadi Deposit Tagihan Bulan Depan</strong>. Opsi ini diproses instan tanpa potongan biaya admin perbankan dan otomatis memotong tagihan invoice pada periode berikutnya.
                    </p>
                </div>

                {/* Kontak Card */}
                <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-3">
                    <h3 className="font-bold text-white text-base">Butuh Bantuan Terkait Pembayaran &amp; Refund?</h3>
                    <p className="text-slate-400">
                        Tim Finance dan Customer Service kami siap melayani Anda setiap hari untuk menyelesaikan kendala transaksi dengan cepat dan transparan.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 pt-2">
                        <a
                            href="https://wa.me/6285158025553?text=Halo%20Admin%20Rumah%20Kita%20Net,%20saya%20ingin%20konsultasi%20terkait%20pembayaran/refund"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
                        >
                            <Phone size={14} />
                            WhatsApp Layanan Refund
                        </a>
                        <a
                            href="mailto:info@rumahkitanet.com"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition"
                        >
                            <Mail size={14} />
                            Kirim Email Pengajuan
                        </a>
                    </div>
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
                                <li><a href="/terms-and-conditions" className="hover:text-emerald-400 transition">Syarat &amp; Ketentuan</a></li>
                                <li><a href="/refund-policy" className="text-emerald-400 font-semibold">Kebijakan Pengembalian (Refund)</a></li>
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

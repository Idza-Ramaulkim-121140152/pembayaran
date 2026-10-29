import React, { useState, useEffect } from 'react';
import { 
    Send, CheckCircle, AlertTriangle, Clock, Calendar, 
    Smartphone, FileText, TrendingUp, AlertCircle, RefreshCw, 
    ShieldCheck, BellRing, DollarSign
} from 'lucide-react';
import axios from 'axios';

export default function ExecutiveReportsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingType, setTestingType] = useState(null);
    const [feedback, setFeedback] = useState(null);

    const [form, setForm] = useState({
        recipients: '',
        daily_enabled: true,
        daily_time: '21:00',
        obligation_enabled: true,
        obligation_days_ahead: 3,
        monthly_pnl_enabled: true,
    });

    const [testPhone, setTestPhone] = useState('');
    const [previewDaily, setPreviewDaily] = useState('');
    const [previewMonthly, setPreviewMonthly] = useState('');
    const [activeTab, setActiveTab] = useState('daily');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/settings/executive-reports');
            if (res.data.success) {
                const d = res.data.data;
                setForm({
                    recipients: d.recipients_raw || (d.recipients || []).join(', '),
                    daily_enabled: d.daily_enabled,
                    daily_time: d.daily_time || '21:00',
                    obligation_enabled: d.obligation_enabled,
                    obligation_days_ahead: d.obligation_days_ahead || 3,
                    monthly_pnl_enabled: d.monthly_pnl_enabled,
                });
                setPreviewDaily(d.preview_daily || '');
                setPreviewMonthly(d.preview_monthly || '');
                if (d.recipients && d.recipients.length > 0) {
                    setTestPhone(d.recipients[0]);
                }
            }
        } catch (err) {
            console.error('Failed to load executive reports config', err);
            setFeedback({ type: 'error', message: 'Gagal memuat konfigurasi dari server.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setFeedback(null);
            const res = await axios.post('/api/settings/executive-reports', form);
            if (res.data.success) {
                setFeedback({ type: 'success', message: 'Konfigurasi berhasil disimpan.' });
                fetchConfig();
            }
        } catch (err) {
            console.error('Save failed', err);
            setFeedback({ type: 'error', message: err.response?.data?.message || 'Gagal menyimpan konfigurasi.' });
        } finally {
            setSaving(false);
        }
    };

    const handleTestSend = async (type) => {
        try {
            setTestingType(type);
            setFeedback(null);
            const res = await axios.post('/api/settings/executive-reports/test-send', {
                type: type,
                phone: testPhone || undefined,
            });
            if (res.data.success) {
                setFeedback({
                    type: 'success',
                    message: `✅ Pesan uji coba berhasil dikirim ke WhatsApp (${testPhone || 'Nomor Terdaftar'})! Silakan cek HP Anda.`,
                });
            } else {
                setFeedback({
                    type: 'error',
                    message: res.data.message || 'Pengiriman uji coba gagal.',
                });
            }
        } catch (err) {
            console.error('Test send failed', err);
            setFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Terjadi kesalahan saat mengirim pesan uji coba.',
            });
        } finally {
            setTestingType(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="ml-3 text-slate-600 font-medium">Memuat pengaturan laporan eksekutif...</span>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="w-7 h-7 text-emerald-600" />
                        Laporan Eksekutif WhatsApp untuk Owner
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Otomasi pengawasan keuangan, kewajiban sewa upstream, dan kesehatan operasional Rumah Kita Network langsung ke WhatsApp pribadi Anda.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Autonomous Reporting Active
                    </span>
                </div>
            </div>

            {/* Alert Feedback */}
            {feedback && (
                <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                    feedback.type === 'success' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                    {feedback.type === 'success' ? (
                        <CheckCircle className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" />
                    ) : (
                        <AlertTriangle className="w-5 h-5 mt-0.5 text-rose-600 shrink-0" />
                    )}
                    <span className="text-sm font-medium">{feedback.message}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form Pengaturan (7 Cols) */}
                <div className="lg:col-span-7 space-y-6">
                    <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                        {/* Nomor WhatsApp Penerima */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-800 flex items-center gap-2">
                                <Smartphone className="w-4 h-4 text-emerald-600" />
                                Nomor WhatsApp Penerima Laporan
                            </label>
                            <input
                                type="text"
                                value={form.recipients}
                                onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                                placeholder="Contoh: 085158025553, 081234567890"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono"
                            />
                            <p className="text-xs text-slate-500">
                                Masukkan nomor WhatsApp Owner / Pemilik. Bisa memasukkan lebih dari 1 nomor dipisahkan dengan tanda koma (misal: nomor Owner dan Bendahara).
                            </p>
                        </div>

                        <hr className="border-slate-100" />

                        {/* Modul 1: Laporan Harian Malam */}
                        <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Clock className="w-5 h-5 text-indigo-600" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-800">1. Laporan Harian Tutup Buku (Malam)</h3>
                                        <p className="text-xs text-slate-500">Rekap kas masuk, pengeluaran, tagihan lunas/pending, isolir, dan router MikroTik.</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={form.daily_enabled} 
                                        onChange={(e) => setForm({ ...form, daily_enabled: e.target.checked })} 
                                        className="sr-only peer" 
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                </label>
                            </div>
                            {form.daily_enabled && (
                                <div className="pt-2 flex items-center justify-between gap-4 border-t border-slate-200/60 mt-2">
                                    <div className="text-xs text-slate-600 font-medium">Jam Pengiriman Otomatis:</div>
                                    <input 
                                        type="time" 
                                        value={form.daily_time} 
                                        onChange={(e) => setForm({ ...form, daily_time: e.target.value })}
                                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Modul 2: Pengingat Kewajiban Kas (H-3 & H-1) */}
                        <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <BellRing className="w-5 h-5 text-amber-600" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-800">2. Pengingat Kewajiban Kas & Upstream (H-3/H-1)</h3>
                                        <p className="text-xs text-slate-500">Peringatan dini jatuh tempo sewa upstream, listrik server, dan sewa tiang dengan analisa kesiapan kas.</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={form.obligation_enabled} 
                                        onChange={(e) => setForm({ ...form, obligation_enabled: e.target.checked })} 
                                        className="sr-only peer" 
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                </label>
                            </div>
                            {form.obligation_enabled && (
                                <div className="pt-2 flex items-center justify-between gap-4 border-t border-slate-200/60 mt-2">
                                    <div className="text-xs text-slate-600 font-medium">Kirim Pengingat Berapa Hari Sebelum Jatuh Tempo:</div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="7" 
                                            value={form.obligation_days_ahead} 
                                            onChange={(e) => setForm({ ...form, obligation_days_ahead: Number(e.target.value) })}
                                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-semibold bg-white"
                                        />
                                        <span>Hari (H-3)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modul 3: Laporan Tutup Buku Bulanan */}
                        <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <FileText className="w-5 h-5 text-emerald-600" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-800">3. Laporan Tutup Buku Laba-Rugi Bulanan</h3>
                                        <p className="text-xs text-slate-500">Dikirim tiap tanggal 1 pukul 08:00 WIB: pendapatan kotor, beban operasional, laba bersih, & margin.</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={form.monthly_pnl_enabled} 
                                        onChange={(e) => setForm({ ...form, monthly_pnl_enabled: e.target.checked })} 
                                        className="sr-only peer" 
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                </label>
                            </div>
                        </div>

                        {/* Tombol Simpan */}
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {saving ? 'Menyimpan Pengaturan...' : 'Simpan Semua Pengaturan'}
                            </button>
                        </div>
                    </form>

                    {/* Kotak Uji Coba Pengiriman Instan */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                            <Send className="w-4 h-4 text-blue-600" />
                            Uji Coba Kirim Instan ke WhatsApp
                        </div>
                        <p className="text-xs text-slate-500">
                            Ingin melihat format pesan langsung di WhatsApp Anda sekarang tanpa menunggu jam jadwal? Masukkan nomor HP dan klik tombol uji coba:
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={testPhone}
                                onChange={(e) => setTestPhone(e.target.value)}
                                placeholder="Nomor WhatsApp (misal: 085158025553)"
                                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                            <button
                                type="button"
                                disabled={testingType !== null}
                                onClick={() => handleTestSend('daily')}
                                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {testingType === 'daily' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5 text-indigo-600" />}
                                Test Laporan Harian
                            </button>
                            <button
                                type="button"
                                disabled={testingType !== null}
                                onClick={() => handleTestSend('obligation')}
                                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {testingType === 'obligation' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5 text-amber-600" />}
                                Test Pengingat Kas
                            </button>
                            <button
                                type="button"
                                disabled={testingType !== null}
                                onClick={() => handleTestSend('monthly')}
                                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {testingType === 'monthly' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-emerald-600" />}
                                Test P&L Bulanan
                            </button>
                        </div>
                    </div>
                </div>

                {/* Pratinjau Pesan Mockup WhatsApp (5 Cols) */}
                <div className="lg:col-span-5 space-y-4">
                    <div className="bg-[#e5ddd5] dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Smartphone className="w-4 h-4 text-emerald-700" />
                                Pratinjau Tampilan di WhatsApp
                            </span>
                            <div className="flex gap-1 text-[11px] font-semibold bg-white/60 dark:bg-slate-700 p-1 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('daily')}
                                    className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'daily' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
                                >
                                    Harian
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('monthly')}
                                    className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'monthly' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
                                >
                                    Bulanan
                                </button>
                            </div>
                        </div>

                        {/* WhatsApp Bubble Card */}
                        <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-800 dark:text-slate-100 p-4 rounded-2xl rounded-tl-none shadow text-[13px] leading-relaxed font-mono whitespace-pre-wrap max-h-[560px] overflow-y-auto">
                            {activeTab === 'daily' ? (previewDaily || 'Memuat pratinjau data harian...') : (previewMonthly || 'Memuat pratinjau data bulanan...')}
                        </div>

                        <div className="text-[11px] text-slate-600 dark:text-slate-400 text-center">
                            Data di atas diambil langsung secara realtime dari pembukuan dan status server hari ini.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

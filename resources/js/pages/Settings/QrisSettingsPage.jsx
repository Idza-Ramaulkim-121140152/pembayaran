import { useState, useEffect } from 'react';
import {
    QrCode,
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Shield,
    Key,
    Server,
    Copy,
    Check,
    Send,
    Eye,
    EyeOff,
    Terminal,
    Smartphone,
    Layers,
    FileText,
    HelpCircle,
    Info,
    ChevronDown,
    ChevronUp,
    Sparkles,
    CheckCircle,
    XCircle,
    Clock
} from 'lucide-react';
import apiClient from '../../services/api';

export default function QrisSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    // Config & Stats State
    const [data, setData] = useState(null);
    const [showSecret, setShowSecret] = useState(false);
    const [copiedField, setCopiedField] = useState(null);

    // Form State
    const [form, setForm] = useState({
        webhook_secret: '',
        static_payload: '',
        unique_code_min: 101,
        unique_code_max: 499,
        expiration_hours: 3,
    });
    const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
    const [saveErrorMsg, setSaveErrorMsg] = useState('');

    // Tester State
    const [testInput, setTestInput] = useState('Pembayaran QRIS sebesar Rp 150.234 telah berhasil diterima dari BUDI SANTOSO. Ref: GOPAY123456');
    const [testResult, setTestResult] = useState(null);
    const [showGuide, setShowGuide] = useState(true);

    const loadSettings = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await apiClient.get('/api/settings/qris');
            setData(res.data);
            setForm({
                webhook_secret: res.data.webhook_secret || '',
                static_payload: res.data.static_payload || '',
                unique_code_min: res.data.unique_code_min || 101,
                unique_code_max: res.data.unique_code_max || 499,
                expiration_hours: res.data.expiration_hours || 3,
            });
        } catch (err) {
            console.error('Failed to load QRIS settings:', err);
        } finally {
            setLoading(false);
            if (isManual) setRefreshing(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const copyToClipboard = (text, fieldName) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2500);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaveSuccessMsg('');
        setSaveErrorMsg('');

        try {
            await apiClient.post('/api/settings/qris', form);
            setSaveSuccessMsg('Konfigurasi QRIS Dinamis berhasil disimpan.');
            await loadSettings();
            setTimeout(() => setSaveSuccessMsg(''), 4000);
        } catch (err) {
            setSaveErrorMsg(err.response?.data?.message || 'Gagal menyimpan pengaturan.');
        } finally {
            setSaving(false);
        }
    };

    const handleTestParser = async () => {
        if (!testInput.trim()) return;
        setTesting(true);
        setTestResult(null);

        try {
            const res = await apiClient.post('/api/settings/qris/test-parser', {
                text: testInput,
            });
            setTestResult(res.data);
        } catch (err) {
            setTestResult({
                error: err.response?.data?.message || 'Gagal memproses simulasi parser.',
            });
        } finally {
            setTesting(false);
        }
    };

    const formatRupiah = (num) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);
    };

    if (loading) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl flex items-center gap-3">
                        <QrCode className="h-8 w-8 text-emerald-600" />
                        QRIS Dinamis & Webhook Listener (GoBiz)
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Otomasi verifikasi pembayaran QRIS mandiri secara realtime via aplikasi MacroDroid di HP Android.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => loadSettings(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Segarkan
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Notif Hari Ini</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            <Server className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-gray-900">{data?.stats?.today_total || 0}</p>
                    <p className="mt-1 text-xs text-gray-400">Panggilan webhook diterima</p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Lunas Otomatis</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-emerald-600">{data?.stats?.today_settled || 0} Trx</p>
                    <p className="mt-1 text-xs text-emerald-700 font-medium">{formatRupiah(data?.stats?.today_settled_amount || 0)}</p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Duplikat Multi-HP Dicegah</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                            <Layers className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-indigo-600">{data?.stats?.today_duplicates_ignored || 0}</p>
                    <p className="mt-1 text-xs text-gray-400">Atomic lock deduplikasi aman</p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Unmatched / Kadaluarsa</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-amber-600">{data?.stats?.today_unmatched || 0}</p>
                    <p className="mt-1 text-xs text-gray-400">Tidak ada tagihan cocok</p>
                </div>
            </div>

            {/* MacroDroid Setup Guide Card */}
            <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                            <Smartphone className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Panduan Pemasangan di HP Android (MacroDroid)</h2>
                            <p className="text-xs text-gray-500">Hanya perlu 3 menit setting di HP yang menerima notifikasi GoBiz.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowGuide(!showGuide)}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                    >
                        {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        {showGuide ? 'Sembunyikan Panduan' : 'Buka Panduan'}
                    </button>
                </div>

                {showGuide && (
                    <div className="space-y-4 pt-2">
                        {/* URL & Secret Banner */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">1. URL Webhook Server Anda</span>
                                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-2.5 font-mono text-xs text-gray-800 break-all">
                                    <span>{data?.webhook_url}</span>
                                    <button
                                        onClick={() => copyToClipboard(data?.webhook_url, 'url')}
                                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 flex items-center gap-1"
                                    >
                                        {copiedField === 'url' ? <Check size={14} /> : <Copy size={14} />}
                                        {copiedField === 'url' ? 'Tersalin' : 'Salin URL'}
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">2. Secret Key Header (X-QRIS-SECRET)</span>
                                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-2.5 font-mono text-xs text-gray-800">
                                    <span>{showSecret ? data?.webhook_secret : '••••••••••••••••••••'}</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowSecret(!showSecret)}
                                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200"
                                            title="Tampilkan / Sembunyikan"
                                        >
                                            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                        <button
                                            onClick={() => copyToClipboard(data?.webhook_secret, 'secret')}
                                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 flex items-center gap-1"
                                        >
                                            {copiedField === 'secret' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedField === 'secret' ? 'Tersalin' : 'Salin'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step By Step Instructions */}
                        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4 text-xs text-emerald-950 space-y-2">
                            <p className="font-bold text-sm text-emerald-900 flex items-center gap-2">
                                <Sparkles size={16} className="text-emerald-600" />
                                Langkah Konfigurasi MacroDroid di HP Android:
                            </p>
                            <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                                <li>Download dan buka aplikasi <b>MacroDroid</b> dari Google Play Store.</li>
                                <li>Klik <b>Tambah Makro</b> (Add Macro). Beri nama misalnya: <code>GoBiz QRIS Listener</code>.</li>
                                <li>
                                    <b>Pemicu (Trigger):</b> Klik ikon <b>(+) Merah</b> &rarr; pilih <b>Aplikasi</b> &rarr; <b>Notifikasi</b> &rarr; <b>Notifikasi Diterima</b> &rarr; Pilih aplikasi: <b>GoBiz</b> (atau GoPay Merchant).
                                </li>
                                <li>
                                    <b>Tindakan (Action):</b> Klik ikon <b>(+) Biru</b> &rarr; pilih <b>Konektivitas</b> &rarr; <b>Permintaan HTTP (HTTP Request)</b>:
                                    <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5 text-gray-700">
                                        <li>Metode Permintaan: <b>POST</b></li>
                                        <li>URL: <code>{data?.webhook_url}</code></li>
                                        <li>Tipe Konten: <code>application/json</code></li>
                                        <li>Header Header Permintaan: Tambahkan <code>X-QRIS-SECRET: {data?.webhook_secret}</code></li>
                                        <li>Body Teks:
                                            <pre className="mt-1 p-2 rounded-lg bg-gray-900 text-emerald-400 font-mono text-[11px] overflow-x-auto">
{`{
  "title": "[notif_title]",
  "text": "[notif_message]",
  "device_name": "[device_model]"
}`}
                                            </pre>
                                        </li>
                                    </ul>
                                </li>
                                <li>Simpan makro. Pastikan izin notifikasi dan optimasi baterai untuk MacroDroid diaktifkan (Jangan Batasi Baterai).</li>
                            </ol>
                            <div className="mt-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2">
                                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                                <span>
                                    <b>Siap Tambah HP Kedua/Ketiga:</b> Jika nanti Anda ingin memasang di HP admin lain, ulangi saja langkah di atas. Sistem kami sudah memiliki <i>Atomic Concurrency Lock</i>, sehingga notifikasi ganda dari beberapa HP yang masuk bersamaan otomatis dicegah & hanya diproses 1 kali.
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Settings Form & Parser Tester (2 Columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* QRIS & Webhook Parameters Form */}
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                        <Key className="h-5 w-5 text-indigo-600" />
                        Konfigurasi QRIS & Keamanan
                    </h2>

                    {saveSuccessMsg && (
                        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                            <CheckCircle size={16} className="text-emerald-600" />
                            {saveSuccessMsg}
                        </div>
                    )}
                    {saveErrorMsg && (
                        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-800 flex items-center gap-2">
                            <XCircle size={16} className="text-red-600" />
                            {saveErrorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                Webhook Secret Token
                            </label>
                            <input
                                type="text"
                                value={form.webhook_secret}
                                onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                                className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="rknet-secret-qris-key"
                            />
                            <p className="mt-1 text-[11px] text-gray-400">Digunakan untuk otentikasi header X-QRIS-SECRET dari MacroDroid.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                String QRIS Statis GoPay (EMVCo Payload)
                            </label>
                            <textarea
                                rows={3}
                                value={form.static_payload}
                                onChange={(e) => setForm({ ...form, static_payload: e.target.value })}
                                className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-xs font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="000201010211..."
                            />
                            <p className="mt-1 text-[11px] text-gray-400">
                                Payload asli dari stiker/aplikasi QRIS GoPay Merchant Rumah Kita Net (NMID: ID1024339131558).
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                    Rentang Kode Unik (Min)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={form.unique_code_min}
                                    onChange={(e) => setForm({ ...form, unique_code_min: parseInt(e.target.value) || 101 })}
                                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                    Rentang Kode Unik (Max)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={form.unique_code_max}
                                    onChange={(e) => setForm({ ...form, unique_code_max: parseInt(e.target.value) || 499 })}
                                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                Masa Berlaku QRIS Dinamis (Jam)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={24}
                                value={form.expiration_hours}
                                onChange={(e) => setForm({ ...form, expiration_hours: parseInt(e.target.value) || 3 })}
                                className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <p className="mt-1 text-[11px] text-gray-400">Setelah masa berlaku habis, invoice dapat di-regenerate kode unik baru.</p>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 transition disabled:opacity-50"
                            >
                                {saving ? 'Menyimpan...' : 'Simpan Konfigurasi QRIS'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Notification Parser Live Test Tool */}
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
                            <Terminal className="h-5 w-5 text-emerald-600" />
                            Uji Coba Teks Notifikasi GoBiz (Simulator)
                        </h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Uji apakah format teks notifikasi yang Anda terima di HP dapat diekstrak nominal dan dicocokkan ke tagihan.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                    Teks Notifikasi
                                </label>
                                <textarea
                                    rows={3}
                                    value={testInput}
                                    onChange={(e) => setTestInput(e.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Tempel teks notifikasi GoBiz..."
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleTestParser}
                                disabled={testing || !testInput.trim()}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                                <Send size={14} className={testing ? 'animate-spin' : ''} />
                                {testing ? 'Memproses...' : 'Uji Parsing & Cek Match'}
                            </button>
                        </div>

                        {/* Test Results Output */}
                        {testResult && (
                            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs space-y-3">
                                {testResult.error ? (
                                    <div className="text-red-600 font-semibold">{testResult.error}</div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <span className="text-gray-400">Nominal Terekstrak:</span>
                                                <p className="font-bold text-sm text-emerald-700">
                                                    {testResult.parsed?.amount ? formatRupiah(testResult.parsed.amount) : 'Tidak terdeteksi'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Nama Pengirim:</span>
                                                <p className="font-bold text-gray-800">{testResult.parsed?.sender || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">No. Referensi:</span>
                                                <p className="font-mono text-gray-800">{testResult.parsed?.reference_code || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Status Pencocokan:</span>
                                                <p className={`font-bold ${testResult.matching_invoice ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                    {testResult.matching_invoice ? 'Ditemukan Tagihan Cocok' : 'Belum Ada Tagihan Cocok'}
                                                </p>
                                            </div>
                                        </div>

                                        {testResult.matching_invoice && (
                                            <div className="p-3 rounded-xl bg-emerald-100/70 border border-emerald-200 text-emerald-900">
                                                <p className="font-bold">Detail Tagihan:</p>
                                                <p>No. Invoice: <b>{testResult.matching_invoice.invoice_link}</b></p>
                                                <p>Pelanggan: <b>{testResult.matching_invoice.customer_name}</b></p>
                                                <p>Status Saat Ini: <b>{testResult.matching_invoice.status}</b></p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Realtime Webhook Logs Table */}
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-600" />
                            Riwayat Log Webhook Masuk
                        </h2>
                        <p className="text-xs text-gray-500">20 notifikasi pembayaran terbaru yang dikirimkan oleh MacroDroid.</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-600">
                        <thead className="border-b border-gray-100 bg-gray-50/50 text-gray-400 uppercase font-semibold">
                            <tr>
                                <th className="px-4 py-3">Waktu</th>
                                <th className="px-4 py-3">Perangkat</th>
                                <th className="px-4 py-3">Teks Notifikasi</th>
                                <th className="px-4 py-3">Nominal</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Invoice Terkait</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(!data?.recent_logs || data.recent_logs.length === 0) ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-gray-400">
                                        Belum ada riwayat notifikasi webhook yang diterima.
                                    </td>
                                </tr>
                            ) : (
                                data.recent_logs.map((log) => {
                                    let badgeColor = 'bg-gray-100 text-gray-700';
                                    let label = log.status;
                                    if (log.status === 'settled') {
                                        badgeColor = 'bg-emerald-100 text-emerald-800';
                                        label = 'Lunas Otomatis';
                                    } else if (log.status === 'duplicate_ignored') {
                                        badgeColor = 'bg-blue-100 text-blue-800';
                                        label = 'Duplikat (Aman)';
                                    } else if (log.status === 'unmatched') {
                                        badgeColor = 'bg-amber-100 text-amber-800';
                                        label = 'Unmatched';
                                    } else if (log.status === 'invalid_payload') {
                                        badgeColor = 'bg-red-100 text-red-800';
                                        label = 'Format Tidak Valid';
                                    }

                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50/80 transition">
                                            <td className="px-4 py-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                                                {new Date(log.created_at).toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">
                                                {log.device_name}
                                            </td>
                                            <td className="px-4 py-3 max-w-xs truncate" title={log.raw_text || log.raw_title}>
                                                <span className="font-medium text-gray-900">{log.raw_title}</span>
                                                {log.raw_title && log.raw_text && <br />}
                                                <span className="text-gray-500">{log.raw_text}</span>
                                            </td>
                                            <td className="px-4 py-3 font-mono font-bold text-gray-900 whitespace-nowrap">
                                                {log.extracted_amount ? formatRupiah(log.extracted_amount) : '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold ${badgeColor}`}>
                                                    {label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {log.invoice ? (
                                                    <a
                                                        href={`/invoice/${log.invoice.invoice_link}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-mono text-indigo-600 hover:underline font-semibold"
                                                    >
                                                        {log.invoice.invoice_link}
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

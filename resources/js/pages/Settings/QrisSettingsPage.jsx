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
    Clock,
    Scale,
    BellRing,
    PlusCircle,
    Trash2,
    Banknote,
    Calendar
} from 'lucide-react';
import apiClient from '../../services/api';

export default function QrisSettingsPage() {
    const [activeTab, setActiveTab] = useState(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('tab') === 'reconciliation' ? 'reconciliation' : 'webhook';
        }
        return 'webhook';
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    // Config & Stats State
    const [data, setData] = useState(null);
    const [showSecret, setShowSecret] = useState(false);
    const [copiedField, setCopiedField] = useState(null);

    // Reconciliation State
    const [reconData, setReconData] = useState(null);
    const [reconDate, setReconDate] = useState('');
    const [reconSaving, setReconSaving] = useState(false);
    const [reconRunning, setReconRunning] = useState(false);
    const [reconAlertTesting, setReconAlertTesting] = useState(false);
    const [reconFeedback, setReconFeedback] = useState(null);
    const [reconTestPhone, setReconTestPhone] = useState('');
    const [reconConfigForm, setReconConfigForm] = useState({
        enabled: true,
        cutoff_time: '21:00',
        check_time: '21:15',
        grace_minutes: 30,
        mdr_percent: 0,
        payout_fee: 0,
        tolerance_amount: 0,
        include_owner_recipients: true,
        alert_recipients_raw: '',
    });
    const [manualSettlementForm, setManualSettlementForm] = useState({
        amount: '',
        settled_at: '',
        settlement_type: 'manual',
        reference_code: '',
        notes: '',
    });
    const [manualSettlementSaving, setManualSettlementSaving] = useState(false);

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
    const [testTitle, setTestTitle] = useState('');
    const [testInput, setTestInput] = useState('Pembayaran QRIS sebesar Rp 150.234 telah berhasil diterima dari BUDI SANTOSO. Ref: GOPAY123456');
    const [testResult, setTestResult] = useState(null);
    const [showGuide, setShowGuide] = useState(true);

    const loadReconciliation = async (targetDate = reconDate) => {
        try {
            const params = targetDate ? { cycle_date: targetDate } : {};
            const res = await apiClient.get('/settings/qris/reconciliation', { params });
            const payload = res.data?.data;
            if (payload) {
                setReconData(payload);
                const cfg = payload.config || {};
                setReconConfigForm({
                    enabled: cfg.enabled !== false,
                    cutoff_time: cfg.cutoff_time || '21:00',
                    check_time: cfg.check_time || '21:15',
                    grace_minutes: cfg.grace_minutes ?? 30,
                    mdr_percent: cfg.mdr_percent ?? 0,
                    payout_fee: cfg.payout_fee ?? 0,
                    tolerance_amount: cfg.tolerance_amount ?? 0,
                    include_owner_recipients: cfg.include_owner_recipients !== false,
                    alert_recipients_raw: cfg.alert_recipients_raw || '',
                });
                if (!targetDate && payload.current_cycle?.cycle_date) {
                    setReconDate(String(payload.current_cycle.cycle_date).slice(0, 10));
                }
            }
        } catch (err) {
            console.error('Failed to load QRIS reconciliation:', err);
        }
    };

    const loadSettings = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const [res] = await Promise.all([
                apiClient.get('/settings/qris'),
                loadReconciliation(),
            ]);
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
            await apiClient.post('/settings/qris', form);
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
            const res = await apiClient.post('/settings/qris/test-parser', {
                title: testTitle || undefined,
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

    const handleSaveReconConfig = async (e) => {
        e.preventDefault();
        setReconSaving(true);
        setReconFeedback(null);
        try {
            const res = await apiClient.post('/settings/qris/reconciliation/config', reconConfigForm);
            setReconFeedback({
                type: 'success',
                message: res.data?.message || 'Pengaturan rekonsiliasi QRIS berhasil disimpan.',
            });
            await loadReconciliation();
        } catch (err) {
            setReconFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Gagal menyimpan pengaturan rekonsiliasi QRIS.',
            });
        } finally {
            setReconSaving(false);
        }
    };

    const handleRunReconciliation = async (targetCycleDate = reconDate, sendAlert = true, forceAlert = false) => {
        setReconRunning(true);
        setReconFeedback(null);
        try {
            const res = await apiClient.post('/settings/qris/reconciliation/run', {
                cycle_date: targetCycleDate || undefined,
                send_alert: sendAlert,
                force_alert: forceAlert,
            });
            const rec = res.data?.data;
            const alertRes = res.data?.alert_result;
            let msg = `Rekonsiliasi siklus ${String(rec?.cycle_date || targetCycleDate).slice(0, 10)} selesai (${rec?.status}).`;
            if (alertRes?.sent) {
                msg += ` Alert WA selisih terkirim ke ${alertRes.recipients_count} penerima.`;
            } else if (rec?.status === 'mismatch' && alertRes?.reason === 'already_alerted_same_discrepancy') {
                msg += ' Alert WA dengan nilai selisih ini sudah pernah dikirim sebelumnya.';
            } else if (rec?.status === 'mismatch' && alertRes?.reason === 'no_recipients') {
                msg += ' Belum ada nomor WA penerima yang terkonfigurasi.';
            }
            setReconFeedback({
                type: rec?.status === 'mismatch' ? 'warning' : 'success',
                message: msg,
            });
            await loadReconciliation(targetCycleDate);
        } catch (err) {
            setReconFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Gagal menjalankan rekonsiliasi QRIS.',
            });
        } finally {
            setReconRunning(false);
        }
    };

    const handleStoreManualSettlement = async (e) => {
        e.preventDefault();
        if (!manualSettlementForm.amount || Number(manualSettlementForm.amount) <= 0) return;
        setManualSettlementSaving(true);
        setReconFeedback(null);
        try {
            await apiClient.post('/settings/qris/reconciliation/settlements', {
                amount: Number(manualSettlementForm.amount),
                settled_at: manualSettlementForm.settled_at || undefined,
                cycle_date: reconDate || undefined,
                settlement_type: manualSettlementForm.settlement_type,
                reference_code: manualSettlementForm.reference_code || undefined,
                notes: manualSettlementForm.notes || undefined,
            });
            setManualSettlementForm({
                amount: '',
                settled_at: '',
                settlement_type: 'manual',
                reference_code: '',
                notes: '',
            });
            setReconFeedback({
                type: 'success',
                message: 'Pencairan dana manual berhasil ditambahkan dan langsung direkonsiliasi.',
            });
            await loadReconciliation();
        } catch (err) {
            setReconFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Gagal menyimpan catatan pencairan manual.',
            });
        } finally {
            setManualSettlementSaving(false);
        }
    };

    const handleDeleteSettlement = async (settlementId) => {
        if (!window.confirm('Hapus catatan pencairan GoPay ini dan hitung ulang rekonsiliasi?')) return;
        setReconFeedback(null);
        try {
            await apiClient.delete(`/settings/qris/reconciliation/settlements/${settlementId}`);
            setReconFeedback({
                type: 'success',
                message: 'Catatan pencairan dihapus dan siklus dihitung ulang.',
            });
            await loadReconciliation();
        } catch (err) {
            setReconFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Gagal menghapus catatan pencairan.',
            });
        }
    };

    const handleTestReconAlert = async () => {
        setReconAlertTesting(true);
        setReconFeedback(null);
        try {
            const res = await apiClient.post('/settings/qris/reconciliation/test-alert', {
                phone: reconTestPhone.trim() || undefined,
            });
            setReconFeedback({
                type: 'success',
                message: res.data?.message || 'Pesan uji coba alert WA berhasil dikirim.',
            });
        } catch (err) {
            setReconFeedback({
                type: 'error',
                message: err.response?.data?.message || 'Gagal mengirim uji coba alert WA.',
            });
        } finally {
            setReconAlertTesting(false);
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

            {/* Tab Switcher */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm">
                <button
                    type="button"
                    onClick={() => setActiveTab('webhook')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeTab === 'webhook'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <QrCode className="h-4 w-4" />
                    Webhook &amp; QRIS Dinamis
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('reconciliation')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeTab === 'reconciliation'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <Scale className="h-4 w-4" />
                    Rekonsiliasi &amp; Pencairan GoPay
                    {reconData?.current_cycle?.status === 'mismatch' && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            Tidak Sesuai
                        </span>
                    )}
                    {reconData?.current_cycle?.status === 'matched' && (
                        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            Sesuai
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'webhook' && (
                <>
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
                                <div className="flex items-center justify-between gap-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                        Judul &amp; Teks Notifikasi
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTestTitle('GoPay Merchant - Transaksi Berhasil');
                                                setTestInput('Pembayaran QRIS sebesar Rp 150.234 telah berhasil diterima dari BUDI SANTOSO. Ref: GOPAY123456');
                                            }}
                                            className="text-[11px] font-semibold text-emerald-700 hover:underline"
                                        >
                                            Contoh Bayar Masuk
                                        </button>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTestTitle('Pencairan dana berhasil');
                                                setTestInput('Proses pencairan dana sebesar Rp350.469 telah selesai. Silakan cek akun bank Anda.');
                                            }}
                                            className="text-[11px] font-semibold text-indigo-700 hover:underline"
                                        >
                                            Contoh Pencairan Dana
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={testTitle}
                                    onChange={(e) => setTestTitle(e.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Judul notifikasi (opsional, misal: Pencairan dana berhasil)"
                                />
                                <textarea
                                    rows={3}
                                    value={testInput}
                                    onChange={(e) => setTestInput(e.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Tempel teks notifikasi GoBiz / GoPay Merchant..."
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
                                                {testResult.parsed?.is_settlement_success ? (
                                                    <p className="font-bold text-indigo-600">
                                                        Notifikasi Pencairan Dana GoPay (Masuk ke Rekonsiliasi, Tidak Melunaskan Tagihan)
                                                    </p>
                                                ) : (
                                                    <p className={`font-bold ${testResult.matching_invoice ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {testResult.matching_invoice ? 'Ditemukan Tagihan Cocok' : 'Belum Ada Tagihan Cocok'}
                                                    </p>
                                                )}
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
                                    } else if (log.status === 'settlement_recorded') {
                                        badgeColor = 'bg-indigo-100 text-indigo-800';
                                        label = 'Pencairan GoPay Dicatat';
                                    } else if (log.status === 'settlement_duplicate_ignored') {
                                        badgeColor = 'bg-sky-100 text-sky-800';
                                        label = 'Pencairan Duplikat (Aman)';
                                    } else if (log.status === 'manual_review_required') {
                                        badgeColor = 'bg-orange-100 text-orange-800';
                                        label = 'Ditahan (Review Manual)';
                                    } else if (log.status === 'ignored_non_payment') {
                                        badgeColor = 'bg-slate-100 text-slate-700';
                                        label = 'Diabaikan (Bukan Bayar Masuk)';
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
                </>
            )}

            {activeTab === 'reconciliation' && (() => {
                const cycle = reconData?.current_cycle || {};
                const cycleMeta = cycle.meta || {};
                const statusMap = {
                    matched: { label: 'Sesuai (Matched)', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                    mismatch: { label: 'Tidak Sesuai (Mismatch)', className: 'bg-red-100 text-red-800 border-red-200' },
                    pending: { label: `Menunggu Cut-off ${reconConfigForm.cutoff_time} WIB`, className: 'bg-amber-100 text-amber-800 border-amber-200' },
                    no_activity: { label: 'Belum Ada Transaksi', className: 'bg-slate-100 text-slate-700 border-slate-200' },
                };
                const cycleStatusMeta = statusMap[cycle.status] || statusMap.pending;
                const discrepancy = Number(cycle.discrepancy_amount || 0);
                const unsyncedList = Array.isArray(cycleMeta.unsynced_paid_qris_invoices) ? cycleMeta.unsynced_paid_qris_invoices : [];

                return (
                    <div className="space-y-6">
                        {reconFeedback && (
                            <div
                                className={`rounded-2xl border p-4 text-sm font-medium flex items-center justify-between gap-3 ${
                                    reconFeedback.type === 'error'
                                        ? 'border-red-200 bg-red-50 text-red-800'
                                        : reconFeedback.type === 'warning'
                                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                }`}
                            >
                                <span>{reconFeedback.message}</span>
                                <button
                                    type="button"
                                    onClick={() => setReconFeedback(null)}
                                    className="text-xs font-bold opacity-70 hover:opacity-100"
                                >
                                    Tutup
                                </button>
                            </div>
                        )}

                        {/* Filter Siklus & Aksi Cepat */}
                        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-bold text-gray-900">
                                        Rekonsiliasi Pendapatan QRIS vs Pencairan GoPay Merchant
                                    </h2>
                                    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold ${cycleStatusMeta.className}`}>
                                        {cycleStatusMeta.label}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Jendela Cut-off: <b>{cycleMeta.period_start_wib || '-'}</b> s/d <b>{cycleMeta.period_end_wib || '-'} WIB</b> (Menggabungkan penarikan manual dini &amp; otomatis jam {reconConfigForm.cutoff_time}).
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                    <Calendar className="h-4 w-4 text-gray-500" />
                                    <input
                                        type="date"
                                        value={reconDate}
                                        onChange={(e) => {
                                            setReconDate(e.target.value);
                                            loadReconciliation(e.target.value);
                                        }}
                                        className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRunReconciliation(reconDate, true, false)}
                                    disabled={reconRunning}
                                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    <RefreshCw className={`h-4 w-4 ${reconRunning ? 'animate-spin' : ''}`} />
                                    {reconRunning ? 'Mencocokkan...' : 'Cek & Rekonsiliasi Sekarang'}
                                </button>
                            </div>
                        </div>

                        {/* Unsynced Paid QRIS Invoices Warning */}
                        {unsyncedList.length > 0 && (
                            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                                <p className="font-bold flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    Ditemukan {unsyncedList.length} Invoice Lunas QRIS Belum Masuk Mutasi Keuangan ({formatRupiah(cycleMeta.unsynced_paid_qris_amount || 0)})
                                </p>
                                <p className="mt-1">
                                    Invoice terkait: {unsyncedList.map((u) => `${u.invoice_link} (${formatRupiah(u.amount)})`).join(', ')}. Periksa menu Rekonsiliasi Center (/rekonsiliasi) untuk sinkronisasi ledger.
                                </p>
                            </div>
                        )}

                        {/* 4 KPI Cards */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Uang Masuk QRIS (Mutasi)</span>
                                <p className="mt-2 text-2xl font-bold text-gray-900">{formatRupiah(cycle.system_qris_gross_amount)}</p>
                                <p className="mt-1 text-xs text-gray-500">{cycle.system_qris_count || 0} transaksi QRIS terkonfirmasi</p>
                            </div>

                            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Ekspektasi Dana Cair</span>
                                <p className="mt-2 text-2xl font-bold text-indigo-700">{formatRupiah(cycle.expected_net_amount)}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                    Potongan MDR + Admin: {formatRupiah(Number(cycle.expected_mdr_fee || 0) + Number(cycle.expected_payout_fee || 0))}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Total Pencairan GoPay</span>
                                <p className="mt-2 text-2xl font-bold text-emerald-700">{formatRupiah(cycle.settled_amount)}</p>
                                <p className="mt-1 text-xs text-gray-500">{cycle.settlement_count || 0}x notifikasi pencairan masuk</p>
                            </div>

                            <div className={`rounded-2xl border p-5 shadow-sm ${
                                cycle.status === 'mismatch'
                                    ? 'border-red-200 bg-red-50/70'
                                    : cycle.status === 'matched'
                                        ? 'border-emerald-200 bg-emerald-50/60'
                                        : 'border-gray-100 bg-white'
                            }`}>
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Selisih Siklus</span>
                                <p className={`mt-2 text-2xl font-bold ${
                                    Math.abs(discrepancy) <= Number(reconConfigForm.tolerance_amount || 0)
                                        ? 'text-emerald-700'
                                        : 'text-red-700'
                                }`}>
                                    {discrepancy > 0 ? '+' : discrepancy < 0 ? '-' : ''}{formatRupiah(Math.abs(discrepancy))}
                                </p>
                                <p className="mt-1 text-xs text-gray-600">
                                    {discrepancy === 0
                                        ? 'Nominal pencairan cocok 100%'
                                        : discrepancy < 0
                                            ? 'Kurang cair / ada notif pencairan belum masuk'
                                            : 'Lebih cair / ada dana QRIS belum tercatat di mutasi'}
                                </p>
                            </div>
                        </div>

                        {/* Settings & Manual Entry Grid */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Pengaturan Rekonsiliasi & WA Alert */}
                            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                                    <BellRing className="h-5 w-5 text-indigo-600" />
                                    Pengaturan Cut-off &amp; Alert WhatsApp
                                </h3>

                                <form onSubmit={handleSaveReconConfig} className="space-y-4">
                                    <label className="flex items-center gap-2.5 text-sm font-semibold text-gray-800 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(reconConfigForm.enabled)}
                                            onChange={(e) => setReconConfigForm({ ...reconConfigForm, enabled: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Aktifkan Pengecekan Otomatis Harian &amp; Alert WhatsApp Selisih
                                    </label>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                Jam Cut-off
                                            </label>
                                            <input
                                                type="time"
                                                value={reconConfigForm.cutoff_time}
                                                onChange={(e) => setReconConfigForm({ ...reconConfigForm, cutoff_time: e.target.value })}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                Jam Cek Alert WA
                                            </label>
                                            <input
                                                type="time"
                                                value={reconConfigForm.check_time}
                                                onChange={(e) => setReconConfigForm({ ...reconConfigForm, check_time: e.target.value })}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                Grace Pencairan (Mnt)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={180}
                                                value={reconConfigForm.grace_minutes}
                                                onChange={(e) => setReconConfigForm({ ...reconConfigForm, grace_minutes: parseInt(e.target.value, 10) || 0 })}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                Potongan MDR (%)
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                max={10}
                                                value={reconConfigForm.mdr_percent}
                                                onChange={(e) => setReconConfigForm({ ...reconConfigForm, mdr_percent: parseFloat(e.target.value) || 0 })}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                Biaya Admin / Cair (Rp)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={reconConfigForm.payout_fee}
                                                onChange={(e) => setReconConfigForm({ ...reconConfigForm, payout_fee: parseInt(e.target.value, 10) || 0 })}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                Toleransi Selisih (Rp)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={reconConfigForm.tolerance_amount}
                                                onChange={(e) => setReconConfigForm({ ...reconConfigForm, tolerance_amount: parseInt(e.target.value, 10) || 0 })}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                            />
                                        </div>
                                    </div>

                                    <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer pt-1">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(reconConfigForm.include_owner_recipients)}
                                            onChange={(e) => setReconConfigForm({ ...reconConfigForm, include_owner_recipients: e.target.checked })}
                                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>
                                            <b>Kirim ke Nomor Owner Laporan Eksekutif</b> (/settings/executive-reports):{' '}
                                            <span className="font-mono text-gray-500">
                                                {(reconData?.config?.owner_recipients || []).map((r) => r.phone).join(', ') || 'Belum ada'}
                                            </span>
                                        </span>
                                    </label>

                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                            Nomor WhatsApp Tambahan Khusus Alert QRIS (Opsional)
                                        </label>
                                        <input
                                            type="text"
                                            value={reconConfigForm.alert_recipients_raw}
                                            onChange={(e) => setReconConfigForm({ ...reconConfigForm, alert_recipients_raw: e.target.value })}
                                            placeholder="Contoh: 081234567890, 085158025553"
                                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <button
                                            type="submit"
                                            disabled={reconSaving}
                                            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            {reconSaving ? 'Menyimpan...' : 'Simpan Pengaturan Rekonsiliasi'}
                                        </button>
                                    </div>
                                </form>

                                {/* Tes Kirim Alert WA */}
                                <div className="mt-5 border-t border-gray-100 pt-4">
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                                        Uji Coba Alert WhatsApp Selisih
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={reconTestPhone}
                                            onChange={(e) => setReconTestPhone(e.target.value)}
                                            placeholder="Kosongkan untuk kirim ke semua penerima terdaftar"
                                            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleTestReconAlert}
                                            disabled={reconAlertTesting}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                        >
                                            <Send className="h-3.5 w-3.5" />
                                            {reconAlertTesting ? 'Mengirim...' : 'Tes Alert WA'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Input Pencairan Manual + Rincian Transaksi */}
                            <div className="space-y-6">
                                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
                                        <Banknote className="h-5 w-5 text-emerald-600" />
                                        Input Pencairan GoPay Manual
                                    </h3>
                                    <p className="text-xs text-gray-500 mb-4">
                                        Gunakan jika HP Android mati sehingga notifikasi <i>Pencairan dana berhasil</i> tidak sempat terkirim oleh MacroDroid.
                                    </p>

                                    <form onSubmit={handleStoreManualSettlement} className="space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                    Nominal Pencairan (Rp) *
                                                </label>
                                                <input
                                                    type="number"
                                                    required
                                                    min={1}
                                                    value={manualSettlementForm.amount}
                                                    onChange={(e) => setManualSettlementForm({ ...manualSettlementForm, amount: e.target.value })}
                                                    placeholder="350469"
                                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                    Jenis Pencairan
                                                </label>
                                                <select
                                                    value={manualSettlementForm.settlement_type}
                                                    onChange={(e) => setManualSettlementForm({ ...manualSettlementForm, settlement_type: e.target.value })}
                                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs"
                                                >
                                                    <option value="manual">Manual / Dini (Sebelum 21:00)</option>
                                                    <option value="auto">Otomatis 21:00 GoPay</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                    Waktu Pencairan (WIB, Opsional)
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={manualSettlementForm.settled_at}
                                                    onChange={(e) => setManualSettlementForm({ ...manualSettlementForm, settled_at: e.target.value })}
                                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                                    Catatan / No. Referensi Bank
                                                </label>
                                                <input
                                                    type="text"
                                                    value={manualSettlementForm.notes}
                                                    onChange={(e) => setManualSettlementForm({ ...manualSettlementForm, notes: e.target.value })}
                                                    placeholder="Misal: Tarik manual pagi jam 06:37"
                                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={manualSettlementSaving || !manualSettlementForm.amount}
                                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            <PlusCircle className="h-4 w-4" />
                                            {manualSettlementSaving ? 'Menyimpan...' : 'Simpan Pencairan Manual'}
                                        </button>
                                    </form>
                                </div>

                                {/* Ringkasan Transaksi QRIS Siklus Ini */}
                                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3">
                                        Rincian Transaksi QRIS Pada Siklus Ini ({(cycleMeta.transactions || []).length} Trx)
                                    </h3>
                                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 text-xs">
                                        {(!cycleMeta.transactions || cycleMeta.transactions.length === 0) ? (
                                            <p className="py-4 text-center text-gray-400">Belum ada transaksi QRIS terkonfirmasi pada rentang siklus ini.</p>
                                        ) : (
                                            cycleMeta.transactions.map((trx) => (
                                                <div key={trx.id} className="py-2 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-gray-800 truncate">{trx.description}</p>
                                                        <p className="text-[11px] text-gray-400">
                                                            {trx.occurred_at_wib} WIB &bull; {trx.received_via || trx.confirmation_via}
                                                        </p>
                                                    </div>
                                                    <span className="font-mono font-bold text-gray-900 shrink-0">
                                                        {formatRupiah(trx.qris_cash_amount)}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Riwayat Rekonsiliasi Harian */}
                        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">Riwayat Rekonsiliasi Harian (Per Siklus Cut-off)</h3>
                            <p className="text-xs text-gray-500 mb-4">Perbandingan harian antara Mutasi QRIS perusahaan dan total pencairan GoPay Merchant.</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-gray-600">
                                    <thead className="border-b border-gray-100 bg-gray-50/70 text-gray-500 uppercase font-semibold">
                                        <tr>
                                            <th className="px-4 py-3">Siklus Tanggal</th>
                                            <th className="px-4 py-3">QRIS Mutasi</th>
                                            <th className="px-4 py-3">Ekspektasi Cair</th>
                                            <th className="px-4 py-3">Pencairan GoPay</th>
                                            <th className="px-4 py-3">Selisih</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Alert WA</th>
                                            <th className="px-4 py-3">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(!reconData?.recent_reconciliations || reconData.recent_reconciliations.length === 0) ? (
                                            <tr>
                                                <td colSpan={8} className="py-6 text-center text-gray-400">Belum ada data rekonsiliasi harian.</td>
                                            </tr>
                                        ) : (
                                            reconData.recent_reconciliations.map((row) => {
                                                const st = statusMap[row.status] || statusMap.pending;
                                                const rowDiff = Number(row.discrepancy_amount || 0);
                                                const rowDate = String(row.cycle_date || '').slice(0, 10);
                                                return (
                                                    <tr key={row.id} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-mono font-semibold text-gray-900">{rowDate}</td>
                                                        <td className="px-4 py-3 font-mono">
                                                            {formatRupiah(row.system_qris_gross_amount)} <span className="text-gray-400">({row.system_qris_count})</span>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono">{formatRupiah(row.expected_net_amount)}</td>
                                                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                                                            {formatRupiah(row.settled_amount)} <span className="text-gray-400">({row.settlement_count}x)</span>
                                                        </td>
                                                        <td className={`px-4 py-3 font-mono font-bold ${Math.abs(rowDiff) < 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                            {rowDiff > 0 ? '+' : rowDiff < 0 ? '-' : ''}{formatRupiah(Math.abs(rowDiff))}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${st.className}`}>
                                                                {st.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-[11px] text-gray-500">
                                                            {row.alert_sent_at ? new Date(row.alert_sent_at).toLocaleString('id-ID') : '-'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRunReconciliation(rowDate, true, true)}
                                                                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                                            >
                                                                Cek Ulang
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Riwayat Pencairan Dana GoPay Merchant */}
                        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">Log Pencairan Dana GoPay Merchant</h3>
                            <p className="text-xs text-gray-500 mb-4">Daftar pencairan manual maupun otomatis jam {reconConfigForm.cutoff_time} yang tercatat dari notifikasi Android atau input manual.</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-gray-600">
                                    <thead className="border-b border-gray-100 bg-gray-50/70 text-gray-500 uppercase font-semibold">
                                        <tr>
                                            <th className="px-4 py-3">Waktu Cair (WIB)</th>
                                            <th className="px-4 py-3">Siklus</th>
                                            <th className="px-4 py-3">Tipe</th>
                                            <th className="px-4 py-3">Sumber</th>
                                            <th className="px-4 py-3">Nominal</th>
                                            <th className="px-4 py-3">Perangkat / Catatan</th>
                                            <th className="px-4 py-3">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(!reconData?.recent_settlements || reconData.recent_settlements.length === 0) ? (
                                            <tr>
                                                <td colSpan={7} className="py-6 text-center text-gray-400">Belum ada notifikasi pencairan GoPay Merchant yang tercatat.</td>
                                            </tr>
                                        ) : (
                                            reconData.recent_settlements.map((s) => (
                                                <tr key={s.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap">{s.settled_at_wib || '-'}</td>
                                                    <td className="px-4 py-3 font-mono font-semibold">{s.cycle_date}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                                            s.settlement_type === 'auto' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {s.settlement_type === 'auto' ? 'Otomatis' : 'Manual'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 uppercase text-[11px] font-semibold text-gray-500">{s.source}</td>
                                                    <td className="px-4 py-3 font-mono font-bold text-emerald-700 whitespace-nowrap">{formatRupiah(s.amount)}</td>
                                                    <td className="px-4 py-3 max-w-xs truncate" title={s.raw_text || s.notes}>
                                                        <span className="font-semibold text-gray-800">{s.device_name || '-'}</span>
                                                        {(s.raw_text || s.notes) && (
                                                            <span className="block text-[11px] text-gray-500 truncate">{s.raw_text || s.notes}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteSettlement(s.id)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                                                            title="Hapus entri pencairan ini"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Hapus
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

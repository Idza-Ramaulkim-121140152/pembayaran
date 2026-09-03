import { useState, useEffect } from 'react';
import {
    CreditCard,
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Shield,
    Key,
    Server,
    ExternalLink,
    Copy,
    Check,
    Send,
    Eye,
    EyeOff,
    Terminal,
    QrCode,
    Smartphone,
    Globe,
    FileText,
    HelpCircle,
    Info,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import apiClient from '../../services/api';

export default function IpaymuIntegrationPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    // Status & Config State
    const [statusData, setStatusData] = useState(null);
    const [showApiKey, setShowApiKey] = useState(false);
    const [copiedField, setCopiedField] = useState(null);

    // Edit Form State
    const [configForm, setConfigForm] = useState({
        va: '',
        api_key: '',
        env: 'production',
    });
    const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
    const [saveErrorMsg, setSaveErrorMsg] = useState('');

    // Test Payment State
    const [testForm, setTestForm] = useState({
        type: 'redirect',
        amount: 10000,
        buyer_name: 'Pelanggan Uji Coba',
        buyer_phone: '085158025553',
        buyer_email: 'test@rumahkitanet.com',
        product_name: 'Uji Coba Layanan Internet Rumah Kita Net',
        va_bank: 'bag', // bca, bri, mandiri, etc.
    });
    const [testResult, setTestResult] = useState(null);
    const [showDebugLogs, setShowDebugLogs] = useState(true);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async (isManualRefresh = false) => {
        try {
            if (isManualRefresh) setRefreshing(true);
            else setLoading(true);

            const res = await apiClient.get('/ipaymu/status');
            if (res.data?.success) {
                setStatusData(res.data);
                setConfigForm({
                    va: res.data.config?.va || '',
                    api_key: res.data.config?.api_key || '',
                    env: res.data.config?.env || 'production',
                });
            }
        } catch (err) {
            console.error('Gagal memuat status iPaymu', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleCopy = (text, fieldName) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaveSuccessMsg('');
        setSaveErrorMsg('');

        try {
            const res = await apiClient.post('/ipaymu/config', configForm);
            if (res.data?.success) {
                setSaveSuccessMsg(res.data.message || 'Kredensial berhasil disimpan!');
                loadStatus();
            } else {
                setSaveErrorMsg(res.data?.message || 'Gagal menyimpan kredensial.');
            }
        } catch (err) {
            setSaveErrorMsg(err.response?.data?.message || 'Terjadi kesalahan saat menyimpan data.');
        } finally {
            setSaving(false);
        }
    };

    const handleRunTest = async (e) => {
        e.preventDefault();
        setTesting(true);
        setTestResult(null);

        try {
            const res = await apiClient.post('/ipaymu/test-payment', testForm);
            setTestResult(res.data);
        } catch (err) {
            setTestResult({
                success: false,
                http_code: err.response?.status || 500,
                message: err.response?.data?.message || err.message || 'Gagal menjalankan uji coba',
                result: err.response?.data?.result || null,
            });
        } finally {
            setTesting(false);
        }
    };

    const isConnected = statusData?.connection?.connected;
    const merchantBalance = statusData?.connection?.merchant_balance || 0;
    const serverIp = statusData?.config?.server_ip || 'Memeriksa...';
    const notifyUrl = statusData?.config?.webhook_urls?.notify_url || 'https://rumahkitanet.site/api/ipaymu/notify';

    if (loading) {
        return (
            <div className="p-8 text-center space-y-3">
                <RefreshCw size={36} className="animate-spin text-emerald-500 mx-auto" />
                <p className="text-sm font-semibold text-gray-500">Memeriksa Koneksi API iPaymu...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                            <CreditCard size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                                Integrasi Payment Gateway iPaymu
                            </h1>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                Diagnostik koneksi API, konfigurasi kredensial, dan simulator uji coba transaksi pembayaran online.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <button
                        type="button"
                        onClick={() => loadStatus(true)}
                        disabled={refreshing}
                        className="px-4 py-2.5 rounded-2xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin text-emerald-500' : ''} />
                        <span>Cek Koneksi Live</span>
                    </button>
                    <a
                        href="https://my.ipaymu.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                        <ExternalLink size={14} />
                        Dashboard iPaymu
                    </a>
                </div>
            </div>

            {/* Top Grid: Status & Server IP Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Status Card */}
                <div className={`p-6 rounded-3xl border transition-all ${
                    isConnected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
                }`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Status Koneksi API</span>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 ${
                            isConnected
                                ? 'bg-emerald-500 text-white shadow-xs'
                                : 'bg-amber-500 text-white shadow-xs'
                        }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                            {isConnected ? 'Terhubung (Online)' : 'Periksa Kredensial'}
                        </span>
                    </div>

                    <div className="mt-4 space-y-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                                Rp {new Intl.NumberFormat('id-ID').format(merchantBalance)}
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-slate-400">
                            Saldo Merchant iPaymu Aktif
                        </p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200/60 dark:border-slate-800/80 text-[11px] space-y-1 text-gray-600 dark:text-slate-400 font-mono">
                        <p>VA: <strong className="text-gray-900 dark:text-white">{statusData?.config?.va || '-'}</strong></p>
                        <p>Mode: <strong className="text-gray-900 dark:text-white uppercase">{statusData?.config?.env || 'Production'}</strong></p>
                    </div>
                </div>

                {/* Server Outgoing IP Card (Crucial for Whitelist) */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">IP Server Website</span>
                        <Server size={18} className="text-teal-500" />
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800">
                            <span className="font-mono font-bold text-sm text-gray-900 dark:text-white">{serverIp}</span>
                            <button
                                type="button"
                                onClick={() => handleCopy(serverIp, 'server_ip')}
                                className="p-1.5 text-gray-500 hover:text-emerald-500 rounded-lg transition"
                                title="Salin IP"
                            >
                                {copiedField === 'server_ip' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>

                    <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/40 leading-relaxed">
                        <strong>Penting:</strong> Daftarkan IP ini di menu <em>Konfigurasi Domain &amp; IP</em> di dashboard iPaymu agar transaksi tidak ditolak (<em>Invalid IP</em>).
                    </p>
                </div>

                {/* Webhook Callback URL Card */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">URL Webhook Notifikasi</span>
                        <Globe size={18} className="text-cyan-500" />
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800">
                            <span className="font-mono text-xs text-gray-700 dark:text-slate-300 truncate mr-2" title={notifyUrl}>
                                {notifyUrl}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleCopy(notifyUrl, 'notify_url')}
                                className="p-1.5 text-gray-500 hover:text-emerald-500 rounded-lg transition shrink-0"
                                title="Salin Webhook URL"
                            >
                                {copiedField === 'notify_url' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                        Endpoint otomatis yang menerima konfirmasi pembayaran dari iPaymu secara real-time.
                    </p>
                </div>
            </div>

            {/* Main Content: 2 Columns (Credentials Form & Simulator) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Form Kredensial API (5 Cols) */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 sm:p-7 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-5">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                            <Key size={16} />
                            <span>Pengaturan Kredensial</span>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">API Key &amp; Virtual Account</h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                            Kredensial dari menu Integrasi akun iPaymu Anda.
                        </p>
                    </div>

                    {saveSuccessMsg && (
                        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>{saveSuccessMsg}</span>
                        </div>
                    )}

                    {saveErrorMsg && (
                        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span>{saveErrorMsg}</span>
                        </div>
                    )}

                    <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
                        <div>
                            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                Virtual Account (VA) Number <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={configForm.va}
                                onChange={(e) => setConfigForm((p) => ({ ...p, va: e.target.value }))}
                                placeholder="Contoh: 1179002377569258"
                                className="w-full text-xs font-mono rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="font-bold text-gray-700 dark:text-slate-300">
                                    API Key <span className="text-rose-500">*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="text-[11px] text-gray-500 hover:text-emerald-500 flex items-center gap-1 transition"
                                >
                                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                    <span>{showApiKey ? 'Sembunyikan' : 'Tampilkan'}</span>
                                </button>
                            </div>
                            <input
                                type={showApiKey ? 'text' : 'password'}
                                required
                                value={configForm.api_key}
                                onChange={(e) => setConfigForm((p) => ({ ...p, api_key: e.target.value }))}
                                placeholder="Contoh: 6670407D-18BA-4683-A5A8-E7EDEA2C66C7"
                                className="w-full text-xs font-mono rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                Mode Environment
                            </label>
                            <select
                                value={configForm.env}
                                onChange={(e) => setConfigForm((p) => ({ ...p, env: e.target.value }))}
                                className="w-full text-xs rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold"
                            >
                                <option value="production">Production (Live / Akun Asli)</option>
                                <option value="sandbox">Sandbox (Development / Akun Testing)</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                            <span>Simpan Kredensial</span>
                        </button>
                    </form>
                </div>

                {/* Right: Simulator Uji Coba Pembayaran (7 Cols) */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Test Form Card */}
                    <div className="bg-white dark:bg-slate-900 p-6 sm:p-7 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-5">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold text-xs uppercase tracking-wider">
                                <Terminal size={16} />
                                <span>Simulator Uji Coba Pembayaran</span>
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Uji Coba Transaksi Pembayaran</h2>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                Buat sesi transaksi uji coba untuk memastikan API iPaymu merespons dan membuat link pembayaran dengan benar.
                            </p>
                        </div>

                        <form onSubmit={handleRunTest} className="space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                        Pilih Metode Uji Coba <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={testForm.type}
                                        onChange={(e) => setTestForm((p) => ({ ...p, type: e.target.value }))}
                                        className="w-full text-xs rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold"
                                    >
                                        <option value="redirect">iPaymu Redirect Checkout (Halaman Kasir Lengkap)</option>
                                        <option value="direct_qris">Direct QRIS (QR Code Instan)</option>
                                        <option value="direct_va">Direct Virtual Account Bank</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                        Nominal Uji Coba (Rp) <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="1000"
                                        step="1000"
                                        required
                                        value={testForm.amount}
                                        onChange={(e) => setTestForm((p) => ({ ...p, amount: e.target.value }))}
                                        className="w-full text-xs font-mono rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>
                            </div>

                            {testForm.type === 'direct_va' && (
                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                        Pilihan Bank Virtual Account
                                    </label>
                                    <select
                                        value={testForm.va_bank}
                                        onChange={(e) => setTestForm((p) => ({ ...p, va_bank: e.target.value }))}
                                        className="w-full text-xs rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    >
                                        <option value="bag">Bank Artha Graha (BAG)</option>
                                        <option value="bca">BCA Virtual Account</option>
                                        <option value="mandiri">Mandiri Virtual Account</option>
                                        <option value="bni">BNI Virtual Account</option>
                                        <option value="bri">BRI Virtual Account</option>
                                        <option value="cimb">CIMB Niaga Virtual Account</option>
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                        Nama Pelanggan Dummy
                                    </label>
                                    <input
                                        type="text"
                                        value={testForm.buyer_name}
                                        onChange={(e) => setTestForm((p) => ({ ...p, buyer_name: e.target.value }))}
                                        className="w-full text-xs rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                                        Nomor WhatsApp Dummy
                                    </label>
                                    <input
                                        type="tel"
                                        value={testForm.buyer_phone}
                                        onChange={(e) => setTestForm((p) => ({ ...p, buyer_phone: e.target.value }))}
                                        className="w-full text-xs rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 p-3 text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={testing}
                                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-emerald-950/20 disabled:opacity-50"
                            >
                                {testing ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                                <span>Jalankan Uji Coba Pembayaran</span>
                            </button>
                        </form>
                    </div>

                    {/* Test Result Box */}
                    {testResult && (
                        <div className={`p-6 rounded-3xl border space-y-4 animate-in fade-in duration-200 ${
                            testResult.success
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                        }`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    {testResult.success ? (
                                        <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertTriangle size={20} className="text-rose-500 shrink-0" />
                                    )}
                                    <div>
                                        <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">
                                            {testResult.success ? 'Uji Coba Berhasil Dibuat!' : 'Uji Coba Gagal / Ditolak'}
                                        </h3>
                                        <p className="text-xs text-gray-600 dark:text-slate-400">
                                            HTTP {testResult.http_code} &bull; {testResult.message}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowDebugLogs(!showDebugLogs)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-200 dark:bg-slate-800 hover:bg-gray-300 text-gray-700 dark:text-slate-300 transition flex items-center gap-1"
                                >
                                    {showDebugLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                    <span>Debug Log</span>
                                </button>
                            </div>

                            {/* Payment Success Details & Links */}
                            {testResult.success && testResult.result?.response?.Data && (
                                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <p className="text-[10px] text-gray-500">Transaction ID</p>
                                            <p className="font-mono font-bold text-gray-900 dark:text-white">
                                                {testResult.result.response.Data.TransactionId || testResult.result.response.Data.SessionId || '-'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500">Payment Channel / No. VA</p>
                                            <p className="font-mono font-bold text-gray-900 dark:text-white">
                                                {testResult.result.response.Data.PaymentNo || testResult.result.response.Data.Va || 'iPaymu Checkout Link'}
                                            </p>
                                        </div>
                                    </div>

                                    {testResult.result.response.Data.Url && (
                                        <div className="pt-2">
                                            <a
                                                href={testResult.result.response.Data.Url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition"
                                            >
                                                <ExternalLink size={14} />
                                                <span>Buka Halaman Pembayaran iPaymu (Kasir) &rarr;</span>
                                            </a>
                                        </div>
                                    )}

                                    {/* QRIS Display Block */}
                                    {(() => {
                                        const data = testResult.result?.response?.Data;
                                        if (!data) return null;
                                        const qrString = data.QrString || (data.PaymentNo?.startsWith('000201') ? data.PaymentNo : null);
                                        const qrImageSrc = data.qr_image_url || (qrString ? `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrString)}` : null);

                                        if (!qrString && !qrImageSrc && !data.QrImage) return null;

                                        return (
                                            <div className="pt-3 border-t border-gray-100 dark:border-slate-800 text-center space-y-4">
                                                <div className="inline-block p-4 rounded-3xl bg-white border-2 border-emerald-500 shadow-xl text-slate-800">
                                                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-gray-100 text-slate-800">
                                                        <span className="text-xs font-black tracking-wider">QRIS STANDAR NASIONAL</span>
                                                        <span className="text-[10px] font-bold text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-full">{data.Channel || 'MPM'}</span>
                                                    </div>
                                                    {qrImageSrc ? (
                                                        <img
                                                            src={qrImageSrc}
                                                            alt="QRIS Pembayaran"
                                                            className="w-56 h-56 mx-auto object-contain rounded-lg"
                                                        />
                                                    ) : (
                                                        <div className="w-56 h-56 flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-semibold rounded-lg">
                                                            QR Code Tidak Tersedia
                                                        </div>
                                                    )}
                                                    <div className="pt-2 text-[11px] font-bold text-slate-700 border-t border-gray-100 mt-2 flex items-center justify-between">
                                                        <span>NMID: {data.NMID || 'ID2022173022171'}</span>
                                                        <span className="text-emerald-600 font-extrabold">Rp {new Intl.NumberFormat('id-ID').format(data.Total || testForm.amount)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                                                    {data.QrTemplate && (
                                                        <a
                                                            href={data.QrTemplate}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 font-bold transition flex items-center gap-1.5"
                                                        >
                                                            <ExternalLink size={13} />
                                                            <span>Buka Template QRIS Resmi iPaymu</span>
                                                        </a>
                                                    )}
                                                    {qrString && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopy(qrString, 'qr_string')}
                                                            className="px-3.5 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-300 font-bold transition flex items-center gap-1.5"
                                                        >
                                                            {copiedField === 'qr_string' ? <Check size={13} /> : <Copy size={13} />}
                                                            <span>{copiedField === 'qr_string' ? 'String QRIS Disalin!' : 'Salin String QRIS'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Debug Logs JSON */}
                            {showDebugLogs && (
                                <div className="space-y-2 pt-2 border-t border-gray-200/60 dark:border-slate-800/80">
                                    <p className="text-[11px] font-bold text-gray-700 dark:text-slate-300 font-mono">
                                        Raw Request &amp; Response Details:
                                    </p>
                                    <pre className="p-3.5 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-64 leading-relaxed">
                                        {JSON.stringify(testResult.result || testResult, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

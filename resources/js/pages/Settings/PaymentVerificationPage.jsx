import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import paymentVerificationService from '../../services/paymentVerificationService';

const emptyWhitelist = {
    qris: [],
    transfer_bank: [],
};

function prettyJson(value) {
    return JSON.stringify(value, null, 2);
}

function createRecipient() {
    return {
        id: `recipient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        phone: '',
        is_active: true,
        receive_auto_approved: true,
        receive_needs_review: true,
    };
}

export default function PaymentVerificationPage() {
    const capabilities = window.appCapabilities || {};
    const canManage = Object.prototype.hasOwnProperty.call(capabilities, 'billing.payment_capture.manage')
        ? Boolean(capabilities['billing.payment_capture.manage'])
        : ['superadmin', 'admin'].includes(window.appUserRole || 'admin');

    const [config, setConfig] = useState(null);
    const [captures, setCaptures] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [whitelistText, setWhitelistText] = useState(prettyJson(emptyWhitelist));

    const loadData = async () => {
        try {
            setError('');
            setLoading(true);

            const [configResponse, capturesResponse] = await Promise.all([
                paymentVerificationService.getConfig(),
                paymentVerificationService.getCaptures({ per_page: 25 }),
            ]);

            const nextConfig = configResponse.data?.data || null;
            const capturePayload = capturesResponse.data?.data || {};

            setConfig(nextConfig);
            setWhitelistText(prettyJson(nextConfig?.destination_whitelist || emptyWhitelist));
            setCaptures(capturePayload.data || []);
            setPagination(capturePayload);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memuat payment verification.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const stats = useMemo(() => {
        return captures.reduce((acc, capture) => {
            acc[capture.match_status] = (acc[capture.match_status] || 0) + 1;
            return acc;
        }, { needs_review: 0, unmatched: 0, approved: 0 });
    }, [captures]);

    const recipients = config?.notification_recipients || [];

    const handleSave = async () => {
        if (!canManage || !config) return;

        try {
            setSaving(true);
            setError('');
            setMessage('');

            const parsedWhitelist = JSON.parse(whitelistText);
            const payload = {
                ...config,
                destination_whitelist: parsedWhitelist,
            };

            const response = await paymentVerificationService.updateConfig(payload);
            setConfig(response.data?.data || payload);
            setMessage(response.data?.message || 'Konfigurasi tersimpan.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal menyimpan konfigurasi.');
        } finally {
            setSaving(false);
        }
    };

    const handleResolve = async (captureId, decision, candidateInvoiceId = null) => {
        try {
            setRefreshing(true);
            setError('');
            await paymentVerificationService.resolveCapture(captureId, {
                decision,
                candidate_invoice_id: candidateInvoiceId,
            });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal memproses capture.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleReanalyze = async (captureId) => {
        try {
            setRefreshing(true);
            setError('');
            await paymentVerificationService.reanalyzeCapture(captureId);
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Gagal menjadwalkan analisis ulang.');
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) {
        return <div className="rounded-xl bg-white p-8 text-center text-gray-500">Memuat payment verification...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
                        <ShieldCheck className="text-emerald-600" />
                        Payment Verification AI
                    </h1>
                    <p className="mt-1 text-gray-500">Review bukti transfer WhatsApp, whitelist tujuan pembayaran, dan re-analyze capture bermasalah.</p>
                </div>
                <button
                    type="button"
                    onClick={loadData}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-700">{message}</div>}
            {error && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-700">{error}</div>}

            <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-sm text-gray-500">Perlu review</p>
                    <p className="mt-2 text-3xl font-bold text-amber-600">{stats.needs_review || 0}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-sm text-gray-500">Unmatched</p>
                    <p className="mt-2 text-3xl font-bold text-rose-600">{stats.unmatched || 0}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-sm text-gray-500">Auto approve threshold</p>
                    <p className="mt-2 text-3xl font-bold text-emerald-600">{config?.confidence_thresholds?.auto_approve ?? 95}%</p>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Konfigurasi Verifikasi</h2>
                        <p className="text-sm text-gray-500">Atur model OpenAI, threshold confidence, dan whitelist tujuan pembayaran.</p>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                            <Save size={16} />
                            {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                        </button>
                    )}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Model OpenAI</span>
                        <input
                            type="text"
                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                            value={config?.openai_model || ''}
                            disabled={!canManage}
                            onChange={(e) => setConfig((prev) => ({ ...prev, openai_model: e.target.value }))}
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Mime type yang diizinkan</span>
                        <input
                            type="text"
                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                            value={(config?.allowed_source_mime_types || []).join(', ')}
                            disabled={!canManage}
                            onChange={(e) => setConfig((prev) => ({
                                ...prev,
                                allowed_source_mime_types: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                            }))}
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Threshold auto approve</span>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                            value={config?.confidence_thresholds?.auto_approve ?? 95}
                            disabled={!canManage}
                            onChange={(e) => setConfig((prev) => ({
                                ...prev,
                                confidence_thresholds: {
                                    ...(prev?.confidence_thresholds || {}),
                                    auto_approve: Number(e.target.value),
                                },
                            }))}
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Threshold manual review</span>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                            value={config?.confidence_thresholds?.manual_review ?? 70}
                            disabled={!canManage}
                            onChange={(e) => setConfig((prev) => ({
                                ...prev,
                                confidence_thresholds: {
                                    ...(prev?.confidence_thresholds || {}),
                                    manual_review: Number(e.target.value),
                                },
                            }))}
                        />
                    </label>
                </div>

                <label className="mt-4 block">
                    <span className="text-sm font-medium text-gray-700">Whitelist tujuan pembayaran (JSON)</span>
                    <textarea
                        rows={14}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-950 p-4 font-mono text-sm text-emerald-100"
                        value={whitelistText}
                        disabled={!canManage}
                        onChange={(e) => setWhitelistText(e.target.value)}
                    />
                </label>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Penerima Notifikasi</h2>
                        <p className="text-sm text-gray-500">Superadmin dapat mengatur siapa yang menerima konfirmasi otomatis dan review pembayaran.</p>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => setConfig((prev) => ({
                                ...prev,
                                notification_recipients: [...(prev?.notification_recipients || []), createRecipient()],
                            }))}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-700 hover:bg-emerald-100"
                        >
                            <Plus size={16} />
                            Tambah Penerima
                        </button>
                    )}
                </div>

                <div className="mt-5 space-y-4">
                    {recipients.map((recipient, index) => (
                        <div key={recipient.id || index} className="rounded-2xl border border-gray-200 p-4">
                            <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_auto] xl:items-start">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block">
                                        <span className="text-sm font-medium text-gray-700">Nama</span>
                                        <input
                                            type="text"
                                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                                            value={recipient.name || ''}
                                            disabled={!canManage}
                                            onChange={(e) => updateRecipient(setConfig, index, { name: e.target.value })}
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-medium text-gray-700">Nomor WhatsApp</span>
                                        <input
                                            type="text"
                                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3"
                                            value={recipient.phone || ''}
                                            disabled={!canManage}
                                            onChange={(e) => updateRecipient(setConfig, index, { phone: e.target.value })}
                                        />
                                    </label>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <ToggleField
                                        label="Aktif"
                                        checked={Boolean(recipient.is_active)}
                                        disabled={!canManage}
                                        onChange={(checked) => updateRecipient(setConfig, index, { is_active: checked })}
                                    />
                                    <ToggleField
                                        label="Auto-approved"
                                        checked={Boolean(recipient.receive_auto_approved)}
                                        disabled={!canManage}
                                        onChange={(checked) => updateRecipient(setConfig, index, { receive_auto_approved: checked })}
                                    />
                                    <ToggleField
                                        label="Need-review"
                                        checked={Boolean(recipient.receive_needs_review)}
                                        disabled={!canManage}
                                        onChange={(checked) => updateRecipient(setConfig, index, { receive_needs_review: checked })}
                                    />
                                </div>

                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => setConfig((prev) => ({
                                            ...prev,
                                            notification_recipients: (prev?.notification_recipients || []).filter((_, itemIndex) => itemIndex !== index),
                                        }))}
                                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                                    >
                                        <Trash2 size={15} />
                                        Hapus
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {recipients.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                            Belum ada penerima notifikasi pembayaran. Tambahkan minimal satu nomor untuk auto-approved atau need-review.
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Dashboard Review Manual</h2>
                        <p className="text-sm text-gray-500">Capture pembayaran yang belum lolos verifikasi otomatis.</p>
                    </div>
                    <p className="text-sm text-gray-400">Total: {pagination?.total || 0}</p>
                </div>

                <div className="mt-5 space-y-4">
                    {captures.map((capture) => (
                        <article key={capture.id} className="rounded-2xl border border-gray-200 p-4">
                            <div className="grid gap-4 xl:grid-cols-[240px,1fr]">
                                <div>
                                    {capture.proof_url ? (
                                        <img src={capture.proof_url} alt={`Capture ${capture.id}`} className="h-56 w-full rounded-xl border border-gray-200 object-cover" />
                                    ) : (
                                        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                                            Bukti transfer tidak tersedia
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-lg font-semibold text-gray-900">Capture #{capture.id}</h3>
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                    capture.match_status === 'needs_review'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                    {capture.match_status}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-gray-500">
                                                WA {capture.sender_phone || '-'} · Invoice {capture.invoice?.invoice_link || '-'} · Customer {capture.customer?.name || '-'}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleReanalyze(capture.id)}
                                                disabled={refreshing}
                                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                            >
                                                <RefreshCw size={15} />
                                                Re-analyze
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleResolve(capture.id, 'approve', capture.invoice?.id || capture.match_reviews?.[0]?.candidate_invoice_id || null)}
                                                disabled={refreshing}
                                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                            >
                                                <CheckCircle2 size={15} />
                                                Konfirmasi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleResolve(capture.id, 'reject')}
                                                disabled={refreshing}
                                                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                                            >
                                                <AlertTriangle size={15} />
                                                Tolak
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <InfoCard label="Nominal OCR" value={`Rp ${Number(capture.amount || 0).toLocaleString('id-ID')}`} />
                                        <InfoCard label="Confidence" value={`${Number(capture.match_confidence || 0).toFixed(2)}%`} />
                                        <InfoCard label="Metode" value={capture.analysis?.payment_channel || '-'} />
                                        <InfoCard label="Alasan" value={capture.failure_reason || '-'} />
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <JsonBox title="Analisis OCR / Vision" value={capture.analysis || {}} />
                                        <JsonBox title="Validasi & Whitelist" value={capture.validation || {}} />
                                    </div>

                                    {capture.match_reviews?.length > 0 && (
                                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                            <p className="text-sm font-semibold text-gray-700">Kandidat Invoice</p>
                                            <div className="mt-3 space-y-2">
                                                {capture.match_reviews.map((review) => (
                                                    <div key={review.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                            <p className="font-medium text-gray-900">{review.candidate_invoice?.invoice_link || 'Invoice kandidat'}</p>
                                                            <p className="text-sm text-gray-500">Score {review.score}% · {review.reason || '-'}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResolve(capture.id, 'approve', review.candidate_invoice_id)}
                                                            disabled={refreshing}
                                                            className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                                        >
                                                            Pakai invoice ini
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </article>
                    ))}

                    {captures.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
                            Tidak ada capture yang perlu direview.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function InfoCard({ label, value }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-gray-400">{label}</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>
        </div>
    );
}

function JsonBox({ title, value }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-950 p-4">
            <p className="text-sm font-semibold text-emerald-200">{title}</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-emerald-100">
                {prettyJson(value)}
            </pre>
        </div>
    );
}

function ToggleField({ label, checked, disabled, onChange }) {
    return (
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
        </label>
    );
}

function updateRecipient(setConfig, index, patch) {
    setConfig((prev) => ({
        ...prev,
        notification_recipients: (prev?.notification_recipients || []).map((recipient, itemIndex) => (
            itemIndex === index ? { ...recipient, ...patch } : recipient
        )),
    }));
}

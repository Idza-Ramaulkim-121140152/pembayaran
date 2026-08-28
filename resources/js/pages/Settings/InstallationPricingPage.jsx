import { useEffect, useState } from 'react';
import { Cable, Package, Router, Save, Wrench } from 'lucide-react';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import installationPricingService from '../../services/installationPricingService';

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
}

const EMPTY_FORM = {
    cable_price_per_meter: '1200',
    connector_unit_price: '8000',
    connector_quantity_default: '2',
    router_unit_price: '225000',
};

function InstallationPricingPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [activePricing, setActivePricing] = useState(null);
    const [history, setHistory] = useState([]);
    const [laborDefault, setLaborDefault] = useState(0);
    const [form, setForm] = useState(EMPTY_FORM);

    const hydrate = (payload) => {
        const active = payload?.active || null;
        setActivePricing(active);
        setHistory(payload?.history || []);
        setLaborDefault(Number(payload?.labor_fee_default || 0));
        setForm({
            cable_price_per_meter: String(active?.cable_price_per_meter ?? 1200),
            connector_unit_price: String(active?.connector_unit_price ?? 8000),
            connector_quantity_default: String(active?.connector_quantity_default ?? 2),
            router_unit_price: String(active?.router_unit_price ?? 225000),
        });
    };

    useEffect(() => {
        let cancelled = false;

        installationPricingService.get()
            .then((response) => {
                if (!cancelled) {
                    hydrate(response?.data?.data || {});
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.response?.data?.message || 'Gagal memuat master harga instalasi.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = {
                cable_price_per_meter: Number(form.cable_price_per_meter || 0),
                connector_unit_price: Number(form.connector_unit_price || 0),
                connector_quantity_default: Number(form.connector_quantity_default || 0),
                router_unit_price: Number(form.router_unit_price || 0),
            };

            const response = await installationPricingService.store(payload);
            hydrate(response?.data?.data || {});
            setSuccess(response?.data?.message || 'Harga instalasi berhasil diperbarui.');
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan harga instalasi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Master Harga Barang Laporan</h1>
                <p className="text-gray-600">Kelola harga material perusahaan untuk laporan income pelanggan. Harga ini terpisah dari tarif payroll teknisi pada menu inventori master.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {loading ? (
                <div className="app-card p-10 text-center">
                    <LoadingSpinner text="Memuat master harga instalasi..." />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
                        <form onSubmit={handleSubmit} className="app-card p-5 space-y-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="font-bold text-gray-900">Harga Barang Laporan Aktif Baru</h2>
                                    <p className="mt-1 text-sm text-gray-500">Perubahan akan membuat versi harga barang/material baru dan hanya berlaku ke snapshot pelanggan berikutnya.</p>
                                </div>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Save size={16} />
                                    {saving ? 'Menyimpan...' : 'Simpan Harga'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="block">
                                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700"><Cable size={16} /> Kabel per meter</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.cable_price_per_meter}
                                        onChange={(event) => setForm((prev) => ({ ...prev, cable_price_per_meter: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700"><Wrench size={16} /> Connector per buah</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.connector_unit_price}
                                        onChange={(event) => setForm((prev) => ({ ...prev, connector_unit_price: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700"><Package size={16} /> Jumlah connector default</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.connector_quantity_default}
                                        onChange={(event) => setForm((prev) => ({ ...prev, connector_quantity_default: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700"><Router size={16} /> Router per unit</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.router_unit_price}
                                        onChange={(event) => setForm((prev) => ({ ...prev, router_unit_price: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </label>
                            </div>
                        </form>

                        <div className="app-card p-5 space-y-4">
                            <div>
                                <h2 className="font-bold text-gray-900">Harga Aktif Saat Ini</h2>
                                <p className="mt-1 text-sm text-gray-500">Dipakai sebagai sumber snapshot untuk pelanggan baru.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Kabel per meter</p>
                                    <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(activePricing?.cable_price_per_meter)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Connector per buah</p>
                                    <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(activePricing?.connector_unit_price)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Connector default</p>
                                    <p className="mt-2 text-xl font-bold text-gray-900">{Number(activePricing?.connector_quantity_default || 0).toLocaleString('id-ID')} buah</p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">Router per unit</p>
                                    <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(activePricing?.router_unit_price)}</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                                <p className="font-semibold">Catatan biaya labor</p>
                                <p className="mt-1">Labor default verifikasi saat ini masih mengikuti pengaturan payroll pemasangan yang sudah ada: <span className="font-semibold">{formatCurrency(laborDefault)}</span>.</p>
                                <p className="mt-1">Harga kabel payroll teknisi tidak diubah dari halaman ini.</p>
                            </div>
                        </div>
                    </div>

                    <div className="app-card p-5 space-y-4">
                        <div>
                            <h2 className="font-bold text-gray-900">Riwayat Harga Barang Laporan</h2>
                            <p className="mt-1 text-sm text-gray-500">Harga lama tetap dipakai pada snapshot pelanggan yang sudah terbentuk dan tidak memengaruhi default payroll kabel.</p>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Dibuat</th>
                                        <th className="px-4 py-3 text-right">Kabel</th>
                                        <th className="px-4 py-3 text-right">Connector</th>
                                        <th className="px-4 py-3 text-right">Qty Default</th>
                                        <th className="px-4 py-3 text-right">Router</th>
                                        <th className="px-4 py-3 text-left">Oleh</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {history.map((row) => (
                                        <tr key={row.id}>
                                            <td className="px-4 py-3">{new Date(row.created_at).toLocaleString('id-ID')}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.cable_price_per_meter)}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.connector_unit_price)}</td>
                                            <td className="px-4 py-3 text-right">{Number(row.connector_quantity_default || 0).toLocaleString('id-ID')}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.router_unit_price)}</td>
                                            <td className="px-4 py-3">{row.creator?.name || 'Sistem'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default InstallationPricingPage;

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import masterWilayahService from '../../services/masterWilayahService';

const EMPTY = '';

function MasterWilayahPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [hierarchy, setHierarchy] = useState([]);

    const [newKecamatan, setNewKecamatan] = useState({ name: '', code: '' });
    const [newDesa, setNewDesa] = useState({ kecamatan_id: '', name: '', code: '' });
    const [newDusun, setNewDusun] = useState({ desa_id: '', name: '', code: '' });

    useEffect(() => {
        fetchHierarchy();
    }, []);

    const fetchHierarchy = async () => {
        try {
            setLoading(true);
            const response = await masterWilayahService.getHierarchy();
            setHierarchy(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat master wilayah.');
        } finally {
            setLoading(false);
        }
    };

    const flattenedDesas = useMemo(() => {
        const items = [];
        hierarchy.forEach((kecamatan) => {
            (kecamatan.desas || []).forEach((desa) => {
                items.push({
                    id: desa.id,
                    name: desa.name,
                    code: desa.code,
                    kecamatan_name: kecamatan.name,
                });
            });
        });
        return items;
    }, [hierarchy]);

    const submitKecamatan = async (event) => {
        event.preventDefault();
        try {
            setSaving(true);
            setError(null);
            const payload = { name: newKecamatan.name.trim() };
            if (newKecamatan.code.trim()) payload.code = newKecamatan.code.trim().toUpperCase();
            await masterWilayahService.createKecamatan(payload);
            setNewKecamatan({ name: '', code: '' });
            setSuccess('Kecamatan berhasil ditambahkan.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah kecamatan.');
        } finally {
            setSaving(false);
        }
    };

    const submitDesa = async (event) => {
        event.preventDefault();
        try {
            setSaving(true);
            setError(null);
            const payload = {
                kecamatan_id: Number(newDesa.kecamatan_id),
                name: newDesa.name.trim(),
            };
            if (newDesa.code.trim()) payload.code = newDesa.code.trim().toUpperCase();
            await masterWilayahService.createDesa(payload);
            setNewDesa({ kecamatan_id: '', name: '', code: '' });
            setSuccess('Desa berhasil ditambahkan.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah desa.');
        } finally {
            setSaving(false);
        }
    };

    const submitDusun = async (event) => {
        event.preventDefault();
        try {
            setSaving(true);
            setError(null);
            const payload = {
                desa_id: Number(newDusun.desa_id),
                name: newDusun.name.trim(),
            };
            if (newDusun.code.trim()) payload.code = newDusun.code.trim().toUpperCase();
            await masterWilayahService.createDusun(payload);
            setNewDusun({ desa_id: '', name: '', code: '' });
            setSuccess('Dusun berhasil ditambahkan.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambah dusun.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (type, id) => {
        if (!window.confirm('Yakin ingin menghapus data ini?')) return;
        try {
            setSaving(true);
            setError(null);
            if (type === 'kecamatan') await masterWilayahService.deleteKecamatan(id);
            if (type === 'desa') await masterWilayahService.deleteDesa(id);
            if (type === 'dusun') await masterWilayahService.deleteDusun(id);
            setSuccess('Data berhasil dihapus.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus data.');
        } finally {
            setSaving(false);
        }
    };

    const handleEditKecamatan = async (item) => {
        const name = window.prompt('Nama kecamatan:', item.name);
        if (!name) return;
        const code = window.prompt('Kode 3 huruf:', item.code) || item.code;
        try {
            setSaving(true);
            await masterWilayahService.updateKecamatan(item.id, {
                name: name.trim(),
                code: code.trim().toUpperCase(),
            });
            setSuccess('Kecamatan berhasil diperbarui.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui kecamatan.');
        } finally {
            setSaving(false);
        }
    };

    const handleEditDesa = async (item) => {
        const name = window.prompt('Nama desa:', item.name);
        if (!name) return;
        const code = window.prompt('Kode 3 huruf:', item.code) || item.code;
        try {
            setSaving(true);
            await masterWilayahService.updateDesa(item.id, {
                kecamatan_id: Number(item.kecamatan_id),
                name: name.trim(),
                code: code.trim().toUpperCase(),
            });
            setSuccess('Desa berhasil diperbarui.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui desa.');
        } finally {
            setSaving(false);
        }
    };

    const handleEditDusun = async (item, desaId) => {
        const name = window.prompt('Nama dusun:', item.name);
        if (!name) return;
        const code = window.prompt('Kode 3 huruf:', item.code) || item.code;
        try {
            setSaving(true);
            await masterWilayahService.updateDusun(item.id, {
                desa_id: Number(desaId),
                name: name.trim(),
                code: code.trim().toUpperCase(),
            });
            setSuccess('Dusun berhasil diperbarui.');
            fetchHierarchy();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui dusun.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <LoadingSpinner text="Memuat master wilayah..." />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Master Wilayah</h1>
                <p className="text-gray-600">Kelola data Kecamatan, Desa, dan Dusun untuk form verifikasi pelanggan.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <form onSubmit={submitKecamatan} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h2 className="font-semibold text-gray-900">Tambah Kecamatan</h2>
                    <input
                        value={newKecamatan.name}
                        onChange={(event) => setNewKecamatan((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nama kecamatan"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        required
                    />
                    <input
                        value={newKecamatan.code}
                        onChange={(event) => setNewKecamatan((prev) => ({ ...prev, code: event.target.value }))}
                        placeholder="Kode 3 huruf (opsional)"
                        maxLength={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
                    />
                    <Button type="submit" variant="primary" disabled={saving}>
                        <Plus size={14} className="mr-1" /> Tambah
                    </Button>
                </form>

                <form onSubmit={submitDesa} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h2 className="font-semibold text-gray-900">Tambah Desa</h2>
                    <select
                        value={newDesa.kecamatan_id}
                        onChange={(event) => setNewDesa((prev) => ({ ...prev, kecamatan_id: event.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        required
                    >
                        <option value={EMPTY}>Pilih kecamatan</option>
                        {hierarchy.map((kecamatan) => (
                            <option key={kecamatan.id} value={kecamatan.id}>
                                {kecamatan.name} ({kecamatan.code})
                            </option>
                        ))}
                    </select>
                    <input
                        value={newDesa.name}
                        onChange={(event) => setNewDesa((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nama desa"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        required
                    />
                    <input
                        value={newDesa.code}
                        onChange={(event) => setNewDesa((prev) => ({ ...prev, code: event.target.value }))}
                        placeholder="Kode 3 huruf (opsional)"
                        maxLength={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
                    />
                    <Button type="submit" variant="primary" disabled={saving}>
                        <Plus size={14} className="mr-1" /> Tambah
                    </Button>
                </form>

                <form onSubmit={submitDusun} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
                    <h2 className="font-semibold text-gray-900">Tambah Dusun</h2>
                    <select
                        value={newDusun.desa_id}
                        onChange={(event) => setNewDusun((prev) => ({ ...prev, desa_id: event.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        required
                    >
                        <option value={EMPTY}>Pilih desa</option>
                        {flattenedDesas.map((desa) => (
                            <option key={desa.id} value={desa.id}>
                                {desa.name} ({desa.code}) - {desa.kecamatan_name}
                            </option>
                        ))}
                    </select>
                    <input
                        value={newDusun.name}
                        onChange={(event) => setNewDusun((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nama dusun"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        required
                    />
                    <input
                        value={newDusun.code}
                        onChange={(event) => setNewDusun((prev) => ({ ...prev, code: event.target.value }))}
                        placeholder="Kode 3 huruf (opsional)"
                        maxLength={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
                    />
                    <Button type="submit" variant="primary" disabled={saving}>
                        <Plus size={14} className="mr-1" /> Tambah
                    </Button>
                </form>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <h2 className="mb-4 font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin size={18} /> Struktur Wilayah
                </h2>
                <div className="space-y-4">
                    {hierarchy.map((kecamatan) => (
                        <div key={kecamatan.id} className="rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                                <div className="font-semibold text-gray-900">
                                    {kecamatan.name} ({kecamatan.code})
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleEditKecamatan(kecamatan)}
                                        className="text-blue-500 hover:text-blue-700"
                                        type="button"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete('kecamatan', kecamatan.id)}
                                        className="text-red-500 hover:text-red-700"
                                        type="button"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 space-y-2">
                                {(kecamatan.desas || []).map((desa) => (
                                    <div key={desa.id} className="rounded-md border border-gray-100 p-2">
                                        <div className="flex items-center justify-between text-sm font-medium text-gray-800">
                                            <span>{desa.name} ({desa.code})</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleEditDesa(desa)}
                                                    className="text-blue-500 hover:text-blue-700"
                                                    type="button"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete('desa', desa.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                    type="button"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            {(desa.dusuns || []).map((dusun) => (
                                                <span key={dusun.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                                    {dusun.name} ({dusun.code})
                                                    <button
                                                        onClick={() => handleEditDusun(dusun, desa.id)}
                                                        type="button"
                                                        className="text-blue-500"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete('dusun', dusun.id)}
                                                        type="button"
                                                        className="text-red-500"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {hierarchy.length === 0 && (
                        <p className="text-sm text-gray-500">Belum ada data wilayah.</p>
                    )}
                </div>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
                Kode username verifikasi otomatis dibentuk dengan pola:
                <span className="ml-2 rounded bg-white px-2 py-1 font-mono text-blue-900">KODEKEC+KODEDES+KODEDUS-namadepan003</span>
            </div>
        </div>
    );
}

export default MasterWilayahPage;

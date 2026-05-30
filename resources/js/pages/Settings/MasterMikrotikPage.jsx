import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Network, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import masterMikrotikService from '../../services/masterMikrotikService';

const INITIAL_FORM = {
    id: null,
    name: '',
    host: '',
    port: 8728,
    username: '',
    password: '',
    alert_recipients: '',
    is_active: false,
    password_status: 'empty',
};

function MasterMikrotikPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState([]);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [form, setForm] = useState(INITIAL_FORM);

    const isEdit = useMemo(() => !!form.id, [form.id]);

    useEffect(() => {
        fetchRows();
    }, []);

    const fetchRows = async () => {
        try {
            setLoading(true);
            const response = await masterMikrotikService.getAll();
            setRows(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat master MikroTik.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm(INITIAL_FORM);
    };

    const submitForm = async (event) => {
        event.preventDefault();

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            const payload = {
                name: form.name.trim(),
                host: form.host.trim(),
                port: Number(form.port),
                username: form.username.trim(),
                alert_recipients: form.alert_recipients.trim() || null,
                is_active: !!form.is_active,
            };

            if (form.password.trim()) {
                payload.password = form.password.trim();
            }

            if (!isEdit && !payload.password) {
                setError('Password wajib diisi saat tambah router baru.');
                return;
            }
            if (isEdit && form.password_status === 'invalid' && !payload.password) {
                setError('Password tersimpan tidak valid. Simpan password baru untuk router ini.');
                return;
            }

            if (isEdit) {
                await masterMikrotikService.update(form.id, payload);
                setSuccess(
                    form.password_status === 'invalid' && payload.password
                        ? 'Master MikroTik berhasil diperbarui. Password baru sudah disimpan.'
                        : 'Master MikroTik berhasil diperbarui.'
                );
            } else {
                await masterMikrotikService.create(payload);
                setSuccess('Master MikroTik berhasil ditambahkan.');
            }

            resetForm();
            await fetchRows();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan master MikroTik.');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (row) => {
        setForm({
            id: row.id,
            name: row.name || '',
            host: row.host || '',
            port: row.port || 8728,
            username: row.username || '',
            password: '',
            alert_recipients: row.alert_recipients || '',
            is_active: !!row.is_active,
            password_status: row.password_status || 'empty',
        });
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`Hapus router ${row.name}?`)) return;

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await masterMikrotikService.remove(row.id);
            setSuccess('Master MikroTik berhasil dihapus.');
            await fetchRows();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus master MikroTik.');
        } finally {
            setSaving(false);
        }
    };

    const handleActivate = async (row) => {
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await masterMikrotikService.activate(row.id);
            setSuccess(`Router aktif diubah ke ${row.name}.`);
            await fetchRows();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengaktifkan router.');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async (row) => {
        if (row.password_status === 'invalid') {
            setError('Password router tidak valid. Edit router ini lalu simpan password baru sebelum test koneksi.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            const response = await masterMikrotikService.testConnection(row.id);
            setSuccess(response.data?.message || 'Koneksi berhasil.');
        } catch (err) {
            setError(err.response?.data?.message || 'Koneksi gagal.');
        } finally {
            setSaving(false);
        }
    };
    const mikrotikColumns = [
        {
            key: 'name',
            label: 'Nama',
            render: (row) => (
                <div>
                    <p className="font-medium text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-500">{row.host}:{row.port}</p>
                </div>
            ),
        },
        { key: 'host', label: 'Host', render: (row) => `${row.host}:${row.port}` },
        { key: 'username', label: 'User' },
        {
            key: 'status',
            label: 'Status',
            render: (row) => (
                <div className="space-y-1">
                    {row.is_active && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                            <CheckCircle2 size={12} /> Aktif
                        </span>
                    )}
                    {row.password_status === 'invalid' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                            Password tidak valid
                        </span>
                    )}
                    <p className="text-xs text-gray-500">last: {row.last_status || 'unknown'}</p>
                </div>
            ),
        },
        { key: 'alert_recipients', label: 'Recipients', render: (row) => <span className="text-xs text-gray-600 break-all">{row.alert_recipients || '-'}</span> },
    ];

    if (loading) {
        return <LoadingSpinner text="Memuat master MikroTik..." />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Master MikroTik</h1>
                <p className="text-gray-600">Kelola data router, router aktif global, dan daftar penerima alert WhatsApp.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <form onSubmit={submitForm} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Network size={18} />
                        {isEdit ? 'Edit Router MikroTik' : 'Tambah Router MikroTik'}
                    </h2>
                    {isEdit && (
                        <Button type="button" variant="secondary" onClick={resetForm} className="w-full sm:w-auto">
                            Batal Edit
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Nama router"
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                    />
                    <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Host / IP"
                        value={form.host}
                        onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
                        required
                    />
                    <input
                        type="number"
                        min="1"
                        max="65535"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Port"
                        value={form.port}
                        onChange={(event) => setForm((prev) => ({ ...prev, port: event.target.value }))}
                        required
                    />
                    <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Username"
                        value={form.username}
                        onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                        required
                    />
                    <input
                        type="password"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder={isEdit ? (form.password_status === 'invalid' ? 'Wajib isi password baru' : 'Password baru (kosongkan jika tidak ganti)') : 'Password'}
                        value={form.password}
                        onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    />
                    <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Nomor WA alert dipisah koma"
                        value={form.alert_recipients}
                        onChange={(event) => setForm((prev) => ({ ...prev, alert_recipients: event.target.value }))}
                    />
                </div>

                {isEdit && form.password_status === 'invalid' && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        Password tersimpan tidak valid. Simpan password baru untuk router ini.
                    </p>
                )}

                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                    />
                    Jadikan router aktif
                </label>

                <div>
                    <Button type="submit" variant="primary" disabled={saving}>
                        <Plus size={14} className="mr-1" />
                        {saving ? 'Menyimpan...' : (isEdit ? 'Update Router' : 'Tambah Router')}
                    </Button>
                </div>
            </form>

            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <h2 className="font-semibold text-gray-900 mb-3">Daftar Router</h2>
                <ResponsiveDataView
                    rows={rows}
                    columns={mikrotikColumns}
                    keyField="id"
                    priorityFields={['name', 'status', 'host']}
                    emptyMessage="Belum ada data router."
                    tableClassName="w-full text-sm md:min-w-[920px]"
                    actions={(row) => (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(row)}>
                                <Pencil size={14} />
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => handleTest(row)}>
                                Test
                            </Button>
                            {!row.is_active && (
                                <Button type="button" size="sm" variant="primary" onClick={() => handleActivate(row)}>
                                    <Power size={14} />
                                </Button>
                            )}
                            <Button type="button" size="sm" variant="danger" onClick={() => handleDelete(row)}>
                                <Trash2 size={14} />
                            </Button>
                        </div>
                    )}
                />
            </div>
        </div>
    );
}

export default MasterMikrotikPage;

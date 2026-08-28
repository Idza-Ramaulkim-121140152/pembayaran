import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../services/api';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';

function CompanyFinanceReceiversPage() {
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const [receiversResponse, usersResponse] = await Promise.all([
                apiClient.get('/company-finance-receivers'),
                apiClient.get('/staff-users-lite'),
            ]);

            setItems(Array.isArray(receiversResponse.data?.data) ? receiversResponse.data.data : []);
            setUsers(Array.isArray(usersResponse.data?.data) ? usersResponse.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat akun keuangan perusahaan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const availableUsers = useMemo(() => {
        return users.filter((user) => !user.is_company_finance_receiver);
    }, [users]);

    const submit = async (e) => {
        e.preventDefault();

        if (!selectedUserId) {
            setError('Pilih user staff yang akan dijadikan akun keuangan perusahaan.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            await apiClient.post('/company-finance-receivers', {
                user_id: Number(selectedUserId),
            });
            setSelectedUserId('');
            setSuccess('Akun keuangan perusahaan berhasil diperbarui.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambahkan akun keuangan perusahaan.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (userId, name) => {
        if (!window.confirm(`Nonaktifkan ${name} dari akun keuangan perusahaan?`)) {
            return;
        }

        try {
            setSaving(true);
            setError(null);
            await apiClient.delete(`/company-finance-receivers/${userId}`);
            setSuccess('Akun keuangan perusahaan berhasil dinonaktifkan.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menonaktifkan akun keuangan perusahaan.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Akun Keuangan Perusahaan</h1>
                <p className="text-gray-600">Kelola akun staff yang mewakili penerimaan uang perusahaan. Akun ini tetap harus dipetakan di halaman mapping penerima bila ingin dipilih oleh akun penanggung lain.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Pilih akun staff</label>
                        <select
                            className="w-full rounded-lg border border-gray-300 px-3 py-2"
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            disabled={saving}
                        >
                            <option value="">Pilih akun</option>
                            {availableUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.role})
                                </option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" disabled={saving || !selectedUserId}>
                        {saving ? 'Menyimpan...' : 'Tambah Akun'}
                    </Button>
                </div>
                <p className="mt-3 text-xs text-gray-500">Jika akun ini mengonfirmasi pembayaran untuk dirinya sendiri, transaksi tidak akan masuk ke hutang.</p>
            </form>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left">Nama</th>
                            <th className="px-4 py-3 text-left">Email</th>
                            <th className="px-4 py-3 text-left">Role</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td className="px-4 py-4 text-gray-500" colSpan={5}>Memuat...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td className="px-4 py-4 text-gray-500" colSpan={5}>Belum ada akun keuangan perusahaan.</td></tr>
                        ) : items.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3 font-medium text-gray-900">{item.user?.name || '-'}</td>
                                <td className="px-4 py-3 text-gray-700">{item.user?.email || '-'}</td>
                                <td className="px-4 py-3 text-gray-700">{item.user?.role || '-'}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {item.is_active ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Button
                                        variant="danger"
                                        disabled={saving || !item.is_active}
                                        onClick={() => remove(item.user_id, item.user?.name || `#${item.user_id}`)}
                                    >
                                        Nonaktifkan
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default CompanyFinanceReceiversPage;

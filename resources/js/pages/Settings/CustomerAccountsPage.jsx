import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import customerAccountService from '../../services/customerAccountService';

function CustomerAccountsPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [editForm, setEditForm] = useState({ customerId: null, pppoe_username: '', phone: '' });
    const [passwordForm, setPasswordForm] = useState({ customerId: null, password: '', password_confirmation: '' });

    const loadData = async (targetPage = page, targetSearch = search) => {
        try {
            setLoading(true);
            setError('');
            const response = await customerAccountService.list({ page: targetPage, search: targetSearch, per_page: 20 });
            const payload = response?.data?.data;
            setRows(payload?.data || []);
            setPagination({
                current_page: payload?.current_page || 1,
                last_page: payload?.last_page || 1,
                total: payload?.total || 0,
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat akun pelanggan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(page, search);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const handleSearch = (event) => {
        event.preventDefault();
        setPage(1);
        loadData(1, search);
    };

    const handleToggleLogin = async (row, enabled) => {
        try {
            setSubmittingId(row.id);
            setError('');
            setSuccess('');
            const response = await customerAccountService.updateLoginStatus(row.id, enabled);
            setSuccess(response?.data?.message || 'Status login berhasil diperbarui.');
            await loadData(page, search);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui status login.');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleSaveIdentity = async () => {
        try {
            setSubmittingId(editForm.customerId);
            setError('');
            setSuccess('');
            const response = await customerAccountService.update(editForm.customerId, {
                pppoe_username: editForm.pppoe_username,
                phone: editForm.phone,
            });
            setSuccess(response?.data?.message || 'Identitas login berhasil diperbarui.');
            setEditForm({ customerId: null, pppoe_username: '', phone: '' });
            await loadData(page, search);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui identitas login.');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleSetPassword = async () => {
        try {
            setSubmittingId(passwordForm.customerId);
            setError('');
            setSuccess('');
            const response = await customerAccountService.setPassword(passwordForm.customerId, {
                password: passwordForm.password,
                password_confirmation: passwordForm.password_confirmation,
            });
            setSuccess(response?.data?.message || 'Password pelanggan berhasil diperbarui.');
            setPasswordForm({ customerId: null, password: '', password_confirmation: '' });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengatur password pelanggan.');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleResetPassword = async (row) => {
        try {
            setSubmittingId(row.id);
            setError('');
            setSuccess('');
            const response = await customerAccountService.resetPassword(row.id);
            setSuccess(response?.data?.message || 'Password default berhasil diterapkan.');
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal reset password pelanggan.');
        } finally {
            setSubmittingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Mapping Akun Pelanggan</h1>
                <p className="text-gray-600">Kelola login pelanggan berbasis PPPoE/No. HP dan password portal.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

            <form onSubmit={handleSearch} className="app-card p-4 flex gap-3">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama / no hp / PPPoE"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                />
                <Button type="submit">Cari</Button>
            </form>

            <div className="app-card overflow-x-auto">
                {loading ? (
                    <div className="p-4 text-sm text-gray-500">Memuat data...</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50 text-left">
                                <th className="p-3">Pelanggan</th>
                                <th className="p-3">PPPoE</th>
                                <th className="p-3">No. HP</th>
                                <th className="p-3">Login</th>
                                <th className="p-3">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-b align-top">
                                    <td className="p-3">
                                        <div className="font-medium text-gray-900">{row.name}</div>
                                        <div className="text-xs text-gray-500">ID: {row.id}</div>
                                    </td>
                                    <td className="p-3">{row.pppoe_username || '-'}</td>
                                    <td className="p-3">{row.phone || '-'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs ${row.portal_login_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {row.portal_login_enabled ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td className="p-3 space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                disabled={submittingId === row.id}
                                                onClick={() => setEditForm({ customerId: row.id, pppoe_username: row.pppoe_username || '', phone: row.phone || '' })}
                                            >
                                                Edit Identitas
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                disabled={submittingId === row.id}
                                                onClick={() => setPasswordForm({ customerId: row.id, password: '', password_confirmation: '' })}
                                            >
                                                Ganti Password
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                disabled={submittingId === row.id}
                                                onClick={() => handleResetPassword(row)}
                                            >
                                                Reset user123
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={row.portal_login_enabled ? 'danger' : 'primary'}
                                                disabled={submittingId === row.id}
                                                onClick={() => handleToggleLogin(row, !row.portal_login_enabled)}
                                            >
                                                {row.portal_login_enabled ? 'Nonaktifkan Login' : 'Aktifkan Login'}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td className="p-3 text-gray-500" colSpan={5}>Data tidak ditemukan.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Total: {pagination.total}</span>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                    <span className="px-2 py-1">{pagination.current_page} / {pagination.last_page}</span>
                    <Button type="button" variant="secondary" size="sm" disabled={page >= pagination.last_page} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
                </div>
            </div>

            {editForm.customerId && (
                <div className="app-card p-4 space-y-3">
                    <h2 className="font-semibold text-gray-900">Edit Identitas Login</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input className="border border-gray-300 rounded-lg px-3 py-2" value={editForm.pppoe_username} onChange={(e) => setEditForm((prev) => ({ ...prev, pppoe_username: e.target.value }))} placeholder="Username PPPoE" />
                        <input className="border border-gray-300 rounded-lg px-3 py-2" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="No. HP" />
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" onClick={handleSaveIdentity} disabled={submittingId === editForm.customerId}>Simpan</Button>
                        <Button type="button" variant="secondary" onClick={() => setEditForm({ customerId: null, pppoe_username: '', phone: '' })}>Batal</Button>
                    </div>
                </div>
            )}

            {passwordForm.customerId && (
                <div className="app-card p-4 space-y-3">
                    <h2 className="font-semibold text-gray-900">Ganti Password Pelanggan</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="password" className="border border-gray-300 rounded-lg px-3 py-2" value={passwordForm.password} onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Password baru (min 6)" />
                        <input type="password" className="border border-gray-300 rounded-lg px-3 py-2" value={passwordForm.password_confirmation} onChange={(e) => setPasswordForm((prev) => ({ ...prev, password_confirmation: e.target.value }))} placeholder="Konfirmasi password" />
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" onClick={handleSetPassword} disabled={submittingId === passwordForm.customerId}>Simpan Password</Button>
                        <Button type="button" variant="secondary" onClick={() => setPasswordForm({ customerId: null, password: '', password_confirmation: '' })}>Batal</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerAccountsPage;

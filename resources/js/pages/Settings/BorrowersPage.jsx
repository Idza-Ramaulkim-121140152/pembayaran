import { useEffect, useState } from 'react';
import apiClient from '../../services/api';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';

function BorrowersPage() {
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [modal, setModal] = useState({ open: false, item: null });
    const [form, setForm] = useState({
        name: '',
        phone: '',
        notes: '',
        mapped_user_id: '',
        is_active: true,
    });

    const loadData = async () => {
        try {
            setLoading(true);
            const [borrowers, usersResponse] = await Promise.all([
                apiClient.get('/borrowers'),
                apiClient.get('/staff-users-lite'),
            ]);
            setItems(Array.isArray(borrowers.data?.data) ? borrowers.data.data : []);
            setUsers(Array.isArray(usersResponse.data?.data) ? usersResponse.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data peminjam.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openModal = (item = null) => {
        setModal({ open: true, item });
        setForm({
            name: item?.name || '',
            phone: item?.phone || '',
            notes: item?.notes || '',
            mapped_user_id: item?.mapped_user_id ? String(item.mapped_user_id) : '',
            is_active: item?.is_active ?? true,
        });
    };

    const submit = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            setError(null);
            const payload = {
                ...form,
                mapped_user_id: form.mapped_user_id ? Number(form.mapped_user_id) : null,
            };
            if (modal.item) {
                await apiClient.put(`/borrowers/${modal.item.id}`, payload);
                setSuccess('Peminjam berhasil diperbarui.');
            } else {
                await apiClient.post('/borrowers', payload);
                setSuccess('Peminjam berhasil ditambahkan.');
            }
            setModal({ open: false, item: null });
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan peminjam.');
        } finally {
            setSubmitting(false);
        }
    };

    const destroy = async (item) => {
        if (!window.confirm(`Hapus peminjam ${item.name}?`)) return;
        try {
            await apiClient.delete(`/borrowers/${item.id}`);
            setSuccess('Peminjam berhasil dihapus.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus peminjam.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Daftar Peminjam</h1>
                    <p className="text-gray-600">Kelola orang yang memiliki hutang ke perusahaan dan mapping ke akun user.</p>
                </div>
                <Button onClick={() => openModal()}>Tambah Peminjam</Button>
            </div>
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left">Nama</th>
                            <th className="px-4 py-3 text-left">Akun Terkait</th>
                            <th className="px-4 py-3 text-left">Outstanding</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td className="px-4 py-4 text-gray-500" colSpan={5}>Memuat...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td className="px-4 py-4 text-gray-500" colSpan={5}>Belum ada data peminjam.</td></tr>
                        ) : items.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3">
                                    <p className="font-medium text-gray-900">{item.name}</p>
                                    <p className="text-xs text-gray-500">{item.phone || '-'}</p>
                                </td>
                                <td className="px-4 py-3 text-gray-700">{item.mapped_user?.name || '-'}</td>
                                <td className="px-4 py-3 font-semibold text-amber-700">
                                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(item.total_outstanding || 0))}
                                </td>
                                <td className="px-4 py-3">{item.is_active ? 'Aktif' : 'Nonaktif'}</td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button variant="secondary" onClick={() => openModal(item)}>Edit</Button>
                                        <Button variant="danger" onClick={() => destroy(item)}>Hapus</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit Peminjam' : 'Tambah Peminjam'}>
                <form onSubmit={submit} className="space-y-4">
                    <input className="w-full rounded-lg border px-3 py-2" placeholder="Nama" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
                    <input className="w-full rounded-lg border px-3 py-2" placeholder="No. HP" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                    <select className="w-full rounded-lg border px-3 py-2" value={form.mapped_user_id} onChange={(e) => setForm((p) => ({ ...p, mapped_user_id: e.target.value }))}>
                        <option value="">Tanpa akun user</option>
                        {users.map((user) => (
                            <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                        ))}
                    </select>
                    <textarea className="w-full rounded-lg border px-3 py-2" rows={3} placeholder="Catatan" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
                        Aktif
                    </label>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setModal({ open: false, item: null })}>Batal</Button>
                        <Button type="submit">{submitting ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default BorrowersPage;
